# Objective
Automate the testing and deployment of the Flutter iOS app to TestFlight using Fastlane, making it easy to release and run tests natively or in CI/CD pipelines.

# Key Files & Context
- `mobile-app/ios/fastlane/Appfile`: Holds bundle identifier and Apple ID configuration.
- `mobile-app/ios/fastlane/Fastfile`: Defines the automation lanes (test, beta).
- `scripts/release-ios.sh`: A developer utility script for triggering the release process locally.
- `Makefile`: To add `test-ios` and `release-ios` commands.
- `.github/workflows/ios-deploy.yml`: CI/CD workflow to automate deployment to TestFlight on push/tag.

# Implementation Steps

1.  **Initialize Fastlane Configuration**
    - Create `mobile-app/ios/fastlane/Appfile` configuring `com.homeinventory.homeInventory`.
    - Create `mobile-app/ios/fastlane/Fastfile` defining:
        - `lane :test` to run Flutter unit tests and iOS native tests if applicable.
        - `lane :beta` to build the iOS app (`build_app`) and upload it to TestFlight (`upload_to_testflight`).

2.  **Create Automation Scripts**
    - Create `scripts/release-ios.sh` to wrap `cd mobile-app/ios && fastlane beta`.
    - Create `scripts/test-ios.sh` to run tests and run `cd mobile-app/ios && fastlane test`.
    - Make scripts executable.

3.  **Update Makefile**
    - Add `test-ios` and `release-ios` targets pointing to the newly created scripts to provide an easy CLI interface for the user.

4.  **Add CI/CD Workflow**
    - Create `.github/workflows/ios-deploy.yml`.
    - Define a job that triggers on `release` or `workflow_dispatch`.
    - Step 1: Checkout code.
    - Step 2: Setup Ruby and Fastlane.
    - Step 3: Setup Flutter.
    - Step 4: Run Fastlane beta lane (requires user to provide secrets like `APP_STORE_CONNECT_API_KEY` in GitHub later).

# Verification & Testing
- Inspect the generated files to ensure correct paths and bundle identifiers.
- Run `make test-ios` (if configured to run local tests) to ensure the Fastlane lane executes without syntax errors.
- Note: Actual TestFlight upload requires valid Apple Developer credentials, which will be documented for the user to inject via environment variables.