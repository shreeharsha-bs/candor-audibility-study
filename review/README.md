# Speech and text preview

[Open the preview](https://shreeharsha-bs.github.io/candor-audibility-study/review/).
This is for collaborators to check the questions and recordings before the
recruited pilot. No consent, recruitment quota, payment or production eligibility
is implied by publication. Three audio endings remain under review.

## Give feedback

1. Choose **Try the participant task** for six different phrases, one cut and
   one version per phrase. An assigned list can be linked as `?list=P01` through
   `?list=P28`. These are coverage templates, not a participant-count decision.
2. Or choose **Review a set of cuts** to check both cuts from original speech,
   a TTS system, or gated text. Each neutral set has twelve items; each separate
   punctuation set has four. `?set=main_text_text` selects gated text.
3. Answer question projection or possible completion, with **Unsure** available.
   Audio trials require playback to reach the end before continuing; this is a
   preview interaction rule, not a settled participant-exclusion rule.
4. Download the completed review and share the JSON file with Harsha through
   your usual channel. Written feedback and per-clip notes are included.

The shorter prefix of each phrase has fewer words, even when speaking rates
differ across systems. All shorter-prefix items precede longer-prefix items.
No full phrase or transcript is exposed before an audio judgment. A walkthrough
does expose a phrase twice; this reduces later-word exposure before the short
judgment but does not remove familiarity or carryover. Walkthrough and assigned-
list summaries therefore remain separate. Starting another review records prior
stimulus exposure in this browser. Viewing results is also recorded for later
reviews. These browser flags cannot detect exposure on another device.

## Calculate results here

After completing a review, choose **See results**. Import other completed JSON
reviews to calculate combined summaries in the same browser. To analyse files
without doing a review, open **Already have downloaded reviews?** on the start
page. Counts and response
percentages include Unsure in their denominators. Main and punctuation trials,
the two tasks, systems, cuts, review modes and recorded prior exposure remain
separate. The page counts sessions, not distinct people. It shows descriptive
preview feedback, with no significance tests or equivalence claims.

Imports check the build, assigned sequence, valid responses and complete review.
Exact copies of a session count once; conflicting copies are rejected. Wrong-
build files and participant-study exports are rejected. Download the combined
collection to retain the imported material. Files are processed locally; nothing
is posted to Google Sheets, Cognition or GitHub. GitHub Pages serves the app and
audio but cannot itself write a shared response database. Cognition remains the
planned host and store for the recruited Prolific pilot.

Browser saving is specific to the origin and build. Reload and choose the same
list/set to resume. Old versions remain in browser storage when a build changes.
Use downloads for backup. The earlier pilot's browser storage is untouched.
Because this repository is public, its audio and analysis metadata are public;
UI blinding is not access control. No private source IDs, local filesystem paths,
raw curation reviews, credentials or participant identifiers are included.

## Contents and verification

- `data/stimuli.json`: 104 presentations, including 92 audio cuts and 12 text cuts.
- `data/metadata.json`: system, condition, exact exposed words and endpoint status.
- `data/lists.json`: 28 six-item assignments, shorter cuts first, no repeated phrase.
- `data/groups.json`: the two word prefixes for each of six phrases.
- `data/receipt.json`: build ID, counts and exact file hashes.
- `audio/`: copies of the existing shared-gain playback WAVs; no new synthesis,
  trimming, gain adjustment or resampling.
- `results.js`: validated imports and descriptive analysis, tested with Node.

Serve the repository locally with `python3 -m http.server 8771 --bind 127.0.0.1`
and open `/review/`. Run `node --test tests/*.test.js` from the repository root.
The stimulus exporter is `scripts/export_candor_current_pages.py`. Its input
is the current private pilot mapping and validation receipt, not the historical
study manifest. Pass explicit `--manifest`, `--receipt` and `--output` paths
when running outside the research workspace. Test it with
`python3 -m unittest discover -s tests -p 'test_export*.py'`.
Rebuild the private mapping first after changing any source audio or reviews.
Never upload the private mapping or raw participant exports.
