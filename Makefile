# Project configuration
API_DIR = api-service
MOBILE_DIR = mobile-app

# Colors
GREEN = \033[0;32m
NC = \033[0m
YELLOW = \033[1;33m

# Help
help:
	@echo "${GREEN}Available commands:${NC}"
	@echo "  make setup              - Install all dependencies and generate code"
	@echo "  make install            - Install all dependencies"
	@echo "  make dev                - Start API and mobile app in parallel"
	@echo "  make build              - Build both API and mobile app (Verified)"
	@echo "  make verify             - Run lint and unit tests"
	@echo "  make test               - Run all tests"
	@echo "  make lint               - Run all linters"
	@echo "  make format             - Format all code"
	@echo "  make generate           - Regenerate mobile API client from openapi.json"
	@echo "  make clean              - Remove all build artifacts"
	@echo ""
	@echo "${GREEN}Service management:${NC}"
	@echo "  make start              - Full stack (obs + Temporal + Ollama + services + warmup)"
	@echo "  make start-deps         - Just obs + Temporal + Ollama (apps left to you)"
	@echo "  make stop               - Stop everything"
	@echo "  make status             - Service status table"
	@echo "  make logs               - Tail combined /tmp/allmythings logs"
	@echo ""
	@echo "${GREEN}Ops testing & backup:${NC}"
	@echo "  make smoke              - Full smoke test (scripts/smoke.sh)"
	@echo "  make backup             - Tar ~/allmythings-data to ~/allmythings-backups/"
	@echo "  make restore FILE=…     - Restore from backup tarball"
	@echo "  make install-supervisor - Install launchd plists (opt-in auto-restart)"
	@echo "  make uninstall-supervisor - Remove launchd plists"

# Setup
setup: install generate

install: install-api install-mobile

install-api:
	@echo "${GREEN}Installing API dependencies...${NC}"
	@cd $(API_DIR) && npm install

install-mobile:
	@echo "${GREEN}Installing mobile app dependencies...${NC}"
	@cd $(MOBILE_DIR) && pnpm install

# Development
dev:
	@echo "${YELLOW}Starting dev services... Use two terminals for better logs.${NC}"
	@$(MAKE) dev-api & $(MAKE) dev-mobile

dev-api:
	@echo "${GREEN}Starting API server...${NC}"
	@cd $(API_DIR) && npm run dev

dev-mobile:
	@echo "${GREEN}Starting Expo dev server...${NC}"
	@cd $(MOBILE_DIR) && pnpm start

## ── Service Management ────────────────────────────────────────────
start: ## Full stack — observability + Temporal + Ollama + services + warmup
	@./scripts/start-all.sh start

start-deps: ## Just the deps (obs + Temporal + Ollama) — you run the api yourself
	@echo "${GREEN}Bringing up observability + Temporal stack...${NC}"
	@docker compose -f observability/docker-compose.lgtm.yml up -d
	@if ! pgrep -x ollama >/dev/null; then \
		mkdir -p /tmp/allmythings && \
		echo "${GREEN}Starting Ollama in background (logs: /tmp/allmythings/ollama.log)...${NC}" && \
		OLLAMA_HOST=127.0.0.1:11434 ollama serve >/tmp/allmythings/ollama.log 2>&1 & \
	else \
		echo "${YELLOW}Ollama already running.${NC}"; \
	fi
	@echo "${GREEN}Deps up.${NC} Run 'make dev-api' to start the API with hot reload."

stop: ## Stop everything
	@./scripts/start-all.sh stop

status: ## Service status table
	@./scripts/start-all.sh status

logs: ## Tail combined /tmp/allmythings logs
	@./scripts/start-all.sh logs

## ── Smoke & Ops Testing ───────────────────────────────────────────
smoke: ## Full smoke test (happy path, trace, idempotency, degraded, SLO gate)
	@./scripts/smoke.sh

## ── Backup / Restore ──────────────────────────────────────────────
backup: ## Tar ~/allmythings-data to ~/allmythings-backups/YYYY-MM-DD.tar.gz
	@mkdir -p $(HOME)/allmythings-backups
	@tar -czf $(HOME)/allmythings-backups/$(shell date +%Y-%m-%d).tar.gz -C $(HOME) allmythings-data
	@echo "${GREEN}Backup: $(HOME)/allmythings-backups/$(shell date +%Y-%m-%d).tar.gz${NC}"

restore: ## Restore from backup. Usage: make restore FILE=<path-to-tar>
	@test -n "$(FILE)" || (echo "Usage: make restore FILE=path" && exit 1)
	@tar -xzf $(FILE) -C $(HOME)
	@echo "${GREEN}Restored. Run 'make start' to bring up the stack.${NC}"

## ── Optional launchd supervisor (opt-in) ──────────────────────────
install-supervisor: ## Install launchd plists so services auto-restart across reboots
	@./scripts/install-supervisor.sh

uninstall-supervisor: ## Remove launchd plists
	@./scripts/uninstall-supervisor.sh

# Build and Verify
verify: lint test
	@echo "${GREEN}Static verification complete.${NC}"

build: verify
	@echo "${GREEN}Building all components...${NC}"
	@$(MAKE) build-api-raw
	@$(MAKE) build-mobile-raw

build-api: verify
	@$(MAKE) build-api-raw

build-mobile: verify
	@$(MAKE) build-mobile-raw

build-api-raw:
	@echo "${GREEN}Building API service...${NC}"
	@cd $(API_DIR) && npm run build

build-mobile-raw:
	@echo "${GREEN}Type-checking mobile app (native builds via 'pnpm ios' / EAS)...${NC}"
	@cd $(MOBILE_DIR) && pnpm typecheck

# Test
test:
	@echo "${GREEN}Running all tests...${NC}"
	@$(MAKE) test-api
	@$(MAKE) test-mobile

test-api:
	@echo "${GREEN}Running API tests...${NC}"
	@cd $(API_DIR) && npm test

test-mobile:
	@echo "${GREEN}Running mobile app tests...${NC}"
	@cd $(MOBILE_DIR) && pnpm test

# Linting
lint: lint-api lint-mobile

lint-api:
	@echo "${GREEN}Linting API code...${NC}"
	@cd $(API_DIR) && npm run lint

lint-mobile:
	@echo "${GREEN}Linting mobile app code...${NC}"
	@cd $(MOBILE_DIR) && pnpm lint

format:
	@echo "${GREEN}Formatting all code...${NC}"
	@$(MAKE) format-api
	@$(MAKE) format-mobile

format-api:
	@cd $(API_DIR) && npm run format

format-mobile:
	@cd $(MOBILE_DIR) && pnpm format

# Code Generation
generate:
	@echo "${GREEN}Regenerating mobile API client from openapi.json...${NC}"
	@cd $(MOBILE_DIR) && pnpm codegen:api

# Cleanup
clean: clean-api clean-mobile

clean-api:
	@echo "${GREEN}Cleaning API...${NC}"
	@cd $(API_DIR) && rm -rf dist node_modules

clean-mobile:
	@echo "${GREEN}Cleaning mobile app...${NC}"
	@cd $(MOBILE_DIR) && rm -rf node_modules .expo

# Database migrations (dbmate)
DBMATE := docker run --rm --network allmythings-dev_allmythings-dev \
  -v $(PWD)/db:/db -w /db --env-file db/dbmate.env \
  ghcr.io/amacneil/dbmate:2.25

db-up:
	$(DBMATE) up

db-down:
	$(DBMATE) down

db-new:
	$(DBMATE) new $(NAME)

.PHONY: help setup install install-api install-mobile dev dev-api dev-mobile start start-deps stop status logs smoke backup restore install-supervisor uninstall-supervisor build build-api build-mobile test test-api test-mobile lint lint-api lint-mobile format format-api format-mobile generate clean clean-api clean-mobile build-api-raw build-mobile-raw verify db-up db-down db-new

.PHONY: eval eval-ci eval-baseline dataset-export eval-promote

eval: ## Run eval harness on all configured candidate models
	node eval/harness.mjs gemini:gemini-2.5-flash gemma4:31b-cloud

eval-ci: ## Run eval gated by eval/baseline.json
	node eval/harness.mjs gemini:gemini-2.5-flash gemma4:31b-cloud --ci

e2e-mobile: ## Automated on-simulator detection E2E (Maestro) with seeded interior photos
	@command -v maestro >/dev/null || export PATH="$$HOME/.maestro-cli/maestro/bin:$$PATH"; \
	SIM=$$(xcrun simctl list devices booted | grep -oE '[0-9A-F-]{36}' | head -1); \
	test -n "$$SIM" || { echo "Boot a simulator and install the app first (see docs)"; exit 1; }; \
	xcrun simctl addmedia $$SIM eval/fixtures/1776173015803.jpg eval/fixtures/1776176976030.jpg test_images/living_room/living_room_01.jpg test_images/kitchen/kitchen_01.jpg 2>/dev/null; \
	PATH="$$HOME/.maestro-cli/maestro/bin:$$PATH" maestro test mobile-app/.maestro/detection-flow.yaml

e2e-all: ## Full on-simulator Maestro suite: detection first (seeds inventory, clearState), then non-detection flows in order
	@command -v maestro >/dev/null || export PATH="$$HOME/.maestro-cli/maestro/bin:$$PATH"; \
	SIM=$$(xcrun simctl list devices booted | grep -oE '[0-9A-F-]{36}' | head -1); \
	test -n "$$SIM" || { echo "Boot a simulator and install the app first (see docs)"; exit 1; }; \
	xcrun simctl addmedia $$SIM eval/fixtures/1776173015803.jpg eval/fixtures/1776176976030.jpg test_images/living_room/living_room_01.jpg test_images/kitchen/kitchen_01.jpg 2>/dev/null; \
	PATH="$$HOME/.maestro-cli/maestro/bin:$$PATH" maestro test \
		mobile-app/.maestro/detection-flow.yaml \
		mobile-app/.maestro/search-and-edit.yaml \
		mobile-app/.maestro/settings-flow.yaml \
		mobile-app/.maestro/inbox-flow.yaml \
		mobile-app/.maestro/tidy-flow.yaml

dataset-export: ## Export the corrections flywheel as a COCO dataset under datasets/
	cd api-service && npx tsx scripts/dataset-export.ts

eval-promote: ## Promote a corrected photo into the eval oracle: make eval-promote SHA=<sha256>
	cd api-service && npx tsx scripts/promote-fixture.ts $(SHA)

eval-baseline: ## Re-snapshot current results as new baseline (commit after)
	node eval/harness.mjs gemini:gemini-2.5-flash gemma4:31b-cloud
	@latest=$$(ls -t eval/report-*.json | head -1); cp "$$latest" eval/baseline.json; echo "Baseline = $$latest"

## ── Model training (training/) ────────────────────────────────────
# Newest flywheel COCO export produced by `make dataset-export`.
TRAIN_EXPORT = $(shell ls -td datasets/export-* 2>/dev/null | head -1)
# Every downloaded bootstrap set (training/dataset/fetch_bootstrap.py).
TRAIN_BOOTSTRAPS = $(shell ls -d training/data/bootstrap/*/ 2>/dev/null)
TRAIN_FLYWHEEL_FLAG = $(if $(TRAIN_EXPORT),--flywheel $(TRAIN_EXPORT),)
TRAIN_BOOTSTRAP_FLAGS = $(foreach d,$(TRAIN_BOOTSTRAPS),--bootstrap $(d))

train-test: ## Run training pipeline unit tests (pytest + node)
	python3 -m pytest training/tests
	node --test training/tests/*.test.mjs

train-fetch-bootstrap: ## Download CC-BY bootstrap sets (needs ROBOFLOW_API_KEY)
	python3 training/dataset/fetch_bootstrap.py

train-dataset-vlm: ## Build Qwen3-VL LoRA JSONL from flywheel export + bootstrap sets
	@test -n "$(TRAIN_EXPORT)$(TRAIN_BOOTSTRAPS)" || { echo "No datasets/export-* and no bootstrap sets. Run 'make dataset-export' or 'make train-fetch-bootstrap'."; exit 1; }
	python3 training/dataset/build_vlm_dataset.py $(TRAIN_FLYWHEEL_FLAG) $(TRAIN_BOOTSTRAP_FLAGS) --out training/data/vlm

train-taxonomy: ## Derive the detector class list from the data (embeds labels via local Ollama)
	@test -n "$(TRAIN_EXPORT)$(TRAIN_BOOTSTRAPS)" || { echo "No datasets/export-* and no bootstrap sets. Run 'make dataset-export' or 'make train-fetch-bootstrap'."; exit 1; }
	python3 training/dataset/derive_taxonomy.py $(TRAIN_FLYWHEEL_FLAG) $(TRAIN_BOOTSTRAP_FLAGS)

train-dataset-detr: train-taxonomy ## Build merged RF-DETR COCO dataset (derived taxonomy, regenerated first)
	python3 training/dataset/build_detr_dataset.py $(TRAIN_FLYWHEEL_FLAG) $(TRAIN_BOOTSTRAP_FLAGS) --out training/data/detr

train-status: ## Flywheel counts vs retrain threshold (TRAIN_MIN_NEW_IMAGES/TRAIN_GROWTH_PCT)
	-python3 training/dataset/flywheel_status.py

train-continuous: ## Export flywheel, rebuild both datasets, print launch cmd when threshold met
	-$(MAKE) dataset-export
	@$(MAKE) train-dataset-vlm train-dataset-detr
	@python3 training/dataset/flywheel_status.py || echo "Below threshold — nothing to launch (no cloud spend)."

train-benchmark: ## Benchmark every available contender against the home-inventory oracle
	node training/benchmarks/run_benchmark.mjs $(if $(CANDIDATE),--candidate-name $(CANDIDATE),) $(if $(CANDIDATE_URL),--candidate-url $(CANDIDATE_URL),)

train-promote: ## Release gate for a candidate: make train-promote CANDIDATE=<name> [CANDIDATE_URL=…]
	@test -n "$(CANDIDATE)" || { echo "Usage: make train-promote CANDIDATE=<name> [CANDIDATE_URL=http://localhost:8000/v1]"; exit 1; }
	node training/release/promote.mjs --candidate $(CANDIDATE) $(if $(CANDIDATE_URL),--candidate-url $(CANDIDATE_URL),)

train-rollback: ## Revert the model registry to the previously active entry
	node training/release/promote.mjs --rollback

.PHONY: train-test train-fetch-bootstrap train-taxonomy train-dataset-vlm train-dataset-detr train-status train-continuous train-benchmark train-promote train-rollback
