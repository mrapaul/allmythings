# 🚀 Launch the Visual Home Inventory App

## Step-by-Step Instructions

### Step 1: Open Your Terminal
Open a new terminal window (the API is already running in the background).

### Step 2: Navigate to the Mobile App Directory
```bash
cd /Users/mrarindampaul/Develop/allmythings/mobile-app
```

### Step 3: Install Flutter Dependencies
```bash
flutter pub get
```

This will download all required Flutter packages.

### Step 4: Generate Code
```bash
dart run build_runner build --delete-conflicting-outputs
```

This generates:
- Database code (Drift ORM)
- Model code (Freezed)
- JSON serialization

**Expected output**: You'll see "Succeeded after..." message.

### Step 5: Check Available Devices
```bash
flutter devices
```

This will show all available simulators/emulators/physical devices.

**Example output**:
```
iPhone 15 Pro (mobile) • 12345678-1234-1234-1234-123456789012 • ios • iOS 17.0
Chrome (web)           • chrome                               • web-javascript • Google Chrome
```

### Step 6: Launch the App

**For iOS Simulator**:
```bash
flutter run
```
(Will automatically pick the first iOS device)

**Or specify a device**:
```bash
flutter run -d "iPhone 15 Pro"
```

**For Android**:
```bash
flutter run -d android
```

### Step 7: Test the App

Once launched:
1. ✅ See home screen with "Start Capturing" button
2. ✅ Tap button
3. ✅ Grant camera permission
4. ✅ Point at an object and tap capture button
5. ✅ View detection results!

---

## 🎬 Alternative: Use the Automated Script

If you prefer, run the automated script which will do steps 3-6 for you:

```bash
cd /Users/mrarindampaul/Develop/allmythings/mobile-app
./start-app.sh
```

---

## ❓ Troubleshooting

### "flutter: command not found"

You need to install Flutter first:

1. **Download Flutter**:
   - Visit: https://docs.flutter.dev/get-started/install/macos
   - Or use Homebrew: `brew install flutter`

2. **Add to PATH** (if installed but not in PATH):
   ```bash
   export PATH="$PATH:$HOME/flutter/bin"
   # Or add to ~/.zshrc or ~/.bash_profile
   ```

3. **Verify**:
   ```bash
   flutter doctor
   ```

### "No devices available"

**For iOS**:
```bash
# Open Xcode
open -a Simulator

# Or from command line
xcrun simctl list devices
```

**For Android**:
```bash
# Open Android Studio
# Go to: Tools → Device Manager → Create Device
```

### Build errors

```bash
flutter clean
flutter pub get
dart run build_runner build --delete-conflicting-outputs
```

---

## ✅ What Happens When App Launches

1. **Splash/Home Screen** appears with app logo and "Start Capturing" button
2. **Tap button** → navigates to camera screen
3. **Camera preview** shows live camera feed
4. **Capture button** (white circle at bottom)
5. **Loading** → sends photo to API at http://localhost:3000
6. **Results screen** shows:
   - Detected objects
   - Confidence scores
   - Ensemble metrics
   - Auto-saved to local database

---

## 🔗 API Status

The API service is **already running** at:
- **URL**: http://localhost:9100
- **Port**: 9100 (configured above 9000 for multi-app development)
- **Health**: `curl http://localhost:9100/v1/health`

**You don't need to start the API** - it's running in the background on port 9100.

---

## 📱 Expected First Launch

The very first time you launch:
1. Flutter will build the app (~1-2 minutes)
2. App installs on simulator/device
3. App launches and shows home screen

Subsequent launches are much faster (hot reload).

---

## 🎯 Summary: Copy-Paste Commands

```bash
# Navigate to app directory
cd /Users/mrarindampaul/Develop/allmythings/mobile-app

# Install dependencies
flutter pub get

# Generate code
dart run build_runner build --delete-conflicting-outputs

# Launch app
flutter run
```

That's it! 🚀
