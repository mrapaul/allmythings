from label_norm import normalize_label


def test_normalize_label_is_mechanical_only():
    assert normalize_label("  Navy_Blue   Couch!! ") == "navy blue couch"
    assert normalize_label("dining-table") == "dining table"
    assert normalize_label("refrigeratorDoor") == "refrigerator door"
    assert normalize_label("TV/Monitor") == "tv monitor"
    assert normalize_label("") == ""
    assert normalize_label("   ") == ""


def test_normalize_label_applies_no_semantics():
    # Synonyms must survive as distinct strings — semantics belong to the
    # derived taxonomy, never to normalization.
    assert normalize_label("couch") == "couch"
    assert normalize_label("sofa") == "sofa"
    assert normalize_label("couch") != normalize_label("sofa")
