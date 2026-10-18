"""Dependency-free adversarial asset checks for Option 10 GLB blockout."""
import hashlib
import json
from pathlib import Path
import struct
import sys
import tempfile
import unittest

ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'tools'/'blender'))
sys.path.insert(0,str(ROOT/'tools'/'blender'/'mesh'))
from generate_bill import build
from audit_glb import audit, load_glb
from stress_glb import run as stress_run, stress_primitive


def parse(data):
    if len(data)<28 or data[:4]!=b'glTF':raise ValueError('not glTF')
    _,version,total=struct.unpack_from('<4sII',data)
    if version!=2 or total!=len(data):raise ValueError('bad header')
    sl,st=struct.unpack_from('<I4s',data,12)
    if st!=b'JSON':raise ValueError('JSON first')
    doc=json.loads(data[20:20+sl]);off=20+sl
    sz,binType=struct.unpack_from('<I4s',data,off)
    if binType!=b'BIN\x00':raise ValueError('BIN second')
    payload=data[off+8:off+8+sz]
    if len(payload)!=sz:raise ValueError('truncated BIN')
    return doc,payload


def accessor_bytes(doc,payload,index):
    a=doc['accessors'][index];v=doc['bufferViews'][a['bufferView']]
    unit={5126:4,5125:4,5123:2}[a['componentType']]
    cols={'SCALAR':1,'VEC2':2,'VEC3':3,'VEC4':4,'MAT4':16}[a['type']]
    start=v['byteOffset']+a.get('byteOffset',0);size=a['count']*unit*cols
    if start%unit:raise ValueError('unaligned accessor')
    if size>v['byteLength'] or start+size>len(payload):raise ValueError('out of bounds accessor')
    return payload[start:start+size]


class TestOption10(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        with tempfile.TemporaryDirectory() as d:
            p=Path(d)/'candidate.glb';cls.meta=build(p);cls.data=p.read_bytes();cls.doc,cls.bin=parse(cls.data)

    def test_glb_headers_and_immutable_buffer_bounds(self):
        for i in range(len(self.doc['accessors'])):self.assertTrue(accessor_bytes(self.doc,self.bin,i))
        self.assertEqual(self.meta['sha256'],hashlib.sha256(self.data).hexdigest())
        self.assertEqual(self.doc['asset']['version'],'2.0')
        self.assertLess(len(self.data),2_000_000)

    def test_one_page_not_two_cylinders(self):
        folio=[x for x in self.doc['meshes'] if x['name']=='ONE_CONTINUOUS_FOLIO_PARCHMENT']
        self.assertEqual(len(folio),1)
        prim=folio[0]['primitives'][0]
        self.assertIn('JOINTS_0',prim['attributes'])
        self.assertIn('WEIGHTS_0',prim['attributes'])
        self.assertEqual(len(prim['targets']),2)
        self.assertEqual(len(self.doc['skins'][0]['joints']),3)
        self.assertFalse(any('curl' in m['name'].lower() for m in self.doc['meshes'] if m!=folio[0]))

    def test_all_expected_solid_primitives_are_watertight_and_outward(self):
        with tempfile.TemporaryDirectory() as directory:
            path=Path(directory)/'candidate.glb'
            build(path)
            report=audit(*load_glb(path))
        self.assertTrue(report['passesStructuralAudit'],report['problems'])
        solids=[m for m in report['meshes'] if m['mesh']!='MouthWithVisemes']
        self.assertTrue(solids)
        for mesh in solids:
            self.assertEqual(mesh['boundaryEdges'],0,mesh['mesh'])
            self.assertEqual(mesh['misorientedEdges'],0,mesh['mesh'])
            self.assertGreater(mesh['signedVolume'],0,mesh['mesh'])

    def test_page_compression_and_extreme_mouth_preserve_triangle_orientation(self):
        with tempfile.TemporaryDirectory() as directory:
            path=Path(directory)/'candidate.glb'
            build(path)
            stress=stress_run(path)
            doc,data=load_glb(path)
        self.assertTrue(stress['passesNumericalStress'],stress['cases'])
        self.assertFalse(stress['visualAndJointClearanceVerified'])
        collapsed=stress_primitive(doc,data,'ONE_CONTINUOUS_FOLIO_PARCHMENT',{},0)
        self.assertFalse(collapsed['passesNumericalStress'])
        with self.assertRaises(ValueError):
            stress_primitive(doc,data,'MouthWithVisemes',{'unknown_viseme':1})

    def test_elbows_knees_and_eyelids_have_independent_controls(self):
        nodes=self.doc['nodes']
        by_name={node['name']:i for i,node in enumerate(nodes)}
        for side in ('L','R'):
            shoulder=nodes[by_name['Rig_Shoulder_'+side]]
            elbow=by_name['Rig_Elbow_'+side]
            self.assertIn(elbow,shoulder['children'])
            self.assertIn(by_name['Paper_Forearm_'+side],nodes[elbow]['children'])
            self.assertIn(by_name['Glove_'+side],nodes[elbow]['children'])
            hip=nodes[by_name['Rig_Hip_'+side]]
            knee=by_name['Rig_Knee_'+side]
            self.assertIn(knee,hip['children'])
            self.assertIn(by_name['Paper_Shin_'+side],nodes[knee]['children'])
            self.assertIn(by_name['Rig_Shoe_'+side],nodes[knee]['children'])
        for eye in ('0','1'):
            eye_node=nodes[by_name['Rig_Eye_'+eye]]
            lid=by_name['Rig_Eyelid_'+eye]
            self.assertIn(lid,eye_node['children'])
            self.assertIn(by_name['Upper_Eyelid_'+eye],nodes[lid]['children'])

    def test_eight_action_clips_genuine_channels(self):
        found={a['name'] for a in self.doc['animations']}
        self.assertEqual(found,{'Idle','WalkFunny','Talk','Wave','Point','Laugh','Celebrate','Look'})
        for anim in self.doc['animations']:
            self.assertTrue(anim['channels'])
            for chan in anim['channels']:
                sampler=anim['samplers'][chan['sampler']]
                ain=self.doc['accessors'][sampler['input']];aout=self.doc['accessors'][sampler['output']]
                self.assertGreaterEqual(ain['count'],2)
                self.assertEqual(ain['type'],'SCALAR')
                count=ain['count']
                if chan['target']['path']=='weights':
                    idx=self.doc['nodes'][chan['target']['node']]['mesh']
                    count*=len(self.doc['meshes'][idx]['primitives'][0]['targets'])
                self.assertEqual(aout['count'],count)

    def test_visemes_are_real_morph_offsets(self):
        m=[m for m in self.doc['meshes'] if m['name']=='MouthWithVisemes']
        self.assertEqual(len(m),1)
        self.assertGreaterEqual(len(m[0]['primitives'][0]['targets']),12)
        self.assertIn('viseme_AA',m[0]['extras']['targetNames'])
        self.assertIn('viseme_MBP',m[0]['extras']['targetNames'])
        a=m[0]['primitives'][0]['targets'][1]['POSITION']
        self.assertNotEqual(accessor_bytes(self.doc,self.bin,a),b'\x00'*len(accessor_bytes(self.doc,self.bin,a)))

    def test_skin_weights_normalized_joint_references_safe(self):
        folio=next(m for m in self.doc['meshes'] if m['name'].startswith('ONE_CONTINUOUS'))
        attrs=folio['primitives'][0]['attributes']
        joints=accessor_bytes(self.doc,self.bin,attrs['JOINTS_0'])
        weights=accessor_bytes(self.doc,self.bin,attrs['WEIGHTS_0'])
        for i in range(0,len(weights),16):
            values=struct.unpack_from('<4f',weights,i)
            self.assertAlmostEqual(sum(values),1,places=5)
            self.assertTrue(all(0<=v<=1 for v in values))
        self.assertTrue(all(j<3 for j in struct.unpack('<'+'H'*(len(joints)//2),joints)))

    def test_build_identical_twice(self):
        with tempfile.TemporaryDirectory() as d:
            result=build(Path(d)/'another.glb')
        self.assertEqual(result['sha256'],self.meta['sha256'])

    def test_truncation_and_bad_header_rejected(self):
        with self.assertRaises(ValueError):parse(self.data[:-1])
        with self.assertRaises(ValueError):parse(b'NOPE'+self.data[4:])
        with self.assertRaises(ValueError):parse(self.data[:2])


if __name__=='__main__':unittest.main()

