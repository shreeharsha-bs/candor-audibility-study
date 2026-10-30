# CANDOR batch workbench

Open [the workbench](./) to review completed Cognition exports from the question-act and turn-completion studies. Add each batch to the same browser workspace to accumulate coverage and inspect response patterns. The workbench does not download or delete Cognition runs; those steps remain manual.

## After each batch

1. Download the completed-batch ZIP from Cognition and keep the original archive.
2. In **Choose batch files**, select the ZIP, or drop it onto **Add a batch**. Standalone CSV, TSV, JSON and JSONL exports also work. Both tasks can be imported together.
3. Check the import message, then review **Batch review** and **Sessions & imports** for technical reports, invalid rows, conflicts, repeated participant exposure and missing evidence.
4. Use **Coverage** to inspect every planned phrase × version × gate cell, including zeros. A count opens that phrase in **Phrase explorer**, where its recordings and responses can be inspected.
5. Download a **workbench backup**. Keep both that backup and the original Cognition archives before clearing browser storage or moving to another device.

An imported completion marker and all assigned main answers establish only that a session is complete in the supplied data. Missing rows do not establish dropout. The workbench cannot see active Cognition runs or certify that every native run was exported. Check Cognition's run inventory yourself before deleting runs.

## Data stays in the browser

Files are parsed locally and stored in IndexedDB for this site, browser profile and device. Response files are not sent to GitHub, Google, Cognition or an analysis server. The page loads its public study catalog and selected audio assets from the study website. Clearing site data, using private browsing or changing browsers can remove or separate the saved workspace.

**Download workbench backup** creates a local ZIP containing the imported raw rows, import provenance, registered assignment schedules and session-exclusion decisions. Restore it through **Choose batch files**. Backups contain participant identifiers from the source exports; store them with your research data. Coverage CSVs and review summaries are convenient analysis outputs, not substitutes for the response archives.

## What counts toward coverage

The target is 12 usable new ratings for each required cell: 1,134 cells for question act and 378 cells for turn completion. All planned cells remain in the denominator. Ratings above 12 are retained, and valid answers from incomplete imported sessions remain available.

Repeated imports are deduplicated by response content and stable study/session/response identity. Native run numbers and filenames can be reused after Cognition deletion without replacing an earlier participant's responses. Conflicting answers under one identity are preserved for review and held out of coverage. Repeated exposure to a phrase across one participant's sessions is also held for review.

Researcher tests have a separate **Records** view and do not satisfy participant targets. Unknown builds or assignment waves, malformed identities, invalid choices and required audio that was not fully heard do not enter usable coverage. Technical reports remain visible but do not add a usable rating.

In **Sessions & imports**, inspect a session to exclude or restore it. Exclusion requires a recorded reason, recomputes the analysis and preserves the raw imported rows. Timing, playback errors and response patterns are review flags; they do not automatically reject participants. Removing an import affects only the browser workspace.

## Read the two tasks separately

Question-act plots show the share of **Yes** responses to whether the phrase sounds like asking or starting a question. They are not accuracy scores.

Turn-completion plots show how often the **longer sentence** was chosen. The design has three separate analysis roles:

- **Primary:** original speech plus four TTS systems using the actual source text. This is S for End phrases and S+C for Cont phrases, with nine phrases in each group.
- **Secondary, Cont only:** compare TTS from S+C against TTS from S alone, matched by phrase, system and gate.
- **End support:** additional End exposures shown separately. They do not increase the primary target counts.

The turn gates are early, late and shared end. A shared-end excerpt is the matched gated region, not the whole longer sentence. The longer sentence remains a response foil for End phrases.

Aggregate response proportions weight each observed phrase cell equally and report how many planned phrases are missing. Matched differences use phrases observed on both sides and show their support. Illustrative examples disclose their selection rule. No confidence intervals, significance tests or power claims are produced; repeated participants and phrases require a separate inferential analysis. Use interim results to identify technical or data problems while retaining the declared per-cell stopping target.

## The next batch needs its assignment wave

The current 40-run question wave uses 40 of 42 base lists. Its assignments cover 1,080 of 1,134 required cells, leaving 54 cells unassigned. Deleting runs and repeating this same wave cannot fill those gaps. Prepare the next wave from cumulative coverage before recruiting again.

Import the frozen JSON schedule for a future wave alongside its response export. The workbench validates the schedule and rechecks retained unknown-wave records. It does not generate or deploy assignment waves, maintain a reservation ledger for active sessions, or launch recruitment. Keep the 40-run cap and perform Cognition download/deletion yourself; the workbench provides evidence for the next review.

## Import limits

Use standard, unencrypted ZIP exports. The reader verifies ZIP structure, CRC checksums and file bounds. Limits are 50 MiB per input, 20 MiB per expanded entry, 200 MiB total expanded ZIP content and 2,000 entries; the workspace also caps raw imported rows. A failed import reports the problem without silently accepting a damaged archive. Retain the source file and re-export a smaller batch if a limit is reached.
