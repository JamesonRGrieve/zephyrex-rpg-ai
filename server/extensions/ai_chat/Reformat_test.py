# SPDX-License-Identifier: AGPL-3.0-or-later
"""The reformat model (the operator, 2026-11-23): attribution among the people present only."""

from __future__ import annotations

import json
from typing import Any

from zephyrex.extensions.ai_chat.Reformat import (  # type: ignore[import-not-found]
    faithful,
    grounded,
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
    assert set(questions) == {"format_dialogue", "format_narrator", "format_voices", "format_speakers"}
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
    # A character's own action line, already in its form, is saved as written.
    assert credited_runs("Mira folds her arms.", people, "mira") == []
    # One left in the past tense, or under a pronoun, is put in its form (live run, 2026-11-24).
    own = credited_runs("She folded her arms.", people, "mira")
    texts = [(run["speaker_id"], [line["text"] for line in run["lines"]]) for run in own]
    assert texts == [("mira", ["folds her arms."])]
    # A reply with nothing to move is saved as it is.
    assert credited_runs("Mind the coolant, it bites.", people, "mira") == []
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


def test_the_formatter_is_told_who_each_person_is() -> None:
    # The operator's test-play, 2026-11-24 (chat 950d879c): Delphine's answer ("her teacup") was credited to Bram.
    from zephyrex.extensions.ai_chat.Reformat import reformat_request

    who = {"Delphine Halloway": "the missing merchant's wife; she", "Bram Holloway": "a dockhand; he"}
    body = reformat_request("m", "She sets down her teacup.", ["Bram Holloway", "Delphine Halloway"], "", who)
    system = body["messages"][0]["content"]
    assert "Delphine Halloway (the missing merchant's wife; she)" in system
    assert "Bram Holloway (a dockhand; he)" in system
    assert "their pronouns and whom they answer" in system


def test_each_narration_sentence_about_a_person_is_checked_on_its_own() -> None:
    # The operator, 2026-11-24: "HOW THE FUCK ARE WE STILL NOT TAGGING ACTIONS?" The check cites the sentence.
    from zephyrex.extensions.ai_chat.Reformat import check_questions, failed_checks

    people = [{"id": "del", "name": "Delphine Halloway"}]
    narrated = [{"kind": "narrate", "text": "Rain. Delphine flinches."}]
    runs = [{"speaker_id": None, "speaker_name": None, "lines": narrated}]
    questions = check_questions(runs, people)
    assert "Delphine flinches." in questions["action_0"]["instructions"]
    answers = {key: {"choice": "meets"} for key in questions} | {"action_0": {"choice": "an action"}}
    failed = failed_checks(answers, runs, people)
    assert len(failed) == 1 and "Delphine flinches." in failed[0]


def test_a_reply_in_markdown_is_made_runs_with_its_action_an_action_line() -> None:
    # Live run, 2026-11-24 (multi_actor off): "`Old Hesk:` *He finally lifts his gaze...*" was saved as it was.
    from zephyrex.extensions.ai_chat.BLL_AI_Chat import credited_runs

    people = [{"id": "hesk", "name": "Old Hesk"}, {"id": "bren", "name": "Brenna Ashdown"}]
    text = '`Old Hesk:` *He finally lifts his gaze to meet yours.* "Seen... shapes. In the windows."'
    runs = credited_runs(text, people, "hesk", split=False)
    assert runs, "a reply wrapped in markdown is always made runs"
    words = " ".join(str(line["text"]) for run in runs for line in run["lines"])
    assert "`" not in words and "*" not in words
    assert all(run["speaker_id"] == "hesk" for run in runs)


def test_tonights_live_replies_are_saved_in_their_lines() -> None:
    # Live runs on build56, 2026-11-24 (player.live, chat 3bb5e978): the narrator left "Old Hesk shifts his
    # weight..." as narration, Tam's reply kept its raw "(to you)" prefix, and "The ferry bumps..." stayed Hesk's.
    from zephyrex.extensions.ai_chat.BLL_AI_Chat import credited_runs

    people = [
        {"id": "hesk", "name": "Old Hesk"},
        {"id": "tam", "name": "Tam Quickfoot"},
        {"id": "bren", "name": "Brenna Ashdown"},
    ]

    def shape(runs: list[dict[str, Any]]) -> list[tuple[Any, list[str]]]:
        return [(run["speaker_id"], [line["kind"] for line in run["lines"]]) for run in runs]

    narrated = credited_runs(
        "The rain drums against your shields. Old Hesk shifts his weight from foot to foot.", people, None, True, "bren"
    )
    assert shape(narrated) == [(None, ["narrate"]), ("hesk", ["do"])]
    # Tam's own line "to you" is said to the seat's character, by name (the page couldn't read "to you").
    tam = credited_runs('Tam Quickfoot (to you): "Maybe he found a chest of gold."', people, "tam", True, "bren")
    assert shape(tam) == [("tam", ["say"])] and tam[0]["lines"][0]["target_id"] == "bren"
    hesk = credited_runs("Hesk spits. The ferry bumps against the post with a hollow thunk.", people, "hesk", False)
    assert shape(hesk) == [("hesk", ["do"]), (None, ["narrate"])]
    # A narration of the world alone is saved as it is.
    assert credited_runs("Rain on the quay.", people, None, True, "bren") == []


#: build60's live run, 2026-11-24, chat d219ba90: the prose, and the formatter's answer that credited Delphine
#: Halloway's speech to Bram Holloway, as action lines.
D219 = (
    "Delphine Halloway's spine stiffens further, if such a thing were possible. Her fingers tighten around the cold"
    ' teacup. "Mr. Ashford, my husband is many things, generous, distracted, fond of his cards, but he is not'
    ' foolish. We have been married twenty years." She sets down the cup with deliberate care. "Moreover, he had no'
    ' money with him when he left the counting-house."\n\n"I assume a woman would require payment," she adds.'
)
HOLLOWAYS = [
    {"id": "del", "name": "Delphine Halloway", "summary": "Orrin's wife; she keeps the house and her temper."},
    {"id": "bram", "name": "Bram Holloway", "summary": "A clerk; he owes his employer more than he admits."},
    {"id": "ash", "name": "Ashford", "summary": ""},
]


def _item(kind: str, speaker: str | None, text: str) -> dict[str, Any]:
    return {"fields": {"kind": kind, "speaker": speaker, "target": None, "manner": None}, "text": text, "closed": True}


def test_the_prose_says_whose_and_what_kind_each_line_is() -> None:
    items = [
        _item("narrate", None, "Delphine Halloway's spine stiffens further, if such a thing were possible."),
        _item(
            "do",
            "Bram Holloway",
            "Mr. Ashford, my husband is many things, generous, distracted, fond of his cards, but he is not foolish."
            " We have been married twenty years.",
        ),
        _item("do", "Bram Holloway", "sets down the cup with deliberate care."),
        _item("do", "Bram Holloway", "Moreover, he had no money with him when he left the counting-house."),
        _item("do", "Bram Holloway", "I assume a woman would require payment,"),
    ]
    fixed = grounded(items, D219, HOLLOWAYS)
    assert [(one["fields"]["kind"], one["fields"]["speaker"]) for one in fixed] == [
        ("narrate", None),
        ("say", "Delphine Halloway"),
        ("do", "Delphine Halloway"),
        ("say", "Delphine Halloway"),
        ("say", "Delphine Halloway"),
    ]


def test_a_line_the_prose_gives_its_speaker_stays_theirs() -> None:
    prose = 'Delphine Halloway waits. He clears his throat. "We should go."'
    items = [
        _item("do", "Delphine Halloway", "waits."),
        _item("do", "Bram Holloway", "clears his throat."),
        _item("say", "Bram Holloway", "We should go."),
    ]
    assert [one["fields"]["speaker"] for one in grounded(items, prose, HOLLOWAYS)] == [
        "Delphine Halloway",
        "Bram Holloway",
        "Bram Holloway",
    ]


def _aimed_item(kind: str, speaker: str, target: str | None, text: str) -> dict[str, Any]:
    fields = {"kind": kind, "speaker": speaker, "target": target, "manner": None}
    return {"fields": fields, "text": text, "closed": True}


def test_speech_is_aimed_at_whom_it_calls_else_at_whoever_it_answers() -> None:
    # build60's live run, 2026-11-24, chat d219ba90: Delphine Halloway's answer to Quentin Ashford's question saved
    # as "Delphine Halloway (to Bram Holloway): ...", and her own pause "(at Bram Holloway)".
    prose = (
        'Delphine Halloway pauses, reconsidering. "Mr. Ashford, my husband is many things." She glances at him.'
        ' "We have been married twenty years."'
    )
    items = [
        _aimed_item("do", "Delphine Halloway", "Bram Holloway", "pauses, reconsidering."),
        _aimed_item("say", "Delphine Halloway", "Bram Holloway", "Mr. Ashford, my husband is many things."),
        _aimed_item("do", "Delphine Halloway", "Ashford", "glances at him."),
        _aimed_item("say", "Delphine Halloway", "Bram Holloway", "We have been married twenty years."),
    ]
    fixed = grounded(items, prose, [*HOLLOWAYS[:2], {"id": "ash", "name": "Ashford", "pronoun": "he"}], "Ashford")
    assert [one["fields"]["target"] for one in fixed] == [None, "Ashford", "Ashford", "Ashford"]


def test_a_target_the_paragraph_names_stays() -> None:
    prose = 'Delphine Halloway turns to Bram Holloway. "You knew."'
    items = [_aimed_item("say", "Delphine Halloway", "Bram Holloway", "You knew.")]
    assert grounded(items, prose, HOLLOWAYS, "Ashford")[0]["fields"]["target"] == "Bram Holloway"


def test_a_quote_cut_by_its_speech_tag_is_one_line() -> None:
    # build60's live run, 2026-11-24, chat d219ba90: 'Delphine Halloway (to Bram Holloway): "Romantic liaison,"'
    # saved alone.
    prose = '"Romantic liaison," Delphine Halloway repeats, the words clipped, "is not a phrase I use."'
    items = [
        _aimed_item("say", "Delphine Halloway", None, "Romantic liaison,"),
        _aimed_item("do", "Delphine Halloway", None, "repeats, the words clipped,"),
        _aimed_item("say", "Delphine Halloway", None, "is not a phrase I use."),
    ]
    assert [(one["fields"]["kind"], one["text"]) for one in grounded(items, prose, HOLLOWAYS)] == [
        ("say", "Romantic liaison, is not a phrase I use."),
        ("do", "repeats, the words clipped,"),
    ]


def test_an_action_credited_to_a_near_name_is_whose_the_prose_says() -> None:
    # build60's live run, 2026-11-24, chat d219ba90 (19:53:26Z): "Bram Holloway leans back, hands folded in her lap".
    prose = "Delphine Halloway leans back, hands folded in her lap."
    items = [_item("do", "Bram Holloway", "leans back, hands folded in her lap.")]
    assert grounded(items, prose, HOLLOWAYS)[0]["fields"]["speaker"] == "Delphine Halloway"


def test_an_action_in_marks_is_a_line_apart_from_the_speech_after_it() -> None:
    # build60's live run, 2026-11-24, chat e377b927: "Looks back over his shoulder at Brenna, rain streaming down his
    # faceGive me a boost and I'll check what's inside." once the marks were taken off.
    from zephyrex.extensions.ai_chat.BLL_AI_Chat import credited_runs

    people = [{"id": "tam", "name": "Tam Quickfoot"}, {"id": "bren", "name": "Brenna Ashdown"}]
    text = (
        "*Looks back over his shoulder at Brenna, rain streaming down his face*"
        "Give me a boost and I'll check what's inside."
    )
    runs = credited_runs(text, people, "tam")
    assert [(run["speaker_id"], [(line["kind"], line["text"]) for line in run["lines"]]) for run in runs] == [
        (
            "tam",
            [
                ("do", "looks back over his shoulder at Brenna, rain streaming down his face"),
                ("say", "Give me a boost and I'll check what's inside."),
            ],
        )
    ]
