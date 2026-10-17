"""True exported-GLB choreography checks for 20 Bills and all eight dances."""
import hashlib
import json
import math
import struct
import unittest
from pathlib import Path

from test_roster import ROOT, DIST, read_glb, LIBRARY


def samples(raw,document,index):
    accessor=document['accessors'][index]
    view=document['bufferViews'][accessor['bufferView']]
    stride={'SCALAR':1,'VEC2':2,'VEC3':3,'VEC4':4}[accessor['type']]
    assert accessor['componentType']==5126
    binary_start=20+struct.unpack_from('<I',raw,12)[0]+8
    start=binary_start+view.get('byteOffset',0)+accessor.get('byteOffset',0)
    size=accessor['count']*stride
    vals=struct.unpack_from('<'+'f'*size,raw,start)
    return [vals[i:i+stride] for i in range(0,size,stride)]


def traces(raw,d,anim):
    result={}
    for channel in anim['channels']:
        node=d['nodes'][channel['target']['node']]['name']
        path=channel['target']['path']
        sampler=anim['samplers'][channel['sampler']]
        if path=='weights':
            # Flattened two-morph arrays are read as individual scalar frames.
            mesh_idx=d['nodes'][channel['target']['node']]['mesh']
            components=len(d['meshes'][mesh_idx]['primitives'][0]['targets'])
            flat=[v[0] for v in samples(raw,d,sampler['output'])]
            values=[tuple(flat[i:i+components]) for i in range(0,len(flat),components)]
        else:
            values=samples(raw,d,sampler['output'])
        result[(node,path)]=(samples(raw,d,sampler['input']),values)
    return result


class AnimationContract(unittest.TestCase):
    def test_spec_safe_names_priorities_and_no_audio(self):
        clips=LIBRARY['clips']
        names=[c['name'] for c in clips]
        self.assertEqual(len(names),len(set(names)))
        self.assertEqual(len(names),33)
        self.assertEqual(names[:8],['Idle','WalkFunny','Talk','Wave','Point','Laugh','Celebrate','Look'])
        self.assertEqual(len([x for x in clips if x['category']=='dance']),8)
        self.assertGreaterEqual(len([x for x in clips if x['category']=='ambient' and x['autoIdle']]),5)
        self.assertFalse(LIBRARY['policy']['noAutoplayAudio'] is False)
        self.assertTrue(all(x['durationSeconds']>0 and x['motionTier'] in (0,1,2,3) for x in clips))
        self.assertEqual(set(LIBRARY['policy']['interruptOn']),{
            'pointer','keyboard','touch','focus','selection','question','speech',
            'visibilitychange','pause','reduced-motion'
        })

    def test_all_twenty_glbs_have_complete_animation_inventory(self):
        expected={c['name'] for c in LIBRARY['clips']}
        for i in range(1,21):
            name=f'bill-{i:02}'
            with self.subTest(name=name):
                raw,d=read_glb(DIST/(name+'.glb'))
                self.assertEqual({a['name'] for a in d['animations']},expected)
                self.assertEqual(d['extras']['billAnimationLibrary']['danceCount'],8)
                self.assertEqual(d['extras']['billAnimationLibrary']['clipCount'],33)
                self.assertGreaterEqual(len(d['skins']),1)
                self.assertTrue(any(n['name']=='Rig_Hip_L' for n in d['nodes']))
                self.assertTrue(any(n['name']=='Rig_Shoulder_R' for n in d['nodes']))

    def test_eight_dances_have_distinct_active_rig_trajectories_and_seamless_loops(self):
        dance=[x for x in LIBRARY['clips'] if x['category']=='dance']
        for i in (1,10,12,14,19,20):
            name=f'bill-{i:02}'
            raw,d=read_glb(DIST/(name+'.glb'))
            anims={a['name']:a for a in d['animations']}
            signatures=set()
            for desc in dance:
                with self.subTest(model=name,dance=desc['name']):
                    tracks=traces(raw,d,anims[desc['name']])
                    self.assertGreaterEqual(len(tracks),7)
                    self.assertIn(('Bill_Root','translation'),tracks)
                    self.assertIn(('Bill_Root','rotation'),tracks)
                    for joint in ('Rig_Shoulder_L','Rig_Shoulder_R','Rig_Hip_L','Rig_Hip_R'):
                        self.assertIn((joint,'rotation'),tracks)
                    root_time,root_values=tracks[('Bill_Root','translation')]
                    self.assertEqual(len(root_time),33)
                    self.assertAlmostEqual(root_time[-1][0],desc['durationSeconds'],places=4)
                    for key,(times,values) in tracks.items():
                        self.assertEqual(len(times),len(values),key)
                        self.assertTrue(all(times[j][0]<times[j+1][0] for j in range(len(times)-1)))
                        self.assertTrue(all(math.isfinite(x) for value in values for x in value))
                        for a,b in zip(values[0],values[-1]):
                            self.assertAlmostEqual(a,b,places=5,msg=f'Seam discontinuity {name} {desc["name"]} {key}')
                    for value in root_values:
                        self.assertLess(abs(value[0]),.3)
                        self.assertLess(abs(value[1]),.3)
                    sig=hashlib.sha256(repr([
                        (node,path,tuple(round(v,3) for frame in values for v in frame))
                        for (node,path),(_,values) in sorted(tracks.items())
                    ]).encode()).hexdigest()
                    signatures.add(sig)
                    self.assertTrue(any(any(abs(q)>0.03 for q in frame[:3])
                                    for (_,path),(_,vals) in tracks.items() if path=='rotation' for frame in vals))
            self.assertEqual(len(signatures),len(dance),'Dance names must not alias the same choreography')

    def test_idle_gestures_are_true_motion_and_not_only_clip_labels(self):
        raw,d=read_glb(DIST/'bill-10.glb')
        anims={a['name']:a for a in d['animations']}
        for clip in [x for x in LIBRARY['clips'] if x['category']=='ambient' and x['name']!='Idle']:
            with self.subTest(clip=clip['name']):
                tracks=traces(raw,d,anims[clip['name']])
                self.assertGreaterEqual(len(tracks),7)
                trajectory=[values for key,(_,values) in tracks.items() if key[1] in ('translation','rotation','weights')]
                self.assertTrue(any(len(set(values))>1 for values in trajectory))
                self.assertIn(('SingleSheet_Body','weights'),tracks)

    def test_existing_walk_and_speech_not_overwritten(self):
        raw,d=read_glb(DIST/'bill-10.glb')
        names={a['name']:a for a in d['animations']}
        walk=traces(raw,d,names['WalkFunny'])
        talk=traces(raw,d,names['Talk'])
        self.assertIn(('Rig_Hip_L','rotation'),walk)
        self.assertIn(('Expression_Mouth','weights'),talk)
        self.assertNotIn(('Expression_Mouth','weights'),walk)


if __name__=='__main__':
    unittest.main()
