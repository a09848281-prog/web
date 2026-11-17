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
web/config.json の gasUrl を実際のURLに置き換え、mainにコミットします。API URLは公開設定ファイルに置かれます。秘密鍵・トークン・管理者パスワードを入れないでください。

## 3. GitHub Pages
GitHubの Settings → Pages → Build and deployment → Source を GitHub Actions に設定します。mainへ変更をpushするとWeb公開ワークフローが実行されます。想定公開URLは https://a09848281-prog.github.io/web/ です。

## 4. APK
リポジトリの Actions を開き、成功した「Build Android APK and deploy Web」を選びます。Artifactsの remote-camera-debug-apk をダウンロードし、ZIPを展開して app-debug.apk をAndroidへ転送・インストールします。これは個人テスト用debug署名APKです。

## 5. 初回接続
1. AndroidでRemote Cameraを開く。
2. カメラ・マイク・位置情報・通知の権限を許可し、「監視待機を開始」を押す。
3. Androidに表示された8桁登録コードをiPadのWeb画面「Android端末を登録」に入力する。
4. Webで新規登録またはログインし、端末一覧からAndroidを選ぶ。
5. 「接続」を押し、iPadのマイク権限を許可して映像と音声を確認する。

## 注意
Androidは約30秒間隔でGASを確認します。STUN/TURNなしのため、まず同じLANで接続試験してください。OpenStreetMap標準タイルの利用ポリシーと帰属表示を守ってください。GASデプロイ・スプレッドシート作成・Pages設定・実機試験は利用者のGoogle/GitHubアカウントと実機で行う必要があります。
