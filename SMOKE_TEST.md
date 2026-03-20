# Production Smoke Test Plan

Follow these steps to ensure the production release is functional.

## 1. Backend Verification
- [ ] **Health Check:** `curl https://your-api-domain/v1/health` should return `status: "healthy"` and system stats.
- [ ] **Connectivity:** Ensure the mobile app can reach the API (check logs).

## 2. Vision AI Verification
- [ ] **Gemini Detection:** Capture a photo of a common object (e.g., a chair).
- [ ] **Attribute Extraction:** Verify the AI correctly identifies the label, category, and materials.
- [ ] **Bounding Boxes:** Confirm the object is correctly outlined in the results view.

## 3. App Experience
- [ ] **Icons:** Confirm the app icon appears correctly on the home screen.
- [ ] **Splash:** Confirm the splash screen matches the brand theme.
- [ ] **Legal:** Navigate to Profile -> About -> Privacy Policy. Verify text is readable.
- [ ] **Persistence:** Add an item, close the app, and reopen it. Confirm the item is still there.

## 4. Performance
- [ ] **Latency:** Initial detection feedback should be fast (< 2s).
- [ ] **Smoothness:** Feed scrolling should be fluid.
