# 実装状況

## リポジトリ内に用意したもの
- Web：ログイン/新規登録、端末一覧、ペアリング、接続UI、映像表示、PTT、音量/画質/カメラ命令、地図・位置履歴UI
- GAS：スプレッドシート初期化、PBKDF2-HMAC-SHA256パスワードハッシュ、ログインセッション、ワンタイム端末登録、接続命令、SDPシグナリング、設定と位置履歴API
- Android：Kotlinプロジェクト、権限画面、Foreground Service、端末登録、GASポーリング、WebRTCカメラ/音声トラック
- GitHub Actions：Web/GAS JavaScript構文検査、Android debug APKビルド、GitHub Pages公開用ワークフロー

## CI確認済み
2026-11-17、コミット 64fd03bc1e0086294f877a1863d1f492ca547a52 に対するActionsで次を確認しました。
- Web JavaScript構文検査：成功
- GAS JavaScript構文検査：成功
- Android Gradle debug APKビルド：成功
- debug APK Artifactアップロード：成功

GitHub Pages公開は、リポジトリSettings → PagesでSourceをGitHub Actionsに設定していないため初回実行が失敗しました。設定後にDeploy Web Pagesワークフローを実行してください。

## ユーザー側で必要な作業
1. Google Sheet作成、GAS貼付け、setupDatabase実行、Webアプリデプロイ
2. web/config.jsonにGAS URLを設定
3. GitHub Pages SourceをGitHub Actionsに変更
4. debug APKをAndroid 13端末へインストール
5. Android 13とiPad Safariで接続、音声、位置情報の実機検証

## 未検証・制限
- STUN/TURNなしのためICE接続は限定的。異なるネットワーク間で接続しない場合があります。
- Androidの強制停止、再起動、権限取消、メーカー省電力制御で待機が終了・遅延する場合があります。
- 多人数同時接続の個別切断、音声ハウリング防止、機種別広角カメラ選択、完全な再接続、長時間負荷試験は未検証です。
- APKはdebug署名です。正式なRelease署名・SHA-256配布は署名鍵を安全に設定した後に行います。
