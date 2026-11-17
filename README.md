# Android・iPad 遠隔監視カメラシステム

Firebase非使用・GAS／GitHub／Googleスプレッドシート構成の個人利用プロジェクトです。

## 仕様書・手順
- [完全版開発仕様書 v3.0](docs/Android-iPad-Remote-Surveillance-Camera-Spec-v3.0.md)
- [セットアップ手順](docs/QUICKSTART.md)
- [実装状況](docs/IMPLEMENTATION-STATUS.md)
- [ビルド検証結果](docs/BUILD-REPORT.md)

## ソース構成
- web/ : iPad Safari向けWebサイト
- gas/ : Google Apps Script API
- android/ : Kotlin / WebRTC Androidアプリ
- .github/workflows/ : Android APKビルド・GitHub Pages公開

## 重要
Androidのカメラ・マイクForeground Serviceは、アプリが表示され権限取得済みの状態で開始してください。STUN/TURNなしのWebRTCは、すべてのネットワーク間接続を保証しません。GASデプロイ・Sheets作成・Pagesの初期設定・実機テストが必要です。
