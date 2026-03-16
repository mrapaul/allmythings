# Implementation Plan

## 1. Issues Identified
1. **Mobile App:** Hardcodes `http://localhost:14000` which fails on Android emulator and physical devices.
2. **API Service:** The `dev` script uses `tsx` without loading the `.env` file, meaning the API keys are null.
3. **Detection Service:** The `transformers` module is missing in the Python virtual environment, breaking Grounding DINO.

## 2. Proposed Fixes
1. Change the mobile app API URL config to support environment variables or automatically detect `10.0.2.2` for Android.
2. Update `api-service/package.json` to load the environment variables (`--env-file=.env`).
3. Reinstall dependencies in the `detection-service` virtual environment (`pip install -r requirements.txt`).

## 3. Step-by-Step Verification Plan
1. Fix the configuration issues as outlined above.
2. Ensure Python virtual environment dependencies are correctly installed.
3. Start the `detection-service` and `api-service` with correct environment variable loading.
4. Launch the Android/iOS emulator or connect a physical device.
5. Build and run the Flutter mobile app with the dynamically injected or correct base URL.
6. Trigger an image detection from the mobile app and verify the output matches expected results.