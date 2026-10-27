// Command Center — reads the locked data and builds every view from it.
// Changes made in the app are saved back to GitHub (see "saving & sync" below).

const TABS = ["overview", "business", "university", "personal", "stocks", "calendar"];
const PRIORITY_RANK = { high: 0, medium: 1, low: 2 };
const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const state = { data: null, code: null, tab: "overview", query: "", status: "all", weekOffset: 0 };
const view = document.getElementById("view");

// ---------- small helpers ----------

const esc = (value) =>
  String(value ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

function parseDate(text) {
  const m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(String(text || "").trim());
  return m ? new Date(+m[1], +m[2] - 1, +m[3]) : null;
}

function today() {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function addDays(date, n) {
  const d = new Date(date);
  d.setDate(d.getDate() + n);
  return d;
}

function startOfWeek(date) {
  const d = new Date(date);
  const shift = (d.getDay() + 6) % 7; // Monday = 0
  return addDays(d, -shift);
}

const sameDay = (a, b) => a.getTime() === b.getTime();
const daysUntil = (date) => Math.round((date - today()) / 86400000);
const fmtDate = (d) => `${DAY_NAMES[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()]}`;
const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));
const catKey = (p) => String(p.category || "").toLowerCase();
const pad2 = (n) => String(n).padStart(2, "0");
const isoDate = (d) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;

function relative(date) {
  const n = daysUntil(date);
  if (n === 0) return "today";
  if (n === 1) return "tomorrow";
  if (n === -1) return "yesterday";
  return n > 0 ? `in ${n} days` : `${-n} days ago`;
}

function safeUrl(url) {
  const u = String(url || "").trim();
  if (!u) return "#";
  if (/^https?:\/\//i.test(u) || /^mailto:/i.test(u)) return u;
  return "https://" + u.replace(/^\/+/, "");
}

// ---------- data shaping ----------

function projects() {
  return (state.data?.projects || []).map((p, index) => ({
    ...p,
    _index: index,
    status: String(p.status || "idea").toLowerCase(),
    priority: String(p.priority || "medium").toLowerCase(),
    progress: clamp(Number(p.progress) || 0, 0, 100),
  }));
}

function matches(p) {
  if (state.status !== "all" && p.status !== state.status) return false;
  const q = state.query.trim().toLowerCase();
  if (!q) return true;
  const haystack = [
    p.name, p.category, p.status, p.nextStep, p.notes, p.studyingNow,
    ...(p.tasks || []).map((t) => t.title),
    ...(p.goals || []).map((g) => g.label),
    ...(p.links || []).map((l) => l.label),
  ].join(" ").toLowerCase();
  return haystack.includes(q);
}

const visible = (list) => list.filter(matches);

// Every dated thing (project deadlines + course exams/assignments), sorted by date.
function datedItems(list) {
  const items = [];
  for (const p of list) {
    if (p.status === "done") continue;
    const d = parseDate(p.deadline);
    if (d) items.push({ date: d, title: p.nextStep || "Deadline", project: p, type: "deadline" });
    (p.tasks || []).forEach((t, taskIndex) => {
      const td = parseDate(t.date);
      if (td && !t.done) items.push({ date: td, title: t.title, project: p, type: t.type || "task", example: t.example, taskIndex });
    });
  }
  return items.sort((a, b) => a.date - b.date);
}

function nextDate(p) {
  const dates = datedItems([p]).map((i) => i.date).filter((d) => daysUntil(d) >= 0);
  return dates[0] || null;
}

function topPriority(list) {
  const active = list.filter((p) => p.status === "active" && p.nextStep);
  active.sort((a, b) => {
    const pr = (PRIORITY_RANK[a.priority] ?? 1) - (PRIORITY_RANK[b.priority] ?? 1);
    if (pr) return pr;
    const da = nextDate(a), db = nextDate(b);
    if (da && db) return da - db;
    if (da) return -1;
    if (db) return 1;
    return a._index - b._index;
  });
  return active[0] || null;
}

// ---------- reusable pieces of HTML ----------

const statusPill = (p) => `<span class="pill st-${esc(p.status)}"><span class="dot"></span>${esc(p.status)}</span>`;

function priorityPill(p) {
  if (p.priority !== "high" || p.status !== "active") return "";
  return `<span class="pill prio-high">★ priority</span>`;
}

function duePill(date, example) {
  if (!date) return "";
  const n = daysUntil(date);
  const cls = n < 0 ? "late" : n <= 3 ? "soon" : "due";
  return `<span class="pill ${cls}">${n < 0 ? "Overdue · " : ""}${fmtDate(date)} · ${relative(date)}</span>${example ? exampleTag() : ""}`;
}

const exampleTag = () => `<span class="pill example" title="Placeholder — tell Claude the real value">example</span>`;

function progressBar(pct, label = "Progress", yellow = false) {
  return `<div class="progress">
    <div class="row between"><span>${esc(label)}</span><span>${Math.round(pct)}%</span></div>
    <div class="bar${yellow ? " yellow" : ""}"><i data-w="${clamp(pct, 0, 100)}"></i></div>
  </div>`;
}

function linksHtml(p) {
  const links = (p.links || []).filter((l) => l && l.url);
  if (!links.length) return "";
  return `<div class="links">${links
    .map((l) => `<a href="${esc(safeUrl(l.url))}" target="_blank" rel="noopener">${esc(l.label || l.url)} ↗</a>`)
    .join("")}</div>`;
}

function nextStepHtml(p) {
  return p.nextStep ? `<p class="next"><small>Next step</small>${esc(p.nextStep)}</p>` : "";
}

const editButton = (p) =>
  `<button class="edit-btn" data-edit="${esc(p.name)}" aria-label="Edit ${esc(p.name)}" title="Edit">
    <svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true"><path d="M4 20h4L19 9l-4-4L4 16v4z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/></svg>
  </button>`;

const cardTitle = (p) => `<div class="title-row"><h3>${esc(p.name)}</h3>${editButton(p)}</div>`;

function projectCard(p, i, extra = "") {
  const dark = p.status === "active" && p.priority === "high";
  const due = parseDate(p.deadline);
  return `<article class="card${dark ? " dark" : ""}" style="--i:${i}">
    <div class="row between">
      <div class="row">${statusPill(p)}${priorityPill(p)}</div>
      ${due && p.status !== "done" ? `<span class="row">${duePill(due)}</span>` : ""}
    </div>
    ${cardTitle(p)}
    ${nextStepHtml(p)}
    ${extra}
    ${progressBar(p.progress)}
    ${p.notes ? `<p class="notes">${esc(p.notes)}</p>` : ""}
    ${linksHtml(p)}
  </article>`;
}

function itemRow(item, showProject = true) {
  const d = item.date;
  const check = Number.isInteger(item.taskIndex)
    ? `<button class="check" data-done="${esc(item.project.name)}" data-task="${item.taskIndex}" aria-label="Mark ${esc(item.title)} as done" title="Mark as done"></button>`
    : "";
  return `<li>
    ${check}
    <span class="cat-bar c-${esc(catKey(item.project))}"></span>
    <span class="when"><b>${d.getDate()}</b><small>${DAY_NAMES[d.getDay()]}</small></span>
    <span class="what">
      <b>${esc(item.title)}</b>
      <small>${showProject ? esc(item.project.name) + " · " : ""}${esc(item.type)} · ${relative(d)}${item.example ? " · example date" : ""}</small>
    </span>
  </li>`;
}

function emptyState(message) {
  return `<div class="card empty span-4"><h3>Nothing here</h3><p class="muted">${esc(message)}</p></div>`;
}

function sectionTitle(title, sub = "") {
  return `<div class="section-title"><h2>${esc(title)}</h2><span class="muted">${esc(sub)}</span></div>`;
}

// ---------- views ----------

function renderOverview() {
  const all = projects();
  const filtering = state.query.trim() || state.status !== "all";
  if (filtering) {
    const found = visible(all);
    return sectionTitle("Search results", `${found.length} match${found.length === 1 ? "" : "es"}`) +
      (found.length ? `<div class="cards">${found.map((p, i) => projectCard(p, i)).join("")}</div>` : emptyState("Try a different word or status."));
  }

  const active = all.filter((p) => p.status === "active");
  const weekStart = startOfWeek(today());
  const weekEnd = addDays(weekStart, 6);
  const items = datedItems(all);
  const thisWeek = items.filter((it) => it.date >= weekStart && it.date <= weekEnd);
  const overdue = items.filter((it) => daysUntil(it.date) < 0 && it.date < weekStart);
  const upcoming = items.filter((it) => it.date > weekEnd).slice(0, 6);
  const top = topPriority(all);
  const avg = active.length ? active.reduce((s, p) => s + p.progress, 0) / active.length : 0;

  const counts = (cat) => all.filter((p) => catKey(p) === cat && p.status === "active").length;

  let html = `<div class="bento">`;

  html += top
    ? `<article class="card dark span-2 row-2 clickable" data-go="${esc(catKey(top))}" style="--i:0">
        <p class="label">Most important next step</p>
        <p class="hero-step">${esc(top.nextStep)}</p>
        <div class="row">${statusPill(top)}<span class="pill">${esc(top.name)}</span><span class="pill">${esc(top.category)}</span></div>
        ${nextDate(top) ? `<div class="row" style="margin-top:10px">${duePill(nextDate(top))}</div>` : ""}
        ${progressBar(top.progress, "Project progress")}
        ${top.notes ? `<p class="notes">${esc(top.notes)}</p>` : ""}
        ${linksHtml(top)}
      </article>`
    : `<article class="card dark span-2 row-2" style="--i:0"><p class="label">Most important next step</p><p class="hero-step">No active projects with a next step yet.</p></article>`;

  html += `<article class="card accent" style="--i:1">
      <p class="label">Active projects</p>
      <p class="big">${active.length}</p>
      <p class="muted">of ${all.length} in total</p>
    </article>`;

  html += `<article class="card clickable" data-go="calendar" style="--i:2">
      <p class="label">Due this week</p>
      <p class="big">${thisWeek.length}</p>
      <p class="muted">${overdue.length ? `${overdue.length} overdue from before` : `${fmtDate(weekStart)} – ${fmtDate(weekEnd)}`}</p>
    </article>`;

  html += `<article class="card span-2" style="--i:3">
      <p class="label">Where your energy is</p>
      <div class="split">
        <div class="clickable" data-go="business"><b>${counts("business")}</b><small>Business</small></div>
        <div class="clickable" data-go="university"><b>${counts("university")}</b><small>University</small></div>
        <div class="clickable" data-go="personal"><b>${counts("personal")}</b><small>Personal</small></div>
      </div>
      ${progressBar(avg, "Average progress of active projects", true)}
    </article>`;

  html += `<article class="card span-2" style="--i:4">
      <div class="row between"><p class="label">This week</p><span class="muted" style="font-size:.8rem">${thisWeek.length} item${thisWeek.length === 1 ? "" : "s"}</span></div>
      ${thisWeek.length ? `<ul class="list">${thisWeek.map((it) => itemRow(it)).join("")}</ul>` : `<p class="muted">Nothing due this week. 🎉</p>`}
    </article>`;

  html += `<article class="card span-2" style="--i:5">
      <p class="label">After this week</p>
      ${upcoming.length ? `<ul class="list">${upcoming.map((it) => itemRow(it)).join("")}</ul>` : `<p class="muted">No upcoming dates.</p>`}
    </article>`;

  html += stocksOverviewCard();

  if (overdue.length) {
    html += `<article class="card span-4" style="--i:7">
        <p class="label" style="color:#c2483a">Overdue</p>
        <ul class="list">${overdue.map((it) => itemRow(it)).join("")}</ul>
      </article>`;
  }

  return html + `</div>`;
}

function renderCategory(cat, title, sub) {
  const list = visible(projects().filter((p) => catKey(p) === cat));
  list.sort((a, b) => ["active", "idea", "paused", "done"].indexOf(a.status) - ["active", "idea", "paused", "done"].indexOf(b.status) ||
    (PRIORITY_RANK[a.priority] ?? 1) - (PRIORITY_RANK[b.priority] ?? 1));
  const head = `<div class="section-title"><h2>${esc(title)}</h2>
    <span class="row"><span class="muted">${list.length} ${esc(sub)}</span><button class="add-btn" data-new="${esc(title)}">+ Add</button></span></div>`;
  if (!list.length) return head + `<div class="cards">${emptyState("No matches for this search or filter.")}</div>`;

  if (cat === "university") return head + `<div class="cards">${list.map(courseCard).join("")}</div>`;
  if (cat === "personal") return head + `<div class="cards">${list.map(personalCard).join("")}</div>`;
  return head + `<div class="cards">${list.map((p, i) => projectCard(p, i)).join("")}</div>`;
}

function courseCard(p, i) {
  const tasks = (p.tasks || [])
    .map((t, taskIndex) => ({ ...t, taskIndex, d: parseDate(t.date) }))
    .filter((t) => t.d)
    .sort((a, b) => a.d - b.d);
  const upcoming = tasks.filter((t) => !t.done && daysUntil(t.d) >= 0);
  const soonest = upcoming[0];
  const dark = soonest && daysUntil(soonest.d) <= 3;

  const taskList = upcoming.length
    ? `<ul class="list" style="margin-top:12px">${upcoming.map((t) => itemRow({ date: t.d, title: t.title, type: t.type || "task", project: p, example: t.example, taskIndex: t.taskIndex }, false)).join("")}</ul>`
    : `<p class="muted" style="margin-top:12px">No upcoming exams or assignments.</p>`;

  return `<article class="card${dark ? " dark" : ""}" style="--i:${i}">
    <div class="row between">
      <div class="row">${statusPill(p)}</div>
      ${soonest ? `<span class="row">${duePill(soonest.d, soonest.example)}</span>` : ""}
    </div>
    ${cardTitle(p)}
    ${p.studyingNow ? `<p class="next"><small>Studying now</small>${esc(p.studyingNow)}</p>` : ""}
    ${p.nextStep && p.nextStep !== p.studyingNow ? `<p class="notes">Next: ${esc(p.nextStep)}</p>` : ""}
    ${taskList}
    ${progressBar(p.progress, "Course progress")}
    ${p.notes ? `<p class="notes">${esc(p.notes)}</p>` : ""}
    ${linksHtml(p)}
  </article>`;
}

// Goals can follow the project's log: "weight" uses the latest weigh-in,
// any other track counts this week's log entries ("workout" also counts runs).
const LOG_LABELS = { workout: "+ Workout", run: "+ Run" };
const logCounts = (track, type) => type === track || (track === "workout" && type === "run");

function goalValue(p, g) {
  const log = p.log || [];
  if (g.track === "weight") {
    const last = log.filter((e) => e.type === "weight").sort((a, b) => (a.date + a.id).localeCompare(b.date + b.id)).pop();
    return last ? Number(last.value) : Number(g.current);
  }
  if (g.track) {
    const weekStart = isoDate(startOfWeek(today()));
    return log.filter((e) => e.date >= weekStart && logCounts(g.track, e.type)).length;
  }
  return Number(g.current);
}

function goalPct(p, g) {
  const start = Number(g.start), current = goalValue(p, g), target = Number(g.target);
  if (![start, current, target].every(Number.isFinite) || target === start) return 0;
  return clamp(((current - start) / (target - start)) * 100, 0, 100);
}

function logPanel(p) {
  const tracks = [...new Set((p.goals || []).map((g) => g.track).filter(Boolean))];
  if (!tracks.length) return "";
  const name = esc(p.name);
  const log = p.log || [];

  const buttons = tracks.filter((t) => t !== "weight")
    .map((t) => `<button class="log-btn" data-log="${name}" data-type="${esc(t)}">${esc(LOG_LABELS[t] || "+ " + t)}</button>`).join("");
  const weightForm = tracks.includes("weight")
    ? `<form class="weight-form" data-weight="${name}">
        <input type="number" step="0.1" min="20" max="400" inputmode="decimal" placeholder="Today's weight (kg)" required>
        <button type="submit" class="log-btn">Log</button>
      </form>`
    : "";

  const weekStart = startOfWeek(today());
  const strip = Array.from({ length: 7 }, (_, n) => {
    const d = addDays(weekStart, n);
    const day = log.filter((e) => e.date === isoDate(d) && e.type !== "weight");
    const mark = day.some((e) => e.type === "run") ? "R" : day.length ? "✓" : "";
    return `<span class="day-dot${day.length ? " on" : ""}${sameDay(d, today()) ? " now" : ""}"><small>${DAY_NAMES[d.getDay()][0]}</small>${mark}</span>`;
  }).join("");

  const recent = [...log].sort((a, b) => (b.date + b.id).localeCompare(a.date + a.id)).slice(0, 4)
    .map((e) => `<li><span>${esc(e.type === "weight" ? `Weight ${e.value} kg` : e.type[0].toUpperCase() + e.type.slice(1))}</span>
      <small>${fmtDate(parseDate(e.date))}</small>
      <button class="x-btn" data-unlog="${name}" data-id="${esc(e.id)}" aria-label="Remove this entry">×</button></li>`).join("");

  return `<div class="log-panel">
    <div class="row">${buttons}</div>
    ${weightForm}
    <div class="week-strip">${strip}</div>
    ${recent ? `<ul class="log-list">${recent}</ul>` : ""}
  </div>`;
}

function personalCard(p, i) {
  const goals = (p.goals || [])
    .map((g) => {
      const value = goalValue(p, g);
      const label = g.track && g.track !== "weight"
        ? `${g.label}: ${value} of ${g.target}`
        : `${g.label}: ${value} → ${g.target} ${g.unit || ""}`.trim();
      return `<div class="goal">
        ${progressBar(goalPct(p, g), label, true)}
        ${g.example ? `<div class="row" style="margin-top:6px">${exampleTag()}<span class="muted" style="font-size:.78rem">started at ${esc(g.start)} ${esc(g.unit || "")}</span></div>` : ""}
      </div>`;
    })
    .join("");
  return projectCard(p, i, goals + logPanel(p));
}

// ---------- stocks ----------

function money(n, currency = "USD") {
  return new Intl.NumberFormat("en-US", { style: "currency", currency, minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
}
const signedMoney = (n, cur) => (n >= 0 ? "+" : "−") + money(Math.abs(n), cur);
const signedPct = (n) => (n >= 0 ? "+" : "−") + Math.abs(n).toFixed(2) + "%";
const tone = (n) => (n > 0 ? "pos" : n < 0 ? "neg" : "");

const holdingValue = (h) => (Number(h.shares) || 0) * (Number(h.price) || 0);
const holdingCost = (h) => (Number(h.shares) || 0) * (Number(h.avgCost) || 0);
const holdingPnl = (h) => (Number.isFinite(Number(h.pnl)) ? Number(h.pnl) : holdingValue(h) - holdingCost(h));

function accountStats(acc) {
  const holdings = acc.holdings || [];
  const invested = holdings.reduce((s, h) => s + holdingValue(h), 0);
  const cost = holdings.reduce((s, h) => s + holdingCost(h), 0);
  const pnl = holdings.reduce((s, h) => s + holdingPnl(h), 0);
  const hasDay = holdings.some((h) => Number.isFinite(Number(h.dayPnl)));
  const day = holdings.reduce((s, h) => s + (Number(h.dayPnl) || 0), 0);
  const total = Number.isFinite(Number(acc.total)) ? Number(acc.total) : invested + (Number(acc.cash) || 0);
  return { holdings, invested, cost, pnl, pct: cost ? (pnl / cost) * 100 : 0, day: hasDay ? day : null, total };
}

const accountBadge = (acc) =>
  acc.type === "practice" ? `<span class="pill example">practice money</span>` : `<span class="pill st-active"><span class="dot"></span>real money</span>`;

function stocksOverviewCard() {
  const inv = state.data?.investments;
  if (!inv || !(inv.accounts || []).length) return "";
  const rows = inv.accounts.map((acc) => {
    const s = accountStats(acc);
    return `<div class="acct-mini">
      <div class="row between"><b>${esc(acc.name)}</b>${accountBadge(acc)}</div>
      <span class="acct-total">${money(s.total, acc.currency)}</span>
      <span class="${tone(s.pnl)}">${signedMoney(s.pnl, acc.currency)} (${signedPct(s.pct)}) total</span>
    </div>`;
  }).join("");
  return `<article class="card span-4 clickable" data-go="stocks" style="--i:6">
      <div class="row between"><p class="label">Stocks</p><span class="muted" style="font-size:.8rem">Updated ${esc(inv.updated || "")}</span></div>
      <div class="acct-grid">${rows}</div>
    </article>`;
}

function renderStocks() {
  const inv = state.data?.investments;
  if (!inv || !(inv.accounts || []).length) {
    return sectionTitle("Stocks") + `<div class="cards">${emptyState("No accounts yet. Ask Claude to add your stocks.")}</div>`;
  }
  const q = state.query.trim().toLowerCase();

  const html = inv.accounts.map((acc, ai) => {
    const s = accountStats(acc);
    const cur = acc.currency || "USD";
    const holdings = [...s.holdings]
      .filter((h) => !q || `${h.symbol} ${h.name}`.toLowerCase().includes(q))
      .sort((a, b) => holdingValue(b) - holdingValue(a));
    const real = acc.type !== "practice";

    const allocation = s.invested
      ? `<div class="alloc">${holdings.map((h, i) => `<i style="width:${(holdingValue(h) / s.invested) * 100}%;--n:${i}" title="${esc(h.symbol)}"></i>`).join("")}</div>`
      : "";

    const rows = holdings.map((h) => {
      const pnl = holdingPnl(h);
      const cost = holdingCost(h);
      return `<li class="holding">
        <span class="sym"><b>${esc(h.symbol)}</b><small>${esc(h.name || "")}</small></span>
        <span class="qty"><small>${Number(h.shares)} @ ${money(Number(h.avgCost), cur)}</small><small>now ${money(Number(h.price), cur)}</small></span>
        <span class="val"><b>${money(holdingValue(h), cur)}</b><small class="${tone(pnl)}">${signedMoney(pnl, cur)} · ${signedPct(cost ? (pnl / cost) * 100 : 0)}</small></span>
      </li>`;
    }).join("");

    return `<div class="bento" style="margin-bottom:14px">
      <article class="card ${real ? "dark" : ""} span-2" style="--i:${ai * 3}">
        <div class="row between"><p class="label">${esc(acc.name)}</p>${accountBadge(acc)}</div>
        <p class="big">${money(s.total, cur)}</p>
        <p class="${tone(s.pnl)}" style="font-weight:700">${signedMoney(s.pnl, cur)} (${signedPct(s.pct)}) since you bought</p>
        ${s.day !== null ? `<p class="${tone(s.day)}" style="font-size:.9rem">${signedMoney(s.day, cur)} today</p>` : ""}
        <div class="split" style="margin-top:12px">
          <div><b>${money(s.invested, cur)}</b><small>Invested now</small></div>
          <div><b>${money(Number(acc.cash) || 0, cur)}</b><small>Cash</small></div>
          <div><b>${(acc.holdings || []).length}</b><small>Holdings</small></div>
        </div>
        ${allocation}
      </article>
      <article class="card span-2" style="--i:${ai * 3 + 1}">
        <p class="label">Holdings · biggest first</p>
        ${rows ? `<ul class="list">${rows}</ul>` : `<p class="muted">No matches.</p>`}
      </article>
    </div>`;
  }).join("");

  return sectionTitle("Stocks", `Updated ${inv.updated || ""}`) + html +
    `<p class="muted stocks-note">${esc(inv.note || "")}</p>`;
}

function renderCalendar() {
  const start = addDays(startOfWeek(today()), state.weekOffset * 7);
  const end = addDays(start, 6);
  const items = datedItems(visible(projects())).filter((it) => it.date >= start && it.date <= end);
  const t = today();

  let days = "";
  for (let n = 0; n < 7; n++) {
    const d = addDays(start, n);
    const dayItems = items.filter((it) => sameDay(it.date, d));
    const cls = sameDay(d, t) ? " today" : d < t ? " past" : "";
    days += `<section class="card day${cls}" style="--i:${n}">
      <div class="d-head"><small>${DAY_NAMES[d.getDay()]}</small><b>${d.getDate()}</b></div>
      <div>${dayItems.length
        ? dayItems.map((it) => `<span class="chip k-${esc(catKey(it.project))}">${esc(it.title)}<small>${esc(it.project.name)} · ${esc(it.type)}${it.example ? " · example" : ""}</small></span>`).join("")
        : `<span class="none">—</span>`}</div>
    </section>`;
  }

  const label = state.weekOffset === 0 ? "This week" : state.weekOffset === 1 ? "Next week" : state.weekOffset === -1 ? "Last week" : "Week view";
  return `<div class="cal-head">
      <div class="section-title" style="margin:0"><h2>${label}</h2></div>
      <span class="muted">${fmtDate(start)} – ${fmtDate(end)} · ${items.length} item${items.length === 1 ? "" : "s"}</span>
      <div class="cal-nav">
        <button data-week="-1" aria-label="Previous week">← Prev</button>
        <button data-week="0">Today</button>
        <button data-week="1" aria-label="Next week">Next →</button>
      </div>
    </div>
    <div class="week">${days}</div>
    <div class="legend">
      <span><i style="background:var(--cat-business)"></i>Business</span>
      <span><i style="background:var(--cat-university)"></i>University</span>
      <span><i style="background:var(--cat-personal)"></i>Personal</span>
    </div>`;
}

// ---------- rendering & interaction ----------

function render() {
  const tabBar = document.getElementById("tabs");
  tabBar.querySelectorAll("button").forEach((b) => b.classList.toggle("on", b.dataset.tab === state.tab));
  const onTab = tabBar.querySelector("button.on");
  if (onTab) tabBar.scrollTo({ left: onTab.offsetLeft - (tabBar.clientWidth - onTab.offsetWidth) / 2, behavior: "smooth" });
  document.querySelectorAll("#filters button").forEach((b) => b.classList.toggle("on", b.dataset.status === state.status));

  const html = {
    overview: renderOverview,
    business: () => renderCategory("business", "Business", "projects"),
    university: () => renderCategory("university", "University", "courses"),
    personal: () => renderCategory("personal", "Personal", "goals"),
    stocks: renderStocks,
    calendar: renderCalendar,
  }[state.tab]();

  view.innerHTML = html;
  requestAnimationFrame(() =>
    requestAnimationFrame(() => view.querySelectorAll(".bar > i").forEach((bar) => (bar.style.width = bar.dataset.w + "%")))
  );
}

function setTab(tab) {
  state.tab = TABS.includes(tab) ? tab : "overview";
  if (location.hash.slice(1) !== state.tab) history.replaceState(null, "", "#" + state.tab);
  render();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

document.getElementById("tabs").addEventListener("click", (e) => {
  const b = e.target.closest("button[data-tab]");
  if (b) setTab(b.dataset.tab);
});

document.getElementById("filters").addEventListener("click", (e) => {
  const b = e.target.closest("button[data-status]");
  if (b) { state.status = b.dataset.status; render(); }
});

document.getElementById("search").addEventListener("input", (e) => {
  state.query = e.target.value;
  render();
});

view.addEventListener("click", (e) => {
  if (e.target.closest("a")) return;

  const edit = e.target.closest("[data-edit]");
  if (edit) return openEditor(edit.dataset.edit);
  const add = e.target.closest("[data-new]");
  if (add) return openEditor(null, add.dataset.new);

  const done = e.target.closest("[data-done]");
  if (done) {
    const name = done.dataset.done, index = Number(done.dataset.task);
    const title = findProject(state.data, name)?.tasks?.[index]?.title || "Task";
    return save((d) => { const t = findProject(d, name)?.tasks?.[index]; if (t) t.done = true; }, `Done: ${title}`);
  }

  const log = e.target.closest("[data-log]");
  if (log) {
    const name = log.dataset.log, type = log.dataset.type, entry = { id: String(Date.now()), date: isoDate(today()), type };
    return save((d) => { const p = findProject(d, name); if (p) (p.log ||= []).push(entry); }, `Logged ${type}`);
  }

  const unlog = e.target.closest("[data-unlog]");
  if (unlog) {
    const name = unlog.dataset.unlog, id = unlog.dataset.id;
    return save((d) => { const p = findProject(d, name); if (p) p.log = (p.log || []).filter((x) => x.id !== id); }, "Removed log entry");
  }

  const week = e.target.closest("[data-week]");
  if (week) {
    const step = Number(week.dataset.week);
    state.weekOffset = step === 0 ? 0 : state.weekOffset + step;
    render();
    return;
  }
  const go = e.target.closest("[data-go]");
  if (go) setTab(go.dataset.go);
});

view.addEventListener("submit", (e) => {
  const form = e.target.closest("[data-weight]");
  if (!form) return;
  e.preventDefault();
  const value = Math.round(Number(form.querySelector("input").value) * 10) / 10;
  if (!Number.isFinite(value) || value <= 0) return;
  const name = form.dataset.weight, entry = { id: String(Date.now()), date: isoDate(today()), type: "weight", value };
  save((d) => { const p = findProject(d, name); if (p) (p.log ||= []).push(entry); }, `Logged weight ${value} kg`);
});

window.addEventListener("hashchange", () => setTab(location.hash.slice(1)));

// ---------- saving & sync ----------
// Every change is a small function applied to the newest copy on GitHub, then
// locked again with the secret code and saved there, so all devices stay in step.

const REPO = "gvechavarriaus-commits/gerardo-hq";
const CONTENTS_API = `https://api.github.com/repos/${REPO}/contents/data.locked.json`;
const TOKEN_KEY = "gerardo-hq-github-token";
const ITERATIONS = 600000;

const tokenStore = {
  get() { try { return localStorage.getItem(TOKEN_KEY); } catch { return null; } },
  set(t) { try { localStorage.setItem(TOKEN_KEY, t); } catch {} },
  clear() { try { localStorage.removeItem(TOKEN_KEY); } catch {} },
};

const findProject = (data, name) => (data.projects || []).find((p) => p.name === name);

function toB64(bytes) {
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

async function lockData(data, code) {
  const enc = new TextEncoder();
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const base = await crypto.subtle.importKey("raw", enc.encode(code), "PBKDF2", false, ["deriveKey"]);
  const key = await crypto.subtle.deriveKey(
    { name: "PBKDF2", salt, iterations: ITERATIONS, hash: "SHA-256" },
    base, { name: "AES-GCM", length: 256 }, false, ["encrypt"]
  );
  const cipher = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, enc.encode(JSON.stringify(data, null, 2))));
  return { v: 1, iterations: ITERATIONS, salt: toB64(salt), iv: toB64(iv), data: toB64(cipher) };
}

const githubHeaders = (token) => ({ Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json" });

async function fetchRemote(token) {
  const r = await fetch(`${CONTENTS_API}?ref=main&t=${Date.now()}`, { headers: githubHeaders(token), cache: "no-store" });
  if (!r.ok) throw Object.assign(new Error(`GitHub said ${r.status}`), { status: r.status });
  const j = await r.json();
  return { sha: j.sha, locked: JSON.parse(atob(j.content.replace(/\s/g, ""))) };
}

async function pushRemote(token, locked, sha, message) {
  const r = await fetch(CONTENTS_API, {
    method: "PUT",
    headers: { ...githubHeaders(token), "Content-Type": "application/json" },
    body: JSON.stringify({ message, sha, branch: "main", content: btoa(JSON.stringify(locked) + "\n") }),
  });
  if (!r.ok) throw Object.assign(new Error(`GitHub said ${r.status}`), { status: r.status });
}

let saveQueue = Promise.resolve();
let pendingSaves = 0;

function save(mutate, message) {
  const token = tokenStore.get();
  if (!token) return openSyncSheet("To save changes, connect this device once.");

  mutate(state.data); // show the change straight away
  render();
  pendingSaves++;
  toast("Saving…");

  saveQueue = saveQueue.then(async () => {
    try {
      for (let attempt = 0; ; attempt++) {
        const { sha, locked } = await fetchRemote(token);
        const fresh = await unlock(locked, state.code);
        mutate(fresh);
        try {
          await pushRemote(token, await lockData(fresh, state.code), sha, message);
          if (pendingSaves === 1) { state.data = fresh; render(); }
          toast(`Saved ✓ ${message}`);
          return;
        } catch (err) {
          if ((err.status === 409 || err.status === 422) && attempt < 2) continue; // someone saved in between
          throw err;
        }
      }
    } catch (err) {
      toast(err.status === 401 || err.status === 403 || err.status === 404
        ? "Not saved: this device's GitHub key doesn't work. Reconnect it."
        : `Not saved (${err.message}). Check your internet and try again.`, true);
      if (err.status === 401 || err.status === 403) openSyncSheet("This device's GitHub key stopped working. Paste a new one.");
      reloadFromRemote();
    } finally {
      pendingSaves--;
    }
  });
}

async function reloadFromRemote() {
  try {
    const { locked } = await fetchRemote(tokenStore.get());
    state.data = await unlock(locked, state.code);
    render();
  } catch {}
}

// ---------- toast ----------

let toastTimer;
function toast(text, isError = false) {
  let el = document.getElementById("toast");
  if (!el) {
    el = document.createElement("div");
    el.id = "toast";
    el.setAttribute("role", "status");
    document.body.appendChild(el);
  }
  el.textContent = text;
  el.className = "toast show" + (isError ? " error" : "");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove("show"), isError ? 6000 : 2500);
}

// ---------- bottom sheet (editor + sync setup) ----------

function openSheet(html) {
  let sheet = document.getElementById("sheet");
  if (!sheet) {
    sheet = document.createElement("div");
    sheet.id = "sheet";
    sheet.className = "sheet-wrap";
    sheet.addEventListener("click", (e) => { if (e.target === sheet || e.target.closest("[data-close]")) closeSheet(); });
    document.body.appendChild(sheet);
  }
  sheet.innerHTML = `<div class="sheet glass" role="dialog" aria-modal="true">${html}</div>`;
  requestAnimationFrame(() => sheet.classList.add("open"));
  document.body.classList.add("sheet-open");
  return sheet.querySelector(".sheet");
}

function closeSheet() {
  const sheet = document.getElementById("sheet");
  if (!sheet) return;
  sheet.classList.remove("open");
  document.body.classList.remove("sheet-open");
  setTimeout(() => { if (!sheet.classList.contains("open")) sheet.innerHTML = ""; }, 300);
}

document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeSheet(); });

const option = (value, current, label = value) => `<option value="${esc(value)}"${value === current ? " selected" : ""}>${esc(label)}</option>`;

const taskRow = (t = {}) => `<div class="task-row">
  <input type="checkbox" class="t-done" ${t.done ? "checked" : ""} aria-label="Done">
  <input type="text" class="t-title" value="${esc(t.title || "")}" placeholder="Exam, assignment…">
  <input type="date" class="t-date" value="${esc(t.date || "")}">
  <select class="t-type">${["assignment", "exam", "task"].map((x) => option(x, t.type || "task")).join("")}</select>
  <button type="button" class="x-btn" data-remove-row aria-label="Remove">×</button>
</div>`;

const goalRow = (g) => `<div class="goal-row" data-label="${esc(g.label)}">
  <span>${esc(g.label)}</span>
  <label>Start <input type="number" step="0.1" class="g-start" value="${esc(g.start)}"></label>
  <label>Target <input type="number" step="0.1" class="g-target" value="${esc(g.target)}"></label>
</div>`;

function openEditor(name, category) {
  const existing = name ? findProject(state.data, name) : null;
  const p = existing || { name: "", category: category || "Business", status: "active", priority: "medium", progress: 0, nextStep: "", notes: "", tasks: [], links: [] };
  const isUni = p.category === "University";

  const sheet = openSheet(`<form class="editor" id="editor">
    <div class="row between sheet-head"><h3>${existing ? "Edit" : "New"} ${esc(p.category.toLowerCase())} item</h3>
      <button type="button" class="x-btn big-x" data-close aria-label="Close">×</button></div>

    <label class="field">Name<input name="name" required value="${esc(p.name)}"></label>
    <div class="field-row">
      <label class="field">Status<select name="status">${["idea", "active", "paused", "done"].map((s) => option(s, p.status)).join("")}</select></label>
      <label class="field">Priority<select name="priority">${["high", "medium", "low"].map((s) => option(s, p.priority || "medium")).join("")}</select></label>
      <label class="field">Section<select name="category">${["Business", "University", "Personal"].map((s) => option(s, p.category)).join("")}</select></label>
    </div>
    <label class="field">Progress <output id="prog-out">${Number(p.progress) || 0}%</output>
      <input type="range" name="progress" min="0" max="100" step="5" value="${Number(p.progress) || 0}"></label>
    <label class="field">Next step<textarea name="nextStep" rows="2">${esc(p.nextStep || "")}</textarea></label>
    ${isUni ? `<label class="field">Studying now<input name="studyingNow" value="${esc(p.studyingNow || "")}"></label>` : ""}
    <label class="field">Deadline<input type="date" name="deadline" value="${esc(p.deadline || "")}"></label>
    <label class="field">Notes<textarea name="notes" rows="2">${esc(p.notes || "")}</textarea></label>

    ${(p.goals || []).length ? `<div class="field"><span>Goals</span>${p.goals.map(goalRow).join("")}</div>` : ""}

    <div class="field"><span>Dates to remember (exams, assignments…)</span>
      <div id="task-rows">${(p.tasks || []).map(taskRow).join("")}</div>
      <button type="button" class="add-btn" id="add-task">+ Add date</button>
    </div>

    <div class="row between sheet-actions">
      ${existing ? `<button type="button" class="ghost-btn danger" id="delete-btn">Delete</button>` : "<span></span>"}
      <button type="submit" class="enter-btn save-btn">Save</button>
    </div>
  </form>`);

  const form = sheet.querySelector("#editor");
  form.progress.addEventListener("input", () => (sheet.querySelector("#prog-out").textContent = form.progress.value + "%"));
  sheet.querySelector("#add-task").addEventListener("click", () => sheet.querySelector("#task-rows").insertAdjacentHTML("beforeend", taskRow()));
  sheet.addEventListener("click", (e) => { const x = e.target.closest("[data-remove-row]"); if (x) x.closest(".task-row").remove(); });

  const del = sheet.querySelector("#delete-btn");
  if (del) del.addEventListener("click", () => {
    if (!del.dataset.armed) { del.dataset.armed = "1"; del.textContent = "Tap again to delete"; return; }
    closeSheet();
    save((d) => { d.projects = (d.projects || []).filter((x) => x.name !== name); }, `Deleted ${name}`);
  });

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const f = form.elements;
    const newName = f.name.value.trim();
    if (!newName) return;
    if (newName !== name && findProject(state.data, newName)) { toast("Another item already has that name.", true); return; }

    const values = {
      name: newName,
      category: f.category.value,
      status: f.status.value,
      priority: f.priority.value,
      progress: Number(f.progress.value),
      nextStep: f.nextStep.value.trim(),
      deadline: f.deadline.value,
      notes: f.notes.value.trim(),
      tasks: [...sheet.querySelectorAll(".task-row")]
        .map((r) => ({ title: r.querySelector(".t-title").value.trim(), date: r.querySelector(".t-date").value, type: r.querySelector(".t-type").value, done: r.querySelector(".t-done").checked }))
        .filter((t) => t.title)
        .map((t) => (t.done ? t : { title: t.title, date: t.date, type: t.type })),
    };
    if (f.studyingNow) values.studyingNow = f.studyingNow.value.trim();
    const goals = [...sheet.querySelectorAll(".goal-row")].map((r) => ({ label: r.dataset.label, start: Number(r.querySelector(".g-start").value), target: Number(r.querySelector(".g-target").value) }));

    closeSheet();
    save((d) => {
      let target = name ? findProject(d, name) : null;
      if (!target) { target = { links: [] }; (d.projects ||= []).push(target); }
      Object.assign(target, values);
      for (const g of goals) {
        const goal = (target.goals || []).find((x) => x.label === g.label);
        if (goal) { if (Number.isFinite(g.start)) goal.start = g.start; if (Number.isFinite(g.target)) goal.target = g.target; delete goal.example; }
      }
    }, `${name ? "Updated" : "Added"} ${newName}`);
  });
}

function openSyncSheet(reason = "") {
  const connected = !!tokenStore.get();
  const sheet = openSheet(`<div class="editor">
    <div class="row between sheet-head"><h3>Saving on this device</h3>
      <button type="button" class="x-btn big-x" data-close aria-label="Close">×</button></div>
    ${reason ? `<p class="sync-reason">${esc(reason)}</p>` : ""}
    <p class="muted">${connected ? "This device is connected. Your changes save to GitHub and show on all your devices." :
      "Changes are saved to your GitHub site, so they show on your phone, iPad and PC. Each device needs your GitHub key once."}</p>
    <ol class="steps">
      <li>On GitHub, open <a href="https://github.com/settings/personal-access-tokens/new" target="_blank" rel="noopener">Settings → Developer settings → Fine-grained tokens → Generate new token</a>.</li>
      <li>Name it <b>Gerardo HQ</b>, set an expiration (up to 1 year), and under <b>Repository access</b> choose <b>Only select repositories → gerardo-hq</b>.</li>
      <li>Under <b>Permissions → Repository permissions</b> set <b>Contents</b> to <b>Read and write</b>. Click <b>Generate token</b> and copy it.</li>
      <li>Paste it below. Keep a copy in a safe place (like your password manager) for your other devices.</li>
    </ol>
    <form id="sync-form" class="field">
      <input id="token-input" type="password" autocomplete="off" spellcheck="false" placeholder="${connected ? "Connected ✓ (paste a new key to replace it)" : "Paste your GitHub key (github_pat_…)"}">
      <button type="submit" class="enter-btn save-btn">Connect this device</button>
      <p class="lock-msg" id="sync-msg"></p>
    </form>
    ${connected ? `<button type="button" class="ghost-btn danger" id="disconnect-btn">Disconnect this device</button>` : ""}
  </div>`);

  const msg = sheet.querySelector("#sync-msg");
  sheet.querySelector("#sync-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const token = sheet.querySelector("#token-input").value.trim();
    if (!token) return;
    msg.textContent = "Checking…";
    try {
      const r = await fetch(`https://api.github.com/repos/${REPO}`, { headers: githubHeaders(token), cache: "no-store" });
      if (!r.ok) throw new Error(r.status === 401 ? "GitHub doesn't accept that key." : `GitHub said ${r.status}.`);
      const repo = await r.json();
      if (!repo.permissions?.push) throw new Error("That key can only read. Set Contents to Read and write.");
      const { locked } = await fetchRemote(token);
      await unlock(locked, state.code);
      tokenStore.set(token);
      msg.textContent = "";
      closeSheet();
      toast("Connected ✓ This device can now save changes.");
    } catch (err) {
      msg.textContent = err.message || "That didn't work. Check the key and try again.";
    }
  });
  const disconnect = sheet.querySelector("#disconnect-btn");
  if (disconnect) disconnect.addEventListener("click", () => { tokenStore.clear(); closeSheet(); toast("This device is disconnected. Changes won't save here."); });
}

document.getElementById("sync-btn").addEventListener("click", () => openSyncSheet());

function showLoadError(err) {
  const fileMode = location.protocol === "file:";
  view.innerHTML = `<article class="card error">
    <h3>Couldn't load your data</h3>
    ${fileMode
      ? `<p>Browsers block pages opened by double-click from reading other files. Open the site with the included starter instead:</p>
         <ol><li>Close this tab.</li><li>Double-click <code>start-website.bat</code> in the same folder.</li><li>The site opens at <code>http://localhost:8080</code>.</li></ol>`
      : `<p><code>data.locked.json</code> is missing. Ask Claude to run the lock step, then upload <code>data.locked.json</code>.</p>`}
    <p class="muted" style="font-size:.8rem">Details: ${esc(err && err.message)}</p>
  </article>`;
}

// ---------- secret code lock ----------
// The site only ever downloads data.locked.json, which can't be read without the code.

const SAVED_CODE = "gerardo-hq-code";

const storage = {
  get() { try { return localStorage.getItem(SAVED_CODE); } catch { return null; } },
  set(code) { try { localStorage.setItem(SAVED_CODE, code); } catch {} },
  clear() { try { localStorage.removeItem(SAVED_CODE); } catch {} },
};

const fromB64 = (text) => Uint8Array.from(atob(text), (c) => c.charCodeAt(0));

async function unlock(locked, code) {
  const enc = new TextEncoder();
  const base = await crypto.subtle.importKey("raw", enc.encode(code), "PBKDF2", false, ["deriveKey"]);
  const key = await crypto.subtle.deriveKey(
    { name: "PBKDF2", salt: fromB64(locked.salt), iterations: locked.iterations, hash: "SHA-256" },
    base, { name: "AES-GCM", length: 256 }, false, ["decrypt"]
  );
  const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv: fromB64(locked.iv) }, key, fromB64(locked.data));
  return JSON.parse(new TextDecoder().decode(plain));
}

function start(data, code) {
  document.body.classList.remove("locked");
  state.data = data;
  state.code = code;
  if (data.owner) document.getElementById("title").textContent = `${data.owner}'s Command Center`;
  if (data.tagline) document.getElementById("today").textContent += ` · ${data.tagline}`;
  render();
}

function showLockScreen(locked, message = "") {
  document.body.classList.add("locked");
  view.innerHTML = `<form class="card dark lock-card" id="lock-form" autocomplete="off">
    <span class="brand-dot lock-dot"></span>
    <h3>Enter your code</h3>
    <p class="muted">Gerardo HQ is private.</p>
    <input id="code" type="password" class="code-input" placeholder="Secret code" autocomplete="current-password" autocapitalize="none" spellcheck="false" required>
    <label class="remember"><input id="remember" type="checkbox" checked> Remember on this device</label>
    <button type="submit" class="enter-btn">Enter</button>
    <p class="lock-msg" id="lock-msg">${esc(message)}</p>
  </form>`;
  const input = document.getElementById("code");
  input.focus();

  document.getElementById("lock-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const msg = document.getElementById("lock-msg");
    const button = e.target.querySelector("button");
    const code = input.value.trim();
    button.disabled = true;
    msg.textContent = "Unlocking…";
    try {
      const data = await unlock(locked, code);
      if (document.getElementById("remember").checked) storage.set(code);
      start(data, code);
    } catch {
      msg.textContent = "Wrong code. Try again.";
      input.select();
    } finally {
      button.disabled = false;
    }
  });
}

document.getElementById("lock-btn").addEventListener("click", () => {
  storage.clear();
  location.reload();
});

async function init() {
  const t = today();
  document.getElementById("today").textContent = `${DAY_NAMES[t.getDay()]}, ${t.getDate()} ${MONTHS[t.getMonth()]} ${t.getFullYear()}`;
  state.tab = TABS.includes(location.hash.slice(1)) ? location.hash.slice(1) : "overview";

  // A connected device reads the newest copy straight from GitHub;
  // otherwise use the published file (which can lag a minute or two behind).
  let locked;
  const token = tokenStore.get();
  if (token) {
    try { ({ locked } = await fetchRemote(token)); } catch {}
  }
  if (!locked) {
    try {
      const r = await fetch("data.locked.json", { cache: "no-store" });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      locked = await r.json();
    } catch (err) {
      return showLoadError(err);
    }
  }

  const saved = storage.get();
  if (saved) {
    try {
      return start(await unlock(locked, saved), saved);
    } catch {
      storage.clear(); // the code changed since this device saved it
    }
  }
  showLockScreen(locked);
}

init();
