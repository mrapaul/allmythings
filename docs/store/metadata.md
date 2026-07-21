# Store Metadata — Home Inventory

Everything up to the Submit button. Actual submission requires your Apple Developer / Google Play accounts.

## App identity

| Field | Value |
|---|---|
| Name | Home Inventory |
| Subtitle (iOS, 30 chars) | Photograph. Detect. Catalog. |
| Bundle ID / Package | com.codesparktech.homeinventory |
| Version | 1.0.0 (build 1) |
| Category | Productivity (secondary: Lifestyle) |
| Price | Free |

## Description (draft)

Point your camera at a shelf, a drawer, or a whole room — Home Inventory finds every object in the photo and turns it into a searchable inventory. Review the AI's findings with bounding boxes drawn on your photo, reject bad shots, fix labels with a tap, and teach it missed items by drawing a box with one gesture. Every correction makes future detections better.

- Detects furniture, decor, plants, electronics, textiles, kitchenware, and more
- Streams results live as each item is found
- Accept, reject, rename, or add items before anything is saved
- Multiple homes, categories, tags, and full-text search
- Your photos and inventory stay on your device and your own server

## Keywords (iOS, 100 chars)

`home inventory,catalog,belongings,insurance,declutter,ai,camera,objects,moving,organize`

## Privacy answers

- Data collected: none sent to third parties. Photos go only to the user's own self-hosted server (URL configurable in Settings).
- Camera: required, to photograph rooms/shelves. Photos: optional picker.
- No tracking, no ads, no accounts.

## Screenshot checklist

1. Camera capture of a living-room shelf
2. Detection screen mid-stream (boxes appearing over the photo)
3. Review screen with accept/reject and draw-to-teach gesture
4. Inventory grid with search
5. Settings with multiple homes

## Pre-submit steps (your accounts required)

1. `cd mobile-app && eas init` — links the project, replaces `PROJECT_ID_PLACEHOLDER` in `app.json` updates URL.
2. `eas build --profile production --platform ios` (and `--platform android`).
3. `eas submit --platform ios` / Play Console upload.
4. Server reachability for a store build: run the API on your Mac/home server and set the app's Settings → Server URL to your Tailscale hostname (free personal plan) so the phone reaches it from anywhere.
