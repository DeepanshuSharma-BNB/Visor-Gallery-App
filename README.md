# Visor Gallery · photo-only edition

A distraction-free photo viewer for **Meta Ray-Ban Display** glasses. Pictures are selected from an Android phone or a computer; the glasses show the image full screen with no persistent menus or buttons.

## Links

- **Glasses:** https://deepanshusharma-bnb.github.io/Visor-Gallery-App/glasses.html
- **Phone or computer:** https://deepanshusharma-bnb.github.io/Visor-Gallery-App/phone.html
- **Homepage:** https://deepanshusharma-bnb.github.io/Visor-Gallery-App/

## How to use

1. Add the glasses link in Meta AI under **Devices → Display Glasses settings → App connections → Web apps**, or launch the existing Visor Gallery app.
2. Close and reopen the glasses app after a version upgrade. It generates a new 12-character pairing code.
3. Open the controller in Chrome on phone or computer, enter the code, and select pictures.
4. The picture fills the available display without buttons or navigation bars.

### Neural Band gestures

Meta's official Web Apps toolkit describes two input streams:

- **Directional D-pad swipes**, exposed to Web Apps as browser arrow keys.
- **Index pinch-and-move**, available as Pointer Events when `body { touch-action: none; }` is present in the initial stylesheet.

In this app, the planned mappings are:

| Input | Action |
|---|---|
| Left / right swipe | Previous / next photo |
| Up / down swipe | Zoom in / out |
| Pinch and move vertically | Continuous zoom (1×–5×) |
| Pinch and move horizontally at 1× | Change photo |
| Pinch and move horizontally while zoomed | Pan across the enlarged photo |
| Discrete pinch (Enter) | Toggle 1× / 2× zoom |

**Wrist twisting/rotation** is not separately exposed as a supported Web Apps input in the referenced documentation. The continuous supported stream is pinch-and-move, not a wrist rotation angle. Exact feel still requires testing on the real Neural Band; keyboard arrow keys simulate D-pad swipes on desktop.

### Privacy and transfer

- Choose photos explicitly using the browser's file picker. The app has no automatic access to your whole gallery.
- **No original-photo size cap such as 25 MB:** the phone locally downscales and recompresses a photo to a bounded JPEG for responsive transfer. The full original file is not transmitted. Up to 80 images can be chosen at once, subject to device memory.
- Canvas output strips original image EXIF metadata such as GPS coordinates.
- **WebRTC DTLS** direct data channel is preferred for encrypted photo transfer when the device and network support it.
- AES-256-GCM-encrypted MQTT is used for pairing/signaling and as a photo transfer **fallback** when WebRTC does not connect. This is **not** a private relay.
- The current public broker is `wss://broker.emqx.io:8084/mqtt`, and WebRTC peer discovery uses a public STUN server. Metadata including IP addresses, timing, and message sizes can be observed by those services.
- Pairing codes are temporary, and sessions expire after 30 minutes. Close both pages when finished.
- Uploaded images are not stored in this GitHub repository. Browser memory and caches, network intermediaries, and public infrastructure are not independently audited.
- **Avoid confidential images, identification documents, patient data, or sensitive photographs.** A private authenticated signaling service would be required for a stronger privacy deployment.

### No video

The video picker, video WebRTC transfer path, YouTube, X/Twitter, Vimeo, and general video-link embed features have all been removed. This edition deliberately focuses on photos and gestures.

### Reference

Gesture implementation is based on Meta's official toolkit:

- https://github.com/facebook/meta-wearables-webapp
- https://github.com/facebook/meta-wearables-webapp/blob/main/plugins/meta-wearables-webapp/skills/ai-glasses-webapp-device/SKILL.md
- https://github.com/facebook/meta-wearables-webapp/blob/main/plugins/meta-wearables-webapp-game/docs/drag-channel.md

### Verification

Source checked for JavaScript syntax, matching DOM element IDs, and absence of video features. Prior image transfer was physically confirmed before this release; redesigned pinch-and-move zoom is **not yet verified on the user's glasses**. Reopen both views after deploying because the protocol or cached resources may change.
