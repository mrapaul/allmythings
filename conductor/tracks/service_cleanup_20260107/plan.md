# Track Plan: Service Cleanup and AI Functional Restoration

## Phase 1: Repository Cleanup
- [x] Task: Delete `guardian-service` directory. [56bedea]
- [x] Task: Remove references to `guardian-service` in `Makefile` and `docker-compose.yml`. [2cf15e9]
- [ ] Task: Conductor - User Manual Verification 'Repository Cleanup' (Protocol in workflow.md)

## Phase 2: AI Provider Restoration
- [ ] Task: Validate Gemini Vision integration with real API Key.
- [ ] Task: Pull and configure local Ollama model (e.g., llava) for `api-service`.
- [ ] Task: Update `VisionOrchestratorService` fallback logic to ensure high reliability.
- [ ] Task: Conductor - User Manual Verification 'AI Provider Restoration' (Protocol in workflow.md)

## Phase 3: Accuracy and Completeness Validation
- [ ] Task: Enhance Gemini system prompt for detailed attribute and spatial extraction.
- [ ] Task: Run end-to-end test on `test_images/ai_interior.jpg` and compare results against requirements.
- [ ] Task: Conductor - User Manual Verification 'Accuracy and Completeness Validation' (Protocol in workflow.md)
