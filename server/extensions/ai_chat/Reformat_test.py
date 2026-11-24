# SPDX-License-Identifier: AGPL-3.0-or-later
"""The reformat model (the operator, 2026-11-23): attribution among the people present only."""

from __future__ import annotations

import json

from zephyrex.extensions.ai_chat.Reformat import (  # type: ignore[import-not-found]
    faithful,
    reformat_items,
    reformat_request,
    reformat_schema,
)
from zephyrex.extensions.ai_chat.Structured import structured_runs  # type: ignore[import-not-found]

PROSE = 'The hooded woman leans in. "You came," she says. Mags slams a tankard down. "Drink or leave."'


def test_speakers_can_only_be_the_people_present() -> None:
    schema = reformat_schema(["Mags", "Wren", "Mags"])
    item = schema["properties"]["items"]["items"]["properties"]
    assert item["speaker"]["enum"] == ["Mags", "Wren", None]
    assert item["target"]["enum"] == ["Mags", "Wren", None]
    asked = reformat_request("small", PROSE, ["Mags", "Wren"])
    assert "Mags, Wren" in asked["messages"][0]["content"] and asked["messages"][1]["content"] == PROSE
    assert asked["response_format"]["json_schema"]["strict"] is True and "max_tokens" not in asked


def test_someone_not_present_is_narration_and_the_runs_follow() -> None:
    answer = json.dumps(
        {
            "items": [
                {"kind": "narrate", "speaker": None, "target": None, "manner": None, "text": "The woman leans in."},
                {"kind": "say", "speaker": "Ma Delvin", "target": None, "manner": "speak", "text": '"You came."'},
                {"kind": "do", "speaker": "Mags", "target": None, "manner": None, "text": "slams a tankard down."},
                {"kind": "say", "speaker": "Mags", "target": "Wren", "manner": "shout", "text": "Drink or leave."},
            ]
        }
    )
    items = reformat_items(answer, ["Mags", "Wren"])
    assert items is not None
    assert items[1]["fields"] == {"kind": "narrate", "speaker": None, "target": None, "manner": "speak"}
    runs = structured_runs(items, [{"id": "p-mags", "name": "Mags"}, {"id": "p-wren", "name": "Wren"}], "")
    assert [run["speaker_id"] for run in runs["runs"]] == [None, "p-mags"]
    assert runs["runs"][1]["lines"][1]["target_id"] == "p-wren"
    assert reformat_items("not json", ["Mags"]) is None
    assert reformat_items('{"items": []}', ["Mags"]) is None


def test_a_rewrite_is_refused_and_a_resort_is_kept() -> None:
    kept = [
        {"text": "The hooded woman leans in."},
        {"text": '"You came," she says.'},
        {"text": "Mags slams a tankard down."},
    ]
    assert faithful(PROSE, [*kept, {"text": "Drink or leave."}])
    assert not faithful(PROSE, [{"text": "A woman greets you and the barkeep is rude."}])
    assert not faithful(PROSE, kept[:1])


def test_the_formatters_result_is_checked_requirement_by_requirement() -> None:
    # The operator, 2026-11-24: "pass the result of the formatter to the decision model and ask if it meets the
    # format requirements such as all actions correctly in an action block attributed to their actor and all
    # dialogue in quotes with tone and direction".
    from zephyrex.extensions.ai_chat.Reformat import (
        check_questions,
        failed_checks,
        rendered_runs,
    )

    runs = [
        {"speaker_id": None, "speaker_name": None, "lines": [{"kind": "narrate", "text": "Rain on the quay."}]},
        {
            "speaker_id": "del",
            "speaker_name": "Delphine",
            "lines": [
                {"kind": "say", "manner": "whisper", "target_id": None, "target_name": "Brenna", "text": "Not here."},
                {"kind": "do", "manner": None, "target_id": None, "target_name": None, "text": "She glances away."},
            ],
        },
    ]
    assert rendered_runs(runs).split("\n") == [
        "[narrate] the narrator: Rain on the quay.",
        '[say] Delphine (whisper, to Brenna): "Not here."',
        "[do] Delphine: She glances away.",
    ]
    questions = check_questions()
    assert set(questions) == {"format_actions", "format_dialogue", "format_narrator", "format_voices"}
    assert all(set(one["criteria"]) == {"meets", "fails"} for one in questions.values())
    answers = {key: {"choice": "meets"} for key in questions} | {"format_dialogue": {"choice": "fails"}}
    assert failed_checks(answers) == [
        "Every piece of dialogue is a speech line, in quotes, with its tone and whom it is said to."
    ]
    assert failed_checks(None) == []


def test_a_line_the_reply_credits_is_that_persons_own() -> None:
    # The operator's test-play, 2026-11-24 (chat 64e11be8): with no runs from the formatter, Delphine's reply
    # was saved inside the narration as "Delphine Halloway (to you): ...".
    from zephyrex.extensions.ai_chat.BLL_AI_Chat import credited_runs  # type: ignore[import-not-found]

    people = [{"id": "del", "name": "Delphine Halloway"}, {"id": "bren", "name": "Brenna"}]
    text = '[location: Saltmere]\nThe quay is quiet.\nDelphine Halloway (to you): "He never came back."'
    runs = credited_runs(text, people)
    assert [(run["speaker_id"], [line["kind"] for line in run["lines"]]) for run in runs] == [
        (None, ["narrate"]),
        ("del", ["say"]),
    ]
    assert runs[1]["speaker_name"] == "Delphine Halloway"
    assert runs[1]["lines"][0]["text"] == "He never came back."
    assert credited_runs("Rain on the quay.", people) == []


def test_a_characters_turn_never_keeps_anothers_line() -> None:
    # The operator's test-play, 2026-11-24 (chat 64e11be8): Mira's turn wrote Delphine's line, plus a code
    # fence, and both were saved as Mira's.
    from zephyrex.extensions.ai_chat.BLL_AI_Chat import credited_runs

    people = [{"id": "mira", "name": "Mira Kettle"}, {"id": "del", "name": "Delphine Halloway"}]
    text = (
        "Mira folds her arms.\n"
        'Delphine Halloway (to Mira Kettle, voice strained): "I want him off my property."\n'
        "```\n"
        'Orrin Halloway (to Mira Kettle): "I am not here."'
    )
    runs = credited_runs(text, people, "mira")
    assert [(run["speaker_id"], [line["text"] for line in run["lines"]]) for run in runs] == [
        ("mira", ["folds her arms."]),
        ("del", ["I want him off my property."]),
    ]
    # A reply of nothing but its own words stays as it is.
    assert credited_runs("Mira folds her arms.", people, "mira") == []
    # Narration that only looks like a label stays the turn's own.
    later = credited_runs('Later: they left.\nDelphine Halloway (to Mira Kettle): "Go."', people, "mira")
    assert [line["text"] for line in later[0]["lines"]] == ["Later: they left."]


def test_with_multi_actor_off_anothers_line_is_cut_never_theirs() -> None:
    # The operator, 2026-11-24: "a setting for multi-actor turns that can be toggled off so each character
    # turn (/narrator) is one model call"; each person then speaks on their own turn.
    from zephyrex.extensions.ai_chat.BLL_AI_Chat import credited_runs

    people = [{"id": "mira", "name": "Mira Kettle"}, {"id": "del", "name": "Delphine Halloway"}]
    text = 'Mira folds her arms.\nDelphine Halloway (to Mira Kettle): "I want him off my property."'
    split = credited_runs(text, people, "mira", True)
    cut = credited_runs(text, people, "mira", False)
    assert [run["speaker_id"] for run in split] == ["mira", "del"]
    assert [(run["speaker_id"], [line["text"] for line in run["lines"]]) for run in cut] == [
        ("mira", ["folds her arms."])
    ]


def test_with_multi_actor_off_the_narrator_voices_no_one() -> None:
    from zephyrex.extensions.ai_chat.Prompt import PROMPT, narrate_rule  # type: ignore[import-not-found]

    cast = [{"id": "mira", "name": "Mira Kettle", "description": "An inspector."}]
    persona = {"name": "Brenna", "description": ""}
    assert PROMPT["narrate_solo"] in narrate_rule(persona, cast, True)
    assert PROMPT["narrate_solo"] not in narrate_rule(persona, cast, False)
