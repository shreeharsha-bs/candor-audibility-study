# CANDOR Audio Judgment Study

## Current collaborator preview — October 19, 2026

**[Open the speech continuation user study preview](https://shreeharsha-bs.github.io/candor-audibility-study/review/).**

Choose **Start preview** to compare all versions phrase by phrase, or **Resume
preview** to continue. Each phrase includes original speech, four TTS systems,
text, and both cuts. Punctuation versions appear separately where available.
The full review contains 104 presentations. Playback and answers are optional:
Continue saves any answers and notes and records the rest as skipped. Skipped
versions do not enter rating counts or percentages. Earlier six-item previews and technical
notes remain under **Study materials**.

The `review/` page contains all 92 current audio cuts and 12 matching text
prefixes: original speech, OmniVoice, F5-TTS, CosyVoice2 and Qwen3-TTS Base.
Neutral synthesis and the separate punctuation pilot remain distinguishable.
Shorter cuts precede longer cuts within each phrase. Results are calculated locally from completed
reviews and imported files; this is not an automatic shared response database.

See [review instructions](review/README.md) and [what was reused](review/REPO_REUSE_NOTES.md).
Three audio endpoints still need listening approval. This is a collaborator
preview, not the recruited Prolific pilot. The earlier app, recordings, response
endpoint and local-storage keys below remain unchanged apart from a link to the
current preview. The historical next-speaker task is not the current possible-
completion task.

## Earlier pilot

Static GitHub Pages study for the CANDOR proxy-task audibility lists.

Current intended pilot: short, blinded CANDOR question-act and floor-transfer
items in separate audio-only and text-only blocks. Text stimuli omit final
punctuation so a question mark cannot reveal the answer.

## What is included

- `index.html`, `styles.css`, and `app.js`: browser study interface.
- `data/trial_lists.js`: blind counterbalanced lists generated from curated audio/text manifests.
- `audio/`: copied prompt WAV files used by the lists.
- `config.js`: set the response-saving endpoint.
- `apps-script.gs`: optional Google Apps Script backend for saving responses to Google Sheets.

The browser-facing trial data does not include gold labels, transcripts, or reference audio.


## Regenerate From A New SLURM Extraction

After the extraction job finishes, rebuild the Pages pilot from the nested project root:

```bash
python scripts/export_candor_pages_pilot.py   --source-dir output/candor_proxy_tasks_matched_q_turn_completion   --pages-dir docs/candor-audibility-study   --clean-audio
```

This copies the prompt WAVs referenced by the blind audibility lists and rewrites `data/trial_lists.js`.

## URLs

Use one of these forms after GitHub Pages is enabled:

```text
/candor-audibility-study/?list=01
/candor-audibility-study/?list=02
/candor-audibility-study/?list=03
```

Use block-specific links so lexical and acoustic evidence stay separated:

```text
/candor-audibility-study/?block=question_audio&list=01
/candor-audibility-study/?block=question_text&list=01
/candor-audibility-study/?block=turn_audio&list=01
/candor-audibility-study/?block=turn_text&list=01
```

Text-only trial rows should set `trial_mode: "text"` or omit `audio_url`, and
should provide `display_text`, `text`, or `keep_text`. Audio-only trial rows
should set `trial_mode: "audio"` and provide `audio_url`.

The generated browser manifest uses opaque sample IDs and audio filenames. The
private answer key is written outside this Pages repository by
`scripts/build_curated_pilot.py`.

You can also prefill a participant id:

```text
/candor-audibility-study/?list=01&participant=P001
```

## Saving Responses Automatically

GitHub Pages cannot write response files by itself. Use an external endpoint.
The included default path is Google Sheets via Apps Script:

1. Create a Google Sheet.
2. Open Extensions -> Apps Script.
3. Paste `apps-script.gs` into the script editor.
4. Deploy as a Web App.
5. Set access to Anyone with the link.
6. Copy the Web App URL.
7. Paste it into `config.js` as `SUBMIT_URL`.

When moving from an older deployment to the four-block study, paste the current
`apps-script.gs` and deploy a new Web App version. The new schema records
`study_block`, `trial_mode`, and `display_text`.

The page also stores responses in browser localStorage and provides an Export CSV button at the end.

## Privacy Note

The `audio/` files are real prompt recordings. If this repository or its Pages deployment is public, those recordings are publicly accessible.
Use a private Pages deployment, an authenticated study platform, or another access-controlled host if the recordings should not be public.
