# Android Bugreport Analyzer

Android bugreport ZIP / TXT をブラウザ内で解析する静的Webアプリです。

## 起動
GitHub Pagesで公開されている場合、次のURLで開きます。

`https://a09848281-prog.github.io/web/tools/bugreport-analyzer/`

※ GitHub Pagesの公開元がリポジトリ直下（root）である場合は、配置ディレクトリに合わせてURLを調整してください。

## 主な機能
- Android bugreport ZIP内のログファイル抽出（標準ZIP / deflate）
- TXT / LOGの直接読み込み
- Java/Kotlin例外、ネイティブクラッシュ、ANR候補の抽出
- カメラ、マイク、WebRTC、メモリ、権限関連ログの抽出
- キーワード検索、前後ログ表示、解析結果TXT保存

## プライバシー
ファイルを外部サーバーへ送信するコードはありません。解析はブラウザ内で行います。バグレポートには個人情報が含まれる場合があるため、結果を共有する前に確認してください。

## 制約
- ZIP64、暗号化ZIP、未知の圧縮方式は未対応です。
- ZIP内のテキストログを対象にします。バイナリ形式のtombstoneは直接デコードできない場合があります。
- キーワード検出は原因の確定ではありません。実際の原因特定には該当時刻のログやスタックトレースの確認が必要です。
- 大きなレポートは端末のメモリ容量・ブラウザ性能に依存します。
