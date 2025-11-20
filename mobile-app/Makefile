.PHONY: help clean deps gen test build run install-deps-macos it-e2e it-e2e-verbose

# Help
help:
	@echo "Available targets:"
	@echo "  make help       - Show this help message"
	@echo "  make clean      - Clean the project"
	@echo "  make deps       - Get dependencies"
	@echo "  make gen        - Generate code"
	@echo "  make test       - Run tests"
	@echo "  make build      - Build the app"
	@echo "  make run        - Run the app"
	@echo "  make all        - Clean, get deps, generate code, and run tests"
	@echo "  make it-e2e     - Run end-to-end detection->save->search test (set AI_TEST_IMAGE to override path)"
	@echo "  make it-e2e-verbose - Same as it-e2e with verbose reporter"

# Clean build artifacts
clean:
	@echo "🚀 Cleaning project..."
	@rm -rf pubspec.lock .dart_tool build
	@flutter clean

# Get dependencies
deps:
	@echo "📦 Getting dependencies..."
	@flutter pub get

# Generate code
gen:
	@echo "🔧 Generating code..."
	@dart format .
	@flutter pub run build_runner build --delete-conflicting-outputs

# Run tests
test:
	@echo "🧪 Running tests..."
	@flutter test

# Build the app
build: deps gen
	@echo "🔨 Building app..."
	@flutter build macos --release

# Run the app
run: deps gen
	@echo "🚀 Running app..."
	@open -a Simulator
	@flutter run -d macos

# End-to-end headless test using a local image
it-e2e: deps gen
	@echo "🧪 Running E2E detect->save->search with image: $${AI_TEST_IMAGE:-$$HOME/Downloads/Images/ai_interior.jpg}"
	AI_TEST_IMAGE=$${AI_TEST_IMAGE:-$$HOME/Downloads/Images/ai_interior.jpg} flutter test test/e2e/auto_detect_save_search_test.dart

it-e2e-verbose: deps gen
	@echo "🧪 Running E2E (verbose) with image: $${AI_TEST_IMAGE:-$$HOME/Downloads/Images/ai_interior.jpg}"
	AI_TEST_IMAGE=$${AI_TEST_IMAGE:-$$HOME/Downloads/Images/ai_interior.jpg} flutter test -r expanded test/e2e/auto_detect_save_search_test.dart

# Install macOS dependencies
install-deps-macos:
	@echo "🛠️  Installing macOS dependencies..."
	@brew update
	@brew install --cask flutter
	@brew install --cask android-studio
	@brew install --cask visual-studio-code
	@brew install --cask android-platform-tools
	@flutter doctor

# Default target - clean, get deps, generate code, and run tests
all: clean deps gen test
