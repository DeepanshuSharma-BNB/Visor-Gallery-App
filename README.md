# Visor Gallery

A personal photo viewer for Meta Ray-Ban Display glasses. Choose photos on your Android phone, pair with a temporary code shown in the glasses, and browse photos using the Neural Band.

## Live GitHub Pages URLs

- **Glasses:** https://deepanshusharma-bnb.github.io/Visor-Gallery-App/glasses.html
- **Phone:** https://deepanshusharma-bnb.github.io/Visor-Gallery-App/phone.html
- **Home:** https://deepanshusharma-bnb.github.io/Visor-Gallery-App/

## Setup

1. In Meta AI, open Devices → Display glasses settings → App connections → Web apps → Add a web app.
2. Add the **Glasses** URL and name the app **Visor Gallery**.
3. Open the app in your glasses. A temporary 12-character pairing code should appear.
4. On your Android phone, open the **Phone** URL in Chrome.
5. Enter the pairing code and tap **Pair**.
6. Choose photos from your gallery, or press **Try with demo pictures**.
7. Use Neural Band left/right gestures or the on-screen buttons to change photos. Use Play for a slideshow.

Keep the phone controller open. Android can pause background tabs and interrupt transmission.

## Privacy and technical notes

This is an **experimental prototype**, not a fully audited production app.

- Your gallery is not automatically scanned. You explicitly choose images.
- Photos are resized and JPEG-compressed in the phone browser.
- Photo payloads are encrypted using Web Crypto (AES-GCM, key derived from the pairing code).
- Both clients communicate through an **external public EMQX MQTT test broker** over encrypted WebSocket transport.
- The broker can see traffic metadata; it is not an appropriate service for confidential or sensitive photos. Do not use patient data or unpublished research images.
- The photos are not committed to GitHub or intentionally retained on the broker, but neither public-broker reliability nor browser-cache behavior can be guaranteed.
- Device compatibility with the glasses' web browser and firmware has not yet been confirmed through an on-device test.
- JPEG, PNG, WebP and other formats work if your phone browser supports decoding them; HEIC support varies.
- If the pairing code doesn't appear, confirm that the glasses can access the public relay, then reload.
- If the glasses and phone cannot pair, confirm that the 12 characters match and keep both views open.

## Repository files

- `index.html`: app landing page
- `phone.html`, `phone.js`: phone gallery picker and controls
- `glasses.html`, `glasses.js`: glasses viewer and gesture navigation
- `common.js`: encrypted room pairing and MQTT/WebSocket communication
- `styles.css`: layouts for phone and glasses
- `favicon.svg`: Visor icon
- `.github/workflows/pages.yml`: deployment using GitHub Actions

## Enable publishing if necessary

In repository **Settings → Pages**, select **GitHub Actions** as the build and deployment source. Once the workflow succeeds, open the URLs above.

GitHub Pages serves static files only; the public relay is external. For higher privacy and reliability, replace the demonstration MQTT broker with a private authenticated relay.
