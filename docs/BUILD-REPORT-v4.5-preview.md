# Remote Camera v4.5 Preview — Build / Validation Report

更新日：2026年11月19日  
Branch：`rebuild-v4.5-motion-zones-white-ui`  
Base：`rebuild-v4.2.2-ultra-stable-controls`  
PR：https://github.com/a09848281-prog/web/pull/11

## Latest source validation

**GitHub Actions: success**

- Push validation: https://github.com/a09848281-prog/web/actions/runs/44519486491
- Pull Request validation: https://github.com/a09848281-prog/web/actions/runs/44519477971
- Source commit: `2c1e096b5014156aaa642f4cb44711c738b7068b`

Passed checks:
1. Web JavaScript syntax
2. Non-AI motion module syntax
3. Motion region pixel-difference unit tests
4. GAS JavaScript syntax
5. HTML duplicate ID / JavaScript DOM reference checks
6. Left control panel / right video layout checks
7. Motion region editor, max 8 zones, notification path and local-only storage checks
8. AI/ML dependency exclusion check
9. Web / GAS / Android version and application ID consistency
10. Android Gradle debug APK build
11. Artifact upload

## Android APK artifact

- Artifact name: `remote-camera-debug-apk-v4.5-preview`
- Artifact ID: `14527121898`
- ZIP size: `26,099,002` bytes
- SHA-256: `b29222da68f53a6fc6b78ff29b10752859a8c2e19ea0222aeb758f4c8d86e531`
- Download page: https://github.com/a09848281-prog/web/actions/runs/44519486491
- Expiration: 2026-12-19 11:58:46 UTC

Download the artifact ZIP from the Actions page, extract it, then install `app-debug.apk`.

Android identity:
- applicationId: `jp.a09848281.remotecamera.v45preview`
- versionCode: `450`
- versionName: `4.5.0`

## GitHub Pages preview

**Deployment: success**

- Deployment workflow: https://github.com/a09848281-prog/web/actions/runs/44519022777
- URL: https://a09848281-prog.github.io/web/v4.5-preview/

The deployment workflow retains the existing root v4.2 site and `/v4.2.2-preview/`, and adds `/v4.5-preview/` alongside them.

## Features added

- Drag on the right-side live video to create up to 8 detection rectangles.
- Enable/disable and remove each rectangle individually.
- Motion is computed locally in the viewer browser by comparing RGB pixel differences only inside the selected areas.
- Per-zone cooldown and sensitivity settings.
- In-page alert, local event history, local snapshot, CSV export and OS notification when supported and permitted.
- Simple white UI, retaining the established left-settings / right-display layout.
- GAS API and Android preview identity aligned to 4.5.0. Existing Sheets schema unchanged.

## GAS deployment status

The GitHub `gas/Code.gs` source is updated to API 4.5.0 and syntax-checked. **Google Apps Script itself has not been deployed from GitHub.** Before use, replace the existing Apps Script `Code.gs` with this branch's source and deploy a new version. See `docs/GAS-REDEPLOY-v4.5.md`.

## Test boundary / limitations

- No physical test has been performed on Galaxy A22 5G / Android 13 or iPad Safari. CI/build success does not guarantee device operation.
- Detection runs in the viewer browser while the video is being received and the page is active/visible. Background suspension may pause detection.
- No AI, machine-learning library, or external image-analysis service is used.
- The v4.5 preview does not include server-side Web Push. System notifications depend on browser/OS support and user permission; notifications are not guaranteed while the Web app is closed or the browser is stopped.
- Lighting changes, shadows, image noise, camera shake and compression artifacts can cause false detections. This is pixel-change detection, not human/object recognition.
- Detection regions and event images remain in the browser's local storage and are not uploaded to GAS/Sheets/Drive.
- Existing v4.2.2 and main branches remain unchanged. PR #11 is Draft and is not merged.
