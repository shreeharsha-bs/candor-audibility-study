# CANDOR speech study

[Participant study in Cognition](https://p9uk26euoi.cognition.run/) · [Study materials](https://shreeharsha-bs.github.io/candor-audibility-study/study40/?view=materials)

The study presents 39 experimental items in two sections, with a volume check and
five separate practice items. Partial turn judgments ask whether the speaker is
close to finishing or likely to keep speaking for a while. Full-target checks
separately ask whether the speaker could naturally finish here. Questionhood
uses Yes/No.

This site hosts all 1,233 experimental WAVs and four preparation WAVs. All 84
assignments retain their 39 experimental presentations. Old pilot pages and unused
recordings were archived before removal; earlier Git commits preserve them.
Browser responses and colleague reviews have not been erased. Private mappings
and response exports are not published.

## Cognition deployment

The `cognition-participant` branch contains the self-contained W01 `index.js`.
The manual **Deploy Cognition participant study** workflow imports it using the
existing `COGNITION_PERSONAL_ACCESS_TOKEN` secret and jsPsych 8.2.3. Audio loads
from this site's permanent paths. The previous self-test branch remains historical
and is no longer the deployment target.

The task uses 42 Cognition conditions for W01. W02 has a separate package and must
use a separate task, also with 42 conditions. In Prolific, paste the Cognition
URL and choose URL parameters for `PROLIFIC_PID`, `STUDY_ID` and `SESSION_ID`.
Never put `condition`, `list`, `cohort`, `preview_id` or `demo=true` on a recruitment
link. The actual Prolific completion URL belongs in participant settings; the
app redirects only after Cognition confirms its final save.

Genuine Prolific arrivals are recorded as `run_mode=live`, `source=prolific`.
Direct visits use a separate direct session identity and remain excluded from
participant analysis. Both use participant-facing wording. No answers or IDs
are invented. Incomplete consent/return settings show the study introduction
but prevent participation; publishing this package does not assert those inputs
are complete.

## Check before the first six participants

Complete the configured study through Prolific's preview, inspect the Cognition
Finished status, download its data, and verify 39 judgments, five practice records,
audio setup and completion. Confirm the return to Prolific. Preserve test runs
and exclude them from recruitment analysis. Check actual timing and payment
before the first six paid participants within the planned 84.

Cognition distributes incoming runs, but browser reloads or direct visits can
consume host assignments. Reconcile the exported actual list IDs and recover
any missing coverage. Prolific exclusions handle previous participation across
cohorts; browser storage alone cannot do that.

[Official Cognition GitHub integration](https://docs.cognition.run/digging-deeper/github-integration) · [Prolific IDs and saving](https://www.cognition.run/integrating-jspsych-with-prolific-sona-and-mturk-participant-ids-completion-codes-and-redirects-without-losing-data)
