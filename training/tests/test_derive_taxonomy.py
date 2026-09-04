"""Derived-taxonomy tests. The embedder is mocked deterministically: labels get
hand-placed unit vectors so clustering outcomes are exact, with no Ollama."""

from collections import Counter
from pathlib import Path

import pytest
from cluster import agglomerative
from coco_sources import ImageEntry
from derive_taxonomy import assign_ids, build_clusters, collect_vocabulary, member_to_class
from embed import EmbedderUnavailable, cosine_distance, normalize

SHA = "c" * 64


def fake_embedder(vectors_by_label):
    def _embed(labels):
        missing = [lbl for lbl in labels if lbl not in vectors_by_label]
        if missing:
            raise AssertionError(f"test vector missing for {missing}")
        return {lbl: vectors_by_label[lbl] for lbl in labels}

    return _embed


def entry(kind, anns, cats):
    return ImageEntry(SHA, Path("/x/img.jpg"), 640, 480, tuple(anns), cats, kind)


def test_normalize_and_cosine_distance():
    assert cosine_distance(normalize([1, 0]), normalize([1, 0])) == pytest.approx(0.0)
    assert cosine_distance(normalize([1, 0]), normalize([0, 1])) == pytest.approx(1.0)
    assert normalize([0, 0]) == [0, 0]


def test_agglomerative_merges_only_within_threshold():
    # Two tight pairs far apart from each other.
    vectors = [[1, 0], [0.999, 0.045], [0, 1], [0.045, 0.999]]
    groups = agglomerative(vectors, threshold=0.1)
    assert sorted(groups) == [[0, 1], [2, 3]]
    # A threshold below the pair distance leaves every point alone.
    assert agglomerative(vectors, threshold=0.0) == [[0], [1], [2], [3]]
    assert agglomerative([], threshold=0.1) == []


def test_collect_vocabulary_normalizes_and_prefers_flywheel_label():
    anns_fly = [
        {"category_id": 1, "attributes": {"label": "Navy_Blue Couch"}},
        {"category_id": 1, "attributes": {"label": "navy blue couch"}},
    ]
    anns_boot = [{"category_id": 2}, {"category_id": 2}, {"category_id": 3}]
    entries = [
        entry("flywheel", anns_fly, {1: "Furniture"}),
        entry("bootstrap", anns_boot, {2: "diningTable", 3: "sofa"}),
    ]
    counts, flywheel_labels = collect_vocabulary(entries)
    assert counts["navy blue couch"] == 2
    assert counts["dining table"] == 2
    assert counts["sofa"] == 1
    assert flywheel_labels == {"navy blue couch"}


def test_build_clusters_names_by_frequency_then_alphabetically():
    counts = Counter({"sofa": 10, "couch": 3, "lamp": 5})
    vectors = {"sofa": [1.0, 0.0], "couch": [0.999, 0.045], "lamp": [0.0, 1.0]}
    clusters, degraded = build_clusters(counts, 0.1, fake_embedder(vectors))
    assert degraded is False
    by_name = {c["name"]: c for c in clusters}
    assert set(by_name) == {"sofa", "lamp"}
    assert by_name["sofa"]["members"] == ["couch", "sofa"]
    assert by_name["sofa"]["count"] == 13
    # Highest count first.
    assert clusters[0]["name"] == "sofa"


def test_build_clusters_ties_break_alphabetically():
    counts = Counter({"zebra chair": 5, "armchair": 5})
    vectors = {"zebra chair": [1.0, 0.0], "armchair": [0.999, 0.045]}
    clusters, _ = build_clusters(counts, 0.1, fake_embedder(vectors))
    assert clusters[0]["name"] == "armchair"


def test_build_clusters_falls_back_to_exact_labels_when_embedder_down():
    counts = Counter({"sofa": 2, "couch": 1})

    def broken(_labels):
        raise EmbedderUnavailable("ollama down")

    clusters, degraded = build_clusters(counts, 0.1, broken)
    assert degraded is True
    assert {c["name"] for c in clusters} == {"sofa", "couch"}
    assert all(len(c["members"]) == 1 for c in clusters)


def test_build_clusters_empty_vocabulary():
    assert build_clusters(Counter(), 0.1, fake_embedder({})) == ([], False)


def test_assign_ids_is_one_based_and_dense():
    clusters = assign_ids([{"name": "a", "count": 2, "members": ["a"]},
                           {"name": "b", "count": 1, "members": ["b"]}])
    assert [c["id"] for c in clusters] == [1, 2]


def test_member_to_class_maps_every_member():
    clusters = [{"id": 1, "name": "sofa", "count": 3, "members": ["couch", "sofa"]}]
    assert member_to_class(clusters) == {"couch": "sofa", "sofa": "sofa"}
