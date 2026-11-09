# 参考資料と実装・検証の対応

Sumiの主張は、**必要な情報だけを渡すために、条件を明示し、確認できる根拠を残す**ことです。文書証明と、Write / Gate / Proveの認可・情報流は別の仕組みです。この表は参考資料からの着想を示すもので、論文の再現、元ツールの移植、同じ安全性の達成を意味しません。

## 参考資料と差分

| 参考 | 参考にした考え方 | Sumiで確認できる箇所 | 同じではない点 |
| --- | --- | --- | --- |
| [Nyxis](https://github.com/NyxFoundation/nyxis) | 認可条件と処理を分け、保証する性質と前提を明示する | [認可判定](src/authorization.js)、[情報流](src/information-flow.js)、[Leanモデル](formal/Policy.lean) | SumiはNyxisの型付きハンドラ・Cedar・認証・DBを移植していない。JavaScript全体が同じ定理で保証されるわけではない |
| [SPECA](https://github.com/NyxFoundation/speca) | 仕様から、確認すべき性質と実装の対応を追う | 下の手作業の性質一覧、[エージェント判定](src/agent-access.js)、[Leanモデル](formal/Agent.lean) | SPECAのエージェント・監査パイプラインは実行していない。この一覧は自動監査でも網羅的監査でもない |


## 確認する性質と根拠

| 性質 | 根拠 | 未確認・前提 |
| --- | --- | --- |
| 文書の証明は、公開した指定語の完全一致を対象にする | [回路の全位置検査](noir/document_absence_v2/src/main.nr)と[比較実験](EVALUATION.md#テスト例と文書全体の比較) | 人が選ばなかった語、表記ゆれ、画像、文書外の漏洩は対象外 |
| 公開条件を両側で同じ偽の値に書き換えても、元の証明を受け入れない | [ブラウザの改ざん試験](experiments/browser-document-proof/browser.js)と[実行方法](experiments/browser-document-proof/README.md) | 試験した変更例の結果。回路、ライブラリ、ホストの真正性や暗号プロトコル全体の安全性の証明ではない |
| 確認した公開版以外を平文の出力に使わない | [Leanモデル](formal/Policy.lean)、[有限条件のテスト](tests/information-flow.test.mjs) | 公開する値の分類が正しいとは証明しない。JS・ブラウザ・OS全体の非干渉証明ではない |
| エージェントへの実行許可には５条件が必要 | [判定コード](src/agent-access.js)、[モデル](formal/Agent.lean) | ５条件が現実の本人・権限・文書を正しく表す保証や、実行環境の隔離はない |

安全性の各境界、観測され得る情報と信頼する前提は[保証範囲](ASSURANCE.md)を参照してください。学校現場での必要性と操作の分かりやすさについては、まだ利用者の聞き取りを行っていません。
