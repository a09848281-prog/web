# 実装状況 v3.8.0

## v3.8.0 検証・ビルド済み
- 検証ブランチ：`rebuild-v3.8-realtime-stability-no-firebase`
- Android：`jp.a09848281.remotecamera.v38preview` / versionCode 308 / versionName 3.8.0
- Android表示名：Remote Camera 3.8 Preview（v3.7と並行インストール可能）。新規端末名に `(v3.8 Preview)` suffixを付与。
- 最新成功ビルド：GitHub Actions #126 https://github.com/a09848281-prog/web/actions/runs/44305341304
- APK Artifact：`remote-camera-debug-apk-v3.8`（Artifact ID `14425809925`）
- APK SHA-256：`0fb20d5d22189dc41d05cd3acea703a308db77bf5bfb10d8f6a9f49091bd9d4a`
- ZIP SHA-256：`29169a17bec0336b78b91302b7522cc4d538c5b0c7e3a5111c85e081fce4bdf3`
- 自動検査：Web/GAS構文、HTML/API整合性、v3.8機能チェック、Gradle APKビルド、APK権限検査まで成功。
- Firebase：非使用。
- Webプレビュー：https://a09848281-prog.github.io/web/preview/ （Pages deploy run 44300276881 成功）
- 正式版ルートURL `/web/` と既存v3.7 APKは維持。プレビューのみ別パスと別Android applicationIdを使用。
- GAS：`gas/Code.gs` v3.8.0をApps Scriptへ貼り付け、既存Webアプリデプロイを「新バージョン」で更新する必要あり。
- 実機検証：未完了（Galaxy A22 5G / Android 13、iPad Safari）。
- PR #2：Draft・未マージ https://github.com/a09848281-prog/web/pull/2

## v3.8.0の主要改善
- 接続中の操作をWebRTCデータチャネルで直接送信し、操作のGAS依存を低減。
- ICEの一時切断に8秒の復旧猶予を設定し、制御チャネルがOPENの間はAndroidのGASポーリングを停止。
- 映像受信フレームの停止を検出し、映像が未着信／フリーズした際に再接続。
- 音量スライダーをiPad側の受信音量に変更。
- 位置情報のキャッシュ優先・8秒測位上限、GASシート読み取り量削減、応答処理時間の計測を追加。
- GAS一時エラー時のバックオフと安全な読み取り操作の再試行を追加。


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
- GAS/Web：HtmlServiceの入れ子iframeから最上位GitHub Pagesへ応答を返すPOSTブリッジに修正。
- Android：通知欄の「待機を停止」でForeground Service、GASポーリング、位置情報処理、WebRTCを停止。
- Android：GASポーリングでサーバーのペアリング状態を確認し、ローカル端末IDだけで「ペアリング済み」と表示しない。

## CIで確認する項目
- Web JavaScript構文検査
- GAS JavaScript構文検査
- HTMLのIDとJavaScript参照整合性
- Android Gradle debug APKビルド
- GitHub Actions artifact生成

## CI・公開確認済み v3.3.0（2026-11-17）
- Build run：成功（Web/GAS構文、HTML/API整合性、追加チェック、Android Gradle debug APK、Artifact upload）
- Build：https://github.com/a09848281-prog/web/actions/runs/44095787786
- APK Artifact：`remote-camera-debug-apk-v3.3`（Artifact ID `14333203381`）
- GitHub Pages deploy：成功 https://github.com/a09848281-prog/web/actions/runs/44095726255

## 以前のv3.2.0ビルド記録（2026-11-17）
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
