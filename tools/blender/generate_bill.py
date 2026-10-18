#!/usr/bin/env python3
"""AB-047 reproducible, dependency-free Option 10 animated glTF 2.0 blockout.

Builds an actual rigged and morphed GLB for review, not a finished Blender model.
Run: python3 tools/blender/generate_bill.py --output path/to/Bill-Candidate.glb
The same source can be imported by Blender and saved as an editable .blend.
"""
import argparse
import hashlib
import json
import math
from pathlib import Path
import struct
import zlib

PI = math.pi


def png(width, height, pixels):
    def chunk(label, content):
        return struct.pack('>I', len(content)) + label + content + struct.pack('>I', zlib.crc32(label + content) & 0xffffffff)
    rows = b''.join(b'\x00' + bytes(pixels[y * width * 4:(y + 1) * width * 4]) for y in range(height))
    return b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('>IIBBBBB', width, height, 8, 6, 0, 0, 0)) + chunk(b'IDAT', zlib.compress(rows, 9)) + chunk(b'IEND', b'')


def make_texture():
    w, h = 256, 512
    pix = bytearray(w * h * 4)
    for y in range(h):
        for x in range(w):
            noise = ((x * 41 + y * 27 + x * y * 7) % 17) - 8
            c = (242 + noise // 4, 223 + noise // 3, 183 + noise // 2, 255)
            n = (y * w + x) * 4
            pix[n:n+4] = bytes(c)
    def pixel(x, y, color):
        if 0 <= x < w and 0 <= y < h:
            n = (int(y) * w + int(x)) * 4
            pix[n:n+4] = bytes(color)
    def line(x0,y0,x1,y1,color,thick=1):
        n = max(abs(x1-x0), abs(y1-y0), 1)
        for i in range(n+1):
            x = int(x0 + (x1-x0)*i/n); y = int(y0 + (y1-y0)*i/n)
            for dx in range(-thick//2+1, thick//2+1):
                for dy in range(-thick//2+1, thick//2+1):pixel(x+dx,y+dy,color)
    ink=(101, 82, 63, 115); gold=(188,132,56,255); navy=(36,48,75,255)
    # The paper border and tiny abstract legislative markings are native art.
    for y in range(20, h-20):
        for x in (18, 20, w-19, w-21):pixel(x,y,gold)
    for x in range(18,w-18):
        for y in (24,26,h-27,h-25):pixel(x,y,gold)
    # Faint bands of printing avoid making claims that this is authoritative law.
    for y in range(38, h-28, 14):
        start=28 + (y % 5); length=145 + ((y*19)%47)
        for x in range(start,min(w-28,start+length)):
            if (x*3+y)%11>2:pixel(x,y,ink)
    # The lapels are ink motifs of the same continuous page: NO cloth torso.
    for y in range(218, 484):
        t=(y-218)/266
        a=int(25+50*t); b=int(231-50*t)
        for x in range(20,a):
            if x>20 + 12*math.sin(PI*t):pixel(x,y,navy)
        for x in range(b,236):
            if x<236 - 12*math.sin(PI*t):pixel(x,y,navy)
        for x in (a-1,b+1):pixel(x,y,gold)
    for y in range(230,480,3):
        for x in range(31,62,5):
            if (x+y)%13==0:pixel(x,y,gold)
        for x in range(197,228,5):
            if (x+y)%13==0:pixel(x,y,gold)
    for y in (337,367,397,427):
        for yy in range(y-3,y+4):
            for xx in range(125-3,125+4):
                if (xx-125)**2+(yy-y)**2<=9:pixel(xx,yy,gold)
    return png(w,h,pix)


class GLB:
    def __init__(self):
        self.doc={'asset':{'version':'2.0','generator':'Ask Bill original procedural candidate'},
                  'scene':0,'scenes':[{'nodes':[]}], 'nodes':[],'meshes':[],
                  'materials':[],'accessors':[],'bufferViews':[],'buffers':[],
                  'animations':[],'skins':[],'images':[],'samplers':[],'textures':[]}
        self.bin=bytearray()

    def append(self, data, target=None):
        while len(self.bin)%4:self.bin.append(0)
        pos=len(self.bin); self.bin.extend(data)
        view={'buffer':0,'byteOffset':pos,'byteLength':len(data)}
        if target:view['target']=target
        n=len(self.doc['bufferViews']); self.doc['bufferViews'].append(view)
        return n

    def accessor(self, rows, kind='VEC3', comp=5126, target=None, bounds=False):
        sizes={'SCALAR':1,'VEC2':2,'VEC3':3,'VEC4':4,'MAT4':16}
        size=sizes[kind]
        if kind=='SCALAR' and rows and not isinstance(rows[0],(tuple,list)): rows=[[x] for x in rows]
        if not rows:return None
        if any(len(r)!=size for r in rows): raise ValueError('Wrong accessor width '+kind)
        fmt={5126:'f',5125:'I',5123:'H'}[comp]
        raw=struct.pack('<'+fmt*(len(rows)*size), *(v for r in rows for v in r))
        view=self.append(raw,target)
        d={'bufferView':view,'componentType':comp,'count':len(rows),'type':kind}
        if bounds:
            d['min']=[min(r[i] for r in rows) for i in range(size)]
            d['max']=[max(r[i] for r in rows) for i in range(size)]
        idx=len(self.doc['accessors']);self.doc['accessors'].append(d);return idx

    def node(self,name,mesh=None,parent=None,translation=None,rotation=None,skin=None):
        d={'name':name}
        if mesh is not None:d['mesh']=mesh
        if skin is not None:d['skin']=skin
        if translation is not None:d['translation']=translation
        if rotation is not None:d['rotation']=rotation
        idx=len(self.doc['nodes']);self.doc['nodes'].append(d)
        if parent is None:self.doc['scenes'][0]['nodes'].append(idx)
        else:self.doc['nodes'][parent].setdefault('children',[]).append(idx)
        return idx

    def material(self,name,base,texture=None):
        pbr={'baseColorFactor':base,'metallicFactor':0.,'roughnessFactor':.77}
        if texture is not None:pbr['baseColorTexture']={'index':texture}
        n=len(self.doc['materials'])
        self.doc['materials'].append({'name':name,'doubleSided':True,'pbrMetallicRoughness':pbr})
        return n

    def mesh(self,name,positions,indices,mat,normals=None,uvs=None,morphs=None,joints=None,weights=None):
        attrs={'POSITION':self.accessor(positions,bounds=True,target=34962)}
        if normals is None:normals=vertex_normals(positions,indices)
        attrs['NORMAL']=self.accessor(normals,target=34962)
        if uvs is not None:attrs['TEXCOORD_0']=self.accessor(uvs,'VEC2',target=34962)
        if joints is not None:
            attrs['JOINTS_0']=self.accessor(joints,'VEC4',5123,target=34962)
            attrs['WEIGHTS_0']=self.accessor(weights,'VEC4',target=34962)
        prim={'attributes':attrs,'indices':self.accessor([[i] for i in indices],'SCALAR',5125,target=34963),'material':mat,'mode':4}
        if morphs:prim['targets']=[{'POSITION':self.accessor(v,target=34962)} for _,v in morphs]
        d={'name':name,'primitives':[prim]}
        if morphs:d['weights']=[0.]*len(morphs);d['extras']={'targetNames':[n for n,v in morphs]}
        idx=len(self.doc['meshes']);self.doc['meshes'].append(d);return idx

    def animation(self,name,tracks):
        samplers=[];channels=[]
        for node,path,times,values,kind in tracks:
            inp=self.accessor(times,'SCALAR',bounds=True)
            if kind=='SCALAR' and values and isinstance(values[0],(list,tuple)) and len(values[0])>1:
                values=[[v] for frame in values for v in frame]
            out=self.accessor(values,kind)
            si=len(samplers);samplers.append({'input':inp,'output':out,'interpolation':'LINEAR'})
            channels.append({'sampler':si,'target':{'node':node,'path':path}})
        self.doc['animations'].append({'name':name,'samplers':samplers,'channels':channels})

    def output(self,path):
        self.doc['buffers']=[{'byteLength':len(self.bin)}]
        js=json.dumps(self.doc,sort_keys=True,separators=(',',':')).encode('utf-8')
        js+=b' ' *((4-len(js)%4)%4)
        blob=bytes(self.bin)+b'\x00'*((4-len(self.bin)%4)%4)
        total=12+8+len(js)+8+len(blob)
        out=struct.pack('<4sII',b'glTF',2,total)+struct.pack('<I4s',len(js),b'JSON')+js+struct.pack('<I4s',len(blob),b'BIN\x00')+blob
        path=Path(path);path.parent.mkdir(parents=True,exist_ok=True);path.write_bytes(out)
        return {'path':str(path),'bytes':len(out),'sha256':hashlib.sha256(out).hexdigest(),
                'nodes':len(self.doc['nodes']),'meshes':len(self.doc['meshes']),
                'animations':[a['name'] for a in self.doc['animations']]}


def vertex_normals(points,inds):
    ns=[[0.,0.,0.] for _ in points]
    for i in range(0,len(inds),3):
        a,b,c=(points[inds[i+j]] for j in range(3))
        u=[b[j]-a[j] for j in range(3)];v=[c[j]-a[j] for j in range(3)]
        cross=[u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]]
        for ix in inds[i:i+3]:
            for j in range(3):ns[ix][j]+=cross[j]
    result=[]
    for n in ns:
        length=math.sqrt(sum(q*q for q in n)) or 1.
        result.append([q/length for q in n])
    return result


def ellipsoid(glb,name,pos,scale,material,parent,segments=16,rings=10):
    # Shared poles and wrapped rings avoid zero-area pole faces and seam holes.
    p=[[0,scale[1],0]];tri=[]
    for j in range(1,rings):
        theta=PI*j/rings
        for i in range(segments):
            phi=2*PI*i/segments
            p.append([scale[0]*math.sin(theta)*math.cos(phi), scale[1]*math.cos(theta), scale[2]*math.sin(theta)*math.sin(phi)])
    bottom=len(p);p.append([0,-scale[1],0])
    for i in range(segments):
        n=(i+1)%segments
        tri.extend([0,1+i,1+n])
    for j in range(rings-2):
        a=1+j*segments;b=a+segments
        for i in range(segments):
            n=(i+1)%segments
            tri.extend([a+i,b+i,a+n,a+n,b+i,b+n])
    last=1+(rings-2)*segments
    for i in range(segments):
        n=(i+1)%segments
        tri.extend([last+i,bottom,last+n])
    mesh=glb.mesh(name,p,tri,material)
    return glb.node(name,mesh,parent,translation=pos)


def tube(glb,name,start,end,radius,mat,parent,radials=9):
    vx=[end[i]-start[i] for i in range(3)];norm=math.sqrt(sum(x*x for x in vx))
    if norm<1e-8:raise ValueError('zero tube length')
    direction=[v/norm for v in vx]
    helper=[0,0,1] if abs(direction[2])<.8 else [1,0,0]
    ax=[direction[1]*helper[2]-direction[2]*helper[1],direction[2]*helper[0]-direction[0]*helper[2],direction[0]*helper[1]-direction[1]*helper[0]]
    al=math.sqrt(sum(x*x for x in ax));ax=[x/al for x in ax]
    az=[direction[1]*ax[2]-direction[2]*ax[1],direction[2]*ax[0]-direction[0]*ax[2],direction[0]*ax[1]-direction[1]*ax[0]]
    p=[];idx=[]
    for pt in (start,end):
        for i in range(radials):
            angle=i*2*PI/radials
            p.append([pt[k]+radius*(math.cos(angle)*ax[k]+math.sin(angle)*az[k]) for k in range(3)])
    for i in range(radials):
        j=(i+1)%radials
        idx.extend([i,j,i+radials,j,j+radials,i+radials])
    idx.extend([i for q in range(1,radials-1) for i in (0,q,q+1)])
    idx.extend([i for q in range(1,radials-1) for i in (radials,radials+q+1,radials+q)])
    return glb.node(name,glb.mesh(name,p,idx,mat),parent)


def sheet_surface():
    segments=36;levels=44
    pos=[];uv=[];indices=[];weights=[];joints=[];t1=[];t2=[]
    for face in range(2):
        for j in range(levels+1):
            t=j/levels
            for i in range(segments+1):
                u=2*i/segments-1
                edge=abs(u)**5
                xx=u*(.86+.15*(t*t)+.15*(1-t)**3)
                yy=.97+2.45*t - .59*edge*(1-t)**3
                zz=.16-.09*u*u - .96*edge*(1-t)**2 + (.018 if face==0 else -.025)
                xx+=.05*t*t # gentle leaning folio, rather than a cylinder
                pos.append([xx,yy,zz])
                uv.append([(u+1)/2, 1-t])
                tail_strength=max(0.,(1.5-yy)/1.0)*max(0.,(abs(u)-.53)/.47)
                tail_strength=min(.9,tail_strength)
                if u<0:joints.append([0,1,0,0])
                else:joints.append([0,2,0,0])
                weights.append([1-tail_strength,tail_strength,0.,0.])
                t1.append([(-.13 if u<0 else .13)*tail_strength, -.045*tail_strength, -.23*(1-t)**2*edge])
                t2.append([.0,.0,.05*math.sin(t*PI)*u])
    stride=(segments+1)*(levels+1)
    for face in range(2):
        start=face*stride
        for j in range(levels):
            for i in range(segments):
                a=start+j*(segments+1)+i;b=a+segments+1
                if face==0:indices.extend([a,b,a+1,a+1,b,b+1])
                else:indices.extend([a,a+1,b,a+1,b+1,b])
    # Fold the perimeter between front and back surfaces (one continuous paper volume).
    for j in range(levels):
        for i in (0,segments):
            a=j*(segments+1)+i;b=a+(segments+1);c=a+stride;d=b+stride
            indices.extend([a,c,b,b,c,d] if i==0 else [a,b,c,b,d,c])
    for j in (0,levels):
        for i in range(segments):
            a=j*(segments+1)+i;b=a+1;c=a+stride;d=b+stride
            indices.extend([a,b,c,b,d,c] if j==0 else [a,c,b,b,c,d])
    # The upper-right fold is sculpted into the closed sheet volume. A separate
    # strip along the capped top edge made thirteen nonmanifold edges and left
    # the strip open on three sides.
    for face in range(2):
        for j in range(levels+1):
            t=j/levels
            rise=max(0.,min(1.,(t-.78)/.22))
            for i in range(segments+1):
                u=2*i/segments-1
                right=max(0.,min(1.,(u-.28)/.72))
                fold=rise*rise*(3-2*rise)*right*right*(3-2*right)
                v=face*stride+j*(segments+1)+i
                pos[v][1]+=.11*fold
                pos[v][2]+=.19*fold
    return pos,uv,indices,joints,weights,[('TailFlutter',t1),('PaperBreathe',t2)]


def mouth(glb,mat,parent):
    # Morphs are exported as actual glTF blend shape targets, not cosmetic names.
    n=24;positions=[[0,0,0]];indices=[]
    for i in range(n):
        a=2*PI*i/n
        positions.append([.185*math.cos(a),.095*math.sin(a),0.])
    for i in range(n):indices.extend([0,1+i,1+(i+1)%n])
    morphs=[]
    shapes=[('viseme_sil',.1,.1),('viseme_AA',1.04,1.6),('viseme_EE',1.35,.55),
            ('viseme_IH',.8,.8),('viseme_OH',.78,1.5),('viseme_OO',.48,1.25),
            ('viseme_U',.4,.95),('viseme_FV',1.12,.22),('viseme_MBP',.9,.09),
            ('viseme_L',1.0,1.15),('viseme_TH',.96,1.05),('viseme_CH',.66,.85),
            ('viseme_SS',1.12,.33),('viseme_R',.67,.91)]
    for name,sx,sy in shapes:
        offsets=[[p[0]*(sx-1),p[1]*(sy-1),0.] for p in positions]
        morphs.append((name,offsets))
    mesh=glb.mesh('MouthWithVisemes',positions,indices,mat,morphs=morphs)
    nd=glb.node('Expression_Mouth',mesh,parent,translation=[0,2.48,.272])
    return nd,len(morphs)


def quat(axis,angle):
    u={'x':[1,0,0],'y':[0,1,0],'z':[0,0,1]}[axis]
    return [u[0]*math.sin(angle/2),u[1]*math.sin(angle/2),u[2]*math.sin(angle/2),math.cos(angle/2)]


def build(path):
    g=GLB()
    tex=g.append(make_texture())
    image_index=len(g.doc['images']);g.doc['images'].append({'bufferView':tex,'mimeType':'image/png'})
    g.doc['samplers'].append({'magFilter':9729,'minFilter':9987,'wrapS':33071,'wrapT':33071})
    g.doc['textures'].append({'sampler':0,'source':image_index})
    paper=g.material('Single parchment page with ink tailoring',[1,1,1,1],0)
    ivory=g.material('Parchment limbs',[.94,.81,.6,1]);navy=g.material('Navy styling',[.11,.17,.3,1]);gold=g.material('Gold accents',[.85,.60,.28,1]);white=g.material('Eye white and gloves',[.98,.95,.88,1]);brown=g.material('Iris',[.30,.19,.12,1]);black=g.material('Dark pupils and smiling mouth',[.10,.08,.11,1]);blush=g.material('Warm cheeks',[.95,.53,.49,.82]);tongue=g.material('Soft tongue',[.76,.34,.37,1])
    root=g.node('Bill_Root')
    torso=g.node('Rig_Torso',parent=root)
    left_tail=g.node('Rig_TailLeft',parent=torso,translation=[-.70,1.30,-.10])
    right_tail=g.node('Rig_TailRight',parent=torso,translation=[.70,1.30,-.10])
    p,uv,faces,j,w,morph=sheet_surface()
    bodymesh=g.mesh('ONE_CONTINUOUS_FOLIO_PARCHMENT',p,faces,paper,uvs=uv,morphs=morph,joints=j,weights=w)
    inv=[]
    for dx,dy,dz in [[0,0,0],[-.70,1.30,-.10],[.70,1.30,-.10]]:
        inv.append([1,0,0,0, 0,1,0,0, 0,0,1,0, -dx,-dy,-dz,1])
    ibis=g.accessor(inv,'MAT4')
    skin=len(g.doc['skins']);g.doc['skins'].append({'name':'Bill sheet and tails','inverseBindMatrices':ibis,'joints':[torso,left_tail,right_tail],'skeleton':torso})
    sheet=g.node('SingleSheet_Body',mesh=bodymesh,parent=root,skin=skin)
    # Friendly expressive face. Both eyes are anatomically anchored to the page.
    face=g.node('Face_Controls',parent=root)
    eyes=[]
    for ix,x in enumerate([-.34,.37]):
        eye=g.node('Rig_Eye_'+str(ix),parent=face,translation=[x,2.97,.24]);eyes.append(eye)
        ellipsoid(g,'Sclera_'+str(ix),[0,0,0],[.225,.255,.080],white,eye)
        iris=g.node('Rig_Gaze_'+str(ix),parent=eye,translation=[.02,-.034,.081])
        ellipsoid(g,'Iris_'+str(ix),[0,0,0],[.14,.174,.039],brown,iris)
        ellipsoid(g,'Pupil_'+str(ix),[0,0,.032],[.077,.128,.03],black,iris)
        ellipsoid(g,'Gleam_'+str(ix),[-.046,.075,.06],[.033,.044,.018],white,iris)
        tube(g,'Eyebrow_'+str(ix),[-.13,.35,.08],[.125,.41,.08],.035,brown,eye)
        ellipsoid(g,'Cheek_'+str(ix),[0,-.335,-.025],[.21,.089,.017],blush,eye)
    mouth_node,num_visemes=mouth(g,black,face)
    ellipsoid(g,'Tongue',[0,2.413,.292],[.075,.032,.013],tongue,face)
    ellipsoid(g,'Nose',[.01,2.687,.256],[.070,.061,.058],ivory,face)
    # Bow tie and folded paper lapels; unlike a separate cloth jacket, torso remains paper.
    ellipsoid(g,'Cravat_Knot',[0,2.166,.309],[.092,.074,.055],gold,root)
    for sign in (-1,1):
        ellipsoid(g,'Cravat_Wing_'+str(sign),[sign*.17,2.16,.286],[.155,.081,.035],white,root)
        tube(g,'Gold_Paper_Lapel_'+str(sign),[sign*.68,2.2,.22],[sign*.46,1.18,.19],.032,gold,root)
        for yy in [1.88,1.72,1.56]:
            if sign==1:ellipsoid(g,'Printed_Button_'+str(yy),[0,yy,.242],[.04,.042,.02],gold,root)
    # Jointed arms, short soft gloves. Arm pivot tracks are genuine glTF rotations.
    shoulders=[]
    for side,sign in [('L',-1),('R',1)]:
        parent=g.node('Rig_Shoulder_'+side,parent=root,translation=[sign*.82,2.18,.065]);shoulders.append(parent)
        tube(g,'Paper_Sleeve_'+side,[0,0,0],[sign*.33,-.66,.035],.135,navy,parent)
        tube(g,'Folded_Cuff_'+side,[sign*.30,-.62,.035],[sign*.34,-.72,.035],.16,ivory,parent)
        ellipsoid(g,'Glove_'+side,[sign*.36,-.83,.065],[.17,.19,.093],white,parent)
        for k in range(3):
            ellipsoid(g,'Finger_'+side+str(k),[sign*(.41+k*.038),-.934,.093],[.045,.12,.044],white,parent,10,8)
    hips=[]
    for side,sign in [('L',-1),('R',1)]:
        hip=g.node('Rig_Hip_'+side,parent=root,translation=[sign*.33,.99,-.015]);hips.append(hip)
        tube(g,'Paper_Leg_'+side,[0,0,0],[0,-.66,.06],.105,ivory,hip)
        shoe=g.node('Rig_Shoe_'+side,parent=hip,translation=[0,-.71,.19])
        ellipsoid(g,'Shoe_'+side,[0,0,0],[.185,.11,.31],navy,shoe)
        ellipsoid(g,'Buckle_'+side,[0,.10,.02],[.075,.025,.06],gold,shoe)
    # All animation is in place: the application owns world-space travel and safe paths.
    z=quat('z',0); X=lambda v:quat('x',v);Z=lambda v:quat('z',v);Y=lambda v:quat('y',v)
    def track(nd,path,t,vals,kind='VEC4'):return (nd,path,t,vals,kind)
    idle_t=[0,.45,.9,1.35,1.8]
    g.animation('Idle',[track(root,'translation',idle_t,[[0,0,0],[0,.015,0],[0,0,0],[0,.013,0],[0,0,0]],'VEC3'),
                        track(sheet,'weights',idle_t,[[0,.03],[.02,.12],[0,.03],[.01,.10],[0,.03]],'SCALAR')])
    walk_t=[0,.15,.3,.45,.6,.75,.9,1.05,1.2]
    walk=[]
    for j,nd in enumerate(hips):walk.append(track(nd,'rotation',walk_t,[X((1 if j==0 else -1)*.39*math.sin(2*PI*i/(len(walk_t)-1))) for i in range(len(walk_t))]))
    for j,nd in enumerate(shoulders):walk.append(track(nd,'rotation',walk_t,[X((-1 if j==0 else 1)*.33*math.sin(2*PI*i/(len(walk_t)-1))) for i in range(len(walk_t))]))
    walk.append(track(root,'translation',walk_t,[[0,.06*abs(math.sin(2*PI*i/(len(walk_t)-1))),0] for i in range(len(walk_t))],'VEC3'))
    walk.append(track(left_tail,'rotation',walk_t,[Z(.12*math.sin(2*PI*i/8)) for i in range(9)]))
    walk.append(track(right_tail,'rotation',walk_t,[Z(-.12*math.sin(2*PI*i/8)) for i in range(9)]))
    g.animation('WalkFunny',walk)
    talking_t=[0,.16,.28,.44,.62,.8,1.,1.2,1.4]
    visemes=[]
    for idx,t in enumerate(talking_t):
        v=[0.]*num_visemes
        if idx not in (0,8):v[[1,4,2,8,6,9,12][(idx-1)%7]]=0.75
        visemes.extend([[x] for x in v])
    g.animation('Talk',[track(mouth_node,'weights',talking_t,visemes,'SCALAR'),
                        track(root,'rotation',[0,.7,1.4],[Y(-.025),Y(.035),Y(-.025)])])
    g.animation('Wave',[track(shoulders[1],'rotation',[0,.3,.55,.8,1.05,1.3],[Z(0),Z(-1.1),Z(-.88),Z(-1.12),Z(-.85),Z(0)]),
                        track(root,'rotation',[0,.65,1.3],[Z(0),Z(.045),Z(0)])])
    g.animation('Point',[track(shoulders[0],'rotation',[0,.3,.85,1.3],[Z(0),Z(.78),Z(.78),Z(0)]),
                         track(root,'rotation',[0,.65,1.3],[Y(0),Y(-.1),Y(0)])])
    g.animation('Laugh',[track(root,'rotation',[0,.25,.5,.75,1],[Z(0),Z(-.065),Z(.055),Z(-.04),Z(0)]),
                         track(mouth_node,'weights',[0,.25,.5,.75,1],[[1 if j==1 and i%2 else 0 for j in range(num_visemes)] for i in range(5) for _ in (0,)],'SCALAR')])
    g.animation('Celebrate',[track(shoulders[0],'rotation',[0,.3,.9,1.3],[Z(0),Z(.94),Z(.94),Z(0)]),
                            track(shoulders[1],'rotation',[0,.3,.9,1.3],[Z(0),Z(-.94),Z(-.94),Z(0)]),
                            track(root,'translation',[0,.3,.6,.9,1.3],[[0,0,0],[0,.08,0],[0,0,0],[0,.08,0],[0,0,0]],'VEC3')])
    g.animation('Look',[track(eyes[0],'rotation',[0,.3,.8,1.2],[Y(0),Y(.08),Y(-.04),Y(0)]),track(eyes[1],'rotation',[0,.3,.8,1.2],[Y(0),Y(.08),Y(-.04),Y(0)])])
    return g.output(path)


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output',default='assets/bill/runtime/Bill-Candidate.glb')
    args=parser.parse_args()
    print(json.dumps(build(args.output),indent=2))


if __name__=='__main__':main()

