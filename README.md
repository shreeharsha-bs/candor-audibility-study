# CANDOR Audio Judgment Study

Static GitHub Pages study for the CANDOR proxy-task audibility lists.

## What is included

- `index.html`, `styles.css`, and `app.js`: browser study interface.
- `data/trial_lists.js`: three blind counterbalanced lists, 40 trials each.
- `audio/`: copied prompt WAV files used by the lists.
- `config.js`: set the response-saving endpoint.
- `apps-script.gs`: optional Google Apps Script backend for saving responses to Google Sheets.

The browser-facing trial data does not include gold labels, transcripts, or reference audio.

## URLs

Use one of these forms after GitHub Pages is enabled:

```text
/candor-audibility-study/?list=01
/candor-audibility-study/?list=02
/candor-audibility-study/?list=03
```

You can also prefill a participant id:

```text
/candor-audibility-study/?list=01&participant=P001
```

## Saving Responses Automatically

GitHub Pages cannot write response files by itself. Use an external endpoint.
The included default path is Google Sheets via Apps Script:

1. Create a Google Sheet.
2. Open Extensions -> Apps Script.
3. Paste `apps-script.gs` into the script editor.
4. Deploy as a Web App.
5. Set access to Anyone with the link.
6. Copy the Web App URL.
7. Paste it into `config.js` as `SUBMIT_URL`.

The page also stores responses in browser localStorage and provides an Export CSV button at the end.

## Privacy Note

The `audio/` files are real prompt recordings. If this repository or its Pages deployment is public, those recordings are publicly accessible.
Use a private Pages deployment, an authenticated study platform, or another access-controlled host if the recordings should not be public.
