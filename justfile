# Visual Home Inventory Manager - Build System
# Standard lifecycle: clean → compile → test → package → deploy
# Run `just` to execute the default build (compile + test)

set shell := ["bash", "-euo", "pipefail", "-c"]
set dotenv-load

# Configuration
api_dir := "api-service"
mobile_dir := "mobile-app"
api_port := env_var_or_default("API_PORT", "3000")

# ============================================
# DEFAULT: Build with tests (fail-fast)
# ============================================

# Default target - compile and test everything
default: compile test
    @echo ""
    @echo "BUILD SUCCESS"

# ============================================
# LIFECYCLE PHASES (Maven/Gradle style)
# ============================================

# Clean all build artifacts
clean:
    @echo "==> CLEAN"
    rm -rf {{api_dir}}/dist {{api_dir}}/coverage
    cd {{mobile_dir}} && flutter clean 2>/dev/null || true
    @echo "Clean complete"

# Install dependencies (like mvn dependency:resolve)
install:
    @echo "==> INSTALL DEPENDENCIES"
    cd {{api_dir}} && npm ci
    cd {{mobile_dir}} && flutter pub get
    cd {{mobile_dir}}/ios && pod install --repo-update
    @echo "Dependencies installed"

# Compile/build all modules
compile:
    @echo "==> COMPILE"
    cd {{api_dir}} && npm run build
    cd {{mobile_dir}} && dart run build_runner build --delete-conflicting-outputs
    @echo "Compile complete"

# Run all tests (fails fast on first error)
test:
    @echo "==> TEST"
    cd {{api_dir}} && npx vitest run
    cd {{mobile_dir}} && flutter test
    @echo "All tests passed"

# Package for deployment
package:
    @echo "==> PACKAGE"
    cd {{mobile_dir}} && flutter build ios --release --no-codesign
    @echo "Package complete"

# Full lifecycle: clean → install → compile → test → package
package-all: clean install compile test package
    @echo ""
    @echo "FULL BUILD SUCCESS"

# ============================================
# QUICK COMMANDS
# ============================================

# Verify (lint + test) - use before commit
verify: lint test
    @echo ""
    @echo "VERIFY SUCCESS - Ready to commit"

# Full clean rebuild
rebuild: clean install compile test
    @echo ""
    @echo "REBUILD SUCCESS"

# ============================================
# DEVELOPMENT
# ============================================

# Start full dev environment (API + iOS)
dev: _kill
    @echo "==> DEV MODE"
    cd {{api_dir}} && PORT={{api_port}} npx tsx watch src/app.ts &
    @sleep 2
    @open -a Simulator
    @xcrun simctl boot "iPhone 16" 2>/dev/null || true
    @sleep 2
    cd {{mobile_dir}} && flutter run -d "iPhone 16"

# Start API only
api: _kill-api
    @echo "==> API (http://localhost:{{api_port}})"
    cd {{api_dir}} && PORT={{api_port}} npx tsx watch src/app.ts

# Start iOS app only
ios: _kill-flutter
    @echo "==> iOS"
    @open -a Simulator
    @xcrun simctl boot "iPhone 16" 2>/dev/null || true
    @sleep 2
    cd {{mobile_dir}} && flutter run -d "iPhone 16"

# ============================================
# DOCKER / CONTAINERS
# ============================================

# Build Docker image for API
docker-build:
    @echo "==> DOCKER BUILD"
    cd {{api_dir}} && docker build -t allmythings-api:latest .

# Run API in Docker
docker-run: docker-build
    @echo "==> DOCKER RUN"
    docker run -p {{api_port}}:{{api_port}} -e PORT={{api_port}} allmythings-api:latest

# Stop Docker containers
docker-stop:
    @echo "==> DOCKER STOP"
    docker stop $(docker ps -q --filter ancestor=allmythings-api) 2>/dev/null || true

# Docker compose up
up:
    @echo "==> DOCKER COMPOSE UP"
    docker-compose up -d

# Docker compose down
down:
    @echo "==> DOCKER COMPOSE DOWN"
    docker-compose down

# ============================================
# CODE QUALITY
# ============================================

# Lint all code
lint:
    @echo "==> LINT"
    cd {{api_dir}} && npm run lint
    cd {{mobile_dir}} && flutter analyze
    @echo "Lint passed"

# Format all code
format:
    @echo "==> FORMAT"
    cd {{api_dir}} && npm run format
    cd {{mobile_dir}} && dart format .
    @echo "Format complete"

# ============================================
# INDIVIDUAL TEST TARGETS
# ============================================

# API tests only
test-api:
    @echo "==> TEST API"
    cd {{api_dir}} && npx vitest run

# Mobile tests only
test-mobile:
    @echo "==> TEST MOBILE"
    cd {{mobile_dir}} && flutter test

# E2E tests (Maestro)
test-e2e: _boot-sim
    @echo "==> TEST E2E"
    @command -v maestro >/dev/null 2>&1 || { echo "Install Maestro: curl -Ls https://get.maestro.mobile.dev | bash"; exit 1; }
    cd {{mobile_dir}} && maestro test .maestro/

# Tests with coverage
test-coverage:
    @echo "==> TEST WITH COVERAGE"
    cd {{api_dir}} && npx vitest run --coverage
    cd {{mobile_dir}} && flutter test --coverage
    @echo "Coverage reports generated"

# ============================================
# UTILITIES
# ============================================

# Show status
status:
    @echo "==> STATUS"
    @echo "API Port {{api_port}}:"
    @lsof -i:{{api_port}} 2>/dev/null | head -2 || echo "  (free)"
    @echo ""
    @echo "Dependencies:"
    @[ -d "{{api_dir}}/node_modules" ] && echo "  API: OK" || echo "  API: MISSING"
    @[ -f "{{mobile_dir}}/pubspec.lock" ] && echo "  Mobile: OK" || echo "  Mobile: MISSING"

# Check environment
doctor:
    @echo "==> DOCTOR"
    @echo "Node: $(node --version 2>/dev/null || echo 'NOT INSTALLED')"
    @echo "npm: $(npm --version 2>/dev/null || echo 'NOT INSTALLED')"
    @echo "Flutter: $(flutter --version 2>/dev/null | head -1 || echo 'NOT INSTALLED')"
    @echo "Xcode: $(xcodebuild -version 2>/dev/null | head -1 || echo 'NOT INSTALLED')"

# Kill all processes
kill: _kill
    @echo "All processes stopped"

# Setup for first time
setup: install compile
    @echo ""
    @echo "SETUP COMPLETE - Run 'just' to build and test"

# Generate code (Freezed, Drift, Riverpod)
gen:
    @echo "==> GENERATE"
    cd {{mobile_dir}} && dart run build_runner build --delete-conflicting-outputs

# Watch for code generation
gen-watch:
    cd {{mobile_dir}} && dart run build_runner watch --delete-conflicting-outputs

# ============================================
# HELP
# ============================================

# Show help
help:
    @echo ""
    @echo "ALL MY THINGS - Build System"
    @echo "============================"
    @echo ""
    @echo "LIFECYCLE (run in order):"
    @echo "  just clean      # Remove build artifacts"
    @echo "  just install    # Install dependencies"
    @echo "  just compile    # Build all modules"
    @echo "  just test       # Run all tests (fail-fast)"
    @echo "  just package    # Create release builds"
    @echo ""
    @echo "SHORTCUTS:"
    @echo "  just            # compile + test (DEFAULT)"
    @echo "  just verify     # lint + test (before commit)"
    @echo "  just rebuild    # clean + install + compile + test"
    @echo ""
    @echo "DEVELOPMENT:"
    @echo "  just dev        # Start API + iOS (full stack)"
    @echo "  just api        # Start API only"
    @echo "  just ios        # Start iOS only"
    @echo ""
    @echo "DOCKER:"
    @echo "  just docker-build  # Build API container"
    @echo "  just docker-run    # Run API in container"
    @echo "  just up            # docker-compose up"
    @echo "  just down          # docker-compose down"
    @echo ""
    @echo "OTHER:"
    @echo "  just status     # Show build status"
    @echo "  just doctor     # Check environment"
    @echo "  just kill       # Stop all processes"

# ============================================
# INTERNAL HELPERS
# ============================================

_kill: _kill-flutter _kill-api

_kill-flutter:
    @pkill -f "flutter" 2>/dev/null || true
    @pkill -f "dart" 2>/dev/null || true

_kill-api:
    @pkill -f "tsx" 2>/dev/null || true
    @pkill -f "node.*api-service" 2>/dev/null || true
    @lsof -ti:{{api_port}} | xargs kill -9 2>/dev/null || true

_boot-sim:
    @open -a Simulator
    @xcrun simctl boot "iPhone 16" 2>/dev/null || true
    @sleep 2
