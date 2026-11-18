# Remote Camera v3.9.0 機能・安定性メモ

## Webからの映像設定

- 画角：16:9、4:3、1:1、9:16
- FPS上限：15、20、24、30
- 解像度：360p、480p、720p、1080p
- 通信量：自動、超節約、節約、標準、高画質
- 背面カメラは公開されているカメラ情報から水平画角が広いものを優先

配信中にCamera2の撮影サイズを変更すると映像停止につながることがあるため、画角・解像度変更は次回接続まで延期します。FPS上限と送信ビットレートは既存VideoTrackを止めずに変更します。端末が要求サイズをサポートしない場合は、より小さい候補を順に試します。

## 音声

Android側は JavaAudioDeviceModule を明示して AudioRecord 入力、ハードウェア AEC/NS を有効化します。音声トラックはWebRTCの双方向音声セクションで返し、Web側は受信トラックを Web Audio に接続します。Webの「受信音量（iPad）」はiPad側で調整します。

## 全画面復帰

Fullscreen API、Safariのwebkitイベント、pageshow、visibilitychange、resizeで既存MediaStreamの再生を確認し、必要な場合はvideo.play()を呼び直します。映像ストリームを不要に作り直さず、既存のWebRTC接続を維持します。

## Android側の待機通信量設定

- Web側の設定に従う
- 超節約
- 節約
- 標準
- 高画質

これはWebRTCの映像送信プロフィールに作用する設定です。WebRTC接続を開始するまでのGAS待機ポーリング間隔（2 / 6 / 30秒）とは別の設定です。

## v3.9の新機能5つ

1. AndroidライトON/OFF（背面カメラ）
2. Webで受信映像をPNG静止画保存
3. Webの画面スリープ防止（Wake Lock API）
4. WebRTC統計に基づく自動画質・通信量調整
5. Androidの電池残量・充電・温度・カメラ向き表示

## 安定性対策

- 接続中のFPS/ビットレート調整ではカメラを再起動しない。
- 画角変更は次回セッションへ延期。
- 全画面終了時に再生を復帰。
- Androidアプリ画面の表示とForeground Serviceを分離。Activityの破棄・再生成でServiceを停止しない。
- Androidローカル通信量設定はSharedPreferencesに保存。
- ライト命令はWebRTCデータチャネルを優先し、成否をWebへ返す。
- 自動画質調整は12秒の最小変更間隔を設け、回線状況の急変に追従しすぎない。

## 既知の制約

- カメラの実際の対応FPS・撮影サイズ・画角はAndroid端末に依存します。
- Android CameraManager のトーチ制御は、カメラデバイスや他のカメラリソース使用中に拒否される場合があります。機種によっては配信中のライト操作ができません。
- WebRTCの接続先ネットワークによってSTUNのみでは接続できず、TURN中継が必要な場合があります。
- Web Audio と Wake Lock はブラウザーの仕様・ユーザー操作条件に依存します。
- このブランチのCI成功は、Galaxy A22 5G / Android 13 および iPad Safari の実機成功を意味しません。
