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
	@echo "  make setup           - Install all dependencies and generate code"
	@echo "  make install         - Install all dependencies"
	@echo "  make dev             - Start API and mobile app in parallel"
	@echo "  make build           - Build both API and mobile app (Verified)"
	@echo "  make verify          - Run lint and unit tests"
	@echo "  make guarantee       - Run E2E guarantee suite"
	@echo "  make test            - Run all tests"
	@echo "  make lint            - Run all linters"
	@echo "  make format          - Format all code"
	@echo "  make generate        - Run Flutter build_runner"
	@echo "  make clean           - Remove all build artifacts"

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

test-api:
	@echo "${GREEN}Running API tests...${NC}"
	@cd $(API_DIR) && npm test

test-mobile:
	@echo "${GREEN}Running Flutter tests...${NC}"
	@cd $(MOBILE_DIR) && flutter test

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

.PHONY: help setup install install-api install-mobile dev dev-api dev-mobile build build-api build-mobile test test-api test-mobile lint lint-api lint-mobile format format-api format-mobile generate clean clean-api clean-mobile build-api-raw build-mobile-raw verify guarantee test-ios release-ios test-iphone
