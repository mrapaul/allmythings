# Track Spec: Service Cleanup and AI Functional Restoration

## Overview
This track focuses on cleaning up the repository by removing legacy services and restoring the core AI detection functionality to meet the project's non-negotiable requirements for accuracy and completeness.

## Scope
- Delete the `guardian-service` directory and its references.
- Configure and validate the `api-service` integration with Gemini 1.5 Flash.
- Configure and validate the `api-service` integration with local Ollama models.
- Ensure the `detection-service` (YOLO) correctly labels objects using readable names.
- Verify end-to-end detection accuracy using test images.

## Success Criteria
- [ ] `guardian-service` directory is removed.
- [ ] `api-service` successfully authenticates and receives results from Gemini.
- [ ] `api-service` successfully connects to and receives results from Ollama.
- [ ] `detection-service` returns descriptive labels (e.g., "chair", "tv") instead of numeric IDs.
- [ ] Hybrid detection pipeline returns a comprehensive list of objects with attributes and categories.
