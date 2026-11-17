# ビルド検証記録 v3.2.0（アカウント不要・監視カメラ中心）

- 更新日：2026-11-17
- Repository：a09848281-prog/web
- 現行ソース：main ブランチ
- ビルド対象 Commit：`b38c283ce6d8f197ea4b342ad0809af648cbe2ad`
- Android versionCode：302
- Android versionName：3.2.0
- GitHub Actions build run：https://github.com/a09848281-prog/web/actions/runs/44091426011
- ビルド結果：成功（構文・API整合性チェック、Android Gradle debug APKビルド、Artifact upload）
- GitHub Pages deploy run：https://github.com/a09848281-prog/web/actions/runs/44091401728
- Pages deploy結果：成功
- APK成果物名：`remote-camera-debug-apk-v3.2`
- Artifact ID：`14332220491`
- APK本体サイズ：50,776,969 bytes
- APK SHA-256：`c45db79ece9a0dc7a725eec5d3461196e27e2c11d51cbb3bf625a97ea65dcd09`
- Artifact ZIP SHA-256：`9619b7a2130ee2403205ea3585a7a62b6bc6e480e442be203d024a8e4822e0aa`
- APKはActionsから取得・展開し、APKファイルの存在・サイズ・SHA-256を照合済み。

## v3.2.0で追加・修正した内容

- GASのHealth APIで接続先スプレッドシートと必須シート・見出しを確認。
- setupDatabase()でSpreadsheet IDをScript Propertiesへ保存し、Webアプリ実行時にopenById()でDBを開く。
- Web起動時にGASへのPOST/iframe応答を確認し、DB未設定とPOST応答不通を区別。
- ペアリング解除でcontrollerTokenをサーバー側から失効。
- Androidはペアリング解除を次回ポーリングで検知し、RTC・カメラ・マイクを終了して再ペアリング待ちへ戻る。
- 切断シグナルを追加。
- プッシュトゥトーク中はAndroidからの受信音声を一時ミュート。
- 画質設定をカメラ解像度・フレームレート・最大ビットレートへ反映。
- CIにWeb/GAS/Android API整合性、HTML ID、アカウント機能の残存、DBヘルス、ペアリング解除、カメラ画質反映の検査を追加。

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
6. 最新v3.2.0 APKをGitHub Actionsから取得し、Android 13端末へインストールする。
7. Androidで監視待機を開始し、iPadのWebから8桁コードでペアリングする。
8. 実機で映像・双方向音声・操作・位置情報を検証する。

## CI警告

ビルドは成功していますが、GitHub Actionsのログには利用中ActionのNode.js 20系サポート終了に関する警告と `setup-java@v4` の非推奨警告が残っています。現在のビルド失敗原因ではありません。将来のAction更新対象です。

## 未検証・制限

- Google Apps Script実環境でのv3.2 POST/iframe応答とDB接続。
- iPad Safariからのペアリング・WebRTC接続。
- Android 13でのForeground Service、カメラ・マイク、位置情報。
- STUN/TURNなしでの異なるネットワーク間接続。
- 長時間待機、発熱、バッテリー消費。
- Androidの強制停止、再起動、権限取消、メーカー省電力制御後の自動復帰は保証しない。
- APKはGitHub Actionsでのdebugビルドであり、正式なRelease署名ではない。
