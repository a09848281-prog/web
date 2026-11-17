# 実装状況 v3.2

## 現行方式
- Web：アカウント登録・ログイン画面を廃止。Androidの期限付き8桁コードによるペアリングを入口に変更。
- Web：ペアリングした端末の controllerToken をブラウザーのローカルストレージに保存し、端末ごとに操作。
- GAS：Users / Sessions を使った認証APIを廃止。Devices内のAndroid秘密情報と controllerToken ハッシュで端末単位に認証。
- GAS：既存シートのデータを消去しないスキーマ更新。接続先Spreadsheet IDをScript Propertiesに保存し、Webアプリ実行時にopenByIdで参照。
- GAS：GET/POSTヘルスチェックでDB準備状態と不足シート・見出しを返す。
- GAS：ペアリングコードは10分有効・一回使用。試行回数制限を追加。
- Android：ペアリングコード再発行ボタン、ペアリング後のコード表示クリア、リモート命令のACK送信を追加。
- Web：ペアリング解除でcontrollerTokenをサーバー側から失効。
- Android：ペアリング解除検出時にRTCを終了し、ペアリング待機へ戻る。
- WebRTC：切断シグナルを追加し、プッシュトゥトーク中は受信音声をミュート。
- Android：画質設定をカメラ解像度・フレームレート・最大ビットレートへ反映。
- Android：カメラ・マイク・位置情報のForeground Service、GASポーリング、WebRTCの構成を維持。

## CIで確認する項目
- Web JavaScript構文検査
- GAS JavaScript構文検査
- HTMLのIDとJavaScript参照整合性
- Android Gradle debug APKビルド
- GitHub Actions artifact生成

## CI・公開確認済み（2026-11-17）
- v3.2.0 Android debug build / source checks：成功
- GitHub Actions：https://github.com/a09848281-prog/web/actions/runs/44091426011
- GitHub Pages deploy：成功
- Deploy run：https://github.com/a09848281-prog/web/actions/runs/44091401728
- APK Artifact：`remote-camera-debug-apk-v3.2`（Artifact ID `14332220491`）
- APK SHA-256：`c45db79ece9a0dc7a725eec5d3461196e27e2c11d51cbb3bf625a97ea65dcd09`

## 実機未検証
- Google Apps Script実デプロイ環境でのWeb iframe応答・DBヘルスチェック
- iPad Safariからのペアリング・WebRTC接続
- Android 13でのForeground Service、カメラ・マイク、位置情報
- 位置情報の蓄積・削除・通信再試行
- STUN/TURNなしでの異なるネットワーク間接続
- 長時間待機・発熱・バッテリー消費

## 制限
STUN/TURNなしでは同じLAN外の接続成功を保証しません。Androidの強制停止、OS再起動、権限取消、メーカー省電力制御で待機が停止・遅延する場合があります。APKはdebug署名であり、正式Release署名ではありません。
