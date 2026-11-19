# Remote Camera v4.2 UI付きブックマークレット

## 機能

- PCでは右下のフローティングパネルとして開き、上部バーをドラッグして移動できます。
- iPad / iPhoneでは全画面表示します。
- 「別タブ」「最小化 / 復元」「閉じる」を搭載。
- 最小化はiframeを維持し、閉じると接続を終了します。
- v4.2本体の登録・監視機能をそのまま読み込みます。
- 受信静止画・動体検知履歴画像を開くと、画像ビューアーが画面全体を使い、親パネルも自動拡張します。画像ビューアーを閉じるとパネルの元の大きさ・位置へ戻ります。
- 画像を全画面表示している間はブックマークレット上部バーを隠し、画像表示領域を最大化します。

## ブックマークレットコード

この1行をブックマークのURL欄に設定してください。

```text
javascript:(()=>{const u='https://cdn.jsdelivr.net/gh/a09848281-prog/web@rebuild-v4.2-multi-viewer-camera/web/preview/bookmarklet-ui-v4.2.js';const s=document.createElement('script');s.src=u+'?v=4.2.0';s.onload=()=>s.remove();s.onerror=()=>{s.remove();alert('Remote Camera v4.2を読み込めませんでした。通信状態を確認してください。')};(document.head||document.documentElement).appendChild(s)})();
```

## iPad Safariへの登録

1. 任意のページを開き、共有ボタンからブックマークを追加する。
2. ブックマーク名を「Remote Camera v4.2」にする。
3. ブックマーク一覧で編集し、URL欄を全て消す。
4. 上のjavascript:から始まるコードを貼り付けて保存する。
5. Safariがjavascript:を削除した場合は先頭に付け直す。
6. ブックマークをタップして起動する。

## 注意

- iframe内のカメラ・マイク許可はブラウザーやホストページのPermissions Policy / CSPで拒否される場合がある。その場合は「別タブ」を使う。
- iOS Safariはバックグラウンドや省電力状態でiframe・WebRTC・動体検知を停止する場合がある。最小化は停止を防ぐ保証ではない。
- v4.2ページとローダーは、このプレビュー用ブランチのjsDelivr CDN URLを使用する。GitHub Pages mainへは変更を加えない。
