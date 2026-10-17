"""Portable 20-GLB audition packaging, integrity and secure localhost tests."""
import hashlib
import json
from pathlib import Path
import re
import shutil
import subprocess
import sys
import tempfile
import time
import unittest
from urllib.request import urlopen
from zipfile import ZipFile

ROOT=Path(__file__).resolve().parents[2]
SCRIPT=ROOT/'scripts/package-character-audition.py'


class CharacterKit(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.folder=tempfile.TemporaryDirectory()
        cls.zipfile=Path(cls.folder.name)/'AskBill-20-Walking-Lab.zip'
        subprocess.run([sys.executable,str(SCRIPT),'--output',str(cls.zipfile)],cwd=ROOT,
                       check=True,capture_output=True,timeout=120)
        cls.z=ZipFile(cls.zipfile)
        cls.entries={i.filename:i for i in cls.z.infolist()}
        cls.meta=json.loads(cls.z.read('bundle-manifest.json'))

    @classmethod
    def tearDownClass(cls):
        cls.z.close();cls.folder.cleanup()

    def test_complete_working_gallery_not_just_glb_file_names(self):
        assert self.meta['modelCount']==20
        self.assertEqual(self.meta['default'],'bill-10')
        self.assertFalse(self.meta['approvedForProduction'])
        files=[f'assets/bill/characters/dist/bill-{i:02}.glb' for i in range(1,21)]
        self.assertTrue(all(p in self.entries for p in files))
        for p in ['assets/bill/characters/animation-library.json','apps/web/preview/compare.html','apps/web/preview/compare.js',
                  'apps/web/preview/characters.html','apps/web/preview/characters.js',
                  'packages/character/attention/option10-controller.cjs',
                  'packages/character/animation/idle-director.mjs',
                  'packages/character/gallery/shortlist.mjs',
                  'start_audition.py','START-MAC.command','START-WINDOWS.bat','README-FIRST.md']:
            self.assertIn(p,self.entries)

    def test_manifest_hashes_every_binary_and_review_surface(self):
        assets=self.meta['assets']
        for name,entry in assets.items():
            with self.subTest(name=name):
                content=self.z.read(name)
                self.assertEqual(hashlib.sha256(content).hexdigest(),entry['sha256'])
                self.assertEqual(len(content),entry['bytes'])
        for model in self.meta['models']:
            self.assertEqual(model['animationCount'],33)
            self.assertGreater(model['meshCount'],15)
            path='assets/bill/characters/dist/'+model['id']+'.glb'
            self.assertEqual(self.z.read(path)[:4],b'glTF')
            self.assertEqual(hashlib.sha256(self.z.read(path)).hexdigest(),model['sha256'])

    def test_no_traversal_symlinks_sensitive_source_or_hidden_data(self):
        for name,info in self.entries.items():
            self.assertFalse(name.startswith('/'))
            self.assertNotIn('..',Path(name).parts)
            # Files only, never symlink entries.
            self.assertNotEqual(info.external_attr>>28,0xa)
            self.assertFalse(any(x in name.lower() for x in
                ['.env','credentials','secret','private','node_modules','.git/','pg_dump']))
        self.assertEqual(len(self.entries),len(set(self.entries)))
        self.assertLess(self.zipfile.stat().st_size,150_000_000)
        self.assertNotIn('https://api.openai.com',self.z.read('apps/web/preview/compare.js').decode())

    def test_reproducible_zip_sha(self):
        second=Path(self.folder.name)/'copy.zip'
        subprocess.run([sys.executable,str(SCRIPT),'--output',str(second)],cwd=ROOT,
                       check=True,capture_output=True,timeout=120)
        self.assertEqual(hashlib.sha256(self.zipfile.read_bytes()).hexdigest(),
                         hashlib.sha256(second.read_bytes()).hexdigest())

    def test_extracted_server_only_local_and_serves_genuine_binary(self):
        with tempfile.TemporaryDirectory() as temp:
            self.z.extractall(temp)
            process=subprocess.Popen([sys.executable,'start_audition.py','--no-browser'],
                                     cwd=temp,stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True)
            try:
                line=process.stdout.readline().strip()
                match=re.search(r'http://127\.0\.0\.1:\d+',line)
                self.assertIsNotNone(match,line)
                origin=match.group()
                with urlopen(origin+'/apps/web/preview/compare.html',timeout=5) as r:
                    self.assertEqual(r.status,200)
                    self.assertIn('frame-ancestors',r.headers['Content-Security-Policy'])
                    self.assertIn('Bill Walk-off Lab',r.read().decode())
                with urlopen(origin+'/assets/bill/characters/dist/bill-10.glb',timeout=5) as r:
                    self.assertEqual(r.headers.get_content_type(),'model/gltf-binary')
                    self.assertEqual(r.read(4),b'glTF')
            finally:
                process.terminate()
                try:process.communicate(timeout=5)
                except subprocess.TimeoutExpired:process.kill();process.communicate()


if __name__=='__main__':unittest.main(verbosity=2)
