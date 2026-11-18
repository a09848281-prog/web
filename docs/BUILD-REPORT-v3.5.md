# v3.5.0 ビルド検証記録

- 検証日：2026-11-18
- Repository：a09848281-prog/web
- Branch：rebuild-v3.5-remote-standby
- Commit：b617f2f3ec54abaee671b748c5bb6e335efd6dfc
- Android applicationId：jp.a09848281.remotecamera
- versionCode：305
- versionName：3.5.0
- Web appVersion：3.5.0

## GitHub Actions

- Run ID：44257611479
- URL：https://github.com/a09848281-prog/web/actions/runs/44257611479
- 結果：success
- Artifact：remote-camera-debug-apk-v3.5
- Artifact ID：14406064692
- ZIP size：26,066,484 bytes
- ZIP SHA-256：7a8c953db44dd7a5f2880c1136e1a71b9eb78ca42382b16f3eb8cf60e6f5bac1
- APK extracted size：50,777,021 bytes
- APK SHA-256：050dc8fb6bf70c236fa280e3d5b03e12f18a77968c056ffaec4ef3cd82a01e52

## CIで成功した検査

1. Web JavaScript構文チェック
2. GAS JavaScript構文チェック
3. HTML ID重複・参照整合性、GAS API action整合性
4. v3.5待機設定・WebRTC権限ガード等のソース検査
5. Android Gradle debug APKビルド
6. 生成APKのManifest権限をaaptで確認（INTERNET / ACCESS_NETWORK_STATE / CAMERA / RECORD_AUDIO）

最初の試行ではMonitorService.ktの `android.util.Log` import漏れでKotlinコンパイルが失敗した。importを追加して再実行し、上記全検査が成功した。

## 実機で未確認の項目

- Galaxy A22 5G / Android 13へインストールした後の起動・ペアリング
- Wi-FiおよびモバイルネットワークでのWebRTC接続
- 画面ロック後の継続動作と長時間待機
- Samsung省電力制御によるサービス停止・遅延
- 省電力/標準/応答優先の各待機間隔の実動作
- Webからのカメラ/マイク起動許可をOFFにした場合の切断・拒否

CI成功はソースの構文・整合性・Android APKのビルドとManifest権限の確認を意味する。Galaxy実機での動作保証ではない。

## セキュリティ・OS制約

- Android画面が表示されている状態で、端末所有者がカメラ/マイク権限を許可し、監視待機を開始する。
- 待機中はカメラ/マイクを開かない。Webから接続要求を受け、端末設定が許可している場合のみメディアを開始する。
- カメラ/マイク使用中はAndroidシステムのプライバシー表示と継続通知を表示する。
- Force Stop、OS再起動直後、権限取消後に遠隔から秘密裏に起動する仕組みは実装しない。
