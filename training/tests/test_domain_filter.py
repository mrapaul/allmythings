from domain_filter import JudgeUnavailable, judge_labels, parse_verdict


def test_parse_verdict_reads_yes_no_tolerantly():
    assert parse_verdict("YES") is True
    assert parse_verdict(" no.") is False
    assert parse_verdict("**No**") is False
    assert parse_verdict("Yes, a sofa is household contents.") is True


def test_parse_verdict_keeps_label_when_reply_unusable():
    # Over-inclusion is recoverable; silently dropping data is not.
    assert parse_verdict("") is True
    assert parse_verdict("maybe?") is True
    assert parse_verdict(None) is True


def test_judge_labels_uses_injected_generator_and_dedupes(tmp_path):
    calls = []

    def fake(label):
        calls.append(label)
        return "YES" if label in ("sofa", "vase") else "NO"

    out = judge_labels(
        ["sofa", "zebra", "vase", "sofa"],
        cache_path=tmp_path / "cache.json",
        generate=fake,
    )
    assert out == {"sofa": True, "zebra": False, "vase": True}
    assert calls == ["sofa", "zebra", "vase"]  # deduped


def test_judge_labels_caches_across_runs(tmp_path):
    cache = tmp_path / "cache.json"
    judge_labels(["sofa"], cache_path=cache, generate=lambda _l: "YES")

    def explode(_label):
        raise AssertionError("should have been served from cache")

    assert judge_labels(["sofa"], cache_path=cache, generate=explode) == {"sofa": True}


def test_judge_labels_raises_when_first_call_fails(tmp_path):
    def down(_label):
        raise OSError("connection refused")

    try:
        judge_labels(["sofa"], cache_path=tmp_path / "c.json", generate=down)
    except JudgeUnavailable:
        return
    raise AssertionError("expected JudgeUnavailable")


def test_judge_labels_keeps_label_when_a_later_call_fails(tmp_path):
    def flaky(label):
        if label == "sofa":
            return "YES"
        raise OSError("dropped")

    out = judge_labels(["sofa", "vase"], cache_path=tmp_path / "c.json", generate=flaky)
    assert out == {"sofa": True, "vase": True}
