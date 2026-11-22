# SPDX-License-Identifier: AGPL-3.0-or-later
"""A structured turn probed against a running deployment (Zephyrex RPG's ask, 2026-11-22): how soon the
first byte and the first item arrive, the events in order, and what was saved.

It asks a real turn, so the turn IS saved to the chat: point it at a test chat, never a played one.

    RPG_TOKEN=<a bearer token> python probe_structured.py https://rpg.example/api CHAT_ID LEAF_ID [narrate|reply]

Exit 0 when the stream opened within 15 s and ended with done; 1 otherwise. Prints each event's name,
the seconds it came at, and a short body.
"""

from __future__ import annotations

import json
import os
import sys
import time

import httpx

FIRST_BYTE_LIMIT_SECONDS = 15.0


def main(argv: list[str]) -> int:
    if len(argv) < 4:
        print(__doc__)
        return 2
    base, chat_id, leaf_id = argv[1].rstrip("/"), argv[2], argv[3]
    mode = argv[4] if len(argv) > 4 else "narrate"
    token = os.environ.get("RPG_TOKEN", "")
    body = {"generate": {"chat_id": chat_id, "leaf_id": leaf_id, "mode": mode, "structured": True}}
    headers = {"Content-Type": "application/json", **({"Authorization": f"Bearer {token}"} if token else {})}
    started = time.monotonic()
    first_byte: float | None = None
    first_item: float | None = None
    names: list[str] = []
    with (
        httpx.Client(timeout=httpx.Timeout(10.0, read=None)) as client,
        client.stream("POST", f"{base}/v1/ai_chat/generate", json=body, headers=headers) as answer,
    ):
        print(f"HTTP {answer.status_code} after {time.monotonic() - started:.1f}s")
        if answer.status_code >= 400:
            print(answer.read().decode(errors="replace")[:500])
            return 1
        buffer = ""
        for chunk in answer.iter_text():
            if first_byte is None:
                first_byte = time.monotonic() - started
            buffer += chunk
            *blocks, buffer = buffer.split("\n\n")
            for block in blocks:
                at = time.monotonic() - started
                if block.startswith(":"):
                    print(f"{at:6.1f}s  (heartbeat)")
                    continue
                name = next((line[7:] for line in block.split("\n") if line.startswith("event: ")), "?")
                data = next((line[6:] for line in block.split("\n") if line.startswith("data: ")), "")
                names.append(name)
                if name == "item_start" and first_item is None:
                    first_item = at
                shown = json.dumps(json.loads(data), ensure_ascii=False)[:160] if data else ""
                print(f"{at:6.1f}s  {name:<11} {shown}")
    print(f"first byte {first_byte if first_byte is not None else -1:.1f}s; first item {first_item or -1:.1f}s")
    print(f"events: {', '.join(dict.fromkeys(names))}")
    ok = first_byte is not None and first_byte <= FIRST_BYTE_LIMIT_SECONDS and names[-1:] == ["done"]
    print("OK" if ok else "NOT OK")
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main(sys.argv))
