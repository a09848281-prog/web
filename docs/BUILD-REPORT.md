# ビルド検証結果 v3.1（アカウント不要・ペアリング方式）

- 検証日：2026-11-17
- Repository：a09848281-prog/web
- 検証対象コード Commit：a0609a772a2412717b58c8c29f8bb5a61b9ac76a
- GitHub Actions run：https://github.com/a09848281-prog/web/actions/runs/44086798071
- Web JavaScript構文検査：成功
- GAS JavaScript構文検査：成功
- HTML ID重複・参照漏れ検査：成功
- Web/Android API action とGAS dispatcherの整合性検査：成功
- 旧ログイン/新規登録UI・API残存検査：成功
- Android Gradle debug APKビルド：成功
- Artifactアップロード：成功
- Artifact名：remote-camera-debug-apk-v3.1
- Artifact ID：14330485414
- APK本体サイズ：50,776,961 bytes
- APK SHA-256：305cc059c5fae2710a4298da8b3a157f289fe29b5921b897b881595960e153e5

このAPKはdebug署名版です。CI上のコンパイルとパッケージ生成を確認しましたが、Android 13実機へのインストール、iPad Safariとの実WebRTC接続、音声・位置情報の動作確認はまだ実施していません。正式なRelease署名ではありません。

## v3.1の変更
- Webのログイン・新規登録・ログアウトを廃止。
- Androidの8桁・10分有効・一回限りのコードでiPadをペアリング。
- 端末専用controllerTokenでWeb操作を保護。
- GASのsetupDatabaseは既存のシートデータを消去しない。
- 旧Users/Sessionsシートは残すが、新コードでは使用しない。
- 旧バージョンでactiveになったAndroid端末も再ペアリング可能にする。
- Android側にペアリングコード再発行ボタンとリモート命令ACKを追加。
- WebRTCシグナル連番の割り当てにScriptLockを使用。
- Android GASクライアントでHTTPSリダイレクト先をGoogleusercontentのみに制限。
- 追加の静的整合性検査をGitHub Actionsに追加。

## Pages公開
Deploy Web Pages run：https://github.com/a09848281-prog/web/actions/runs/44084821245  
PagesのConfigure、Artifact upload、Deployの各ステップが成功。

## ユーザー側で必要な作業
1. GASの Code.gs をGitHubの最新 gas/Code.gs に差し替える。
2. setupDatabase() を実行する（既存行は消去しない）。
3. 既存のWebアプリデプロイを「新バージョン」に更新する。
4. GitHub Pagesを開いてペアリング画面が表示されることを確認する。
5. 最新APKをAndroid 13端末へインストールする。
6. Androidで監視待機を開始し、iPadのWebから8桁コードでペアリングする。
7. 実機で映像・双方向音声・操作・位置情報を検証する。

## 未検証・制限
- Google Apps Script実環境での新方式ペアリングとiframe応答。
- iPad SafariからのWebRTC接続。
- Android 13でのForeground Service、カメラ・マイク、位置情報。
- STUN/TURNなしでの異なるネットワーク間接続。
- 長時間待機、発熱、バッテリー消費。
- Androidの強制停止、再起動、権限取消、メーカー省電力制御後の自動復帰は保証しない。
