# Cognition participant packages

`index-W01.js` and `index-W02.js` are complete participant packages for the two
cohorts, each with 42 server-assigned conditions and 39 experimental trials per
participant. They include the jsPsych html-keyboard-response plugin and load all
audio from this repository's GitHub Pages site. Use jsPsych 8.2.3.

W01 is deployed to https://p9uk26euoi.cognition.run/ through the
`cognition-participant` branch and **Deploy Cognition participant study** workflow.
W02 requires its own Cognition task when the second cohort is opened.

The current packages display participant information and stop before consent or
trials because final consent/privacy text and the Prolific completion URL have
not yet been supplied. Update the source participant settings and rebuild both
packages once those values are available. This is an explicit configuration gap,
not a researcher self-test label on participant data.

All 84 assignments and 1,237 audio files retain their identities and content.
Partial remaining-length judgments and full-target possible-completion judgments
have separate protocols. Direct visits remain separate from recruited responses.
Historical self-test code and records remain in earlier commits and the preserved
`cognition-self-test` branch.
