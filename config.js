/* ============================================================
   BOMBON ORDERS BOARD — settings
   ============================================================ */
const CONFIG = {
  // The Google Apps Script "Web app URL" (ends in /exec) — the same one used in the menu's config.js.
  apiUrl: "",

  refreshSeconds: 6,     // how often the board checks for new orders
  lateMinutes: 10,       // a New order older than this is flagged
  currency: "₹",
  menuUrl: "https://hembromrohanjohn-bot.github.io/bombon-menu/",
};
