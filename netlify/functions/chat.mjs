// Claude 中継サーバー（APIキーをブラウザに出さないため）
// 環境変数: ANTHROPIC_API_KEY（必須）, APP_PASSCODE（合言葉・強く推奨）, CLAUDE_MODEL（任意）

const MODEL = process.env.CLAUDE_MODEL || "claude-sonnet-5-5";

const PERSONA = `あなたは「ハヤト」。ユーザー専属の音声AIアシスタントです。

# 人格
- 冷静で有能。感情的にならず、要点から先に話す。
- プライドがあり、仕事の質には妥協しない。曖昧な指示には確認を入れる。
- 忠実だが従順ではない。より良い案があれば率直に意見を述べる。ただし最終判断は必ずユーザーの意思を尊重し、決まったら全力で実行する。
- 先回りして動く。聞かれたことに答えるだけでなく、次に必要になりそうなこと・リスク・準備を一言添える。
- 口調は丁寧だが簡潔。「承知しました」「一点だけ進言します」のような落ち着いた言い回し。ユーザーのことは「あなた」と呼ぶ。

# 話し方のルール
- 返答は音声で読み上げられるので、短く（基本は3文以内）。箇条書き・記号・絵文字・Markdownは使わない。
- 分からないことは推測で断定せず、そう伝える。

# 特殊タグ（必要なときだけ、返答の最後に付ける。タグは読み上げられない）
- ユーザーについて今後も覚えておくべき情報（名前、好み、予定、仕事の状況、大切な人など）が会話に出たら:
  [[MEMO: 覚える内容を1文で]]
- 特定の場所・店・地名の話題になり、地図があると役立つとき:
  [[MAP: 地図で検索する場所名]]`;

export default async (req) => {
  if (req.method !== "POST") return new Response("Method Not Allowed", { status: 405 });
  if (process.env.APP_PASSCODE && req.headers.get("x-hayato-pass") !== process.env.APP_PASSCODE) return json({ error: "合言葉が違います", auth: true }, 401);
  if (!process.env.ANTHROPIC_API_KEY) return json({ error: "ANTHROPIC_API_KEY が設定されていません" }, 500);

  let body;
  try { body = await req.json(); } catch { return json({ error: "invalid json" }, 400); }

  const messages = Array.isArray(body.messages) ? body.messages.slice(-30) : [];
  const memories = Array.isArray(body.memories) ? body.memories.slice(-100) : [];
  const now = new Date().toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" });

  let system = `${PERSONA}\n\n# 現在日時\n${now}`;
  if (typeof body.sales === "string" && body.sales) system += `\n\n# 売上データ\n${body.sales.slice(0, 4000)}\n売上の話題や報告の際は、前月比・前年同月比などを計算し、気になる変化は聞かれなくても一言添えること。`;
  if (memories.length) system += `\n\n# あなたが覚えているユーザーの情報\n${memories.map((m) => `- ${m}`).join("\n")}`;

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": process.env.ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({ model: MODEL, max_tokens: 1024, system, messages }),
  });

  const data = await res.json();
  if (!res.ok) return json({ error: data?.error?.message || "Claude API error" }, res.status);

  const text = (data.content || []).filter((c) => c.type === "text").map((c) => c.text).join("");
  return json({ text });
};

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), { status, headers: { "content-type": "application/json" } });
}
