// Fish Audio 読み上げ中継
// 環境変数: FISH_AUDIO_API_KEY（必須）, FISH_AUDIO_REFERENCE_ID（使う声のID）

export default async (req) => {
  if (req.method !== "POST") return new Response("Method Not Allowed", { status: 405 });
  if (process.env.APP_PASSCODE && req.headers.get("x-hayato-pass") !== process.env.APP_PASSCODE) return new Response("unauthorized", { status: 401 });
  const key = process.env.FISH_AUDIO_API_KEY;
  if (!key) return new Response("FISH_AUDIO_API_KEY not set", { status: 501 });

  const { text } = await req.json().catch(() => ({}));
  if (!text) return new Response("text required", { status: 400 });

  const res = await fetch("https://api.fish.audio/v1/tts", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
    body: JSON.stringify({
      text: String(text).slice(0, 1000),
      reference_id: process.env.FISH_AUDIO_REFERENCE_ID,
      format: "mp3",
    }),
  });

  if (!res.ok) return new Response(await res.text(), { status: res.status });
  return new Response(res.body, { headers: { "content-type": "audio/mpeg" } });
};
