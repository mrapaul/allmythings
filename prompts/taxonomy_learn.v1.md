# Taxonomy Learning Prompt (v1)

Used by taxonomy_learn.flow to name clusters of category_raw values.

Input: a list of raw category strings from the last week's detections,
grouped by cluster.

Task: for each cluster, choose a canonical category name that best
describes all members. Return a JSON array:

[
  {"cluster_id": 1, "canonical": "Furniture", "aliases": [...]},
  {"cluster_id": 2, "canonical": "Lighting",  "aliases": [...]}
]
