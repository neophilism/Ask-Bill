"""Blender-only conversion of the genuine GLB candidate to an editable .blend.

blender --background --factory-startup --python tools/blender/import_candidate_to_blend.py -- \
  assets/bill/runtime/Bill-Candidate.glb assets/bill/source/Bill-Candidate.blend

This requires Blender installed. A generated GLB alone does NOT satisfy the
native-source, rig/deformation, animation-layer, or final art acceptance gates.
"""
import sys
from pathlib import Path
import bpy

sys.path.insert(0, str(Path(__file__).resolve().parent / 'mesh'))
from audit_glb import audit, load_glb


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
    dst.parent.mkdir(parents=True,exist_ok=True)
    bpy.ops.wm.save_as_mainfile(filepath=str(dst),check_existing=False)
    print('Saved editable candidate:',dst)
    print('Objects:',len(bpy.data.objects),'actions:',len(bpy.data.actions))


if __name__=='__main__':main()

