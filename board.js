/* ============================================================
   Bombon orders board — reads orders from the Google Apps Script
   backend every few seconds and lets staff move them along:
   New → Preparing → Served (or Cancelled).
   ============================================================ */
(function(){
  const $ = id => document.getElementById(id);
  const esc = s => String(s == null ? "" : s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/"/g,"&quot;");
  const money = n => CONFIG.currency + Math.round(Number(n) || 0).toLocaleString("en-IN");
  const KEY_STORE = "bombon-staff-key";
  const store = {
    get(k){ try{ return localStorage.getItem(k); }catch(e){ return null; } },
    set(k, v){ try{ v == null ? localStorage.removeItem(k) : localStorage.setItem(k, v); }catch(e){} },
  };

  let key = store.get(KEY_STORE) || "";
  let orders = [], seen = null, timer = null, failures = 0, lastOk = 0;
  const pending = {};          // ref -> status being saved (keeps the card where staff put it)
  let tab = "New";

  /* ---------- talking to the backend ---------- */
  async function api(params, body){
    const url = CONFIG.apiUrl + "?" + new URLSearchParams(params);
    const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), 20000);
    try{
      const res = await fetch(body ? CONFIG.apiUrl : url, body
        ? {method:"POST", body:JSON.stringify(body), headers:{"Content-Type":"text/plain;charset=utf-8"}, signal:ctl.signal}
        : {signal:ctl.signal, cache:"no-store"});
      const out = await res.json();
      if(!out.ok) throw Object.assign(new Error(out.error || "Request failed"), {server:true});
      return out;
    }finally{ clearTimeout(t); }
  }

  /* ---------- key gate ---------- */
  function showGate(msg){
    stop();
    $("gate").hidden = false;
    $("gate-err").hidden = !msg; $("gate-err").textContent = msg || "";
    $("key").value = ""; setTimeout(() => $("key").focus(), 50);
  }
  $("gate-form").addEventListener("submit", async e => {
    e.preventDefault();
    const k = $("key").value.trim().toUpperCase();
    $("gate-go").disabled = true; $("gate-go").textContent = "Checking…"; $("gate-err").hidden = true;
    try{
      await api({action:"check", key:k});
      key = k; store.set(KEY_STORE, k);
      $("gate").hidden = true; start();
    }catch(err){
      $("gate-err").textContent = err.server ? "That key isn't right. Check the Settings tab of the orders sheet." : "Can't reach the orders backend. Check the internet connection.";
      $("gate-err").hidden = false;
    }finally{
      $("gate-go").disabled = false; $("gate-go").textContent = "Open the board";
    }
  });
  $("lock").addEventListener("click", () => { key = ""; store.set(KEY_STORE, null); orders = []; seen = null; render(); showGate(); });

  /* ---------- polling ---------- */
  function start(){ stop(); refresh(); timer = setInterval(refresh, CONFIG.refreshSeconds * 1000); }
  function stop(){ clearInterval(timer); timer = null; }
  let busy = false;
  async function refresh(){
    if(busy || !key) return;
    busy = true;
    try{
      const out = await api({action:"orders", key, hours:18});
      failures = 0; lastOk = Date.now();
      const fresh = [];
      out.orders.forEach(o => { if(seen && !seen.has(o.ref)) fresh.push(o.ref); });
      seen = new Set(out.orders.map(o => o.ref));
      orders = out.orders;
      render(fresh);
      if(fresh.length) announce(fresh);
    }catch(err){
      if(err.server && /key/i.test(err.message)){ store.set(KEY_STORE, null); key = ""; showGate("The staff key has changed. Enter the new one."); }
      else failures++;
    }finally{
      busy = false; conn();
    }
  }
  function conn(){
    const el = $("conn"), ok = failures === 0 && lastOk;
    el.className = "conn " + (ok ? "ok" : failures ? "bad" : "");
    el.querySelector("b").textContent = ok ? "Live" : failures ? "Offline, retrying…" : "Connecting…";
  }
  setInterval(() => { conn(); ageTick(); }, 15000);

  /* ---------- new-order alert: chime, title, screen reader, keep screen awake ---------- */
  let audio = null, soundOn = false, wake = null, unseen = 0;
  function chime(){
    if(!soundOn || !audio) return;
    const t = audio.currentTime;
    [[880,0],[1318.5,.18],[1760,.36]].forEach(([f, d]) => {
      const o = audio.createOscillator(), g = audio.createGain();
      o.type = "sine"; o.frequency.value = f;
      g.gain.setValueAtTime(0, t + d); g.gain.linearRampToValueAtTime(.35, t + d + .02); g.gain.exponentialRampToValueAtTime(.001, t + d + .9);
      o.connect(g).connect(audio.destination); o.start(t + d); o.stop(t + d + 1);
    });
  }
  function announce(refs){
    chime();
    const tables = refs.map(r => (orders.find(o => o.ref === r) || {}).table).filter(Boolean);
    $("live").textContent = `New order${refs.length > 1 ? "s" : ""} from table ${tables.join(", ")}`;
    if(document.hidden){ unseen += refs.length; document.title = `(${unseen}) New order · Bombon`; }
  }
  document.addEventListener("visibilitychange", () => {
    if(!document.hidden){ unseen = 0; document.title = "Bombon Orders"; if(soundOn) keepAwake(); }
  });
  async function keepAwake(){
    try{ if("wakeLock" in navigator && !wake) { wake = await navigator.wakeLock.request("screen"); wake.addEventListener("release", () => wake = null); } }catch(e){}
  }
  $("sound").addEventListener("click", () => {
    soundOn = !soundOn;
    if(soundOn){
      audio = audio || new (window.AudioContext || window.webkitAudioContext)();
      audio.resume(); chime(); keepAwake();
    }
    $("sound").setAttribute("aria-pressed", soundOn);
    $("sound").textContent = soundOn ? "Sound on" : "Sound off";
    document.body.classList.toggle("sound-nudge", !soundOn);
  });
  document.body.classList.add("sound-nudge");     // browsers only allow sound after a tap, so nudge staff to turn it on

  /* ---------- drawing ---------- */
  const NEXT = {
    New:       [["Start preparing","Preparing","go-prep"], ["Cancel","Cancelled","minor"]],
    Preparing: [["Mark served","Served","go-served"], ["Back to new","New","minor"]],
    Served:    [["Undo","Preparing","minor"]],
    Cancelled: [["Restore","New","minor"]],
  };
  const statusOf = o => pending[o.ref] || o.status;
  const colOf = o => { const s = statusOf(o); return s === "Cancelled" ? "Served" : s; };
  const minsAgo = o => Math.max(0, Math.floor((Date.now() - Date.parse(o.at)) / 60000));
  const clock = iso => new Date(iso).toLocaleTimeString([], {hour:"numeric", minute:"2-digit"});

  function card(o, fresh){
    const s = statusOf(o), m = minsAgo(o), late = s === "New" && m >= CONFIG.lateMinutes;
    const items = (o.items || []).map(i => `<li><span class="q">${i.qty}×</span><span class="n">${esc(i.name)}</span>${i.note ? `<span class="note">${esc(i.note)}</span>` : ""}</li>`).join("");
    return `<article class="card${s === "Cancelled" ? " cancelled" : ""}${late ? " late" : ""}${fresh ? " fresh" : ""}" data-ref="${esc(o.ref)}" aria-label="Table ${o.table}, ${s}">
      <div class="c-top"><div class="c-table"><small>Table</small>${o.table}</div>
        <div class="c-age" data-at="${esc(o.at)}"><b>${m < 1 ? "just now" : m + " min"}</b>${clock(o.at)}</div></div>
      <div class="c-meta">${o.guest ? `<span class="guest">${esc(o.guest)}</span> · ` : ""}${esc(o.ref)}${s === "Cancelled" ? " · <b>Cancelled</b>" : ""}</div>
      <ul class="items">${items}</ul>
      ${o.note ? `<div class="knote"><b>Note</b>${esc(o.note)}</div>` : ""}
      <div class="c-foot"><span class="c-total">${money(o.total)}</span>
        ${NEXT[s].map(([label, to, cls]) => `<button type="button" class="act ${cls}" data-to="${to}"${pending[o.ref] ? " disabled" : ""}>${label}</button>`).join("")}
      </div>
    </article>`;
  }

  function render(fresh = []){
    const cols = {New:[], Preparing:[], Served:[]};
    const threeH = Date.now() - 3 * 3600e3;
    orders.forEach(o => {
      const c = colOf(o);
      if(c === "Served" && Date.parse(o.updated || o.at) < threeH) return;   // keep the Served column short
      cols[c].push(o);
    });
    cols.New.sort((a, b) => Date.parse(a.at) - Date.parse(b.at));          // oldest first: cook in order
    cols.Preparing.sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
    cols.Served.sort((a, b) => Date.parse(b.updated || b.at) - Date.parse(a.updated || a.at));
    const blank = {New:"No new orders. Nice and calm.", Preparing:"Nothing cooking right now.", Served:"Nothing served in the last 3 hours."};
    for(const [c, list] of Object.entries(cols)){
      const sec = document.querySelector(`.col[data-col="${c}"]`);
      sec.querySelector(".cards").innerHTML = list.map(o => card(o, fresh.includes(o.ref))).join("") || `<p class="empty">${blank[c]}</p>`;
      sec.querySelector("h2 span").textContent = list.length || "";
      document.querySelector(`.tabs [data-col="${c}"] span`).textContent = list.length ? `(${list.length})` : "";
    }
    // today's numbers (cancelled orders excluded)
    const today = new Date().toDateString();
    const todays = orders.filter(o => new Date(o.at).toDateString() === today && statusOf(o) !== "Cancelled");
    const open = orders.filter(o => ["New","Preparing"].includes(statusOf(o))).length;
    $("stats").innerHTML = `<span class="stat"><b>${todays.length}</b><small>Orders today</small></span>`+
      `<span class="stat"><b>${money(todays.reduce((a, o) => a + (Number(o.total) || 0), 0))}</b><small>Today incl. service</small></span>`+
      `<span class="stat"><b>${open}</b><small>Open now</small></span>`;
  }
  function ageTick(){
    document.querySelectorAll(".c-age").forEach(el => {
      const m = Math.max(0, Math.floor((Date.now() - Date.parse(el.dataset.at)) / 60000));
      el.querySelector("b").textContent = m < 1 ? "just now" : m + " min";
      const cardEl = el.closest(".card");
      if(cardEl.closest('.col[data-col="New"]') && m >= CONFIG.lateMinutes) cardEl.classList.add("late");
    });
  }

  /* ---------- actions ---------- */
  $("board").addEventListener("click", async e => {
    const b = e.target.closest(".act"); if(!b) return;
    const ref = b.closest(".card").dataset.ref, to = b.dataset.to;
    const o = orders.find(x => x.ref === ref); if(!o) return;
    pending[ref] = to; render();                                     // move it now, confirm with the server
    try{
      await api({}, {action:"status", key, ref, status:to});
      o.status = to; o.updated = new Date().toISOString();
      $("live").textContent = `Table ${o.table} marked ${to.toLowerCase()}`;
    }catch(err){
      delete pending[ref]; render();
      const el = document.querySelector(`.card[data-ref="${CSS.escape(ref)}"] .c-foot`);
      if(el) el.insertAdjacentHTML("beforeend", `<span class="c-err" role="alert">Couldn't save. ${err.server ? esc(err.message) : "No connection."} Try again.</span>`);
      return;
    }
    delete pending[ref]; render();
  });

  /* ---------- phone tabs ---------- */
  function setTab(c){
    tab = c;
    document.querySelectorAll(".tabs button").forEach(b => b.setAttribute("aria-selected", b.dataset.col === c));
    document.querySelectorAll(".col").forEach(s => s.classList.toggle("on", s.dataset.col === c));
  }
  $("tabs").addEventListener("click", e => { const b = e.target.closest("button"); if(b) setTab(b.dataset.col); });
  const fitTabs = () => document.documentElement.style.setProperty("--top-h", document.querySelector(".top").offsetHeight + "px");
  addEventListener("resize", fitTabs);

  /* ---------- go ---------- */
  setTab("New"); fitTabs(); render();
  if(!CONFIG.apiUrl){
    $("gate").hidden = false;
    $("gate-form").innerHTML = `<div class="brand big">Bomb<em>o</em>n</div><h1>Orders board</h1>
      <p>Not connected yet. Put the Google Apps Script web app URL into <b>apiUrl</b> in <code>config.js</code>.</p>`;
  } else if(key) start();
  else showGate();
})();
