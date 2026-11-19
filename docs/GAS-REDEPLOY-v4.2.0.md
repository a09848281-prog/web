# GAS v4.2.0 更新・再デプロイ

1. Apps Scriptで既存のCode.gsをv4.2ブランチのgas/Code.gsに置き換える。
2. 保存する。
3. 関数一覧からsetupDatabaseを選び、実行する。初回は権限を承認する。
4. スプレッドシートにControllersタブが追加されたことを確認する。既存のDevices / Commands / Signals / Settings / LocationHistory / SecurityLogの行は消去しない。
5. 「デプロイ」→「デプロイを管理」→既存Webアプリの編集（鉛筆）→新しいバージョン→デプロイ。
6. Web設定のGAS URLは既存の /exec URLを使う。別のデプロイを新規作成した場合だけ、web/config.jsonのURLを変更する。
7. healthを確認し、APIバージョンが4.2.0、databaseReadyがtrueであることを確認する。

## 既存v4.1のペアリング情報

旧Devices.controllerSecretHashが残っている端末は、最初に利用する既存ブラウザーからの認証時、または新しいコードによる最初の登録時にControllersシートへ移行する。移行後はブラウザー別トークンを利用する。v4.2ではブラウザーの保存キーを分離しているため、v4.2を使う各端末は新しくペアリングする。

## 登録コード

コードは10分で期限切れになり、一度の登録で消費される。追加のiPad / PCを登録する際は、Androidアプリの「コード再発行」を押す。
