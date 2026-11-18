# v3.9.0 ビルド・検証レポート

## 結果

**GitHub Actions CI：成功**

- Workflow：Build Android APK
- Run：[#129](https://github.com/a09848281-prog/web/actions/runs/44313471149)
- Run ID：44313471149
- 検証ブランチ：`rebuild-v3.9-camera-controls-stability`
- 対象コミット：`7aa0de53f7fa1712153ac2340c9eba28f8f1fabe`
- APK Artifact：`remote-camera-debug-apk-v3.9`
- Artifact ID：14432190847

## CIで成功した項目

1. Web JavaScript 構文検査
2. GAS JavaScript 構文検査
3. HTML ID重複・不足検査
4. Web／Android／GAS APIアクション整合性
5. v3.9の画角・FPS・全画面復帰・音声・ライト・新機能のソース存在検査
6. Android Gradle debug APK ビルド
7. APK内の INTERNET / ACCESS_NETWORK_STATE / CAMERA / RECORD_AUDIO 権限検査
8. Firebase依存関係がないことの検査
9. Android／Web／GASのバージョン整合性検査

## APK

- Android applicationId：`jp.a09848281.remotecamera.v39preview`
- versionCode：309
- versionName：3.9.0
- APKサイズ：50,809,809 bytes
- APK SHA-256：`ad4b500cf75ce36e8402bd6bb55b4240245a2bf5a3c3f948b7f3b158d2ee843d`
- Artifact ZIPサイズ：26,093,254 bytes
- Artifact ZIP SHA-256：`1a1f41ed2f8d5e80e9c1cecc1d85f245dd28e6106a9137ecb522538501763851`
- ZIP整合性検査：成功（app-debug.apk）

## 実機確認が必要な項目

CI成功は実際の端末での映像・音声品質を保証しません。次の確認はまだ未実施です。

- Galaxy A22 5G / Android 13でのカメラ広角、各解像度・FPS
- Androidマイク音声がiPad Safariで再生されること
- iPad Safariで全画面解除後に映像が止まらないこと
- アプリ画面を開いた時にバックグラウンド待機・配信が継続すること
- 長時間（10分以上）の映像・音声安定性
- ライトON/OFF。CameraManagerのトーチ制御は、カメラリソース使用中にOSから拒否される場合があります。
- Wake Lock APIが使用するiPadブラウザーで利用できること
- 自動画質調整が実際のWi-Fi／モバイル回線で過剰に切り替わらないこと

## 公開・統合状態

- main へのコード統合：未実施
- v3.8系：保護
- v3.9：Draft PRでレビュー・実機テスト待ち
- Pages本番URL：変更していません
- GAS：v3.9 Code.gs の新バージョン再デプロイが必要

## 次のテスト

1. v3.9 Preview APKをv3.8と並行インストールする。
2. v3.9 Code.gsを既存Apps Scriptへ貼り、新バージョンで再デプロイする。
3. Web側で16:9 / 720p / 24 FPSを選んで接続する。
4. マイク・全画面復帰・アプリ再表示・長時間安定性を確認する。
5. 画角やFPSは1項目ずつ変更し、対応値と実際の受信FPSを記録する。
