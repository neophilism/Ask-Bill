"""Headless native Blender proof-of-geometry turnarounds for Option 10 development.

blender --background assets/bill/source/Bill-Candidate.blend \
  --python tools/blender/render_candidate_in_blender.py -- assets/bill/review/blender

Creates front, side, back, three-quarter and small-thumbnail PNGs from the
actual editable native scene. These are candidate *inspection* artifacts,
not a substituted owner-approved finished illustration or release proof.
"""
import hashlib
import json
from math import radians, sin, cos
from pathlib import Path
import struct
import sys

import bpy
from mathutils import Vector
from bpy_extras.object_utils import world_to_camera_view


def target_camera(cam, target):
    direction = Vector(target) - cam.location
    cam.rotation_euler = direction.to_track_quat('-Z', 'Y').to_euler()


def proof_render(output):
    if not bpy.data.filepath.endswith('.blend'):
        raise RuntimeError('Open the native Bill .blend candidate before rendering')
    mesh_objects = [o for o in bpy.data.objects if o.type == 'MESH']
    if not any('CONTINUOUS_FOLIO' in o.name for o in mesh_objects):
        raise RuntimeError('Refusing to render without original continuous parchment body')
    output = Path(output).resolve()
    output.mkdir(parents=True, exist_ok=True)
    scene = bpy.context.scene
    scene.render.engine = 'CYCLES'
    scene.cycles.samples = 8
    # Ubuntu's packaged Blender is built without the OpenImageDenoiser device.
    scene.cycles.use_denoising = False
    for layer in scene.view_layers:
        layer.cycles.use_denoising = False
    scene.render.image_settings.file_format = 'PNG'
    scene.render.image_settings.color_mode = 'RGBA'
    scene.render.film_transparent = False
    scene.render.resolution_percentage = 100
    scene.render.resolution_x = 320
    scene.render.resolution_y = 440
    scene.view_settings.view_transform = 'Standard'
    scene.frame_set(0)
    for obj in list(bpy.data.objects):
        if obj.type in {'CAMERA', 'LIGHT'}:
            bpy.data.objects.remove(obj, do_unlink=True)

    world = bpy.data.worlds.get('Option10_Studio') or bpy.data.worlds.new('Option10_Studio')
    scene.world = world
    world.use_nodes = True
    bg = world.node_tree.nodes.get('Background')
    bg.inputs['Color'].default_value = (0.83, 0.84, 0.87, 1)
    bg.inputs['Strength'].default_value = .7
    for name,location,energy,scale in [
        ('Key',(5,-7,7),650,6),('Fill',(-6,-5,4),380,5),('Rim',(2,6,5),560,5)
    ]:
        ld = bpy.data.lights.new('Option10_'+name,'AREA')
        ld.energy = energy
        ld.shape='DISK';ld.size=scale
        ob=bpy.data.objects.new(ld.name,ld)
        scene.collection.objects.link(ob)
        ob.location=location
        target_camera(ob,(0,0,1.8))

    cam_data=bpy.data.cameras.new('Option10_ReviewCamera')
    camera=bpy.data.objects.new('Option10_ReviewCamera',cam_data)
    scene.collection.objects.link(camera)
    scene.camera=camera
    cam_data.type='ORTHO'
    cam_data.ortho_scale=4.6
    # Blender converts glTF Y-up to Blender Z-up (front glTF +Z -> Blender -Y).
    target=(0,0,1.9)
    files=[]
    for name,angle in [('front',0),('right',90),('back',180),('left',270),('three-quarter',32),('thumbnail-96',0)]:
        theta=radians(angle)
        camera.location=(7*sin(theta),-7*cos(theta),1.9)
        target_camera(camera,target)
        # Audit projection geometry, not merely that a PNG exists: the model's
        # feet and top curl must occupy the viewport in upright order.
        feet=world_to_camera_view(scene,camera,Vector((0,0,0.07)))
        top=world_to_camera_view(scene,camera,Vector((0,0,3.65)))
        if not (0.02<feet.x<.98 and .03<feet.y<.97 and feet.z>0 and
                0.02<top.x<.98 and .03<top.y<.97 and top.z>0 and top.y>feet.y):
            raise RuntimeError('Bad 3D camera framing for '+name+': '+repr((feet[:],top[:])))
        scene.render.resolution_x = 96 if name=='thumbnail-96' else 320
        scene.render.resolution_y = 128 if name=='thumbnail-96' else 440
        path=output/(name+'.png')
        scene.render.filepath=str(path)
        bpy.ops.render.render(write_still=True)
        data=path.read_bytes()
        if not data.startswith(b'\x89PNG\r\n\x1a\n'):
            raise RuntimeError('Blender did not write a PNG: '+str(path))
        w,h=struct.unpack('>II',data[16:24])
        if w!=scene.render.resolution_x or h!=scene.render.resolution_y or len(data)<4000:
            raise RuntimeError('Invalid/empty render output: '+str(path))
        files.append({'file':path.name,'width':w,'height':h,
                      'bytes':len(data),'sha256':hashlib.sha256(data).hexdigest()})
    result={'status':'unapproved candidate turnarounds','blender':bpy.app.version_string,
            'meshCount':len(mesh_objects),'files':files}
    (output/'render-evidence.json').write_text(json.dumps(result,indent=2,sort_keys=True)+'\n')
    print('BLENDER_TURNAROUND_AUDIT='+json.dumps(result,sort_keys=True),flush=True)


if __name__=='__main__':
    args=sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else []
    if len(args)!=1:
        raise SystemExit('Usage: blender --background Bill-Candidate.blend --python render_candidate_in_blender.py -- outputdir')
    proof_render(args[0])
