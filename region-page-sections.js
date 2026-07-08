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

/* Guard against Squarespace rendering the code block twice */
if (window.__basofuSectionsRunning) return;
window.__basofuSectionsRunning = true;

const REGION  = window.BSF_REGION || "";
const BIO     = window.BSF_BIO    || "";

if (!REGION) {
  document.getElementById("bsf-region-root").innerHTML =
    "<p style='color:red;'>Region not configured — set window.BSF_REGION before loading this script.</p>";
  return;
}
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
  const g = String(m.gp || "").trim();
  /* Must have both goals AND game progress of FT (or blank gp with goals) */
  const hasGoals = m.hg !== null && m.hg !== undefined && m.hg !== "" &&
                   m.ag !== null && m.ag !== undefined && m.ag !== "";
  return hasGoals && (g === "FT" || g === "" || g === "0");
}
function isLive(m) {
  const g = String(m.gp || "").trim();
  return g !== "" && g !== "FT" && !isNaN(Number(g));
}
function isUpcoming(m) {
  const g = String(m.gp || "").trim();
  const hasGoals = m.hg !== null && m.hg !== undefined && m.hg !== "" &&
                   m.ag !== null && m.ag !== undefined && m.ag !== "";
  /* Upcoming: no goals yet, and gp is blank or literally "Upcoming" */
  return !hasGoals && !isLive(m);
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
  season:     normSeason(r.season || r["Season"] || ""),
  week:       r.week       || r["Week"]           || "",
  region:     r.region     || r["Region"]         || "",
  league:     r.league     || r["League"]         || "",
  division:   r.division   || r["Division"]       || "1",
  homeShort:  r.homeShort  || r["Home Short"]     || r.homeFull || "",
  awayShort:  r.awayShort  || r["Away Short"]     || r.awayFull || "",
  homeFull:   r.homeFull   || r["Home Team Full"] || "",
  awayFull:   r.awayFull   || r["Away Team Full"] || "",
  homeLogo:   extractImgSrc(r.homeLogo || r["Home Logo"] || ""),
  awayLogo:   extractImgSrc(r.awayLogo || r["Away Logo"] || ""),
  hg:         (r.hg !== null && r.hg !== undefined && r.hg !== "") ? Number(r.hg) : null,
  ag:         (r.ag !== null && r.ag !== undefined && r.ag !== "") ? Number(r.ag) : null,
  gp:         r.gp         || r["Game Progress"]  || "",
});

const allRows = resultsData.map(normRow);

/* Determine current/latest season */
const seasons = [...new Set(allRows.map(r => r.season).filter(Boolean))]
  .sort((a, b) => {
    /* Sort "2025/26" > "2024/25" etc by the start year */
    const ya = parseInt(String(a)) || 0;
    const yb = parseInt(String(b)) || 0;
    return yb - ya;
  });
const SEASON = window.BSF_SEASON || seasons[0] || "";

const seasonRows = allRows.filter(r => r.season === SEASON);

/* ── DIAGNOSTICS ─────────────────────────────────────────── */
console.log("[Basofu] REGION:", REGION, "| SEASON:", SEASON);
console.log("[Basofu] allRows:", allRows.length, "| seasonRows:", seasonRows.length);
const _sample = seasonRows.slice(0, 3).map(r => ({
  date: r.date, season: r.season, hg: r.hg, ag: r.ag, gp: r.gp,
  finished: isFinished(r), live: isLive(r), upcoming: isUpcoming(r)
}));
console.log("[Basofu] sample rows:", JSON.stringify(_sample, null, 2));

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

/* ── CHAMPIONS ───────────────────────────────────────────── */
/* Build list of competitions that have ever been played in this region
   by scanning the results sheet — covers Campeonato, Taça, Supertaça,
   Torneio de Abertura, etc. without hardcoding anything */
const regionComps = new Set(
  allRows
    .filter(r => norm(r.region) === norm(REGION))
    .map(r => r.league.trim())
    .filter(Boolean)
);

/* Group champions by competition from honours sheet */
const champsByComp = {};
(honoursData || []).forEach(r => {
  const loc    = (r.location || r["Location"] || "").trim().toLowerCase();
  const comp   = (r.competition || r["Competition"] || "").trim();
  const winner = (r.winner || r["Winner"] || "").trim();
  const year   = normSeason(r.year || r["Year"] || "");
  const skip   = new Set(["not known","not held","unknown","tbd","n/a",""]);
  if (skip.has(winner.toLowerCase())) return;
  const regionLow = REGION.toLowerCase();
  /* Match by location OR competition name containing region name
     OR competition appears in the results sheet for this region */
  if (!loc.includes(regionLow) &&
      !comp.toLowerCase().includes(regionLow) &&
      !regionComps.has(comp)) return;
  if (!champsByComp[comp]) champsByComp[comp] = [];
  champsByComp[comp].push({ year, winner });
});

/* Sort competitions: Campeonato → Torneio → Taça → Supertaça → rest */
const compOrder = s => {
  const l = s.toLowerCase();
  if (/campeonato|liga regional/i.test(l)) return 0;
  if (/torneio/i.test(l))                  return 1;
  if (/ta[çc]a/i.test(l))                  return 2;
  if (/supertaça|supertaca|super.?ta/i.test(l)) return 3;
  return 4;
};
const sortedComps = Object.keys(champsByComp).sort((a,b) => compOrder(a) - compOrder(b));

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
/* ── H2H COMPUTATION ─────────────────────────────────────── */
function computeH2H(rows, homeTeam, awayTeam, count) {
  count = count || 6;
  homeTeam = (homeTeam || "").trim().toLowerCase();
  awayTeam = (awayTeam || "").trim().toLowerCase();
  const finished = rows.filter(r =>
    r.hg !== null && r.ag !== null &&
    ((norm(r.homeShort) === homeTeam && norm(r.awayShort) === awayTeam) ||
     (norm(r.homeShort) === awayTeam && norm(r.awayShort) === homeTeam))
  );
  return finished
    .map(r => ({ ...r, _d: toDate(r.date) }))
    .filter(r => r._d)
    .sort((a, b) => b._d - a._d)
    .slice(0, count)
    .reverse()
    .map(r => {
      const fromHome = norm(r.homeShort) === homeTeam;
      const diff = fromHome ? (r.hg - r.ag) : (r.ag - r.hg);
      return { diff, date: r.date };
    });
}

function renderH2HSVG(points, homeLabel) {
  if (!points.length) return `<div style="font-size:11px;color:#999;">No head-to-head data.</div>`;
  const w = 180, h = 80, pad = 8, baseY = Math.round(h / 2);
  const maxAbs = Math.max(1, ...points.map(p => Math.abs(p.diff)));
  const barW = Math.max(8, Math.floor((w - pad*2) / points.length) - 4);
  const gap = 4;
  const bars = points.map((p, i) => {
    if (p.diff === 0) return "";
    const x = pad + i * (barW + gap);
    const barH = Math.round((Math.abs(p.diff) / maxAbs) * (baseY - pad));
    const y = p.diff > 0 ? (baseY - barH) : baseY;
    return `<rect x="${x}" y="${y}" width="${barW}" height="${barH}" rx="2" style="fill:#003893;"/>`;
  }).join("");
  const labels = points.map((p, i) => {
    const x = pad + i*(barW+gap) + Math.floor(barW/2);
    const y = p.diff >= 0 ? (baseY - 2) : (baseY + 12);
    return `<text x="${x}" y="${y}" text-anchor="middle" font-size="10" fill="#333">${p.diff}</text>`;
  }).join("");
  return `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" style="display:block;">
    <line x1="${pad}" y1="${baseY}" x2="${w-pad}" y2="${baseY}" stroke="#ccc"/>
    ${bars}${labels}
  </svg>`;
}

/* Shared tooltip for H2H hover */
let _h2hTip = null;
function getH2HTip() {
  if (_h2hTip) return _h2hTip;
  _h2hTip = document.createElement("div");
  Object.assign(_h2hTip.style, {
    position:"fixed", zIndex:"9999", pointerEvents:"none", display:"none",
    background:"rgba(255,255,255,0.98)", border:"1px solid #ccc",
    borderRadius:"8px", padding:"10px 12px", boxShadow:"0 2px 10px rgba(0,0,0,0.12)",
    fontFamily:"'Inter',system-ui,sans-serif", fontSize:"12px", maxWidth:"220px"
  });
  document.body.appendChild(_h2hTip);
  return _h2hTip;
}

function attachH2HHover(cardEl, points, homeLabel) {
  cardEl.addEventListener("mouseenter", e => {
    const tip = getH2HTip();
    tip.innerHTML = `
      <div style="font-weight:600;margin-bottom:4px;">Head-to-Head</div>
      <div style="color:#888;font-size:10px;margin-bottom:8px;">(Goal diff for ${esc(homeLabel)})</div>
      ${renderH2HSVG(points, homeLabel)}`;
    tip.style.display = "block";
    moveTip(e);
  });
  cardEl.addEventListener("mousemove", moveTip);
  cardEl.addEventListener("mouseleave", () => { getH2HTip().style.display = "none"; });
  function moveTip(e) {
    const tip = getH2HTip();
    tip.style.left = (e.clientX + 14) + "px";
    tip.style.top  = (e.clientY + 14) + "px";
  }
}

/* ── MATCH CARD ─────────────────────────────────────────── */
function makeCard(m, type, allRows) {
  const g   = String(m.gp || "").trim();
  const min = type === "live" && !isNaN(g) && g !== "" ? `${g}′` : "";

  const hg = type !== "upcoming" && m.hg !== null && m.hg !== undefined ? m.hg : null;
  const ag = type !== "upcoming" && m.ag !== null && m.ag !== undefined ? m.ag : null;

  const hLogo = m.homeLogo || clubLogoMap[norm(m.homeShort)] || "";
  const aLogo = m.awayLogo || clubLogoMap[norm(m.awayShort)] || "";
  const hPage = clubPageMap[norm(m.homeShort)] || "";
  const aPage = clubPageMap[norm(m.awayShort)] || "";

  const hLabel = m.homeShort || "";
  const aLabel = m.awayShort || "";
  const hName  = hPage ? `<a href="${esc(hPage)}" class="ko-team-name">${esc(hLabel)}</a>`
                       : `<span class="ko-team-name">${esc(hLabel)}</span>`;
  const aName  = aPage ? `<a href="${esc(aPage)}" class="ko-team-name">${esc(aLabel)}</a>`
                       : `<span class="ko-team-name">${esc(aLabel)}</span>`;

  const hWon = hg !== null && ag !== null && hg > ag;
  const aWon = hg !== null && ag !== null && ag > hg;

  const dateLine = `${esc(fmtDate(m.date))} · ${esc(m.league || "")}`;

  const el = document.createElement("div");
  el.className = "ko-match ko-animate";
  el.style.cssText = "flex:0 0 auto;min-width:240px;max-width:260px;scroll-snap-align:start;cursor:default;";
  el.innerHTML = `
    <div class="ko-date">
      ${type === "live" ? `<span class="bsf-region__live-dot" style="display:inline-block;width:6px;height:6px;border-radius:50%;background:#C2A14A;margin-right:4px;animation:bsf-pulse 1.4s infinite;"></span>` : ""}
      ${dateLine}${min ? ` · <strong>${min}</strong>` : ""}
    </div>
    <div class="ko-team ${hWon ? "ko-winner" : aWon ? "ko-loser" : ""}">
      <div class="ko-team-left">
        ${hLogo ? `<img src="${esc(hLogo)}" class="ko-logo" alt="">` : ""}
        ${hName}
      </div>
      <span class="ko-score">${hg !== null ? hg : ""}</span>
    </div>
    <div class="ko-team ${aWon ? "ko-winner" : hWon ? "ko-loser" : ""}">
      <div class="ko-team-left">
        ${aLogo ? `<img src="${esc(aLogo)}" class="ko-logo" alt="">` : ""}
        ${aName}
      </div>
      <span class="ko-score">${ag !== null ? ag : ""}</span>
    </div>`;

  /* H2H tooltip for upcoming matches */
  if (type === "upcoming" && allRows) {
    const pts = computeH2H(allRows, hLabel, aLabel, 6);
    if (pts.length) attachH2HHover(el, pts, hLabel);
  }

  return el;
}

function matchRow(title, id, matches, type, allRows) {
  if (!matches.length) return { html: "", els: [] };
  const els = matches.map(m => makeCard(m, type, allRows));
  return {
    html: `
      <div class="bsf-region__section">
        <div class="bsf-region__section-label">${title}</div>
      </div>
      <div style="display:flex;align-items:center;gap:0.5rem;margin-bottom:1rem;">
        <button class="bsf-region__carousel-btn"
          onclick="document.getElementById('${id}').scrollBy({left:-280,behavior:'smooth'})">◀</button>
        <div id="${id}"
          style="display:flex;gap:1rem;overflow-x:auto;scroll-snap-type:x mandatory;scroll-behavior:smooth;padding-bottom:0.5rem;flex:1;min-width:0;">
        </div>
        <button class="bsf-region__carousel-btn"
          onclick="document.getElementById('${id}').scrollBy({left:280,behavior:'smooth'})">▶</button>
      </div>`,
    id,
    els
  };
}

/* Sort and slice matches */
const dated = r => ({ ...r, _d: toDate(r.date) });
const live     = seasonRows.filter(isLive).map(dated).filter(r=>r._d).sort((a,b)=>a._d-b._d).slice(0,20);
const upcoming = seasonRows.filter(r=>!isLive(r)&&isUpcoming(r)).map(dated).filter(r=>r._d).sort((a,b)=>a._d-b._d).slice(0,20);
const recent   = seasonRows.filter(r=>!isLive(r)&&isFinished(r)).map(dated).filter(r=>r._d).sort((a,b)=>b._d-a._d).slice(0,20);

/* ── NEWS CAROUSEL ──────────────────────────────────────── */
async function loadNews() {
  /* Squarespace tag filter is case-sensitive — use the region name as-is */
  const tag = encodeURIComponent(REGION);
  try {
    const res = await fetch(`/news?tag=${tag}&format=json`, { cache: "no-store" });
    if (!res.ok) return [];
    const json = await res.json();
    const items = json.items || json.mainContent?.items || [];
    return items
      .filter(p => {
        const tags = p.tags || p.categories || [];
        return tags.some(t => norm(t) === norm(REGION));
      })
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
        const url   = esc(p.fullUrl || "#");
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
/* Build DOM-based card rows first (so event listeners survive innerHTML) */
const liveRow     = matchRow("Live",           `bsf-live-${REGION.replace(/\s/g,"-")}`,     live,     "live",     allRows);
const upcomingRow = matchRow("Upcoming Games", `bsf-upcoming-${REGION.replace(/\s/g,"-")}`, upcoming, "upcoming", allRows);
const recentRow   = matchRow("Recent Results", `bsf-recent-${REGION.replace(/\s/g,"-")}`,   recent,   "recent",   null);

root.innerHTML = [
  BIO ? `<div class="bsf-region__bio">${BIO}</div>` : "",
  liveRow.html,
  upcomingRow.html,
  recentRow.html,
  champHTML,
  newsHTML,
].filter(Boolean).join("\n");

/* Insert card elements into their carousel containers */
[liveRow, upcomingRow, recentRow].forEach(row => {
  if (!row.id || !row.els || !row.els.length) return;
  const carousel = document.getElementById(row.id);
  if (carousel) row.els.forEach(el => carousel.appendChild(el));
});

/* Standings loaded by separate region-standings.js script tag */

/* ── LIVE REFRESH ───────────────────────────────────────── */
if (live.length) {
  setInterval(async () => {
    try {
      const fresh = await BASOFU.getResults(REGION);
      const freshRows = fresh.map(normRow);
      const freshSeason = freshRows.filter(r => r.season === SEASON);
      const freshLive = freshSeason.filter(isLive).map(dated).filter(r=>r._d).sort((a,b)=>a._d-b._d).slice(0,20);
      const carousel = document.getElementById(`bsf-live-${REGION.replace(/\s/g,"-")}`);
      if (carousel && freshLive.length) {
        carousel.innerHTML = "";
        freshLive.forEach(m => carousel.appendChild(makeCard(m, "live", null)));
      }
    } catch(e) {}
  }, 60000);
}

} catch(err) {
  console.error("[Basofu region]", err);
  root.innerHTML = `<p style="color:red;">Error loading region: ${esc(err.message)}</p>`;
}

})();
