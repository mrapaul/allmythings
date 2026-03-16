# iOS Deployment Guide

This guide describes how to build and deploy the Visual Home Inventory Manager to a physical iPhone.

## Prerequisites
- A Mac with the latest version of **Xcode** installed.
- **CocoaPods** installed (`brew install cocoapods`).
- A physical iPhone and a USB cable.
- An Apple ID (a free developer account is sufficient for local testing).

## Deployment Steps

1.  **Prepare the Project:**
    Ensure you have generated the necessary code:
    ```bash
    cd mobile-app
    flutter pub get
    dart run build_runner build --delete-conflicting-outputs
    ```

2.  **Install iOS Dependencies:**
    ```bash
    cd ios
    pod install
    ```

3.  **Open Xcode Workspace:**
    ```bash
    open Runner.xcworkspace
    ```

4.  **Configure Signing:**
    - In the project navigator (left sidebar), select the **Runner** project.
    - Select the **Runner** target in the "Targets" section.
    - Go to the **Signing & Capabilities** tab.
    - Ensure "Automatically manage signing" is checked.
    - Select your **Team** (you may need to add your Apple ID here).
    - Change the **Bundle Identifier** to something unique (e.g., `com.yourname.allmythings`).

5.  **Build and Run:**
    - Connect your iPhone to your Mac.
    - In Xcode's toolbar, select your iPhone as the run destination.
    - Click the **Run** button (Play icon).

6.  **Trust the App (First time only):**
    - On your iPhone, go to **Settings > General > VPN & Device Management**.
    - Under "Developer App", tap your Apple ID.
    - Tap **Trust [Your Apple ID]**.

## Troubleshooting
- If `pod install` fails, try `arch -x86_64 pod install` on M1/M2 Macs.
- Ensure your iPhone is unlocked and you've "Trusted this computer" when connected.
