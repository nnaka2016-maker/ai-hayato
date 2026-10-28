# AIハヤトを Netlify で公開する手順

所要時間は15分ほどです。お金がかかるのは Claude（と Fish Audio）の利用料だけで、Netlify は無料プランで足ります。

## 1. Claude の APIキーを用意する
1. https://console.anthropic.com にログイン（無ければ登録）
2. 「Billing」でクレジットを購入（数ドルから可。これが無いとハヤトが返事をしません）
3. 「API Keys」→「Create Key」で作成し、表示された `sk-ant-...` をメモ帳などに控える（画面を閉じると二度と見られません）

## 2. Netlify にリポジトリをつなぐ
1. https://app.netlify.com を開き、「Sign up with GitHub」で GitHub アカウントのまま登録
2. 「Add new project（Add new site）」→「Import an existing project」→「GitHub」
3. GitHub の許可画面が出たら許可し、一覧から `ai-hayato` を選ぶ
4. 設定画面は何も変えずに（`netlify.toml` が自動で読まれます）「Deploy」を押す

## 3. 環境変数（秘密のキー）を登録する
1. できたサイトの画面で「Project configuration（Site configuration）」→「Environment variables」→「Add a variable」
2. 次を1つずつ登録する

| Key | Value |
|---|---|
| `ANTHROPIC_API_KEY` | 手順1で控えた `sk-ant-...` |
| `APP_PASSCODE` | 好きな合言葉（例: 長めの英数字）。**必ず設定**してください。無いとURLを知った人が誰でもあなたの料金で使えてしまいます |
| `FISH_AUDIO_API_KEY` | （声を付けるなら）Fish Audio の APIキー |
| `FISH_AUDIO_REFERENCE_ID` | （声を付けるなら）使いたい声のID。Fish Audio の声のページURL末尾の英数字 |

## 4. 反映させる
1. 「Deploys」→「Trigger deploy」→「Deploy site」（環境変数は再デプロイ後に効きます）
2. 「Published」になったら、上に出ている `https://〇〇.netlify.app` を開く

## 5. 使ってみる
1. **Chrome** で開く（音声入力は Chrome が確実です。スマホは Android の Chrome、iPhone は Safari でも概ね動きます）
2. 最初にメッセージを送ると合言葉を聞かれるので、`APP_PASSCODE` と同じものを入力し、もう一度送る
3. 🎤 を押すとマイクの許可を聞かれるので「許可」
4. 右上「売上CSV」から弥生会計オンラインの仕訳帳CSVを読み込むと、売上も踏まえて話します

## うまくいかないとき
- 「通信エラー: ANTHROPIC_API_KEY が設定されていません」→ 手順3と4をやり直す
- 「credit balance is too low」→ Anthropic Console でクレジットを購入
- サイト名を変えたい →「Project configuration」→「Change project name」

## キャラクター動画を入れたいとき
`assets/character/` に `idle-loop.mp4` などの4本を入れて GitHub に push すれば、自動で再デプロイされて反映されます。
