# 端末で使う Sumi

Node.js と、このリポジトリの依存パッケージが必要です。`sumi` ディレクトリで次を実行します。初回は `npm ci` で依存パッケージを準備します。

審査向けの自動デモは `npm run demo` で動きます。架空の学校行事を題材に、３製品の動作とエージェントへのアクセス制御を順に実行します。確認操作は自動デモ用に模擬し、ファイル保存や外部送信はしません。署名と証明は実際に計算・検証します。

```sh
node scripts/sumi.mjs write examples/write.json /tmp/sumi-write.json
node scripts/sumi.mjs gate examples/gate.txt /tmp/sumi-gate.json
node scripts/sumi.mjs verify-share /tmp/sumi-gate.json
node scripts/sumi.mjs prove examples/prove.json /tmp/sumi-proof.json
node scripts/sumi.mjs verify /tmp/sumi-proof.json
node scripts/school-agent.mjs examples/gate.txt summarize
node scripts/school-agent.mjs examples/gate.txt summarize --hide-file examples/hidden-words.txt
node scripts/school-agent.mjs examples/gate.txt send
node scripts/school-agent.mjs examples/gate.txt summarize-ai <インストール済みのモデル名>
```

複数校の秘匿集計は、`school-study.mjs` で暗号化ファイルを交換します。以下は２校と２担当者を１台で再現する架空例です。パスフレーズは各入力時に画面へ表示せずに受け取り、コマンド履歴へ書きません。

```sh
node scripts/school-study.mjs split examples/study-school-a.json school-demo-2026 /tmp/sumi-school-a
node scripts/school-study.mjs split examples/study-school-b.json school-demo-2026 /tmp/sumi-school-b
node scripts/school-study.mjs aggregate A /tmp/sumi-total-a.sumi /tmp/sumi-school-a/A.sumi /tmp/sumi-school-b/A.sumi
node scripts/school-study.mjs aggregate B /tmp/sumi-total-b.sumi /tmp/sumi-school-a/B.sumi /tmp/sumi-school-b/B.sumi
node scripts/school-study.mjs combine /tmp/sumi-total-a.sumi /tmp/sumi-total-b.sumi
```

各校は、A担当者用に共通のパスフレーズ、B担当者用に別の共通パスフレーズを使います。実運用では担当者と受け渡し経路を分け、各校のA・B両方を同じ相手に渡さないことが必要です。出力先のフォルダ・ファイルが既にある場合は上書きしません。途中で保存に失敗した場合は、作成済みファイルが残ることがあります。少人数や繰り返し集計による推測、担当者の共謀、悪意ある入力は防げません。

Write は文書の題名・種類・本文用メモから文書を作り、Gate は既存のテキストを加工します。Prove は数値からコミット済み合計の証明を作り、別の端末でも検証できます。証明は個別の入力値を含みませんが、件数・合計・用途は公開します。入力が事実であることや、情報漏洩全体の不在は証明しません。

保存前に画面に表示された内容と保存先を確認して `yes` を入力します。Write と Gate の共有ファイルには署名が付き、`verify-share` で改変を確認できます。送信者の確認には、別経路で入手した鍵指紋を第２引数に指定してください。鍵は保存のたびに生成します。出力先が既にある場合、上書きはしません。`privateMemo` は Write の本文生成に使いません。加工は検出漏れの可能性があるため、表示された内容の確認が必要です。

３製品は `sumi-egress-v1` の同じ出力認可を使います。学校向け点検の共通５項目は `node scripts/school-audit.mjs guide` で、理由を読みながら点検できます。設定案は `node scripts/school-audit.mjs draft` で表示します。点検は出力認可とは別の自己申告モデルで、実環境を自動で調べたり設定を適用したりはしません。

`school-agent.mjs` は指定したテキストからメールアドレスなどの候補を自動で加工し、エージェントに渡す全文を表示します。`summarize` は固定処理で先頭３文を抽出します。`summarize-ai` は確認を受けた加工版をローカルの Ollama に送り、AIによる要約案を表示します。Ollama の起動とモデルの準備は別途必要です。加工の検出漏れやAIの誤りがあり得るため、加工版と要約案を人が確認してください。`send` は拒否し、通信処理はありません。AIを使う場合、Ollamaやモデル自体の外部通信はこのプログラムでは制御できません。

自動検出に加えて隠したい語句がある場合は、１行に１語ずつ書いたテキストファイルを `--hide-file` で指定できます。最大100語、１語100文字以内です。語句一覧そのものにも機密が含まれ得るため、保存先の管理が必要です。

エージェント向け文書をアプリ内で差し替える場合も、同じ語句を使って再加工し、確認をやり直します。加工結果の検出漏れは、差し替え後も全文を確認してください。

この端末版は、実際のファイルを扱える試作です。ログイン、複数利用者の権限管理、組織の設定を自動収集・適用する機能、OSや他のアプリの操作を強制する機能はありません。実際の個人情報の運用に投入する前に、設計と環境の検証が必要です。
