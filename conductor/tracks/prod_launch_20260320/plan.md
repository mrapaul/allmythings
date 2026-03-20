# Implementation Plan: Production Launch & Beta Distribution

**Phase 1: Foundation & Production Assets**
- [ ] Task: Create production-ready app icons and splash screens.
- [ ] Task: Draft boilerplate Privacy Policy and Terms of Service (Markdown).
- [ ] Task: Implement "About" and "Legal" views in the mobile app.
- [ ] Task: Conductor - User Manual Verification 'Phase 1' (Protocol in workflow.md)

**Phase 2: Backend Production Environment**
- [ ] Task: Define a NixOS configuration (`configuration.nix`) for the backend service (Fastify + PostgreSQL).
- [ ] Task: Optimize `VisionOrchestratorService` to use Gemini Flash and Google Vision free tiers.
- [ ] Task: Implement a production-grade detection health check endpoint.
- [ ] Task: Conductor - User Manual Verification 'Phase 2' (Protocol in workflow.md)

**Phase 3: Automated Build & Distribution Pipeline**
- [ ] Task: Configure GitHub Actions for Flutter iOS/Android production builds.
- [ ] Task: Set up Firebase App Distribution (for Android) and TestFlight (for iOS) CLI uploads.
- [ ] Task: Create a top-level `deploy-production.sh` script for unified deployment.
- [ ] Task: Conductor - User Manual Verification 'Phase 3' (Protocol in workflow.md)

**Phase 4: Verification & Handover**
- [ ] Task: Perform end-to-end smoke tests on a production-build device.
- [ ] Task: Verify backend response times and cloud service usage (confirm within free tiers).
- [ ] Task: Conductor - User Manual Verification 'Phase 4' (Protocol in workflow.md)
