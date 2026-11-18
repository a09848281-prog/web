# Remote Camera v3.7.0 — Stability and Controller UX Specification

**Branch:** `rebuild-v3.7-stability-ui`  
**Upgrade baseline:** `rebuild-v3.6-wide-stable-location`  
**Target device:** Galaxy A22 5G / Android 13  
**Viewer:** iPad Safari / desktop browser  
**Architecture:** Android APK + GitHub Pages + GAS + Google Sheets + WebRTC  
**Scope:** Personal-use reliability update  
**Status:** Source changes committed. Static source consistency checks passed. Gradle CI and device verification are not yet confirmed.

## 1. Root causes addressed

### 1.1 Video stutter after changing quality
Previous behavior changed Camera2 capture size/frame rate immediately through `changeCaptureFormat()` while a live WebRTC sender was active. Reconfiguring the capture pipeline can interrupt frames.

**v3.7 behavior**
- Update sender max bitrate and max frame rate immediately.
- Never call `changeCaptureFormat()` while a peer session is active.
- Apply the selected capture resolution when the next session opens.
- Tell the Android user that resolution changes are deferred until the next connection.

### 1.2 Random reconnect instability
Previous web reconnects stopped the iPad microphone stream and called `getUserMedia()` again for each retry. Mobile Safari may not allow a new permission request to complete without a fresh user gesture.

**v3.7 behavior**
- Preserve the authorized microphone MediaStream during automatic reconnect.
- Stop microphone tracks on explicit manual disconnect.
- Reconnect on WebRTC failed/disconnected/closed states, network restoration, and page visibility restoration.
- Detect three consecutive stats intervals with no decoded video frames and force a bounded reconnect even if the ICE state still says connected.
- Time out unanswered Android offers after 45 seconds.
- Limit reconnect attempts; reset the retry budget only after 30 seconds of stable connection.
- Manual disconnect remains final and blocks both connection-state and frozen-frame recovery timers.
- Block device switching while a session is active.

### 1.3 Stale Android sessions and duplicate offers
GAS may return a repeated offer after a polling request is interrupted before its sequence cursor is persisted.

**v3.7 behavior**
- Ignore duplicate offers that reference an already active session ID.
- Register a replacement PeerConnection before closing old session IDs.
- Dispose stale peer connections without prematurely disposing shared media tracks.

### 1.4 Temporary Android camera preemption
A higher-priority Android camera user (for example, another camera app) can disconnect the current camera session.

**v3.7 behavior**
- Log camera open/error/disconnect/freeze/first-frame/close events.
- After camera error, disconnect or frozen-frame callbacks, try up to five Camera2 reopen attempts.
- Reuse the existing VideoSource and VideoTrack to avoid ICE renegotiation solely for camera recovery.
- If another app continues holding the camera, show a clear status and stop retrying.

### 1.5 Screen-off service scheduling
A foreground service alone does not guarantee that the CPU will remain awake continuously.

**v3.7 behavior**
- Add an opt-in `PARTIAL_WAKE_LOCK` switch named “画面OFF中も通信を維持”.
- Default OFF to avoid unrequested battery drain.
- Release the wake lock when disabled or when the service stops/destroys.
- Explain that this improves polling continuity but increases battery use.

## 2. Web controller UX
- Move Connect and Disconnect next to the live video/map area.
- Group video/communication, location, and audio settings in collapsible sections.
- Keep the viewer as the primary panel on narrow layouts.
- Preserve all existing control element IDs and GAS API contracts.
- Show connection status, bitrate, FPS, RTT and packet loss above the video pane.
- Keep location map follow and coordinate-copy controls available in the map view.

## 3. Network limitations
- STUN servers are configured on both peers.
- TURN is not configured in this branch. STUN improves candidate discovery but does not guarantee connectivity through restrictive NATs, firewalls or carrier networks.
- Same-Wi-Fi testing remains the first validation step.

## 4. Privacy and safety
- Camera and microphone continue to require an explicit Android foreground standby action.
- Standby does not capture media.
- Camera/microphone capture starts only after a paired controller requests a session and the Android-side allow switch is ON.
- Android notification and OS privacy indicators remain visible.
- The wake lock option does not secretly start camera or microphone capture.
- No covert recording, hidden capture, or force-stop bypass is introduced.

## 5. Automated verification gates
The GitHub Actions workflow checks:
- JavaScript syntax and GAS syntax.
- HTML ID uniqueness and references from Web JavaScript.
- Web/Android API action names against GAS dispatch names.
- Manifest network permissions.
- Wide-angle camera selection, 16:9 camera profiles and STUN.
- Optional location and dual-provider location acquisition.
- Live quality deferral, stale-session cleanup and duplicate-offer guard.
- Camera diagnostic/recovery callbacks.
- Optional CPU wake-lock UI/service release path.
- Microphone-preserving automatic reconnect and manual stop behavior.
- Android Gradle debug APK build and final APK permission inspection.
- APK artifact name: `remote-camera-debug-apk-v3.7`.

A source consistency check passing does not establish that Gradle compiled the APK. A successful Gradle build does not establish runtime behavior on the target handset.

## 6. Physical-device acceptance tests
1. Install the v3.7 APK on Galaxy A22 5G / Android 13.
2. Pair from iPad Safari and connect on the same Wi-Fi.
3. Change quality 720p → 360p → 720p during a live session. Confirm no long capture freeze; confirm the new sensor resolution takes effect on the next connection.
4. Temporarily turn Wi-Fi off and on. Confirm the browser reconnects without prompting for microphone permission again.
5. Open and close another camera app while connected. Confirm the Android app reports camera preemption and attempts bounded recovery after the other app releases it.
6. Open the Remote Camera Android activity during a live session. Confirm the foreground standby service and notification remain active.
7. Test screen lock with CPU-wake option OFF and ON, compare connection continuity and battery consumption.
8. Confirm explicit Disconnect stops local microphone tracks and does not reconnect automatically.
9. Check precise location indoors and outdoors after granting location permission; compare accuracy and timestamp.
10. Test a different Wi-Fi/mobile-network pairing path. Record that TURN is not configured and may be required.

## 7. Known limitations / not claimed
- A Camera2 API may expose only a logical rear camera. The app cannot guarantee an ultra-wide optical field of view when the device does not expose a separate wide lens.
- A competing camera app can temporarily own the camera; v3.7 retries after release but cannot capture concurrently.
- STUN is not a TURN relay.
- Mobile Safari may suspend timers and network activity in the background; resume events trigger recovery after returning to the page, but do not guarantee uninterrupted browser execution while fully suspended.
- Device tests and a successful v3.7 APK artifact are not yet verified.
