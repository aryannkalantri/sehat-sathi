/* Sehat Sathi — AI proxy config.
   The Gemini API key lives ONLY as a Cloudflare Worker secret (GEMINI_KEY).
   It must NEVER appear here or anywhere in this frontend. */
window.SEHAT = {
  // Filled in after the worker is deployed, e.g.
  // "https://sehat-sathi-proxy.<your-subdomain>.workers.dev"
  proxyUrl: ""
};
