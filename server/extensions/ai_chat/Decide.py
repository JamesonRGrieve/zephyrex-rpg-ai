# SPDX-License-Identifier: AGPL-3.0-or-later
"""The decide role's protocol (a calibrated decision model, e.g. Self Hosted AI's d1-2b): a chat
completion whose last user message is ``{state, questions}``, answered with ``{answers}``. Who
speaks next, which lore fits, which expression, a typed choice in a fight: each is a question over
the scene, asked together in one call. A decision model only ever chooses among the options the
caller supplies, so an answer outside them is refused (None), never used.

The twin of client/src/features/decide/decide.ts, held to contract/decide-cases.json.
"""

import json
import math
import time
from collections.abc import Awaitable, Callable, Mapping, Sequence
from typing import Any

from zephyrex.extensions.ai_chat.ExtraBody import with_extra_body  # type: ignore[import-not-found]
from zephyrex.lib.Logging import logger  # loguru: reaches the journal (stdlib logging isn't wired on prod)


def _choice_options(criteria: Sequence[str] | Mapping[str, str]) -> dict[str, str]:
    if isinstance(criteria, Mapping):
        return dict(criteria)
    return {name: "" for name in criteria}


def _wire(question: Mapping[str, Any]) -> dict[str, Any]:
    kind = question["type"]
    if kind == "choice":
        return {
            "type": "choice",
            "instructions": question["instructions"],
            "criteria": _choice_options(question["criteria"]),
        }
    if kind == "noul":
        return {"type": "noul", "instructions": question["instructions"]}
    if kind == "score":
        return {"type": "score", "instructions": question["instructions"], "criteria": list(question["criteria"])}
    raise ValueError(f"Unknown question type {kind!r}")


def decide_message(state: str, questions: Mapping[str, Mapping[str, Any]]) -> dict[str, Any]:
    """The last user message's object: the scene, and each question in the protocol's shape."""
    return {"state": state, "questions": {key: _wire(question) for key, question in questions.items()}}


def decide_request(model: str, state: str, questions: Mapping[str, Mapping[str, Any]]) -> dict[str, Any]:
    """A chat-completions body asking ``model`` the questions over ``state``."""
    return {
        "model": model,
        "messages": [{"role": "user", "content": json.dumps(decide_message(state, questions))}],
        "response_format": {"type": "json_object"},
        "stream": False,
    }


def _is_probability(value: Any) -> bool:
    return isinstance(value, (int, float)) and not isinstance(value, bool) and math.isfinite(value) and 0 <= value <= 1


def _read_one(question: Mapping[str, Any], raw: Any) -> dict[str, Any] | None:
    if not isinstance(raw, Mapping) or raw.get("type") != question["type"]:
        return None
    kind = question["type"]
    if kind == "choice":
        choice = raw.get("choice")
        if not isinstance(choice, str) or choice not in _choice_options(question["criteria"]):
            return None
        probabilities = raw.get("probabilities")
        probability = probabilities.get(choice) if isinstance(probabilities, Mapping) else None
        if _is_probability(probability):
            return {"choice": choice, "probability": probability}
        return {"choice": choice}
    if kind == "noul":
        return {"probability": raw["noul"]} if _is_probability(raw.get("noul")) else None
    if kind == "score":
        level = raw.get("score")
        levels = list(question["criteria"])
        # The level by its name, or (as d1-2b answers) by its index into the criteria.
        if isinstance(level, int) and not isinstance(level, bool) and 0 <= level < len(levels):
            return {"level": levels[level], "index": level}
        return {"level": level, "index": levels.index(level)} if isinstance(level, str) and level in levels else None
    return None


def read_answers(questions: Mapping[str, Mapping[str, Any]], content: str) -> dict[str, dict[str, Any] | None]:
    """Each question's answer from the reply's content; None where missing, malformed or outside the options."""
    try:
        parsed = json.loads(content)
    except (TypeError, ValueError):
        parsed = None
    answers = parsed.get("answers") if isinstance(parsed, Mapping) else None
    if not isinstance(answers, Mapping):
        answers = {}
    return {key: _read_one(question, answers.get(key)) for key, question in questions.items()}


def answer_scores(questions: Mapping[str, Mapping[str, Any]], content: str) -> dict[str, dict[str, float]]:
    """Each choice question's score per option offered (the decider's probabilities), for the record (the
    operator, 2026-11-24: "I don't see the available options and their individual scores"). Only the options
    offered, and only real probabilities."""
    try:
        parsed = json.loads(content)
    except (TypeError, ValueError):
        return {}
    answers = parsed.get("answers") if isinstance(parsed, Mapping) else None
    if not isinstance(answers, Mapping):
        return {}
    scores: dict[str, dict[str, float]] = {}
    for key, question in questions.items():
        raw = answers.get(key)
        if question.get("type") != "choice" or not isinstance(raw, Mapping):
            continue
        offered = _choice_options(question["criteria"])
        given = raw.get("probabilities")
        if isinstance(given, Mapping):
            found = {
                str(name): float(value) for name, value in given.items() if name in offered and _is_probability(value)
            }
            if found:
                scores[key] = found
    return scores


def tokens_of(characters: int) -> int:
    """The estimate the budget is counted in: about four characters to a token."""
    return math.ceil(characters / 4)


def batch_questions(state_characters: int, question_characters: Sequence[int], budget: int) -> list[list[int]]:
    """Questions split into requests that each stay within ``budget`` tokens (the state repeats in
    each): in order, a question that would cross the budget starts the next request; one too large
    on its own still goes, alone. Returns the questions' indexes per request."""
    batches: list[list[int]] = []
    current: list[int] = []
    used = tokens_of(state_characters)
    for index, characters in enumerate(question_characters):
        cost = tokens_of(characters)
        if current and used + cost > budget:
            batches.append(current)
            current = []
            used = tokens_of(state_characters)
        current.append(index)
        used += cost
    if current:
        batches.append(current)
    return batches


# A one-question call is answered in about half a second when the model is free; past these, the call
# is a timeout. A request waits for its own size (Zephyrex RPG's measurement, 2026-11-23: 20 label
# questions over 600 characters took 23.8 to 82.1 s alone, where a flat 8 s expired every one).
DECIDE_TIMEOUT_SECONDS = 8.0
DECIDE_SECONDS_PER_QUESTION = 4.0
#: The pauses before a second and a third try (the operator, 2026-11-22: "Give the decision model 3 tries").
DECIDE_RETRY_SECONDS = (0.3, 0.6)
#: At most this many requests in flight to the decision models at once, the rest queued here (Self Hosted
#: AI, 2026-11-23: d1-2b serves 4 slots; 44-64 calls a minute backed its queue up past 120 s).
DECIDE_IN_FLIGHT = 4
#: Of those, at most this many for background work (labelling lines), so a turn's own decisions (a fight
#: starting, who speaks, a scene move) always find a slot (Zephyrex RPG's live run, chat 3a9a44cd: label
#: calls of 8-24 questions held all 4, and 5 of 6 fight checks timed out behind them).
#: Zephyrex RPG's r46 (chat a834702e): with 2, 5 of 8 scene moves still timed out behind label calls of
#: 14-54 s, so labels now take one slot at a time.
DECIDE_BACKGROUND_IN_FLIGHT = 1
#: The purposes that are background work.
DECIDE_BACKGROUND = frozenset({"label_lines", "learned_facts"})

#: Per event loop: the in-flight slots, and identical requests already in flight (asked once, shared).
_SLOTS: dict[int, Any] = {}
_BACKGROUND_SLOTS: dict[int, Any] = {}
#: Per event loop: how many of a turn's own decisions are in flight, and an event set while there are none.
#: Background work waits for it, so it never takes a model slot ahead of a turn's decision (Zephyrex RPG's
#: live chat 64e11be8: a round's scene step took 40 s while line labels ran).
_FOREGROUND: dict[int, int] = {}
_IDLE: dict[int, Any] = {}
_IN_FLIGHT: dict[tuple[int, str], Any] = {}


def decide_timeout(questions: Mapping[str, Any]) -> float:
    """How long a request may take: a base, and a share for each question it asks."""
    return DECIDE_TIMEOUT_SECONDS + DECIDE_SECONDS_PER_QUESTION * len(questions)


def completion_content(body: Any) -> str | None:
    """A chat completion's first message content, or None when the body isn't one."""
    if not isinstance(body, Mapping):
        return None
    choices = body.get("choices")
    if not isinstance(choices, list) or not choices or not isinstance(choices[0], Mapping):
        return None
    message = choices[0].get("message")
    content = message.get("content") if isinstance(message, Mapping) else None
    return content if isinstance(content, str) else None


async def ask_decider(
    base_url: str,
    model: str,
    api_key: str,
    state: str,
    questions: Mapping[str, Mapping[str, Any]],
    extra: Mapping[str, Any] | None = None,
) -> dict[str, dict[str, Any] | None] | None:
    """The questions' answers from the decision model at ``base_url`` (ask_decider_detailed's answers)."""
    answers, _error = await ask_decider_detailed(base_url, model, api_key, state, questions, extra)
    return answers


async def ask_decider_detailed(
    base_url: str,
    model: str,
    api_key: str,
    state: str,
    questions: Mapping[str, Mapping[str, Any]],
    extra: Mapping[str, Any] | None = None,
    background: bool = False,
    on_attempt: Callable[[dict[str, Any]], Awaitable[None]] | None = None,
) -> tuple[dict[str, dict[str, Any] | None] | None, dict[str, str] | None]:
    """The questions' answers, and why there are none ({kind, detail}; None when it answered). An identical
    request already in flight is shared, never sent twice; ``background`` work keeps to its share of the
    slots. ``on_attempt`` hears of each try as it starts ({phase: "start", attempt}) and ends ({phase: "end",
    attempt, answers, error, ms}), so each is kept as its own record (the operator, 2026-11-24: "A fail should
    be red, with a retry stacking up beside it")."""
    import asyncio

    loop = id(asyncio.get_running_loop())
    key = (loop, json.dumps([base_url, model, state, questions, extra], sort_keys=True, default=str))
    running = _IN_FLIGHT.get(key)
    if running is None:
        running = asyncio.ensure_future(
            _ask_tries(base_url, model, api_key, state, questions, extra, background, on_attempt)
        )
        _IN_FLIGHT[key] = running
        running.add_done_callback(lambda _done: _IN_FLIGHT.pop(key, None))
    answers, error = await asyncio.shield(running)
    return answers, error


async def _ask_tries(
    base_url: str,
    model: str,
    api_key: str,
    state: str,
    questions: Mapping[str, Mapping[str, Any]],
    extra: Mapping[str, Any] | None,
    background: bool = False,
    on_attempt: Callable[[dict[str, Any]], Awaitable[None]] | None = None,
) -> tuple[dict[str, dict[str, Any] | None] | None, dict[str, str] | None]:
    """Asked up to three times (the operator, 2026-11-22: "Give the decision model 3 tries if it chokes").
    A timeout is the model's queue: background work isn't tried again (another request only lengthens it), and
    a turn's own decision is asked once more, waiting twice as long (Zephyrex RPG's r46: a departure's scene
    move timed out twice at 20 s, and the person never left)."""
    import asyncio

    tries = list(DECIDE_RETRY_SECONDS)
    answers: dict[str, dict[str, Any] | None] | None = None
    error: dict[str, str] | None = None
    patience = 1.0
    attempt_number = 0
    for attempt in range(len(tries) + 1):
        attempt_number += 1
        if on_attempt is not None:
            await on_attempt({"phase": "start", "attempt": attempt_number})
        began = time.monotonic()
        result = await _ask_once(base_url, model, api_key, state, questions, extra, background, patience)
        answers, error = result[0], result[1]
        scores = result[2] if len(result) > 2 else {}
        queued_ms = result[3] if len(result) > 3 else 0
        if answers is not None and error is None and not any(value is not None for value in answers.values()):
            error = {"kind": "empty", "detail": "no answer within the options"}
        if on_attempt is not None:
            await on_attempt(
                {
                    "phase": "end",
                    "attempt": attempt_number,
                    "answers": answers,
                    "error": error,
                    "scores": scores,
                    "ms": int((time.monotonic() - began) * 1000),
                    "queued_ms": int(queued_ms),
                }
            )
        if answers is not None and any(value is not None for value in answers.values()):
            return answers, None
        timed_out = (error or {}).get("kind") == "timeout"
        if timed_out and not background and patience == 1.0:
            patience = 2.0
            logger.info("decide %s: timed out; once more, waiting twice as long", model)
            continue
        if attempt < len(tries) and not timed_out:
            logger.info("decide %s: try %s gave nothing usable; again in %.1fs", model, attempt + 1, tries[attempt])
            await asyncio.sleep(tries[attempt])
            continue
        break
    # The last try's answer: nothing usable in it (each question None), or None when it couldn't be asked.
    return answers, error


async def _ask_once(
    base_url: str,
    model: str,
    api_key: str,
    state: str,
    questions: Mapping[str, Mapping[str, Any]],
    extra: Mapping[str, Any] | None,
    background: bool = False,
    patience: float = 1.0,
) -> tuple[Any, ...]:
    """One ask of the decision model, waiting for one of the in-flight slots (background work first for one
    of its share): its answers, or None and why."""
    import asyncio
    import contextlib

    loop = id(asyncio.get_running_loop())
    slots = _SLOTS.setdefault(loop, asyncio.Semaphore(DECIDE_IN_FLIGHT))
    share = (
        _BACKGROUND_SLOTS.setdefault(loop, asyncio.Semaphore(DECIDE_BACKGROUND_IN_FLIGHT))
        if background
        else contextlib.nullcontext()
    )
    idle = _IDLE.setdefault(loop, asyncio.Event())
    if not _FOREGROUND.get(loop):
        idle.set()
    queued = time.monotonic()
    headers = {"Content-Type": "application/json", **({"Authorization": f"Bearer {api_key}"} if api_key else {})}
    timeout = decide_timeout(questions) * patience
    if background:
        await idle.wait()
    else:
        _FOREGROUND[loop] = _FOREGROUND.get(loop, 0) + 1
        idle.clear()
    try:
        async with share, slots:
            queued_ms = int((time.monotonic() - queued) * 1000)
            return await _post(base_url, model, headers, timeout, state, questions, extra, queued_ms)
    finally:
        if not background:
            _FOREGROUND[loop] -= 1
            if not _FOREGROUND[loop]:
                idle.set()


async def _post(
    base_url: str,
    model: str,
    headers: Mapping[str, str],
    timeout: float,
    state: str,
    questions: Mapping[str, Mapping[str, Any]],
    extra: Mapping[str, Any] | None,
    queued_ms: int,
) -> tuple[Any, ...]:
    """The request itself, once a slot is held: (answers, error, scores, queued_ms)."""
    import httpx

    # Where a turn's seconds go (the operator, 2026-11-22: about two minutes before the first token).
    started = time.monotonic()
    try:
        async with httpx.AsyncClient(timeout=timeout) as client:
            answer = await client.post(
                f"{base_url.rstrip('/')}/chat/completions",
                headers=headers,
                # The endpoint's extra request fields, never over the conversation's own (ExtraBody.py).
                json=with_extra_body(decide_request(model, state, questions), extra),
            )
    except httpx.TimeoutException:
        logger.info("decide %s: no answer in %.1fs", model, time.monotonic() - started)
        waited = f"no answer in {timeout:.0f} s ({len(questions)} questions)"
        return None, {"kind": "timeout", "detail": waited}, {}, queued_ms
    except httpx.HTTPError as failed:
        logger.info("decide %s: unreachable after %.1fs", model, time.monotonic() - started)
        unreachable = {"kind": "unreachable", "detail": type(failed).__name__}
        return None, unreachable, {}, queued_ms
    logger.info(
        "decide %s: %s questions, HTTP %s in %.1fs",
        model,
        len(questions),
        answer.status_code,
        time.monotonic() - started,
    )
    if answer.status_code >= 400:
        refused = f"HTTP {answer.status_code}: {answer.text[:500]}"
        return None, {"kind": "http", "detail": refused}, {}, queued_ms
    try:
        content = completion_content(answer.json())
    except ValueError:
        return None, {"kind": "parse", "detail": "the reply isn't JSON"}, {}, queued_ms
    if content is None:
        return None, {"kind": "parse", "detail": "the reply isn't a completion"}, {}, queued_ms
    return read_answers(questions, content), None, answer_scores(questions, content), queued_ms
