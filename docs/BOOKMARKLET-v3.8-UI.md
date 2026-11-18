# Remote Camera v3.8 UI付きブックマークレット

## できること

- ブックマークをタップすると、現在のWebページ上にRemote Camera v3.8のフローティングパネルを表示。
- PCでは右下に表示し、上部バーをドラッグして移動できます。
- iPad / iPhoneでは画面全体に表示します。
- 「−」で最小化、「□」で復元、「×」で終了できます。
- 「別タブ」でv3.8 Web画面を通常のタブとして開けます。
- 既にパネルがある状態でもう一度ブックマークを実行すると、パネルを再表示します。

## ブックマークレットコード

次の1行をブックマークのURL欄に設定してください。

```text
javascript:(()=>{const u='https://cdn.jsdelivr.net/gh/a09848281-prog/web@bookmarklet-v3.8-ui-launcher/web/preview/bookmarklet-ui.js';const s=document.createElement('script');s.src=u+'?v=3.8.0';s.onload=()=>s.remove();s.onerror=()=>{s.remove();alert('Remote Cameraブックマークレットを読み込めませんでした。通信状態を確認してください。')};(document.head||document.documentElement).appendChild(s)})();
```

このブックマークレットは、UI本体をjsDelivrから読み込みます。読み込み先のソースはこのブランチの `web/preview/bookmarklet-ui.js` です。

## iPad / iPhone Safariへの登録手順

1. Safariで任意のページを開き、共有ボタンから「ブックマークを追加」します。
2. ブックマーク名を「Remote Camera v3.8」などに変更して保存します。
3. ブックマーク一覧を開き、作成したブックマークの「編集」を押します。
4. URL欄をすべて消して、上の `javascript:` から始まる1行を貼り付けます。
5. 保存します。
6. 任意のページでそのブックマークをタップします。

iOS Safariが貼り付け時に `javascript:` を削除した場合は、URL欄の先頭に `javascript:` を付け直してください。

## 使い方

1. ブックマークを実行するとパネルが開きます。
2. パネル内のv3.8画面でAndroid端末をペアリングします。
3. Android側で監視待機を開始してからWeb側で接続します。
4. カメラ・マイク・位置情報は、必要な操作を行った際にブラウザーの許可を求めます。

## 大切な注意

- カメラ映像・音声の接続機能はv3.8 Web本体をそのまま読み込んでいます。ブックマークレット側で映像や音声を取得する処理は追加していません。
- iframe内のカメラ・マイク・位置情報を許可するため、`allow="camera; microphone; geolocation; autoplay; fullscreen"` を指定しています。ただしブラウザーや開いているWebサイトのセキュリティ設定により、埋め込み画面でカメラ・マイクが許可されないことがあります。その場合はパネルの「別タブ」を使ってください。
- iPad Safariでは、WebRTCのカメラ・マイク許可はユーザー操作が必要です。Android側の待機開始後に、画面上の接続ボタンをタップしてください。
- 「最小化」はiframeを残すため、接続を維持できます。「×」はiframeを終了するため、接続も終了します。
- 開いているサイトが厳しいContent Security Policyを設定している場合、ブックマークレットのスクリプト読み込みが拒否されることがあります。その場合はv3.8 Webページを直接開いてください。
- v3.8 Preview専用です。正式版トップページやv4.xのソースは変更しません。
- ブックマークレットは個人利用のiPad / PCで使用してください。ペアリング情報はv3.8 Webのオリジンに保存されます。

## 公開・利用状態

この実装は `bookmarklet-v3.8-ui-launcher` ブランチに追加しています。ブックマークレット本体はCDNからブランチ上のJSを取得するため、ブランチが公開状態になれば動作します。GitHub Pagesのv3.8 Previewページは別途既存URLを使用します。

- v3.8 Web: https://a09848281-prog.github.io/web/preview/
- Launcher source: https://github.com/a09848281-prog/web/blob/bookmarklet-v3.8-ui-launcher/web/preview/bookmarklet-ui.js
