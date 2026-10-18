#!/usr/bin/env python3
"""AB-048: audit indexed glTF mesh primitives without Blender or external packages.

Diagnostics are development evidence, not a deformation/visual acceptance verdict.
"""
import argparse
from collections import Counter
import json
import math
from pathlib import Path
import struct

FORMATS = {5121: ("B", 1), 5123: ("H", 2), 5125: ("I", 4), 5126: ("f", 4)}
WIDTHS = {"SCALAR": 1, "VEC2": 2, "VEC3": 3, "VEC4": 4}


def load_glb(path):
    raw = Path(path).read_bytes()
    if len(raw) < 20 or raw[:4] != b"glTF":
        raise ValueError("invalid GLB header")
    version, length = struct.unpack_from("<II", raw, 4)
    if version != 2 or length != len(raw):
        raise ValueError("GLB version or declared length mismatch")
    offset, doc, binary = 12, None, None
    while offset < length:
        if offset + 8 > length:
            raise ValueError("truncated GLB chunk header")
        size, kind = struct.unpack_from("<I4s", raw, offset)
        offset += 8
        if size % 4 or offset + size > length:
            raise ValueError("invalid GLB chunk size")
        blob = raw[offset:offset + size]
        offset += size
        if kind == b"JSON":
            if doc is not None:
                raise ValueError("duplicate JSON chunk")
            doc = json.loads(blob)
        elif kind == b"BIN\x00":
            if binary is not None:
                raise ValueError("duplicate BIN chunk")
            binary = blob
    if doc is None or binary is None:
        raise ValueError("missing required GLB chunks")
    return doc, binary


def accessor(doc, data, index):
    spec = doc["accessors"][index]
    if spec.get("sparse"):
        raise ValueError("sparse accessors require a separate audit")
    view = doc["bufferViews"][spec["bufferView"]]
    fmt, size = FORMATS[spec["componentType"]]
    width = WIDTHS[spec["type"]]
    count = spec["count"]
    stride = view.get("byteStride", width * size)
    if stride < width * size:
        raise ValueError("invalid accessor stride")
    start = view.get("byteOffset", 0) + spec.get("byteOffset", 0)
    end = view.get("byteOffset", 0) + view["byteLength"]
    out = []
    for i in range(count):
        pos = start + i * stride
        if pos + width * size > end or pos + width * size > len(data):
            raise ValueError("accessor outside buffer view")
        out.append(struct.unpack_from("<" + fmt * width, data, pos))
    return out


def audit(doc, data):
    problems, metrics = [], []
    for mesh in doc.get("meshes", []):
        for primitive in mesh.get("primitives", []):
            label = mesh.get("name", "unnamed")
            if primitive.get("mode", 4) != 4:
                problems.append(label + ": non-triangle primitive")
                continue
            attrs = primitive["attributes"]
            positions = accessor(doc, data, attrs["POSITION"])
            indices = [v[0] for v in accessor(doc, data, primitive["indices"])]
            if not positions or len(indices) % 3:
                problems.append(label + ": missing vertices or incomplete triangles")
                continue
            if any(not all(math.isfinite(x) for x in vertex) for vertex in positions):
                problems.append(label + ": nonfinite position")
            if any(i >= len(positions) for i in indices):
                problems.append(label + ": index outside vertex array")
                continue
            if "NORMAL" not in attrs or len(accessor(doc, data, attrs["NORMAL"])) != len(positions):
                problems.append(label + ": missing or mismatched normals")
            if ("JOINTS_0" in attrs) != ("WEIGHTS_0" in attrs):
                problems.append(label + ": incomplete skin attributes")
            if "WEIGHTS_0" in attrs:
                weights = accessor(doc, data, attrs["WEIGHTS_0"])
                if len(weights) != len(positions) or any(
                    not all(math.isfinite(w) and w >= 0 for w in row) or abs(sum(row) - 1) > 1e-3
                    for row in weights
                ):
                    problems.append(label + ": invalid joint weights")
            degenerate, edges = 0, Counter()
            for t in range(0, len(indices), 3):
                ids = indices[t:t + 3]
                a, b, c = (positions[i] for i in ids)
                u = [b[j] - a[j] for j in range(3)]
                v = [c[j] - a[j] for j in range(3)]
                cross = (u[1] * v[2] - u[2] * v[1],
                         u[2] * v[0] - u[0] * v[2],
                         u[0] * v[1] - u[1] * v[0])
                if len(set(ids)) < 3 or sum(x*x for x in cross) < 1e-16:
                    degenerate += 1
                for k in range(3):
                    edges[tuple(sorted((ids[k], ids[(k + 1) % 3])))] += 1
            nonmanifold = sum(n > 2 for n in edges.values())
            boundaries = sum(n == 1 for n in edges.values())
            if degenerate:
                problems.append(label + ": " + str(degenerate) + " degenerate triangles")
            if nonmanifold:
                problems.append(label + ": " + str(nonmanifold) + " over-connected edges")
            metrics.append({"mesh": label, "vertices": len(positions),
                            "triangles": len(indices) // 3, "boundaryEdges": boundaries,
                            "degenerateTriangles": degenerate, "nonmanifoldEdges": nonmanifold})
    return {"passesStructuralAudit": not problems, "meshes": metrics, "problems": problems,
            "deformationStressPosesVerified": False}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("glb")
    args = parser.parse_args()
    try:
        report = audit(*load_glb(args.glb))
    except (OSError, ValueError, KeyError, IndexError, TypeError, struct.error) as exc:
        report = {"passesStructuralAudit": False, "problems": [str(exc)],
                  "deformationStressPosesVerified": False}
    print(json.dumps(report, indent=2))
    raise SystemExit(0 if report["passesStructuralAudit"] else 1)


if __name__ == "__main__":
    main()
