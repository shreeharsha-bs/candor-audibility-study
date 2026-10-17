# Speech continuation user study preview

[Open the preview](https://shreeharsha-bs.github.io/candor-audibility-study/review/).
This is for collaborators to check the questions and recordings before the
recruited pilot. No consent, recruitment quota, payment or production eligibility
is implied by publication. Three audio endings remain under review.

## Give feedback

1. Choose **Start preview**, or **Resume preview** to continue an unfinished
   review. The preview contains six different phrases, one cut and one version
   per phrase. These judgments concern questionhood or possible completion;
   they do not approve technical endpoints.
2. Answer question projection or possible completion, with **Unsure** available.
   Audio trials require playback to reach the end before continuing; this is a
   preview interaction rule, not a settled participant-exclusion rule.
3. Download the completed review and share the JSON file with Harsha through
   your usual channel. Written feedback and per-clip notes are included.

The **Study materials** footer link opens a separate view at `?view=materials`.
It contains the complete cut walkthrough, system selector, and endpoint notes.
Each neutral set has twelve items; each separate punctuation set has four.
Existing `?set=main_text_text` links open that view with gated text selected.

An assigned list can still be linked as `?list=P01` through `?list=P28`. A valid
explicit list takes priority. Otherwise the preview resumes the most recently
started unfinished assigned-list session, including one with no saved answers
or one awaiting final feedback. If none exists, it uses the browser's saved list
or chooses one uniformly at random and remembers it. Walkthroughs are never
resumed as participant previews. This is a browser-local assignment, not global
balanced recruitment; the 28 lists are coverage templates, not a sample size.

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
without doing a review, open **Analyse downloaded reviews** in Study materials,
or use `?view=results`. Counts and response
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

Browser saving is specific to the origin and build. Reload and choose **Resume
preview** to continue; walkthroughs resume from their selected set in Study
materials. The simplified interface preserves the build ID, storage key, audio,
text, reviews, drafts, imports and export formats. Assignment and materials-view
bookkeeping are stored outside exported sessions. Expanding the stimulus details
records prior exposure for any later judgments. Old versions remain in browser
storage when a build changes.
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
