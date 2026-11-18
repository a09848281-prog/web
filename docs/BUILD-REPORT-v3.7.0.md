# Remote Camera v3.7.0 Build Report

- Branch: `rebuild-v3.7-stability-ui`
- Commit: `59342d7fc1170041a8edcdf415ae0581285f7744`
- Android application ID: `jp.a09848281.remotecamera`
- Version name: `3.7.0`
- Version code: `307`
- Workflow: [Build Android APK #101](https://github.com/a09848281-prog/web/actions/runs/44269891208)
- Workflow run ID: `44269891208`
- Artifact: `remote-camera-debug-apk-v3.7`
- Artifact ID: `14411334293`
- Artifact status: successful, not expired
- Artifact ZIP size: 26,080,787 bytes
- APK size: 50,793,405 bytes
- ZIP SHA-256: `bf11f3148866ce24e6ad4897e988e0c635230b79aa4afa17b246212dede800bf`
- APK SHA-256: `f00737871d6196a834a50d08a98c8afc96f3bc79449493aac2c55bc10d71d009`
- Artifact expiry: 2026-12-18 08:47 UTC

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
| APK artifact upload | PASS |

## Source issues fixed during this build

1. Added the missing Kotlin `kotlinx.coroutines.delay` import used by bounded camera recovery. Earlier Gradle build logs reported an unresolved reference at `RtcEngine.kt`.
2. Fixed a CI assertion that searched for single-quoted JavaScript text while the implementation correctly used double quotes.
3. Limited Pages deployment to `main`. Feature branches are used for validation and are not published to the live Pages environment.

## Important verification boundary

This is a successful Android debug APK build and APK permission-package check. It is not a physical-device test. Galaxy A22 5G / Android 13 and iPad Safari still require hands-on checks for:
- Camera field of view and actual wide-lens selection.
- Long-term connection stability, app resume and camera preemption recovery.
- Quality changes during a live session.
- Screen-off standby with CPU wake option enabled/disabled.
- GPS/network location accuracy and battery use.

The v3.7 branch remains separate from `main`; no merge was performed as part of this validation.
