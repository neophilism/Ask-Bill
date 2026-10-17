"""Twenty real GLB file acceptance checks, not a claim of aesthetic approval."""
import argparse,hashlib,json,struct,subprocess,sys,tempfile,unittest
from pathlib import Path
ROOT=Path(__file__).resolve().parents[2]
DIST=ROOT/'assets/bill/characters/dist';REFS=ROOT/'assets/bill/characters/reference'
NAMES={'Idle','WalkFunny','Talk','Wave','Point','Laugh','Celebrate','Look'}

def read_glb(path):
    raw=Path(path).read_bytes()
    if raw[:4]!=b'glTF':raise ValueError('Invalid glTF header')
    if len(raw)!=struct.unpack_from('<I',raw,8)[0]:raise ValueError('Wrong length')
    v=struct.unpack_from('<I',raw,4)[0]
    if v!=2:raise ValueError('Only binary glTF2 accepted')
    js_len,ctype=struct.unpack_from('<I4s',raw,12)
    if ctype!=b'JSON':raise ValueError('Missing JSON first chunk')
    d=json.loads(raw[20:20+js_len])
    pos=20+js_len
    bin_len,btype=struct.unpack_from('<I4s',raw,pos)
    if btype!=b'BIN\0':raise ValueError('Missing BIN second chunk')
    if pos+8+bin_len!=len(raw):raise ValueError('Trailing or truncated bytes')
    for view in d['bufferViews']:
        if view.get('byteOffset',0)+view['byteLength']>bin_len:raise ValueError('Buffer out of bounds')
    return raw,d

class Roster(unittest.TestCase):
    @classmethod
    def setUpClass(cls):cls.data=json.loads((DIST/'manifest.json').read_text())
    def test_exactly_twenty_distinct_glbs(self):
        items=self.data['characters'];self.assertEqual(len(items),20)
        ids=[x['id'] for x in items];self.assertEqual(ids,[f'bill-{i:02}' for i in range(1,21)])
        self.assertEqual(len({x['sha256'] for x in items}),20)
        self.assertEqual(self.data['default'],'bill-10')
    def test_every_candidate_is_structurally_animated_and_has_visemes(self):
        for item in self.data['characters']:
            with self.subTest(item=item['id']):
                path=DIST/(item['id']+'.glb');raw,d=read_glb(path)
                self.assertEqual(len(raw),item['bytes'])
                self.assertEqual(hashlib.sha256(raw).hexdigest(),item['sha256'])
                self.assertEqual(set(a['name'] for a in d['animations']),NAMES)
                self.assertTrue(d['skins']);self.assertTrue(d['nodes']);self.assertGreater(len(d['meshes']),15)
                self.assertEqual(d['extras']['billCharacter']['id'],item['id'])
                self.assertGreaterEqual(len(next(m for m in d['meshes'] if m['name']=='MouthVisemes')['primitives'][0]['targets']),12)
                self.assertFalse(item['approved'])
                for a in d['animations']:
                    self.assertGreaterEqual(len(a['channels']),1)
                    for c in a['channels']:
                        self.assertLess(c['target']['node'],len(d['nodes']))
    def test_reference_art_sources_documented(self):
        for item in self.data['characters'][:10]:
            self.assertTrue(item['reference']);self.assertTrue((REFS/(item['id'].replace('bill-','original-')+'.jpg')).is_file())
        for item in self.data['characters'][10:]:
            self.assertIsNone(item['reference'])
    def test_multiple_real_forms_and_independent_personas(self):
        forms={x['form'] for x in self.data['characters']}
        self.assertGreaterEqual(len(forms),9)
        self.assertIn('scroll',forms);self.assertIn('hardcover',forms);self.assertIn('tablet',forms)
        self.assertEqual(len({x['personality'] for x in self.data['characters']}),20)
    def test_candidate_consistent_rebuild(self):
        with tempfile.TemporaryDirectory() as temp:
            p=Path(temp)
            for n in (1,10,12,19):
                subprocess.run([sys.executable,str(ROOT/'tools/blender/roster/generate_roster.py'),'--only',str(n),
                                '--references',str(REFS),'--output',str(p)],check=True,capture_output=True)
                b=(p/f'bill-{n:02}.glb').read_bytes()
                expected=self.data['characters'][n-1]['sha256']
                self.assertEqual(hashlib.sha256(b).hexdigest(),expected)
    def test_outside_bodies_must_not_inherit_butler_tails(self):
        original,_=read_glb(DIST/'bill-10.glb')
        other,_=read_glb(DIST/'bill-12.glb')
        self.assertLess(len(other),len(original))

if __name__=='__main__':unittest.main(verbosity=2)