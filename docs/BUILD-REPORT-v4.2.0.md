# Remote Camera v4.2.0 CI / 公開記録

更新日：2026年11月19日

## GitHub Actions

- 最新Android / ソース検査：成功  
  https://github.com/a09848281-prog/web/actions/runs/44490462920
- 最新GitHub Pages v4.2 Preview：成功  
  https://github.com/a09848281-prog/web/actions/runs/44490446343
- Deployログの公開URL： https://a09848281-prog.github.io/web/

Web JavaScript構文、GAS JavaScript構文、HTML ID / API互換、v4.2機能・バージョン整合、Gradle APKビルド、APK必須権限検査、Pagesファイル検査、Pages artifact作成、Deployが成功した。

## 今回の安定性修正

- ライブ映像からの静止画を画面全体の画像ビューアーで表示。
- 動体検知履歴の画像もサムネイルから同じビューアーで開く。
- 画像ビューアーを閉じた時に一時画像URLを解放。
- 動体検知履歴の保存容量が不足した際は画像を外してイベント記録を保持。
- LocalStorageが使えない環境でも、保存操作がページ初期化全体を止めない。
- ICE候補収集のタイムアウト時に、不完全なSDPを送信しない。
- 接続時間表示の時間整形を同期関数へ修正。
- 閲覧登録解除時、個別sessionIdの切断通知をWebRTCとGASの両経路で試みる。
- v4.2 Pages公開workflowを専用Environmentへ分離し、同時デプロイを直列化。

## 実機確認は未完了

自動検査・APKビルド・Pagesデプロイ成功は、Galaxy A22 5G / Android 13、iPad Safari、PC Chromeでのライブ動作確認とは異なる。3台同時映像、音声、PTT、画像全画面、モバイル回線、バックグラウンド待機、長時間安定性は実機テスト計画に沿って確認する。
