# 端末で使う Sumi

Node.js と、このリポジトリの依存パッケージが必要です。`sumi` ディレクトリで次を実行します。初回は `npm ci` で依存パッケージを準備します。

審査向けの自動デモは `npm run demo` で動きます。見えないアンケートと架空の学校行事を題材に、３製品の動作とエージェントへのアクセス制御を順に実行します。確認操作は自動デモ用に模擬し、ファイル保存や外部送信はしません。署名と証明は実際に計算・検証します。アンケートの模擬は１端末で両方のシェアを保持するため、実際の回答の収集には使えません。詳細は `SURVEY.md` を参照してください。

`npm run demo:signed-policy` は、２つの一時鍵で架空の共通設定に署名し、別の信頼鍵設定に対して検証したうえで点検とエージェントの加工へ渡す実験です。ルール上の判定記録にも署名します。設定や署名を改変すると拒否しますが、判定記録は操作が実行された事実の証明ではありません。鍵の本人確認・配布・失効や、古い有効な設定の再利用防止は行わず、複数署名は閾値暗号ではありません。

`npm run demo:bridge` は、一般向けと学校向けの架空データで、合計のゼロ知識証明と２鍵の署名を組み合わせます。検証者が発行した用途・依頼ID・受取先と別途指定した信頼鍵を使い、合計の改変、別の受取先への差し替え、同一セッション内の再送を拒否します。署名者の身元、入力の真実性、各値の範囲は証明しません。再送拒否はメモリ内に限り、再起動や別端末をまたぐ管理はありません。

`npm run demo:survey-bridge` は、二択回答の ZK 証明と２担当者の秘密分散集計に、それぞれ別鍵の ECDSA 署名を接続する実験です。一般向けと学校向けの架空例をローカル HTTP で試します。同一プロセス内の模擬のため、実回答の秘密や担当者の独立性は保証しません。署名鍵と集計IDは検証側が別に信頼する必要があり、提出の網羅性・一人一票・集計結果の差分からの推測防止は含みません。

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

各校は、A担当者用に共通のパスフレーズ、B担当者用に別の共通パスフレーズを使います。実運用では担当者と受け渡し経路を分け、各校のA・B両方を同じ相手に渡さないことが必要です。異なる提出の組数を数えますが、提出元の学校数や身元は認証しません。出力先のフォルダ・ファイルが既にある場合は上書きしません。途中で保存に失敗した場合は、作成済みファイルが残ることがあります。少人数や繰り返し集計による推測、担当者の共謀、悪意ある入力は防げません。

見えないアンケートの端末実験では、各回答者が `node scripts/school-study.mjs survey-vote <共通の集計ID> <新規フォルダ>` を実行します。生成されたA・Bのファイルを別々の担当者に渡し、それぞれ `survey-aggregate <A|B> <集計ID> <出力> <入力1> <入力2> <入力3> [...]` で３件以上を合算します。最後に `survey-result <A合算> <B合算>` で件数を表示します。回答もパスフレーズも端末入力中は表示しません。回答者は両パスフレーズを知るため、他人の両シェアが集まる環境では個別回答を復元できてしまいます。これは架空データでの実験用です。

Write は文書の題名・種類・本文用メモから文書を作り、Gate は既存のテキストを加工します。Prove は数値からコミット済み合計の証明を作り、別の端末でも検証できます。証明は個別の入力値を含みませんが、件数・合計・用途は公開します。入力が事実であることや、情報漏洩全体の不在は証明しません。

保存前に画面に表示された内容と保存先を確認して `yes` を入力します。Write と Gate の共有ファイルには署名が付き、`verify-share` で改変を確認できます。送信者の確認には、別経路で入手した鍵指紋を第２引数に指定してください。鍵は保存のたびに生成します。出力先が既にある場合、上書きはしません。`privateMemo` は Write の本文生成に使いません。加工は検出漏れの可能性があるため、表示された内容の確認が必要です。

３製品は `sumi-egress-v1` の同じ出力認可を使います。学校向け点検の共通５項目は `node scripts/school-audit.mjs guide` で、理由を読みながら点検できます。設定案は `node scripts/school-audit.mjs draft` で表示します。点検は出力認可とは別の自己申告モデルで、実環境を自動で調べたり設定を適用したりはしません。

`school-agent.mjs` は指定したテキストからメールアドレスなどの候補を自動で加工し、エージェントに渡す全文を表示します。`summarize` は固定処理で先頭３文を抽出します。`summarize-ai` は確認を受けた加工版をローカルの Ollama に送り、AIによる要約案を表示します。Ollama の起動とモデルの準備は別途必要です。加工の検出漏れやAIの誤りがあり得るため、加工版と要約案を人が確認してください。`send` は拒否し、通信処理はありません。AIを使う場合、Ollamaやモデル自体の外部通信はこのプログラムでは制御できません。

自動検出に加えて隠したい語句がある場合は、１行に１語ずつ書いたテキストファイルを `--hide-file` で指定できます。最大100語、１語100文字以内です。語句一覧そのものにも機密が含まれ得るため、保存先の管理が必要です。

学校別の共通設定を使う場合は、`node scripts/school-agent.mjs examples/gate.txt read --policy <設定.json>` と指定します。文書証明・学校点検と同じ形式のJSONを検査し、その禁止語をエージェントへ渡す前に加工します。`--hide-file` と併用できます。設定の発行元は自動認証せず、検出・指定漏れもあるため、加工版の全文確認が必要です。

架空学校の設定ファイルは `node scripts/school-policy-create.mjs <新しい設定ファイル.json>` で作成できます。学校名と公開してよい禁止語を入力し、コピーされる共有範囲と点検項目を確認します。既存のファイルは上書きしません。設定は署名・認証されず、実際の学校データ用ではありません。

加工後の文書に指定語が完全一致で残っている場合は、エージェントへの引き渡しを拒否します。例えば指定語が「非公開」の場合、置換後の `[非公開]` にも一致するため拒否されます。この確認は指定されなかった情報や表記ゆれを検出するものではありません。

エージェント向け文書をアプリ内で差し替える場合も、同じ語句を使って再加工し、確認をやり直します。加工結果の検出漏れは、差し替え後も全文を確認してください。

この端末版は、実際のファイルを扱える試作です。ログイン、複数利用者の権限管理、組織の設定を自動収集・適用する機能、OSや他のアプリの操作を強制する機能はありません。実際の個人情報の運用に投入する前に、設計と環境の検証が必要です。
