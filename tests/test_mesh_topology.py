"""Unit tests for AB-048 candidate structural audit."""
import importlib.util
from pathlib import Path
import struct
import tempfile
import unittest

PATH = Path(__file__).resolve().parents[1] / "tools/blender/mesh/audit_glb.py"
spec = importlib.util.spec_from_file_location("audit_glb", PATH)
audit_glb = importlib.util.module_from_spec(spec)
spec.loader.exec_module(audit_glb)


def fixture(indices=(0, 1, 2), include_normals=True):
    vertices = [(0., 0., 0.), (1., 0., 0.), (0., 1., 0.)]
    normals = [(0., 0., 1.)] * 3
    data = bytearray()
    views = []
    accessors = []

    def add(values, fmt, width, component, kind):
        start = len(data)
        for row in values:
            data.extend(struct.pack("<" + fmt * width, *row))
        view = len(views)
        views.append({"buffer": 0, "byteOffset": start, "byteLength": len(data)-start})
        acc = len(accessors)
        accessors.append({"bufferView": view, "componentType": component,
                          "count": len(values), "type": kind})
        return acc
    pos = add(vertices, "f", 3, 5126, "VEC3")
    norm = add(normals, "f", 3, 5126, "VEC3")
    idx = add([(i,) for i in indices], "I", 1, 5125, "SCALAR")
    attrs = {"POSITION": pos}
    if include_normals:
        attrs["NORMAL"] = norm
    doc = {"accessors": accessors, "bufferViews": views,
           "meshes": [{"name": "MouthWithVisemes", "primitives": [{"attributes": attrs,
               "indices": idx, "mode": 4}]}]}
    return doc, bytes(data)


class AuditTests(unittest.TestCase):
    def test_triangle_is_valid(self):
        result = audit_glb.audit(*fixture())
        self.assertTrue(result["passesStructuralAudit"])
        self.assertFalse(result["deformationStressPosesVerified"])
        self.assertEqual(result["meshes"][0]["triangles"], 1)

    def test_empty_scene_rejected(self):
        doc, data = fixture()
        doc["meshes"] = []
        result = audit_glb.audit(doc, data)
        self.assertFalse(result["passesStructuralAudit"])
        self.assertIn("scene has no meshes", result["problems"])

    def test_invalid_normals_rejected(self):
        for value in (float("nan"), 0.0):
            doc, data = fixture()
            buffer = bytearray(data)
            normal_view = doc["bufferViews"][1]
            struct.pack_into("<fff", buffer, normal_view["byteOffset"], value, 0.0, 0.0)
            result = audit_glb.audit(doc, bytes(buffer))
            self.assertFalse(result["passesStructuralAudit"])
            self.assertTrue(any("normals" in p for p in result["problems"]))

    def test_degenerate_triangle_rejected(self):
        result = audit_glb.audit(*fixture(indices=(0, 1, 1)))
        self.assertFalse(result["passesStructuralAudit"])
        self.assertTrue(any("degenerate" in p for p in result["problems"]))

    def test_duplicate_face_winding_rejected(self):
        result = audit_glb.audit(*fixture(indices=(0, 1, 2, 0, 1, 2)))
        self.assertFalse(result["passesStructuralAudit"])
        self.assertTrue(any("inconsistently wound" in p for p in result["problems"]))

    def test_missing_normals_rejected(self):
        result = audit_glb.audit(*fixture(include_normals=False))
        self.assertFalse(result["passesStructuralAudit"])
        self.assertTrue(any("normals" in p for p in result["problems"]))

    def test_bad_index_rejected(self):
        result = audit_glb.audit(*fixture(indices=(0, 1, 9)))
        self.assertFalse(result["passesStructuralAudit"])

    def test_invalid_buffer_bounds_rejected(self):
        doc, data = fixture()
        doc["bufferViews"][0]["byteLength"] = 1
        with self.assertRaises(ValueError):
            audit_glb.audit(doc, data)

    def test_open_sheet_boundary_rejected(self):
        doc, data = fixture()
        doc["meshes"][0]["name"] = "ONE_CONTINUOUS_FOLIO_PARCHMENT"
        result = audit_glb.audit(doc, data)
        self.assertFalse(result["passesStructuralAudit"])
        self.assertTrue(any("open boundary edges" in p for p in result["problems"]))

    def test_open_unknown_surface_rejected(self):
        doc, data = fixture()
        doc["meshes"][0]["name"] = "Glove_L"
        result = audit_glb.audit(doc, data)
        self.assertFalse(result["passesStructuralAudit"])
        self.assertTrue(any("open boundary edges" in p for p in result["problems"]))

    def test_generated_candidate_has_closed_sheet_and_clean_primitives(self):
        generator_path = PATH.parents[1] / "generate_bill.py"
        generator_spec = importlib.util.spec_from_file_location("generate_bill", generator_path)
        generator = importlib.util.module_from_spec(generator_spec)
        generator_spec.loader.exec_module(generator)
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "candidate.glb"
            generator.build(path)
            result = audit_glb.audit(*audit_glb.load_glb(path))
        self.assertTrue(result["passesStructuralAudit"], result["problems"])
        sheet = next(mesh for mesh in result["meshes"]
                     if mesh["mesh"] == "ONE_CONTINUOUS_FOLIO_PARCHMENT")
        self.assertEqual(sheet["boundaryEdges"], 0)
        self.assertEqual(sheet["nonmanifoldEdges"], 0)
        self.assertEqual(sheet["degenerateTriangles"], 0)


if __name__ == "__main__":
    unittest.main()

