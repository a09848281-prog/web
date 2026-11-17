# ビルド検証結果

- 検証日：2026-11-17
- Repository：a09848281-prog/web
- Commit：e5f1cd3f97e4924a0909b864fd63c258fb7496e8
- GitHub Actions run：https://github.com/a09848281-prog/web/actions/runs/44075410860
- JavaScript構文検査（Web）：成功
- JavaScript構文検査（GAS）：成功
- Android Gradle debug APK：成功
- Artifactアップロード：成功
- Artifact名：remote-camera-debug-apk
- APK本体サイズ：50,776,961 bytes
- APK SHA-256：7c0434e84b875830b83f4464cf40e0caa4392d6f0fcc670f9acf64f1e6a90c7c

このAPKはAndroid Gradle Pluginによるdebug buildです。ビルド成功は確認済みですが、Android実機へのインストール、Android 13の権限動作、iPad SafariとのWebRTC実接続、マイク・位置情報の実機試験は未実施です。Google Playや一般配布向けのrelease署名ではありません。

## GitHub Pages
Pages公開ワークフローは用意済みですが、2026-11-17の実行ではGitHub連携の権限不足によりPagesサイトの初回作成が拒否されました。リポジトリ Settings → Pages で Source を GitHub Actions に設定すると、Deploy Web Pagesを再実行できます。
