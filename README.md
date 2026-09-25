# Bombon — orders board

Live: **https://hembromrohanjohn-bot.github.io/bombon-orders/** (staff only: sign in as `staff`)

Where every table order arrives. Orders placed from the table menu
(https://hembromrohanjohn-bot.github.io/bombon-menu/?table=N) show up here instantly (Firebase, live).

- **New → Preparing → Served** columns (tabs on a phone); oldest orders first, flagged red after 10 minutes
- Chime, flashing tab title and screen-reader announcement for each new order. Tap **Sound on** once per visit, since browsers
  block sound until you tap. That also keeps the tablet screen awake.
- Today's order count, revenue (incl. service) and open orders; cancelled orders are excluded
- **Sign out** logs this device out

## Setup
- Firebase project **bombon-orders-ucwmp**; orders at `restaurants/bombon/orders` in Firestore.
- Security rules: `firebase/firestore.rules`. Only `staff@bombon.staff` can list and update orders.
- Staff sign in with username `staff` and the password set in Firebase console → Authentication → Users.

## Files
- `index.html` — page
- `board.js` — staff sign-in, live orders from Firestore, status buttons, alerts
- `board.css` — styles (Bombon palette)
- `config.js` — public Firebase settings, staff username domain, "late" threshold
- `firebase/firestore.rules` — who can create, read and update orders

Plain HTML/CSS/JS, no build step.
