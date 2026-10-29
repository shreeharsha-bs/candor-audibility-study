# CANDOR speech study

[Sentence-fit preview](https://shreeharsha-bs.github.io/candor-audibility-study/sentence-fit/) · [New sentence-fit task in Cognition](https://b09ue0q3dv.cognition.run/) · [Original participant study](https://p9uk26euoi.cognition.run/) · [Original study materials](https://shreeharsha-bs.github.io/candor-audibility-study/study40/?view=materials)

## Sentence-fit study

The new preview uses a simple participant screen: the gated audio (or matched
text), two full sentence choices, a technical-problem option, and Next. The audio
question is: “Which of these two sentences does the audio sound more likely to be
part of?” This is a relative-fit judgment; it has no correct-source answer key.

There are 60 counterbalanced lists of 18 experimental items. Each phrase appears
once per list, with six early, six late, and six shared-end presentations. Across
lists, all 486 gated audio clips and 54 text presentations appear twice, with the
sentence-choice order reversed. The researcher approved all cuts; the existing
486 playback files remain byte-for-byte unchanged.

The public page starts with the experimental items. Add `?practice=1` to include
the headphone/volume setup and two separate practice items, or `?condition=1`
through `?condition=60` to inspect a particular list. Preview choices stay in the
browser and are separate from participant responses. Earlier cut-review records
and automated diagnostics are preserved in the research archive and Git history.

The separate Cognition task is configured for direct testing with 60 conditions.
Test records are explicitly marked as engineering QA and excluded from participant
analysis. Paid recruitment is not open; the new study's recruitment information
and completion URL still need to be configured. The original study and its
responses retain their original questions.

## Original questionhood and turn-completion study

The study presents 39 experimental items in two sections, with a volume check and
five separate practice items. Partial turn judgments ask whether the speaker is
close to finishing or likely to keep speaking for a while. Full-target checks
separately ask whether the speaker could naturally finish here. Questionhood
uses Yes/No.

Participants move directly to the next section’s instructions without a break
screen. Trials show the question without a full-phrase label. The completion
page confirms saving and offers no participant response download.

The participant study retains all 1,233 experimental WAVs and four preparation WAVs. All 84
assignments retain their 39 experimental presentations. Old pilot pages and unused
recordings were archived before removal; earlier Git commits preserve them.
Browser responses and colleague reviews have not been erased. Private mappings
and response exports are not published.

## Cognition deployment

The public `cognition/index-W01.js` and `index-W02.js` packages contain the study
and the short consent confirmation, with the Prolific completion URL omitted. Configure
that URL directly in Cognition using the local participant package. Do not commit
the configured package or completion code to this repository. Audio loads from
this site's permanent paths.

The previous GitHub-to-Cognition import workflow has been retired so it cannot
overwrite the task's Cognition-only configuration with an incomplete public
package. Previous import and self-test branches remain historical references.

The task uses 42 Cognition conditions for W01. W02 has a separate package and must
use a separate task, also with 42 conditions. In Prolific, paste the Cognition
URL and choose URL parameters for `PROLIFIC_PID`, `STUDY_ID` and `SESSION_ID`.
Never put `condition`, `list`, `cohort`, `preview_id` or `demo=true` on a recruitment
link. The actual Prolific completion URL belongs in participant settings; the
app redirects only after Cognition confirms its final save.

Genuine Prolific arrivals are recorded as `run_mode=live`, `source=prolific`.
Direct visits use a separate direct session identity and remain excluded from
participant analysis. Both use participant-facing wording. No answers or IDs
are invented. Full study information is in the Prolific study description. Cognition displays
only the researcher-provided consent sentence and agree/decline buttons. The
Prolific completion link is configured only in Cognition. Consent records its version and acceptance
time. Responses are retained while useful for research, individual responses
are not shared, and withdrawal requests go to shbs@kth.se.

## Check before the first six participants

Complete the configured study through Prolific's preview, inspect the Cognition
Finished status, download its data, and verify 39 judgments, five practice records,
audio setup and completion. Confirm the return to Prolific. Set the Prolific completion path to **Manually
review**, then match submissions to saved Cognition responses before approval. Preserve test runs
and exclude them from recruitment analysis. Check actual timing and payment
before the first six paid participants within the planned 84.

Cognition distributes incoming runs, but browser reloads or direct visits can
consume host assignments. Reconcile the exported actual list IDs and recover
any missing coverage. Prolific exclusions handle previous participation across
cohorts; browser storage alone cannot do that.

[Official Cognition GitHub integration](https://docs.cognition.run/digging-deeper/github-integration) · [Prolific IDs and saving](https://www.cognition.run/integrating-jspsych-with-prolific-sona-and-mturk-participant-ids-completion-codes-and-redirects-without-losing-data)
