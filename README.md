# Bombon — orders board

Live: **https://hembromrohanjohn-bot.github.io/bombon-orders/** (staff only, locked with the staff key)

Where every table order arrives. Orders placed from the table menu
(https://hembromrohanjohn-bot.github.io/bombon-menu/?table=N) show up here within seconds.

- **New → Preparing → Served** columns (tabs on a phone); oldest orders first, flagged red after 10 minutes
- Chime, flashing tab title and screen-reader announcement for each new order. Tap **Sound on** once per visit, since browsers
  block sound until you tap. That also keeps the tablet screen awake.
- Today's order count, revenue (incl. service) and open orders; cancelled orders are excluded
- **Lock** removes the staff key from this device

## Setup
1. Set up the orders backend: see "Orders backend (Google Sheet)" in the `bombon-menu` repo's README.
2. Put the Web app URL (ends in `/exec`) into `apiUrl` in `config.js`.
3. Open the board and enter the staff key from the *Settings* tab of the orders sheet.

## Files
- `index.html` — page
- `board.js` — loads orders every `refreshSeconds`, status buttons, alerts
- `board.css` — styles (Bombon palette)
- `config.js` — `apiUrl`, refresh interval, "late" threshold

Plain HTML/CSS/JS, no build step.
