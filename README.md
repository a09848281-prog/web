# Android・iPad 遠隔監視カメラシステム

## v3.9.0 プレビュー（実機テスト前）

作業ブランチ：`rebuild-v3.9-camera-controls-stability`
Android applicationId：`jp.a09848281.remotecamera.v39preview`
Web/API version：`3.9.0`

### v3.9で追加・改善
- Webから画角（16:9 / 4:3 / 1:1 / 9:16）とFPS（15 / 20 / 24 / 30）を指定できます。
- 画質選択を360p / 480p / 720p / 1080pへ拡張し、標準ビットレートも見直しました。
- 配信中はFPS・ビットレートを直接変更し、カメラの撮影サイズ変更は次回接続へ延期して映像停止を抑えます。
- 全画面終了後、同じWebRTC映像ストリームの再生を復帰させる処理を追加しました。
- AndroidのJavaAudioDeviceModuleと音声ルーティングを明示し、Androidマイク受信状態をWebに表示します。
- Androidアプリ内から待機中の通信量モードを「Web側／超節約／節約／標準／高画質」へ切り替えられます。
- Androidアプリの設定画面を開いても、Foreground Serviceを停止しない構造を維持します。
- 新機能5つ：Androidライト操作、PNG静止画保存、画面スリープ防止、自動画質調整、Android電池情報表示。
- Firebaseは使用していません。

**注意：** 画角・解像度は次回接続時に反映します。Androidのライトはカメラ使用中にOSから制限される機種があります。TURN中継はまだ設定していません。Galaxy A22 5G / Android 13 と iPad Safari の実機テスト前のプレビューです。

手順：
- [v3.9クイックスタート](docs/QUICKSTART-v3.9.0.md)
- [GAS v3.9.0再デプロイ](docs/GAS-REDEPLOY-v3.9.0.md)
- [v3.9機能と制限](docs/FEATURES-v3.9.0.md)
- [v3.9ビルド検証結果（CI成功・実機待ち）](docs/BUILD-REPORT-v3.9.0.md)

---

## v3.8 Webプレビュー
https://a09848281-prog.github.io/web/preview/ （正式版トップページとは別の検証画面）

## v3.8.0 リアルタイム安定性改善ブランチ
作業ブランチ：`rebuild-v3.8-realtime-stability-no-firebase`
検証対象：Android 13 / iPad Safari / Firebase非使用
Android applicationId：`jp.a09848281.remotecamera.v38preview`（v3.7と並行インストール）

### v3.8で追加・改善
- WebRTCのデータチャネルを追加し、接続中のカメラ切替・画質変更・位置情報設定・切断命令をGAS経由ではなく端末間で直接送信します。
- ICEが一時的にDISCONNECTEDになっても8秒間は接続復旧を待ち、短いWi-Fi切替や瞬断で即座にセッションを破棄しません。
- AndroidはWebRTC接続と操作用データチャネルの両方がOPENの間、GASの定期ポーリングを停止します。データチャネルが閉じた場合はGAS経由の命令受付へ戻ります。
- iPad側で映像フレームの実受信を監視し、映像が15秒以内に届かない場合や、受信開始後8秒以上止まった場合に自動再接続を試みます。
- 音量スライダーを「受信音量（iPad）」へ変更し、Web AudioのGainNodeでiPad側の受信音量を調整します。設定値はiPadのブラウザーに保存します。
- 画質と位置情報の設定は、WebRTCが使える間はAndroidへ先に直接反映し、GASへの保存は後から順番に処理します。
- 位置情報は直近60秒以内のキャッシュを先に利用します。新しい測位が必要な場合も取得待ちを最大8秒にし、GPSとネットワーク位置情報を併用します。
- AndroidのGAS読み取り系APIは一時的な通信失敗を最大3回まで間隔を空けて再試行します。ポーリング本体は失敗回数に応じて2〜15秒のバックオフを行います。
- GASのCommands／Signals読み取りを末尾の行に限定し、端末の最終応答時刻のシート更新は60秒に1回までに抑えます。
- GAS APIの応答にサーバー処理時間（serverMs）とAPIバージョンを含め、GAS内部処理の遅延とネットワーク遅延を切り分けられるようにします。
- Androidの待機モードを「省電力30秒／標準6秒／応答優先2秒」に統一します。
- Firebase依存関係は追加していません。
- v3.8 Previewはv3.7とAndroid署名が異なっても共存できるよう、別applicationIdで配布します。既存v3.7をアンインストールせず、新しい8桁コードで別途ペアリングしてください。

**GAS 6分制限について：** Apps Scriptの1回の実行上限は6分のままです。制限そのものを無効化することはできません。v3.8では接続成立後にGASの定期ポーリングを止めてWebRTCへ切り替えることで、不要な実行回数を減らします。

**公開状態：** v3.8のAndroid/GASソースは検証ブランチにあり、mainにはまだ統合していません。Webプレビューだけは `https://a09848281-prog.github.io/web/preview/` に公開済みで、正式版トップページ `/web/` は維持しています。Galaxy A22 5G / Android 13とiPad Safariで実機確認が必要です。

- WebRTC初期化前に `ACCESS_NETWORK_STATE` を検査し、欠落時はネイティブ処理へ進まず原因を通知します。
- 背面カメラの公開情報から水平画角が最も広いカメラを優先し、16:9の720p/24fpsを標準にします。
- AndroidとiPadの両方にSTUNを設定し、NAT越えの候補収集を改善します（TURN中継なしでは全ネットワークを保証しません）。
- 位置情報はカメラ待機の必須条件から分離し、60秒以内のキャッシュを優先、必要時はGPSとネットワーク位置情報を併用して最大8秒で取得処理を終了します。
- Webに自動再接続、通信統計、全画面、表示ズーム、表示モード、接続時間、地図追尾、座標コピーを追加します。
- 接続中の画質変更ではCamera2の撮影形式を切り替えず、送信ビットレート／FPSのみを先に反映し、解像度変更を次回接続まで延期して映像停止を抑えます。
- 同一セッションの重複Offerを無視し、新しいPeerConnectionの登録後に古いセッションを整理します。
- Androidカメラの切断・フリーズ後、最大5回の再取得を試み、既存VideoTrackを維持します。
- iPad Webの自動再接続ではマイクストリームを再利用し、画面復帰・ネットワーク復帰でも接続状態を確認します。
- 映像フレームの受信停止を統計から検知し、3回連続の停止で接続を再構築します。手動切断では動きません。
- Androidに任意の画面OFF時CPU維持スイッチを追加します。ONでは待機の安定性を優先する代わりに電池を多く消費します。
- Web操作画面を再配置し、接続・切断を映像画面上部へ移し、詳細設定を折りたたみ式にします。
- Androidの待機モードを「省電力30秒／標準6秒／応答優先2秒」から選択できます。
- Android側にWebからのカメラ・マイク起動許可スイッチを追加します。
- Androidサービスのシステム再生成時に、保存済み設定と権限を再検査して待機復旧を試みます。
- 待機中は撮影・録音せず、接続中は通知とAndroidプライバシー表示を維持します。
- APKビルド後に、実際のAPK内にネットワーク・カメラ・マイク権限が含まれるかCIで検査します。

v3.8.0のAndroid debug APKはGitHub Actionsでビルド・ソース検査・APK権限検査まで成功しています。ビルド記録は [BUILD-REPORT-v3.8.0.md](docs/BUILD-REPORT-v3.8.0.md) を参照してください。実機確認は未完了です。Galaxy A22 5G / Android 13でWebRTCデータチャネル、映像復旧、iPad受信音量、位置情報、ロック画面、長時間待機を確認してください。OSの強制停止・端末再起動・権限取消後の自動起動は保証できません。


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
- [GAS v3.8.0再デプロイ手順](docs/GAS-REDEPLOY-v3.8.0.md)
- [実装状況](docs/IMPLEMENTATION-STATUS.md)
- [ビルド検証結果 v3.8.0（成功）](docs/BUILD-REPORT-v3.8.0.md)
- [旧ビルド検証結果 v3.7.0](docs/BUILD-REPORT-v3.7.0.md)
- [ビルド検証結果（旧版）](docs/BUILD-REPORT.md)

## ソース構成
- web/ : iPad Safari向けWebサイト
- gas/ : Google Apps Script API
- android/ : Kotlin / WebRTC Androidアプリ
- .github/workflows/ : Android APKビルド・GitHub Pages公開

## 制限・注意
Androidのカメラ・マイクForeground Serviceは、アプリが表示され権限取得済みの状態で開始してください。STUN/TURNなしのWebRTCは、異なるネットワーク間の接続を保証しません。GASデプロイ・Sheets作成・Pagesの初期設定・実機テストが必要です。操作トークンはペアリングしたブラウザーのローカルストレージに保存されるため、個人用iPadで使用してください。
