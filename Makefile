# Project configuration
API_DIR = api-service
MOBILE_DIR = mobile-app
PORT = 8000

# Colors
GREEN = \033[0;32m
NC = \033[0m
YELLOW = \033[1;33m

# Help
help:
	@echo "${GREEN}Available commands:${NC}"
	@echo "${YELLOW}Setup:${NC}"
	@echo "  setup           Install all dependencies and set up the project"
	@echo "  install         Install all dependencies"
	@echo "  install-api     Install API dependencies"
	@echo "  install-mobile  Install mobile app dependencies"
	@echo ""
	@echo "${YELLOW}Development:${NC}"
	@echo "  dev             Start API and mobile app in development mode"
	@echo "  dev-api         Start API server"
	@echo "  dev-mobile      Start mobile app"
	@echo ""
	@echo "${YELLOW}Build:${NC}"
	@echo "  build           Build API and mobile app"
	@echo "  build-api       Build API service"
	@echo "  build-mobile    Build mobile app"
	@echo ""
	@echo "${YELLOW}Testing:${NC}"
	@echo "  test                Run all tests"
	@echo "  test-api            Run API tests"
	@echo "  test-mobile         Run mobile app tests"
	@echo "  test-coverage       Run all tests with coverage (80% target)"
	@echo "  test-coverage-api   Run API tests with coverage"
	@echo "  test-coverage-mobile Run mobile tests with coverage"
	@echo ""
	@echo "${YELLOW}Code Quality:${NC}"
	@echo "  lint            Run all linters"
	@echo "  format          Format all code"
	@echo "  clean           Remove build artifacts and dependencies"

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
	@echo "${GREEN}Starting API server on http://localhost:${PORT}${NC}"
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

test-coverage:
	@echo "${GREEN}Running all tests with coverage...${NC}"
	@bash scripts/test-with-coverage.sh

test-coverage-api:
	@echo "${GREEN}Running API tests with coverage...${NC}"
	@cd $(API_DIR) && npm run test:coverage

test-coverage-mobile:
	@echo "${GREEN}Running Flutter tests with coverage...${NC}"
	@cd $(MOBILE_DIR) && flutter test --coverage

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
	@cd $(MOBILE_DIR) && flutter analyze

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
	@echo "${GREEN}Generating code...${NC}"
	@cd $(MOBILE_DIR) && flutter pub run build_runner build --delete-conflicting-outputs

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

.PHONY: help setup install install-api install-mobile dev dev-api dev-mobile build build-api build-mobile test test-api test-mobile test-coverage test-coverage-api test-coverage-mobile lint lint-api lint-mobile format format-api format-mobile generate clean clean-api clean-mobile
