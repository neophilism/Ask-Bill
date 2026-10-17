#!/usr/bin/env python3
"""Reproducible, source-validated, portable twenty-Bill walking audition ZIP.

Only public character assets and a local static frontend are included.
No user profiles, secrets, LLM traffic, eye tracking or background service.
The model-viewer CDN is currently an explicitly documented runtime requirement.
"""
import argparse
import hashlib
import json
from pathlib import Path
import re
import stat
import struct
import zipfile

ROOT=Path(__file__).resolve().parents[1]
DIST=ROOT/'assets/bill/characters/dist'
PUBLIC_FILES=[
    'assets/bill/characters/animation-library.json',
    'apps/web/preview/characters.html',
    'apps/web/preview/characters.js',
    'apps/web/preview/characters.css',
    'apps/web/preview/compare.html',
    'apps/web/preview/compare.js',
    'apps/web/preview/compare.css',
    'packages/character/attention/option10-controller.cjs',
    'packages/character/animation/idle-director.mjs',
    'packages/character/gallery/shortlist.mjs',
    'tools/character-audition/start_audition.py',
    'tools/character-audition/README.md',
    'tools/character-audition/START-MAC.command',
    'tools/character-audition/START-WINDOWS.bat',
]
LIBRARY=json.loads((ROOT/'assets/bill/characters/animation-library.json').read_text(encoding='utf8'))
CLIPS={c['name'] for c in LIBRARY['clips']}
EXTERNAL_SCRIPTS=['cdn.jsdelivr.net']
EXPORT_PREFIX='AskBill-20-Walking-Lab'


def glb_info(content, id):
    if len(content)<28 or content[:4]!=b'glTF':
        raise ValueError('Not a binary glTF asset: '+id)
    if struct.unpack_from('<II',content,4)!=(2,len(content)):
        raise ValueError('Invalid GLB header/version/size: '+id)
    json_length,json_kind=struct.unpack_from('<I4s',content,12)
    if json_kind!=b'JSON' or json_length>len(content)-20:
        raise ValueError('GLB missing valid JSON: '+id)
    gltf=json.loads(content[20:20+json_length])
    if gltf.get('asset',{}).get('version')!='2.0':
        raise ValueError('Wrong glTF version: '+id)
    if {a.get('name') for a in gltf.get('animations',[])}!=CLIPS:
        raise ValueError('Missing named animated performance: '+id)
    if not gltf.get('skins') or not gltf.get('meshes'):
        raise ValueError('Missing rigged geometry: '+id)
    names={m.get('name'):m for m in gltf['meshes']}
    mouth=names.get('MouthVisemes')
    if not mouth or len(mouth.get('primitives',[{}])[0].get('targets',[]))<12:
        raise ValueError('No usable mouth morphs: '+id)
    if gltf.get('extras',{}).get('billCharacter',{}).get('id')!=id:
        raise ValueError('Identity mismatch: '+id)
    return {'meshCount':len(gltf['meshes']), 'animationCount':len(gltf['animations'])}


def verified_sources():
    manifest=json.loads((DIST/'manifest.json').read_text('utf8'))
    rows=manifest.get('characters',[])
    if len(rows)!=20 or manifest.get('default')!='bill-10' or manifest.get('animationLibrary')!='assets/bill/characters/animation-library.json':
        raise ValueError('Expected 20 characters, owner-selected default bill-10')
    actual={p.name for p in DIST.glob('bill-*.glb')}
    expected={'bill-%02d.glb'%i for i in range(1,21)}
    if actual!=expected:raise ValueError('Character file set differs from published manifest')
    sourcepaths=['assets/bill/characters/dist/manifest.json']
    details=[]
    for i,row in enumerate(rows,1):
        id='bill-%02d'%i
        if row.get('id')!=id or row.get('path')!='assets/bill/characters/dist/'+id+'.glb':
            raise ValueError('Unsafe or mismatched manifest entry: '+id)
        path=DIST/(id+'.glb')
        data=path.read_bytes()
        if not 100000<len(data)<15000000:
            raise ValueError('Invalid candidate byte size: '+id)
        if len(data)!=row.get('bytes') or hashlib.sha256(data).hexdigest()!=row.get('sha256'):
            raise ValueError('Character manifest digest mismatch: '+id)
        proof=glb_info(data,id)
        details.append({'id':id,'sha256':row['sha256'],'bytes':len(data),**proof})
        sourcepaths.append(path.relative_to(ROOT).as_posix())
    for i in range(1,11):
        sourcepaths.append('assets/bill/characters/reference/original-%02d.jpg'%i)
    sourcepaths.extend(PUBLIC_FILES)
    paths=[]
    for rel in sorted(sourcepaths):
        p=ROOT/rel
        if not p.is_file() or p.is_symlink() or '..' in Path(rel).parts:
            raise ValueError('Missing, unsafe or symlinked asset: '+rel)
        if p.resolve().is_relative_to(ROOT.resolve()) is False:
            raise ValueError('Asset outside canonical checkout: '+rel)
        paths.append((rel,p))
    return paths,details


def make_zip(destination):
    paths,details=verified_sources()
    destination=Path(destination).expanduser().resolve()
    destination.parent.mkdir(parents=True,exist_ok=True)
    digests={}
    with zipfile.ZipFile(destination,'w',zipfile.ZIP_DEFLATED,compresslevel=8,allowZip64=True) as bundle:
        def add(rel,payload,executable=False):
            if rel.startswith('/') or '..' in Path(rel).parts or rel in digests:
                raise ValueError('Unsafe or duplicated ZIP entry')
            if isinstance(payload,str):payload=payload.encode('utf8')
            info=zipfile.ZipInfo(rel,date_time=(2026,1,1,0,0,0))
            info.create_system=3
            info.compress_type=zipfile.ZIP_DEFLATED
            info.external_attr=(stat.S_IFREG|(0o755 if executable else 0o644))<<16
            bundle.writestr(info,payload,compress_type=zipfile.ZIP_DEFLATED,compresslevel=8)
            digests[rel]={'bytes':len(payload),'sha256':hashlib.sha256(payload).hexdigest()}
        add('index.html', '<!doctype html><html lang="en"><meta charset="utf-8"><meta http-equiv="refresh" content="0;url=apps/web/preview/compare.html"><title>Ask Bill — Walking Lab</title><a href="apps/web/preview/compare.html">Open the walking audition</a></html>\n')
        for rel,file in paths:
            newname=rel
            if rel=='tools/character-audition/start_audition.py':newname='start_audition.py'
            if rel=='tools/character-audition/README.md':newname='README-FIRST.md'
            if rel=='tools/character-audition/START-MAC.command':newname='START-MAC.command'
            if rel=='tools/character-audition/START-WINDOWS.bat':newname='START-WINDOWS.bat'
            add(newname,file.read_bytes(),executable=newname in ('START-MAC.command','start_audition.py'))
        record={'schemaVersion':1,'product':'Ask Bill','modelCount':20,'approvedForProduction':False,
                'default':'bill-10','rendererNetworkRequirement':EXTERNAL_SCRIPTS,
                'animationLibrary':'assets/bill/characters/animation-library.json',
                'models':details,'assets':digests}
        add('bundle-manifest.json',json.dumps(record,sort_keys=True,indent=2)+'\n')
    print(json.dumps({'zip':str(destination),'sha256':hashlib.sha256(destination.read_bytes()).hexdigest(),
                      'bytes':destination.stat().st_size,'models':20,'entries':len(digests)+1},indent=2))
    return destination


if __name__=='__main__':
    cli=argparse.ArgumentParser(description=__doc__)
    cli.add_argument('--output',default='dist/'+EXPORT_PREFIX+'.zip')
    opts=cli.parse_args()
    make_zip(opts.output)
