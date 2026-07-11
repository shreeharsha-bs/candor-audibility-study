#!/usr/bin/env python3
"""Build blinded question/text and turn/audio pilot blocks from curated CANDOR rows."""

from __future__ import annotations

import argparse
import csv
import json
import random
import subprocess
from pathlib import Path
from typing import Any


QUESTION_OPTIONS = [
    {"value": "question", "label": "Question"},
    {"value": "non_question", "label": "Non-question"},
    {"value": "unsure", "label": "Unsure"},
]
TURN_OPTIONS = [
    {"value": "same_speaker_continues", "label": "Same speaker continues"},
    {"value": "other_speaker_takes_floor", "label": "Other speaker takes the floor"},
    {"value": "unsure", "label": "Unsure"},
]


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--curation-csv", type=Path, required=True)
    parser.add_argument("--selection-json", type=Path, required=True)
    parser.add_argument("--site-dir", type=Path, default=Path(__file__).resolve().parents[1])
    parser.add_argument("--answer-key", type=Path, required=True)
    parser.add_argument("--seed", type=int, default=20260711)
    return parser.parse_args()


def read_curation(path: Path) -> dict[str, dict[str, str]]:
    with path.open(newline="", encoding="utf-8") as handle:
        rows = list(csv.DictReader(handle))
    lookup = {row["item_id"]: row for row in rows}
    if len(lookup) != len(rows):
        raise ValueError(f"Duplicate item_id values in {path}")
    return lookup


def as_float(value: Any, field: str, item_id: str) -> float:
    try:
        return float(str(value).strip())
    except (TypeError, ValueError) as exc:
        raise ValueError(f"Missing or invalid {field} for {item_id}: {value!r}") from exc


def extract_audio(row: dict[str, str], start_s: float, end_s: float, output: Path) -> None:
    source = Path(row["source_audio"])
    if not source.exists():
        raise FileNotFoundError(f"Missing source audio for {row['item_id']}: {source}")
    if end_s <= start_s:
        raise ValueError(f"Invalid cut for {row['item_id']}: {start_s} -> {end_s}")

    output.parent.mkdir(parents=True, exist_ok=True)
    channel_index = 0 if row.get("channel", "L").upper() == "L" else 1
    command = [
        "ffmpeg", "-nostdin", "-hide_banner", "-loglevel", "error", "-y",
        "-ss", f"{start_s:.3f}", "-t", f"{end_s - start_s:.3f}", "-i", str(source),
        "-vn", "-af", f"pan=mono|c0=c{channel_index}", "-ac", "1", "-ar", "16000", str(output),
    ]
    result = subprocess.run(command, capture_output=True, text=True, check=False)
    if result.returncode != 0:
        raise RuntimeError(f"ffmpeg failed for {row['item_id']}: {result.stderr.strip()}")


def clean_display_text(value: str) -> str:
    return " ".join(value.strip().rstrip("?.!").split())


def write_answer_key(path: Path, rows: list[dict[str, Any]]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    fields = [
        "base_item_id", "task", "gold", "variant", "pair_id", "source_item_id",
        "corrected_text", "source_audio", "channel", "start_s", "end_s", "duration_s", "public_audio",
    ]
    with path.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=fields)
        writer.writeheader()
        writer.writerows(rows)


def question_trials(
    selection: dict[str, Any],
    curation: dict[str, dict[str, str]],
    site_dir: Path,
    answer_key: list[dict[str, Any]],
    rng: random.Random,
) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    items: list[dict[str, Any]] = []
    serial = 0
    for pair_index, pair in enumerate(selection["question_pairs"], start=1):
        for role in ("question", "control"):
            serial += 1
            source_item_id = pair[f"{role}_item_id"]
            row = curation[source_item_id]
            start_s = as_float(pair.get(f"{role}_start_s", row.get("manual_start_s") or row["current_start_s"]), "start", source_item_id)
            end_s = as_float(pair.get(f"{role}_end_s", row.get("manual_end_s") or row["current_end_s"]), "end", source_item_id)
            base_item_id = f"qitem_{serial:03d}"
            audio_name = f"stim_q_{serial:03d}.wav"
            audio_rel = f"audio/curated/{audio_name}"
            extract_audio(row, start_s, end_s, site_dir / audio_rel)
            corrected_text = clean_display_text(pair[f"{role}_text"])
            items.append(
                {
                    "base_item_id": base_item_id,
                    "question_pair_id": f"qpair_{pair_index:02d}",
                    "audio_url": audio_rel,
                    "display_text": corrected_text,
                    "duration_s": round(end_s - start_s, 3),
                }
            )
            answer_key.append(
                {
                    "base_item_id": base_item_id,
                    "task": "question_act",
                    "gold": "question" if role == "question" else "non_question",
                    "variant": "cue_bearing_clause",
                    "pair_id": pair["pair_id"],
                    "source_item_id": source_item_id,
                    "corrected_text": corrected_text,
                    "source_audio": row["source_audio"],
                    "channel": row["channel"],
                    "start_s": f"{start_s:.3f}",
                    "end_s": f"{end_s:.3f}",
                    "duration_s": f"{end_s - start_s:.3f}",
                    "public_audio": audio_rel,
                }
            )

    rng.shuffle(items)
    audio_trials: list[dict[str, Any]] = []
    text_trials: list[dict[str, Any]] = []
    for index, item in enumerate(items, start=1):
        common = {
            "trial_index": index,
            "base_item_id": item["base_item_id"],
            "task": "question_act",
            "question_pair_id": item["question_pair_id"],
            "prompt_length_condition": "cue_bearing_clause",
            "prompt_duration_s": item["duration_s"],
            "is_attention_check": False,
            "options": QUESTION_OPTIONS,
        }
        audio_trials.append(
            {
                **common,
                "sample_id": f"qa_{index:03d}",
                "study_block": "question_audio",
                "trial_mode": "audio",
                "audio_url": item["audio_url"],
                "audibility_question": "Does this sound like the speaker is asking a question?",
            }
        )
        text_trials.append(
            {
                **common,
                "sample_id": f"qt_{index:03d}",
                "study_block": "question_text",
                "trial_mode": "text",
                "display_text": item["display_text"],
                "audibility_question": "Based only on the words, does this read like a question?",
            }
        )
    return audio_trials, text_trials


def turn_trials(
    selection: dict[str, Any],
    curation: dict[str, dict[str, str]],
    site_dir: Path,
    answer_key: list[dict[str, Any]],
    rng: random.Random,
) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    items: list[dict[str, Any]] = []
    for serial, selected in enumerate(selection["turn_items"], start=1):
        source_item_id = selected["item_id"]
        row = curation[source_item_id]
        start_s = as_float(selected.get("start_s", row.get("manual_start_s") or row["current_start_s"]), "start", source_item_id)
        end_s = as_float(selected.get("end_s", row.get("manual_end_s") or row["current_end_s"]), "end", source_item_id)
        base_item_id = f"titem_{serial:03d}"
        audio_name = f"stim_t_{serial:03d}.wav"
        audio_rel = f"audio/curated/{audio_name}"
        extract_audio(row, start_s, end_s, site_dir / audio_rel)
        corrected_text = clean_display_text(selected["text"])
        items.append(
            {
                "base_item_id": base_item_id,
                "audio_url": audio_rel,
                "display_text": corrected_text,
                "duration_s": round(end_s - start_s, 3),
                "variant": selected["variant"],
            }
        )
        answer_key.append(
            {
                "base_item_id": base_item_id,
                "task": "turn_floor_transfer",
                "gold": selected["gold"],
                "variant": selected["variant"],
                "pair_id": "",
                "source_item_id": source_item_id,
                "corrected_text": corrected_text,
                "source_audio": row["source_audio"],
                "channel": row["channel"],
                "start_s": f"{start_s:.3f}",
                "end_s": f"{end_s:.3f}",
                "duration_s": f"{end_s - start_s:.3f}",
                "public_audio": audio_rel,
            }
        )

    rng.shuffle(items)
    audio_trials: list[dict[str, Any]] = []
    text_trials: list[dict[str, Any]] = []
    for index, item in enumerate(items, start=1):
        common = {
            "trial_index": index,
            "base_item_id": item["base_item_id"],
            "task": "turn_floor_transfer",
            "turn_gate_condition": item["variant"],
            "prompt_length_condition": item["variant"],
            "prompt_duration_s": item["duration_s"],
            "is_attention_check": False,
            "options": TURN_OPTIONS,
        }
        audio_trials.append(
            {
                **common,
                "sample_id": f"ta_{index:03d}",
                "study_block": "turn_audio",
                "trial_mode": "audio",
                "audio_url": item["audio_url"],
                "audibility_question": "At this point, who sounds likely to speak next?",
            }
        )
        text_trials.append(
            {
                **common,
                "sample_id": f"tt_{index:03d}",
                "study_block": "turn_text",
                "trial_mode": "text",
                "display_text": item["display_text"],
                "audibility_question": "Based only on the words, who seems likely to speak next?",
            }
        )
    return audio_trials, text_trials


def main() -> int:
    args = parse_args()
    curation = read_curation(args.curation_csv)
    selection = json.loads(args.selection_json.read_text(encoding="utf-8"))
    rng = random.Random(args.seed)
    answer_key: list[dict[str, Any]] = []

    question_audio, question_text = question_trials(selection, curation, args.site_dir, answer_key, rng)
    turn_audio, turn_text = turn_trials(selection, curation, args.site_dir, answer_key, rng)
    trial_lists = {
        "question_audio_01": question_audio,
        "question_text_01": question_text,
        "turn_audio_01": turn_audio,
        "turn_text_01": turn_text,
    }
    output = "window.CANDOR_TRIAL_LISTS = " + json.dumps(trial_lists, indent=2, ensure_ascii=True) + ";\n"
    (args.site_dir / "data" / "trial_lists.js").write_text(output, encoding="utf-8")
    write_answer_key(args.answer_key, answer_key)

    summary = {key: len(value) for key, value in trial_lists.items()}
    summary["answer_key"] = str(args.answer_key.resolve())
    print(json.dumps(summary, indent=2, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
