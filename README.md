# Android・iPad 遠隔監視カメラシステム

Firebase非使用・GAS／GitHub／Googleスプレッドシート構成の個人利用プロジェクトです。

## 仕様書・手順
- [完全版開発仕様書 v3.0](docs/Android-iPad-Remote-Surveillance-Camera-Spec-v3.0.md)
- [セットアップ手順](docs/QUICKSTART.md)
- [実装状況・未検証事項](docs/IMPLEMENTATION-STATUS.md)

## ソース構成
- web/ : iPad Safari向けWebサイト
- gas/ : Google Apps Script API
- android/ : Kotlin / WebRTC Androidアプリ
- .github/workflows/ : APKビルドとGitHub Pages公開

## 重要
Androidのカメラ・マイクForeground Serviceはアプリが表示され権限取得済みの状態で開始してください。STUN/TURNを使わないWebRTCは全ネットワーク間の接続を保証しません。GAS・Sheets・Pagesの初回設定と実機確認が必要です。
