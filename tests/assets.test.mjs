import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,rm,symlink} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {validateAssetManifest,AssetError} from '../tools/assets/verify.mjs';
const sourceRoot=new URL('../',import.meta.url);
const original=JSON.parse(await readFile(new URL('../assets/manifest.json',import.meta.url),'utf8'));
async function withFixture(run){
 const root=await mkdtemp(join(tmpdir(),'askbill-assets-'));
 try{await mkdir(join(root,'assets/test'),{recursive:true});
  await writeFile(join(root,'assets/test/source.txt'),await readFile(new URL('../assets/test/source.txt',import.meta.url)));
  await writeFile(join(root,'assets/manifest.json'),JSON.stringify(original));
  await run(root);
 }finally{await rm(root,{recursive:true,force:true});}
}
async function overwriteManifest(root,change){const manifest=structuredClone(original);change(manifest);await writeFile(join(root,'assets/manifest.json'),JSON.stringify(manifest));}
const rejected=(code,run)=>assert.rejects(run,e=>e instanceof AssetError&&e.code===code);
test('manifest verifies immutable bytes and original Ask Bill ownership',async()=>{
 const result=await validateAssetManifest();
 assert.equal(result.owner,'Ask Bill');assert.equal(result.assetsVerified,1);
 assert.equal(result.assets[0].id,'verification-fixture');
 assert.equal(result.characterAccepted,false);
});
test('mismatched, absent, and symlinked assets fail closed',async()=>withFixture(async root=>{
 await overwriteManifest(root,m=>{m.entries[0].sha256='0'.repeat(64)});
 await rejected('ASSET_HASH_MISMATCH',()=>validateAssetManifest({root}));
 await overwriteManifest(root,m=>{m.entries[0].bytes=1});
 await rejected('ASSET_SIZE_MISMATCH',()=>validateAssetManifest({root}));
 await overwriteManifest(root,m=>{m.entries[0].path='assets/test/missing.txt'});
 await rejected('ASSET_MISSING',()=>validateAssetManifest({root}));
 await overwriteManifest(root,m=>{m.entries[0].path='assets/test/source.txt'});
 await rm(join(root,'assets/test/source.txt'));
 await symlink('/etc/passwd',join(root,'assets/test/source.txt'));
 await rejected('ASSET_NOT_REGULAR',()=>validateAssetManifest({root}));
}));
test('path traversal and unauthorized remote URLs are rejected',async()=>withFixture(async root=>{
 await overwriteManifest(root,m=>{m.entries[0].path='assets/../secrets.env'});
 await rejected('UNSAFE_ASSET_PATH',()=>validateAssetManifest({root}));
 await overwriteManifest(root,m=>{m.entries[0].path='assets/test/source.txt';m.entries[0].storage='versioned-store';m.entries[0].url='http://localhost/x.glb'});
 await rejected('INVALID_ASSET_URL',()=>validateAssetManifest({root}));
 await overwriteManifest(root,m=>{m.entries[0].storage='versioned-store';m.entries[0].url='https://unknown.example/object';});
 await rejected('ASSET_HOST_NOT_ALLOWED',()=>validateAssetManifest({root}));
 await overwriteManifest(root,m=>{m.entries[0].storage='repository';m.entries[0].url=undefined;m.entries[0].id='unlicensed';m.entries[0].license='';});
 await rejected('ASSET_OWNERSHIP_MISSING',()=>validateAssetManifest({root}));
}));
test('character-release gate cannot pass with a test fixture instead of Bill assets',async()=>{
 await rejected('CHARACTER_ASSET_MISSING',()=>validateAssetManifest({requireCharacter:true}));
});
