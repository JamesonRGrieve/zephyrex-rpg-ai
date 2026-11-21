# SPDX-License-Identifier: AGPL-3.0-or-later
"""Native APIs (audit gap 8): Anthropic's Messages API (Claude) and Google's Gemini API, asked from the
same OpenAI-shaped chat body an OpenAI-compatible endpoint gets, and read back as its stream.

The twin of client/src/features/models/nativeApis.ts, held to contract/native-api-cases.json.

- **Request:** the leading system messages become the API's own system text; a later one becomes the
  person's turn (neither API takes a system turn in the chat); turns of the same role in a row are
  joined; a conversation that doesn't open on the person's turn gets the contract's opening.
  Temperature, top-P, top-K, the reply's length and stop strings carry over; nothing else does, since
  both refuse fields they don't know. A last assistant turn is the reply's start (prefill).
- **Stream:** each server-sent ``data:`` payload becomes an OpenAI chunk (``choices[0].delta.content``,
  and ``reasoning_content`` for a model's thinking), so one reader takes every API.
"""

from __future__ import annotations

import json
import math
import re
from collections.abc import Mapping, Sequence
from typing import Any

from zephyrex.extensions.ai_character.Contract import CONTRACT  # type: ignore[import-not-found]

NATIVE: dict[str, Any] = CONTRACT["native_apis"]
NATIVE_APIS = ("anthropic", "google")


def _number(value: Any) -> float | None:
    if isinstance(value, bool) or not isinstance(value, int | float) or not math.isfinite(value):
        return None
    return value


def turns_of(messages: Sequence[Any]) -> tuple[str, list[dict[str, str]]]:
    """The system text and the alternating turns both APIs want."""
    system: list[str] = []
    turns: list[dict[str, str]] = []
    leading = True
    for message in messages:
        role = message.get("role") if isinstance(message, Mapping) else None
        raw = message.get("content") if isinstance(message, Mapping) else None
        content = raw if isinstance(raw, str) else ""
        if role == "system" and leading:
            if content.strip():
                system.append(content)
            continue
        leading = False
        as_ = "assistant" if role == "assistant" else "user"
        if turns and turns[-1]["role"] == as_:
            turns[-1]["content"] = f"{turns[-1]['content']}\n\n{content}"
        else:
            turns.append({"role": as_, "content": content})
    if not turns or turns[0]["role"] != "user":
        turns.insert(0, {"role": "user", "content": str(NATIVE["opening"])})
    return "\n\n".join(system), turns


def base_of(base_url: str) -> str:
    """An endpoint's base URL without an OpenAI path or a trailing slash."""
    return re.sub(r"/(chat/)?completions$", "", base_url.rstrip("/"))


def native_request(api: str, base_url: str, api_key: str, body: Mapping[str, Any]) -> dict[str, Any]:
    """The request (``url``, ``headers``, ``json``) for ``api``, from an OpenAI-shaped chat body."""
    system, turns = turns_of(body.get("messages") or [])
    temperature = _number(body.get("temperature"))
    top_p = _number(body.get("top_p"))
    top_k = _number(body.get("top_k"))
    max_tokens = _number(body.get("max_tokens"))
    stop = [item for item in body.get("stop") or [] if isinstance(item, str)]
    model = body.get("model") if isinstance(body.get("model"), str) else ""
    if api == "anthropic":
        payload: dict[str, Any] = {"model": model}
        if system:
            payload["system"] = system
        payload |= {"messages": turns, "max_tokens": max_tokens if max_tokens is not None else 1024, "stream": True}
        if temperature is not None:
            payload["temperature"] = min(NATIVE["anthropic_temperature_max"], temperature)
        if top_p is not None and top_p < 1:
            payload["top_p"] = top_p
        if top_k is not None and top_k > 0:
            payload["top_k"] = top_k
        if stop:
            payload["stop_sequences"] = stop
        headers = {"Content-Type": "application/json", "anthropic-version": NATIVE["anthropic_version"]}
        if api_key:
            headers["x-api-key"] = api_key
        return {"url": f"{base_of(base_url)}/messages", "headers": headers, "json": payload}
    config: dict[str, Any] = {}
    if temperature is not None:
        config["temperature"] = temperature
    if top_p is not None:
        config["topP"] = top_p
    if top_k is not None and top_k > 0:
        config["topK"] = top_k
    if max_tokens is not None:
        config["maxOutputTokens"] = max_tokens
    if stop:
        config["stopSequences"] = stop
    google: dict[str, Any] = {}
    if system:
        google["systemInstruction"] = {"parts": [{"text": system}]}
    google["contents"] = [
        {"role": "model" if turn["role"] == "assistant" else "user", "parts": [{"text": turn["content"]}]}
        for turn in turns
    ]
    google["generationConfig"] = config
    headers = {"Content-Type": "application/json"}
    if api_key:
        headers["x-goog-api-key"] = api_key
    return {
        "url": f"{base_of(base_url)}/models/{model}:streamGenerateContent?alt=sse",
        "headers": headers,
        "json": google,
    }


def native_delta(api: str, payload: str) -> dict[str, str] | None:
    """One of the API's stream payloads as an OpenAI chunk's delta, or None when it adds nothing."""
    try:
        parsed = json.loads(payload.strip())
    except ValueError:
        return None
    if not isinstance(parsed, dict):
        return None
    if api == "anthropic":
        delta = parsed.get("delta") if parsed.get("type") == "content_block_delta" else None
        if not isinstance(delta, dict):
            return None
        text, thinking = delta.get("text"), delta.get("thinking")
        if isinstance(text, str) and text:
            return {"content": text}
        if isinstance(thinking, str) and thinking:
            return {"reasoning_content": thinking}
        return None
    candidates = parsed.get("candidates")
    first = candidates[0] if isinstance(candidates, list) and candidates else None
    parts = ((first or {}).get("content") or {}).get("parts") if isinstance(first, dict) else None
    if not isinstance(parts, list):
        return None
    content = reasoning = ""
    for part in parts:
        text = part.get("text") if isinstance(part, dict) else None
        if not isinstance(text, str):
            continue
        if part.get("thought") is True:
            reasoning += text
        else:
            content += text
    if not content and not reasoning:
        return None
    out: dict[str, str] = {}
    if content:
        out["content"] = content
    if reasoning:
        out["reasoning_content"] = reasoning
    return out


def openai_payload(api: str, payload: str) -> str | None:
    """The payload as an OpenAI chunk's JSON, for the one stream reader; None when it adds nothing."""
    delta = native_delta(api, payload)
    return None if delta is None else json.dumps({"choices": [{"delta": delta}]})


def native_models_request(api: str, base_url: str, api_key: str) -> dict[str, Any]:
    """Where ``api`` lists its models, and the headers it wants (the model check, A28)."""
    if api == "anthropic":
        headers = {"anthropic-version": NATIVE["anthropic_version"]}
        if api_key:
            headers["x-api-key"] = api_key
        return {"url": f"{base_of(base_url)}/models", "headers": headers}
    return {"url": f"{base_of(base_url)}/models", "headers": {"x-goog-api-key": api_key} if api_key else {}}


def native_model_ids(api: str, answer: Any) -> list[str] | None:
    """The model names in ``api``'s model list (Gemini's without their ``models/`` prefix); None when
    it isn't one."""
    listed = answer.get("data" if api == "anthropic" else "models") if isinstance(answer, dict) else None
    if not isinstance(listed, list):
        return None
    key = "id" if api == "anthropic" else "name"
    return [
        re.sub(r"^models/", "", model[key])
        for model in listed
        if isinstance(model, dict) and isinstance(model.get(key), str)
    ]
