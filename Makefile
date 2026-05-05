# Project configuration
API_DIR = api-service
MOBILE_DIR = mobile-app
DETECTION_DIR = detection-service

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
	@echo "  make guarantee          - Run E2E guarantee suite"
	@echo "  make test               - Run all tests"
	@echo "  make lint               - Run all linters"
	@echo "  make format             - Format all code"
	@echo "  make generate           - Run Flutter build_runner"
	@echo "  make clean              - Remove all build artifacts"
	@echo ""
	@echo "${GREEN}Service management:${NC}"
	@echo "  make start              - Full stack (obs + Temporal + Ollama + services + warmup)"
	@echo "  make start-deps         - Just obs + Temporal + Ollama (apps left to you)"
	@echo "  make stop               - Stop everything"
	@echo "  make status             - Service status table"
	@echo "  make logs               - Tail combined /tmp/allmythings logs"
	@echo ""
	@echo "${GREEN}Dev (hot reload):${NC}"
	@echo "  make dev-detection      - uvicorn --reload for detection-service on :14001"
	@echo "  make dev-full           - api + detection in parallel (use after start-deps)"
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
	@echo "${GREEN}Installing Flutter dependencies...${NC}"
	@cd $(MOBILE_DIR) && flutter pub get

# Development
dev:
	@echo "${YELLOW}Starting dev services... Use two terminals for better logs.${NC}"
	@$(MAKE) dev-api & $(MAKE) dev-mobile

dev-api:
	@echo "${GREEN}Starting API server...${NC}"
	@cd $(API_DIR) && npm run dev

dev-mobile:
	@echo "${GREEN}Starting Flutter app...${NC}"
	@cd $(MOBILE_DIR) && flutter run

## ── Service Management ────────────────────────────────────────────
start: ## Full stack — observability + Temporal + Ollama + services + warmup
	@./scripts/start-all.sh start

start-deps: ## Just the deps (obs + Temporal + Ollama) — you run api/detection yourself
	@echo "${GREEN}Bringing up observability + Temporal stack...${NC}"
	@docker compose -f observability/docker-compose.lgtm.yml up -d
	@if ! pgrep -x ollama >/dev/null; then \
		mkdir -p /tmp/allmythings && \
		echo "${GREEN}Starting Ollama in background (logs: /tmp/allmythings/ollama.log)...${NC}" && \
		ollama serve >/tmp/allmythings/ollama.log 2>&1 & \
	else \
		echo "${YELLOW}Ollama already running.${NC}"; \
	fi
	@echo "${GREEN}Deps up.${NC} Run 'make dev-full' or 'make dev-detection' to start apps with hot reload."

stop: ## Stop everything
	@./scripts/start-all.sh stop

status: ## Service status table
	@./scripts/start-all.sh status

logs: ## Tail combined /tmp/allmythings logs
	@./scripts/start-all.sh logs

## ── Dev (hot reload) ──────────────────────────────────────────────
dev-detection: ## detection-service with autoreload on :14001 (requires 'make start-deps' first)
	@echo "${GREEN}Starting detection-service (uvicorn --reload) on :14001...${NC}"
	@cd $(DETECTION_DIR) && PYTHONPATH=src ./venv/bin/python -m uvicorn detection_service.main:app --host 0.0.0.0 --port 14001 --reload

dev-full: ## Hot-reload api + detection in parallel (requires 'make start-deps' first)
	@echo "${YELLOW}Dev mode. Run 'make start-deps' first if obs/Temporal/Ollama not up.${NC}"
	@$(MAKE) dev-api & $(MAKE) dev-detection & wait

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

test-ios:
	@echo "${GREEN}Running automated iOS tests...${NC}"
	@./scripts/test-ios.sh

guarantee:
	@echo "${GREEN}Running Quality Guarantee Suite...${NC}"
	@chmod +x scripts/verify-guarantee.sh
	@./scripts/verify-guarantee.sh

test-iphone:
	@echo "${GREEN}Starting automated iPhone deployment...${NC}"
	@./scripts/test-on-iphone.sh

# Release
release-ios:
	@echo "${GREEN}Starting automated iOS release...${NC}"
	@./scripts/release-ios.sh


# Build and Verify
verify: lint test
	@echo "${GREEN}Static verification complete. Running E2E guarantee...${NC}"

build: verify generate
	@echo "${GREEN}Building all components...${NC}"
	@$(MAKE) build-api-raw
	@$(MAKE) build-mobile-raw
	@$(MAKE) guarantee

build-api: verify
	@$(MAKE) build-api-raw
	@$(MAKE) guarantee

build-mobile: verify
	@$(MAKE) build-mobile-raw
	@$(MAKE) guarantee

build-api-raw:
	@echo "${GREEN}Building API service...${NC}"
	@cd $(API_DIR) && npm run build

build-mobile-raw:
	@echo "${GREEN}Building Flutter app...${NC}"
	# Build macOS debug for guarantee tests if on Mac, else APK
	@if [ "$(shell uname)" = "Darwin" ]; then \
		cd $(MOBILE_DIR) && flutter build macos --debug; \
	else \
		cd $(MOBILE_DIR) && flutter build apk --release; \
	fi

# Test
test:
	@echo "${GREEN}Running all tests...${NC}"
	@$(MAKE) test-api
	@$(MAKE) test-mobile
	@$(MAKE) test-detection

test-api:
	@echo "${GREEN}Running API tests...${NC}"
	@cd $(API_DIR) && npm test

test-mobile:
	@echo "${GREEN}Running Flutter tests...${NC}"
	@cd $(MOBILE_DIR) && flutter test

test-detection:
	@echo "${GREEN}Running Detection service tests...${NC}"
	@cd $(DETECTION_DIR) && ./venv/bin/python -m pytest tests/

# Linting
lint: lint-api lint-mobile

lint-api:
	@echo "${GREEN}Linting API code...${NC}"
	@cd $(API_DIR) && npm run lint

lint-mobile:
	@echo "${GREEN}Linting Flutter code...${NC}"
	@cd $(MOBILE_DIR) && flutter analyze --no-fatal-infos

format:
	@echo "${GREEN}Formatting all code...${NC}"
	@$(MAKE) format-api
	@$(MAKE) format-mobile

format-api:
	@cd $(API_DIR) && npm run format

format-mobile:
	@cd $(MOBILE_DIR) && dart format .

# Code Generation
generate:
	@echo "${GREEN}Running code generation...${NC}"
	@cd $(MOBILE_DIR) && flutter pub run build_runner build --delete-conflicting-outputs

# Cleanup
clean: clean-api clean-mobile

clean-api:
	@echo "${GREEN}Cleaning API...${NC}"
	@cd $(API_DIR) && rm -rf dist node_modules

clean-mobile:
	@echo "${GREEN}Cleaning Flutter...${NC}"
	@cd $(MOBILE_DIR) && flutter clean

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

.PHONY: help setup install install-api install-mobile dev dev-api dev-mobile dev-detection dev-full start start-deps stop status logs smoke backup restore install-supervisor uninstall-supervisor build build-api build-mobile test test-api test-mobile test-detection lint lint-api lint-mobile format format-api format-mobile generate clean clean-api clean-mobile build-api-raw build-mobile-raw verify guarantee test-ios release-ios test-iphone db-up db-down db-new

.PHONY: eval eval-ci eval-baseline eval-pipeline

eval: ## Run eval harness on all configured candidate models
	node eval/harness.mjs qwen2.5vl:7b florence:qwen7b hybrid:owlv2-qwen7b

eval-pipeline: ## Run section-09 pipeline eval rig (writes pipeline-service/eval/last-metrics.json)
	cd pipeline-service && uv run python -m pipeline_service.eval.run_eval

eval-ci: ## Run eval gated by eval/baseline.json
	node eval/harness.mjs qwen2.5vl:7b florence:qwen7b hybrid:owlv2-qwen7b --ci

eval-baseline: ## Re-snapshot current results as new baseline (commit after)
	node eval/harness.mjs qwen2.5vl:7b florence:qwen7b hybrid:owlv2-qwen7b
	@latest=$$(ls -t eval/report-*.json | head -1); cp "$$latest" eval/baseline.json; echo "Baseline = $$latest"

.PHONY: test-eval test-eval-smoke

test-eval: ## Run GT-based evaluation harness on LVIS-OV indoor subset
	@cd pipeline-service && uv run python -m pipeline_service.eval.run_eval

test-eval-smoke: ## Faster smoke run, 100 images
	@cd pipeline-service && EVAL_SAMPLE_SIZE=100 uv run python -m pipeline_service.eval.run_eval
