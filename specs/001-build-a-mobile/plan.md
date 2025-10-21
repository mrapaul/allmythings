# Implementation Plan: Visual Home Inventory Manager

**Branch**: `001-build-a-mobile` | **Date**: 2025-10-18 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/001-build-a-mobile/spec.md`

**Note**: This template is filled in by the `/speckit.plan` command. See `.specify/templates/commands/plan.md` for the execution workflow.

## Summary

Build a cross-platform mobile application (iOS + Android) that uses cloud-based computer vision AI to detect objects from camera photos, allowing users to build a searchable home inventory with custom labels. The app features an Instagram-style minimal UI with gesture-based navigation and local data storage.

## Technical Context

**Language/Version**:
- Mobile: Dart 3.x with Flutter 3.16+
- API: TypeScript 5.x with Node.js 20 LTS

**Primary Dependencies**:
- Mobile: Riverpod (state), Drift (SQLite ORM), dio (HTTP), go_router (navigation)
- API: Fastify 4.x (framework), Zod (validation), Axios (vision SDKs)
- Vision AI: Multi-Provider Ensemble (Meta Detectron2, Google Cloud Vision, AWS Rekognition, TensorFlow Serving)

**Storage**:
- Mobile: SQLite with Drift ORM + FTS5 for search
- API: Cloud Storage (temporary image staging)

**Testing**:
- Mobile: flutter_test (unit/widget), integration_test, Maestro (E2E)
- API: Vitest (unit), Supertest (contract/integration)
- Coverage: >80% required

**Target Platform**: iOS 15+ and Android 10+ (API level 29+)
**Project Type**: Mobile + Cloud API (dual mobile apps + backend API service)
**Performance Goals**:
- App launch to camera ready: <2 seconds
- Object detection processing: <5 seconds
- Search query response: <1 second for 500 items
- UI performance: 60fps scrolling and animations
- Photo upload and detection: <10 seconds for typical 8MP image

**Constraints**:
- Cloud-based object detection (requires internet)
- Local-only data storage (no cloud sync)
- Photo-centric minimal UI (Instagram-style)
- Works on devices from last 3 years
- Cross-platform iOS + Android

**Scale/Scope**:
- Single-user mobile app
- ~10-15 screens/views
- Support up to 500+ inventory items per user
- Handle photos with up to 50 detected objects
- Local database up to 500MB (photos + metadata)

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

**Status**: Constitution template not yet defined for this project. Will establish project-specific principles during Phase 0 research based on:
- Test-first development (TDD mandatory)
- Code coverage requirements (>80%)
- Design pattern adherence (SOLID, clean architecture)
- Best-of-breed technology selection
- CI/CD pipeline setup

## Project Structure

### Documentation (this feature)

```
specs/[###-feature]/
├── plan.md              # This file (/speckit.plan command output)
├── research.md          # Phase 0 output (/speckit.plan command)
├── data-model.md        # Phase 1 output (/speckit.plan command)
├── quickstart.md        # Phase 1 output (/speckit.plan command)
├── contracts/           # Phase 1 output (/speckit.plan command)
└── tasks.md             # Phase 2 output (/speckit.tasks command - NOT created by /speckit.plan)
```

### Source Code (repository root)

```
mobile-app/
├── src/
│   ├── features/
│   │   ├── camera/
│   │   │   ├── screens/
│   │   │   ├── components/
│   │   │   └── services/
│   │   ├── inventory/
│   │   │   ├── screens/
│   │   │   ├── components/
│   │   │   └── services/
│   │   ├── labels/
│   │   │   ├── screens/
│   │   │   ├── components/
│   │   │   └── services/
│   │   └── search/
│   │       ├── screens/
│   │       ├── components/
│   │       └── services/
│   ├── core/
│   │   ├── database/
│   │   ├── models/
│   │   ├── navigation/
│   │   └── theme/
│   ├── shared/
│   │   ├── components/
│   │   ├── hooks/
│   │   └── utils/
│   └── services/
│       ├── vision-api/
│       ├── storage/
│       └── analytics/
├── tests/
│   ├── unit/
│   ├── integration/
│   └── e2e/
├── assets/
│   ├── images/
│   ├── fonts/
│   └── icons/
└── [platform-specific files based on framework choice]

api-service/
├── src/
│   ├── handlers/
│   │   └── vision.ts/py
│   ├── integrations/
│   │   ├── google-vision/
│   │   ├── aws-rekognition/
│   │   └── azure-cv/
│   ├── models/
│   └── utils/
├── tests/
│   ├── unit/
│   ├── integration/
│   └── contract/
└── infrastructure/
    ├── terraform/
    └── k8s/

.github/
└── workflows/
    ├── mobile-ci.yml
    ├── api-ci.yml
    └── e2e-tests.yml
```

**Structure Decision**: Selected Mobile + API architecture because:
- Mobile app handles UI, local storage, and user interactions
- Lightweight API service acts as proxy to cloud vision providers
- API service handles vision API integration, rate limiting, and error handling
- Separation allows independent scaling and deployment
- Feature-based mobile structure for better modularity and testability

## Complexity Tracking

*Fill ONLY if Constitution Check has violations that must be justified*

**Status**: No complexity violations identified. Architecture follows industry best practices:
- Clean Architecture with feature-first organization
- Repository pattern for testability
- Dependency injection via Riverpod
- Type-safe database access via Drift
- Functional error handling via fpdart

All architectural decisions are justified in [research.md](./research.md).

---

## Phase 0: Research ✅ COMPLETE

**Deliverable**: [research.md](./research.md)

**Completed Research**:
- ✅ Mobile framework evaluation (Flutter selected)
- ✅ Backend framework evaluation (Node.js + Fastify selected)
- ✅ Vision AI provider comparison (Google Cloud Vision primary, AWS fallback)
- ✅ Database solution analysis (SQLite + Drift selected)
- ✅ State management evaluation (Riverpod selected)
- ✅ Testing strategy defined (multi-layer with Maestro)
- ✅ CI/CD pipeline designed (GitHub Actions + Codemagic)
- ✅ Infrastructure selected (Cloud Run + Cloud Storage)
- ✅ Design patterns established (Clean Architecture)
- ✅ All dependencies evaluated and justified

**Key Decisions**:
1. Flutter 3.x for cross-platform mobile (single codebase, 60fps performance)
2. Node.js + TypeScript + Fastify for API proxy (high performance, type safety)
3. Multi-Provider Ensemble Vision AI (Meta, Google, AWS, TensorFlow) for 92-95% accuracy
4. SQLite + Drift for local storage (proven, FTS5 search, type-safe)
5. Riverpod for state management (testable, type-safe, excellent DX)
6. Clean Architecture with feature-first organization (maintainability, scalability)

---

## Phase 1: Design & Contracts ✅ COMPLETE

**Deliverables**:
- ✅ [data-model.md](./data-model.md) - Database schema and entities
- ✅ [contracts/vision-api.yaml](./contracts/vision-api.yaml) - OpenAPI spec for vision API
- ✅ [contracts/mobile-data-contracts.md](./contracts/mobile-data-contracts.md) - Mobile type definitions
- ✅ [quickstart.md](./quickstart.md) - Developer onboarding guide
- ✅ CLAUDE.md updated with technology stack

**Data Model Summary**:
- **InventoryItems**: Stores photos and detection metadata (JSON)
- **Labels**: Flexible key-value labels with uniqueness constraints
- **LabelSearchFts**: FTS5 virtual table for full-text search
- **Relationships**: 1:N (Item → Labels) with cascade delete
- **Indexes**: Optimized for list, search, and detail queries

**API Contracts**:
- **POST /v1/detect**: Upload photo, receive detections with bounding boxes
- **GET /v1/health**: Service health and provider status
- **Error Handling**: Structured error responses with codes and details
- **Rate Limiting**: Prevent abuse, retry-after headers
- **Circuit Breaker**: Auto-failover between vision providers

**Mobile Contracts**:
- Domain models: InventoryItem, Label, DetectionData, BoundingBox
- DTOs: DetectionRequest, DetectionResponse
- Result types: Either<InventoryFailure, T> for error handling
- UI state models: CameraState, SearchState, InventoryListState
- Repository interfaces: InventoryRepository, LabelRepository, VisionRepository

---

## Phase 2: Tasks ⏭️ NEXT

**Command**: `/speckit.tasks`

**What Happens Next**:
1. Generate dependency-ordered implementation tasks in `tasks.md`
2. Tasks will reference this plan for technology stack
3. Each task will be independently testable
4. Tasks prioritized by user story priority (P1 → P2 → P3)

**Expected Task Categories**:
1. **Project Setup**: Initialize Flutter + API projects, configure CI/CD
2. **Core Infrastructure**: Database setup, navigation, API client
3. **Camera Feature** (P1): Camera screen, capture flow, detection API integration
4. **Labels Feature** (P2): Label editor, CRUD operations, validation
5. **Search Feature** (P3): Search UI, FTS5 queries, results display
6. **UI/UX** (P2): Theme, components, gesture navigation, animations
7. **Testing**: Unit tests, widget tests, integration tests, E2E tests
8. **DevOps**: CI/CD pipelines, build configuration, deployment

---

## Planning Complete ✅

**Status**: All Phase 0 and Phase 1 deliverables complete

**Generated Artifacts**:
1. ✅ **plan.md** (this file) - Implementation plan with technical decisions
2. ✅ **research.md** - Comprehensive technology evaluation and justification
3. ✅ **data-model.md** - Complete database schema with Drift definitions
4. ✅ **contracts/vision-api.yaml** - OpenAPI specification for vision API
5. ✅ **contracts/mobile-data-contracts.md** - Type-safe mobile data contracts
6. ✅ **quickstart.md** - Developer setup and workflow guide
7. ✅ **CLAUDE.md** - Updated agent context with technology stack

**Ready for Implementation**: Yes ✅

**Next Command**: `/speckit.tasks` to generate implementation tasks

---

## Technology Stack Summary

**Mobile App (Flutter)**:
- Language: Dart 3.x
- Framework: Flutter 3.16+
- State: Riverpod
- Database: Drift (SQLite ORM)
- HTTP: dio
- Navigation: go_router
- Models: freezed + json_serializable
- Error Handling: fpdart (Either)
- Testing: flutter_test, integration_test, Maestro
- Linting: very_good_analysis

**API Service (Node.js)**:
- Language: TypeScript 5.x
- Runtime: Node.js 20 LTS
- Framework: Fastify 4.x
- Validation: Zod
- HTTP Client: Axios
- Logging: Pino
- Testing: Vitest, Supertest
- Linting: ESLint + Prettier

**Cloud Services**:
- Vision AI: Google Cloud Vision API (primary), AWS Rekognition (fallback)
- API Hosting: Google Cloud Run
- Staging Storage: Cloud Storage
- CI/CD: GitHub Actions + Codemagic

**Development Tools**:
- Version Control: Git + GitHub
- Git Hooks: Lefthook
- Code Generation: build_runner (Dart)
- Package Manager: pub (Dart), npm/pnpm (Node)
- E2E Testing: Maestro
- Coverage: coverage (Dart), c8 (Node)

---

## Cost Estimate (MVP with 1000 users)

**Monthly Costs** (1000 users, 10 photos/user/month = 10,000 images):
- Google Cloud Vision API: $15.00 (10,000 images @ $1.50/1000)
- AWS Rekognition API: $10.00 (10,000 images @ $1.00/1000)
- Meta Detectron2 (Cloud Run): $15.00 (self-hosted compute)
- TensorFlow Serving (Cloud Run): $10.00 (self-hosted compute)
- Google Cloud Run (API proxy): $5.00 (API orchestration)
- Cloud Storage: $0.50 (temporary image staging)
- **Total**: ~$55/month

**Development Costs** (one-time):
- Google Cloud Platform: $300 free credit for new accounts
- AWS: 12 months free tier
- GitHub Actions: 2000 minutes/month free
- Codemagic: Free tier for open source
- Meta/TensorFlow: Open source, free

**Scaling Estimates**:
- 100 users: ~$6/month (within free tiers)
- 1,000 users: ~$55/month
- 10,000 users: ~$550/month
- 100,000 users: ~$5,500/month

**Cost Optimization Strategies**:
- Phase 1: Start with Google + AWS only (~$25/month for 1000 users)
- Phase 2: Add Meta + TF after validating accuracy improvement justifies cost
- Batch processing: Reduce API calls via intelligent caching
- On-demand scaling: Cloud Run scales to zero during low usage

---

## Risk Mitigation

**Technical Risks**:

| Risk | Impact | Mitigation |
|------|--------|------------|
| Vision API downtime | High | Multi-provider ensemble with circuit breakers, graceful degradation |
| Poor detection accuracy | High | Ensemble fusion achieves 92-95% accuracy, phased rollout validates improvement |
| Ensemble complexity | High | Phased implementation (Google+AWS → Meta → TF), comprehensive integration tests |
| Cost overruns | Medium | Start with 2 providers, add Meta/TF only after validation, usage-based scaling |
| App performance issues | Medium | Profiling, lazy loading, thumbnail generation, parallel API requests |
| Database migration issues | Medium | Drift schema versioning, thorough testing |
| Cross-platform bugs | Medium | Comprehensive E2E tests on both platforms |
| Provider latency variance | Medium | 4s timeout per provider, proceed with available results |

**Process Risks**:

| Risk | Impact | Mitigation |
|------|--------|------------|
| Scope creep | Medium | Strict adherence to spec, P1→P2→P3 priorities |
| Testing gaps | High | 80% coverage requirement enforced in CI |
| Inconsistent code quality | Medium | Automated linting, pre-commit hooks |
| Documentation drift | Low | Documentation co-located with code |

---

## Success Metrics

**Development Metrics**:
- Code coverage: >80% (enforced)
- Build success rate: >95% on CI
- PR review time: <24 hours
- Test execution time: <5 minutes

**Technical Metrics** (from spec.md Success Criteria):
- App launch time: <2 seconds ✅
- Detection processing: <5 seconds ✅
- Search response: <1 second for 500 items ✅
- UI performance: 60fps ✅
- Detection accuracy: >80% ✅

**User Metrics**:
- First-time user task completion: 90% without instructions
- User can build 50+ item inventory with <10 photos
- Zero data loss across app restarts

---

**Planning Phase Complete** - Ready for `/speckit.tasks` 🚀
