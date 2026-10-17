import copy
import hashlib
import json
from pathlib import Path
import sys
import tempfile
import unittest
import wave

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'scripts'))
import export_candor_current_pages as pages


class PublicPagesExportTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        choices = []
        pending = []
        for target in range(6):
            rows = []
            for gate_index, gate in enumerate(pages.GATES):
                for system in pages.SYSTEMS:
                    conditions = ['text' if system == 'text' else 'original' if system == 'original' else 'neutral']
                    if target < 2 and system in pages.SYSTEMS[1:5]:
                        conditions += ['period', 'question']
                    for condition in conditions:
                        key = f'{target}-{gate}-{system}-{condition}'
                        trial_id = 't_' + hashlib.sha256(key.encode()).hexdigest()[:20]
                        row = {
                            'trial_id': trial_id, 'sample_id': 'private-sample-' + key,
                            'target_id': f'private-target-{target}', 'candidate_number': 13 + target,
                            'source_event_id': f'private-conversation-{target}:turn:300',
                            'gate_stage': gate, 'exposed_word_count': 2 + 2 * gate_index,
                            'exposed_text': 'Same words' if gate_index == 0 else 'Same words with context',
                            'task': 'question_projection' if target < 3 else 'possible_completion',
                            'modality': 'text' if system == 'text' else 'audio',
                            'system': system, 'condition': condition,
                            'analysis_family': 'punctuation' if condition in {'period', 'question'} else 'main',
                            'review_note': 'PRIVATE NOTE DO NOT EXPORT',
                        }
                        if row['modality'] == 'audio':
                            path = self.root / (key + '.wav')
                            with wave.open(str(path), 'wb') as stream:
                                stream.setnchannels(1)
                                stream.setsampwidth(2)
                                stream.setframerate(16000)
                                stream.writeframes(b'\x00\x00' * (100 + 20 * gate_index))
                            row.update(playback_audio_path=str(path), playback_audio_sha256=pages.file_hash(path),
                                       endpoint_listening_verified=len(pending) >= 3,
                                       endpoint_review_status='pending' if len(pending) < 3 else 'accepted_endpoint_review')
                            if not row['endpoint_listening_verified']:
                                pending.append(row['sample_id'])
                        rows.append(row)
            choices.append(rows)
        self.manifest = {'schema_version': 1, 'study_id': 'test-study', 'lists': {
            f'P{index + 1:02d}': {'family': 'combined', 'trials': [choices[t][(index + t) % len(choices[t])] for t in reversed(range(6))]}
            for index in range(28)
        }}
        self.receipt = {'study_id': 'test-study', 'pending_audio_endpoint_reviews': pending}
        self.manifest_path, self.receipt_path = self.root / 'private.json', self.root / 'private-receipt.json'
        self.write_inputs()

    def write_inputs(self):
        self.manifest_path.write_text(json.dumps(self.manifest))
        self.receipt_path.write_text(json.dumps(self.receipt))

    def test_complete_exact_audio_export_and_no_private_fields(self):
        output = self.root / 'review'
        result = pages.export(self.manifest_path, self.receipt_path, output)
        self.assertEqual((result['stimulus_count'], result['audio_count'], result['text_count']), (104, 92, 12))
        self.assertEqual(result['pending_endpoint_count'], 3)
        self.assertFalse(result['recruitment_ready'])
        self.assertEqual(len(list((output / 'audio').glob('*.wav'))), 92)
        for asset in result['audio']:
            self.assertEqual(pages.file_hash(output / 'audio' / asset['filename']), asset['sha256'])
        all_public = '\n'.join(p.read_text() for p in (output / 'data').glob('*.json'))
        for forbidden in ('private-conversation', 'private-target', 'private-sample', 'PRIVATE NOTE', str(self.root),
                          'source_event_id', 'candidate_number', 'review_note', 'playback_audio_path', 'PROLIFIC_PID'):
            self.assertNotIn(forbidden, all_public)
        metadata = json.loads((output / 'data/metadata.json').read_text())['stimuli']
        self.assertEqual({r['system'] for r in metadata}, set(pages.SYSTEMS))
        for row in json.loads((output / 'data/stimuli.json').read_text())['stimuli']:
            self.assertEqual('text' in row, row['modality'] == 'text')
            self.assertEqual('audio_url' in row, row['modality'] == 'audio')

    def test_assignments_and_browse_groups_are_shorter_first(self):
        public, _, lists, groups, _ = pages.prepare(self.manifest, self.receipt)
        trials = {r['stimulus_id']: r for r in public['stimuli']}
        covered = set()
        for assignment in lists:
            rows = [trials[i] for i in assignment['stimulus_ids']]
            self.assertEqual(len({r['phrase_id'] for r in rows}), 6)
            indices = [pages.GATES.index(r['gate']) for r in rows]
            self.assertEqual(indices, sorted(indices))
            covered.update(assignment['stimulus_ids'])
        self.assertEqual(covered, set(trials))
        for group in groups:
            self.assertEqual([g['gate'] for g in group['gates']], list(pages.GATES))
            self.assertLess(group['gates'][0]['exposed_word_count'], group['gates'][1]['exposed_word_count'])

    def test_export_is_deterministic_and_bound_to_audio_and_endpoints(self):
        public = pages.prepare(self.manifest, self.receipt)[0]
        self.assertEqual(public, pages.prepare(copy.deepcopy(self.manifest), copy.deepcopy(self.receipt))[0])
        audio = next(r for g in self.manifest['lists'].values() for r in g['trials'] if r['modality'] == 'audio')
        Path(audio['playback_audio_path']).write_bytes(b'changed audio')
        with self.assertRaisesRegex(ValueError, 'audio hash mismatch'):
            pages.prepare(self.manifest, self.receipt)

    def test_unknown_status_or_missing_condition_is_rejected(self):
        row = next(r for g in self.manifest['lists'].values() for r in g['trials'] if r['modality'] == 'audio')
        original_status = row['endpoint_review_status']
        row['endpoint_review_status'] = 'PRIVATE NOTE'
        with self.assertRaisesRegex(ValueError, 'Unknown endpoint status'):
            pages.prepare(self.manifest, self.receipt)
        row['endpoint_review_status'] = original_status
        row['condition'] = 'missing-condition'
        with self.assertRaisesRegex(ValueError, 'missing or duplicate'):
            pages.prepare(self.manifest, self.receipt)

    def test_mismatched_words_repeated_phrase_and_stale_inputs_are_rejected(self):
        original = copy.deepcopy(self.manifest)
        row = self.manifest['lists']['P01']['trials'][0]
        row['exposed_text'] = row['exposed_text'].replace('Same', 'Different')
        with self.assertRaisesRegex(ValueError, 'identical words'):
            pages.prepare(self.manifest, self.receipt)
        self.manifest = original
        self.manifest['lists']['P01']['trials'][1] = self.manifest['lists']['P01']['trials'][0]
        with self.assertRaisesRegex(ValueError, 'repeats a source'):
            pages.prepare(self.manifest, self.receipt)
        self.receipt['cut_manifest_sha256'] = 'stale'
        self.write_inputs()
        with self.assertRaisesRegex(ValueError, 'Current input no longer matches'):
            pages.verify_inputs(self.manifest_path, self.receipt_path)

    def test_historical_root_files_are_untouched(self):
        historical = self.root / 'index.html'
        historical.write_text('historical site')
        pages.export(self.manifest_path, self.receipt_path, self.root / 'review')
        self.assertEqual(historical.read_text(), 'historical site')
        with self.assertRaisesRegex(ValueError, 'dedicated review directory'):
            pages.export(self.manifest_path, self.receipt_path, self.root)


if __name__ == '__main__':
    unittest.main()
