# Cognition participant study — W01

This package contains the current 39-extract study, including the volume check
and five separate practice items. Its manifest and assignment order are preserved
from build `b_17f15f6c38f7227d71a2ba2d`. It uses native Cognition assignment and response saving.

Use a dedicated jsPsych 8.2.3 Cognition task for cohort W01, with its existing
42 conditions. The html-keyboard-response 2.2.0 plugin is embedded. `CONDITION`
must come from Cognition; there is no fallback condition or self-test labelling.
The host's jsPsych runtime is still required.

Researcher-provided settings come from the packaging JSON file:
`consent_version`, `consent_paragraphs` (an array), and `completion_url`.
Absent values remain absent. The welcome contains factual participant information;
missing consent settings leave the task unavailable before consent or trials.
A Prolific return link is required for a recruited session with all three Prolific
identifiers. It must be the actual HTTPS Prolific completion URL, not an example.

Configuration gaps in this package:
- Direct visit: consent_version, consent_paragraphs
- Prolific visit: consent_version, consent_paragraphs, completion_url

Direct visits use the neutral participant interface and a generated session ID;
their internal preview classification keeps them outside participant analysis.
Prolific visits must supply all three identifiers (PROLIFIC_PID, STUDY_ID,
SESSION_ID); partial identifier sets are rejected. Do not add condition/list/cohort
overrides to recruitment links. Final return to Prolific follows Cognition's
completion acknowledgement. Verify a hosted save/export/resume run separately.

The package does not assert consent approval, deployment, recruitment, or hosted
validation. It contains no fabricated readiness booleans. Existing historical
researcher self-test packages and records retain their original meaning.

Audio remains at the existing public `/candor-audibility-study/study40/` paths.
Source bundle SHA256: `f773bbbf7c821f0c3ff8c0e9274c9ded95fe230017c1720bc048a6944bd833fe`.
Plugin SHA256: `126e54c03acb3c36686c88b892cc281e4cf242b39f4fa4bfcbdc01dac9890912`.
The local receipt records source, settings and output hashes; it need not be
copied into the task import branch.
