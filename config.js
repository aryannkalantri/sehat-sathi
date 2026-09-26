/* Sehat Sathi — AI proxy config.
   The Gemini API key lives ONLY as a Cloudflare Worker secret (GEMINI_KEY).
   It must NEVER appear here or anywhere in this frontend. */
window.SEHAT = {
  // Production path: Cloudflare Worker proxy URL (takes precedence when set).
  // The Gemini API key then lives ONLY as a Worker secret, never here.
  proxyUrl: "",

  // Demo path: a Google AI Studio key, locked down in AI Studio to
  // HTTP referrers https://aryannkalantri.github.io/sehat-sathi/*
  // and to the "Generative Language API" only.
  geminiKey: "",
  geminiModel: "gemini-2.5-flash"
};
