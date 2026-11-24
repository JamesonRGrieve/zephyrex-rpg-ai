# SPDX-License-Identifier: AGPL-3.0-or-later
"""The formatter eval (the operator, 2026-11-24: "Research models specifically trained for this sort of thing
before you jump to general purpose"; "Benchmark everything on the 72gb machine ... gather data we can use to
make decisions").

Each candidate model is asked rpg-ai's own reformat request (Reformat.reformat_request, with the present
people described and the JSON schema) for every case of evals/gold/formatter.json; its items go through
rpg-ai's own reading (reformat_items, structured_runs) and the deterministic action pass (ActionLines), and
each line is scored against the gold set:

- speaker_accuracy: gold lines whose text was found, credited to the right person (or the narrator)
- action_recall: gold action lines that came out as an action line of the right person
- kind_accuracy: gold lines that came out as the right kind (say, do, narrate)
- raw_action_faults: sentences the action pass had to move or fix (what the model left wrong)
- faithful: the answer kept the prose (Reformat.faithful)
- parsed: the answer read as items at all
- latency_s, prompt_tokens, completion_tokens

    python evals/formatter_eval.py --base-url URL --models a,b --out FILE.json [--key-env NAME] [--n 1]

One request at a time (72gb serves one model and one request at once). Writes every answer and score as JSON
and prints the model table as Markdown. Runs from the build runner or the model host, never the desktop.
"""

from __future__ import annotations

import argparse
import json
import os
import re
import statistics
import sys
import time
from pathlib import Path
from typing import Any

import httpx

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent))
# rpg-ai's extensions join the framework's namespace as server/conftest.py does (RPG_AI_EXTENSIONS: another
# checkout's server/extensions, e.g. the build runner's workspace).
import zephyrex.extensions  # noqa: E402

_EXTENSIONS = os.environ.get("RPG_AI_EXTENSIONS") or str(HERE.parent / "extensions")
if _EXTENSIONS not in zephyrex.extensions.__path__:
    zephyrex.extensions.__path__ = [_EXTENSIONS, *zephyrex.extensions.__path__]

from zephyrex.extensions.ai_chat.ActionLines import action_lines  # type: ignore[import-not-found]  # noqa: E402
from zephyrex.extensions.ai_chat.Reformat import (  # type: ignore[import-not-found]  # noqa: E402
    faithful,
    reformat_items,
    reformat_request,
)
from zephyrex.extensions.ai_chat.Structured import structured_runs  # type: ignore[import-not-found]  # noqa: E402

GOLD: dict[str, Any] = json.loads((HERE / "gold" / "formatter.json").read_text())
WORD = re.compile(r"[\w']+")


def _words(text: str) -> set[str]:
    return {word.lower() for word in WORD.findall(text)}


def _match(gold: dict[str, Any], lines: list[dict[str, Any]]) -> dict[str, Any] | None:
    """The answer's line that best holds a gold line's words (at least half of them), or None."""
    want = _words(gold["text"])
    best, score = None, 0.0
    for line in lines:
        have = _words(str(line["text"]))
        overlap = len(want & have) / max(1, len(want))
        if overlap > score:
            best, score = line, overlap
    return best if score >= 0.5 else None


def score_case(case: dict[str, Any], content: str | None) -> dict[str, Any]:
    """One answer against its gold lines."""
    people = [one for one in GOLD["people"] if one["id"] in case["present"]]
    names = [one["name"] for one in people]
    items = reformat_items(content, names) if isinstance(content, str) else None
    if items is None:
        return {"parsed": False, "faithful": False, "speaker_accuracy": 0.0, "action_recall": 0.0, "kind_accuracy": 0.0}
    runs = structured_runs(items, people, "")["runs"]
    fixed, wrong = action_lines(runs, people)
    lines = [{**line, "speaker": run["speaker_id"]} for run in fixed for line in run["lines"]]
    gold = case["gold"]
    found = [(g, _match(g, lines)) for g in gold]
    right_speaker = [g for g, line in found if line is not None and line["speaker"] == g["speaker"]]
    right_kind = [g for g, line in found if line is not None and line["kind"] == g["kind"]]
    actions = [g for g in gold if g["kind"] == "do"]
    recalled = [
        g
        for g, line in found
        if g["kind"] == "do" and line is not None and line["kind"] == "do" and line["speaker"] == g["speaker"]
    ]
    return {
        "parsed": True,
        "faithful": bool(faithful(case["prose"], items)),
        "speaker_accuracy": len(right_speaker) / len(gold),
        "kind_accuracy": len(right_kind) / len(gold),
        "action_recall": len(recalled) / len(actions) if actions else 1.0,
        "raw_action_faults": len(wrong),
        "lines": lines,
    }


def _request(model: str, case: dict[str, Any], output: str, prompt: str) -> dict[str, Any]:
    """The request a model gets: rpg-ai's own reformat request (``rpg``), or NuExtract's native template
    (``nuextract``: "# Template:" with the JSON skeleton, then "# Context:" with the prose; Self Hosted AI,
    2026-11-24: a generic instruction makes it rewrite)."""
    people = [one for one in GOLD["people"] if one["id"] in case["present"]]
    names = [one["name"] for one in people]
    if prompt == "nuextract":
        template = {
            "items": [
                {
                    "kind": ["say", "do", "narrate"],
                    "speaker": [*names],
                    "target": [*names],
                    "manner": ["speak", "whisper", "shout"],
                    "text": "verbatim-string",
                }
            ]
        }
        content = f"# Template:\n{json.dumps(template, indent=1)}\n# Context:\n{case['prose']}"
        return {"model": model, "messages": [{"role": "user", "content": content}], "temperature": 0}
    who = {one["name"]: one["who"] for one in people}
    body: dict[str, Any] = reformat_request(model, case["prose"], names, "", who)
    if output == "json_object":
        # A tag whose schema the server can't apply: the same request, the schema left to the instruction.
        body["response_format"] = {"type": "json_object"}
    return body


def looping(text: str) -> bool:
    """Whether an answer has fallen into a loop: its last 200 characters repeated at least 4 times in its last
    2,000 (Self Hosted AI, 2026-11-24: nuextract-2b:q8 generated 19,300 tokens on one case, never stopping).
    The case is recorded as a failure; nothing is cut from a reply rpg-ai keeps."""
    if len(text) < 2000:
        return False
    tail = text[-200:]
    return text[-2000:].count(tail) >= 4


def ask(
    client: httpx.Client,
    base_url: str,
    key: str,
    model: str,
    case: dict[str, Any],
    output: str = "json_schema",
    prompt: str = "rpg",
) -> dict[str, Any]:
    body = {**_request(model, case, output, prompt), "stream": True}
    headers = {"Content-Type": "application/json", **({"Authorization": f"Bearer {key}"} if key else {})}
    started = time.monotonic()
    parts: list[str] = []
    usage: dict[str, Any] = {}
    error: str | None = None
    looped = False
    try:
        with client.stream("POST", f"{base_url.rstrip('/')}/chat/completions", headers=headers, json=body) as answer:
            if answer.status_code >= 400:
                error = f"HTTP {answer.status_code}: {answer.read()[:300]!r}"
            for raw in answer.iter_lines() if error is None else []:
                if not raw.startswith("data: ") or raw.strip() == "data: [DONE]":
                    continue
                chunk = json.loads(raw[6:])
                usage = chunk.get("usage") or usage
                parts.append(((chunk.get("choices") or [{}])[0].get("delta") or {}).get("content") or "")
                if len(parts) % 50 == 0 and looping("".join(parts)):
                    looped, error = True, "looped"
                    break
    except (httpx.HTTPError, ValueError, KeyError, IndexError) as failed:
        error = type(failed).__name__
    took = time.monotonic() - started
    content = "".join(parts) if parts and not looped else None
    return {
        "model": model,
        "output": output,
        "prompt": prompt,
        "case": case["name"],
        "content": content,
        "error": error,
        "looped": looped,
        "latency_s": round(took, 2),
        "prompt_tokens": usage.get("prompt_tokens"),
        "completion_tokens": usage.get("completion_tokens") or (len(parts) if parts else None),
        **score_case(case, content),
    }


def table(results: list[dict[str, Any]]) -> str:
    """The model table: means over every case and run."""
    rows = [
        "| model | prompt | parsed | looped | faithful | speaker acc | kind acc | action recall | raw action faults "
        "| latency s |"
    ]
    rows.append("|---|---|---|---|---|---|---|---|---|---|")
    for model, prompt in dict.fromkeys((one["model"], one.get("prompt", "rpg")) for one in results):
        mine = [one for one in results if one["model"] == model and one.get("prompt", "rpg") == prompt]

        def mean(key: str, mine: list[dict[str, Any]] = mine) -> float:
            return statistics.fmean(float(one.get(key) or 0) for one in mine)

        rows.append(
            f"| {model} | {prompt} | {mean('parsed'):.2f} | {mean('looped'):.2f} | {mean('faithful'):.2f} | "
            f"{mean('speaker_accuracy'):.2f} | "
            f"{mean('kind_accuracy'):.2f} | {mean('action_recall'):.2f} | {mean('raw_action_faults'):.2f} | "
            f"{mean('latency_s'):.1f} |"
        )
    return "\n".join(rows)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    parser.add_argument("--base-url", required=True)
    parser.add_argument("--models", required=True, help="comma-separated")
    parser.add_argument("--out", required=True)
    parser.add_argument("--key-env", default="")
    parser.add_argument("--n", type=int, default=1)
    parser.add_argument("--timeout", type=float, default=600.0)
    parser.add_argument("--format", default="json_schema", choices=["json_schema", "json_object"])
    parser.add_argument("--prompt", default="rpg", choices=["rpg", "nuextract"])
    parser.add_argument("--resume", action="store_true", help="keep --out's results; ask only what's missing")
    parser.add_argument("--redo", default="", help="comma-separated models whose kept results are asked again")
    args = parser.parse_args()
    key = (os.environ.get(args.key_env, "") if args.key_env else "") or "no-auth-required"
    redo = {one.strip() for one in args.redo.split(",") if one.strip()}
    results: list[dict[str, Any]] = []
    if args.resume and Path(args.out).exists():
        results = [one for one in json.loads(Path(args.out).read_text()) if one["model"] not in redo]
    done = {(one["model"], one.get("prompt", "rpg"), one["case"]) for one in results}
    with httpx.Client(timeout=args.timeout) as client:
        for model in [one.strip() for one in args.models.split(",") if one.strip()]:
            for case in GOLD["cases"]:
                if (model, args.prompt, case["name"]) in done:
                    continue
                for _ in range(args.n):
                    results.append(ask(client, args.base_url, key, model, case, args.format, args.prompt))
                    Path(args.out).write_text(json.dumps(results, indent=1, ensure_ascii=False))
                    print(f"{model} | {case['name'][:50]} | {results[-1]['speaker_accuracy']:.2f}", flush=True)
    print(table(results))


if __name__ == "__main__":
    main()
