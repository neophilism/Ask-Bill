"""Headless candidate Blender acceptance smoke.

This verifies an actual editable Blender file rather than treating a GLB or
screenshot as the editable source. It is NOT final visual/rig acceptance.
"""
import bpy
import json
from pathlib import Path

def main():
    path=Path(bpy.data.filepath)
    if not path.is_file() or path.suffix!='.blend':
        raise RuntimeError('Native .blend was not saved/opened')
    objects=list(bpy.data.objects)
    meshes=[o for o in objects if o.type=='MESH']
    rigs=[o for o in objects if o.type=='ARMATURE']
    if len(meshes)<12:
        raise RuntimeError('Candidate lacks imported editable mesh objects')
    if not rigs:
        raise RuntimeError('Skinned parchment armature missing')
    sheet_objects=[o.name for o in meshes if any(token in (o.name+' '+o.data.name) for token in ('SingleSheet','CONTINUOUS_FOLIO_PARCHMENT'))]
    if not sheet_objects:
        raise RuntimeError('Continuous sheet mesh missing. Objects: '+repr([o.name for o in meshes]))
    actions=[a.name for a in bpy.data.actions]
    if not actions:
        raise RuntimeError('No imported animations/actions')
    shapes={}
    for o in meshes:
        blocks=getattr(getattr(o.data,'shape_keys',None),'key_blocks',None)
        if blocks:
            shapes[o.name]=len(blocks)
    if max(shapes.values(),default=0)<13:
        raise RuntimeError('Facial viseme morph targets not imported')
    record={'file':str(path),'meshCount':len(meshes),'rigCount':len(rigs),
            'actionCount':len(actions),'actions':actions[:50],'sheetObjects':sheet_objects,'shapeKeyCounts':shapes}
    print('BLENDER_CANDIDATE_AUDIT='+json.dumps(record,sort_keys=True))

if __name__=='__main__':main()
