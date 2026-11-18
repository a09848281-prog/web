# Remote Camera v3.8.0 Build Report

- Branch: `rebuild-v3.8-realtime-stability-no-firebase`
- Build commit: `8699a4f1c79a9b87f074e689333d297b7bcdc3d4`
- Android application ID: `jp.a09848281.remotecamera.v38preview`
- Version name: `3.8.0`
- Version code: `308`
- Workflow: [Build Android APK #124](https://github.com/a09848281-prog/web/actions/runs/44303726454)
- Workflow run ID: `44303726454`
- Artifact: `remote-camera-debug-apk-v3.8`
- Artifact ID: `14427925259`
- Artifact status: successful, not expired
- Artifact expiry: 2026-12-18 12:31 UTC
- Artifact ZIP size: `26,085,660` bytes
- APK size: `50,793,425` bytes
- ZIP SHA-256: `97a52b116d5dce750d4b9cc2b7d371cd399895cb78ff51583826270714caee0c`
- APK SHA-256: `73dcbf3c8c89b55f95d9d519c9593a443ae465f58bad986c438598c9220b0e35`
- Preview URL: https://a09848281-prog.github.io/web/preview/
- GitHub Pages deployment: [run 44300276881](https://github.com/a09848281-prog/web/actions/runs/44300276881), successful
- Main branch source/CI validation of the preview-only web assets: [run 44300276804](https://github.com/a09848281-prog/web/actions/runs/44300276804), successful
- The production root URL https://a09848281-prog.github.io/web/ remains unchanged; only the v3.8 preview is at /web/preview/.

## Installation safety

The v3.8 APK uses a separate application ID (`jp.a09848281.remotecamera.v38preview`) and Android label `Remote Camera 3.8 Preview`. This allows it to be installed side-by-side with the v3.7 app because CI-generated debug APKs use different signing certificates. Do not uninstall the v3.7 app; its pairing and settings remain separate. Pair the v3.8 app with its own newly displayed 8-digit code.

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
- The v3.8 branch is separate from `main`. GitHub Pages publishes from `main` only, so the live Pages site is not yet the v3.8 Web UI.
- The v3.8 `gas/Code.gs` source must be pasted into Apps Script and deployed as a new version before using the v3.8 Web UI against it. GitHub commits do not update an existing GAS deployment.
- STUN is configured, but no TURN relay is included. Cross-network connectivity is therefore not guaranteed.
- Android force-stop, reboot, revoked permissions, or manufacturer battery restrictions can prevent background standby from continuing.
- Apps Script's six-minute execution ceiling is not disabled or bypassed. v3.8 reduces repeated active-session GAS calls by moving live controls/media to WebRTC.

