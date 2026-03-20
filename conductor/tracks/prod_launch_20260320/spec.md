# Specification: Production Launch & Beta Distribution

**Overview:**
This track focuses on transforming the current development-state application into a production-ready system, specifically targeting internal and beta distribution (TestFlight/Firebase). The goal is to provide a comprehensive, automated pipeline for building, testing, and deploying the mobile app and its supporting services (API and ML) with a focus on cost-efficiency and performance.

**Functional Requirements:**
- **Distribution-Ready Builds:** Configure the Flutter app for production (icons, splash screens, versioning, flavors).
- **Automated Deployment:** Implement CI/CD for:
    - **Mobile App:** Automated builds and uploads to TestFlight/Firebase App Distribution.
    - **API Service:** Automated deployment to a production NixOS server or cost-optimized cloud provider.
- **Production-Ready Vision AI:** 
    - Configure the `VisionOrchestratorService` to prioritize free/low-cost tiers (Google Vision, Gemini Flash, etc.).
    - Provide a "Self-Hosted" option for the ML/Vision components (Ollama/YOLO) for the NixOS server.
- **App Store Assets:** Generate app icons, placeholder legal docs (Privacy Policy, ToS), and base screenshots for store listings.
- **Environment Management:** Create a production-grade configuration system (`.env`, secret management) for the backend and mobile apps.

**Non-Functional Requirements:**
- **Cost Efficiency:** Design the architecture to leverage free tiers of cloud services (Gemini 1.5 Flash, AWS Free Tier, etc.) or self-hosting.
- **Security:** Ensure production builds do not include development logs or hardcoded secrets.
- **Stability:** Implement health checks and basic monitoring for the production API.

**Acceptance Criteria:**
- [ ] Flutter production builds successfully uploaded to TestFlight or Firebase App Distribution.
- [ ] API service successfully deployed and reachable on the production NixOS server or cloud host.
- [ ] Vision AI ensemble correctly calls production providers and handles errors gracefully.
- [ ] "About" and "Privacy" sections present in the app.
- [ ] Production build script (`deploy.sh`) exists and is documented.

**Out of Scope:**
- Full public submission to App Store/Google Play (this track stops at Beta/Internal).
- Marketing website or external documentation for end-users.
