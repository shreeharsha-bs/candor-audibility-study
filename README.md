# CANDOR speech study

[Open the current study](https://shreeharsha-bs.github.io/candor-audibility-study/) · [Review current materials](https://shreeharsha-bs.github.io/candor-audibility-study/study40/?view=materials)

The current study presents 39 experimental items in two sections. Questionhood uses Yes/No. Partial turn judgments ask whether the speaker sounds close to finishing or likely to keep speaking for a while. Full targets separately ask whether the speaker could naturally finish their turn here. A volume check and five practice items are recorded separately.

The site hosts all 1,233 experimental WAVs and four preparation WAVs. Old pilot pages and unused recordings have been removed from the current site after a complete local archive; earlier Git commits also retain them. Existing browser responses and colleague reviews have not been erased.

## Complete the study yourself in Cognition

The `cognition-self-test` branch contains a self-contained `index.js`: the actual W01 study, current questions and stimuli, and the required jsPsych plugin. All audio loads from this GitHub Pages site. The task does not generate answers or shorten the 39-item assignment. Your actual responses are saved by Cognition and marked as a researcher test, separate from participant evidence.

1. Sign in to [Cognition account settings](https://www.cognition.run/account) and copy a Cognition personal access token.
2. In this repository's [Actions secrets](https://github.com/shreeharsha-bs/candor-audibility-study/settings/secrets/actions), add a repository secret named `COGNITION_PERSONAL_ACCESS_TOKEN` with that token. It comes from Cognition, not GitHub; keep it out of code and chat.
3. Open [Deploy Cognition self-test](https://github.com/shreeharsha-bs/candor-audibility-study/actions/workflows/deploy-cognition-self-test.yml), choose **Run workflow**, and keep branch **main**. This imports only the `cognition-self-test` branch using jsPsych 8.2.3. It creates or updates the Cognition task associated with this repository.
4. When the workflow succeeds, open its summary and follow **Open the full study**. This selects the genuine 39-item W01-P01 assignment. A single Cognition condition is sufficient for this personal run; the future cohort setup uses 42 per task. The code includes the researcher-test notice, so leave Cognition's separate consent overlay off for this test.
5. Use headphones, complete the volume check, five practices and all 39 experimental items, then press **Finish**. The same link/browser resumes progress. Do not use the editor's demo preview or add `demo=true`: that does not save a Cognition run.
6. In [Cognition's dashboard](https://www.cognition.run/tasks), check that the run is **Finished** and download its JSON. Expect 39 `judgment` records, five `practice` records, one `audio_setup` record, and completion. Reloading can add marked recovery duplicates; retain the raw export.

If using a new task in the Cognition editor instead, select jsPsych 8.2.3 and paste the complete [ready-to-run source](https://shreeharsha-bs.github.io/candor-audibility-study/cognition/self-test.js). It includes the plugin, configuration and audio URLs. Open the task's normal public URL with `?condition=1&preview_id=harsha-self-test-01`.

This is a complete researcher run using the study's real materials. The code's `preview` mode separates it from recruited participant data. Cognition saving must still be verified by completing and downloading this hosted run. Participant release and Prolific return retain their existing checks.

## Source and preservation

The canonical website path remains `/study40/`, preserving existing links and browser storage. All 84 assignments retain their 39 experimental presentations. Private source mappings, colleague response exports and participant responses are not published here.

The self-test wrapper is generated reproducibly from the verified W01 bundle. The main site also provides disabled future-cohort bundles under `cognition/`; those require completion of the participant-release checks.

References: [Cognition GitHub integration](https://docs.cognition.run/digging-deeper/github-integration), [official deployment action](https://github.com/javidalpe/cognition-deploy-action), [Cognition data saving](https://www.cognition.run/why-your-jspsych-data-is-not-saving-and-how-to-fix-each-cause).
