# Sumi — 学校の共有前チェック

学校のアンケートを端末内で加工し、保存・配布の前に内容と出力先を確認するツールです。

実装、起動方法、認可モデルと証明の範囲は [sumi/README.md](sumi/README.md) に記載しています。

## GitHub Actions / GitHub Pages

`.github/workflows/pages.yml` は、プルリクエストで自動テストとLeanによる認可判定の検証を実行します。`main` へのpushでは、検証とビルドに成功した `sumi/dist/` をGitHub Pagesへ公開します。手動実行にも対応しています。

入力した文章はブラウザ内で扱います。GitHub Pagesへ送信・保存する機能はありません。参考資料のZIPと `true/` はリポジトリの公開対象から除いています。
