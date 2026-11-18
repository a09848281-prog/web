# Remote Camera v4.1.0 Build Report

Build date: 2026-11-18  
Branch: `rebuild-v4.1-complete-stable`  
PR: https://github.com/a09848281-prog/web/pull/6  
Workflow run: https://github.com/a09848281-prog/web/actions/runs/44326219069  
Run number: 158  
Head commit: `a873b632290aab88545cfbb6caa48531841c30a2`

## CI result

**GitHub Actions: success**

All workflow steps completed successfully:
- Web JavaScript syntax check
- GAS JavaScript syntax check
- HTML duplicate/missing ID checks and Web/GAS/Android API action compatibility
- v3.9 inherited camera, fullscreen, flashlight, background standby and WebRTC feature checks
- v4.1 Android microphone mode / PTT safety / meter / mute / speaker volume feature checks
- Android appId, versionCode, versionName, Web config, manifest label and artifact naming checks
- Gradle `:app:assembleDebug`
- APK permission inspection for INTERNET, ACCESS_NETWORK_STATE, CAMERA and RECORD_AUDIO
- GitHub Actions artifact upload

## Version identity

- Android applicationId: `jp.a09848281.remotecamera.v41preview`
- Android versionCode: `410`
- Android versionName: `4.1.0`
- Web appVersion: `4.1.0`
- GAS API version: `4.1.0`
- Artifact: `remote-camera-debug-apk-v4.1`

## APK artifact

- Artifact ID: `14437351711`
- Archive size: `26,095,717` bytes
- Artifact expires: `2026-12-18T14:37:55Z`
- SHA-256 of GitHub artifact ZIP: `0a54920d4df443089839f98c45dea4cf4820c7e60effb1da1aaaba7de7768b50`
- Extracted APK: `remote-camera-v4.1-preview.apk`
- Extracted APK size: `50,809,809` bytes
- SHA-256 of extracted APK: `05e312dc56a2eec92e0295b71f816c7ea8077f0d396ddbeba62d919c7b1ff1ec`

The artifact ZIP passed `unzip -t`; the extracted APK was also checked as a valid ZIP-based Android package. The ZIP SHA-256 matched the digest returned by GitHub Actions.

## Not yet validated on physical devices

This CI report is not a real-device test report. Still required:
- Galaxy A22 5G / Android 13 microphone pickup comparisons for ambient, balanced and voice modes
- PTT and speaker-output-volume checks from iPad Safari
- screen-off Foreground Service reliability and battery/heat observations
- Wi-Fi and mobile-network WebRTC connectivity and long-duration stability

The project currently uses STUN without a TURN relay. Cross-network connectivity is not guaranteed. Android force-stop, reboot-before-service-start, permission revocation and OS background restrictions may prevent remote camera startup.

## Release state

PR #6 is Draft and targets `rebuild-v4.0-ambient-audio-ptt`. It is not merged into v4.0, v3.9 or `main`. GitHub Pages is not yet publishing the v4.1 Web frontend from this feature branch. GAS must be manually redeployed as v4.1.0 using `docs/GAS-REDEPLOY-v4.1.0.md` before matching Web/API use.
