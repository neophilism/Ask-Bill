"""All API behavior is tested offline; paid requests are never made from CI."""
import contextlib
import copy
import hashlib
import io
import json
import os
from pathlib import Path
import shutil
import struct
import sys
import tempfile
import unittest
from unittest import mock

TOOLS = Path(__file__).resolve().parents[2] / 'tools' / 'meshy'
sys.path.insert(0, str(TOOLS))
import fetch_bill_animations as dl
import merge_bill_animations as glb


# Small real GLB with a skinned two-joint hierarchy and a keyed rotation clip.
def model(name='Wave_for_Help_1'):
    times = struct.pack('<ff', 0.0, 0.5)
    poses = struct.pack('<8f', 0, 0, 0, 1, 0, 0.05, 0, 0.9987492)
    binary = times + poses
    document = {
        'asset': {'version': '2.0', 'generator': 'Ask Bill CI fixture'},
        'buffers': [{'byteLength': len(binary)}],
        'bufferViews': [{'buffer': 0, 'byteOffset': 0, 'byteLength': len(times)},
                        {'buffer': 0, 'byteOffset': len(times), 'byteLength': len(poses)}],
        'accessors': [{'bufferView': 0, 'componentType': 5126, 'count': 2, 'type': 'SCALAR', 'min': [0], 'max': [.5]},
                      {'bufferView': 1, 'componentType': 5126, 'count': 2, 'type': 'VEC4'}],
        'nodes': [{'name': 'RigRoot', 'children': [1]}, {'name': 'RigHand'}],
        'skins': [{'joints': [0, 1]}],
        'meshes': [],
        'animations': [{'name': name,
                        'samplers': [{'input': 0, 'output': 1, 'interpolation': 'LINEAR'}],
                        'channels': [{'sampler': 0, 'target': {'node': 1, 'path': 'rotation'}}]}],
    }
    return document, binary


def make_glb(path, names=None):
    data, binary = model()
    if names is not None:
        data['animations'] = [{**copy.deepcopy(data['animations'][0]), 'name': name} for name in names]
    glb.write_glb(path, data, binary)
    return path


def small_plan(file, actions, source):
    plan = {
        'schemaVersion': 1,
        'sourceModel': {'shareUrl': 'https://www.meshy.ai/s/S6iLKM', 'sha256': dl.hash_file(source)},
        'actions': [{'action_id': i, 'tier': 'core', 'group': 'talk'} for i in actions],
    }
    file.write_text(json.dumps(plan))
    return file


class MockMeshy:
    def __init__(self, actions):
        self.actions = actions
        self.calls = []
        self.counter = 0
        self.jobs = {}

    def request(self, path, payload=None):
        self.calls.append((path, copy.deepcopy(payload)))
        if path == '/balance':
            return {'balance': getattr(self, 'balance_amount', 1000)}
        if path == '/animations/library':
            return [{'action_id': i, 'name': f'Animation {i}', 'key': f'Animation_{i}',
                     'category': 'BodyMovements'} for i in self.actions]
        if path == '/rigging':
            self.counter += 1
            return {'result': f'00000000-0000-4000-8000-{self.counter:012d}'}
        if path == '/animations':
            self.counter += 1
            tid = f'10000000-0000-4000-8000-{self.counter:012d}'
            self.jobs[tid] = payload['action_ids']
            return {'result': tid}
        raise AssertionError('Unexpected API request: ' + path)

    def balance(self):
        return self.request('/balance')['balance']

    def wait(self, kind, task_id, pause, polls):
        if kind == 'rigging':
            return {'status': 'SUCCEEDED', 'result': {'rigged_character_glb_url': 'https://assets.meshy.ai/rig.glb'},
                    'consumed_credits': 5}
        return {'status': 'SUCCEEDED', 'result': {'animation_glb_url': 'https://assets.meshy.ai/' + task_id + '.glb'},
                'consumed_credits': 3 * len(self.jobs[task_id])}


def fake_downloader(url, path, expected_clips=None, opener=None):
    names = [f'Animation_{i}' for i in range(expected_clips or 1)]
    make_glb(path, names)
    return {'sha256': dl.hash_file(path), 'bytes': path.stat().st_size, 'clipNames': names}


class PlanAndSafety(unittest.TestCase):
    def test_full_bill_plan_has_all_distinct_171_actions_in_18_batches(self):
        plan = dl.load_plan(TOOLS / 'bill_action_plan.json')
        batches = dl.selections(plan, set(dl.TIERS))
        self.assertEqual(len(plan['actions']), 171)
        self.assertEqual(len(batches), 18)
        self.assertTrue(all(1 <= len(b) <= 10 for b in batches))
        self.assertEqual(plan['sourceModel']['sha256'], '5a66e18afcc2cecef1e031dda5b14ea03a44b7c55f0fbdb39043702ff59b3fb9')
        self.assertEqual(len({i for b in batches for i in b}), 171)

    def test_share_link_is_not_an_api_task_id(self):
        for invalid in ('S6iLKM', 'https://www.meshy.ai/s/S6iLKM', '../unsafe', 'bad'): 
            with self.subTest(invalid=invalid), self.assertRaises(dl.PipelineError):
                dl.validate_id(invalid)

    def test_untrusted_asset_urls_refused(self):
        for url in ('http://assets.meshy.ai/file.glb', 'https://assets.meshy.ai.evil.test/x.glb',
                    'https://user:secret@assets.meshy.ai/x.glb', 'https://127.0.0.1/x.glb',
                    'file:///tmp/evil.glb', 'https://assets.meshy.ai:444/x.glb'):
            with self.subTest(url=url), self.assertRaises(dl.PipelineError):
                dl.safe_asset_url(url)
        self.assertEqual(dl.safe_asset_url('https://assets.meshy.ai/ok.glb?Expires=2342'),
                         'https://assets.meshy.ai/ok.glb?Expires=2342')
        with self.assertRaises(dl.PipelineError):
            dl.AssetRedirectGuard().redirect_request(None, None, 302, 'Found', {}, 'https://evil.test/file')
        with self.assertRaises(dl.PipelineError):
            dl.ApiRejectRedirect().redirect_request(None, None, 302, 'Found', {}, 'https://evil.test/file')

    def test_glb_clip_verifier_rejects_corrupted_file_and_checks_count(self):
        with tempfile.TemporaryDirectory() as tmp:
            p = Path(tmp) / 'fixture.glb'
            make_glb(p, ['A', 'B', 'C'])
            self.assertEqual(dl.glb_clips(p), ['A', 'B', 'C'])
            p.write_bytes(p.read_bytes()[:-16])
            with self.assertRaises(dl.PipelineError):
                dl.glb_clips(p)

    def test_local_source_requires_sha_of_uploaded_bill(self):
        with tempfile.TemporaryDirectory() as tmp:
            p = Path(tmp) / 'fake.glb'
            make_glb(p)
            with self.assertRaisesRegex(dl.PipelineError, 'does not match'):
                dl.require_source(p, dl.load_plan(TOOLS / 'bill_action_plan.json'))

    def test_dry_run_and_credit_gate_do_not_access_api(self):
        with tempfile.TemporaryDirectory() as tmp:
            source = make_glb(Path(tmp) / 'source.glb')
            plan = small_plan(Path(tmp) / 'plan.json', [1, 2, 3], source)
            output = Path(tmp) / 'out'
            result = dl.main(['--plan', str(plan), '--output', str(output)], client_factory=lambda _: 1)
            self.assertEqual(result, 0)
            self.assertFalse(output.exists())
            with mock.patch.dict(os.environ, {'MESHY_API_KEY': 'secret'}):
                with self.assertRaisesRegex(dl.PipelineError, '--max-credits'):
                    dl.main(['--plan', str(plan), '--execute', '--rig-task-id',
                             '12345678-0000-4000-8000-123456789012'], client_factory=lambda _: 1)
            self.assertFalse(output.exists())


class PipelineOperations(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.dir = Path(self.temp.name)
        self.source = make_glb(self.dir / 'Bill.glb')
        self.ids = list(range(101, 114))
        self.plan = small_plan(self.dir / 'plan.json', self.ids, self.source)
        self.out = self.dir / 'result'
        self.mock_api = MockMeshy(self.ids)
        self.rig_id = '12345678-0000-4000-8000-123456789012'
        self.patcher = mock.patch.object(dl, 'download_glb', side_effect=fake_downloader)
        self.patcher.start()
        self.addCleanup(self.patcher.stop)

    def execute(self, *extra):
        with mock.patch.dict(os.environ, {'MESHY_API_KEY': 'fake-test-key'}):
            return dl.main(['--plan', str(self.plan), '--output', str(self.out),
                            '--rig-task-id', self.rig_id, '--execute', '--max-credits', '100',
                            '--poll-interval', '0', *extra], client_factory=lambda _: self.mock_api)

    def test_key_balance_preflight_is_read_only_and_redacts_amount(self):
        with mock.patch.dict(os.environ, {'MESHY_API_KEY': 'fake-test-key'}):
            self.assertEqual(dl.main(['--plan', str(self.plan), '--check-balance'],
                                     client_factory=lambda _: self.mock_api), 0)
        self.assertEqual(self.mock_api.calls, [('/balance', None)])
        self.assertFalse(self.out.exists())

    def test_insufficient_account_credits_blocks_all_paid_posts(self):
        self.mock_api.balance_amount = 1
        with self.assertRaisesRegex(dl.PipelineError, 'balance is below'):
            self.execute()
        self.assertFalse(any(route in ('/animations', '/rigging') for route, _ in self.mock_api.calls))

    def test_batches_checkpoint_resume_audit_and_no_duplicate_paid_post(self):
        self.assertEqual(self.execute(), 0)
        jobs = [x for x in self.mock_api.calls if x[0] == '/animations']
        self.assertEqual(len(jobs), 2)
        self.assertEqual([len(x[1]['action_ids']) for x in jobs], [10, 3])
        manifest = json.loads((self.out / 'download-manifest.json').read_text())
        self.assertEqual(sum(len(x['actionIds']) for x in manifest['batches']), 13)
        state_text = (self.out / 'tasks.json').read_text()
        self.assertNotIn('fake-test-key', state_text)
        self.assertNotIn('assets.meshy.ai', state_text)
        self.assertTrue((self.out / 'Bill-API-Rig.glb').is_file())
        self.assertEqual(self.execute(), 0)
        self.assertEqual(len([x for x in self.mock_api.calls if x[0] == '/animations']), 2)

    def test_uncertain_post_never_repeats_paid_action_without_recovery(self):
        original = self.mock_api.request
        once = {'yes': True}
        def flaky(route, payload=None):
            if route == '/animations' and once['yes']:
                once['yes'] = False
                raise dl.PipelineError('Connection lost after POST acceptance')
            return original(route, payload)
        self.mock_api.request = flaky
        with self.assertRaisesRegex(dl.PipelineError, 'Connection lost'):
            self.execute()
        first = json.loads((self.out / 'tasks.json').read_text())
        self.assertEqual(first['tasks']['001']['state'], 'submitting')
        with self.assertRaisesRegex(dl.PipelineError, 'recover task ID'):
            self.execute()
        task_id = '11111111-2222-3333-4444-555555555555'
        self.mock_api.jobs[task_id] = self.ids[:10]
        self.mock_api.request = original
        self.assertEqual(self.execute('--recover-batch', '1:' + task_id), 0)
        self.assertEqual(len([x for x in self.mock_api.calls if x[0] == '/animations']), 1)

    def test_missing_catalog_id_blocks_all_paid_animation_jobs(self):
        self.mock_api.actions.remove(113) if 113 in self.mock_api.actions else None
        with self.assertRaisesRegex(dl.PipelineError, 'retired planned action'):
            self.execute()
        self.assertFalse(any(path == '/animations' for path, _ in self.mock_api.calls))

    def test_checkpoint_pins_selected_actions(self):
        self.assertEqual(self.execute(), 0)
        altered = json.loads(self.plan.read_text())
        altered['actions'] = altered['actions'][:-1]
        self.plan.write_text(json.dumps(altered))
        with self.assertRaisesRegex(dl.PipelineError, 'different rig/source/action plan'):
            self.execute()

    def test_corrupt_checkpointed_binary_fails_without_resubmit(self):
        self.assertEqual(self.execute(), 0)
        file = self.out / 'animation-batch-001.glb'
        file.write_bytes(file.read_bytes()[:-20])
        with self.assertRaisesRegex(dl.PipelineError, 'Checksum mismatch'):
            self.execute()
        self.assertEqual(len([x for x in self.mock_api.calls if x[0] == '/animations']), 2)

    def test_real_offline_merge_preserves_single_source_and_imports_batch(self):
        source = make_glb(self.dir / 'meshy-batch.glb', ['Talk_Open', 'Dance_Salsa'])
        target = self.dir / 'Bill-Animated.glb'
        imported = glb.merge(self.source, [source], target)
        self.assertEqual([x['name'] for x in imported], ['Talk_Open', 'Dance_Salsa'])
        self.assertEqual(dl.glb_clips(target), ['Wave_for_Help_1', 'Talk_Open', 'Dance_Salsa'])
        self.assertEqual(glb.inspect(self.source)['sha256'], dl.hash_file(self.source))

    def test_rest_pose_mismatch_refused(self):
        bad = self.dir / 'bad-motion.glb'
        document, binary = model('Motion')
        document['nodes'][1]['translation'] = [0, .2, 0]
        glb.write_glb(bad, document, binary)
        with self.assertRaisesRegex(glb.InvalidModel, 'rest pose differs'):
            glb.merge(self.source, [bad], self.dir / 'not-written.glb')


if __name__ == '__main__':
    unittest.main()
