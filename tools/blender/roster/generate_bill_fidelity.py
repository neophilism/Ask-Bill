#!/usr/bin/env python3
"""Ask Bill Option 10: sculpted-continuous-paper animated 3D character (art WIP).

No Blender or third-party libraries are required to build the glTF2 GLB.
Input is ORIGINAL one-sheet Option 10 design; never the unsuitable boxy v1 mesh.

Run from repository: python3 tools/blender/generate_bill_fidelity.py --output /tmp/Bill-Fidelity.glb
"""
import argparse
import hashlib
import json
import math
from pathlib import Path
import random
import sys

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from generate_bill import GLB, PI, png, quat  # reuse well-tested deterministic binary writer

S, C = math.sin, math.cos

def clamp(v, a=0., b=1.):return min(b,max(a,v))
def mix(a,b,t):return a*(1-t)+b*t
def smooth(a,b,x):
    t=clamp((x-a)/(b-a));return t*t*(3-2*t)

# Sheet: 3D instead of thin cardboard. Our left/right corners extend from the
# SAME connected paper body into the backward-swept tailcoat wings.
def page(u,t,face=0):
    # Wide rounded forehead transitions to a slim folded-paper waist; the
    # dancing tailcoat ribbons are separately connected to its lower side hem.
    head=smooth(.41,.85,t)
    width=.395 + .26*head + .034*S(PI*t) + .05*t
    x=u*width + .105*t + .033*S(2*PI*t)*u
    y=1.12+2.49*t + .09*u*t*t
    # body sculpting: gently curved like a single page rather than a rectangle
    z=.117+.166*(1-u*u)+.056*S(t*PI)+.018*C(t*PI)-.047*u*u + (.016 if face==0 else -.030)
    return [x,y,z]

def top_wave(u,s,face=0):
    # Connected, compact asymmetrical paper forelock. Broad wave rises across
    # the head and only the right end finishes in a single forward roll.
    x0,y0,z0=page(u,1,face)
    amt=smooth(-.78,.85,u)
    rad=.083+.102*amt
    curl_turn=mix(.43,1.54,amt)
    phi=s*2*PI*curl_turn
    sweep=.24 * (max(0,S(PI*(u+1)/2))**.75) * S(PI*s/2)
    y=y0 + rad*S(phi) + sweep + .035*(1-amt)*s
    z=z0 + rad*(1-C(phi)) + .065*s + .072*amt*s
    x=x0 + .065*amt*s+.10*amt*s*s
    # The left edge tucks into the SAME page. Only the upper-right corner
    # develops a prominent curl: no torn flap, hat brim or twin scrolls.
    weight=.025+.975*smooth(-.99,-.08,u)
    return [mix(x0,x,weight),mix(y0,y,weight),mix(z0,z,weight)]

def vnorm(p):
    d=math.sqrt(sum(x*x for x in p))
    return [v/d for v in p] if d else [0,0,1]

def cross(a,b):return [a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]]
def sub(a,b):return [a[i]-b[i] for i in range(3)]
def add(a,b):return [a[i]+b[i] for i in range(3)]
def sc(a,r):return [q*r for q in a]

def original_paper_texture(reference_path=None):
    w,h=512,1024
    raw=bytearray(w*h*4)
    for y in range(h):
        for x in range(w):
            grain=((x*41+y*67+(x//7)*(y//19)*11)%19)-9
            shade=int(4*S((y/h)*PI)+5*C(x/w*PI))
            i=(y*w+x)*4
            raw[i:i+4]=bytes((min(255,240+grain//3+shade//2),min(255,220+grain//2+shade//2),max(0,179+grain//2+shade//2),255))
    gold=(183,125,55,255);gold_faint=(192,145,81,255);ink=(191,169,139,255)
    def dot(x,y,c):
        x=int(x);y=int(y)
        if 0<=x<w and 0<=y<h:
            idx=(y*w+x)*4;raw[idx:idx+4]=bytes(c)
    def stroke(a,b,c,thick=1):
        x0,y0=a;x1,y1=b;n=int(max(abs(x1-x0),abs(y1-y0),1))
        for k in range(n+1):
            x=x0+(x1-x0)*k/n;y=y0+(y1-y0)*k/n
            for p in range(-(thick//2),thick//2+1):
                for q in range(-(thick//2),thick//2+1): dot(x+p,y+q,c)
    def curly(cx,cy,rx,ry,t0,t1,c,thick=1):
        prev=None
        for i in range(161):
            theta=mix(t0,t1,i/160)
            p=(cx+rx*C(theta),cy+ry*S(theta))
            if prev:stroke(prev,p,c,thick)
            prev=p
    # The face zone (top 45%) intentionally has NO visible writing lines.
    # Legislative texture begins at cravat height and is delicately subdued.
    for yy in range(570,965,27):
        rng=random.Random(91827+yy)
        segments=2 if yy%3 else 3
        for col in range(segments):
            x=65+(col*(w-130)//segments)
            length=(w-140)//segments-rng.randint(12,48)
            stroke((x,yy),(x+length,yy),ink,1)
    # Fine all-page double border; mirrored gold corner flourishes.
    for xx in (14,17,w-15,w-18):stroke((xx,18),(xx,h-19),gold_faint,1)
    for yy in (13,16,h-14,h-17):stroke((19,yy),(w-20,yy),gold_faint,1)
    for x0,sgn in ((40,1),(w-41,-1)):
        curly(x0,40,15,14,PI/4,PI*1.87,gold,2)
        curly(x0,985,15,14,-PI*1.3,PI*.7,gold,2)
        stroke((x0,70),(x0+sgn*22,104),gold_faint)
        curly(x0+sgn*20,104,9,22,1,5,gold_faint)
    # One archival-style monogram-like motif at the bottom (not a seal).
    curly(w//2,h-77,19,22,0,2*PI,gold_faint)
    if reference_path is not None:
        # Professionally approved face remains a painted paper texture on a real
        # 3D single-sheet rig. Texture projection does not replace its geometry.
        from PIL import Image, ImageDraw, ImageFilter
        source=Image.open(reference_path).convert('RGB')
        # Reusable original-art face patch on a continuous 3D paper UV; no
        # demographic inference, remote model, or third-party image retrieval.
        patch=source.crop((421,203,692,490)).resize((368,454),Image.Resampling.LANCZOS)
        base=Image.frombytes('RGBA',(w,h),bytes(raw)).convert('RGB')
        mask=Image.new('L',(368,454),0)
        draw=ImageDraw.Draw(mask)
        draw.rounded_rectangle((28,31,339,421),radius=72,fill=249)
        mask=mask.filter(ImageFilter.GaussianBlur(32))
        # Feathered alpha keeps the approved expression on parchment paper.
        layer=Image.new('RGB',(w,h),(240,220,180))
        layer.paste(patch,(75,106))
        m=Image.new('L',(w,h),0);m.paste(mask,(75,106))
        base.paste(layer,(0,0),m)
        return png(w,h,base.convert('RGBA').tobytes())
    return png(w,h,raw)


def material(g,name,color,rough=.7,metal=0,texture=None,alpha='OPAQUE'):
    i=g.material(name,color,texture)
    d=g.doc['materials'][i]
    d['pbrMetallicRoughness']['roughnessFactor']=rough
    d['pbrMetallicRoughness']['metallicFactor']=metal
    if alpha=='BLEND':d['alphaMode']='BLEND'
    return i

# Smooth, tapered curve tube for eyebrows, gold trim, arms and ornamental stitching.
def curve_tube(g,name,pts,radii,mat,parent,radials=10):
    if len(pts)<2:raise ValueError('tube needs 2+ points')
    if isinstance(radii,(int,float)):radii=[radii]*len(pts)
    verts=[];indices=[];uv=[]
    for i,p in enumerate(pts):
        tangent=vnorm(sub(pts[min(len(pts)-1,i+1)],pts[max(0,i-1)]))
        helper=[0,0,1] if abs(tangent[2])<.83 else [1,0,0]
        u=vnorm(cross(tangent,helper));v=vnorm(cross(tangent,u))
        for j in range(radials):
            phi=2*PI*j/radials
            verts.append(add(p,sc(add(sc(u,C(phi)),sc(v,S(phi))),radii[i])))
            uv.append([i/(len(pts)-1),j/radials])
    for i in range(len(pts)-1):
        for j in range(radials):
            a=i*radials+j;b=i*radials+(j+1)%radials
            c=a+radials;d=b+radials
            indices.extend([a,b,c,b,d,c])
    indices.extend([v for j in range(1,radials-1) for v in (0,j+1,j)])
    last=(len(pts)-1)*radials
    indices.extend([v for j in range(1,radials-1) for v in (last,last+j,last+j+1)])
    m=g.mesh(name,verts,indices,mat,uvs=uv)
    return g.node(name,m,parent)

# Beveled path silhouettes for flat shapes like eyelids, smiling open mouth,
# cravat ribbons, paper lapels, and ornamental paper rings.
def fill_shape(g,name,outline,mat,parent,center=None,offset=0.012):
    center=center or [sum(p[0] for p in outline)/len(outline),sum(p[1] for p in outline)/len(outline),sum(p[2] for p in outline)/len(outline)+offset]
    vertices=[center]+outline
    inds=[]
    for i in range(1,len(outline)):
        inds += [0,i,i+1]
    inds += [0,len(outline),1]
    m=g.mesh(name,vertices,inds,mat)
    return g.node(name,m,parent)

def eye_patch(g,name,cx,cy,z,rx,ry,mat,parent,n=48,tip=.87):
    pts=[]
    for i in range(n):
        t=2*PI*i/n
        x=rx*C(t);y=ry*S(t)*(tip+.13*(1-abs(C(t))))
        pts.append([cx+x,cy+y,z+.017*(1-(x/rx)**2 if rx else 0)])
    return fill_shape(g,name,pts,mat,parent,[cx,cy,z+.032])

def elf_eye(g,cx,cy,front,mats,parent,side):
    # Eye socket is a shallow almond in the page, not a bolted-on white sphere.
    tag='L' if side<0 else 'R'
    width=.177;height=.218
    eye_patch(g,'Soft_Almond_Sclera_'+tag,cx,cy,front+.062,width,height,mats['white'],parent)
    # Iris gaze subtly to viewer's right; iris and pupil flush to the sclera.
    gx=cx+.055;gy=cy-.017
    eye_patch(g,'Warm_Brown_Iris_'+tag,gx,gy,front+.104,.109,.157,mats['amber'],parent,tip=.98)
    eye_patch(g,'Dark_Iris_Rim_'+tag,gx,gy,front+.107,.084,.133,mats['iris'],parent,tip=.98)
    eye_patch(g,'Friendly_Pupil_'+tag,gx+.021,gy-.004,front+.118,.045,.084,mats['pupil'],parent,tip=.98)
    eye_patch(g,'Soft_Eye_Glint_'+tag,gx-.045,gy+.067,front+.126,.027,.037,mats['white'],parent)
    eye_patch(g,'Small_Eye_Glint_'+tag,gx+.042,gy-.045,front+.126,.012,.016,mats['white'],parent)
    # Brow rests above, with eyebrow peak over lateral center: calm not panicked.
    points=[];radius=[]
    for i in range(17):
        t=i/16
        x=cx-.17+.34*t
        y=cy+.264+.024*S(PI*t)+(0.012 if side<0 else .016)*(t-.5)
        points.append([x,y,front+.087]);radius.append(.009+.022*S(PI*t)**.65)
    curve_tube(g,'Relaxed_Arch_Brow_'+tag,points,radius,mats['brow'],parent)
    # Cream thin upper eyelid arc tracks almond; softens exposed eye whites.
    points=[]
    for i in range(21):
        t=i/20
        x=cx-width+2*width*t
        y=cy+.206*S(PI*t)**.9
        points.append([x,y,front+.109]);
    # No detached arc floating above the eyes: the continuous face-paper eyelid
    # is the hand-painted rim around the eye, like the approved sculpture.
    curve_tube(g,'Warm_Upper_Eyelid_'+tag,points,[.002+.005*S(PI*i/20) for i in range(21)],mats['nose'],parent)
    # Quiet lower crease and cheeks: good natured, not a startled face.
    cheekcx=cx+side*(-.045)
    eye_patch(g,'Soft_Blush_'+tag,cheekcx,cy-.319,front+.048,.173,.081,mats['blush'],parent)


def smirk(g,parent,mats):
    z=.44
    # broad integrated crescent mouth: free-flowing upward corners.
    pts=[]
    for i in range(28):
        x=mix(-.30,.29,i/27);t=i/27
        # upper lip smiles as a horizontal arced stroke
        y=2.493+.085*(2*t-1)**2
        pts.append([x,y,z+.023])
    for i in range(27,-1,-1):
        x=mix(-.30,.29,i/27);t=i/27
        y=2.296+.26*abs(2*t-1)**.70
        pts.append([x,y,z+.021])
    fill_shape(g,'Happy_Open_Smile',pts,mats['mouth'],parent,[0,2.40,z+.025])
    # upper teeth form one curved white band, not a bunch of white blobs.
    top=[]
    for i in range(23):
        t=i/22;x=mix(-.23,.225,t)
        top.append([x,2.489+.054*(2*t-1)**2,z+.034])
    for i in range(22,-1,-1):
        t=i/22;x=mix(-.23,.225,t)
        top.append([x,2.397+.125*abs(2*t-1)**.72,z+.035])
    fill_shape(g,'Warm_Smile_Teeth',top,mats['teeth'],parent,[0,2.469,z+.038])
    # tongue is a cheerful crescent at base of mouth, not a flaring ring.
    outline=[]
    for i in range(35):
        th=2*PI*i/35
        outline.append([.133*C(th),2.337+.045*S(th),z+.037])
    fill_shape(g,'Gentle_Tongue',outline,mats['tongue'],parent,[0,2.337,z+.039])
    outline=[]
    for i in range(31):
        t=i/30;x=mix(-.3,.29,t)
        y=2.491+.083*(2*t-1)**2
        outline.append([x,y,z+.052])
    curve_tube(g,'Smile_Corners_And_Lip',outline,[.011+.01*S(i*PI/30) for i in range(31)],mats['mouth_line'],parent)
    # A tiny gentle nose, lifted off paper only 2-3 cm.
    ellipsoid(g,'Rounded_Nose',[.035,2.676,.41],[.062,.042,.023],mats['nose'],parent,segments=20,rings=14)


def ellipsoid(g,name,at,scale,mat,parent,segments=22,rings=15,normal_rotation=0):
    points=[];normals=[];uv=[];inds=[]
    for j in range(rings+1):
        theta=PI*j/rings
        for i in range(segments+1):
            phi=2*PI*i/segments
            x=scale[0]*S(theta)*C(phi);y=scale[1]*C(theta);z=scale[2]*S(theta)*S(phi)
            points.append([at[0]+x,at[1]+y,at[2]+z]);uv.append([i/segments,j/rings])
    for j in range(rings):
        for i in range(segments):
            a=j*(segments+1)+i;b=a+segments+1
            inds.extend([a,b,a+1,a+1,b,b+1])
    return g.node(name,g.mesh(name,points,inds,mat,uvs=uv),parent)


def weighted_page():
    nu,nv=60,100
    p=[];uv=[];tri=[];joints=[];weights=[];morph_a=[];morph_b=[]
    row=nu+1;side=(nv+1)*row
    def put(q,uvv,u,t,extra=0):
        p.append(q);uv.append(uvv)
        tail=.0 if extra==0 else .64*smooth(0,1,extra)
        joint=1 if u<0 else 2
        joints.append([0,joint,0,0]);weights.append([1-tail,tail,0,0])
        morph_a.append([.012*S(PI*u)*S(PI*t),0,.014*S(t*PI)])
        morph_b.append([.05*S(u*PI)*tail,-.04*tail,-.06*tail])
        return len(p)-1
    for face in range(2):
        for j in range(nv+1):
            t=j/nv
            for i in range(nu+1):
                u=2*i/nu-1
                put(page(u,t,face),[(u+1)/2,1-t],u,t)
    for face in range(2):
        o=face*side
        for j in range(nv):
            for i in range(nu):
                a=o+j*row+i;b=a+row
                tri.extend([a,b,a+1,a+1,b,b+1] if face==0 else [a,a+1,b,a+1,b+1,b])
    for j in range(nv):
        for i in (0,nu):
            a=j*row+i;b=a+row;c=a+side;d=b+side
            tri.extend([a,c,b,b,c,d] if i==0 else [a,b,c,b,d,c])
    for j in (0,nv):
        for i in range(nu):
            a=j*row+i;b=a+1;c=a+side;d=b+side
            tri.extend([a,b,c,b,d,c] if j==0 else [a,c,b,b,c,d])
    # One continuous asymmetric hair curl, front AND back woven onto the
    # underlying front/back top page edge, no separate roll or tear.
    nCurl=34
    rows=[]
    for face in (0,1):
        rr=[]
        for j in range(nCurl+1):
            sj=j/nCurl
            rr.append([put(top_wave(2*i/nu-1,sj,face),[i/nu,sj*.13],2*i/nu-1,1) for i in range(nu+1)])
        rows.append(rr)
        for j in range(nCurl):
            for i in range(nu):
                a=rr[j][i];b=rr[j+1][i];c=rr[j][i+1];d=rr[j+1][i+1]
                tri.extend([a,b,c,c,b,d] if face==0 else [a,c,b,c,d,b])
        for i in range(nu):
            a=face*side+nv*row+i;b=a+1
            c=rr[0][i];d=rr[0][i+1]
            tri.extend([a,c,b,b,c,d] if face==0 else [a,b,c,b,d,c])
    for j in range(nCurl):
        for k in (0,nu):
            a=rows[0][j][k];b=rows[0][j+1][k]
            c=rows[1][j][k];d=rows[1][j+1][k]
            tri.extend([a,b,c,b,d,c])
    for i in range(nu):
        a=rows[0][nCurl][i];b=rows[0][nCurl][i+1]
        c=rows[1][nCurl][i];d=rows[1][nCurl][i+1]
        tri.extend([a,b,c,b,d,c])

    # Rearward swooping tailcoat scrolls are physical extensions of the one
    # main sheet. The first row uses the SAME vertex IDs as its side edge.
    # Opposite tails terminate in rolled paper tips, not giant stiff triangles.
    nt=25;ns=38;nc=23
    for sign in (-1,1):
        for face in (0,1):
            strips=[]
            for j in range(nt+1):
                t=j/nv
                # j=25 -> t=.25 (lower hem to elegant rear coat-tail opening)
                aa=page(sign,t,face)
                pointidx=face*side+j*row+(nu if sign>0 else 0)
                strips.append([pointidx])
                for k in range(1,ns+1):
                    s=k/ns
                    target=[aa[0]+sign*(.95*s+.22*S(PI*s)),
                            mix(aa[1],.70+.10*(t/.25-.5),s**.69)-.03*S(PI*s),
                            aa[2]-.69*s+.11*S(PI*s)+.07*S(PI*(t/.25))*s*s]
                    strips[-1].append(put(target,[(t/.25),.71+.24*s],sign,t,s))
            # connected at base and decreasing in width to a little tip
            for j in range(nt):
                for k in range(ns):
                    a,b=strips[j][k],strips[j+1][k]
                    c,d=strips[j][k+1],strips[j+1][k+1]
                    tri.extend([a,b,c,c,b,d] if (sign>0)^(face>0) else [a,c,b,c,d,b])
            # Winding outer tip is a continuation along direction of travel.
            for j in range(nt+1):
                aa=p[strips[j][-1]]
                for k in range(1,nc+1):
                    phi=1.68*PI*k/nc
                    r=.13
                    pos=[aa[0]+sign*r*S(phi),
                         aa[1]+r*(1-C(phi)),
                         aa[2]+.025*k/nc]
                    strips[j].append(put(pos,[t/.25,.95+.02*k/nc],sign,t,1.0))
            for j in range(nt):
                for k in range(ns,ns+nc):
                    a,b=strips[j][k],strips[j+1][k]
                    c,d=strips[j][k+1],strips[j+1][k+1]
                    tri.extend([a,b,c,c,b,d] if (sign>0)^(face>0) else [a,c,b,c,d,b])
    return p,uv,tri,joints,weights,[('PaperBreathe',morph_a),('TailSway',morph_b)]

def paper_lapels(g,root,m):
    # Not a separate cloth jacket. Thin navy ink-patterned folded-paper lapels
    # sit on the paper with a gold border; full cream page remains visible.
    for side,sign in [('Left',-1),('Right',1)]:
        points=[
            [sign*.39,2.24,.37], [sign*.61,2.20,.30],
            [sign*.58,2.01,.33], [sign*.48,1.91,.365],
            [sign*.55,1.58,.31], [sign*.38,1.42,.36],
            [sign*.295,1.57,.37], [sign*.34,1.93,.39],
            [sign*.29,2.08,.40]
        ]
        fill_shape(g,'Navy_Gold_Paper_Lapel_'+side,points,m['navy'],root)
        for nm,pointset in [
           ('Outer',points[0:6]),('Inner',points[6:]+[points[0]])]:
            curve_tube(g,'Gold_Piping_'+side+nm,pointset,.020,m['gold'],root)
        # Five golden embroidered leaves, stylized original pattern.
        for k in range(5):
            cy=1.66+k*.10;cx=sign*(.423+(k%2)*.021)
            ellipsoid(g,'Filigree_Leaf_'+side+str(k),[cx,cy,.39],[.022,.051,.009],m['gold'],root,segments=10,rings=8)
        # The standing collar folds visually into the body instead of clothing over it.
        collar=[[sign*.35,2.31,.38],[sign*.52,2.27,.34],[sign*.63,2.20,.31],[sign*.43,2.18,.40]]
        fill_shape(g,'Origami_Collar_'+side,collar,m['cream'],root)
        curve_tube(g,'Collar_Gold_Edge_'+side,collar[:3],.018,m['gold'],root)
    for i,y in enumerate([1.99,1.79,1.59]):
        ellipsoid(g,'Gold_Button_'+str(i),[.015,y,.395],[.050,.051,.025],m['gold'],root)
        ellipsoid(g,'Gold_Button_Glimmer_'+str(i),[.012,y+.01,.42],[.012,.016,.008],m['lightgold'],root)


def paper_cravat(g,root,m):
    # Large satin bow at neck with flowing cream pleats, outlined in gold.
    ellipsoid(g,'Cravat_Gold_Knot',[0,2.14,.47],[.058,.056,.040],m['lightgold'],root)
    for sign,tag in [(-1,'L'),(1,'R')]:
        ribbon=[
          [0,2.17,.466], [sign*.18,2.252,.456], [sign*.33,2.259,.431],
          [sign*.285,2.120,.447], [sign*.22,2.062,.465], [0,2.12,.478]
        ]
        fill_shape(g,'Cravat_Bow_Wing_'+tag,ribbon,m['warmwhite'],root)
        curve_tube(g,'Cravat_Gold_Sewing_'+tag,ribbon[1:4],.009,m['lightgold'],root)
    left=[[-.038,2.09,.47],[-.22,1.895,.445],[-.124,1.912,.46],[-.06,1.762,.46],[.018,1.918,.46]]
    right=[[.04,2.09,.476],[.18,1.86,.44],[.09,1.882,.475],[.085,1.748,.45],[-.018,1.919,.46]]
    fill_shape(g,'Cravat_Flounce_L',left,m['warmwhite'],root)
    fill_shape(g,'Cravat_Flounce_R',right,m['cream'],root)
    for sign in (-1,1):
        curve_tube(g,'Cravat_Pleat_'+str(sign),[[sign*.035,2.10,.49],[sign*.071,1.92,.48],[sign*.045,1.78,.47]],[.012,.012,.006],m['lightgold'],root)


def segment(g,parent,name,points,r0,r1,m):
    # Smooth Catmull-Rom sleeves with rounded elbow instead of joined boxes.
    if len(points)>2:
        control=points
        refined=[]
        for idx in range(len(control)-1):
            p0=control[max(0,idx-1)];p1=control[idx]
            p2=control[idx+1];p3=control[min(len(control)-1,idx+2)]
            for step in range(8):
                t=step/8
                refined.append([.5*((2*p1[j])+(-p0[j]+p2[j])*t+
                     (2*p0[j]-5*p1[j]+4*p2[j]-p3[j])*t*t+
                     (-p0[j]+3*p1[j]-3*p2[j]+p3[j])*t*t*t) for j in range(3)])
        points=refined+[control[-1]]
    verts=[];uv=[];inds=[];n=16
    for ix,p in enumerate(points):
        t=ix/(len(points)-1);r=mix(r0,r1,t)
        tangent=vnorm(sub(points[min(len(points)-1,ix+1)],points[max(0,ix-1)]))
        v=vnorm(cross(tangent,[0,0,1]))
        if sum(q*q for q in v)<.8:v=[1,0,0]
        w=vnorm(cross(tangent,v))
        for j in range(n):
            a=2*PI*j/n
            verts.append(add(p,sc(add(sc(v,C(a)),sc(w,S(a))),r)))
            uv.append([t,j/n])
    for i in range(len(points)-1):
        for j in range(n):
            a=i*n+j;b=i*n+(j+1)%n;c=a+n;d=b+n
            inds.extend([a,b,c,b,d,c])
    mesh=g.mesh(name,verts,inds,m,uvs=uv)
    return g.node(name,mesh,parent)


def glove(g,root,tag,cx,cy,cz,m,angle=0,open_hand=True):
    # recognizably gloved, molded pale fabric; five fingers and thumb.
    ellipsoid(g,'Glove_Palm_'+tag,[cx,cy,cz],[.159,.104,.077],m['warmwhite'],root)
    if open_hand:
        for i in range(4):
            x=cx+(i-1.5)*.079
            y=cy+.044+(.044 if i in (1,2) else .005)
            curve_tube(g,'Glove_Finger_'+tag+str(i),[[x,y,cz],[x-.045, y+.077,cz+.045],[x-.075,y+.106,cz+.046]], [.041,.038,.024],m['warmwhite'],root,8)
        curve_tube(g,'Glove_Thumb_'+tag,[[cx+.131,cy+.0,cz],[cx+.24,cy+.002,cz+.055],[cx+.252,cy+.056,cz+.065]],[.050,.045,.028],m['warmwhite'],root)
    else:
        for i in range(3):
            x=cx+.05*(i-1)
            ellipsoid(g,'Curled_Finger_'+tag+str(i),[x,cy-.07,cz+.055],[.047,.074,.050],m['warmwhite'],root,segments=16,rings=10)
        ellipsoid(g,'Fist_Thumb_'+tag,[cx-.109,cy,cz+.05],[.063,.082,.05],m['warmwhite'],root)


def limbs(g,root,hips,m):
    # Gentle welcoming pose in native rest state; avoids short dangling arms.
    shoulder_l=g.node('Rig_Shoulder_L',parent=root,translation=[-.66,2.19,.025])
    shoulder_r=g.node('Rig_Shoulder_R',parent=root,translation=[.66,2.19,.025])
    # Each limb's positions are local relative to its parent for animation.
    segment(g,shoulder_l,'Navy_Coat_Sleeve_L',[[0,0,.05],[-.27,-.18,.1],[-.54,-.10,.20]],.170,.119,m['navy'])
    segment(g,shoulder_l,'Embroidered_Cuff_L',[[-.51,-.10,.20],[-.60,-.06,.215]],.135,.119,m['cream'])
    for j in range(4):
        y=-.11+.04*j
        curve_tube(g,'Sleeve_Filigree_L'+str(j),[[-.53,y,.292],[-.57,y+.03,.298],[-.59,y+.04,.28]],.008,m['gold'],shoulder_l)
    glove(g,shoulder_l,'Open_L',-.72,-.025,.23,m,open_hand=True)
    segment(g,shoulder_r,'Navy_Coat_Sleeve_R',[[0,0,.05],[.27,-.25,.1],[.12,-.53,.29]],.170,.113,m['navy'])
    segment(g,shoulder_r,'Embroidered_Cuff_R',[[.15,-.48,.25],[.09,-.57,.305]],.129,.114,m['cream'])
    glove(g,shoulder_r,'Resting_R',.0,-.51,.36,m,open_hand=False)
    # Cream tights and original buckle shoes; slim, proportional to the page.
    for sign,tag in [(-1,'L'),(1,'R')]:
        hip=g.node('Rig_Hip_'+tag,parent=root,translation=[sign*.244,1.23,-.07]);hips.append(hip)
        pts=[[0,0,0],[sign*.025,-.23,-.04],[sign*.07,-.59,-.02],[sign*.05,-.83,.015]]
        segment(g,hip,'Parchment_Tailored_Leg_'+tag,pts,.114,.076,m['cream'])
        ellipsoid(g,'Satin_Shoe_'+tag,[sign*.055,-.91,.155],[.166,.128,.275],m['navy'],hip,segments=24,rings=16)
        ellipsoid(g,'Shoe_Toecap_'+tag,[sign*.047,-.948,.338],[.160,.083,.150],m['shoe'],hip,segments=24,rings=14)
        ellipsoid(g,'Gold_Shoe_Buckle_'+tag,[sign*.05,-.823,.315],[.085,.034,.022],m['gold'],hip)
        ellipsoid(g,'Buckle_Center_'+tag,[sign*.05,-.808,.332],[.047,.016,.012],m['navy'],hip)
    return shoulder_l,shoulder_r


def animations(g,root,sheet,l,r,hips,mouth_node,eye_nodes):
    # Retains 8 real reusable glTF2 clips; runtime travel stays application-owned.
    tr=lambda n,p,t,v,k='VEC4':(n,p,t,v,k)
    T=[0,.6,1.2,1.8,2.4]
    g.animation('Idle',[tr(root,'translation',T,[[0,0,0],[0,.009,0],[0,.0,0],[0,.009,0],[0,0,0]],'VEC3'),
                       tr(sheet,'weights',T,[[.015,0],[.055,.04],[.01,0],[.055,.035],[.015,0]],'SCALAR')])
    t=[i*.12 for i in range(11)]
    walk=[]
    for i,hip in enumerate(hips):
        walk.append(tr(hip,'rotation',t,[quat('x',(1 if i==0 else -1)*.34*S(2*PI*k/10)) for k in range(11)]))
    for i,arm in enumerate([l,r]):
        walk.append(tr(arm,'rotation',t,[quat('x',(-1 if i==0 else 1)*.16*S(2*PI*k/10)) for k in range(11)]))
    walk.append(tr(root,'translation',t,[[0,.04*abs(S(2*PI*k/10)),0] for k in range(11)],'VEC3'))
    g.animation('WalkFunny',walk)
    # actual mouth viseme morphs are animated; positive weights stay normalized.
    n=len(g.doc['meshes'][g.doc['nodes'][mouth_node]['mesh']]['weights'])
    t=[0,.2,.4,.6,.8,1.0,1.2]
    phon=[]
    for i in range(len(t)):
        frame=[0.]*n
        if i not in (0,len(t)-1):frame[[1,3,5,2,4][(i-1)%5]]=.72
        phon.extend([[v] for v in frame])
    g.animation('Talk',[tr(mouth_node,'weights',t,phon,'SCALAR'),tr(root,'rotation',[0,.6,1.2],[quat('y',0),quat('y',-.03),quat('y',0)])])
    g.animation('Wave',[tr(l,'rotation',[0,.25,.6,.9,1.2],[quat('z',0),quat('z',-.24),quat('z',-.09),quat('z',-.30),quat('z',0)])])
    g.animation('Point',[tr(l,'rotation',[0,.25,.75,1.15],[quat('z',0),quat('z',-.22),quat('z',-.20),quat('z',0)])])
    g.animation('Laugh',[tr(root,'rotation',[0,.18,.36,.54,.72,.9],[quat('z',v) for v in [0,-.044,.036,-.037,.03,0]])])
    g.animation('Celebrate',[tr(l,'rotation',[0,.28,.9,1.4],[quat('z',v) for v in [0,-.28,-.28,0]]),
                             tr(r,'rotation',[0,.28,.9,1.4],[quat('z',v) for v in [0,.52,.52,0]]),
                             tr(root,'translation',[0,.32,.64,.96,1.4],[[0,0,0],[0,.055,0],[0,.0,0],[0,.045,0],[0,0,0]],'VEC3')])
    for i,nd in enumerate(eye_nodes):
        pass
    g.animation('Look',[tr(root,'rotation',[0,.35,.9,1.4],[quat('y',v) for v in [0,.07,.035,0]])])


def speech_mouth(g,root,m):
    # Small hidden viseme control tucked into actual smile. Mesh is small but
    # loaded by animation drivers; real shapes provided for live TTS mapping.
    n=38;rad=.016;p=[[0,0,0]];indices=[]
    for i in range(n):
        a=2*PI*i/n;p.append([.1*C(a),.054*S(a),0])
    for i in range(n):indices.extend([0,i+1,1+(i+1)%n])
    shapes=[]
    for nm,sx,sy in [('sil',.1,.1),('AA',1.4,1.7),('EE',1.55,.52),('IH',.83,.91),('OH',.8,1.5),('OO',.53,1.25),('U',.43,.85),('FV',1.1,.30),('MBP',.95,.05),('L',.9,1.15),('TH',1.05,1.1),('CH',.72,.84),('SS',1.2,.44),('R',.75,.91)]:
        shapes.append(('viseme_'+nm,[[v[0]*(sx-1),v[1]*(sy-1),0] for v in p]))
    mesh=g.mesh('MouthVisemes',p,indices,m['mouth'],morphs=shapes)
    return g.node('Expression_Mouth',mesh,root,translation=[.012,2.35,.255])


def build(output,reference_path=None):
    g=GLB()
    g.doc['asset']['generator']='Ask Bill Option 10 fidelity study: original continuous folio procedural art'
    tex=g.append(original_paper_texture(reference_path));g.doc['images'].append({'bufferView':tex,'mimeType':'image/png'})
    g.doc['samplers'].append({'magFilter':9729,'minFilter':9987,'wrapS':33071,'wrapT':33071})
    g.doc['textures'].append({'source':0,'sampler':0})
    mat={
      'paper':material(g,'Original parchment paper',[1,1,1,1],.82,texture=0),
      'cream':material(g,'Cream paper satin', [0.93,.82,.65,1],.65),
      'warmwhite':material(g,'Ivory gloves and cravat',[.96,.92,.81,1],.51),
      'white':material(g,'Eyes warm sclera',[.98,.97,.91,1],.33),
      'amber':material(g,'Amber iris outer',[.55,.31,.13,1],.31),
      'iris':material(g,'Soft dark brown iris',[.25,.13,.065,1],.28),
      'pupil':material(g,'Brown-black pupils',[.08,.05,.04,1],.22),
      'brow':material(g,'Relaxed espresso eyebrows',[.31,.16,.086,1],.7),
      'blush':material(g,'Gentle warm blush',[.96,.67,.55,.25],.92,alpha='BLEND'),
      'nose':material(g,'Warm parchment nose',[.96,.75,.61,1],.70),
      'navy':material(g,'Midnight ink blue lapels',[.115,.15,.30,1],.49),
      'shoe':material(g,'Polished deep navy loafers',[.055,.064,.099,1],.19),
      'gold':material(g,'Soft gilt embroidery and buttons',[.80,.53,.21,1],.23,.52),
      'lightgold':material(g,'Soft champagne piping',[.89,.65,.38,1],.72,.0),
      'mouth':material(g,'Velvet burgundy smile',[.25,.063,.081,1],.57),
      'mouth_line':material(g,'Warm lip outline',[.37,.135,.12,1],.63),
      'teeth':material(g,'Warm ivory teeth',[.99,.96,.83,1],.40),
      'tongue':material(g,'Natural berry tongue',[.72,.32,.37,1],.66),
    }
    root=g.node('Bill_Root')
    torso=g.node('Rig_Torso',parent=root)
    tails=[g.node('Rig_TailLeft',parent=torso,translation=[-.92,1.18,-.35]),
           g.node('Rig_TailRight',parent=torso,translation=[.92,1.18,-.35])]
    p,uv,inds,joints,weights,morphs=weighted_page()
    folio=g.mesh('ONE_CONTINUOUS_FOLIO_PARCHMENT',p,inds,mat['paper'],uvs=uv,morphs=morphs,joints=joints,weights=weights)
    inv=[]
    for dx,dy,dz in [(0,0,0),(-.92,1.18,-.35),(.92,1.18,-.35)]:
        inv.append([1,0,0,0, 0,1,0,0, 0,0,1,0, -dx,-dy,-dz,1])
    sk=g.doc['skins'];sk.append({'name':'Folio and extended paper tails',
                                  'inverseBindMatrices':g.accessor(inv,'MAT4'),
                                  'joints':[torso]+tails,'skeleton':torso})
    sheet=g.node('SingleSheet_Body',mesh=folio,skin=0,parent=root)
    # Face is on the CURVED front sheet, not a separate human head.
    face=g.node('FaceAttachedToFolio',parent=root)
    if reference_path is None:
        elf_eye(g,-.295,3.045,.360,mat,face,-1)
        elf_eye(g,.346,3.057,.354,mat,face,1)
        smirk(g,face,mat)
    paper_lapels(g,root,mat)
    paper_cravat(g,root,mat)
    hips=[];l,r=limbs(g,root,hips,mat)
    # The original single-paper page edge carries fine gold trim, no torn top.
    upper=[top_wave(-1+2*i/65,1,0) for i in range(66)]
    curve_tube(g,'Continuous_Gold_Filigree_TopCurl_Edge',upper,.007,mat['lightgold'],root)
    for side,sign in [('L',-1),('R',1)]:
        along=[page(sign,t/45,0) for t in range(46)]
        curve_tube(g,'Fine_Gilt_Outer_Page_Edge_'+side,along,[.011+.008*(1-t/45) for t in range(46)],mat['lightgold'],root)
    # One continuous curl outline on right end: not a detached second curl.
    rim=[top_wave(1,j/48,0) for j in range(49)]
    curve_tube(g,'One_Integrated_Hair_Curl_Rim',rim,.010,mat['gold'],root)
    mouth=speech_mouth(g,root,mat)
    animations(g,root,sheet,l,r,hips,mouth,[])
    output=Path(output)
    info=g.output(output)
    info['morphs']=['PaperBreathe','TailSway']
    info['version']='art-study-v3b'
    return info

if __name__=='__main__':
    p=argparse.ArgumentParser()
    p.add_argument('--output',default='assets/bill/runtime/Bill-Option10-Fidelity.glb')
    p.add_argument('--reference',default=None,help='Original owner-approved character illustration for front facial texture')
    args=p.parse_args()
    print(json.dumps(build(args.output,args.reference),indent=2))