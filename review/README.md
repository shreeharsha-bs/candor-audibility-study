# Speech continuation user study preview

[Open the preview](https://shreeharsha-bs.github.io/candor-audibility-study/review/).
Colleagues can compare every version of each phrase and flag unclear questions
or recordings before the recruited pilot. Three audio endings remain under review.

## Give feedback

1. Choose **Start preview**, or **Resume preview** to continue an unfinished
   review. For each phrase, the page shows original speech, all four TTS systems,
   and gated text together. Listen and answer selectively, then continue to the
   longer cut of that phrase. Continue is always available; unanswered versions
   are saved as skipped.
2. Answer question projection or possible completion, with **Unsure** available.
   Playback and answers are optional throughout the collaborator preview,
   including earlier lists and single-system walkthroughs. You can leave notes
   without rating a clip. The recruited-participant study is unchanged.
3. Punctuation versions appear in their own section for the two phrases that
   have them. Each phrase therefore has either 12 versions (six per cut) or
   28 versions (six main and eight punctuation versions per cut). The complete
   review covers all 104 presentations: 92 audio and 12 text.
4. Pause whenever needed. Individual choices and notes save automatically, even
   before continuing to the next cut. Reload and choose **Resume preview** to
   continue. Only one recording plays at a time.
5. Download the completed review and share the JSON file with Harsha through
   your usual channel. Written feedback and per-clip notes are included.

The **Study materials** footer link opens a separate view at `?view=materials`.
It contains the single-system walkthroughs, endpoint notes, and earlier lists.
Each neutral set has twelve items; each separate punctuation set has four.
Existing `?set=main_text_text` links open that view with gated text selected.

Earlier six-item previews remain available through `?list=P01` to `?list=P28`,
or under **Earlier six-item previews** in Study materials. Their saved reviews
are preserved. The plain `/review/` address always opens the full comparison;
an old unfinished six-item review does not replace it.

The shorter prefix of each phrase has fewer words, even when speaking rates
differ across systems. The full comparison presents shorter then longer cuts
within each phrase. System names and the matching gated text are visible so
reviewers can compare the versions directly. Hearing or reading one version can
affect the next answer, so these comparisons help prepare the participant pilot.
They remain separate from the earlier single-version previews in the results.
Single-system walkthroughs keep their existing order: all shorter cuts, then
all longer cuts. The original recordings and text have not changed.

## Calculate results here

After completing a review, choose **See results**. Import other completed JSON
reviews to calculate combined summaries in the same browser. To analyse files
without doing a review, open **Analyse downloaded reviews** in Study materials,
or use `?view=results`. Counts and response
percentages include Unsure in their denominators. Skipped versions are excluded
from rating counts and percentages; their notes are retained. A review can
finish with no ratings and still provide written feedback. The full-review results show
each phrase separately, so differences between versions refer to the same words.
Main and punctuation versions also remain separate. A full comparison produces
one completed review containing 104 rated-or-skipped records; results wait until it is finished.
The page counts completed reviews, since it has no way to identify distinct people.

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
text, reviews, drafts and imports. The response schema gains the additive mode
`phrase_walkthrough` with selection `all_phrases_v1`, and `choice: "skipped"`
records unanswered versions without treating them as Unsure; old exports still import.
Each cut's draft answers are held by stimulus ID and committed in their fixed
order on Continue, allowing the cards to be answered in any order. Materials-view
bookkeeping is stored outside exported sessions. Expanding the stimulus details
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
