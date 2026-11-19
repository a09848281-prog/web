# v4.2 Web公開・ロールバック手順

更新日：2026年11月19日

## 現在の公開URL

https://a09848281-prog.github.io/web/

v4.2は `rebuild-v4.2-multi-viewer-camera` からGitHub Pagesへ公開する。PR #8はDraftのまま保持し、mainへマージしない。

## v4.2を再公開する

1. [v4.2 Preview workflow](https://github.com/a09848281-prog/web/actions/workflows/deploy-pages-v42-preview.yml) を開く。
2. 「Run workflow」を押す。
3. ブランチに `rebuild-v4.2-multi-viewer-camera` を選択して実行する。
4. 「Deploy Remote Camera v4.2 Preview」が緑のチェックになったことを確認する。
5. 公開URLを再読み込みする。

## 元のmain版へ戻す

1. [Deploy Web Pages workflow](https://github.com/a09848281-prog/web/actions/workflows/deploy-pages.yml) を開く。
2. 「Run workflow」を押す。
3. ブランチに `main` を選択して実行する。
4. 「Deploy Web Pages」が緑のチェックになったことを確認する。
5. 公開URLを再読み込みする。mainの `web/` の内容に戻る。

## 保持するルール

- PR #8はDraftのまま。Mergeボタンを押さない。
- main / v4.1 / Android APKの安定版をv4.2の試験目的で上書きしない。
- v4.2のGAS更新はWeb公開とは別作業。GASのCode.gsをv4.2に更新し、setupDatabase()を実行後、新バージョンとして再デプロイする。
- ロールバックはWebページだけをmain版に戻す。GASデータベースやAndroid APKを旧版へ自動変換する操作ではない。
- 公開が緑でも実機動作が確認済みという意味ではない。
