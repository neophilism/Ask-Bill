import { readFile, realpath, lstat } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const projectRoot = fileURLToPath(new URL('../../', import.meta.url));
const allowedKinds=new Set(['test','source-blend','runtime-glb','poster','texture','preview','license']);
const hex=/^[a-f0-9]{64}$/;
const isInside=(root,path)=>path===root || path.startsWith(root+sep);
export class AssetError extends Error {constructor(code,message){super(message);this.code=code;this.name='AssetError';}}
const reject=(code,message)=>{throw new AssetError(code,message);};
export async function validateAssetManifest({root=projectRoot,manifestPath='assets/manifest.json',requireCharacter=false,allowedAssetHosts=[]}={}) {
  const base=resolve(root);
  if(!manifestPath.startsWith('assets/') || manifestPath.includes('..'))reject('INVALID_MANIFEST_PATH','Manifest must remain within assets/');
  const obj=JSON.parse(await readFile(resolve(base,manifestPath),'utf8'));
  if(!obj || obj.schemaVersion!==1 || obj.owner!=='Ask Bill' || obj.storagePolicy!=='immutable-hash-addressed' || !Array.isArray(obj.entries) || obj.entries.length>300)
    reject('INVALID_ASSET_MANIFEST','Manifest identity, version or entry count invalid');
  const seen=new Set();
  const hashes=[];
  for(const entry of obj.entries){
    if(!entry || typeof entry!=='object' || Array.isArray(entry))reject('INVALID_ASSET_ENTRY','Entry must be an object');
    const keys=new Set(['id','kind','path','storage','sha256','bytes','license','attribution','requiredForRelease','url']);
    for(const key of Object.keys(entry))if(!keys.has(key))reject('INVALID_ASSET_FIELD','Unknown asset entry field');
    if(typeof entry.id!=='string'||!/^[-a-z0-9]{1,80}$/.test(entry.id)||seen.has(entry.id))reject('DUPLICATE_ASSET_ID','Invalid or duplicate ID');
    seen.add(entry.id);
    if(!allowedKinds.has(entry.kind))reject('INVALID_ASSET_KIND','Unrecognized asset kind');
    if(typeof entry.path!=='string'||!/^assets\/[a-zA-Z0-9_./-]{1,250}$/.test(entry.path)||entry.path.includes('..')||entry.path.includes('//'))reject('UNSAFE_ASSET_PATH','Asset path must be safe and relative');
    if(!['repository','versioned-store'].includes(entry.storage))reject('INVALID_STORAGE_POLICY','Storage must be repository or immutable store');
    if(entry.storage==='versioned-store'){
      let u;
      try{u=new URL(entry.url);}catch{reject('INVALID_ASSET_URL','Stored asset requires a URL');}
      if(u.protocol!=='https:' || u.username || u.password || u.hash || !u.hostname || /^(?:localhost|127\.|10\.|192\.168\.|169\.254\.|172\.(?:1[6-9]|2\d|3[01])\.|\[::1\])/.test(u.hostname))reject('INVALID_ASSET_URL','Asset retrieval must use public HTTPS');
      if(!allowedAssetHosts.includes(u.hostname))reject('ASSET_HOST_NOT_ALLOWED','Remote asset host must be explicitly approved');
    } else if(entry.url!==undefined)reject('INVALID_ASSET_URL','Repository asset cannot specify remote URL');
    if(typeof entry.sha256!=='string'||!hex.test(entry.sha256)||!Number.isSafeInteger(entry.bytes)||entry.bytes<1||entry.bytes>1000000000)reject('INVALID_ASSET_HASH','Invalid content digest or size');
    if(typeof entry.license!=='string'||entry.license.length<2||entry.license.length>100||typeof entry.attribution!=='string'||!entry.attribution.trim()||entry.attribution.length>200||typeof entry.requiredForRelease!=='boolean')reject('ASSET_OWNERSHIP_MISSING','Asset ownership and license must be documented');
    if(entry.kind==='source-blend'&&!entry.path.endsWith('.blend') || entry.kind==='runtime-glb'&&!entry.path.endsWith('.glb'))reject('INVALID_ASSET_EXTENSION','Runtime and editable source extensions are fixed');
    const file=resolve(base,entry.path);
    if(!isInside(resolve(base,'assets'),file))reject('UNSAFE_ASSET_PATH','Asset path escapes repository assets directory');
    let stat;
    try{stat=await lstat(file);}catch{reject('ASSET_MISSING',`Asset not materialized: ${entry.id}`);}
    if(!stat.isFile())reject('ASSET_NOT_REGULAR','Asset cannot be a directory or symlink');
    const resolved=await realpath(file);
    if(!isInside(resolve(base,'assets'),resolved))reject('UNSAFE_ASSET_PATH','Asset resolves outside asset directory');
    if(stat.size!==entry.bytes)reject('ASSET_SIZE_MISMATCH',`Size mismatch for ${entry.id}`);
    const hasher=createHash('sha256');
    for await(const chunk of createReadStream(file))hasher.update(chunk);
    const digest=hasher.digest('hex');
    if(digest!==entry.sha256)reject('ASSET_HASH_MISMATCH',`Digest mismatch for ${entry.id}`);
    hashes.push({id:entry.id,sha256:digest,bytes:stat.size,kind:entry.kind});
  }
  if(requireCharacter){
    const kinds=new Set(obj.entries.filter(x=>x.requiredForRelease).map(x=>x.kind));
    if(!kinds.has('source-blend')||!kinds.has('runtime-glb'))reject('CHARACTER_ASSET_MISSING','Editable Bill.blend and runtime Bill.glb must both be accepted before character release');
  }
  return {owner:obj.owner,assetsVerified:hashes.length,assets:hashes,characterAccepted:requireCharacter};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
  const args=process.argv.slice(2);
  if(args.includes('--help'))console.log('Usage: node tools/assets/verify.mjs [--require-character] [--help]');
  else if(args.some(x=>x!=='--require-character')){console.error('Unknown verification argument');process.exitCode=2;}
  else console.log(JSON.stringify(await validateAssetManifest({requireCharacter:args.includes('--require-character')}),null,2));
}
