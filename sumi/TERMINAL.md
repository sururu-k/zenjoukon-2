# 端末で使う Sumi

Node.js と、このリポジトリの依存パッケージが必要です。`sumi` ディレクトリで次を実行します。初回は `npm ci` で依存パッケージを準備します。

審査向けの自動デモは `npm run demo` で動きます。架空の学校行事を題材に、３製品の動作とエージェントへのアクセス制御を順に実行します。確認操作は自動デモ用に模擬し、ファイル保存や外部送信はしません。署名と証明は実際に計算・検証します。

```sh
node scripts/sumi.mjs write examples/write.json /tmp/sumi-write.json
node scripts/sumi.mjs gate examples/gate.txt /tmp/sumi-gate.json
node scripts/sumi.mjs verify-share /tmp/sumi-gate.json
node scripts/sumi.mjs prove examples/prove.json /tmp/sumi-proof.json
node scripts/sumi.mjs verify /tmp/sumi-proof.json
```

Write は文書の題名・種類・本文用メモから文書を作り、Gate は既存のテキストを加工します。Prove は数値からコミット済み合計の証明を作り、別の端末でも検証できます。証明は個別の入力値を含みませんが、件数・合計・用途は公開します。入力が事実であることや、情報漏洩全体の不在は証明しません。

保存前に画面に表示された内容と保存先を確認して `yes` を入力します。Write と Gate の共有ファイルには署名が付き、`verify-share` で改変を確認できます。送信者の確認には、別経路で入手した鍵指紋を第２引数に指定してください。鍵は保存のたびに生成します。出力先が既にある場合、上書きはしません。`privateMemo` は Write の本文生成に使いません。加工は検出漏れの可能性があるため、表示された内容の確認が必要です。

３製品は `sumi-egress-v1` の同じ出力認可を使います。学校向け点検の共通５項目は `node scripts/school-audit.mjs guide` で、理由を読みながら点検できます。設定案は `node scripts/school-audit.mjs draft` で表示します。点検は出力認可とは別の自己申告モデルで、実環境を自動で調べたり設定を適用したりはしません。

この端末版は、実際のファイルを扱える試作です。ログイン、複数利用者の権限管理、組織の設定を自動収集・適用する機能、OSや他のアプリの操作を強制する機能はありません。実際の個人情報の運用に投入する前に、設計と環境の検証が必要です。
