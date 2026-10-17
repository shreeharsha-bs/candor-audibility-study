#!/usr/bin/env python3
"""Export the current two-cut collaborator preview without private provenance.

Audio is copied byte for byte from the existing shared-gain listening files.
This does not approve endpoints or make the participant study recruitment-ready.
"""
import argparse
import hashlib
import json
from collections import Counter, defaultdict
from pathlib import Path
import re
import shutil
import wave

SYSTEMS = ('original', 'omnivoice', 'f5', 'cosyvoice2', 'qwen3_base', 'text')
GATES = ('earlier', 'later')
TASKS = ('question_projection', 'possible_completion')


def file_hash(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def encoded(value):
    return json.dumps(value, sort_keys=True, separators=(',', ':'), ensure_ascii=False).encode()


def opaque_phrase(target_id):
    return 'p_' + hashlib.sha256(('candor-pages-phrase:' + target_id).encode()).hexdigest()[:16]


def verify_inputs(manifest_path, receipt_path):
    manifest = json.loads(Path(manifest_path).read_text())
    receipt = json.loads(Path(receipt_path).read_text())
    if manifest['study_id'] != receipt['study_id']:
        raise ValueError('Private lists and receipt have different study IDs')
    current = Path(manifest_path).parent.parent
    bindings = {
        'cut_manifest_sha256': current / 'tts_pilot/matched_cuts/cuts.jsonl',
        'endpoint_review_manifest_sha256': current / 'tts_pilot/matched_cuts/reviews/cuts.endpoint_reviewed.jsonl',
        'page_items_sha256': current / 'tts_pilot/matched_cuts/listening/data/items.jsonl',
    }
    for key, path in bindings.items():
        if key in receipt and (not path.is_file() or file_hash(path) != receipt[key]):
            raise ValueError(f'Current input no longer matches pilot receipt: {key}; rebuild local pilot first')
    return manifest, receipt


def prepare(manifest, receipt):
    lists = manifest['lists']
    if len(lists) != 28:
        raise ValueError('Expected the current 28 assignment lists')
    unique = {}
    for list_id, group in lists.items():
        if not re.fullmatch(r'P\d{2}', list_id) or len(group['trials']) != 6:
            raise ValueError('Each named assignment must contain six trials')
        if len({r['source_event_id'] for r in group['trials']}) != 6:
            raise ValueError('An assignment repeats a source event')
        for row in group['trials']:
            trial_id = row['trial_id']
            if not re.fullmatch(r't_[a-f0-9]{20}', trial_id):
                raise ValueError('Trial ID is not an opaque ID')
            if trial_id in unique and unique[trial_id] != row:
                raise ValueError('The same trial ID has conflicting private records')
            unique[trial_id] = row
    if len(unique) != 104:
        raise ValueError('Expected all 104 current presentations')
    targets = sorted({(r['candidate_number'], r['target_id']) for r in unique.values()})
    if len(targets) != 6 or len({t[1] for t in targets}) != 6:
        raise ValueError('Expected six distinct phrases')
    phrase_numbers = {target: index + 1 for index, (_, target) in enumerate(targets)}
    counts = Counter(r['system'] for r in unique.values())
    if counts != Counter({'original': 12, 'text': 12, 'omnivoice': 20, 'f5': 20, 'cosyvoice2': 20, 'qwen3_base': 20}):
        raise ValueError('Missing original, text, or one of the four TTS systems')
    if Counter(r['modality'] for r in unique.values()) != Counter(audio=92, text=12):
        raise ValueError('Expected 92 audio and 12 text presentations')
    if Counter(r['analysis_family'] for r in unique.values()) != Counter(main=72, punctuation=32):
        raise ValueError('Main and punctuation comparisons are incomplete')
    punctuation_targets = 0
    for _, target in targets:
        rows = [r for r in unique.values() if r['target_id'] == target]
        if len({r['source_event_id'] for r in rows}) != 1:
            raise ValueError('Versions of a phrase have different source events')
        actual = {(r['system'], r['condition'], r['gate_stage'], r['analysis_family']) for r in rows}
        expected = {(system, 'original' if system == 'original' else 'text' if system == 'text' else 'neutral', gate, 'main')
                    for system in SYSTEMS for gate in GATES}
        if any(r['analysis_family'] == 'punctuation' for r in rows):
            punctuation_targets += 1
            expected |= {(system, condition, gate, 'punctuation')
                         for system in SYSTEMS[1:5] for condition in ('period', 'question') for gate in GATES}
        if actual != expected or len(actual) != len(rows):
            raise ValueError('A phrase has missing or duplicate system, condition, or gate presentations')
    if punctuation_targets != 2:
        raise ValueError('Expected separate punctuation variants for two phrases')

    stimuli, metadata, assets = [], [], []
    gate_words = defaultdict(set)
    for trial_id, row in sorted(unique.items()):
        gate, task = row['gate_stage'], row['task']
        if gate not in GATES or task not in TASKS:
            raise ValueError('Unexpected gate or perceptual task')
        if row['exposed_word_count'] != len(row['exposed_text'].split()):
            raise ValueError('Exposed word count differs from text')
        gate_words[(row['target_id'], gate)].add((row['exposed_word_count'], row['exposed_text']))
        stimulus = {
            'stimulus_id': trial_id, 'trial_id': trial_id,
            'phrase_id': opaque_phrase(row['target_id']),
            'phrase_number': phrase_numbers[row['target_id']],
            'gate': gate, 'exposed_word_count': row['exposed_word_count'],
            'task': task, 'modality': row['modality'],
        }
        if row['modality'] == 'audio':
            source = Path(row['playback_audio_path'])
            expected = row['playback_audio_sha256']
            if file_hash(source) != expected:
                raise ValueError(f'Playback audio hash mismatch for {trial_id}')
            with wave.open(str(source), 'rb') as stream:
                frames, rate = stream.getnframes(), stream.getframerate()
                if not frames or not rate:
                    raise ValueError(f'Empty playback audio for {trial_id}')
            name = trial_id + '.wav'
            stimulus.update(audio_url='audio/' + name, duration_s=frames / rate)
            assets.append({'stimulus_id': trial_id, 'filename': name, 'sha256': expected, 'source': source,
                           'bytes': source.stat().st_size})
        else:
            if row['system'] != 'text' or row['condition'] != 'text':
                raise ValueError('Unexpected text condition')
            stimulus['text'] = row['exposed_text']
        pending = row['modality'] == 'audio' and row.get('endpoint_listening_verified') is not True
        endpoint_status = row.get('endpoint_review_status', 'pending') if row['modality'] == 'audio' else 'not_applicable'
        if endpoint_status not in {'accepted_endpoint_review', 'pending', 'needs_change', 'not_applicable'}:
            raise ValueError('Unknown endpoint status; raw review notes must not enter public metadata')
        metadata.append({
            'stimulus_id': trial_id, 'system': row['system'], 'condition': row['condition'],
            'analysis_family': row['analysis_family'], 'exposed_text': row['exposed_text'],
            'pending_endpoint': pending,
            'endpoint_status': endpoint_status,
        })
        stimuli.append(stimulus)
    for _, target in targets:
        earlier = gate_words[(target, 'earlier')]
        later = gate_words[(target, 'later')]
        if len(earlier) != 1 or len(later) != 1:
            raise ValueError('Modalities do not expose identical words for each gate')
        early_count, early_text = next(iter(earlier))
        late_count, late_text = next(iter(later))
        if early_count >= late_count or late_text.split()[:early_count] != early_text.split():
            raise ValueError('Earlier gate is not a shorter lexical prefix')
    pending_ids = {row['sample_id'] for row in unique.values()
                   if row['modality'] == 'audio' and row.get('endpoint_listening_verified') is not True}
    if 'pending_audio_endpoint_reviews' in receipt and pending_ids != set(receipt['pending_audio_endpoint_reviews']):
        raise ValueError('Pending endpoint status differs from the build receipt')
    by_id = {s['stimulus_id']: s for s in stimuli}
    public_lists = []
    for list_id, group in sorted(lists.items()):
        ordered = sorted(group['trials'], key=lambda row: GATES.index(row['gate_stage']))
        if len({row['target_id'] for row in ordered}) != 6:
            raise ValueError('An assignment repeats a phrase')
        public_lists.append({'list_id': list_id, 'stimulus_ids': [r['trial_id'] for r in ordered], 'shorter_first': True})
    groups = []
    for _, target in targets:
        phrase_id = opaque_phrase(target)
        rows = [r for r in unique.values() if r['target_id'] == target]
        phrase_tasks = {r['task'] for r in rows}
        if len(phrase_tasks) != 1:
            raise ValueError('Phrase is assigned conflicting tasks')
        group = {'phrase_id': phrase_id, 'phrase_number': phrase_numbers[target],
                 'task': next(iter(phrase_tasks)), 'gates': []}
        for gate in GATES:
            gate_rows = sorted((r for r in rows if r['gate_stage'] == gate),
                               key=lambda r: (r['analysis_family'] != 'main', SYSTEMS.index(r['system']), r['condition']))
            group['gates'].append({'gate': gate, 'exposed_word_count': gate_rows[0]['exposed_word_count'],
                                   'stimulus_ids': [r['trial_id'] for r in gate_rows]})
        groups.append(group)
    binding = {
        'source_study_id': manifest['study_id'], 'stimuli': stimuli, 'metadata': metadata,
        'lists': public_lists, 'groups': groups,
        'audio': [{k: a[k] for k in ('stimulus_id', 'sha256')} for a in assets],
    }
    build_id = hashlib.sha256(encoded(binding)).hexdigest()[:24]
    return {'schema_version': 1, 'build_id': build_id, 'preview_only': True, 'recruitment_ready': False,
            'stimuli': stimuli}, metadata, public_lists, groups, assets


def export(manifest_path, receipt_path, output):
    manifest, source_receipt = verify_inputs(manifest_path, receipt_path)
    public, metadata, lists, groups, assets = prepare(manifest, source_receipt)
    output = Path(output)
    # A separate review directory ensures the existing historical root site is untouched.
    if output.name != 'review':
        raise ValueError('Output must be a dedicated review directory')
    data_dir, audio_dir = output / 'data', output / 'audio'
    data_dir.mkdir(parents=True, exist_ok=True)
    audio_dir.mkdir(parents=True, exist_ok=True)
    for asset in assets:
        destination = audio_dir / asset['filename']
        if not destination.exists() or file_hash(destination) != asset['sha256']:
            shutil.copyfile(asset['source'], destination)
        if file_hash(destination) != asset['sha256']:
            raise ValueError('Copied playback audio differs from its source')
    build_id = public['build_id']
    documents = {
        'stimuli.json': public,
        'metadata.json': {'build_id': build_id, 'stimuli': metadata},
        'lists.json': {'build_id': build_id, 'lists': lists},
        'groups.json': {'build_id': build_id, 'phrases': groups},
    }
    for name, value in documents.items():
        (data_dir / name).write_text(json.dumps(value, ensure_ascii=False, indent=2) + '\n')
    receipt = {
        'schema_version': 1, 'build_id': build_id, 'preview_only': True, 'recruitment_ready': False,
        'stimulus_count': len(public['stimuli']), 'audio_count': len(assets), 'text_count': 12,
        'phrase_count': len(groups), 'list_count': len(lists), 'items_per_list': 6,
        'shorter_gate_first': True, 'one_phrase_per_assignment': True,
        'pending_endpoint_count': sum(row['pending_endpoint'] for row in metadata),
        'analysis_families': dict(Counter(r['analysis_family'] for r in metadata)),
        'systems': dict(Counter(r['system'] for r in metadata)),
        'audio_policy': 'Exact bytes from existing shared-gain playback files; no conversion or individual normalization',
        'public_files_sha256': {name: file_hash(data_dir / name) for name in documents},
        'audio': [{k: a[k] for k in ('stimulus_id', 'filename', 'sha256', 'bytes')} for a in assets],
        'source_manifest_sha256': file_hash(manifest_path), 'source_receipt_sha256': file_hash(receipt_path),
    }
    (data_dir / 'receipt.json').write_text(json.dumps(receipt, ensure_ascii=False, indent=2) + '\n')
    return receipt


def main():
    workspace = Path(__file__).resolve().parents[2]
    default = workspace / 'experiments/candor_acoustic_cue_study/current/human_pilot'
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--manifest', type=Path, default=default / 'pilot_lists.private.json')
    parser.add_argument('--receipt', type=Path, default=default / 'build_receipt.json')
    parser.add_argument('--output', type=Path, default=workspace / 'candor-audibility-study/review')
    args = parser.parse_args()
    result = export(args.manifest, args.receipt, args.output)
    print(json.dumps({k: result[k] for k in ('build_id', 'stimulus_count', 'audio_count', 'text_count', 'list_count', 'pending_endpoint_count')}))


if __name__ == '__main__':
    main()
