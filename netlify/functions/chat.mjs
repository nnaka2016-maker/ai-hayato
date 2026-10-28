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

  // 返答はストリーミングで返す（1行1イベントのJSON）。画面は届いた文から表示・読み上げを始める
  //   {"t":"text","v":"..."} / {"t":"search","q":"..."} / {"t":"sources","v":[...]} / {"t":"error","v":"..."} / {"t":"done"}
  const enc = new TextEncoder();
  const stream = new ReadableStream({
    async start(ctrl) {
      const send = (o) => ctrl.enqueue(enc.encode(JSON.stringify(o) + "\n"));
      const sources = new Map(); // url -> title
      const convo = [...messages];
      try {
        // 検索が長引くと stop_reason が pause_turn になるので、続きを数回まで再開する
        for (let i = 0; i < 3; i++) {
          const { blocks, stopReason } = await callClaude(system, convo, tools, send, sources);
          if (stopReason !== "pause_turn") break;
          convo.push({ role: "assistant", content: blocks });
        }
        if (sources.size) send({ t: "sources", v: [...sources].slice(0, 5).map(([url, title]) => ({ url, title })) });
      } catch (e) {
        send({ t: "error", v: e.message });
      }
      send({ t: "done" });
      ctrl.close();
    },
  });
  return new Response(stream, { headers: { "content-type": "application/x-ndjson", "cache-control": "no-cache" } });
};

async function callClaude(system, messages, tools, send, sources) {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": process.env.ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: MODEL, max_tokens: 2048, system, messages, stream: true,
      output_config: { effort: "low" }, // 会話は速さ優先
      // Sonnet 5.5 は between_tools で「考える時間」を省いて最初の一言を早くする
      ...(MODEL === "claude-sonnet-5-5" && { thinking: { type: "between_tools" } }),
      ...(tools.length && { tools }),
    }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.error?.message || `Claude API error (${res.status})`);
  }

  // SSE を読みながら、pause_turn で送り返せるよう content ブロックも組み立てる
  const blocks = [];
  const partial = {};
  let stopReason = null;
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    let nl;
    while ((nl = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, nl).trim();
      buf = buf.slice(nl + 1);
      if (!line.startsWith("data:")) continue;
      const ev = JSON.parse(line.slice(5));
      if (ev.type === "content_block_start") {
        blocks[ev.index] = structuredClone(ev.content_block);
        partial[ev.index] = "";
      } else if (ev.type === "content_block_delta") {
        const b = blocks[ev.index], d = ev.delta;
        if (d.type === "text_delta") { b.text += d.text; send({ t: "text", v: d.text }); }
        else if (d.type === "input_json_delta") partial[ev.index] += d.partial_json;
        else if (d.type === "citations_delta") {
          (b.citations ||= []).push(d.citation);
          if (d.citation.url && !sources.has(d.citation.url)) sources.set(d.citation.url, d.citation.title || d.citation.url);
        }
        else if (d.type === "thinking_delta") b.thinking += d.thinking;
        else if (d.type === "signature_delta") b.signature = d.signature;
      } else if (ev.type === "content_block_stop") {
        const b = blocks[ev.index];
        if (partial[ev.index]) { try { b.input = JSON.parse(partial[ev.index]); } catch {} }
        if (b.type === "server_tool_use" && b.name === "web_search" && b.input?.query) send({ t: "search", q: b.input.query });
      } else if (ev.type === "message_delta") {
        stopReason = ev.delta?.stop_reason ?? stopReason;
      } else if (ev.type === "error") {
        throw new Error(ev.error?.message || "Claude API error");
      }
    }
  }
  return { blocks: blocks.filter(Boolean), stopReason };
}

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), { status, headers: { "content-type": "application/json" } });
}
