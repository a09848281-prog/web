# Remote Camera v3.7.0 Build Report

- Branch: `rebuild-v3.7-stability-ui`
- Commit: `57352b1af833b3a59b700d52b239df5e855e6548`
- Android application ID: `jp.a09848281.remotecamera`
- Version name: `3.7.0`
- Version code: `307`
- Workflow: [Build Android APK #104](https://github.com/a09848281-prog/web/actions/runs/44270585920)
- Workflow run ID: `44270585920`
- Artifact: `remote-camera-debug-apk-v3.7`
- Artifact ID: `14411898040`
- Artifact status: successful, not expired
- Artifact ZIP size: 26,080,786 bytes
- APK size: 50,793,405 bytes
- ZIP SHA-256: `8de96a6b001ccad7960e917d8b777d53957849f7628d8ef0077f62e2d6da183b`
- APK SHA-256: `33f07b893c32b8284d0c9f1e9cd056f38e86b534c2e7e42e05c4bfacd8f0ff5d`
- Artifact expiry: 2026-12-18 08:52 UTC

## Verified workflow steps

| Check | Result |
|---|---|
| Web JavaScript syntax | PASS |
| GAS JavaScript syntax | PASS |
| HTML IDs / Web API actions / GAS API compatibility | PASS |
| Kotlin Android debug build | PASS |
| APK manifest INTERNET permission | PASS |
| APK manifest ACCESS_NETWORK_STATE permission | PASS |
| APK manifest CAMERA permission | PASS |
| APK manifest RECORD_AUDIO permission | PASS |
| APK artifact upload | PASS
| Android/Web/artifact version alignment | PASS |

## Source issues fixed during this build

1. Added the missing Kotlin `kotlinx.coroutines.delay` import used by bounded camera recovery. Earlier Gradle build logs reported an unresolved reference at `RtcEngine.kt`.
2. Fixed CI assertions that used the wrong quoting and escaping, which had caused false failures even when the implementation was present.
3. Added a guard so a slow initial video frame does not immediately trigger freeze recovery; the watchdog only counts missed decoded frames after at least one frame has arrived.
4. Added an Android/Web/artifact version-alignment check.
5. Limited Pages deployment to `main`. Feature branches are used for validation and are not published to the live Pages environment.

## Important verification boundary

This is a successful Android debug APK build and APK permission-package check. It is not a physical-device test. Galaxy A22 5G / Android 13 and iPad Safari still require hands-on checks for:
- Camera field of view and actual wide-lens selection.
- Long-term connection stability, app resume and camera preemption recovery.
- Quality changes during a live session.
- Screen-off standby with CPU wake option enabled/disabled.
- GPS/network location accuracy and battery use.

The v3.7 branch remains separate from `main`; no merge was performed as part of this validation.
