# Separate study tests

These pages test question-act interpretation and the revised sentence-choice task without Cognition. Participant recruitment remains disabled. `shared/config.js` selects local preview or an Apps Script test deployment.

- `question/`: 27 phrases, 14 versions, three gates; 1,134 planned combinations.
- `turn/`: 18 phrases, audio only; 270 primary combinations and 108 secondary combinations. The prepared End phrases have five audio versions and Cont phrases have nine. No new synthesis was made.

The primary turn comparison uses original speech and four TTS systems given the actual source text: S for End, S+C for Cont. The secondary comparison is within Cont, matching S-alone and S+C synthesis by phrase, system and gate. End phrases' longer sentences are response choices only. The interface shows neither source labels nor system names.

## Coverage and assignment

The new collection target is 12 usable judgments per planned combination. Earlier question judgments and all preview/test records are outside that target.

The question study has 42 base lists of 27 trials. Each participant encounters every phrase once. One complete cycle covers all 1,134 combinations.

The turn study has 27 mixed base lists of 18 trials, with nine End and nine Cont phrases and three presentations at each gate within each group. Every session has five primary trials per group with matched system exposure. The remaining four Cont trials use S-alone synthesis; four End support trials maintain matching system exposure and task composition. Support observations are marked before collection and do not satisfy primary quotas. One complete cycle covers all 378 required combinations plus 108 support observations.

Twelve complete cycles correspond to 504 question sessions and 324 turn sessions. These are ideal totals, not a stopping rule. The server counts saved usable responses, tracks active reservations, and selects lists using coverage deficits without examining answer values. Unfinished reservations expire; saved partial responses remain. Retries use stable identifiers and must not duplicate judgments. Technical problems and exclusions remain visible and do not fill usable-rating quotas.

Coverage must be checked for every planned combination, including zero-count cells. Plot the prespecified primary conditions and Cont secondary conditions separately. Do not select a subset of phrases after collection merely to obtain shared support across conditions.

## Test delivery

The Google Sheet and Apps Script project are private research infrastructure. Public files contain stimuli and application code only. The response endpoint returns only the authenticated session's own assignment and save acknowledgements. It must never expose aggregate response rows, other participants' identifiers, or an administrative key.

A local preview explicitly keeps choices on the device. A connected test run is saved with `mode=test`, separate from participant coverage. Live collection requires both the server and page configuration to be enabled after the full saving and Prolific-return flow is tested.
