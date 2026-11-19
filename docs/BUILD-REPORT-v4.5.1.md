# Remote Camera v4.5.1 — Build Report

- Branch: `rebuild-v4.5.1-smart-motion-pwa`
- Base commit: `616c3819115883b53b308e588f79c159acb3620d`
- Android applicationId: `jp.a09848281.remotecamera.v451preview`
- versionCode: 451 / versionName: 4.5.1
- Web / GAS API version: 4.5.1
- Artifact: `remote-camera-debug-apk-v4.5.1`

## Changes
- Multiple draggable motion zones (up to 8), sensitivity per zone, local persistence.
- Pixel-difference detection limited to selected regions.
- Moving-person candidate heuristic, zone entry/exit, approximate region count and direction.
- PWA manifest, same-origin shell cache, local notifications while page processing is active.
- White interface; left settings / right screen.
- GAS API version marker updated with existing Sheets schema and actions unchanged.
- Android package identity separated; media and RTC code inherited unchanged.
- No new external AI/API service, Firebase, SDK or package dependency.

## Validation
CI and artifact details will be filled after GitHub Actions completes. CI success does not prove Galaxy A22 5G / Android 13 or iPad Safari real-device behavior.
Background detection is suspended when the PWA is hidden/OS-suspended. Immediate notification during suspension is not supported without a push service.
