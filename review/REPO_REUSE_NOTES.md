# What we can reuse from the existing study

Inspected on 17 October 2026. The existing study remains available at the repository root. The new collaborator review lives in `review/` so its responses, task wording, and browser storage can remain separate from the earlier pilot.

The repository already supplies a working GitHub Pages structure, separate audio and text presentation, opaque audio filenames, optional notes, playback metadata, and CSV download. Its current trial table contains four blocks and 64 trial rows: 20 question-audio, 20 question-text, 12 turn-audio, and 12 turn-text. Those rows reference 32 audio files; the repository retains 210 WAV files in total. Text omits final punctuation.

## What needs to change for this review

The old turn question asks who is likely to speak next. Our current question asks whether the speaker could reasonably finish at this point. Those are different outcomes, so the old responses must not be combined with new possible-completion judgments.

Use the reviewed target phrases and matching exposed words for the new audio and text cuts. Present the shorter cut before the longer cut, and reveal any full-target comparison only afterward. Keep terminal punctuation out of participant-facing text. Synthesis instructions using a period or question mark remain a separate condition; they do not become punctuation cues shown to the listener.

Shorter-first presentation prevents a later part of the phrase from being revealed before the first judgment. It does not make successive judgments independent: hearing the short cut can affect the later judgment, and comparing other versions can create familiarity. Treat this site as collaborator feedback and a check of the materials. Preserve the one-version-per-source restriction in the separate recruited-participant design.

## Response saving and results

The old site has a configured Google Apps Script endpoint. A read-only health check returned HTTP 200 and `{"ok": true, "service": "candor-study"}`. No test responses were submitted. This checks that the service responds; it does not establish that a new response is stored successfully or that we can read the existing spreadsheet.

The old browser code submits with `no-cors`, so it cannot inspect the server's acknowledgment. Its “Saved” status is therefore not proof of durable remote storage. The Apps Script supplied in this repository has a health response and append function, but no function for retrieving aggregate results. The old page writes browser storage without a resume loader.

The new review must not silently send records to that older endpoint. Results calculated from this browser or from explicitly imported review exports should say which records they include. GitHub Pages alone does not combine visitors' responses into a shared database. A cross-reviewer view requires collected exports or a separately configured, verified response service.

Report response counts and proportions by task, cut, modality, synthesis condition, and system, including `unsure`. Report technical feedback separately from perceptual judgments. Keep punctuation-manipulation results separate from neutral synthesis. Do not turn these small, repeated collaborator judgments into claims of equivalence, model superiority, or recruited-participant results. Show summaries after judgments to avoid revealing earlier reviewers' responses before people answer.

## What belongs in the public repository

Publish only the selected playback assets, gated text, public page code, and the metadata needed to identify the displayed versions. Keep source conversation files, private source/speaker mappings, cloning-reference recordings, local absolute paths, credentials, and existing participant records outside this repository. Public audio remains downloadable even when a player's download button is hidden.

Review exports can stay on each reviewer's device until shared deliberately. Any later published aggregate should omit participant identifiers and free-text notes. Preserve existing audio, response exports, and the older site's browser storage rather than replacing them when publishing this review.
