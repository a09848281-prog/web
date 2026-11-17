# Androidアプリ

- Package: jp.a09848281.remotecamera
- Min Android: 8.0 / API 26
- Compile/Target SDK: 35
- Kotlin / Android SDK / WebRTC Android SDK

## ビルド
Android Studioで android/ フォルダを開き、Gradle Sync後に Build APK(s) を実行します。GitHub Actionsは :app:assembleDebug を実行し、成功時にAPKをArtifactとして出力します。

ローカル出力先：app/build/outputs/apk/debug/app-debug.apk

## 初回設定
アプリはGitHub rawから web/config.json を読み込みます。GAS URL変更時のAPK再ビルドは不要です。アプリが画面に表示されている間に権限を許可し、「監視待機を開始」を押します。初回は端末IDと8桁登録コードを生成し、iPadのWeb画面でコードを入力します。

## 制約
- カメラ・マイクを必要とするForeground Serviceは、アプリが表示され権限取得済みの状態で開始する設計です。
- 強制停止・OS再起動・権限取消・メーカー省電力制御後の自動復帰は保証しません。
- STUN/TURNなしのICE設定です。接続可能なネットワークは限定され、任意の異なるネットワーク間接続は保証されません。
- debug APKはテスト用のデバッグ署名です。正式配布にはrelease署名鍵の安全な設定が必要です。
