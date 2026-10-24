# Cognition researcher self-test

This is the complete current 39-item study for the researcher to test. It includes
a volume check, five practice items, and one assigned version/cut of each of the
39 experimental phrases. It does not open participant recruitment.

## Files and setup

- `index.js` contains the current study source, manifest, styles, and the pinned
  jsPsych html-keyboard-response 2.2.0 plugin. No separate plugin upload is needed.
- Use a dedicated Cognition task running **jsPsych 8.2.3**. Its normal jsPsych runtime
  must provide `initJsPsych` and `jsPsychModule`; the package does not bundle the
  jsPsych runtime itself.
- Create a personal access token in your Cognition account and save it as the
  GitHub repository secret **COGNITION_PERSONAL_ACCESS_TOKEN**. Keep the token out
  of source files and this README.
- Run the repository's manual Cognition self-test GitHub Actions workflow. It
  deploys the `cognition-self-test` branch containing `index.js` and this README.
- Open the resulting task URL with
  `?condition=1&preview_id=harsha-self-test-01` appended (use `&` if the URL already
  has query parameters). **One condition is sufficient for this personal run.**
- With no host `CONDITION` value, this self-test alone defaults to condition 1.
  An explicitly invalid condition is rejected. Conditions 1–42 select the
  existing W01 lists; this does not change assignments or audio. Configure all
  **42 conditions only when preparing that cohort**, not for this personal check.
- Alternatively, paste the complete `index.js` into a dedicated jsPsych 8.2.3
  task's JavaScript editor. The GitHub Actions route is the packaged workflow;
  no manual repository-import UI is assumed.

The audio URLs use the public `/candor-audibility-study/study40/` paths, including
four new practice/volume recordings. Verify publication and playback before the
hosted run; this package receipt alone does not prove the URLs are online.

## Complete the check

Run all 39 items, including setup, both sections and the optional break. Check
that answers require a complete first listen, pause/replay work, text questions
read correctly, technical reports have no perceptual answer, and a reload resumes
the same list. Finish, then export the Cognition data and inspect the records.
Use a fresh `preview_id` for a new independent run; keep the same value to test
resume. Do not delete browser storage to restart before downloading prior data.

All data is marked `researcher_self_test=true`, `run_purpose=researcher_self_test`
and `run_mode=preview` through jsPsych. Setup/practice are separate from the 39
experimental responses. Consent is labelled `researcher_self_test_v1`. Readiness
flags remain false and there is no Prolific completion redirect or live validation
hook requirement. These flags must remain false after packaging: only a completed
hosted save/export/resume check supplies that evidence.

Source build: `b_43c6ff7db612f6d76e9a0dd8`. Source bundle SHA256: `1abeeb4207aa7005d6b508f726c75b12fbcbbb478df78e136d238603fc1dcb3e`.
Plugin SHA256: `126e54c03acb3c36686c88b892cc281e4cf242b39f4fa4bfcbdc01dac9890912`. The accompanying local receipt records provenance;
it is not needed for importing or running the task.

Official references:
- [Cognition conditions and the condition URL parameter](https://docs.cognition.run/digging-deeper/inter-experiment-conditions)
- [Pinned jsPsych plugin source](https://unpkg.com/@jspsych/plugin-html-keyboard-response@2.2.0/dist/index.browser.js)
- [Plugin package metadata](https://unpkg.com/@jspsych/plugin-html-keyboard-response@2.2.0/package.json)
- [jsPsych MIT license](https://github.com/jspsych/jsPsych/blob/main/license.txt)
