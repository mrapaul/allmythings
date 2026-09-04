"""Average-linkage agglomerative clustering on cosine distance.

Why agglomerative over k-means: a label vocabulary has no natural k, and the
distribution is long-tailed — most labels appear once or twice. A distance
threshold is directly interpretable ("merge labels closer than 0.25 cosine")
and leaves genuinely rare labels as singleton clusters, whereas k-means forces
every point into one of k spherical clusters and would fold rare-but-distinct
objects into unrelated blobs. No k to tune, no silhouette sweep, and the result
is stable as the vocabulary grows.

Pure Python (no scipy/sklearn): vocabularies here are hundreds to low
thousands of labels, where O(n^2) memory and O(n^3) worst-case time are fine.
"""

from __future__ import annotations

from embed import cosine_distance, normalize

# Calibrated by sweep against the real bootstrap vocabulary (34 labels,
# nomic-embed-text:v1.5): merges appear at 0.12 (couch/sofa), the true-synonym
# plateau is 0.14-0.16 (adds dining table/table), and 0.20 starts making errors
# (book+keyboard+laptop, chair+couch+sofa). Short bare nouns have compressed
# cosine distances, so a higher threshold over-merges badly. 0.15 sits mid-
# plateau. derive_taxonomy.py prints every merge so each regeneration can be
# eyeballed — re-check this value when the vocabulary shifts toward long
# self-describing flywheel labels.
DEFAULT_THRESHOLD = 0.15


def agglomerative(vectors, threshold: float = DEFAULT_THRESHOLD) -> list:
    """Cluster row vectors, returning a list of index lists.

    Merges the closest pair of clusters while their average-linkage distance is
    below threshold. Deterministic: ties break on the lowest index pair."""
    unit = [normalize(v) for v in vectors]
    n = len(unit)
    if n == 0:
        return []
    clusters = {i: [i] for i in range(n)}
    # Pairwise point distances, computed once.
    dist = [[0.0] * n for _ in range(n)]
    for i in range(n):
        for j in range(i + 1, n):
            d = cosine_distance(unit[i], unit[j])
            dist[i][j] = d
            dist[j][i] = d

    def linkage(a, b) -> float:
        return sum(dist[i][j] for i in a for j in b) / (len(a) * len(b))

    while len(clusters) > 1:
        keys = sorted(clusters)
        best = None
        for idx, ka in enumerate(keys):
            for kb in keys[idx + 1 :]:
                d = linkage(clusters[ka], clusters[kb])
                if best is None or d < best[0]:
                    best = (d, ka, kb)
        if best is None or best[0] >= threshold:
            break
        _, ka, kb = best
        clusters[ka] = clusters[ka] + clusters.pop(kb)

    return [sorted(members) for _, members in sorted(clusters.items())]
