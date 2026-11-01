#!/usr/bin/env python3
"""Evaluate candidate morphs and page compression before Blender stress renders.

This numerical check cannot establish visual quality, joint clearance or final
production acceptance. Blender render artifacts provide separate inspection.
"""
import argparse
import json
import math

from audit_glb import accessor, load_glb


def triangle_vector(points, a, b, c):
    p, q, r = (points[i] for i in (a, b, c))
    u = [q[i] - p[i] for i in range(3)]
    v = [r[i] - p[i] for i in range(3)]
    return (u[1] * v[2] - u[2] * v[1],
            u[2] * v[0] - u[0] * v[2],
            u[0] * v[1] - u[1] * v[0])


def stress_primitive(doc, data, name, morph_weights, vertical_scale=1.0):
    mesh = next((m for m in doc['meshes'] if m.get('name') == name), None)
    if mesh is None:
        raise ValueError('missing stress mesh: ' + name)
    primitive = mesh['primitives'][0]
    base = accessor(doc, data, primitive['attributes']['POSITION'])
    targets = mesh.get('extras', {}).get('targetNames', [])
    unknown = set(morph_weights) - set(targets)
    if unknown:
        raise ValueError('missing morph targets: ' + ', '.join(sorted(unknown)))
    shape = [list(vertex) for vertex in base]
    for target_name, weight in morph_weights.items():
        target = primitive['targets'][targets.index(target_name)]
        offsets = accessor(doc, data, target['POSITION'])
        if len(offsets) != len(base):
            raise ValueError('morph vertex count mismatch')
        for vertex, offset in zip(shape, offsets):
            for axis in range(3):
                vertex[axis] += weight * offset[axis]
    for vertex in shape:
        vertex[1] *= vertical_scale
    indices = [v[0] for v in accessor(doc, data, primitive['indices'])]
    smallest_ratio = math.inf
    reversed_faces = 0
    for offset in range(0, len(indices), 3):
        a, b, c = indices[offset:offset + 3]
        rest = triangle_vector(base, a, b, c)
        posed = triangle_vector(shape, a, b, c)
        rest_length = math.sqrt(sum(v*v for v in rest))
        posed_length = math.sqrt(sum(v*v for v in posed))
        if rest_length < 1e-10 or not math.isfinite(posed_length):
            raise ValueError('invalid rest or posed triangle')
        smallest_ratio = min(smallest_ratio, posed_length/rest_length)
        if sum(x*y for x, y in zip(rest, posed)) <= 0:
            reversed_faces += 1
    return {'mesh': name, 'triangles': len(indices)//3,
            'minimumAreaRatio': smallest_ratio, 'reversedFaces': reversed_faces,
            'passesNumericalStress': smallest_ratio >= .05 and reversed_faces == 0}


def stress_skin(doc, data, name, joint_angle):
    """Evaluate the candidate two-joint skin in world space, not rigid proxies."""
    node = next(n for n in doc['nodes'] if n.get('name') == name)
    mesh = doc['meshes'][node['mesh']]
    primitive = mesh['primitives'][0]
    attrs = primitive['attributes']
    base = accessor(doc, data, attrs['POSITION'])
    joints = accessor(doc, data, attrs['JOINTS_0'])
    weights = accessor(doc, data, attrs['WEIGHTS_0'])
    skin = doc['skins'][node['skin']]
    binds = accessor(doc, data, skin['inverseBindMatrices'])
    if len(skin['joints']) != 2 or len(binds) != 2 or len(joints) != len(base) or len(weights) != len(base):
        raise ValueError('invalid two-joint stress skin')
    # Candidate rest joints use translation-only transforms; reject other
    # layouts instead of pretending this fixture is a general glTF evaluator.
    first, second = (doc['nodes'][n] for n in skin['joints'])
    if skin['joints'][1] not in first.get('children', []) or any(
            field in joint for joint in (first, second) for field in ('rotation', 'scale', 'matrix')):
        raise ValueError('unsupported candidate joint transforms')
    origin = first['translation']
    pivot = [origin[i]+second['translation'][i] for i in range(3)]
    if not math.isfinite(joint_angle):
        raise ValueError('invalid stress angle')
    shape = []
    for point, joint_ids, row in zip(base, joints, weights):
        if any(j not in (0, 1) for j in joint_ids) or abs(sum(row)-1) > 1e-5:
            raise ValueError('invalid skin influence')
        result = [0., 0., 0.]
        for joint_id, weight in zip(joint_ids, row):
            if weight == 0:
                continue
            bind = binds[joint_id]
            if tuple(bind[:12]) != (1.,0.,0.,0.,0.,1.,0.,0.,0.,0.,1.,0.) or bind[15] != 1:
                raise ValueError('unsupported inverse bind transform')
            local = [point[i]+bind[12+i] for i in range(3)]
            if joint_id == 1:
                y,z = local[1:]
                local[1] = math.cos(joint_angle)*y-math.sin(joint_angle)*z
                local[2] = math.sin(joint_angle)*y+math.cos(joint_angle)*z
            translation = origin if joint_id == 0 else pivot
            for axis in range(3):
                result[axis] += weight*(local[axis]+translation[axis])
        shape.append(result)
    indices = [v[0] for v in accessor(doc, data, primitive['indices'])]
    if not indices or len(indices) % 3:
        raise ValueError('missing skin triangles')
    ratios = []
    for offset in range(0, len(indices), 3):
        ids = indices[offset:offset+3]
        rest = math.sqrt(sum(v*v for v in triangle_vector(base, *ids)))
        posed = math.sqrt(sum(v*v for v in triangle_vector(shape, *ids)))
        if rest < 1e-10 or not math.isfinite(posed):
            raise ValueError('invalid skin triangle')
        ratios.append(posed/rest)
    return {'mesh': name, 'jointAngleRadians': joint_angle,
            'minimumAreaRatio': min(ratios),
            'maximumVertexDisplacement': max(math.dist(a,b) for a,b in zip(base,shape)),
            'passesNumericalStress': min(ratios) >= .05}


def run(path):
    doc, data = load_glb(path)
    cases = {
        'compressed-sheet': stress_primitive(doc, data,
            'ONE_CONTINUOUS_FOLIO_PARCHMENT',
            {'TailFlutter': 1.0, 'PaperBreathe': 1.0}, .72),
        'extreme-mouth': stress_primitive(doc, data,
            'MouthWithVisemes', {'viseme_AA': 1.0}),
    }
    for side in ('L', 'R'):
        for part in ('Arm', 'Leg'):
            name = 'Continuous_'+part+'_'+side
            for angle in (-1.3, 1.3):
                cases[name+':'+str(angle)] = stress_skin(doc, data, name, angle)
    return {'passesNumericalStress': all(c['passesNumericalStress'] for c in cases.values()),
            'cases': cases, 'visualAndJointClearanceVerified': False}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('glb')
    args = parser.parse_args()
    report = run(args.glb)
    print(json.dumps(report, indent=2))
    raise SystemExit(0 if report['passesNumericalStress'] else 1)


if __name__ == '__main__':
    main()

