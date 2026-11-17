# セットアップ手順

## 1. GASとスプレッドシート
1. 新しいGoogleスプレッドシートを作成します。
2. 「拡張機能」→「Apps Script」を開きます。
3. gas/Code.gs をGASの Code.gs に貼り付けて保存します。
4. 関数一覧から setupDatabase を選び、1回実行して権限を許可します。
5. 「デプロイ」→「新しいデプロイ」→「ウェブアプリ」を選択します。
6. 実行ユーザーは「自分」、アクセスできるユーザーは「全員」にします。認証と端末所有者確認はAPI内で行います。
7. /exec で終わるURLをコピーします。

## 2. GAS URL
web/config.json の gasUrl を実際のURLに置き換え、mainへコミットします。秘密鍵・トークン・管理者パスワードを入れないでください。

## 3. GitHub Pagesの初期設定
1. GitHubリポジトリの Settings → Pages を開きます。
2. Build and deployment の Source を GitHub Actions に変更して保存します。
3. Actions → Deploy Web Pages を開き、Run workflowを実行します。
4. 成功後、Webサイトは https://a09848281-prog.github.io/web/ で公開されます。

## 4. APKの取得
1. リポジトリの Actions を開きます。
2. 成功した「Build Android APK」を選択します。
3. Artifacts の remote-camera-debug-apk をダウンロードします。
4. ZIPを展開して app-debug.apk をAndroidへ転送・インストールします。これは個人テスト用debug署名APKです。

## 5. 初回接続
1. AndroidでRemote Cameraを開きます。
2. カメラ・マイク・位置情報・通知の権限を許可し、「監視待機を開始」を押します。
3. Androidに表示された8桁登録コードをiPadのWeb画面「Android端末を登録」に入力します。
4. Webで新規登録またはログインし、端末一覧からAndroidを選びます。
5. 「接続」を押し、iPadのマイク権限を許可して映像と音声を確認します。

## 注意
Androidは約30秒ごとにGASを確認します。STUN/TURNを使用しないため、まず同じLANで接続試験してください。OpenStreetMap標準タイルの利用ポリシーと帰属表示を守ってください。Google Sheets/GASのデプロイと物理端末試験は利用者環境で行う必要があります。
