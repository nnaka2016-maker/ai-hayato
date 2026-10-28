# AI HAYATO

冷静・有能・プライドあり、忠実だけど従順ではない「先回り型」の音声AIアシスタント。

## 入っている機能（PDFのSTEP対応）
- STEP1 人格: `netlify/functions/chat.mjs` の PERSONA
- STEP2 会話: Netlify Functions 経由で Claude と会話（APIキーは画面に出ない）
- STEP3 声: Fish Audio で読み上げ（未設定ならブラウザ標準の音声で代用）
- STEP4 音声認識: 🎤ボタン、話し終わると自動送信、常時会話モード（Chrome推奨）
- STEP5 専用画面: `assets/character/` の4本の動画で待機⇔検索を切替（S/Eキー、返答待ちの間は自動で検索中）。動画が無い間は光るコアを表示
- STEP6 記憶: 覚えるべき情報を自動で保存（ブラウザに保存。右上「記憶」で確認・削除）
- STEP7 地図: 場所の話題で Google マップを表示（APIキー不要の埋め込み）
- STEP8 売上: 右上「売上CSV」から弥生会計オンラインの仕訳CSV（弥生インポート形式／見出し付きCSVどちらも可、Shift_JIS対応）を読み込み、勘定科目「売上高」を月別に集計してハヤトに渡す。その日はじめて開いたときはハヤトから先回りで報告
- 外部情報: 天気・ニュース・株価・為替・調べもの全般など最新情報が必要なときは Claude の Web検索で調べて答え、出典を表示（1,000回あたり$10。`WEB_SEARCH=off` で停止）
- STEP8 カレンダー・Chatwork・タスク: これから

## 動画ファイル（任意）
`assets/character/` に次の4本を置くと背景がキャラクター動画になります。
- idle-loop.mp4 / search-start.mp4 / search-loop.mp4 / return-transition.mp4

## Netlify に設定する環境変数
| 名前 | 内容 |
|---|---|
| ANTHROPIC_API_KEY | Claude の APIキー（必須） |
| APP_PASSCODE | 合言葉（強く推奨）。設定すると、合言葉を知っている人だけが使える |
| CLAUDE_MODEL | 任意。既定は claude-sonnet-5-5 |
| WEB_SEARCH | 任意。`off` にするとWeb検索を使わない |
| WEB_SEARCH_MAX | 任意。1回の返答で検索する回数の上限（既定3、最大10） |
| FISH_AUDIO_API_KEY | Fish Audio の APIキー（任意） |
| FISH_AUDIO_REFERENCE_ID | 使う声のID（任意。声のページURLをそのまま貼ってもOK） |
| FISH_AUDIO_MODEL | 任意。Fish Audio のモデル（既定 s1） |

## ローカルで試す
```
npm i -g netlify-cli
netlify dev
```
