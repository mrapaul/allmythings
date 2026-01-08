# Track Spec: Repository Cleanup and Consolidation

## Overview
This track focuses on a comprehensive cleanup of the "Visual Home Inventory Manager" repository. The goal is to remove all dead, unused, and orphaned code, consolidate all documentation into the primary README, and eliminate any non-essential scripts or artifacts. The resulting repository should contain only the code necessary for the application's functionality and its core validation tests.

## Functional Requirements
- **Broad Recursive Cleanup:** Perform a deep scan of all directories (`/api-service`, `/mobile-app`, `/detection-service`, root scripts, etc.) to identify and remove unused source code, classes, functions, and configuration files.
- **Documentation Consolidation:**
    - Identify all `.md` files across the repository.
    - Exclude `GEMINI.md`, `CLAUDE.md`, and `README.md`.
    - Extract valuable and concise information from the identified files (architecture, setup, core features).
    - Merge this information into `README.md`.
    - Delete all processed `.md` files.
- **Selective Test Preservation:**
    - Identify all test suites and scripts.
    - Retain only the tests necessary for verifying application correctness (Unit tests, E2E tests).
    - Remove experimental scripts, legacy migration tools, and one-off developer utilities.

## Non-Functional Requirements
- **Conciseness:** Merged documentation in `README.md` must be brief and high-value.
- **Maintainability:** Removing dead code should improve build times and reduce cognitive load for developers.
- **Safety:** The cleanup must not break the core functionality of the mobile app or the API services.

## Acceptance Criteria
- [ ] `guardian-service` directory (if remaining) is completely removed.
- [ ] No orphaned `.ts`, `.dart`, or `.py` files remain that aren't imported or used.
- [ ] All `.md` files except `GEMINI.md`, `CLAUDE.md`, and `README.md` are deleted.
- [ ] `README.md` contains a concise summary of the project's architecture and operation derived from the deleted files.
- [ ] The application builds and starts successfully in a development environment.
- [ ] Core unit and E2E tests pass after the cleanup.

## Out of Scope
- Major refactoring of active code (this is a deletion and consolidation task).
- Adding new features or models.
