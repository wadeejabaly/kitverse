import "server-only";
import { env } from "./env";

/**
 * Voice note -> text. Provider is chosen by which key is set (to be decided by testing on the
 * owner's 63 real voice notes). No key = null, and the bot hands the voice note to the owner.
 */
export async function transcribe(audio: Buffer, mime = "audio/mp4"): Promise<{ text: string; provider: string } | null> {
  const e = env();
  if (e.ELEVENLABS_API_KEY) {
    const form = new FormData();
    form.append("file", new Blob([new Uint8Array(audio)], { type: mime }), "voice.mp4");
    form.append("model_id", process.env.ELEVENLABS_STT_MODEL ?? "scribe_v1");
    const res = await fetch("https://api.elevenlabs.io/v1/speech-to-text", { method: "POST", headers: { "xi-api-key": e.ELEVENLABS_API_KEY }, body: form });
    if (res.ok) {
      const j = await res.json();
      if (j.text?.trim()) return { text: j.text.trim(), provider: "elevenlabs" };
    }
  }
  if (e.OPENAI_API_KEY) {
    const form = new FormData();
    form.append("file", new Blob([new Uint8Array(audio)], { type: mime }), "voice.mp4");
    form.append("model", process.env.OPENAI_STT_MODEL ?? "gpt-4o-transcribe");
    const res = await fetch("https://api.openai.com/v1/audio/transcriptions", { method: "POST", headers: { Authorization: `Bearer ${e.OPENAI_API_KEY}` }, body: form });
    if (res.ok) {
      const j = await res.json();
      if (j.text?.trim()) return { text: j.text.trim(), provider: "openai" };
    }
  }
  return null;
}
