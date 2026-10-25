/** Models the owner can pick in admin Settings (bot_settings.ai_model). Measured on a full 13-reply sale chat. */
export const BOT_MODELS = [
  { id: "claude-opus-5-5", title: "Best - Claude Opus 5.5", text: "Sounds most like you. About 1.4₪ per full sale chat." },
  { id: "claude-sonnet-5-5", title: "Balanced - Claude Sonnet 5.5", text: "About half the cost (~0.7₪ per sale chat) and faster replies." },
  { id: "claude-haiku-5-5", title: "Cheapest - Claude Haiku 5.5", text: "About 0.05₪ per sale chat, fastest. May follow your style and the rules less closely." },
] as const;

export type BotModel = (typeof BOT_MODELS)[number]["id"];
export const isBotModel = (m: unknown): m is BotModel => BOT_MODELS.some((x) => x.id === m);
