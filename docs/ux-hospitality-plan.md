# UX Plan: The Hospitality Framework Applied to allmythings

Source: "Steal this UX framework from Dubai's most over-the-top hotel" — Slava Polonski, UX Collective, Jul 2026.
Core question the framework asks at every decision point: **"What is the most generous reading of this moment, and what tiny action would make this user feel genuinely taken care of?"** The mechanism is cognitive-load reduction (Sweller): every decision deleted hands working memory back to the user. The peak-end rule means users remember the moment it broke — so consistency beats any single delight.

Status legend: ✅ shipped 2026-07-29 · 🔨 in flight · ▶ next · ◻ later · 🧠 model-side

---

## 0. The core-flow friction walk ("Do This Now" #1)

Flow: open app → capture shelf → wait → review items → save → next shelf → later: find an item.

| Moment | Stop-and-think cost | Status |
|---|---|---|
| First run: "what server URL?" | Fatal for non-developers | ✅ mDNS auto-discovery, health-checked, persisted |
| Capture: "is this photo good enough?" | Wasted round-trip on bad photos | ▶ surface the existing server scene-verdict as a pre-upload client gate ("Too dark — more light?") |
| Wait: opaque spinner ~20 s–3 min | The bracing moment | ▶ staged progress ("Reading the scene… found 12 items… refining") from the pipeline's real stages; 🧠 latency itself is eval-gated model work |
| Review: accept each row | N taps for N items | ▶ high-confidence rows pre-accepted; one tap saves all |
| Save: "did it work? where did it go?" | | ✅ snackbar "N saved · M in your home" + Undo (5 s) |
| Next shelf: navigate back to camera | | ✅ camera-first loop after save |
| Find item: recall exact label | | ✅ FTS5 prefix search + 13 household synonym groups + ranking + recent searches |
| Any failure: raw error code on screen | Trust destroyed | ✅ capture queue: "Saved — will catalog when the server is reachable", auto-retry w/ backoff |

## 1. Anticipate the next action (towel on the shower door)

- ✅ Camera-first loop; Undo instead of confirm dialogs.
- ▶ Pre-accepted high-confidence review rows (select-all default; unchecking is the exception).
- ▶ Search field autofocus when arriving via the search tab; keyboard up.
- ◻ "Resume room": if the last save was < 10 min ago, prefill the same room/location for the next capture.

## 2. Great experiences come from people, not processes (the fire-engine moment)

- Voice: the app's copy is its staff. Empty states ("A blank canvas"), snackbar phrasing, queue reassurance are human; keep every new string in that register. ▶ one microcopy pass over all error/edge states — no codes, no jargon, no blame.
- ◻ The un-templatable moment: item names. Rich VLM descriptions ("Orange tufted office chair") read like a person labeled your home. 🧠 naming-richness prompt work continues.

## 3. Solve problems the user hasn't noticed (the lens cloth)

- ✅ EXIF orientation fixed at the root (was silently rotating every capture).
- ▶ Cross-photo duplicate detection: same object captured in two overlapping shots → gentle merge suggestion ("Looks like this chair is already in your inventory"). Design: embedding or label+category+visual-hash similarity, always suggest-never-auto.
- ◻ Smart room grouping: photos taken within minutes are probably one room; offer to group.

## 4. Remove invisible friction (the cable tie / Google Flights speed)

- ✅ Tile identity: every thumbnail is its item (original-res bbox crop), not the whole scene twelve times.
- ✅ One-command stack (`make start` cold-boot-safe); config persisted in `.env`, not shell history.
- 🧠 The deepest normalized noise is detection latency itself (the flight-search spinner of this app). Current: ~20 s single-pass / worse via pipeline. Path: pipeline tuning (in flight), 1280 px input experiment, fine-tuned RF-DETR (~ms class) as the endgame.
- ▶ Staged progress display (see §0).

## 5. Unexpected delight (the second turndown)

- ✅ "12 items saved · 47 in your home."
- ◻ Milestones: 100th item, first complete room ("Living room: 23 items catalogued") — quiet, dismissible, never modal.
- ◻ A yearly "your home, catalogued" recap view. No metric demands it; that's the point.

## 6. Eliminate preparation friction (towels at the kiosk)

- ✅ Zero-config first run (discovery); no account, no server setup.
- ▶ Default home auto-created on first launch if none exists — capture must be tappable within 5 seconds of first open.
- ◻ Sample photo in the picker on first run so the first detection can be experienced before pointing the camera at anything.

## 7. Create value, don't extract (the glass of water)

- Standing rule: core catalphoto → inventory loop stays unlimited and nag-free. No upsell mid-task, ever. If pricing exists someday, it gates scale/sync, never the fountain itself.

## 8. Give the team permission to say yes (the buffet manager)

- Existing: draw-to-teach (user draws a box, model labels it), free relabeling.
- ▶ Manual item add without a photo (bend the rule: not everything needs detection).
- ▶ Accept any label text user types, verbatim, everywhere — user words win over taxonomy.
- ◻ Per-item photo re-shoot from detail view (replace a bad crop without re-doing the room).

## 9. Peace of mind (stop bracing / Price Guarantee)

- ✅ Never-lose-a-capture queue; calm copy; auto-retry on foreground/connectivity.
- ✅ Fully local stack possible (local model, SQLite, LAN) — browsing/search always work offline.
- ▶ **Inventory export/backup** — for an "everything I own" app, the deepest peace-of-mind feature is knowing the inventory itself can't be lost: one-tap export (JSON/CSV + photos zip) to Files/iCloud. This is this app's Price Guarantee.
- ◻ Insurance-ready report generation (item list + photos + dates) — the reason many people want a home inventory at all.

## 10. Assume mistakes will happen (the invisible man)

- ✅ Undo on save-all; no scolding confirms.
- ▶ Undo on delete (replace confirm-dialog with 5 s undo, same snackbar pattern).
- ✅ Server-side: the corrections flywheel is the literal invisible man — every user fix is recorded and erases the mistake class via fine-tuning (🧠 NVIDIA plan).
- ◻ Auto-save review state: leaving mid-review and returning restores exactly.

---

## Priority order (next work after current in-flight lands)

1. Pre-accepted review rows + staged progress (kills the two worst waits in the core loop) — §1, §4
2. Default home + first-run capture-in-5-seconds — §6
3. Export/backup — §9 (peace of mind, cheap to build)
4. Undo-on-delete + review-state autosave — §10
5. Duplicate-merge suggestions — §3 (needs a bit of design)
6. Manual add + label-verbatim rule — §8
7. Milestones/recap — §5 (last; delight tops a working cake)

Every model-side item stays eval-gated against the oracle; every UI item keeps the Maestro flows green.
