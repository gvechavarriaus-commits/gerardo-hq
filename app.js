// Command Center — reads data.json and builds every view from it.
// You never need to edit this file: all your information lives in data.json.

const TABS = ["overview", "business", "university", "personal", "stocks", "calendar"];
const PRIORITY_RANK = { high: 0, medium: 1, low: 2 };
const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const state = { data: null, tab: "overview", query: "", status: "all", weekOffset: 0 };
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
    for (const t of p.tasks || []) {
      const td = parseDate(t.date);
      if (td && !t.done) items.push({ date: td, title: t.title, project: p, type: t.type || "task", example: t.example });
    }
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

function projectCard(p, i, extra = "") {
  const dark = p.status === "active" && p.priority === "high";
  const due = parseDate(p.deadline);
  return `<article class="card${dark ? " dark" : ""}" style="--i:${i}">
    <div class="row between">
      <div class="row">${statusPill(p)}${priorityPill(p)}</div>
      ${due && p.status !== "done" ? `<span class="row">${duePill(due)}</span>` : ""}
    </div>
    <h3 style="margin-top:12px">${esc(p.name)}</h3>
    ${nextStepHtml(p)}
    ${extra}
    ${progressBar(p.progress)}
    ${p.notes ? `<p class="notes">${esc(p.notes)}</p>` : ""}
    ${linksHtml(p)}
  </article>`;
}

function itemRow(item, showProject = true) {
  const d = item.date;
  return `<li>
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
  const head = sectionTitle(title, `${list.length} ${sub}`);
  if (!list.length) return head + `<div class="cards">${emptyState("No matches for this search or filter.")}</div>`;

  if (cat === "university") return head + `<div class="cards">${list.map(courseCard).join("")}</div>`;
  if (cat === "personal") return head + `<div class="cards">${list.map(personalCard).join("")}</div>`;
  return head + `<div class="cards">${list.map((p, i) => projectCard(p, i)).join("")}</div>`;
}

function courseCard(p, i) {
  const tasks = (p.tasks || [])
    .map((t) => ({ ...t, d: parseDate(t.date) }))
    .filter((t) => t.d)
    .sort((a, b) => a.d - b.d);
  const upcoming = tasks.filter((t) => !t.done && daysUntil(t.d) >= 0);
  const soonest = upcoming[0];
  const dark = soonest && daysUntil(soonest.d) <= 3;

  const taskList = upcoming.length
    ? `<ul class="list" style="margin-top:12px">${upcoming.map((t) => itemRow({ date: t.d, title: t.title, type: t.type || "task", project: p, example: t.example }, false)).join("")}</ul>`
    : `<p class="muted" style="margin-top:12px">No upcoming exams or assignments.</p>`;

  return `<article class="card${dark ? " dark" : ""}" style="--i:${i}">
    <div class="row between">
      <div class="row">${statusPill(p)}</div>
      ${soonest ? `<span class="row">${duePill(soonest.d, soonest.example)}</span>` : ""}
    </div>
    <h3 style="margin-top:12px">${esc(p.name)}</h3>
    ${p.studyingNow ? `<p class="next"><small>Studying now</small>${esc(p.studyingNow)}</p>` : ""}
    ${p.nextStep && p.nextStep !== p.studyingNow ? `<p class="notes">Next: ${esc(p.nextStep)}</p>` : ""}
    ${taskList}
    ${progressBar(p.progress, "Course progress")}
    ${p.notes ? `<p class="notes">${esc(p.notes)}</p>` : ""}
    ${linksHtml(p)}
  </article>`;
}

function goalPct(g) {
  const start = Number(g.start), current = Number(g.current), target = Number(g.target);
  if (![start, current, target].every(Number.isFinite) || target === start) return 0;
  return clamp(((current - start) / (target - start)) * 100, 0, 100);
}

function personalCard(p, i) {
  const goals = (p.goals || [])
    .map((g) => `<div class="goal">
        ${progressBar(goalPct(g), `${g.label}: ${g.current} → ${g.target} ${g.unit || ""}`.trim(), true)}
        ${g.example ? `<div class="row" style="margin-top:6px">${exampleTag()}<span class="muted" style="font-size:.78rem">started at ${esc(g.start)} ${esc(g.unit || "")}</span></div>` : ""}
      </div>`)
    .join("");
  return projectCard(p, i, goals);
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

window.addEventListener("hashchange", () => setTab(location.hash.slice(1)));

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

function start(data) {
  document.body.classList.remove("locked");
  state.data = data;
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
      start(data);
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

  let locked;
  try {
    const r = await fetch("data.locked.json", { cache: "no-store" });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    locked = await r.json();
  } catch (err) {
    return showLoadError(err);
  }

  const saved = storage.get();
  if (saved) {
    try {
      return start(await unlock(locked, saved));
    } catch {
      storage.clear(); // the code changed since this device saved it
    }
  }
  showLockScreen(locked);
}

init();
