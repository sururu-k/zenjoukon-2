# Sumi — 作る・渡す・確かめる、3つのソフト

文書を作成するWrite、既存書類の共有を確認するGate、AIで用途を整理してZK証明を作るProveを、共通の認可・情報流・暗号化基盤で構成しています。

各製品の流れ、AIと暗号の役割、1作品としての提出案は [PRODUCTS.md](sumi/PRODUCTS.md) を参照してください。

実装、起動方法、認可モデルと証明の範囲は [sumi/README.md](sumi/README.md) に記載しています。

情報流の形式モデル・検証方法・信頼する前提は [保証範囲](sumi/ASSURANCE.md) を参照してください。アプリには、版ごとの検証結果を示す `assurance.html` を含みます。ブラウザやOSを含む実環境全体の漏洩不在を証明したものではありません。

## GitHub Actions / GitHub Pages

`.github/workflows/pages.yml` は、プルリクエストで自動テストとLeanによる認可判定の検証を実行します。`main` へのpushでは、検証とビルドに成功した `sumi/dist/` をGitHub Pagesへ公開します。手動実行にも対応しています。

入力した文章はブラウザ内で扱います。GitHub Pagesへ送信・保存する機能はありません。参考資料のZIPと `true/` はリポジトリの公開対象から除いています。
