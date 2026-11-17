# ビルド検証結果

- 検証日：2026-11-17
- Repository：a09848281-prog/web
- Commit：07bbc1c1b228f4380bbfa6714c83b95f318b7a7a
- GitHub Actions run：https://github.com/a09848281-prog/web/actions/runs/44076231029
- Web JavaScript構文検査：成功
- GAS JavaScript構文検査：成功
- Android Gradle debug APKビルド：成功
- Artifactアップロード：成功
- Artifact名：remote-camera-debug-apk
- APK本体サイズ：50,776,961 bytes
- APK SHA-256：54a708f867ab77ec8858462e0de700643bfb908c7ac8821fb437ca5f5672cd5e

このAPKはdebug署名版です。CI上のコンパイルとパッケージ生成を確認しましたが、Android 13実機へのインストール、iPad Safariとの実WebRTC接続、音声・位置情報の動作確認はまだ実施していません。正式配布用release署名ではありません。

## GitHub Pages
Deploy Web Pagesワークフローはありますが、GitHub Appの権限ではPagesサイトの初回作成ができず、実行が拒否されました。リポジトリ Settings → Pages で Source を「GitHub Actions」に設定した後に、Actionsから Deploy Web Pages を再実行してください。
