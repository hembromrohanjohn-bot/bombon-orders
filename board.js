/* ============================================================
   Bombon orders board — staff sign in (Firebase Auth), orders stream
   in live from Firestore, and staff move them along:
   New → Preparing → Served (or Cancelled).
   ============================================================ */
const SDK = "https://www.gstatic.com/firebasejs/12.19.0/";
const { initializeApp } = await import(SDK + "firebase-app.js");
const { getAuth, onAuthStateChanged, signInWithEmailAndPassword, signOut } = await import(SDK + "firebase-auth.js");
const { getFirestore, collection, query, where, orderBy, onSnapshot, doc, updateDoc, serverTimestamp, Timestamp } = await import(SDK + "firebase-firestore.js");

const app = initializeApp(CONFIG.firebase);
const auth = getAuth(app), db = getFirestore(app);
const ordersCol = collection(db, "restaurants", "bombon", "orders");

const $ = id => document.getElementById(id);
const esc = s => String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;");
const money = n => CONFIG.currency + Math.round(Number(n) || 0).toLocaleString("en-IN");
const CAP = { new: "New", preparing: "Preparing", served: "Served", cancelled: "Cancelled" };
const LOW = { New: "new", Preparing: "preparing", Served: "served", Cancelled: "cancelled" };

let orders = [], seen = null, unsub = null, online = false, subscribedAt = 0;
const pending = {};          // doc id -> status being saved (keeps the card where staff put it)

/* ---------- sign in / out ---------- */
function showGate(msg) {
  $("gate").hidden = false;
  $("gate-err").hidden = !msg; $("gate-err").textContent = msg || "";
  $("pass").value = ""; setTimeout(() => $("pass").focus(), 50);
}
$("gate-form").addEventListener("submit", async e => {
  e.preventDefault();
  let user = $("user").value.trim().toLowerCase();
  if (!user.includes("@")) user += "@" + CONFIG.staffDomain;
  $("gate-go").disabled = true; $("gate-go").textContent = "Signing in…"; $("gate-err").hidden = true;
  try {
    await signInWithEmailAndPassword(auth, user, $("pass").value);
  } catch (err) {
    const c = err.code || "";
    $("gate-err").textContent = /invalid-credential|wrong-password|user-not-found|invalid-email/.test(c) ? "That username or password isn't right."
      : /too-many-requests/.test(c) ? "Too many tries. Wait a minute and try again."
      : /network/.test(c) ? "Can't reach the server. Check the internet connection."
      : /configuration-not-found|operation-not-allowed/.test(c) ? "Staff sign-in isn't switched on for this project yet (Firebase console → Authentication → Get started)."
      : "Couldn't sign in (" + c + ").";
    $("gate-err").hidden = false;
  } finally {
    $("gate-go").disabled = false; $("gate-go").textContent = "Sign in";
  }
});
$("lock").addEventListener("click", () => signOut(auth));

onAuthStateChanged(auth, user => {
  if (user) { $("gate").hidden = true; listen(); }
  else { stop(); orders = []; seen = null; render(); showGate(); }
});

/* ---------- live orders (last 18 hours) ---------- */
function listen() {
  stop();
  subscribedAt = Date.now();
  const since = Timestamp.fromMillis(Date.now() - 18 * 3600e3);
  unsub = onSnapshot(query(ordersCol, where("placedAt", ">=", since), orderBy("placedAt")), { includeMetadataChanges: true }, snap => {
    online = !snap.metadata.fromCache;
    const fresh = [];
    snap.docChanges().forEach(ch => { if (seen && ch.type === "added" && !seen.has(ch.doc.id)) fresh.push(ch.doc.id); });
    orders = snap.docs.map(d => {
      const o = d.data();
      return { id: d.id, ref: o.ref, table: o.table, guest: o.name, note: o.note, items: o.items || [], qty: o.qty, total: o.total,
        status: CAP[o.status] || "New", at: (o.placedAt ? o.placedAt.toDate() : new Date()).toISOString(),
        updated: o.statusAt ? o.statusAt.toDate().toISOString() : null };
    });
    seen = new Set(orders.map(o => o.id));
    render(fresh);
    if (fresh.length) announce(fresh);
    conn();
  }, err => {
    online = false; conn();
    if (err.code === "permission-denied") showGate("This login isn't allowed to see orders. Ask the owner to add it to the Firestore rules.");
    else setTimeout(listen, 5000);
  });
}
function stop() { if (unsub) unsub(); unsub = null; }
// Slide the 18-hour window forward every few hours on a board that stays open all day
setInterval(() => { if (unsub && Date.now() - subscribedAt > 4 * 3600e3) listen(); }, 60000);

function conn() {
  const el = $("conn");
  el.className = "conn " + (online ? "ok" : unsub ? "bad" : "");
  el.querySelector("b").textContent = online ? "Live" : unsub ? "Offline, reconnecting…" : "Connecting…";
}
addEventListener("online", conn); addEventListener("offline", () => { online = false; conn(); });
setInterval(ageTick, 15000);

/* ---------- new-order alert: chime, title, screen reader, keep screen awake ---------- */
let audio = null, soundOn = false, wake = null, unseen = 0;
function chime() {
  if (!soundOn || !audio) return;
  const t = audio.currentTime;
  [[880, 0], [1318.5, .18], [1760, .36]].forEach(([f, d]) => {
    const o = audio.createOscillator(), g = audio.createGain();
    o.type = "sine"; o.frequency.value = f;
    g.gain.setValueAtTime(0, t + d); g.gain.linearRampToValueAtTime(.35, t + d + .02); g.gain.exponentialRampToValueAtTime(.001, t + d + .9);
    o.connect(g).connect(audio.destination); o.start(t + d); o.stop(t + d + 1);
  });
}
function announce(ids) {
  chime();
  const tables = ids.map(id => (orders.find(o => o.id === id) || {}).table).filter(Boolean);
  $("live").textContent = `New order${ids.length > 1 ? "s" : ""} from table ${tables.join(", ")}`;
  if (document.hidden) { unseen += ids.length; document.title = `(${unseen}) New order · Bombon`; }
}
document.addEventListener("visibilitychange", () => {
  if (!document.hidden) { unseen = 0; document.title = "Bombon Orders"; if (soundOn) keepAwake(); }
});
async function keepAwake() {
  try { if ("wakeLock" in navigator && !wake) { wake = await navigator.wakeLock.request("screen"); wake.addEventListener("release", () => wake = null); } } catch (e) {}
}
$("sound").addEventListener("click", () => {
  soundOn = !soundOn;
  if (soundOn) { audio = audio || new (window.AudioContext || window.webkitAudioContext)(); audio.resume(); chime(); keepAwake(); }
  $("sound").setAttribute("aria-pressed", soundOn);
  $("sound").textContent = soundOn ? "Sound on" : "Sound off";
  document.body.classList.toggle("sound-nudge", !soundOn);
});
document.body.classList.add("sound-nudge");     // browsers only allow sound after a tap, so nudge staff to turn it on

/* ---------- drawing ---------- */
const NEXT = {
  New:       [["Start preparing", "Preparing", "go-prep"], ["Cancel", "Cancelled", "minor"]],
  Preparing: [["Mark served", "Served", "go-served"], ["Back to new", "New", "minor"]],
  Served:    [["Undo", "Preparing", "minor"]],
  Cancelled: [["Restore", "New", "minor"]],
};
const statusOf = o => pending[o.id] || o.status;
const colOf = o => { const s = statusOf(o); return s === "Cancelled" ? "Served" : s; };
const minsAgo = o => Math.max(0, Math.floor((Date.now() - Date.parse(o.at)) / 60000));
const clock = iso => new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });

function card(o, fresh) {
  const s = statusOf(o), m = minsAgo(o), late = s === "New" && m >= CONFIG.lateMinutes;
  const items = o.items.map(i => `<li><span class="q">${esc(i.qty)}×</span><span class="n">${esc(i.name)}</span>${i.note ? `<span class="note">${esc(i.note)}</span>` : ""}</li>`).join("");
  return `<article class="card${s === "Cancelled" ? " cancelled" : ""}${late ? " late" : ""}${fresh ? " fresh" : ""}" data-id="${esc(o.id)}" aria-label="Table ${esc(o.table)}, ${s}">
    <div class="c-top"><div class="c-table"><small>Table</small>${esc(o.table)}</div>
      <div class="c-age" data-at="${esc(o.at)}"><b>${m < 1 ? "just now" : m + " min"}</b>${clock(o.at)}</div></div>
    <div class="c-meta">${o.guest ? `<span class="guest">${esc(o.guest)}</span> · ` : ""}${esc(o.ref)}${s === "Cancelled" ? " · <b>Cancelled</b>" : ""}</div>
    <ul class="items">${items}</ul>
    ${o.note ? `<div class="knote"><b>Note</b>${esc(o.note)}</div>` : ""}
    <div class="c-foot"><span class="c-total">${money(o.total)}</span>
      ${NEXT[s].map(([label, to, cls]) => `<button type="button" class="act ${cls}" data-to="${to}"${pending[o.id] ? " disabled" : ""}>${label}</button>`).join("")}
    </div>
  </article>`;
}

function render(fresh = []) {
  const cols = { New: [], Preparing: [], Served: [] };
  const threeH = Date.now() - 3 * 3600e3;
  orders.forEach(o => {
    const c = colOf(o);
    if (c === "Served" && Date.parse(o.updated || o.at) < threeH) return;   // keep the Served column short
    cols[c].push(o);
  });
  cols.New.sort((a, b) => Date.parse(a.at) - Date.parse(b.at));             // oldest first: cook in order
  cols.Preparing.sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
  cols.Served.sort((a, b) => Date.parse(b.updated || b.at) - Date.parse(a.updated || a.at));
  const blank = { New: "No new orders. Nice and calm.", Preparing: "Nothing cooking right now.", Served: "Nothing served in the last 3 hours." };
  for (const [c, list] of Object.entries(cols)) {
    const sec = document.querySelector(`.col[data-col="${c}"]`);
    sec.querySelector(".cards").innerHTML = list.map(o => card(o, fresh.includes(o.id))).join("") || `<p class="empty">${blank[c]}</p>`;
    sec.querySelector("h2 span").textContent = list.length || "";
    document.querySelector(`.tabs [data-col="${c}"] span`).textContent = list.length ? `(${list.length})` : "";
  }
  // today's numbers (cancelled orders excluded)
  const today = new Date().toDateString();
  const todays = orders.filter(o => new Date(o.at).toDateString() === today && statusOf(o) !== "Cancelled");
  const open = orders.filter(o => ["New", "Preparing"].includes(statusOf(o))).length;
  $("stats").innerHTML = `<span class="stat"><b>${todays.length}</b><small>Orders today</small></span>`
    + `<span class="stat"><b>${money(todays.reduce((a, o) => a + (Number(o.total) || 0), 0))}</b><small>Today incl. service</small></span>`
    + `<span class="stat"><b>${open}</b><small>Open now</small></span>`;
}
function ageTick() {
  document.querySelectorAll(".c-age").forEach(el => {
    const m = Math.max(0, Math.floor((Date.now() - Date.parse(el.dataset.at)) / 60000));
    el.querySelector("b").textContent = m < 1 ? "just now" : m + " min";
    const cardEl = el.closest(".card");
    if (cardEl.closest('.col[data-col="New"]') && m >= CONFIG.lateMinutes) cardEl.classList.add("late");
  });
}

/* ---------- actions ---------- */
$("board").addEventListener("click", async e => {
  const b = e.target.closest(".act"); if (!b) return;
  const id = b.closest(".card").dataset.id, to = b.dataset.to;
  const o = orders.find(x => x.id === id); if (!o) return;
  pending[id] = to; render();                                     // move it now; the live update confirms it
  try {
    await updateDoc(doc(ordersCol, id), { status: LOW[to], statusAt: serverTimestamp(), statusBy: auth.currentUser.email });
    $("live").textContent = `Table ${o.table} marked ${to.toLowerCase()}`;
  } catch (err) {
    delete pending[id]; render();
    const el = document.querySelector(`.card[data-id="${CSS.escape(id)}"] .c-foot`);
    if (el) el.insertAdjacentHTML("beforeend", `<span class="c-err" role="alert">Couldn't save${err.code === "permission-denied" ? " (not allowed)" : ""}. Try again.</span>`);
    return;
  }
  delete pending[id]; render();
});

/* ---------- phone tabs ---------- */
function setTab(c) {
  document.querySelectorAll(".tabs button").forEach(b => b.setAttribute("aria-selected", b.dataset.col === c));
  document.querySelectorAll(".col").forEach(s => s.classList.toggle("on", s.dataset.col === c));
}
$("tabs").addEventListener("click", e => { const b = e.target.closest("button"); if (b) setTab(b.dataset.col); });
const fitTabs = () => document.documentElement.style.setProperty("--top-h", document.querySelector(".top").offsetHeight + "px");
addEventListener("resize", fitTabs);

setTab("New"); fitTabs(); render(); conn();
