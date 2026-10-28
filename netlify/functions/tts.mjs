// Fish Audio 読み上げ中継
// 環境変数: FISH_AUDIO_API_KEY（必須）, FISH_AUDIO_REFERENCE_ID（使う声のID）, FISH_AUDIO_MODEL（任意。既定 s1）

export default async (req) => {
  if (req.method !== "POST") return failEarly(405, "Method Not Allowed");
  if (process.env.APP_PASSCODE && req.headers.get("x-hayato-pass") !== process.env.APP_PASSCODE) return failEarly(401, "合言葉が違います");

  const key = (process.env.FISH_AUDIO_API_KEY || "").trim();
  const diag = { hasKey: !!(process.env.FISH_AUDIO_API_KEY || "").trim(), referenceId: (process.env.FISH_AUDIO_REFERENCE_ID || "").trim().slice(0, 40) };
  const fail = (status, error) => new Response(JSON.stringify({ error, diag }), { status, headers: { "content-type": "application/json" } });
  if (!key) return fail(501, "FISH_AUDIO_API_KEY が読めません（Netlifyの環境変数名・Scope・再デプロイを確認）");
  // 声のページURLをそのまま貼った場合も、/m/ の後ろのIDだけを取り出す
  const raw = (process.env.FISH_AUDIO_REFERENCE_ID || "").trim();
  const referenceId = (raw.match(/\/m\/([0-9a-zA-Z]+)/) || [])[1] || raw.replace(/[^0-9a-zA-Z]/g, "");
  if (!referenceId) return fail(501, "FISH_AUDIO_REFERENCE_ID が読めません（Netlifyの環境変数名・Scope・再デプロイを確認）");

  const { text } = await req.json().catch(() => ({}));
  if (!text) return fail(400, "text required");

  let res;
  try {
    res = await fetch("https://api.fish.audio/v1/tts", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${key}`,
        model: process.env.FISH_AUDIO_MODEL || "s1",
      },
      body: JSON.stringify({ text: String(text).slice(0, 1000), reference_id: referenceId, format: "mp3" }),
    });
  } catch (e) {
    return fail(502, "Fish Audio に接続できません: " + e.message);
  }

  if (!res.ok) {
    const detail = (await res.text()).slice(0, 300);
    const hint = {
      401: "APIキーが無効です。Fish Audio でキーを作り直して FISH_AUDIO_API_KEY に貼り直してください",
      402: "Fish Audio のAPIクレジットが不足しています（API用の残高を購入してください）",
      403: "このAPIキーでは使えません（API用の残高か権限を確認）",
      404: "声のIDが見つかりません。FISH_AUDIO_REFERENCE_ID を確認してください",
      422: "リクエスト内容が不正です（声のIDの形式などを確認）",
      429: "回数制限に達しました。少し待ってから試してください",
    }[res.status] || "Fish Audio でエラーが起きました";
    return fail(502, `${hint}（Fish Audio ${res.status}: ${detail}）`);
  }

  const audio = await res.arrayBuffer();
  if (!audio.byteLength) return fail(502, "Fish Audio から空の音声が返りました");
  return new Response(audio, { headers: { "content-type": "audio/mpeg" } });
};

function failEarly(status, error) {
  return new Response(JSON.stringify({ error }), { status, headers: { "content-type": "application/json" } });
}
