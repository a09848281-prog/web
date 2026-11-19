# Remote Camera v4.5.1 Preview — クイックスタート

## GAS
1. 既存Apps ScriptのCode.gsをバックアップ。
2. v4.5.1ブランチの `gas/Code.gs` に置き換える。
3. 既存シート構成は変えない。DB初期化済みなら `setupDatabase()` の再実行は不要。
4. **デプロイを管理 → 編集 → 新バージョン**で再デプロイし、既存/exec URLを維持。

## Android
1. [GitHub Actionsの成功ビルド](https://github.com/a09848281-prog/web/actions/runs/44527714275)を開く。
2. Artifact `remote-camera-debug-apk-v4.5.1`（Artifact ID: 14531357847）をダウンロード、展開して `app-debug.apk` をインストール。
3. 必要なカメラ・マイク・通知権限を許可して監視待機を開始。
4. v4.5.1は別applicationId。新しい8桁ペアリングコードで登録。

## Web / PWA
1. https://a09848281-prog.github.io/web/v4.5.1-preview/ を開く。
2. 必要ならSafari共有メニューからホーム画面に追加。
3. 左側でAndroidをペアリングし、接続。
4. 「映像上で検知範囲を追加」を押し、右の映像をドラッグ。
5. 範囲名・感度・人物候補の進入/退出設定を確認し、動体検知をON。
6. 「通知を許可」はユーザー操作で許可する。

## 注意
PWAがバックグラウンドでOSに休止されると検知と即時通知は停止する。外部Pushサービスなしでは休止中通知は保証しない。復帰後に検知が再開する。人物候補は簡易形状推定であり、本人・実人数を特定しない。
