# Cognition participant packages

`index-W01.js` and `index-W02.js` are complete participant packages for the two
cohorts, each with 42 server-assigned conditions and 39 experimental trials per
participant. They include the jsPsych html-keyboard-response plugin and load all
audio from this repository's GitHub Pages site. Use jsPsych 8.2.3.

The W01 task is https://p9uk26euoi.cognition.run/. W02 requires its own
Cognition task when the second cohort is opened.

These public packages contain the short consent confirmation, but
`completion_url` is deliberately null. The configured version is uploaded directly
to Cognition from the local researcher workspace; never commit its completion code
here. The GitHub import workflow has been retired to prevent overwriting the
Cognition-only settings. Earlier import branches remain historical references.

Full study information is provided in the Prolific study description. Cognition
shows only the researcher-provided consent confirmation and agree/decline buttons.
Participants must agree before the hearing and volume checks, practice and
experimental trials. Consent version: `participant_consent_v2_2026-10-24`.
Prolific return happens only after the global Cognition completion callback.
A complete saved run and return still need checking through the hosted task
before recruitment. Use Prolific's **Manually review** completion path and match
submitted participant IDs against saved Cognition responses before approval.

All 84 assignments and 1,237 audio files retain their identities and content.
Partial remaining-length judgments and full-target possible-completion judgments
have separate protocols. Direct visits remain separate from recruited responses.
Historical self-test code and records remain in earlier commits and the preserved
`cognition-self-test` branch.
