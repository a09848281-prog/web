# GAS更新手順 — Remote Camera v4.2.2

1. GitHubのブランチ `rebuild-v4.2.2-ultra-stable-controls` で `gas/Code.gs` を開く。
2. 内容をすべてコピーし、現在利用中のApps Scriptプロジェクトの `Code.gs` に貼り替えて保存する。
3. 先にスプレッドシートをバックアップし、Apps Scriptエディタで `setupDatabase()` を一度実行する。v4.2.2は既存テーブル構成を変えず、既存データを消去しない。
4. **デプロイ → デプロイを管理 → 編集 → 新バージョン** で更新する。現在の実行ユーザーとアクセス設定を維持する。
5. 新しい `/exec` URLが発行された場合は、Webの `web/config.json` の `gasUrl` と一致しているか確認する。
6. Webを再読み込みし、ヘルスチェック、ペアリング、映像、ライト、位置情報、端末情報を確認する。

このバージョンはfpsLimitの保存上限を60へ拡張する。Androidの監視時間と通信量はWebRTCの端末情報チャネルで返すため、GASに通信量履歴シートは追加しない。
