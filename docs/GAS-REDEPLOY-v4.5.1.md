# GAS更新手順 — Remote Camera v4.5.1

1. 既存Apps Scriptの `Code.gs` をバックアップ。
2. ブランチ `rebuild-v4.5.1-smart-motion-pwa` の `gas/Code.gs` をコピーして置き換え。
3. 既存シート名・列・データは変更しない。DB初期化済みなら `setupDatabase()` の再実行は不要。
4. **デプロイ → デプロイを管理 → 編集 → 新バージョン**で更新し、既存の公開設定を維持。
5. 既存の `/exec` URLを維持。変わった場合だけ `web/config.json` の `gasUrl` を確認。
6. Web healthのAPIバージョンが4.5.1となり、既存端末のペアリング・接続が動くことを確認。

v4.5.1はGASバージョン表記のみ更新。APIアクション・シート列・既存データは変更しない。検知範囲・イベント画像はPWAの閲覧ブラウザー内だけに保存。
