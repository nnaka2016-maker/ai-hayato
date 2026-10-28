// Claude 中継サーバー（APIキーをブラウザに出さないため）
// 環境変数: ANTHROPIC_API_KEY（必須）, APP_PASSCODE（合言葉・強く推奨）, CLAUDE_MODEL（任意）, WEB_SEARCH（off で検索を止める）, WEB_SEARCH_MAX（1回の返答での検索回数上限。既定3）

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
- 天気・ニュース・株価・為替・スポーツ結果・店や施設の営業時間・制度や法律の最新情報・人物や会社の最近の動きなど、あなたの知識だけでは古いかもしれない情報や、調べものを頼まれたときは web_search で調べてから答える。数字（株価・為替など）は「何時時点」かも添える。調べた内容は要点だけを短く話し、「〇〇によると」のように情報源を一言添える。URLは読み上げない。
- 雑談や記憶・売上データで答えられることには検索を使わない。

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

  // Web検索（Anthropic側で実行されるサーバーツール。1,000回あたり$10）
  const tools = process.env.WEB_SEARCH === "off" ? [] : [{
    type: "web_search_20260209",
    name: "web_search",
    max_uses: Math.min(Math.max(Number(process.env.WEB_SEARCH_MAX) || 3, 1), 10), // 使いすぎ防止
    user_location: { type: "approximate", country: "JP", timezone: "Asia/Tokyo" },
  }];

  // 検索が長引くと stop_reason が pause_turn になるので、続きを数回まで再開する
  const convo = [...messages];
  let data;
  const searches = [];
  const sources = new Map(); // url -> title
  for (let i = 0; i < 3; i++) {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": process.env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: MODEL, max_tokens: 4096, system, messages: convo,
        output_config: { effort: "low" }, // 会話は速さ優先
        ...(tools.length && { tools }),
      }),
    });
    data = await res.json();
    if (!res.ok) return json({ error: data?.error?.message || "Claude API error" }, res.status);
    for (const c of data.content || []) {
      if (c.type === "server_tool_use" && c.name === "web_search" && c.input?.query) searches.push(c.input.query);
      // 返答の中で実際に引用された出典を集める
      if (c.type === "text") for (const cit of c.citations || []) if (cit.url && !sources.has(cit.url)) sources.set(cit.url, cit.title || cit.url);
    }
    if (data.stop_reason !== "pause_turn") break;
    convo.push({ role: "assistant", content: data.content });
  }

  const blocks = data.content || [];
  const text = blocks.filter((c) => c.type === "text").map((c) => c.text).join("").trim();
  return json({ text: text || "申し訳ありません、うまくまとめられませんでした。もう一度お願いします。", searches, sources: [...sources].slice(0, 5).map(([url, title]) => ({ url, title })) });
};

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), { status, headers: { "content-type": "application/json" } });
}
