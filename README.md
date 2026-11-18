# Android・iPad 遠隔監視カメラシステム

## v3.5.0 再構築ブランチ
作業ブランチ：`rebuild-v3.5-remote-standby`

- WebRTC初期化前に `ACCESS_NETWORK_STATE` を検査し、欠落時はネイティブ処理へ進まず原因を通知します。
- Androidの待機モードを「省電力60秒／標準15秒／応答優先5秒」から選択できます。
- Android側にWebからのカメラ・マイク起動許可スイッチを追加します。
- Androidサービスのシステム再生成時に、保存済み設定と権限を再検査して待機復旧を試みます。
- 待機中は撮影・録音せず、接続中は通知とAndroidプライバシー表示を維持します。
- APKビルド後に、実際のAPK内にネットワーク・カメラ・マイク権限が含まれるかCIで検査します。

v3.5.0の実機確認は未完了です。ビルド成功後、Galaxy A22 5G / Android 13でロック画面・長時間待機を確認してください。OSの強制停止・端末再起動・権限取消後の自動起動は保証できません。


Firebase非使用・GAS／GitHub／Googleスプレッドシート構成の個人利用プロジェクトです。

## 既存機能（v3.3系から継承）
- Webにユーザー登録・ログイン画面はありません。
- Androidアプリに表示される有効期限付き8桁コードでiPadをペアリングします。
- ペアリング成功時に端末専用の操作トークンを発行し、このiPadのブラウザー内に保存します。
- Androidの秘密情報と操作トークンを照合して、カメラ操作・設定・位置情報へのアクセスを制限します。
- ペアリングコードは10分で失効し、Androidから再発行できます。
- 映像・音声はWebRTCで直接通信し、GASやSheetsには保存しません。
- 起動時にWebからGASのPOST疎通・DBスキーマを確認します。GAS HtmlServiceの入れ子iframeから最上位ページへ応答を返す方式に修正しています。
- Androidの通知欄に「待機を停止」アクションを追加し、バックグラウンド待機・通信・WebRTCを停止できます。
- Androidのペアリング表示は端末IDの保存だけでなく、GASから確認した状態を表示します。
- ペアリング解除で操作トークンをサーバー側でも失効し、Androidは次回ポーリング時に映像・音声を停止します。
- 画質設定は解像度・フレームレート・最大ビットレートに反映します。

## 仕様書・手順
- [元仕様書 v3.0](docs/Android-iPad-Remote-Surveillance-Camera-Spec-v3.0.md)
- [アカウント廃止・ペアリング方式 v3.2](docs/PAIRING-ONLY-DESIGN-v3.1.md)
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
