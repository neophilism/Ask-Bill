"""Grounded 3D preview renders and walk GIFs from real exported GLBs."""
import argparse,math,json
from pathlib import Path
from PIL import Image,ImageDraw,ImageChops
import vtk
from vtk.util.numpy_support import vtk_to_numpy

def importer(path,size=(280,350)):
 r=vtk.vtkRenderer();r.SetBackground(.972,.966,.949)
 w=vtk.vtkRenderWindow();w.SetSize(*size);w.SetOffScreenRendering(1);w.SetMultiSamples(4);w.AddRenderer(r)
 imp=vtk.vtkGLTFImporter();imp.SetFileName(str(path));imp.SetRenderWindow(w);imp.Update()
 r.SetAutomaticLightCreation(False);r.RemoveAllLights()
 for pos,power,color in [((4,8,9),1.15,(1,.96,.91)),((-5,6,2),.48,(.88,.94,1)),((1,6,-7),.75,(1,.95,.88))]:
  li=vtk.vtkLight();li.SetLightTypeToSceneLight();li.SetPosition(*pos);li.SetFocalPoint(0,1.9,0);li.SetIntensity(power);li.SetColor(*color);r.AddLight(li)
 cam=r.GetActiveCamera();cam.ParallelProjectionOn();cam.SetParallelScale(2.17);cam.SetViewUp(0,1,0)
 return imp,r,w,cam

def capture(win):
 img=vtk.vtkWindowToImageFilter();img.SetInput(win);img.ReadFrontBufferOff();img.Update()
 vtkimg=img.GetOutput();a=vtk_to_numpy(vtkimg.GetPointData().GetScalars());wi,he=vtkimg.GetDimensions()[:2]
 return Image.frombytes('RGB',(wi,he),bytes(a)).transpose(Image.Transpose.FLIP_TOP_BOTTOM)

def render(path,out,size=(280,350),gif=False):
 imp,r,w,cam=importer(path,size)
 try:
  for angle in [0,32,180]:
   theta=angle*math.pi/180
   cam.SetPosition(9*math.sin(theta),1.95,9*math.cos(theta));cam.SetFocalPoint(0,1.85,0)
   r.ResetCameraClippingRange();w.Render();capture(w).save(out/('%s-%s.png'%(path.stem, {0:'front',32:'three-quarter',180:'back'}[angle])))
  if gif:
   acts={imp.GetAnimationName(i):i for i in range(imp.GetNumberOfAnimations())}
   if 'WalkFunny' not in acts:raise RuntimeError('Missing WalkFunny')
   for j in range(imp.GetNumberOfAnimations()): imp.DisableAnimation(j)
   imp.EnableAnimation(acts['WalkFunny']);frames=[]
   for step in range(16):
    imp.UpdateAtTimeValue(step*1.2/16)
    # Tilt toward camera with gentle walking pose
    theta=28*math.pi/180;cam.SetPosition(9*math.sin(theta),1.95,9*math.cos(theta))
    r.ResetCameraClippingRange();w.Render();frames.append(capture(w))
   if not ImageChops.difference(frames[0],frames[6]).getbbox():raise RuntimeError('Missing visible walk animation '+path.stem)
   frames[0].save(out/(path.stem+'-WalkFunny.gif'),save_all=True,append_images=frames[1:],duration=85,loop=0,optimize=True)
 finally:w.Finalize()

def contact(output,manifest):
 info=json.loads((manifest/'manifest.json').read_text())['characters'];cols=5
 unit=(270,405);board=Image.new('RGB',(unit[0]*cols,unit[1]*4),'#e8e5df');d=ImageDraw.Draw(board)
 for ix,item in enumerate(info):
  j=ix%cols;k=ix//cols;x=j*unit[0];y=k*unit[1]
  im=Image.open(output/(item['id']+'-three-quarter.png')).convert('RGB');im.thumbnail((unit[0]-12,unit[1]-52))
  board.paste(im,(x+(unit[0]-im.width)//2,y+28))
  d.text((x+7,y+6),f'{ix+1:02}  {item["name"][:25]}',fill='#263343')
  d.text((x+8,y+unit[1]-18),item['form']+' / '+item['style'],fill='#424e5a')
 board.save(output/'20-character-contact.jpg',quality=87)
 print(output/'20-character-contact.jpg')

def main():
 ap=argparse.ArgumentParser();ap.add_argument('--dist',type=Path,required=True);ap.add_argument('--output',type=Path,required=True);ap.add_argument('--gif-all',action='store_true');args=ap.parse_args()
 args.output.mkdir(parents=True,exist_ok=True)
 info=json.loads((args.dist/'manifest.json').read_text())['characters']
 for item in info:
  render(args.dist/(item['id']+'.glb'),args.output,gif=args.gif_all)
  print(item['id'],'3D renders complete',flush=True)
 contact(args.output,args.dist)
if __name__=='__main__':main()