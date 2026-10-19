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


def run(path):
    doc, data = load_glb(path)
    cases = {
        'compressed-sheet': stress_primitive(doc, data,
            'ONE_CONTINUOUS_FOLIO_PARCHMENT',
            {'TailFlutter': 1.0, 'PaperBreathe': 1.0}, .72),
        'extreme-mouth': stress_primitive(doc, data,
            'MouthWithVisemes', {'viseme_AA': 1.0}),
    }
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
