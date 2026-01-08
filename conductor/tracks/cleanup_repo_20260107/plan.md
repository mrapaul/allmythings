# Track Plan: Repository Cleanup and Consolidation

## Phase 1: Documentation Consolidation [checkpoint: 0871827]
- [x] Task: Audit all `.md` files across the repository (excluding `README.md`, `GEMINI.md`, `CLAUDE.md`).
- [x] Task: Extract essential setup instructions, architecture summaries, and feature lists from `.archive/`, `docs/`, `api-service/docs/`, etc.
- [x] Task: Update the root `README.md` with the extracted concise information.
- [x] Task: Delete all `.md` files except for the core three (`README.md`, `GEMINI.md`, `CLAUDE.md`).
- [x] Task: Conductor - User Manual Verification 'Documentation Consolidation' (Protocol in workflow.md) [0871827]

## Phase 2: Code and Script Cleanup [checkpoint: c1a9608]
- [x] Task: Delete `guardian-service/` directory and any other orphaned service folders.
- [x] Task: Identify and remove unused root scripts (e.g., old orchestration logs, one-off python scripts not used in the main pipeline).
- [x] Task: Perform a recursive scan of `api-service/src` and `mobile-app/lib` to remove orphaned files or commented-out code blocks.
- [x] Task: Delete experimental or legacy test files (keeping only Unit and E2E tests applicable to current functionality).
- [x] Task: Conductor - User Manual Verification 'Code and Script Cleanup' (Protocol in workflow.md) [c1a9608]

## Phase 3: Final Verification [checkpoint: d30eebf]
- [x] Task: Run `make build` or equivalent to ensure the application still builds correctly.
- [x] Task: Run core unit tests for `api-service` and `mobile-app`.
- [x] Task: Run E2E verification to ensure the hybrid detection pipeline is functional.
- [x] Task: Conductor - User Manual Verification 'Final Verification' (Protocol in workflow.md) [d30eebf]
