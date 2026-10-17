"""Source-owned glTF2 animation library for every Ask Bill character.

This module adds real sampled node/quaternion, root-position, paper morph and
mouth-morph animation tracks to a rigged candidate, not just clip names.
All motions are in-place (application controls travel). Dance samples finish at
their starting pose; one-shot gestures settle at neutral. No sound is emitted.
"""
import json
import math
from pathlib import Path

SCHEMA=Path(__file__).resolve().parents[3]/'assets/bill/characters/animation-library.json'
PI=math.pi
SIN=math.sin
COS=math.cos


def library():
    data=json.loads(SCHEMA.read_text(encoding='utf-8'))
    clips=data['clips']
    if data['schemaVersion']!=1 or len(clips)!=33:
        raise ValueError('Unsupported Bill animation inventory')
    names=[c['name'] for c in clips]
    if len(names)!=len(set(names)) or 'DanceWaltz' not in names:
        raise ValueError('Missing or duplicate animation clips')
    return data


def q_axis(axis,angle):
    unit={'x':(1,0,0),'y':(0,1,0),'z':(0,0,1)}[axis]
    s=SIN(angle/2)
    return [unit[0]*s,unit[1]*s,unit[2]*s,COS(angle/2)]


def q_mul(a,b):
    x,y,z,w=a;u,v,t,k=b
    return [w*u+x*k+y*t-z*v,
            w*v-x*t+y*k+z*u,
            w*t+x*v-y*u+z*k,
            w*k-x*u-y*v-z*t]


def xyz(x,y,z):
    v=q_mul(q_mul(q_axis('z',z),q_axis('y',y)),q_axis('x',x))
    norm=math.sqrt(sum(q*q for q in v))
    return [q/norm for q in v]


def sample(name,u,scale):
    """Returns torso/arm/hip/translate/flutters for normalized clip time.

    Every dance uses a genuinely different choreography; amplitude is reduced
    for rigid books/tablets so their silhouettes remain legible.
    """
    a=2*PI*u
    b=2*a
    c=3*a
    envelope=SIN(PI*u)**2
    sx=sy=sz=lx=ly=lz=rx=ry=rz=hl=hr=tx=ty=tz=paper=tail=0.
    if name=='IdleLookAround':
        sy=.15*SIN(a)*envelope;sz=.035*SIN(b)*envelope
        lx=-.04*envelope;rx=.04*envelope
        tail=.04*envelope
    elif name=='IdlePaperFlutter':
        sx=.035*SIN(a)*envelope
        paper=.16*envelope;tail=.18*SIN(b)*envelope
        lx=-.055*envelope;rx=.055*envelope
    elif name=='IdleFootTap':
        hr=.23*abs(SIN(b))*envelope
        ty=.019*abs(SIN(b))*envelope
        sz=.025*SIN(a)*envelope
    elif name=='IdleStretch':
        lx=-.53*envelope;rx=.53*envelope;sx=-.07*envelope
        ty=.045*envelope;paper=.075*envelope
    elif name=='IdleInspect':
        sz=.07*SIN(a)*envelope;sy=-.07*envelope
        lx=-.21*envelope;tail=.025*SIN(b)*envelope
    elif name=='IdleYawn':
        sx=-.09*envelope;lx=-.17*envelope;rx=.17*envelope
        ty=.018*envelope;paper=.12*envelope
    elif name=='Think':
        sy=.10*SIN(a)*envelope;lx=-.21*envelope;rx=.12*envelope
        sz=.045*SIN(a)*envelope
    elif name=='Read':
        sx=.065*envelope;lx=-.13*envelope;rx=.11*envelope
        paper=.03*envelope
    elif name=='Nod':
        sx=.19*SIN(b)*envelope
    elif name=='ShakeHead':
        sy=.22*SIN(b)*envelope
    elif name=='Shrug':
        lx=-.32*envelope;rx=.32*envelope;ty=.035*envelope
        sx=-.04*envelope
    elif name=='Bow':
        sx=.33*envelope;lx=.12*envelope;rx=-.12*envelope
    elif name=='Greet':
        rz=-.58*envelope;ry=.12*SIN(b)*envelope
        sz=.055*envelope
    elif name=='Curious':
        sy=-.16*envelope;sz=.08*envelope
        paper=.045*envelope
    elif name=='Explain':
        lx=-.35*envelope;rx=.25*envelope
        sy=.06*SIN(b)*envelope;paper=.025*envelope
    elif name=='Surprised':
        sx=-.10*envelope;lx=-.23*envelope;rx=.23*envelope
        ty=.07*envelope;paper=.09*envelope
    elif name=='Cheer':
        lx=-.67*envelope;rx=.67*envelope
        ty=.12*envelope;hl=-.18*envelope;hr=.18*envelope
        paper=.11*envelope;tail=.16*envelope
    elif name=='DanceWaltz':
        # Gentle 3/4 sweeping ballroom sways, lightly turned shoulders.
        sz=.075*SIN(a);sy=.13*SIN(a);sx=.04*COS(a)
        lx=-.24+.14*SIN(a);rx=.24+.14*SIN(a)
        hl=.19*SIN(a);hr=-.19*SIN(a)
        tx=.10*SIN(a);ty=.035*(1-COS(b))/2
        paper=.04+.04*COS(a);tail=.075*SIN(a)
    elif name=='DanceSwing':
        # Swing kicks and generous opposing arm sweeps.
        sx=.08*SIN(b);sz=.06*SIN(a)
        lx=-.30*SIN(a);rx=.30*SIN(a)
        hl=.62*SIN(a);hr=-.62*SIN(a)
        ty=.095*abs(SIN(b));tx=.065*SIN(a)
        paper=.045*(1-COS(b));tail=.11*SIN(b)
    elif name=='DanceShuffle':
        # Side-step traveling in place with heel-toe shuffles.
        sz=.055*SIN(a);sy=.08*SIN(b)
        lx=.22*SIN(b);rx=-.22*SIN(b)
        hl=.33*SIN(b);hr=-.33*SIN(b)
        tx=.19*SIN(a);ty=.055*abs(SIN(b))
        paper=.035*(1-COS(b));tail=.10*SIN(a)
    elif name=='DanceTwist':
        # 1960s twisting torso: real yaw rotation, minimal leg travel.
        sy=.28*SIN(b);sz=.065*SIN(a)
        lx=-.14+.15*SIN(b);rx=.14-.15*SIN(b)
        hl=.16*SIN(b);hr=-.16*SIN(b)
        ty=.045*abs(SIN(b));tail=.06*SIN(b)
    elif name=='DanceDisco':
        # Alternating pointing-arm and tilted torso; not a walk loop.
        sy=.12*SIN(a);sz=.11*SIN(a)
        lx=-.72*(.5+.5*SIN(a));rx=.64*(.5-.5*SIN(a))
        hl=.27*SIN(b);hr=-.27*SIN(b)
        ty=.07*abs(SIN(b));paper=.06*(.5+.5*SIN(a))
        tail=.10*SIN(b)
    elif name=='DanceJig':
        # Quick skipping Irish-style jig with two separate hops per measure.
        sz=.055*SIN(b);sx=.065*SIN(b)
        lx=-.22+.12*SIN(b);rx=.22-.12*SIN(b)
        hl=.48*SIN(b);hr=-.48*SIN(b)
        ty=.15*abs(SIN(b));tx=.035*SIN(a)
        paper=.025*(1-COS(b));tail=.14*SIN(b)
    elif name=='DanceRobot':
        # Deliberately stepped, angular robot isolations and arm boxes.
        phase=int((u%1.)*8)
        poses=[(0,0,0,0),(.26,-.05,.13,-.1),(.26,.2,.13,.32),(-.12,.2,-.20,.32),
               (-.12,-.25,-.20,-.25),(.19,-.25,.3,-.25),(.19,.05,.3,.05),(0,0,0,0)]
        yaw,lean,armleft,armright=poses[phase]
        sy=yaw;sz=lean;lx=armleft;rx=armright
        hl=(.22 if phase in (1,2,5) else 0)
        hr=(-.22 if phase in (3,4,6) else 0)
        tx=.045*(1 if phase in (2,3) else -1 if phase in (4,5) else 0)
        ty=.04 if phase in (2,5) else 0
        paper=.02 if phase%2 else 0
    elif name=='DanceSalsa':
        # Syncopated Latin-influenced steps, fluid rolling shoulder motion.
        sy=.18*SIN(a);sz=.082*SIN(b)
        lx=-.25*SIN(a+.55);rx=.25*SIN(a-.6)
        hl=.40*SIN(a+.7);hr=-.40*SIN(a-.7)
        tx=.13*SIN(a);ty=.065*abs(SIN(c))
        paper=.035*(1-COS(b));tail=.085*SIN(a-.5)
    else:raise ValueError('Unknown Bill choreography '+name)
    # Preserve model origin and no accidental runaway choreography.
    return {'torso':(scale*sx,scale*sy,scale*sz),
            'left':(scale*lx,scale*ly,scale*lz),
            'right':(scale*rx,scale*ry,scale*rz),
            'hips':(scale*hl,scale*hr),
            'translation':(scale*tx,scale*ty,scale*tz),
            'paper':max(0.,min(.27,paper)),
            'tail':scale*tail}


def augment(g,root,sheet,l,r,hips,mouth_node,form):
    data=library()
    current={a['name'] for a in g.doc['animations']}
    base=[c for c in data['clips'] if c['name'] in current]
    if len(base)!=8 or len(hips)!=2:raise ValueError('Bill base rig/clips are missing')
    if {c['name'] for c in data['clips'][:8]}!=current:
        raise ValueError('Legacy animation compatibility regression')
    for clip in data['clips'][8:]:
        name=clip['name'];dur=clip['durationSeconds']
        count=32 if clip['category']=='dance' else 20
        times=[dur*i/count for i in range(count+1)]
        factor=.72 if form in ('hardcover','pocketbook','tablet','docket') else (1.06 if form=='origami' else .90 if form=='scroll' else 1.0)
        samples=[sample(name,i/count,factor) for i in range(count+1)]
        if not clip['loop']: # fade to rest at both ends, already sampled with sin(pi*u)^2
            pass
        elif name=='DanceRobot': # robot has a hard-cut pose; explicit identical last/first
            samples[-1]=samples[0]
        tracks=[
            (root,'rotation',times,[xyz(*p['torso']) for p in samples],'VEC4'),
            (root,'translation',times,[list(p['translation']) for p in samples],'VEC3'),
            (l,'rotation',times,[xyz(p['left'][1],p['left'][2],p['left'][0]) for p in samples],'VEC4'),
            (r,'rotation',times,[xyz(p['right'][1],p['right'][2],p['right'][0]) for p in samples],'VEC4'),
            (hips[0],'rotation',times,[xyz(p['hips'][0],0,0) for p in samples],'VEC4'),
            (hips[1],'rotation',times,[xyz(p['hips'][1],0,0) for p in samples],'VEC4'),
            (sheet,'weights',times,[[p['paper'],abs(p['tail'])] for p in samples],'SCALAR')
        ]
        # Readable yawn and surprise mouth expressions are actual morph drivers.
        if name in ('IdleYawn','Surprised'):
            size=len(g.doc['meshes'][g.doc['nodes'][mouth_node]['mesh']]['weights'])
            values=[]
            for u in range(count+1):
                frame=[0.]*size
                frame[4 if name=='IdleYawn' else 1]=.58*(SIN(PI*u/count)**2)
                values.extend([[v] for v in frame])
            tracks.append((mouth_node,'weights',times,values,'SCALAR'))
        g.animation(name,tracks)
    actual={a['name'] for a in g.doc['animations']}
    expected={c['name'] for c in data['clips']}
    if actual!=expected:raise ValueError('Exported clips do not match library: '+repr(expected-actual))
    g.doc.setdefault('extras',{})['billAnimationLibrary']={
        'schemaVersion':data['schemaVersion'],
        'clipCount':len(actual),
        'danceCount':sum(c['category']=='dance' for c in data['clips']),
        'allClipsInPlace':True,
        'idleSafety':'consumer-controlled; no audio or automatic camera input'
    }
