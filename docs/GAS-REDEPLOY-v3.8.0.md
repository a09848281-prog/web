# GAS再デプロイ手順 v3.8.0

このシステムはFirebaseを使いません。GAS + Googleスプレッドシート + GitHub Pages + Android WebRTC構成です。

## 重要
v3.8 Webプレビューは、GAS APIが **3.8.0** であることを起動時に検査します。既存GASが3.7以前の場合は、ペアリングを開始できません。
GitHub Pagesを更新しても、Apps Scriptの既存デプロイは自動更新されません。

## 更新手順（既存URLを維持）
1. 現在使っているGoogle Apps Scriptプロジェクトを開きます。
2. `Code.gs` の内容をすべて置き換えます。新しいコードはGitHubの [gas/Code.gs（v3.8.0）](https://github.com/a09848281-prog/web/blob/rebuild-v3.8-realtime-stability-no-firebase/gas/Code.gs) からコピーします。
3. 保存します。
4. Apps Script右上の「デプロイ」→「デプロイを管理」を開きます。
5. 現在使用中のウェブアプリの鉛筆アイコン（編集）を押します。
6. バージョンを「新バージョン」にし、「デプロイ」を押します。
7. 既存の `/exec` URLを維持できたことを確認します。新しいデプロイを別に作ってURLが変わった場合は、GitHubの `web/preview/config.json` の `gasUrl` も新しいURLへ更新し、Pagesを再デプロイする必要があります。

## 更新確認
既存の `/exec` URLをブラウザーで開き、JSONで次を確認します。

- `version` が `3.8.0`
- `databaseReady` が `true`

`databaseReady:false` の場合は、表示される `missingSheets` や `schemaErrors` を確認してください。

## スプレッドシートのデータについて
v3.8は既存の `Devices`、`Commands`、`Signals`、`Settings`、`LocationHistory`、`SecurityLog` を使います。既存の列構成を変えずに読み取り処理を最適化しています。
すでにv3.7で `databaseReady:true` だった場合、通常は `setupDatabase()` を再実行する必要はありません。シートを削除したり、初期化したりしないでください。

## 6分制限について
Apps Scriptの6分／実行上限を無効化するものではありません。v3.8は接続確立中にGASポーリングを減らし、Signals／Commandsの読み取り行数とDevicesの最終応答時刻更新を抑制します。

## テスト
1. v3.8 WebプレビューをiPad Safariで開きます。
2. 起動時に「GASバージョン不一致」が出ず、「GAS接続済み」と表示されることを確認します。
3. Android v3.8で監視待機を開始し、ペアリング済み端末へ接続します。
4. 音量スライダー、カメラ切替、画質、位置情報を順に確認します。
5. まず同じWi-Fi内で試し、映像が安定してから別ネットワークを試します。

なお、CIでAPKビルドが成功していても、実機での長時間安定性・カメラ・音声・位置情報は別途確認が必要です。
