#!/usr/bin/env python3
"""Merge compatible Meshy GLB animations onto one canonical Bill mesh, offline.

Only sampler data is imported. Foreign geometry, materials, textures, scripts,
external URIs, or animation extras are never promoted into the output scene.
"""
import argparse
import copy
import hashlib
import json
import pathlib
import struct
import sys
from collections import Counter

MAGIC = b'glTF'
JSON_TYPE = 0x4E4F534A
BIN_TYPE = 0x004E4942
MAX_INPUT = 400 * 1024 * 1024


class InvalidModel(ValueError):
    pass


def read_glb(path):
    data = pathlib.Path(path).read_bytes()
    if len(data) < 20 or len(data) > MAX_INPUT:
        raise InvalidModel(f'{path}: invalid GLB size')
    magic, version, declared_size = struct.unpack_from('<4sII', data, 0)
    if magic != MAGIC or version != 2 or declared_size != len(data):
        raise InvalidModel(f'{path}: corrupt or unsupported GLB header')
    chunks = []
    pos = 12
    while pos < len(data):
        if pos + 8 > len(data):
            raise InvalidModel(f'{path}: truncated chunk header')
        size, kind = struct.unpack_from('<II', data, pos)
        pos += 8
        if size % 4 or size > len(data) - pos:
            raise InvalidModel(f'{path}: invalid chunk size')
        chunks.append((kind, data[pos:pos + size]))
        pos += size
    if len(chunks) != 2 or chunks[0][0] != JSON_TYPE or chunks[1][0] != BIN_TYPE:
        raise InvalidModel(f'{path}: expected embedded JSON and BIN chunks')
    try:
        document = json.loads(chunks[0][1])
    except (UnicodeError, json.JSONDecodeError) as exc:
        raise InvalidModel(f'{path}: malformed GLB JSON') from exc
    if document.get('asset', {}).get('version') != '2.0':
        raise InvalidModel(f'{path}: glTF 2.0 required')
    buffers = document.get('buffers', [])
    if len(buffers) != 1 or 'uri' in buffers[0]:
        raise InvalidModel(f'{path}: only embedded single-buffer GLBs supported')
    if buffers[0]['byteLength'] > len(chunks[1][1]):
        raise InvalidModel(f'{path}: buffer outside binary chunk')
    return document, chunks[1][1]


def write_glb(path, doc, binary):
    doc = copy.deepcopy(doc)
    doc['buffers'][0]['byteLength'] = len(binary)
    js = json.dumps(doc, separators=(',', ':'), ensure_ascii=False).encode('utf-8')
    js += b' ' * ((-len(js)) % 4)
    binary += b'\0' * ((-len(binary)) % 4)
    total = 12 + 8 + len(js) + 8 + len(binary)
    pathlib.Path(path).parent.mkdir(parents=True, exist_ok=True)
    with open(path, 'wb') as file:
        file.write(struct.pack('<4sII', MAGIC, 2, total))
        file.write(struct.pack('<II', len(js), JSON_TYPE))
        file.write(js)
        file.write(struct.pack('<II', len(binary), BIN_TYPE))
        file.write(binary)


def names_and_parents(doc):
    nodes = doc.get('nodes', [])
    names = {}
    parents = {}
    for i, node in enumerate(nodes):
        name = node.get('name')
        if name:
            if name in names:
                raise InvalidModel(f'duplicate node name {name}')
            names[name] = i
        for child in node.get('children', []):
            if not isinstance(child, int) or not 0 <= child < len(nodes) or child in parents:
                raise InvalidModel('invalid or multiply parented joint')
            parents[child] = i
    return names, parents


def transforms_equal(a, b, tolerance=1e-3):
    for prop, default in (('translation', [0, 0, 0]), ('rotation', [0, 0, 0, 1]), ('scale', [1, 1, 1])):
        u, v = a.get(prop, default), b.get(prop, default)
        if len(u) != len(v) or any(abs(float(x) - float(y)) > tolerance for x, y in zip(u, v)):
            return False
    return True


def verify_compatible(base_doc, motion_doc):
    base_names, base_parents = names_and_parents(base_doc)
    motion_names, motion_parents = names_and_parents(motion_doc)
    if len(base_doc.get('skins', [])) != 1 or len(motion_doc.get('skins', [])) != 1:
        raise InvalidModel('both models require exactly one compatible skin')
    base_joints = {base_doc['nodes'][i].get('name') for i in base_doc['skins'][0]['joints']}
    motion_joints = {motion_doc['nodes'][i].get('name') for i in motion_doc['skins'][0]['joints']}
    if base_joints != motion_joints or None in base_joints:
        raise InvalidModel('skeleton joint names do not match; rerig from the same source')
    for name in base_joints:
        a, b = base_names[name], motion_names[name]
        ap = base_doc['nodes'][base_parents[a]].get('name') if a in base_parents else None
        bp = motion_doc['nodes'][motion_parents[b]].get('name') if b in motion_parents else None
        if ap != bp:
            raise InvalidModel(f'skeleton parenting differs for {name}')
        if not transforms_equal(base_doc['nodes'][a], motion_doc['nodes'][b]):
            raise InvalidModel(f'rest pose differs for {name}; explicit retargeting required')
    return base_names, motion_names


def inspect(path):
    doc, binary = read_glb(path)
    clips = []
    for animation in doc.get('animations', []):
        longest = 0.0
        for sampler in animation.get('samplers', []):
            accessor = doc['accessors'][sampler['input']]
            if accessor.get('max'):
                longest = max(longest, float(accessor['max'][0]))
        clips.append({'name': animation.get('name', ''), 'seconds': round(longest, 3), 'channels': len(animation.get('channels', []))})
    vertices = sum(doc['accessors'][prim['attributes']['POSITION']]['count']
                   for mesh in doc.get('meshes', []) for prim in mesh.get('primitives', [])
                   if 'POSITION' in prim['attributes'])
    triangles = sum(doc['accessors'][prim['indices']]['count'] // 3
                    for mesh in doc.get('meshes', []) for prim in mesh.get('primitives', [])
                    if prim.get('mode', 4) == 4 and 'indices' in prim)
    return {'sha256': hashlib.sha256(pathlib.Path(path).read_bytes()).hexdigest(),
            'bytes': pathlib.Path(path).stat().st_size,
            'joints': len(doc.get('skins', [{}])[0].get('joints', [])),
            'vertices': vertices, 'triangles': triangles,
            'morphTargets': sum(len(p.get('targets', [])) for m in doc.get('meshes', []) for p in m.get('primitives', [])),
            'clips': clips, 'embeddedTextureCount': len(doc.get('images', []))}


def merge(base_path, motion_paths, output_path):
    base, base_bin = read_glb(base_path)
    base_names, _ = names_and_parents(base)
    output = copy.deepcopy(base)
    output.setdefault('animations', [])
    used = {clip.get('name') for clip in output['animations']}
    merged = bytearray(base_bin)
    summary = []

    for path in motion_paths:
        source, binary = read_glb(path)
        _, source_names = verify_compatible(base, source)
        source_to_target = {source_names[name]: base_names[name] for name in source_names if name in base_names}
        accessors = {}
        views = {}
        if not source.get('animations'):
            raise InvalidModel(f'{path}: no animation clips to import')

        def copy_accessor(index):
            if index in accessors:
                return accessors[index]
            accessor = copy.deepcopy(source['accessors'][index])
            if 'sparse' in accessor:
                raise InvalidModel('sparse animation accessors require an explicit converter')
            if 'bufferView' not in accessor:
                raise InvalidModel('animation accessor without embedded view')
            view_index = accessor['bufferView']
            if view_index not in views:
                view = copy.deepcopy(source['bufferViews'][view_index])
                if view.get('buffer', 0) != 0:
                    raise InvalidModel('multi-buffer animation not supported')
                off, size = view.get('byteOffset', 0), view['byteLength']
                if off < 0 or size < 0 or off + size > len(binary):
                    raise InvalidModel('animation data exceeds binary buffer')
                merged.extend(b'\x00' * (-len(merged) % 4))
                view['buffer'] = 0
                view['byteOffset'] = len(merged)
                merged.extend(binary[off:off + size])
                view.pop('target', None)
                views[view_index] = len(output['bufferViews'])
                output['bufferViews'].append(view)
            accessor['bufferView'] = views[view_index]
            accessors[index] = len(output['accessors'])
            output['accessors'].append(accessor)
            return accessors[index]

        for animation in source['animations']:
            raw_name = animation.get('name') or pathlib.Path(path).stem
            # Preserve the Meshy catalog clip name, while guarding duplicates.
            clip_name = raw_name
            suffix = 2
            while clip_name in used:
                clip_name = f'{raw_name}__{suffix}'
                suffix += 1
            used.add(clip_name)
            samplers = []
            channels = []
            for sampler in animation.get('samplers', []):
                imported = {'input': copy_accessor(sampler['input']),
                            'output': copy_accessor(sampler['output']),
                            'interpolation': sampler.get('interpolation', 'LINEAR')}
                samplers.append(imported)
            for channel in animation.get('channels', []):
                node_index = channel.get('target', {}).get('node')
                if node_index not in source_to_target:
                    raise InvalidModel(f'{path}: animation target missing on Bill skeleton')
                path_name = channel['target'].get('path')
                if path_name not in ('rotation', 'translation', 'scale'):
                    raise InvalidModel(f'{path}: unsupported animation target {path_name}')
                if not 0 <= channel['sampler'] < len(samplers):
                    raise InvalidModel('animation sampler index outside bounds')
                channels.append({'sampler': channel['sampler'],
                                 'target': {'node': source_to_target[node_index], 'path': path_name}})
            if not channels:
                raise InvalidModel(f'{path}: empty animation clip')
            output['animations'].append({'name': clip_name, 'samplers': samplers, 'channels': channels})
            summary.append({'file': pathlib.Path(path).name, 'name': clip_name,
                            'channels': len(channels)})
    if len(output['animations']) > 500:
        raise InvalidModel('more than 500 clips; split the delivery into smaller GLBs')
    write_glb(output_path, output, bytes(merged))
    return summary


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--base', type=pathlib.Path, required=True, help='Original rigged Bill GLB')
    parser.add_argument('--motions', type=pathlib.Path, nargs='+', help='Meshy GLB files or directories')
    parser.add_argument('--output', type=pathlib.Path, help='Output animated Bill GLB')
    parser.add_argument('--manifest', type=pathlib.Path, help='Optional JSON audit manifest')
    parser.add_argument('--inspect', action='store_true', help='Inspect only, without merging')
    args = parser.parse_args()
    try:
        if args.inspect:
            report = inspect(args.base)
        else:
            if not args.output or not args.motions:
                parser.error('--motions and --output required unless --inspect')
            motions = []
            for item in args.motions:
                motions.extend(sorted(item.glob('*.glb')) if item.is_dir() else [item])
            motions = [p for p in motions if p.resolve() != args.base.resolve()]
            if not motions:
                parser.error('no source animation GLBs were supplied')
            imported = merge(args.base, motions, args.output)
            report = {'source': inspect(args.base), 'output': inspect(args.output), 'imported': imported}
        output = json.dumps(report, indent=2)
        if args.manifest:
            args.manifest.parent.mkdir(parents=True, exist_ok=True)
            args.manifest.write_text(output + '\n')
        print(output)
    except (InvalidModel, OSError, KeyError, IndexError, TypeError, struct.error) as exc:
        print(f'Bill import failed safely: {exc}', file=sys.stderr)
        return 1
    return 0

if __name__ == '__main__':
    sys.exit(main())
