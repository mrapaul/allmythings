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
	@echo "${YELLOW}Setup:${NC}"
	@echo "  setup           Install all dependencies and generate code"
	@echo "  install         Install all dependencies"
	@echo "  install-api     Install API dependencies"
	@echo "  install-mobile  Install mobile app dependencies"
	@echo ""
	@echo "${YELLOW}Development:${NC}"
	@echo "  dev             Start API and mobile app in parallel"
	@echo "  dev-api         Start API server"
	@echo "  dev-mobile      Start Flutter app"
	@echo ""
	@echo "${YELLOW}Build:${NC}"
	@echo "  build           Build API and mobile app"
	@echo "  build-api       Build API service"
	@echo "  build-mobile    Build mobile app"
	@echo ""
	@echo "${YELLOW}Testing & Quality:${NC}"
	@echo "  test            Run all tests (API + Mobile)"
	@echo "  test-api        Run API unit tests"
	@echo "  test-mobile     Run Flutter unit tests"
	@echo "  lint            Run all linters"
	@echo "  lint-api        Run ESLint on API code"
	@echo "  lint-mobile     Run Flutter analyzer"
	@echo "  format          Format all code"
	@echo "  format-api      Format API with Prettier"
	@echo "  format-mobile   Format Flutter with dart format"
	@echo "  generate        Run Flutter build_runner for code generation"
	@echo ""
	@echo "${YELLOW}Cleanup:${NC}"
	@echo "  clean           Remove all build artifacts and dependencies"
	@echo "  clean-api       Clean API (removes dist/, node_modules/)"
	@echo "  clean-mobile    Clean Flutter app (flutter clean)"

# Setup
setup: install generate

install:
	@echo "${GREEN}Installing all dependencies...${NC}"
	@$(MAKE) install-api
	@$(MAKE) install-mobile

install-api:
	@echo "${GREEN}Installing API dependencies...${NC}"
	@cd $(API_DIR) && npm install

install-mobile:
	@echo "${GREEN}Installing Flutter dependencies...${NC}"
	@cd $(MOBILE_DIR) && flutter pub get

# Development
dev:
	@echo "${GREEN}Starting development environment...${NC}"
	@$(MAKE) -j 2 dev-api dev-mobile

dev-api:
	@echo "${GREEN}Starting API server...${NC}"
	@cd $(API_DIR) && npm run dev

dev-mobile:
	@echo "${GREEN}Starting Flutter app...${NC}"
	@cd $(MOBILE_DIR) && flutter run

# Build
build:
	@echo "${GREEN}Building all components...${NC}"
	@$(MAKE) build-api
	@$(MAKE) build-mobile

build-api:
	@echo "${GREEN}Building API service...${NC}"
	@cd $(API_DIR) && npm run build

build-mobile:
	@echo "${GREEN}Building Flutter app...${NC}"
	@cd $(MOBILE_DIR) && flutter build apk --release

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

# Code Quality
lint:
	@echo "${GREEN}Running all linters...${NC}"
	@$(MAKE) lint-api
	@$(MAKE) lint-mobile

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
	@echo "${GREEN}Formatting API code...${NC}"
	@cd $(API_DIR) && npm run format

format-mobile:
	@echo "${GREEN}Formatting Flutter code...${NC}"
	@cd $(MOBILE_DIR) && dart format .

# Code Generation
generate:
	@echo "${GREEN}Generating Flutter code...${NC}"
	@cd $(MOBILE_DIR) && dart run build_runner build --delete-conflicting-outputs

# Clean
clean:
	@echo "${GREEN}Cleaning up...${NC}"
	@$(MAKE) clean-api
	@$(MAKE) clean-mobile

clean-api:
	@echo "${GREEN}Cleaning API...${NC}"
	@cd $(API_DIR) && rm -rf node_modules dist

clean-mobile:
	@echo "${GREEN}Cleaning Flutter app...${NC}"
	@cd $(MOBILE_DIR) && flutter clean

.PHONY: help setup install install-api install-mobile dev dev-api dev-mobile build build-api build-mobile test test-api test-mobile lint lint-api lint-mobile format format-api format-mobile generate clean clean-api clean-mobile
