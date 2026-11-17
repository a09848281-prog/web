# アカウント廃止・ペアリング方式への変更仕様 v3.1

作成日：2026年11月17日  
対象リポジトリ：a09848281-prog/web  
適用範囲：v3.0仕様書のうち、アカウント認証・端末ペアリング・Web画面・GAS API・データベースに関する項目を本書で置き換える。

## 1. 変更の目的

本システムは個人利用の遠隔監視カメラであり、一般的な会員制Webサービスではない。そのため、Webのユーザー登録・ログイン・ログアウト・パスワード管理を廃止し、Android端末とiPadを直接ペアリングして利用する。

監視カメラ機能（映像、双方向音声、カメラ切替、画質、通信量モード、音量、位置情報、履歴）は維持する。

## 2. 新しい認証モデル

### 2-1. Android端末認証
- Android初回起動時に端末UUIDと端末専用秘密情報を生成する。
- GASには秘密情報のハッシュのみ保存する。
- Androidアプリは8桁のペアリングコードを表示する。
- コードの有効期限は10分。
- コードは一度使用すると無効になる。
- Android側からペアリングコードを再発行できる。
- 再発行後に新しいコードが使用されると、以前のWeb操作トークンは無効になる。

### 2-2. iPad操作権限
- Web画面にアカウント登録・ログイン画面を表示しない。
- Web画面の「Androidをペアリング」から8桁コードを送信する。
- GASはコードを照合し、対象端末に紐づくランダムな controllerToken を発行する。
- GASにはcontrollerTokenのハッシュだけを保存する。
- WebはcontrollerTokenをペアリングしたブラウザーのローカルストレージに保存する。
- 端末操作APIはdeviceIdとcontrollerTokenの両方を検証する。
- AndroidアプリからのAPIはdeviceIdとdeviceSecretの両方を検証する。
- deviceIdだけでは映像・音声・位置情報・操作命令にアクセスできない。

### 2-3. ローカルストレージの注意
controllerTokenは操作権限を持つ秘密情報である。個人用iPadのSafariで使用し、共有端末や公開端末では使用しない。Safariのサイトデータ削除や別ブラウザーでは再ペアリングが必要になる。

## 3. Web画面変更

- ログイン画面を廃止。
- 新規登録画面を廃止。
- ログアウトボタンを廃止。
- 初期表示から監視カメラダッシュボードを表示。
- 端末一覧はこのブラウザーにペアリング済みの端末を表示。
- 「Androidをペアリング」ボタンからコード入力ダイアログを開く。
- ペアリング成功後、端末選択・接続・切断・映像・音声・位置情報の各機能を使用可能にする。

## 4. GAS API変更

廃止API：
- register
- login
- logout
- me
- list_devices

継続API：
- device_begin
- device_refresh_code
- claim_device
- device_poll
- send_signal
- poll_signals
- send_command
- get_settings
- save_settings
- add_location
- get_locations
- delete_locations

追加API：
- ack_command：Androidが受信した操作命令の実行結果をGASへ返す。

ペアリング前のclaim_deviceを除き、Webからの操作APIはcontrollerTokenを要求する。Androidからの端末APIはdeviceSecretを要求する。

## 5. スプレッドシート

### Devices
従来の端末情報を維持し、末尾にcontrollerSecretHash列を追加する。既存の行は消去しない。旧ownerUserId列は互換性のため残すが新方式では使用しない。

### Commands
命令はpendingで登録し、Androidが処理後にack_commandを送信する。成功はdone、失敗はfailed、期限切れはexpiredとする。

### その他
Signals、Settings、LocationHistory、SecurityLogは維持する。旧Users / Sessionsシートは既に存在する場合も削除せず、新方式からは参照しない。

## 6. データベース初期化の安全性

setupDatabaseは既存シートを一括clearしない。既存の列見出しが一致する場合に不足している末尾列だけを追加する。既存見出しが異なる場合はデータ保護のためエラーを出し、初期化を中止する。

## 7. ペアリング復旧

iPadのSafariデータが消えてcontrollerTokenを失った場合：
1. Androidアプリを開く。
2. 「ペアリングコードを再発行」を押す。
3. 新しい8桁コードをiPadのWeb画面に入力する。
4. 新しいcontrollerTokenが保存され、以前のトークンは無効になる。

## 8. セキュリティ・運用上の制限

- コードを第三者に見せない。
- スプレッドシートを一般公開しない。
- controllerTokenはURLやGitHubソースに書かない。
- Apps ScriptのWebアプリは「自分として実行」「全員がアクセス可」で公開するため、全APIで端末秘密情報または操作トークンを検証する。
- ペアリングコードは期限付き・一回限りとし、失敗試行を制限する。
- 録画・録音は実装しない。
- WebRTCは引き続きGASを映像・音声の中継に使わない。
- STUN/TURNを使用しない制約上、異なるネットワーク間の接続は保証しない。

## 9. テスト必須項目

1. Android初回起動で端末ID・秘密情報・ペアリングコードが生成される。
2. 正しいコードでペアリングするとcontrollerTokenが返り、Webに端末が保存される。
3. コード期限切れ・誤入力ではペアリングできない。
4. 使用済みコードを再利用できない。
5. controllerTokenなし・誤りでは操作APIにアクセスできない。
6. deviceSecretなし・誤りではAndroid APIにアクセスできない。
7. Androidのコード再発行後、新しいコードで再ペアリングできる。
8. 再ペアリング後、古いcontrollerTokenは使えない。
9. CommandsがAndroidに届き、ack_commandによってdoneまたはfailedになる。
10. 映像・音声・カメラ切替・音量・画質・位置情報・履歴を実機で確認する。
