# SPDX-License-Identifier: AGPL-3.0-or-later
"""The story-model eval (the operator, 2026-11-24: "Benchmark everything on the 72gb machine, in parallel where
possible, and gather data we can use to make decisions"; "Both modes must be tested and get multi actor turns
working as well as possible as they reduce usage").

Each story model narrates each scene of evals/gold/scenes.json, its prompt built by rpg-ai's own
Prompt.assemble_prompt in narrate mode:

- in both multi-actor modes (group_settings.multi_actor true and false), neutral style;
- under each narrator-style variant (NarratorStyle.style_tuning: verbosity low/high, darkness high, humour
  high, spice high), multi-actor on.

Each reply is scored by the same deterministic pieces the server saves through, and the style variants by
the decision model (the 970's d1-2b) pairwise against the neutral reply:

- fences, banners: lines the save strips
- foreign_lines: lines credited to someone not present (cut at save)
- actions_as_narration: narration sentences with a present person as subject (ActionLines moves them)
- seat_voiced: the person's own character made to speak or act
- voices: distinct people given lines (multi-actor's saving: one call where single-actor needs one each)
- words, first_token_s, total_s, completion_tokens
- style_effect (variants): the decider's choice of which reply is more <slider>, the variant's or neutral's

    python evals/story_eval.py --base-url URL --models a,b --out FILE.json [--decider-url URL --decider MODEL]

Requests stream (the gateway cuts non-streamed calls at 300 s) and go one at a time (72gb serves one model and
one request at once). Runs from the build runner, never the desktop.
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
from zephyrex.extensions.ai_chat.NarratorStyle import style_tuning  # type: ignore[import-not-found]  # noqa: E402
from zephyrex.extensions.ai_chat.PlayerLines import (  # type: ignore[import-not-found]  # noqa: E402
    parse_player_lines,
    story_reply,
)
from zephyrex.extensions.ai_chat.Prompt import assemble_prompt  # type: ignore[import-not-found]  # noqa: E402

SCENES: dict[str, Any] = json.loads((HERE / "gold" / "scenes.json").read_text())
VARIANTS: dict[str, dict[str, float]] = {
    "verbosity_low": {"verbosity": 0.1},
    "verbosity_high": {"verbosity": 0.95},
    "darkness_high": {"darkness": 0.95},
    "humour_high": {"humour": 0.95},
    "spice_high": {"spice": 0.95},
}
WHAT: dict[str, str] = {
    "verbosity_low": "shorter and more spare",
    "verbosity_high": "longer and more elaborate",
    "darkness_high": "darker and grimmer",
    "humour_high": "funnier and lighter",
    "spice_high": "more sensual and charged",
}
FENCE = re.compile(r"^\s*`+[\w-]*\s*$", re.MULTILINE)
BANNER = re.compile(r"^\s*\[location:.*\]\s*$", re.MULTILINE | re.IGNORECASE)
CREDIT = re.compile(r"^\s*([A-Z][\w'.-]*(?:\s+[A-Z][\w'.-]*){0,3})\s*(?:\([^)]*\)\s*:|:\s*[\"\u201c])", re.MULTILINE)


def prompt(scene: dict[str, Any], multi: bool, style: dict[str, float] | None) -> list[dict[str, str]]:
    """The scene's narrate prompt as rpg-ai builds it."""
    tuning = style_tuning(style, "mature") if style else None
    style_line = " ".join([*(tuning["tones"] if tuning else []), tuning["length"] if tuning else ""]).strip()
    built = assemble_prompt(
        characters=scene["cast"],
        speaker_id="",
        persona=scene["persona"],
        author_note=style_line,
        history=scene["history"],
        context_tokens=8192,
        max_tokens=600,
        mode="narrate",
        group_modes={"multi_actor": multi},
    )
    return list(built.messages)


def stream(client: httpx.Client, base_url: str, model: str, messages: list[dict[str, str]]) -> dict[str, Any]:
    body = {"model": model, "messages": messages, "stream": True, "temperature": 0.8, "max_tokens": 600}
    headers = {"Content-Type": "application/json", "Authorization": "Bearer no-auth-required"}
    usage: dict[str, Any] = {}
    started, first, text, error = time.monotonic(), None, [], None
    try:
        with client.stream("POST", f"{base_url.rstrip('/')}/chat/completions", json=body, headers=headers) as answer:
            if answer.status_code >= 400:
                error = f"HTTP {answer.status_code}: {answer.read()[:300]!r}"
            for raw in answer.iter_lines() if error is None else []:
                if not raw.startswith("data: ") or raw.strip() == "data: [DONE]":
                    continue
                chunk = json.loads(raw[6:])
                usage = chunk.get("usage") or usage
                delta = ((chunk.get("choices") or [{}])[0].get("delta") or {}).get("content") or ""
                if delta and first is None:
                    first = time.monotonic() - started
                text.append(delta)
    except (httpx.HTTPError, ValueError) as failed:
        error = type(failed).__name__
    return {
        "reply": "".join(text),
        "error": error,
        "first_token_s": round(first, 2) if first is not None else None,
        "total_s": round(time.monotonic() - started, 2),
        "completion_tokens": usage.get("completion_tokens"),
    }


def score(scene: dict[str, Any], reply: str) -> dict[str, Any]:
    """What the save would do to the reply, counted."""
    people = [*scene["cast"], {"id": "seat", "name": scene["persona"]["name"]}]
    present = {str(one["name"]).split()[0] for one in people}
    cleaned = story_reply(reply)
    items = parse_player_lines(cleaned, people)
    voiced = {str(item["speaker_id"]) for item in items if item.get("speaker_id")}
    foreign = [name for name in CREDIT.findall(cleaned) if name.split()[0] not in present]
    runs = [{"speaker_id": item.get("speaker_id"), "lines": [{**item, "kind": item["kind"]}]} for item in items]
    _fixed, wrong = action_lines(runs, people)
    return {
        "fences": len(FENCE.findall(reply)),
        "banners": len(BANNER.findall(reply)),
        "foreign_lines": len(foreign),
        "actions_as_narration": len(wrong),
        "seat_voiced": "seat" in voiced,
        "voices": len(voiced - {"seat"}),
        "words": len(cleaned.split()),
    }


def judge(client: httpx.Client, url: str, model: str, variant: str, neutral: str, styled: str) -> str | None:
    """The decider's pick of which reply is more what the variant asks: "variant", "neutral" or None."""
    question = {
        "more": {
            "type": "choice",
            "instructions": f"Which of these two story replies is {WHAT[variant]}?",
            "criteria": {"A": "reply A", "B": "reply B"},
        }
    }
    state = f"Reply A:\n{styled}\n\nReply B:\n{neutral}"
    body = {
        "model": model,
        "messages": [{"role": "user", "content": json.dumps({"state": state, "questions": question})}],
        "response_format": {"type": "json_object"},
        "stream": False,
    }
    try:
        answer = client.post(f"{url.rstrip('/')}/chat/completions", json=body, timeout=120)
        content = answer.json()["choices"][0]["message"]["content"]
        choice = json.loads(content).get("answers", {}).get("more", {}).get("choice")
    except (httpx.HTTPError, ValueError, KeyError, IndexError):
        return None
    return {"A": "variant", "B": "neutral"}.get(str(choice))


def summary(results: list[dict[str, Any]]) -> str:
    rows = [
        "| model | mode | n | words | voices | foreign | actions as narration | seat voiced | fences | banners "
        "| first token s | total s |",
        "|---|---|---|---|---|---|---|---|---|---|---|---|",
    ]
    keys = dict.fromkeys((one["model"], one["mode"]) for one in results if one["variant"] == "neutral")
    for model, mode in keys:
        mine = [one for one in results if one["model"] == model and one["mode"] == mode and one["variant"] == "neutral"]

        def mean(key: str, mine: list[dict[str, Any]] = mine) -> float:
            values = [float(one[key]) for one in mine if one.get(key) is not None]
            return statistics.fmean(values) if values else float("nan")

        rows.append(
            f"| {model} | {mode} | {len(mine)} | {mean('words'):.0f} | {mean('voices'):.2f} | "
            f"{mean('foreign_lines'):.2f} | {mean('actions_as_narration'):.2f} | {mean('seat_voiced'):.2f} | "
            f"{mean('fences'):.2f} | {mean('banners'):.2f} | {mean('first_token_s'):.1f} | {mean('total_s'):.1f} |"
        )
    rows += ["", "| model | variant | effect (decider picked the variant) |", "|---|---|---|"]
    for model in dict.fromkeys(one["model"] for one in results):
        for variant in VARIANTS:
            picks = [one["style_effect"] for one in results if one["model"] == model and one["variant"] == variant]
            known = [pick for pick in picks if pick is not None]
            share = sum(pick == "variant" for pick in known) / len(known) if known else float("nan")
            rows.append(f"| {model} | {variant} | {share:.2f} ({len(known)}/{len(picks)}) |")
    return "\n".join(rows)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    parser.add_argument("--base-url", required=True)
    parser.add_argument("--models", required=True)
    parser.add_argument("--out", required=True)
    parser.add_argument("--decider-url", default="")
    parser.add_argument("--decider", default="")
    parser.add_argument("--timeout", type=float, default=900.0)
    args = parser.parse_args()
    results: list[dict[str, Any]] = []
    with httpx.Client(timeout=args.timeout) as client:
        for model in [one.strip() for one in args.models.split(",") if one.strip()]:
            for scene in SCENES["scenes"]:
                neutral: dict[str, str] = {}
                for mode, multi in (("multi", True), ("single", False)):
                    asked = stream(client, args.base_url, model, prompt(scene, multi, None))
                    results.append(
                        {
                            "model": model,
                            "scene": scene["name"],
                            "mode": mode,
                            "variant": "neutral",
                            **asked,
                            **score(scene, asked["reply"]),
                        }
                    )
                    neutral[mode] = asked["reply"]
                    Path(args.out).write_text(json.dumps(results, indent=1, ensure_ascii=False))
                for variant, style in VARIANTS.items():
                    asked = stream(client, args.base_url, model, prompt(scene, True, style))
                    effect = (
                        judge(client, args.decider_url, args.decider, variant, neutral["multi"], asked["reply"])
                        if args.decider_url and asked["reply"] and neutral["multi"]
                        else None
                    )
                    results.append(
                        {
                            "model": model,
                            "scene": scene["name"],
                            "mode": "multi",
                            "variant": variant,
                            **asked,
                            **score(scene, asked["reply"]),
                            "style_effect": effect,
                        }
                    )
                    Path(args.out).write_text(json.dumps(results, indent=1, ensure_ascii=False))
                print(f"{model} | {scene['name'][:40]} | done", flush=True)
    print(summary(results))


if __name__ == "__main__":
    main()
