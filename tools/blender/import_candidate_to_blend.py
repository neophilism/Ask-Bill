"""Blender-only conversion of the genuine GLB candidate to an editable .blend.

blender --background --factory-startup --python tools/blender/import_candidate_to_blend.py -- \
  assets/bill/runtime/Bill-Candidate.glb assets/bill/source/Bill-Candidate.blend

This requires Blender installed. A generated GLB alone does NOT satisfy the
native-source, rig/deformation, animation-layer, or final art acceptance gates.
"""
import sys
import math
from pathlib import Path
import bpy
import bmesh

sys.path.insert(0, str(Path(__file__).resolve().parent / 'mesh'))
from audit_glb import audit, load_glb


def refine_sheet_for_editing():
    sheet = next((o for o in bpy.data.objects if o.type == 'MESH' and
                  ('SingleSheet' in o.name or 'CONTINUOUS_FOLIO' in o.data.name)), None)
    if sheet is None:
        raise RuntimeError('Continuous sheet missing after GLB import')
    mesh = sheet.data
    if not mesh.uv_layers.active or not mesh.materials:
        raise RuntimeError('Imported sheet lacks UVs or parchment material')
    edge_material = mesh.materials[0].copy()
    edge_material.name = 'Parchment_Edge_Region'
    mesh.materials.append(edge_material)
    bm = bmesh.new()
    try:
        bm.from_mesh(mesh)
        bm.normal_update()
        axis = max(range(3), key=lambda i: sum(
            face.calc_area() * abs(face.normal[i]) for face in bm.faces))
        edge_faces = 0
        seams = 0
        for face in bm.faces:
            if abs(face.normal[axis]) < .5:
                face.material_index = 1
                edge_faces += 1
        for edge in bm.edges:
            if len(edge.link_faces) != 2:
                raise RuntimeError('Imported sheet has open or nonmanifold edges')
            if edge.link_faces[0].normal.angle(edge.link_faces[1].normal) > math.radians(35):
                edge.seam = True
                seams += 1
        if not seams or not edge_faces:
            raise RuntimeError('Sheet lacks editable UV seams or edge material region')
        bm.to_mesh(mesh)
        mesh.update()
    finally:
        bm.free()
    return {'sheet': sheet.name, 'uvSeamEdges': seams, 'edgeMaterialFaces': edge_faces}


def main():
    args=sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else []
    if len(args)!=2:
        raise SystemExit('Usage: blender -b --python import_candidate_to_blend.py -- input.glb output.blend')
    src,dst=(Path(v).expanduser().resolve() for v in args)
    if not src.is_file() or src.suffix.lower()!='.glb':raise ValueError('Missing .glb candidate source')
    if dst.suffix.lower()!='.blend':raise ValueError('Destination must be a .blend file')
    geometry = audit(*load_glb(src))
    if not geometry['passesStructuralAudit']:
        raise RuntimeError('Refusing editable scene from invalid mesh: '+repr(geometry['problems']))
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=str(src))
    if not any(o.type=='MESH' for o in bpy.data.objects):raise RuntimeError('No mesh imported')
    refinement=refine_sheet_for_editing()
    dst.parent.mkdir(parents=True,exist_ok=True)
    bpy.ops.wm.save_as_mainfile(filepath=str(dst),check_existing=False)
    print('Saved editable candidate:',dst)
    print('Objects:',len(bpy.data.objects),'actions:',len(bpy.data.actions))
    print('Sheet edit regions:',refinement)


if __name__=='__main__':main()

