# Android・iPad 遠隔監視カメラシステム

Firebase非使用・GAS／GitHub／Googleスプレッドシート構成の個人利用プロジェクトです。

## 現行方式 v3.1
- Webにユーザー登録・ログイン画面はありません。
- Androidアプリに表示される有効期限付き8桁コードでiPadをペアリングします。
- ペアリング成功時に端末専用の操作トークンを発行し、このiPadのブラウザー内に保存します。
- Androidの秘密情報と操作トークンを照合して、カメラ操作・設定・位置情報へのアクセスを制限します。
- ペアリングコードは10分で失効し、Androidから再発行できます。
- 映像・音声はWebRTCで直接通信し、GASやSheetsには保存しません。

## 仕様書・手順
- [元仕様書 v3.0](docs/Android-iPad-Remote-Surveillance-Camera-Spec-v3.0.md)
- [アカウント廃止・ペアリング方式 v3.1](docs/PAIRING-ONLY-DESIGN-v3.1.md)
- [セットアップ手順](docs/QUICKSTART.md)
- [実装状況](docs/IMPLEMENTATION-STATUS.md)
- [ビルド検証結果](docs/BUILD-REPORT.md)

## ソース構成
- web/ : iPad Safari向けWebサイト
- gas/ : Google Apps Script API
- android/ : Kotlin / WebRTC Androidアプリ
- .github/workflows/ : Android APKビルド・GitHub Pages公開

## 制限・注意
Androidのカメラ・マイクForeground Serviceは、アプリが表示され権限取得済みの状態で開始してください。STUN/TURNなしのWebRTCは、異なるネットワーク間の接続を保証しません。GASデプロイ・Sheets作成・Pagesの初期設定・実機テストが必要です。操作トークンはペアリングしたブラウザーのローカルストレージに保存されるため、個人用iPadで使用してください。
