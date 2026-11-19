# Remote Camera v4.2.0 CI / 公開記録

更新日：2026年11月19日

## 最新GitHub Actions結果

- 最終Pull Requestソース検査・APKビルド：**成功**
  - Run: https://github.com/a09848281-prog/web/actions/runs/44490794076
  - 対象ブランチ：`rebuild-v4.2-multi-viewer-camera`
  - Commit：`0cc5ae40b8c5c0a7a9eadc9881229d7b9c970423`
- Pushソース検査・APKビルド：**成功**
  - Run: https://github.com/a09848281-prog/web/actions/runs/44490446412
- GitHub Pages v4.2 Preview：**成功**
  - Run #9: https://github.com/a09848281-prog/web/actions/runs/44490446343
  - Pages deployment commit：`9974b7472640aeab403686a2cff57d1ffcbeb263`
  - 公開URL： https://a09848281-prog.github.io/web/

## Android APK

- Artifact名：`remote-camera-debug-apk-v4.2`
- Artifact ID：`14512228729`
- サイズ：26,096,198 bytes
- Artifact ZIP SHA-256：`ad4335c1a2f8182cbe2a33aae27023d8583103862853551b6adb10dc51a5b425`
- 取得先： https://github.com/a09848281-prog/web/actions/runs/44490794076
- 有効期限：2026年12月19日 08:49 UTC

GitHub ActionsのArtifact欄からZIPをダウンロードし、展開した `app-debug.apk` をAndroidへインストールします。

## 自動検査で成功した項目

1. Web JavaScript構文検査
2. GAS JavaScript構文検査
3. HTML ID重複・Web参照ID・GAS APIアクションの互換性
4. v4.2複数ビューアー機能、GAS Controllers API、最大3台制限、バージョン整合
5. Kotlin / Gradle Android debug APKビルド
6. APK内のネットワーク・カメラ・マイク権限検査
7. GitHub Pages用Webファイル検査、Pages artifact作成、Deploy成功

## 今回の安定性修正

- ライブ映像からの静止画を画面全体の画像ビューアーで表示。
- 動体検知履歴の画像もサムネイルから同じビューアーで開く。
- ブックマークレットでは親パネルも画面全体に拡張し、画像ビューアーを閉じると元の位置・大きさに戻す。画像表示中はブックマークレット上部バーを隠す。
- 画像ビューアーを閉じた時に一時Object URLを解放。
- 動体検知履歴の保存容量が不足した際は画像を外してイベント記録を保持。壊れた・大きすぎる画像があってもイベント情報を維持。
- LocalStorageが使えない環境でも、保存操作がページ初期化全体を止めない。
- ICE候補収集のタイムアウト時に、不完全なSDPを送信しない。
- 接続時間表示の時間整形を同期関数へ修正。
- 閲覧端末の個別切断・自動再接続時、sessionIdごとの終了をWebRTCとGASの両経路で通知。
- v4.2 Pages公開workflowを専用Environmentへ分離し、main側のロールバックを妨げないよう同時デプロイを直列化。

## 実機確認は未完了

自動検査・APKビルド・Pagesデプロイ成功は、Galaxy A22 5G / Android 13、iPad Safari、PC Chromeでのライブ動作確認とは異なります。3台同時視聴、映像・音声、PTT、全画面表示、モバイル回線、バックグラウンド待機、長時間安定性は実機テスト計画に沿って確認が必要です。

## 注意事項

- GASの `gas/Code.gs` はApps Script側で手動更新が必要です。`setupDatabase()` 実行後、Webアプリを新しいバージョンとして再デプロイしてください。既存データは消去しません。
- STUNのみでTURN未構成のため、異なるネットワーク間の接続は保証されません。
- Androidの強制停止、再起動直後、権限取消、OSによるバックグラウンド制限からの遠隔起動は保証できません。
- GitHub ActionsにNode.js 20非推奨の警告が表示される場合がありますが、今回の対象runは成功しています。
