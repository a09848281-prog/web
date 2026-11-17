# ビルド検証記録 v3.3.0（GAS応答修正・待機停止対応）

- 更新日：2026-11-17
- Repository：a09848281-prog/web
- 現行ソース：main ブランチ
- ビルド対象 Commit：`c4ef8fe0a12c10115b5578dde615d6aa5faa8532`
- Android versionCode：303
- Android versionName：3.3.0
- GitHub Actions build run：https://github.com/a09848281-prog/web/actions/runs/44095787786
- ビルド結果：成功（Web/GAS構文、HTML/API整合性、追加ソース検査、Android Gradle debug APKビルド、Artifact upload）
- GitHub Pages deploy run：https://github.com/a09848281-prog/web/actions/runs/44095726255
- Pages deploy結果：成功
- APK成果物名：`remote-camera-debug-apk-v3.3`
- Artifact ID：`14333203381`
- APKはGitHub ActionsのArtifactとして生成済み。実機でのインストール・動作は未確認。

## v3.2.0で追加・修正した内容（継承機能）

- GASのHealth APIで接続先スプレッドシートと必須シート・見出しを確認。
- setupDatabase()でSpreadsheet IDをScript Propertiesへ保存し、Webアプリ実行時にopenById()でDBを開く。
- Web起動時にGASへのPOST/iframe応答を確認し、DB未設定とPOST応答不通を区別。
- ペアリング解除でcontrollerTokenをサーバー側から失効。
- Androidはペアリング解除を次回ポーリングで検知し、RTC・カメラ・マイクを終了して再ペアリング待ちへ戻る。
- 切断シグナルを追加。
- プッシュトゥトーク中はAndroidからの受信音声を一時ミュート。
- 画質設定をカメラ解像度・フレームレート・最大ビットレートへ反映。
- CIにWeb/GAS/Android API整合性、HTML ID、アカウント機能の残存、DBヘルス、ペアリング解除、カメラ画質反映の検査を追加。

## v3.3.0で追加・修正した内容

- GASのHtmlService応答を `window.top.postMessage` で最上位のGitHub Pagesへ返すよう変更。
- Web側はGASの入れ子iframeから返るメッセージを、Googleの許可オリジンとランダムrequestIdで検証して受信。
- WebのGAS応答なしメッセージに詳細なタイムアウト原因を表示。
- Android通知欄へ「待機を停止」アクションを追加。停止時はGASポーリング・位置情報取得・WebRTCを終了。
- Androidのペアリング表示をGAS確認結果と連動し、端末IDのローカル保存だけでは確認済みにしない。
- CIにiframeブリッジとバックグラウンド停止操作のチェックを追加。

## v3.1.0から継続する内容

- Webのログイン・新規登録・ログアウトを廃止。
- Androidの8桁・10分有効・一回限りのコードでiPadをペアリング。
- 端末専用controllerTokenでWeb操作を保護。
- GASのsetupDatabaseは既存のシートデータを消去しない。
- 旧Users/Sessionsシートは既存データ保護のため残すが、新コードでは参照・認証に使用しない。
- Android側にペアリングコード再発行ボタンとリモート命令ACKを実装。
- WebRTCシグナル連番の割り当てにScriptLockを使用。
- Android GASクライアントでHTTPSリダイレクト先をGoogleusercontentのみに制限。
- STUN/TURNなしのため、異なるネットワーク間の接続成功は保証しない。

## ユーザー側で必要な作業

1. GASの `Code.gs` をGitHubの最新 `gas/Code.gs` に差し替える。
2. `setupDatabase()` を再実行する。既存行は削除せず、DB_SPREADSHEET_IDを保存する。
3. 既存のウェブアプリデプロイを「新バージョン」に更新する。
4. /execを開き、JSONの `databaseReady:true` を確認する。
5. GitHub Pagesの最新画面を開き、画面上部にGAS接続済みの表示が出ることを確認する。
6. 最新v3.3.0 APKをGitHub Actionsから取得し、Android 13端末へインストールする。
7. Androidで監視待機を開始し、iPadのWebから8桁コードでペアリングする。
8. 実機で映像・双方向音声・操作・位置情報を検証する。

## CI警告

ビルドは成功していますが、GitHub Actionsのログには利用中ActionのNode.js 20系サポート終了に関する警告と `setup-java@v4` の非推奨警告が残っています。現在のビルド失敗原因ではありません。将来のAction更新対象です。

## 未検証・制限

- Google Apps Script実環境でのv3.3 POST/iframe応答とDB接続。
- iPad Safariからのペアリング・WebRTC接続。
- Android 13でのForeground Service、カメラ・マイク、位置情報。
- STUN/TURNなしでの異なるネットワーク間接続。
- 長時間待機、発熱、バッテリー消費。
- Androidの強制停止、再起動、権限取消、メーカー省電力制御後の自動復帰は保証しない。
- APKはGitHub Actionsでのdebugビルドであり、正式なRelease署名ではない。
