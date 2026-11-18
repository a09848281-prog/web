# Remote Camera v3.8.0 Build Report

- Branch: `rebuild-v3.8-realtime-stability-no-firebase`
- Build commit: `a19623fd8558182c6701d6e51dad1662ff549127`
- Android application ID: `jp.a09848281.remotecamera.v38preview`
- Version name: `3.8.0`
- Version code: `308`
- Workflow: [Build Android APK #126](https://github.com/a09848281-prog/web/actions/runs/44305341304)
- Workflow run ID: `44305341304`
- Artifact: `remote-camera-debug-apk-v3.8`
- Artifact ID: `14425809925`
- Artifact status: successful, not expired
- Artifact expiry: 2026-12-18 12:36 UTC
- Artifact ZIP size: `26,086,081` bytes
- APK size: `50,809,809` bytes
- ZIP SHA-256: `29169a17bec0336b78b91302b7522cc4d538c5b0c7e3a5111c85e081fce4bdf3`
- APK SHA-256: `0fb20d5d22189dc41d05cd3acea703a308db77bf5bfb10d8f6a9f49091bd9d4a`
- Preview URL: https://a09848281-prog.github.io/web/preview/
- GitHub Pages deployment: [run 44300276881](https://github.com/a09848281-prog/web/actions/runs/44300276881), successful
- Main branch source/CI validation of the preview-only web assets: [run 44300276804](https://github.com/a09848281-prog/web/actions/runs/44300276804), successful
- The production root URL https://a09848281-prog.github.io/web/ remains unchanged; only the v3.8 preview is at /web/preview/.

## Installation safety

The v3.8 APK uses a separate application ID (`jp.a09848281.remotecamera.v38preview`) and Android label `Remote Camera 3.8 Preview`. New devices are registered with the `(v3.8 Preview)` suffix so they are easy to distinguish in the Web paired-device list. This allows it to be installed side-by-side with the v3.7 app because CI-generated debug APKs use different signing certificates. Do not uninstall the v3.7 app; its pairing and settings remain separate. Pair the v3.8 app with its own newly displayed 8-digit code.

## Automated verification

| Check | Result |
|---|---|
| Web JavaScript syntax | PASS |
| GAS JavaScript syntax | PASS |
| HTML IDs / Web API actions / GAS API compatibility | PASS |
| v3.8 WebRTC data-channel / video watchdog / local audio gain checks | PASS |
| v3.8 Android transport / retry / location checks | PASS |
| GAS tail-read / timing / cache checks | PASS |
| Firebase dependency prohibition check | PASS |
| Android / Web / Artifact version alignment | PASS |
| Android Gradle debug APK build | PASS |
| APK manifest INTERNET permission | PASS |
| APK manifest ACCESS_NETWORK_STATE permission | PASS |
| APK manifest CAMERA permission | PASS |
| APK manifest RECORD_AUDIO permission | PASS |
| v3.8 Preview launcher and paired-device label check | PASS |
| Artifact upload | PASS |
| ZIP integrity test and SHA-256 comparison | PASS |
| GAS/Web API version mismatch guard | PASS |

## v3.8 changes

1. Added a peer-to-peer WebRTC data channel for camera selection, quality, location settings and disconnect controls.
2. Pause Android GAS polling while ICE is connected and the control data channel is open. If the channel closes or the peer becomes disconnected, GAS polling resumes as a fallback.
3. Added an 8-second grace period for temporary ICE DISCONNECTED states and stale-peer cleanup.
4. Added a Web video-frame watchdog. It retries if the initial frame does not arrive within 15 seconds or if received frames stop for 8 seconds.
5. Changed the Web slider to control iPad-side received audio using Web Audio GainNode, rather than changing Android call volume.
6. Apply quality/location settings directly over the peer channel first; persist to GAS asynchronously and serialize consecutive sheet writes.
7. Prefer a cached Android location no older than 60 seconds; otherwise attempt GPS and network provider together, with an 8-second acquisition timeout.
8. Added bounded retry/backoff for safe Android GAS reads and a 2–15 second poll backoff after transient failures.
9. Optimized GAS command/signal reads to recent rows, throttled last-seen sheet writes to once per minute, and added server execution timing/API version to responses.
10. Android wait modes are now 30-second / 6-second / 2-second intervals.
11. Web startup now compares the configured Web app version with the GAS API version and gives a specific redeployment warning before pairing if they differ. Firebase remains unused.

## Deployment and test boundaries

- This is a successful debug APK build and automated source/manifest test. It is not a physical-device test.
- Galaxy A22 5G / Android 13 and iPad Safari testing is still required for sustained streaming, audio gain, camera switching, location accuracy, app resume, screen-off standby, and recovery after network interruption.
- The v3.8 application source remains on its separate validation branch. The v3.8 Web UI preview is deployed at `/web/preview/`; the production root `/web/` remains unchanged.
- The v3.8 `gas/Code.gs` source must be pasted into Apps Script and deployed as a new version before using the v3.8 Web UI against it. GitHub commits do not update an existing GAS deployment.
- STUN is configured, but no TURN relay is included. Cross-network connectivity is therefore not guaranteed.
- Android force-stop, reboot, revoked permissions, or manufacturer battery restrictions can prevent background standby from continuing.
- Apps Script's six-minute execution ceiling is not disabled or bypassed. v3.8 reduces repeated active-session GAS calls by moving live controls/media to WebRTC.

