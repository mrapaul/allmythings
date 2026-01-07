# Track Plan: Service Cleanup and AI Functional Restoration

## Phase 1: Repository Cleanup [checkpoint: 421aaac]
- [x] Task: Delete `guardian-service` directory. [56bedea]
- [x] Task: Remove references to `guardian-service` in `Makefile` and `docker-compose.yml`. [2cf15e9]
- [x] Task: Conductor - User Manual Verification 'Repository Cleanup' (Protocol in workflow.md) [421aaac]

## Phase 2: AI Provider Restoration [checkpoint: 1ad174f]
- [x] Task: Validate Gemini Vision integration with real API Key. [tool-provided]
- [x] Task: Pull and configure local Ollama model (e.g., llava) for `api-service`. [1018889]
- [x] Task: Update `VisionOrchestratorService` fallback logic to ensure high reliability. [b2200f4]
- [x] Task: Conductor - User Manual Verification 'AI Provider Restoration' (Protocol in workflow.md) [1ad174f]

## Phase 3: Accuracy and Completeness Validation [checkpoint: 4451a0b]
- [x] Task: Enhance Gemini system prompt for detailed attribute and spatial extraction. [manual-verify]
- [x] Task: Run end-to-end test on `test_images/ai_interior.jpg` and compare results against requirements. [validated-ollama]
- [x] Task: Conductor - User Manual Verification 'Accuracy and Completeness Validation' (Protocol in workflow.md) [4451a0b]
