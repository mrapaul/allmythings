<!--
SYNC IMPACT REPORT - Constitution v1.0.0
===============================================
Version Change: TEMPLATE → v1.0.0 (Initial Ratification)

Modified Principles:
- NEW: Test-First Development (TDD Mandatory)
- NEW: Code Coverage Standards
- NEW: Clean Architecture
- NEW: Technology Excellence
- NEW: CI/CD Pipeline
- NEW: Quality Gates

Added Sections:
- Core Principles (5 principles)
- Development Standards
- Quality Gates
- Governance

Removed Sections:
- All template placeholders removed

Templates Requiring Updates:
✅ plan-template.md - Constitution Check section aligned
✅ spec-template.md - Success criteria aligned with quality standards
✅ tasks-template.md - TDD workflow aligned

Follow-up TODOs:
- None - all placeholders resolved
- Ratification date set to project inception (2025-10-18)

Generated: 2025-10-21
-->

# allmythings Development Constitution

## Core Principles

### I. Test-First Development (TDD Mandatory)

**All production code MUST be developed using Test-Driven Development**:
- Tests are written FIRST, before implementation code
- Tests MUST fail initially (red)
- Implementation makes tests pass (green)
- Code is then refactored for quality (refactor)
- User approval of test specifications required before implementation
- Red-Green-Refactor cycle is NON-NEGOTIABLE

**Rationale**: TDD ensures testable, maintainable code from the start. Writing tests first forces clear requirements thinking and prevents untestable designs. This project has >80% coverage requirement which is only achievable with test-first discipline.

### II. Code Coverage Standards

**Minimum code coverage requirements MUST be enforced**:
- Overall coverage: >80% across all codebases
- Critical paths (authentication, data persistence, API contracts): 100% coverage
- Coverage measured for: line coverage, branch coverage, function coverage
- Coverage gates enforced in CI/CD pipeline (build fails if < 80%)
- Uncovered code MUST have explicit justification (documented in code comments)

**Testing layers required**:
- Unit tests: Individual functions, methods, components
- Integration tests: Service interactions, database operations, API contracts
- End-to-End tests: Complete user journeys, cross-system workflows
- Contract tests: API endpoints, data schemas, external integrations

**Rationale**: High coverage prevents regressions, enables confident refactoring, and ensures quality. Multi-layer testing catches different bug classes (unit = logic, integration = interactions, E2E = real usage).

### III. Clean Architecture

**Codebase MUST follow Clean Architecture principles**:
- Feature-first organization: Code grouped by features, not technical layers
- Separation of concerns: Domain logic independent of frameworks, UI, databases
- Dependency rule: Inner layers (domain) know nothing about outer layers (UI, API, DB)
- Repository pattern for data access: Business logic doesn't directly access databases
- SOLID principles: Single responsibility, open/closed, Liskov substitution, interface segregation, dependency inversion

**Prohibited patterns**:
- God objects: Objects that know too much or do too much
- Anemic domain models: Models with no behavior, only data
- Service layer bypass: UI directly accessing database
- Framework coupling: Business logic dependent on framework specifics

**Rationale**: Clean Architecture enables testability (can mock outer layers), maintainability (changes localized to features), and technology swaps (database/framework changes don't affect domain logic).

### IV. Technology Excellence

**Technology choices MUST be justified and best-of-breed**:
- All frameworks, libraries, and tools MUST be evaluated with documented comparisons
- Selection criteria: Performance, maintainability, ecosystem maturity, security, cost
- Research artifacts MUST be created (research.md) documenting alternatives and rationale
- No "it's what I know" or "it's popular" without quantitative justification
- Version pinning: All dependencies MUST specify exact versions (no floating ranges)
- Security: All dependencies scanned for vulnerabilities, outdated packages flagged

**Technology stack governance**:
- Mobile: Dart 3.x + Flutter 3.16+ (cross-platform, 60fps performance)
- API: TypeScript 5.x + Node.js 20 LTS + Fastify 4.x (type safety, high performance)
- Database: SQLite + Drift ORM (local-first, type-safe, FTS5 search)
- State Management: Riverpod (testability, type-safe, immutable state)
- CI/CD: GitHub Actions (version controlled, integrated, free tier)

**Rationale**: Best-of-breed tools maximize developer productivity, minimize technical debt, and ensure long-term maintainability. Documented decisions enable future team members to understand "why" not just "what".

### V. CI/CD Pipeline

**Continuous Integration and Deployment MUST be fully automated**:
- All tests run on every commit (unit, integration, E2E)
- Static analysis enforced (linting, type checking, security scanning)
- Code coverage validated (>80% threshold)
- Builds created for all platforms (iOS, Android, macOS)
- Artifacts uploaded and versioned
- Deployment automated for approved releases
- Security scanning: Dependency vulnerabilities, secrets detection, license compliance

**Pipeline stages (all must pass)**:
1. Lint & Type Check (fast feedback < 30s)
2. Unit Tests (< 2 min)
3. Integration Tests (< 5 min)
4. Build Verification (API + Mobile)
5. E2E Tests (< 10 min)
6. Security Scanning
7. Artifact Upload (if all pass)

**Rationale**: Automated pipelines prevent "works on my machine" issues, enforce quality standards consistently, and enable rapid iteration with confidence.

## Development Standards

### Code Style & Linting

- **Mobile (Dart/Flutter)**: very_good_analysis rules enforced
- **API (TypeScript)**: ESLint + Prettier enforced
- **Pre-commit hooks**: Lefthook configured to run linting before commit
- **Zero warnings policy**: Warnings treated as errors in CI
- **Auto-formatting**: Code must be formatted before commit (no manual formatting debates)

### Documentation Requirements

- **API Contracts**: OpenAPI 3.x specifications for all endpoints
- **Data Models**: Complete schema documentation in data-model.md
- **User Stories**: Acceptance criteria in Given/When/Then format
- **Architecture Decisions**: Documented in research.md with alternatives considered
- **README files**: Required for each major component (mobile-app, api-service)
- **Code comments**: Required for complex logic, algorithms, or non-obvious decisions

### Version Control & Branching

- **Feature branches**: `###-feature-name` format (e.g., `001-build-a-mobile`)
- **Commit messages**: Conventional Commits format (feat:, fix:, docs:, etc.)
- **Pull requests**: Required for all changes, no direct commits to main
- **Code review**: At least one approval required before merge
- **Squash merging**: Keep history clean, one commit per feature

## Quality Gates

### Pre-Implementation Gates

1. **Specification Complete**: spec.md with user stories, acceptance criteria, requirements
2. **Research Complete**: research.md with technology evaluation and justification
3. **Design Complete**: data-model.md, contracts/, quickstart.md
4. **Tasks Defined**: tasks.md with dependency-ordered, independently testable tasks
5. **Constitution Check**: No principle violations or documented justifications

### Implementation Gates

1. **Tests Written First**: All tests exist and fail before implementation
2. **Tests Pass**: All tests (unit, integration, E2E) passing
3. **Coverage Met**: >80% overall, 100% for critical paths
4. **Linting Clean**: Zero linting errors or warnings
5. **Type Safety**: TypeScript strict mode, Dart sound null safety
6. **Security Scan**: No high/critical vulnerabilities
7. **Performance**: Meets defined success criteria (e.g., <5s detection, 60fps UI)

### Pre-Deployment Gates

1. **All Tests Passing**: Unit, integration, E2E, contract tests
2. **CI Pipeline Green**: All automated checks passing
3. **Code Review Approved**: At least one reviewer approval
4. **Documentation Updated**: README, API docs, user guides current
5. **Security Validated**: Dependency scan clean, no secrets committed
6. **Performance Validated**: Load tests passing, metrics within targets

## Governance

### Constitution Authority

- This constitution SUPERSEDES all other development practices
- Violations require explicit justification documented in plan.md "Complexity Tracking"
- Unjustified violations block implementation
- Constitution amendments require:
  * Documented rationale with examples
  * Impact analysis on existing code
  * Migration plan if breaking changes
  * Team consensus (if multi-person project)

### Compliance Review

- All pull requests MUST verify constitution compliance
- Pre-commit hooks enforce linting, formatting, test requirements
- CI pipeline enforces coverage, security, performance gates
- Architecture reviews validate Clean Architecture adherence
- Quarterly reviews of technology choices and dependency updates

### Amendment Process

- Amendments proposed via documented RFC (Request for Comments)
- Version bump follows semantic versioning:
  * MAJOR: Backward-incompatible principle removals or redefinitions
  * MINOR: New principles added or material guidance expansions
  * PATCH: Clarifications, wording, typos, non-semantic refinements
- Amendments require migration plan for existing code
- Ratified amendments update constitution version and last-amended date

### Principle Enforcement

**Mandatory (MUST)**:
- Test-First Development (I)
- Code Coverage >80% (II)
- Clean Architecture patterns (III)
- CI/CD pipeline enforcement (V)

**Recommended (SHOULD)**:
- Best-of-breed technology selection (IV)
- Feature-first organization (III)
- OpenAPI contract documentation

**Flexible (MAY)**:
- Specific framework choices (within technology excellence criteria)
- Additional testing beyond minimum coverage
- Performance targets beyond baseline requirements

**Version**: 1.0.0 | **Ratified**: 2025-10-18 | **Last Amended**: 2025-10-21
