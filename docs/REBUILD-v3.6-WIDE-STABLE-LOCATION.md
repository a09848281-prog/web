# Remote Camera v3.6.0 — Wide View, Connection Stability and Location Recovery

**Branch:** `rebuild-v3.6-wide-stable-location`  
**Base:** `rebuild-v3.5-remote-standby`  
**Target:** Galaxy A22 5G / Android 13 + iPad Safari  
**Architecture:** Android APK + GitHub Pages + GAS + Sheets + WebRTC  
**Status:** Source changes committed; CI and physical-device verification pending.

## 1. Requested fixes

### Camera field of view
- Inspect Camera2 characteristics for rear-facing camera IDs.
- Prefer the ID with the widest reported horizontal field of view.
- Use 16:9 capture profiles; default 1280×720 at 24 fps.
- Fall back to 960×540, then 640×360 if the camera does not support the preferred mode.
- The app cannot manufacture a wider optical field of view. If the handset exposes only one logical rear camera, the camera view may remain unchanged.

### Video stutter and connection instability
- Configure matching Google STUN servers on Android and the browser.
- Raise ICE gathering wait on the browser from 12 to 20 seconds.
- Display browser receive bitrate, decoded FPS, RTT and packet-loss estimate.
- Add up to five automatic reconnect attempts with increasing delays.
- Keep manual disconnect authoritative: a user-initiated disconnect must not reconnect automatically.
- TURN relay is not configured. STUN improves candidate discovery but cannot guarantee connections through restrictive NATs, firewalls or carrier networks.

### Location acquisition
- Camera and microphone permission are mandatory; location is optional.
- Check GPS and network providers together.
- Prefer the best reported accuracy and unregister the location listener after completion.
- Limit a fresh location attempt to 18 seconds; use a recent cached position only as a fallback.
- Explain the location permission/provider requirements in Android status messages.

## 2. Ten new viewer features

1. Automatic reconnect after interrupted WebRTC sessions (maximum five attempts).
2. Live connection-quality label.
3. Received video bitrate display.
4. Decoded video FPS display.
5. RTT and packet-loss estimate display.
6. Full-screen video view where supported by the browser.
7. Viewer-side digital zoom from 100% to 250%.
8. Video fit toggle: full image / fill the view.
9. Live connection-duration timer.
10. Map follow-latest toggle and one-tap coordinate copy.

The viewer-side zoom is a display crop only. It does not change the phone's optical or sensor zoom. Browser support for full-screen video differs by platform.

## 3. Privacy and safety behavior
- Android must be opened and the user must explicitly start foreground standby.
- Standby does not capture camera or microphone.
- Camera and microphone are used only after a paired controller requests a session while the foreground service is running and the Android-side remote-capture switch is enabled.
- Android's persistent notification and OS privacy indicators remain visible during camera/microphone use.
- No covert capture, hidden recording, or guarantee of starting after force-stop/reboot is introduced.
- Location history is stored only through the existing authenticated device API.

## 4. Verification plan

### Automated checks
- JavaScript syntax check.
- GAS JavaScript syntax check.
- HTML ID uniqueness and JavaScript-to-HTML ID references.
- Browser and Android action names against GAS dispatch actions.
- Android Gradle debug build.
- APK manifest permission verification.
- Static assertions for wide camera selection, 16:9 capture, STUN, optional location, reconnect and viewer controls.

### Physical-device checks still required
1. Install the v3.6 APK on Galaxy A22 5G / Android 13.
2. Check whether Camera2 exposes a distinct wide-angle rear camera ID.
3. Compare the field of view with the stock camera app at its default 1× setting.
4. Test 720p, 480p and 360p on Wi-Fi and mobile data.
5. Confirm reconnect after temporarily disabling and restoring Wi-Fi.
6. Test location in open sky and indoors with both precise and approximate permission.
7. Test screen lock while the foreground standby notification remains active.
8. Confirm explicit manual disconnect does not reconnect.

A successful CI build verifies source integration and APK packaging only. It does not establish that a particular device exposes its ultra-wide lens or that a mobile network can establish a WebRTC route.
