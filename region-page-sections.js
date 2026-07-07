/* ============================================================
   BASOFU — REGION PAGE SCRIPT (region-page.js)
   Hosted on GitHub, served via jsDelivr CDN.

   Set these window variables in the Code Block before loading:
     window.BSF_REGION  — e.g. "Fogo"
     window.BSF_BIO     — HTML string for the region bio paragraph(s)
     window.BSF_SEASON  — (optional) override season e.g. "2025/26"

   Renders:
   1. Region header with bio
   2. Live / Upcoming / Recent results carousel
   3. Last champions (from honours sheet)
   4. League table + competition tabs (standings)
   5. News carousel (Squarespace blog posts tagged with region name)
============================================================ */
(async function () {
"use strict";

/* ── CONFIG ─────────────────────────────────────────────── */
const REGION  = window.BSF_REGION || "Fogo";
const BIO     = window.BSF_BIO    || "";
const API_SECRET = window.BASOFU?.API_SECRET || window.BSF_SECRET || "";

/* ── WAIT FOR BASOFU GLOBAL ─────────────────────────────── */
function waitForBasofu() {
  return new Promise((resolve, reject) => {
    if (window.BASOFU) return resolve(window.BASOFU);
    const t0 = Date.now();
    const iv = setInterval(() => {
      if (window.BASOFU) { clearInterval(iv); resolve(window.BASOFU); }
      else if (Date.now() - t0 > 10000) { clearInterval(iv); reject(new Error("BASOFU global not found")); }
    }, 50);
  });
}

/* ── HELPERS ────────────────────────────────────────────── */
function esc(s) {
  return String(s||"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
}
function norm(s) { return (s||"").trim().toLowerCase(); }
function toDate(s) { const d = new Date(s); return isNaN(d) ? null : d; }
function fmtDate(s) {
  if (!s) return "";
  const iso = String(s).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const d = iso ? new Date(+iso[1], +iso[2]-1, +iso[3]) : new Date(s);
  if (isNaN(d)) return s;
  return d.toLocaleDateString("pt-CV", { day:"numeric", month:"short", year:"numeric" });
}
function extractImgSrc(raw) {
  if (!raw) return "";
  const m = String(raw).match(/src\s*=\s*["']\s*([^"'\s]+)\s*["']/i);
  if (m) return m[1].trim();
  if (/^https?:\/\//i.test(raw.trim())) return raw.trim();
  return "";
}

function isFinished(m) {
  const g = (m.gp||m["Game Progress"]||"").trim();
  return g === "FT" || (m.hg !== null && m.ag !== null && m.hg !== undefined && m.ag !== undefined && g !== "");
}
function isLive(m) {
  const g = (m.gp||m["Game Progress"]||"").trim();
  return !isNaN(g) && g !== "" && g !== "FT";
}
function isUpcoming(m) {
  return !isFinished(m) && !isLive(m);
}

/* ── MOUNT ──────────────────────────────────────────────── */
const root = document.getElementById("bsf-region-root");
if (!root) { console.error("[Basofu] #bsf-region-root not found"); return; }
root.innerHTML = `<p class="bsf-region__loading">Loading…</p>`;

try {

/* ── FETCH DATA IN PARALLEL ─────────────────────────────── */
const BASOFU = await waitForBasofu();

const [resultsData, honoursData, clubsData] = await Promise.all([
  BASOFU.getResults(REGION),
  BASOFU.getHonorsRaw(),
  BASOFU.getClubsMeta(REGION)
]);

/* ── NORMALISE RESULTS ──────────────────────────────────── */
const normRow = r => ({
  date:       r.date       || r["Date"]           || "",
  season:     r.season     || r["Season"]         || "",
  week:       r.week       || r["Week"]           || "",
  league:     r.league     || r["League"]         || "",
  division:   r.division   || r["Division"]       || "1",
  homeShort:  r.homeShort  || r["Home Short"]     || r.homeFull || "",
  awayShort:  r.awayShort  || r["Away Short"]     || r.awayFull || "",
  homeFull:   r.homeFull   || r["Home Team Full"] || "",
  awayFull:   r.awayFull   || r["Away Team Full"] || "",
  homeLogo:   extractImgSrc(r.homeLogo || r["Home Logo"] || ""),
  awayLogo:   extractImgSrc(r.awayLogo || r["Away Logo"] || ""),
  hg:         r.hg !== undefined ? r.hg : (r["Home Goals"] !== "" ? Number(r["Home Goals"]) : null),
  ag:         r.ag !== undefined ? r.ag : (r["Away Goals"] !== "" ? Number(r["Away Goals"]) : null),
  gp:         r.gp         || r["Game Progress"]  || "",
});

const allRows = resultsData.map(normRow);

/* Determine current/latest season */
const seasons = [...new Set(allRows.map(r => r.season).filter(Boolean))]
  .sort((a,b) => String(b).localeCompare(String(a)));
const SEASON = window.BSF_SEASON || seasons[0] || "";

const seasonRows = allRows.filter(r => r.season === SEASON);

/* ── BUILD CLUB PAGE MAP ────────────────────────────────── */
const clubPageMap = {};
const clubLogoMap = {};
(clubsData || []).forEach(c => {
  const key  = norm(c.shortName || c["Short Name"] || "");
  const page = (c.page || c["Page"] || "").trim();
  const logo = extractImgSrc(c.logo || c["Logo"] || "");
  if (key && page)  clubPageMap[key]  = page;
  if (key && logo)  clubLogoMap[key]  = logo;
});

/* ── LAST CHAMPIONS ─────────────────────────────────────── */
function normSeason(val) {
  if (!val) return "";
  const s = String(val).trim();
  if (/^\d{4}\/\d{2}$/.test(s)) return s;
  try { const d = new Date(s); if (!isNaN(d)) { const y = d.getFullYear(); return `${y}/${String(y+1).slice(2)}`; } } catch(e) {}
  return s;
}

/* Group champions by competition for this region */
const champsByComp = {};
(honoursData || []).forEach(r => {
  const loc     = (r.location || r["Location"] || "").trim().toLowerCase();
  const comp    = (r.competition || r["Competition"] || "").trim();
  const winner  = (r.winner || r["Winner"] || "").trim();
  const year    = normSeason(r.year || r["Year"] || "");
  const skip    = new Set(["not known","not held","unknown","tbd","n/a",""]);
  if (skip.has(winner.toLowerCase())) return;
  /* Include if location matches region OR competition mentions region */
  const regionLow = REGION.toLowerCase();
  if (!loc.includes(regionLow) && !comp.toLowerCase().includes(regionLow)) return;
  if (!champsByComp[comp]) champsByComp[comp] = [];
  champsByComp[comp].push({ year, winner });
});

/* Sort competitions: league first, then cups */
const sortedComps = Object.keys(champsByComp).sort((a,b) => {
  const score = s => /campeonato|liga regional/i.test(s) ? 0 : /ta[çc]a/i.test(s) ? 1 : 2;
  return score(a) - score(b);
});

const champHTML = sortedComps.length ? `
  <div class="bsf-region__section">
    <div class="bsf-region__section-label">Champions</div>
  </div>
  <div class="bsf-region__champs">
    ${sortedComps.map(comp => {
      const entries = champsByComp[comp].sort((a,b) => String(b.year).localeCompare(String(a.year)));
      const latest  = entries[0];
      const prev    = entries.slice(1, 4);
      return `
        <div class="bsf-region__champ-card">
          <div class="bsf-region__champ-comp">${esc(comp)}</div>
          <div class="bsf-region__champ-winner">${esc(latest.winner)}</div>
          <div class="bsf-region__champ-year">${esc(latest.year)}</div>
          ${prev.length ? `<div class="bsf-region__champ-prev">
            ${prev.map(e => `<span>${esc(e.winner)} <em>${esc(e.year)}</em></span>`).join("")}
          </div>` : ""}
        </div>`;
    }).join("")}
  </div>` : "";

/* ── MATCH CARD HTML ────────────────────────────────────── */
function matchCard(m, type) {
  const minute = type === "live" ? (() => {
    const g = String(m.gp||"").trim();
    return !isNaN(g) && g !== "" ? `${g}′` : "LIVE";
  })() : "";

  const hScore = type !== "upcoming" && m.hg !== null ? m.hg : "";
  const aScore = type !== "upcoming" && m.ag !== null ? m.ag : "";

  const hLogo  = m.homeLogo || clubLogoMap[norm(m.homeShort)] || "";
  const aLogo  = m.awayLogo || clubLogoMap[norm(m.awayShort)] || "";
  const hPage  = clubPageMap[norm(m.homeShort)] || "";
  const aPage  = clubPageMap[norm(m.awayShort)] || "";

  const hName = hPage
    ? `<a href="${esc(hPage)}" class="bsf-region__card-team-link">${esc(m.homeShort)}</a>`
    : esc(m.homeShort);
  const aName = aPage
    ? `<a href="${esc(aPage)}" class="bsf-region__card-team-link">${esc(m.awayShort)}</a>`
    : esc(m.awayShort);

  return `
    <div class="bsf-region__card bsf-region__card--${type}">
      <div class="bsf-region__card-meta">
        ${type === "live" ? `<span class="bsf-region__live-dot"></span>` : ""}
        ${esc(fmtDate(m.date))} · ${esc(m.league)}
        ${minute ? `· <strong>${minute}</strong>` : ""}
      </div>
      <div class="bsf-region__card-match">
        <div class="bsf-region__card-team">
          ${hLogo ? `<img src="${esc(hLogo)}" class="bsf-region__card-logo" alt="">` : ""}
          <span>${hName}</span>
        </div>
        <div class="bsf-region__card-score">${hScore !== "" ? hScore : "–"}</div>
        <div class="bsf-region__card-vs">v</div>
        <div class="bsf-region__card-score">${aScore !== "" ? aScore : "–"}</div>
        <div class="bsf-region__card-team bsf-region__card-team--away">
          ${aLogo ? `<img src="${esc(aLogo)}" class="bsf-region__card-logo" alt="">` : ""}
          <span>${aName}</span>
        </div>
      </div>
    </div>`;
}

function matchRow(title, id, matches, type) {
  if (!matches.length) return "";
  return `
    <div class="bsf-region__section">
      <div class="bsf-region__section-label">${title}</div>
    </div>
    <div class="bsf-region__carousel-wrap">
      <button class="bsf-region__carousel-btn" onclick="document.getElementById('${id}').scrollBy({left:-320,behavior:'smooth'})">◀</button>
      <div class="bsf-region__carousel" id="${id}">
        ${matches.map(m => matchCard(m, type)).join("")}
      </div>
      <button class="bsf-region__carousel-btn" onclick="document.getElementById('${id}').scrollBy({left:320,behavior:'smooth'})">▶</button>
    </div>`;
}

/* Sort and slice matches */
const dated = r => ({ ...r, _d: toDate(r.date) });
const live     = seasonRows.filter(isLive).map(dated).filter(r=>r._d).sort((a,b)=>a._d-b._d).slice(0,20);
const upcoming = seasonRows.filter(r=>!isLive(r)&&isUpcoming(r)).map(dated).filter(r=>r._d).sort((a,b)=>a._d-b._d).slice(0,20);
const recent   = seasonRows.filter(r=>!isLive(r)&&isFinished(r)).map(dated).filter(r=>r._d).sort((a,b)=>b._d-a._d).slice(0,20);

/* ── NEWS CAROUSEL ──────────────────────────────────────── */
async function loadNews() {
  const tag = encodeURIComponent(REGION.toLowerCase());
  try {
    const res = await fetch(`/articles?tag=${tag}&format=json`, { cache: "no-store" });
    if (!res.ok) return [];
    const json = await res.json();
    return (json.items || [])
      .filter(p => (p.tags||[]).some(t => norm(t) === norm(REGION)))
      .slice(0, 8);
  } catch(e) { return []; }
}

const newsItems = await loadNews();

const newsHTML = newsItems.length ? `
  <div class="bsf-region__section">
    <div class="bsf-region__section-label">News</div>
  </div>
  <div class="bsf-region__carousel-wrap">
    <button class="bsf-region__carousel-btn" onclick="document.getElementById('bsf-news-${norm(REGION).replace(/\s/g,"-")}').scrollBy({left:-320,behavior:'smooth'})">◀</button>
    <div class="bsf-region__carousel" id="bsf-news-${norm(REGION).replace(/\s/g,"-")}">
      ${newsItems.map(p => {
        const img   = p.assetUrl || "";
        const title = esc(p.title || "");
        const url   = esc(p.fullUrl || p.url || "#");
        const date  = p.publishOn ? fmtDate(new Date(p.publishOn).toISOString().slice(0,10)) : "";
        return `
          <a href="${url}" class="bsf-region__news-card">
            ${img ? `<div class="bsf-region__news-img" style="background-image:url('${esc(img)}')"></div>` : `<div class="bsf-region__news-img bsf-region__news-img--empty"></div>`}
            <div class="bsf-region__news-body">
              ${date ? `<div class="bsf-region__news-date">${date}</div>` : ""}
              <div class="bsf-region__news-title">${title}</div>
            </div>
          </a>`;
      }).join("")}
    </div>
    <button class="bsf-region__carousel-btn" onclick="document.getElementById('bsf-news-${norm(REGION).replace(/\s/g,"-")}').scrollBy({left:320,behavior:'smooth'})">▶</button>
  </div>` : "";

/* ── ASSEMBLE PAGE ──────────────────────────────────────── */
root.innerHTML = `
  ${BIO ? `
    <div class="bsf-region__bio">${BIO}</div>
  ` : ""}

  ${live.length ? matchRow("Live", `bsf-live-${REGION.replace(/\s/g,"-")}`, live, "live") : ""}
  ${upcoming.length ? matchRow("Upcoming", `bsf-upcoming-${REGION.replace(/\s/g,"-")}`, upcoming, "upcoming") : ""}
  ${recent.length ? matchRow("Recent Results", `bsf-recent-${REGION.replace(/\s/g,"-")}`, recent, "recent") : ""}

  ${champHTML}

  ${newsHTML}

  <div class="bsf-region__section">
    <div class="bsf-region__section-label">Standings</div>
  </div>
  <div id="bsf-standings-outer">
    <!-- Controls -->
    <div id="basofu-controls" style="margin-bottom:1rem;display:flex;flex-wrap:wrap;gap:0.75rem;align-items:center;">
      <label>Season: <select id="basofu-season-select"></select></label>
    </div>
    <div id="basofu-competition-tabs" style="margin-bottom:1rem;"></div>
    <div id="basofu-league-container" class="responsive-results">
      <p style="opacity:0.7;">Loading standings…</p>
    </div>
  </div>
`;

/* Standings loaded by separate region-standings.js script tag */

/* ── LIVE REFRESH ───────────────────────────────────────── */
if (live.length) {
  setInterval(async () => {
    try {
      const fresh = await BASOFU.getResults(REGION);
      const freshRows = fresh.map(normRow);
      const freshSeason = freshRows.filter(r => r.season === SEASON);
      const freshLive = freshSeason.filter(isLive).map(dated).filter(r=>r._d).sort((a,b)=>a._d-b._d).slice(0,20);
      const el = document.getElementById(`bsf-live-${REGION.replace(/\s/g,"-")}`);
      if (el && freshLive.length) {
        el.innerHTML = freshLive.map(m => matchCard(m, "live")).join("");
      }
    } catch(e) {}
  }, 60000);
}

} catch(err) {
  console.error("[Basofu region]", err);
  root.innerHTML = `<p style="color:red;">Error loading region: ${esc(err.message)}</p>`;
}

})();
