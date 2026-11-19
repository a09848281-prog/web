# Remote Camera v4.5.1 — テスト計画

## CI
- Web/GAS/Service Worker構文、manifest JSON
- HTML ID重複・JS参照漏れ
- PWA同一オリジンキャッシュ
- 最大8範囲、正規化座標、範囲内差分検出
- 人物候補・進入・退出・方向推定
- GAS API version 4.5.1と既存シート構成
- Android preview Config.kt URLがv4.5.1ブランチのweb/config.jsonを参照
- Android versionCode/applicationId整合、Gradle APK build

## iPad Safari / PWA実機
- ホーム画面追加・standalone起動
- ペアリング・WebRTC接続
- 複数範囲をドラッグ作成・選択・名前変更・削除
- 指定範囲外を検知しない／範囲内を検知する
- ローカル通知・イベント履歴・静止画・CSV
- 人物候補概算、進入/退出、方向表示と誤検知
- 背景化で停止し、復帰で再開
- 通知拒否・非対応でもアプリが停止しない

## Android 13 / Galaxy A22 5G
- v4.5.1 APK並行インストール・新規ペアリング
- 既存カメラ・マイク・ライト・位置情報
- 30分以上の接続・発熱・電池消費

PWA休止中の映像解析・即時通知は外部Pushなしでは保証しない。人物候補はヒューリスティック推定で正確な人数や本人識別を保証しない。
