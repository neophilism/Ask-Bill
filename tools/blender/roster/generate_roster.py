#!/usr/bin/env python3
"""Build twenty *real*, walking/talking glTF/GLB character candidates for Ask Bill.

Own original concepts 01-10 are reproduced with their individually matched approved-
concept face crop. 11-20 are independent creative art directions with different forms.
All candidates remain visual studies, NOT final sculpt/animation acceptance.
All builds are deterministic, local, with no AI model or network usage.
"""
import argparse
import base64
import hashlib
import json
import math
import os
import random
import struct
import sys
import tempfile
from pathlib import Path
from PIL import Image, ImageDraw, ImageFilter, ImageOps

THIS=Path(__file__).resolve().parent
sys.path.insert(0,str(THIS))
import generate_bill_fidelity as f
import animation_library as motion
from generate_bill import GLB

GOLD=(.81,.58,.29,1)
FRIENDLY=[
(1,'Ivory Court Gentleman','portrait','cream','courtly','Warm, ceremonious, patient; explains by analogies'),
(2,'Tuxedo Paper Guide','portrait','tuxedo','formal','Efficient, warm, concise; offers a quick overview first'),
(3,'Midnight Legislative Scholar','portrait','midnight','scholar','Curious, knowledgeable; leads with context and caveats'),
(4,'Golden Parchment Attendant','portrait','gold','courtly','Measured, gentle; methodically unpacks complicated language'),
(5,'Navy Tailcoat Folio','portrait','navy','courtly','Playful, polished; uses practical everyday examples'),
(6,'Reference Page Butler','portrait','reading','scholar','Direct and thorough; points to the precise sentence'),
(7,'Ribbon Collar Companion','portrait','ivory','gentle','Reassuring, thoughtful; checks whether an explanation helped'),
(8,'Adventurous Legislative Page','portrait','midnight','energetic','Animated, upbeat; gets straight to the important detail'),
(9,'Civic Scholar Folio','portrait','navy','scholar','Even-handed, precise; distinguishes fact from interpretation'),
(10,'The Classic Bill','portrait','midnight','classic','Friendly, elegantly attentive; the owner-selected default'),
(11,'The Origami Pathfinder','origami','teal','explorer','Playfully adventurous; follows an idea through its consequences'),
(12,'The Scroll Sage','scroll','ruby','sage','Calm and reflective; explains historical background simply'),
(13,'The Pocket Book Librarian','pocketbook','aubergine','librarian','Quietly enthusiastic, patient and gently humorous'),
(14,'The Bound Tome Professor','hardcover','forest','professor','Methodical and scholarly; offers definitions and examples'),
(15,'The Accordion Investigator','accordion','saffron','detective','Inquisitive and systematic; asks what changed and why'),
(16,'The Paper Trail Runner','origami','coral','energetic','Lively and plainspoken; keeps answers short and visual'),
(17,'The Minimal Index Card','indexcard','slate','minimal','Minimalist and efficient; clear answers without ceremony'),
(18,'The Docket Detective','docket','burgundy','detective','Skeptical but fair; highlights hidden assumptions'),
(19,'The Digital Bill','tablet','electric','tech','Bright, accessible and technical; shows structured breakdowns'),
(20,'The Civic News Page','newspaper','denim','journalist','Conversational and practical; summarizes the main impact')]

PALETTE={
'cream':(.65,.46,.27,1),'tuxedo':(.10,.13,.20,1),'midnight':(.095,.14,.26,1),
'gold':(.62,.42,.18,1),'navy':(.10,.16,.31,1),'reading':(.15,.18,.25,1),
'ivory':(.54,.41,.28,1),'teal':(.07,.38,.38,1),'ruby':(.50,.16,.20,1),
'aubergine':(.30,.20,.36,1),'forest':(.18,.29,.23,1),'saffron':(.72,.40,.13,1),
'coral':(.73,.32,.27,1),'slate':(.29,.38,.44,1),'burgundy':(.36,.12,.22,1),
'electric':(.07,.29,.47,1),'denim':(.16,.30,.44,1)}

# Bounding boxes for the primary protagonist's *face only*, in the original
# 1086x1448 character concepts. The selected Option 10 is the original reference.
FACES={
 1:(180,138,392,404), 2:(160,102,387,373), 3:(462,220,710,494),
 4:(265,92,472,327), 5:(175,165,409,430), 6:(570,228,821,532),
 7:(347,247,637,535), 8:(255,185,530,475), 9:(405,260,661,523),
 10:(422,204,691,493)}
ORIGINAL_FILES={
1:'bill_the_living_parchment_character_sheet.png',
2:'bill_paper_assistant_character_sheet.png',
3:'welcoming_parchment_butler_mascot.png',
4:'option_4_parchment_paper_butler_turnaround.png',
5:'bill_the_paper_butler_option_5.png',
6:'option_6_charming_bill_mascot.png',
7:'option_7_parchment_butler_guide.png',
8:'option_8_bill_character_concept_sheet.png',
9:'option_9_charming_legal_parchment.png',
10:'parchment_butler_character_concept.png'}

# Each source face is a small cropped derivative of the original illustration.
# Repo build inputs include these crops to reproduce the GLBs without reaching
# outside the repository. Preserve full originals elsewhere with provenance.
def extract_faces(original_dir,ref_dir):
    ref_dir.mkdir(parents=True,exist_ok=True)
    for n,filename in ORIGINAL_FILES.items():
        src=Path(original_dir)/filename
        if not src.is_file():
            if (ref_dir/f'original-{n:02}.jpg').is_file(): continue
            raise FileNotFoundError('Missing original '+str(src))
        im=Image.open(src).convert('RGB')
        # Crop with a small extension to preserve the eyebrow/cheek context.
        x0,y0,x1,y1=FACES[n]
        face=im.crop((x0,y0,x1,y1))
        # Small crop is intended as a color texture rather than a model mesh.
        face=ImageOps.fit(face,(256,285),Image.Resampling.LANCZOS)
        face.save(ref_dir/f'original-{n:02}.jpg','JPEG',quality=80,optimize=True,subsampling=0)

def fit_reference_crop(patch, dst):
    # The procedural original face UV projection expects x421:692, y203:490.
    # It is important not to transfer cropped human features to new nonhuman
    # forms or infer preferred personas from demographics.
    im=Image.new('RGB',(1086,1448),(240,220,180))
    patch=Image.open(patch).convert('RGB').resize((271,287),Image.Resampling.LANCZOS)
    im.paste(patch,(421,203))
    im.save(dst,'JPEG',quality=92,optimize=True)

def add_quad(g,name,center,halfsize,z,mat,parent):
    cx,cy=center;wx,hy=halfsize
    points=[[cx-wx,cy-hy,z],[cx+wx,cy-hy,z],[cx+wx,cy+hy,z],[cx-wx,cy+hy,z]]
    return g.node(name,g.mesh(name,points,[0,1,2,0,2,3],mat),parent)

def ring(g,name,center,rx,ry,material,parent,r=.02,arc=math.tau):
    pts=[[center[0]+rx*math.cos(a*arc/48),center[1]+ry*math.sin(a*arc/48),center[2]] for a in range(49)]
    return f.curve_tube(g,name,pts,r,material,parent)

def rectangular_solid(g,name,x0,x1,y0,y1,z0,z1,mat,parent):
    vertices=[[x0,y0,z0],[x1,y0,z0],[x1,y1,z0],[x0,y1,z0],
              [x0,y0,z1],[x1,y0,z1],[x1,y1,z1],[x0,y1,z1]]
    indices=[0,1,2,0,2,3,4,6,5,4,7,6,0,4,5,0,5,1,1,5,6,1,6,2,2,6,7,2,7,3,3,7,4,3,4,0]
    return g.node(name,g.mesh(name,vertices,indices,mat),parent)

def extras(g,root,m,spec):
    n,title,form,color,style,_=spec
    # All props are original 3D geometry; they are not image billboards.
    trim=m['gold'];paper=m['cream'];ink=m['navy'];white=m['warmwhite']
    if form in ('pocketbook','hardcover','docket'):
        width=.75 if form=='hardcover' else .69
        rectangular_solid(g,'BoundBook_DeepSpine',-width-.065,-width+.06,1.16,3.53,-.12,.35,ink,root)
        rectangular_solid(g,'Hardback_RearCover',-width,width,1.15,3.60,-.22,-.14,ink,root)
        # The front of the book has a wide paper inset for the face.
        for xx in (-width,width):
            f.curve_tube(g,'Gilt_Book_Cover_Side',[[xx,1.22,.382],[xx,3.54,.382]],.032,trim,root)
        for yy in (1.19,3.56):
            f.curve_tube(g,'Gilt_Book_Cover_End',[[-width,yy,.382],[width,yy,.382]],.032,trim,root)
        for yy in (1.40,1.56,1.72):
            f.curve_tube(g,'Gilt_Spine_Bands_'+str(yy),[[-width-.078,yy,-.18],[-width-.078,yy,.32]],.027,trim,root)
        if form=='docket':
            rectangular_solid(g,'Detective_Case',.40,.97,.75,1.75,-.25,.28,ink,root)
            f.curve_tube(g,'Case_Handle',[[.54,1.75,-.10],[.58,1.91,-.12],[.81,1.91,-.12],[.84,1.76,-.10]],.05,trim,root)
        if form=='pocketbook':
            # Small old-fashioned spectacles make the book's social posture clear.
            for xx in (-.28,.28): ring(g,'Round_Librarian_Glasses', (xx,3.02,.54),.205,.198,trim,root,.021)
            f.curve_tube(g,'Bridge_Of_Glasses',[[-.085,3.02,.55],[.085,3.02,.55]],.021,trim,root)
        if form=='hardcover':
            f.curve_tube(g,'Professor_Tie',[[0,2.3,.46],[0,2.05,.55],[.06,1.92,.56]],.065,ink,root)
    elif form=='scroll':
        # Scroll has genuine horizontally wound cylinders with exposed spiral
        # endcaps. Body is a page suspended between two paper rollers.
        for yy in (1.16,3.53):
            f.curve_tube(g,'Scroll_Rod',[[xx,yy,.20] for xx in (-.95,-.62,-.30,0,.30,.62,.95)],.16,paper,root)
            for sign in (-1,1):
                ring(g,'Scroll_Concentric_Winding',(sign*.96,yy,.20),.08,.08,trim,root,.020)
        f.curve_tube(g,'Sage_Sash',[[-.72,1.86,.42],[-.25,1.75,.48],[.3,1.85,.47],[.70,2.17,.37]],.06,ink,root)
    elif form=='accordion':
        for xx in (-.58,-.36,-.14,.08,.3,.52):
            f.curve_tube(g,'Accordion_Fold_Ridge_'+str(xx),[[xx,1.18,.31],[xx,3.55,.36]],.014,trim,root)
        ring(g,'Magnifier_Handle_Ring',(.98,1.78,.21),.23,.23,ink,root,.048)
        f.curve_tube(g,'Magnifier_Handle',[[.81,1.56,.24],[.61,1.30,.23]],.069,ink,root)
    elif form=='tablet':
        for xx in (-.71,.71):f.curve_tube(g,'Tablet_Side_Bezel',[[xx,1.15,.34],[xx,3.59,.34]],.073,ink,root)
        for yy in (1.14,3.60):f.curve_tube(g,'Tablet_Horizontal_Bezel',[[-.71,yy,.34],[.71,yy,.34]],.075,ink,root)
        ring(g,'Tablet_Home_Button',(0,1.28,.38),.042,.042,trim,root,.012)
        # No surveillance indicators, camera, microphone or networking in asset.
    elif form=='indexcard':
        for idx in (0,1):
            sign=-1 if idx==0 else 1
            v=[[sign*.07-.75,1.25,.19-idx*.07],[sign*.07+.75,1.25,.19-idx*.07],
               [sign*.07+.75,3.55,.19-idx*.07],[sign*.07-.75,3.55,.19-idx*.07]]
            g.node('IndexCard_BackCard_'+str(idx),g.mesh('IndexCard_BackCard_'+str(idx),v,[0,1,2,0,2,3],paper),root)
        for j,yy in enumerate((2.0,2.13,2.26)):
            f.curve_tube(g,'IndexCard_Guide_'+str(j),[[-.36,yy,.44],[.36,yy,.44]],.006,trim,root)
    elif form=='newspaper':
        for j,yy in enumerate((1.70,1.85,1.97,2.1)):
            f.curve_tube(g,'Newsprint_BodyLine_'+str(j),[[-.44,yy,.43],[.37,yy,.43]],.010,m['brow'],root)
        for xx in (-.28,.28):
            f.curve_tube(g,'Newsprint_ColumnRule',[[xx,1.45,.38],[xx,1.73,.39]],.009,trim,root)
    elif form=='origami':
        for sign in (-1,1):
            pts=[[sign*.65,2.15,.06],[sign*1.25,2.66,-.11],
                 [sign*1.52,2.07,-.16],[sign*.80,1.89,-.11]]
            f.fill_shape(g,'Origami_Wing_'+str(sign),pts,paper,root)
            f.curve_tube(g,'Origami_Wing_Contour_'+str(sign),pts[:3],.012,trim,root)
        if style=='explorer':
            ring(g,'Explorer_Compass',(0,1.70,.54),.11,.11,trim,root,.028)
    # One identifiable accessory/wardrobe detail per personality.
    if style=='sage':
        for j in range(3): ring(g,'Sage_Parchment_Medal'+str(j),(.0,1.65+j*.13,.40),.085,.035,trim,root,.012)
    elif style=='journalist':
        f.curve_tube(g,'Messenger_Bag_Strap',[[-.57,2.23,.50],[-.12,1.97,.52],[.42,1.62,.43]],.045,ink,root)
        rectangular_solid(g,'Reporter_Bag',.22,.74,1.14,1.65,.12,.46,ink,root)
    elif style=='detective':
        f.curve_tube(g,'Detective_Short_Brim',[[-.61,3.63,.24],[0,3.74,.25],[.61,3.63,.23]],.052,ink,root)
    elif style=='minimal':
        ring(g,'Minimal_Badge',(0,1.85,.49),.125,.125,ink,root,.02)
    elif style=='tech':
        for yy in (1.86,1.98,2.10):
            f.curve_tube(g,'Interface_Light_Band_'+str(yy),[[-.33,yy,.40],[.33,yy,.40]],.012,trim,root)


def make(spec, output,ref_dir):
    n,title,form,color,style,persona=spec
    orig_page=f.page; orig_wave=f.top_wave; orig_lapels=f.paper_lapels
    orig_cravat=f.paper_cravat;orig_mat=f.material;orig_output=GLB.output;orig_weighted=f.weighted_page;orig_animations=f.animations
    # Variants differ in actual 3D silhouette, not merely texture or name.
    def page_variant(u,t,face=0):
        p=orig_page(u,t,face)
        if n==2: # compact tuxedo on a narrow sheet
            p[0]*=.89;p[1]=1.15+(p[1]-1.15)*.94
        elif n in (1,4,7): # flowing Regency body
            p[0]*=1.02+(.08 if t<.3 else 0)
        elif n==6:p[0]*=1.04;p[2]+=.065*u*u
        elif n==9:p[0]*=.93;p[1]*=1.015
        elif n==10:p[0]*=1.04;p[1]*=1.01
        elif form in ('hardcover','pocketbook','docket'):
            p[0]*=1.03+.025*(1-t);p[2]-=.016
        elif form=='scroll':p[0]*=1.10;p[2]+=.03*math.cos(u*math.pi)
        elif form=='accordion':p[2]+=.060*math.cos(u*math.pi*6)
        elif form=='origami':p[0]*=1.08; p[2]+=.12*(abs(u)**3)
        elif form=='indexcard':p[0]*=1.14;p[1]=1.18+(p[1]-1.12)*.92
        elif form=='tablet':p[0]*=1.09; p[2]-=.023
        elif form=='newspaper':p[0]*=1.18;p[1]=1.17+(p[1]-1.12)*.96
        return p
    def top_variant(u,s,face=0):
        if n<=10:
            p=orig_wave(u,s,face)
            if n==2:p[1]+=.08*s; p[2]-=.06*s
            if n==10:p[2]+=.025*s
            return p
        # Non-butlers don't all wear a paper curl. Top folds modestly into the
        # page or its physical cover; scroll uses genuine roller geometry.
        p=page_variant(u,1,face)
        if form=='origami':return [p[0]+.08*u*s,p[1]+.20*s*(1-abs(u)),p[2]-.11*s]
        if form=='accordion':return [p[0],p[1]+.025*s,p[2]+.035*s]
        return [p[0],p[1]+.014*s,p[2]+.018*s]
    def mat_variant(g,name,col,rough=.7,metal=0,texture=None,alpha='OPAQUE'):
        if name=='Midnight ink blue lapels':col=PALETTE[color]
        if name=='Polished deep navy loafers':col=tuple(max(.035,v*.50) for v in PALETTE[color][:3])+(1,)
        if name=='Warm parchment nose' and n<=10:col=(.94,.79,.65,1)
        return orig_mat(g,name,col,rough,metal,texture,alpha)
    def lapels(g,root,m):
        if n<=10:orig_lapels(g,root,m)
        elif form in ('hardcover','pocketbook','docket','tablet','scroll','origami','indexcard','accordion','newspaper'):
            extras(g,root,m,spec)
    def cravat(g,root,m):
        if n<=10:orig_cravat(g,root,m)
        elif style in ('professor','librarian','journalist'):
            f.curve_tube(g,'Cloth_Free_Scarf',[[0,2.24,.43],[.13,2.10,.45],[.11,1.91,.50]],.056,m['warmwhite'],root)
        elif style=='explorer':
            f.curve_tube(g,'Explorer_Scarf',[[-.27,2.22,.38],[0,2.22,.51],[.29,2.18,.38]],.06,m['navy'],root)
    def weight_variant():
        data=orig_weighted()
        if n<=10:return data
        # Alternative book/scroll/card forms must not inherit the same long
        # butler coattails; trim indices at the end of the contiguous page.
        p,uv,tri,joints,weights,morphs=data
        nvertices=2*101*61+2*35*61
        return p[:nvertices],uv[:nvertices],tri[:99888],joints[:nvertices],weights[:nvertices],[(name,delta[:nvertices]) for name,delta in morphs]
    def animations_decorated(g,root,sheet,l,r,hips,mouth_node,eye_nodes):
        orig_animations(g,root,sheet,l,r,hips,mouth_node,eye_nodes)
        motion.augment(g,root,sheet,l,r,hips,mouth_node,form)
    def output_decorated(g,path):
        g.doc['asset']['generator']='Ask Bill 20 character roster - source-based study'
        g.doc.setdefault('extras',{})['billCharacter']={'id':f'bill-{n:02}','title':title,'form':form,'persona':persona,'visualStatus':'candidate-not-approved'}
        return orig_output(g,path)
    f.page=page_variant;f.top_wave=top_variant;f.paper_lapels=lapels;f.paper_cravat=cravat;f.material=mat_variant;f.weighted_page=weight_variant;f.animations=animations_decorated;GLB.output=output_decorated
    try:
        with tempfile.TemporaryDirectory() as tmp:
            face_path=None
            if n<=10:
                ref=Path(ref_dir)/f'original-{n:02}.jpg'
                if not ref.is_file():raise FileNotFoundError(str(ref))
                face_path=Path(tmp)/'face-aligned.jpg'
                fit_reference_crop(ref,face_path)
            data=f.build(str(output),str(face_path) if face_path else None)
    finally:
        f.page=orig_page;f.top_wave=orig_wave;f.paper_lapels=orig_lapels;f.paper_cravat=orig_cravat;f.material=orig_mat;f.weighted_page=orig_weighted;f.animations=orig_animations;GLB.output=orig_output
    data.update({'id':f'bill-{n:02}','name':title,'form':form,'style':color,'personality':persona,'reference':ORIGINAL_FILES.get(n), 'approved':False,'default':n==10,'version':'art-study-v4-motion-library'})
    return data

def main():
    ap=argparse.ArgumentParser()
    ap.add_argument('--originals',type=Path,help='Directory containing all ten original concept images; needed only to extract faces')
    ap.add_argument('--references',type=Path,default=THIS.parent/'reference')
    ap.add_argument('--output',type=Path,default=THIS.parent/'dist')
    ap.add_argument('--only',type=int,default=0,help='Build only a 1..20 option ID')
    ap.add_argument('--extract-references-only',action='store_true')
    args=ap.parse_args()
    if args.originals:extract_faces(args.originals,args.references)
    if args.extract_references_only: return
    args.output.mkdir(parents=True,exist_ok=True)
    entries=[]
    for spec in FRIENDLY:
        if args.only and args.only!=spec[0]:continue
        n=spec[0]
        entry=make(spec,args.output/f'bill-{n:02}.glb',args.references)
        print(n,entry['name'],entry['bytes'],'bytes',entry['sha256'][:14],flush=True)
        entries.append(entry)
    manifest={'schemaVersion':1,'owner':'Ask Bill','generation':'visual experiments; no auto-approval',
              'default':'bill-10','count':len(entries),'animationLibrary':'assets/bill/characters/animation-library.json',
              'characters':entries}
    (args.output/'manifest.json').write_text(json.dumps(manifest,indent=2,sort_keys=True)+'\n')
    print('Saved manifest',len(entries))
if __name__=='__main__':main()