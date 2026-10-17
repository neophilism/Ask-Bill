#!/usr/bin/env python3
"""Resumable, budget-gated Meshy animation batch importer for the owner's Bill.

Offline dry-run by default. No API key is needed until --execute.
API requests require --execute, --max-credits, MESHY_API_KEY, and either a
completed API rigging task id or a new rigging input. The public Meshy share
URL is NOT an API rig_task_id and is never submitted as one.

The script downloads only authenticated task results from assets.meshy.ai,
not arbitrary URL content. It never stores signed URLs or credentials.
"""
from __future__ import annotations

import argparse
import base64
from contextlib import contextmanager
import hashlib
import json
import os
from pathlib import Path
import re
import struct
import sys
import time
import urllib.error
import urllib.parse
import urllib.request

API = 'https://api.meshy.ai/openapi/v1'
MAX_FILE = 400 * 1024 * 1024
MAX_RIG_DATA = 100 * 1024 * 1024
BATCH_MAX = 10
API_ACTION_CREDITS = 3
API_RIG_CREDITS = 5
TASK_ID = re.compile(r'^[a-zA-Z0-9-]{20,100}$')
TIERS = ('core', 'extended', 'dance', 'antics')


class PipelineError(RuntimeError):
    pass


def hash_file(path):
    checksum = hashlib.sha256()
    with Path(path).open('rb') as source:
        for block in iter(lambda: source.read(1024 * 1024), b''):
            checksum.update(block)
    return checksum.hexdigest()


def load_plan(path):
    plan = json.loads(Path(path).read_text(encoding='utf-8'))
    if plan.get('schemaVersion') != 1 or not isinstance(plan.get('actions'), list):
        raise PipelineError('Unsupported Meshy animation plan')
    ids = set()
    for row in plan['actions']:
        i = row.get('action_id')
        if type(i) is not int or not 0 <= i <= 100000 or i in ids or row.get('tier') not in TIERS:
            raise PipelineError('Duplicate, invalid or unclassified action id')
        ids.add(i)
    model = plan.get('sourceModel', {})
    if not re.fullmatch(r'[0-9a-f]{64}', model.get('sha256', '')):
        raise PipelineError('Source GLB checksum must be pinned in action plan')
    return plan


def selections(plan, tiers):
    ids = [row['action_id'] for row in plan['actions'] if row['tier'] in tiers]
    return [ids[i:i + BATCH_MAX] for i in range(0, len(ids), BATCH_MAX)]


def fingerprint(plan, batches):
    payload = {'schemaVersion': plan['schemaVersion'], 'sourceSha': plan['sourceModel']['sha256'],
               'batches': batches}
    return hashlib.sha256(json.dumps(payload, sort_keys=True, separators=(',', ':')).encode()).hexdigest()


def validate_id(value):
    if not isinstance(value, str) or not TASK_ID.fullmatch(value):
        raise PipelineError('Expected a genuine API task id, not a public Meshy share code')
    return value


def safe_asset_url(url):
    try:
        parsed = urllib.parse.urlsplit(url)
    except (ValueError, TypeError) as exc:
        raise PipelineError('Invalid Meshy result URL') from exc
    if (parsed.scheme != 'https' or parsed.hostname != 'assets.meshy.ai' or
            parsed.username is not None or parsed.password is not None or parsed.port not in (None, 443) or
            not parsed.path.startswith('/') or '\\' in parsed.path):
        raise PipelineError('Animation download was not on the trusted Meshy HTTPS asset host')
    return url


class ApiRejectRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        raise PipelineError('Meshy API redirected a credential-bearing request; request refused')


class AssetRedirectGuard(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        safe_asset_url(newurl)
        if code not in (301, 302, 303, 307, 308):
            raise PipelineError('Unsupported Meshy asset redirect')
        return super().redirect_request(req, fp, code, msg, headers, newurl)


def glb_clips(path):
    """Return real GLB clip names; reject truncated or external-buffer output."""
    file = Path(path)
    if not file.is_file() or file.stat().st_size < 20 or file.stat().st_size > MAX_FILE:
        raise PipelineError('Downloaded GLB has an invalid file size')
    with file.open('rb') as stream:
        header = stream.read(20)
        magic, version, declared, length, chunk_type = struct.unpack('<4sIIII', header)
        if (magic, version, declared, chunk_type) != (b'glTF', 2, file.stat().st_size, 0x4E4F534A):
            raise PipelineError('Downloaded GLB has invalid glTF/JSON header')
        if length < 4 or length > 16 * 1024 * 1024 or length % 4:
            raise PipelineError('GLB JSON chunk size not supported')
        document = json.loads(stream.read(length))
        bin_head = stream.read(8)
        if len(bin_head) != 8:
            raise PipelineError('GLB binary data is missing')
        bin_len, bin_type = struct.unpack('<II', bin_head)
        if bin_type != 0x004E4942 or 20 + length + 8 + bin_len != file.stat().st_size:
            raise PipelineError('Malformed GLB binary chunk')
        if document.get('asset', {}).get('version') != '2.0':
            raise PipelineError('GLB must be glTF 2.0')
        if len(document.get('buffers', [])) != 1 or 'uri' in document['buffers'][0]:
            raise PipelineError('GLB with external or multiple buffers is not supported')
        if document['buffers'][0]['byteLength'] > bin_len:
            raise PipelineError('GLB buffer exceeds binary chunk')
        names = [a.get('name') for a in document.get('animations', [])]
        if any(not isinstance(n, str) or not n.strip() for n in names) or len(names) != len(set(names)):
            raise PipelineError('Animation clips must have unique nonempty names')
        return names


def atomic_json(path, value):
    path = Path(path)
    temporary = path.with_name(path.name + '.part')
    if path.is_symlink() or temporary.is_symlink():
        raise PipelineError('Refusing to overwrite symlink state file')
    descriptor = os.open(temporary, os.O_WRONLY | os.O_CREAT | os.O_TRUNC | getattr(os, 'O_NOFOLLOW', 0), 0o600)
    try:
        with os.fdopen(descriptor, 'w', encoding='utf-8') as out:
            json.dump(value, out, indent=2, sort_keys=True)
            out.write('\n')
            out.flush()
            os.fsync(out.fileno())
        temporary.replace(path)
    finally:
        if temporary.exists():
            temporary.unlink()


@contextmanager
def exclusive_output(directory):
    directory = Path(directory)
    directory.mkdir(parents=True, exist_ok=True)
    lock = directory / '.bill-meshy.lock'
    try:
        descriptor = os.open(lock, os.O_CREAT | os.O_EXCL | os.O_WRONLY, 0o600)
    except FileExistsError as exc:
        raise PipelineError('Another downloader may be running; inspect before clearing the output lock') from exc
    try:
        with os.fdopen(descriptor, 'w') as out:
            out.write(str(os.getpid()) + '\n')
        yield directory
    finally:
        lock.unlink(missing_ok=True)


class MeshyClient:
    """All provider traffic is confined to a fixed HTTPS API origin."""
    def __init__(self, key, opener=None, sleep=time.sleep):
        if not isinstance(key, str) or not key.strip():
            raise PipelineError('MESHY_API_KEY is missing')
        self.key = key.strip()
        self.opener = opener or urllib.request.build_opener(ApiRejectRedirect())
        self.sleep = sleep

    def request(self, route, payload=None):
        if not route.startswith('/') or any(x in route for x in ('?', '#', '..', '\\')):
            raise PipelineError('Unsafe Meshy API route')
        body = json.dumps(payload, separators=(',', ':')).encode('utf-8') if payload is not None else None
        req = urllib.request.Request(API + route, data=body,
                method='POST' if body is not None else 'GET',
                headers={'Authorization': 'Bearer ' + self.key, 'Accept': 'application/json',
                         **({'Content-Type': 'application/json'} if body is not None else {})})
        # Never auto-retry POST. If the response is lost after acceptance, the
        # durable 'submitting' checkpoint prevents duplicate paid requests.
        for attempt in range(4 if payload is None else 1):
            try:
                with self.opener.open(req, timeout=120) as res:
                    if res.url.split('?', 1)[0] != API + route:
                        raise PipelineError('Unexpected Meshy API redirect')
                    data = res.read(2 * 1024 * 1024 + 1)
                    if len(data) > 2 * 1024 * 1024:
                        raise PipelineError('Oversized Meshy API response')
                    return json.loads(data)
            except urllib.error.HTTPError as exc:
                if payload is None and exc.code in (429, 500, 502, 503, 504) and attempt < 3:
                    self.sleep(min(2 ** attempt * 3, 30))
                    continue
                raise PipelineError(f'Meshy API HTTP {exc.code} on {route}; see provider request logs') from exc
            except (urllib.error.URLError, TimeoutError) as exc:
                raise PipelineError(f'Meshy API transport error on {route}; task submission may have succeeded') from exc
        raise PipelineError('Meshy API retries exhausted')

    def balance(self):
        result = self.request('/balance')
        amount = result.get('balance') if isinstance(result, dict) else None
        if type(amount) is not int or amount < 0:
            raise PipelineError('Meshy balance endpoint returned an invalid account balance')
        return amount

    def get_task(self, kind, task_id):
        if kind not in ('rigging', 'animations'):
            raise PipelineError('Unexpected Meshy task kind')
        return self.request('/' + kind + '/' + validate_id(task_id))

    def wait(self, kind, task_id, pause=5, polls=120):
        for attempt in range(polls):
            task = self.get_task(kind, task_id)
            state = task.get('status')
            if state == 'SUCCEEDED':
                return task
            if state in ('FAILED', 'CANCELED', 'CANCELLED'):
                raise PipelineError(f'{kind} task {task_id} ended in {state}; it will not be automatically re-created')
            if state not in ('PENDING', 'IN_PROGRESS'):
                raise PipelineError('Meshy returned an unknown task state')
            if attempt < polls - 1:
                self.sleep(pause)
        raise PipelineError(f'{kind} task {task_id} remains pending; rerun to resume without resubmitting')


def download_glb(url, target, expected_clips=None, opener=None):
    safe_asset_url(url)
    opener = opener or urllib.request.build_opener(AssetRedirectGuard())
    target = Path(target)
    if target.is_symlink():
        raise PipelineError('Refusing to overwrite symlink download target')
    part = target.with_name(target.name + '.part')
    if part.is_symlink():
        raise PipelineError('Refusing to write symlink temporary file')
    try:
        req = urllib.request.Request(url, headers={'Accept': 'model/gltf-binary,application/octet-stream'})
        with opener.open(req, timeout=120) as response, part.open('wb') as out:
            safe_asset_url(response.url)
            size = 0
            for block in iter(lambda: response.read(1024 * 1024), b''):
                size += len(block)
                if size > MAX_FILE:
                    raise PipelineError('Oversized Meshy asset; download refused')
                out.write(block)
        names = glb_clips(part)
        if expected_clips is not None and len(names) != expected_clips:
            raise PipelineError(f'Meshy returned {len(names)} animation clips; expected {expected_clips}')
        part.replace(target)
        return {'sha256': hash_file(target), 'bytes': target.stat().st_size, 'clipNames': names}
    finally:
        part.unlink(missing_ok=True)


def state_for(output, stamp, batches):
    state_file = output / 'tasks.json'
    if state_file.is_file():
        state = json.loads(state_file.read_text('utf-8'))
        if state.get('version') != 1 or state.get('planSha') != stamp or state.get('batches') != batches:
            raise PipelineError('Output checkpoint belongs to a different rig/source/action plan; use a new directory')
    else:
        state = {'version': 1, 'planSha': stamp, 'batches': batches, 'rig': None, 'tasks': {}}
        atomic_json(state_file, state)
    return state, state_file


def verify_existing(path, record, expected_clips=None):
    if path.is_symlink():
        raise PipelineError('Unexpected symlink in checkpointed output')
    if not path.is_file():
        return False
    if record.get('sha256') and hash_file(path) != record['sha256']:
        raise PipelineError(f'Checksum mismatch for {path.name}; will not overwrite verified downloads')
    names = glb_clips(path)
    if expected_clips is not None and len(names) != expected_clips:
        raise PipelineError(f'Unexpected clip count in existing {path.name}')
    return {'sha256': hash_file(path), 'bytes': path.stat().st_size, 'clipNames': names}


def require_source(path, plan):
    if path is None:
        raise PipelineError('A local Bill GLB path is required to create a rigging task')
    path = Path(path)
    if not path.is_file() or path.stat().st_size > MAX_RIG_DATA:
        raise PipelineError('Rig source GLB missing or larger than Meshy 100 MB Data URI limit')
    if hash_file(path) != plan['sourceModel']['sha256']:
        raise PipelineError('Local Bill GLB does not match the pinned owner-uploaded source SHA-256')
    glb_clips(path)
    return path


def validate_model_url(value):
    p = urllib.parse.urlsplit(value)
    if p.scheme != 'https' or not p.hostname or p.username or p.password or not p.path.lower().endswith('.glb'):
        raise PipelineError('Rig source must be a direct HTTPS .glb download URL, not a Meshy share page')
    if p.hostname in ('localhost', '127.0.0.1', '::1') or p.hostname.endswith('.local'):
        raise PipelineError('Local or private hosts cannot be passed as Meshy remote rig sources')
    return value


def ensure_rig(client, state, save, args, plan, output):
    rig = state.get('rig')
    if args.recover_rig_task_id:
        validate_id(args.recover_rig_task_id)
        if not rig or rig.get('state') != 'submitting' or rig.get('id'):
            raise PipelineError('Can only recover a rig task during an uncertain submission')
        rig['id'] = args.recover_rig_task_id
        rig['state'] = 'submitted'
        save()
    elif args.rig_task_id:
        validate_id(args.rig_task_id)
        if rig and rig.get('id') and rig['id'] != args.rig_task_id:
            raise PipelineError('Rig task does not match previously checkpointed rig')
        if rig and rig.get('state') == 'submitting':
            raise PipelineError('Recover the ambiguous prior rig task; cannot substitute another silently')
        if rig is None:
            rig = {'id': args.rig_task_id, 'state': 'submitted', 'mode': 'existing-api-rig'}
            state['rig'] = rig
            save()
    elif rig is None:
        if args.rig_from_glb:
            model = require_source(args.rig_from_glb, plan)
            payload = {'model_url': 'data:model/gltf-binary;base64,' + base64.b64encode(model.read_bytes()).decode('ascii')}
            mode = 'source-glb'
            source_ref = plan['sourceModel']['sha256']
        elif args.rig_model_url:
            payload = {'model_url': validate_model_url(args.rig_model_url)}
            mode = 'direct-model-url'
            source_ref = hashlib.sha256(args.rig_model_url.encode()).hexdigest()
        else:
            raise PipelineError('Supply MESHY_RIG_TASK_ID or --rig-from-glb for Bill (a share URL is not a rig task)')
        rig = {'id': None, 'state': 'submitting', 'mode': mode, 'sourceRefSha': source_ref}
        state['rig'] = rig
        save()  # BEFORE the credit-consuming POST.
        answer = client.request('/rigging', payload)
        rig['id'] = validate_id(answer.get('result'))
        rig['state'] = 'submitted'
        save()
    if not rig:
        raise PipelineError('Rig task is missing')
    if rig.get('state') == 'submitting':
        raise PipelineError('Rig creation may have succeeded; recover its ID from Meshy Request Logs before retrying')
    if not rig.get('id'):
        raise PipelineError('Checkpointed rig task ID is missing')
    base = output / 'Bill-API-Rig.glb'
    proof = verify_existing(base, rig)
    if proof and rig.get('state') == 'ready':
        return rig['id']  # A local, checksum-verified rig outlives short-lived Meshy result URLs.
    task = client.wait('rigging', rig['id'], args.poll_interval, args.max_polls)
    url = (task.get('result') or {}).get('rigged_character_glb_url')
    if not url:
        raise PipelineError('Completed rigging task has no retrievable GLB (may have expired)')
    if not proof:
        proof = download_glb(url, base)
    rig.update(proof)
    rig['state'] = 'ready'
    rig['consumedCredits'] = task.get('consumed_credits')
    save()
    return rig['id']


def run(client, args, plan, batches):
    with exclusive_output(args.output) as output:
        stamp = fingerprint(plan, batches)
        state, checkpoint = state_for(output, stamp, batches)

        def save():
            atomic_json(checkpoint, state)

        # Read-only account balance check BEFORE any billable provider POST.
        # Resumed task IDs have already been billed; do not charge them again.
        pending_actions = sum(len(group) for number, group in enumerate(batches, 1)
                              if not state['tasks'].get(f'{number:03}', {}).get('id'))
        pending_rig = (API_RIG_CREDITS if (args.rig_from_glb or args.rig_model_url)
                       and state.get('rig') is None else 0)
        needed = pending_actions * API_ACTION_CREDITS + pending_rig
        if client.balance() < needed:
            raise PipelineError(f'Meshy account balance is below the {needed}-credit remaining-plan estimate; no new tasks submitted')

        if args.recover_batch:
            for item in args.recover_batch:
                try:
                    number, task_id = item.split(':', 1)
                    batch_index = int(number)
                except ValueError as exc:
                    raise PipelineError('Batch recovery format is NUMBER:API_TASK_ID') from exc
                validate_id(task_id)
                if not 1 <= batch_index <= len(batches):
                    raise PipelineError('Recovery batch number outside requested plan')
                k = f'{batch_index:03}'
                row = state['tasks'].get(k)
                if not row or row.get('state') != 'submitting' or row.get('id'):
                    raise PipelineError(f'Batch {number} has no ambiguous submission to recover')
                row['id'] = task_id
                row['state'] = 'submitted'
            save()

        rig_id = ensure_rig(client, state, save, args, plan, output)
        live = client.request('/animations/library')
        if not isinstance(live, list):
            raise PipelineError('Unexpected live Meshy animation library format')
        current = {row.get('action_id'): row for row in live if isinstance(row, dict)}
        missing = [action for group in batches for action in group if action not in current]
        if missing:
            raise PipelineError(f'Meshy retired planned action IDs {missing}; no new animation tasks submitted')
        catalog = [{'action_id': i, 'name': current[i].get('name'), 'key': current[i].get('key'),
                    'category': current[i].get('category')} for batch in batches for i in batch]
        atomic_json(output / 'catalog.json', catalog)
        for number, group in enumerate(batches, 1):
            k = f'{number:03}'
            row = state['tasks'].get(k)
            file = output / f'animation-batch-{k}.glb'
            if row and row.get('actionIds') != group:
                raise PipelineError('Mismatched checkpointed actions; refusing duplicate paid request')
            if row:
                if row.get('state') == 'submitting':
                    raise PipelineError(f'Batch {number} submission is uncertain; recover task ID from Meshy logs')
                if not row.get('id'):
                    raise PipelineError(f'Batch {number} has no resumable task ID')
                proof = verify_existing(file, row, expected_clips=len(group))
                if proof:
                    row.update(proof)
                    row['state'] = 'downloaded'
                    save()
                    print(f'Batch {number}/{len(batches)}: verified previous download')
                    continue
            else:
                row = {'actionIds': group, 'state': 'submitting', 'id': None}
                state['tasks'][k] = row
                save()  # BEFORE the charged POST.
                task_id = client.request('/animations', {'rig_task_id': rig_id, 'action_ids': group}).get('result')
                row['id'] = validate_id(task_id)
                row['state'] = 'submitted'
                save()
            task = client.wait('animations', row['id'], args.poll_interval, args.max_polls)
            url = (task.get('result') or {}).get('animation_glb_url')
            if not url:
                raise PipelineError(f'Batch {number} result is missing or expired; stop without resubmitting')
            row.update(download_glb(url, file, expected_clips=len(group)))
            row['consumedCredits'] = task.get('consumed_credits')
            row['state'] = 'downloaded'
            save()
            print(f'Batch {number}/{len(batches)}: downloaded {len(group)} clips ({file.stat().st_size} bytes)')
        manifest = {'schemaVersion': 1, 'owner': 'Ask Bill', 'sourceModelSha256': plan['sourceModel']['sha256'],
                    'rigTaskId': rig_id, 'rigGlbSha256': state['rig']['sha256'],
                    'batches': [{'number': k, 'actionIds': value['actionIds'], 'taskId': value['id'],
                                 'sha256': value['sha256'], 'clipNames': value['clipNames'], 'bytes': value['bytes'],
                                 'consumedCredits': value.get('consumedCredits')}
                                for k, value in sorted(state['tasks'].items())]}
        atomic_json(output / 'download-manifest.json', manifest)
        print(f'Complete: downloaded {sum(len(b) for b in batches)} Meshy clips. Merge only after checking rig compatibility.')
        return manifest


def main(argv=None, client_factory=MeshyClient):
    cli = argparse.ArgumentParser(description=__doc__)
    cli.add_argument('--plan', type=Path, default=Path(__file__).with_name('bill_action_plan.json'))
    cli.add_argument('--tiers', nargs='+', choices=TIERS, default=list(TIERS))
    cli.add_argument('--output', type=Path, default=Path('meshy-bill-output'))
    cli.add_argument('--execute', action='store_true', help='Opt in to real, potentially billable Meshy API jobs')
    cli.add_argument('--check-balance', action='store_true', help='Authenticate and check Meshy balance without any paid requests or asset downloads')
    cli.add_argument('--max-credits', type=int, help='Mandatory ceiling for the forecast API-credit cost (set Meshy API key limit too)')
    cli.add_argument('--rig-task-id', default=os.environ.get('MESHY_RIG_TASK_ID'), help='Existing completed Meshy API rig task id')
    cli.add_argument('--rig-from-glb', type=Path, help='Re-rig the pinned uploaded Bill GLB using a Meshy Data URI (may alter skeleton)')
    cli.add_argument('--rig-model-url', help='Direct public HTTPS .glb URL for Meshy API re-rigging; NOT a share page')
    cli.add_argument('--recover-rig-task-id', help='Adopt id of ambiguous charged rig submission after checking Meshy Request Logs')
    cli.add_argument('--recover-batch', action='append', help='Adopt submitted animation task after ambiguous POST; format 1:TASK_ID')
    cli.add_argument('--poll-interval', type=int, default=5)
    cli.add_argument('--max-polls', type=int, default=120)
    args = cli.parse_args(argv)
    plan = load_plan(args.plan)
    batches = selections(plan, set(args.tiers))
    if not batches:
        cli.error('Selected no animations')
    if args.poll_interval < 0 or not 1 <= args.max_polls <= 10000:
        cli.error('Invalid polling limits')
    if sum(bool(x) for x in (args.rig_task_id, args.rig_from_glb, args.rig_model_url)) > 1:
        cli.error('Choose one rig task ID, local GLB or direct model URL')
    cost = API_ACTION_CREDITS * sum(len(b) for b in batches)
    new_rig = bool(args.rig_from_glb or args.rig_model_url)
    total = cost + (API_RIG_CREDITS if new_rig else 0)
    print(f'Meshy plan: {sum(map(len, batches))} actions / {len(batches)} batches of at most 10; '
          f'estimated {cost} animation credits + {API_RIG_CREDITS if new_rig else 0} rigging credits.')
    print('Source: ' + plan['sourceModel']['shareUrl'] + '; planned actions are NOT yet downloaded.')
    if args.check_balance:
        if args.execute:
            cli.error('--check-balance is read-only; do not combine it with --execute')
        key = os.environ.get('MESHY_API_KEY')
        if not key:
            raise PipelineError('MESHY_API_KEY is not configured. Set it as a protected secret, not in Git.')
        client = client_factory(key)
        client.balance()
        print('Meshy API key authenticated and account balance retrieved (amount withheld from public CI logs).')
        return 0
    if not args.execute:
        for n, group in enumerate(batches, 1):
            print(f'  {n:02d}: {group}')
        print('DRY RUN: no API access, no credits charged. --execute and --max-credits are required.')
        return 0
    if args.max_credits is None or args.max_credits < total:
        raise PipelineError(f'Explicit --max-credits must be at least {total} for this selection; nothing submitted')
    key = os.environ.get('MESHY_API_KEY')
    if not key:
        raise PipelineError('MESHY_API_KEY is not configured. Set it privately in the process environment, not Git.')
    client = client_factory(key)
    run(client, args, plan, batches)
    return 0


if __name__ == '__main__':
    try:
        sys.exit(main())
    except (PipelineError, OSError, ValueError, KeyError, TypeError, json.JSONDecodeError) as exc:
        print(f'Bill Meshy importer stopped safely: {exc}', file=sys.stderr)
        sys.exit(1)
