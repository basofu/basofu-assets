/* ============================================================
   BASOFU — REGION PAGE SECTIONS (region-page-sections.js)
   Sets window.BSF_REGION and window.BSF_BIO before loading.
============================================================ */
(async function () {
"use strict";

/* ── HELPERS ─────────────────────────────────────────────── */
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
function normSeason(val) {
  if (!val) return "";
  const s = String(val).trim();
  if (/^\d{4}\/\d{2}$/.test(s)) return s;
  if (/^\d{4}-\d{2}$/.test(s)) return s.replace("-", "/");
  try {
    const d = new Date(s);
    if (!isNaN(d)) { const y = d.getFullYear(); return `${y}/${String(y+1).slice(2)}`; }
  } catch(e) {}
  return s;
}
function extractImgSrc(raw) {
  if (!raw) return "";
  const m = String(raw).match(/src\s*=\s*["']\s*([^"'\s]+)\s*["']/i);
  if (m) return m[1].trim();
  if (/^https?:\/\//i.test(String(raw).trim())) return String(raw).trim();
  return "";
}

/* ── MATCH STATE ─────────────────────────────────────────── */
function isLive(m) {
  const g = String(m.gp||"").trim();
  return g !== "" && g !== "FT" && !isNaN(Number(g));
}
function isFinished(m) {
  const g = String(m.gp||"").trim();
  const hasGoals = m.hg !== null && m.hg !== undefined && m.hg !== "" &&
                   m.ag !== null && m.ag !== undefined && m.ag !== "";
  return hasGoals && !isLive(m);
}
function isUpcoming(m) {
  const g = String(m.gp || "").trim();
  return g === "Upcoming" || (g === "" && m.hg == null && m.ag == null);
}

/* ── CONFIG ──────────────────────────────────────────────── */
const REGION = window.BSF_REGION || "";
const BIO    = window.BSF_BIO    || "";

/* ── MOUNT ───────────────────────────────────────────────── */
const root = document.getElementById("bsf-region-root");
if (!root) {
  console.error("[Basofu] #bsf-region-root not found");
  window.__basofuSectionsRunning = false;
  return;
}
if (!REGION) {
  root.innerHTML = "<p style='color:red;'>Set window.BSF_REGION before loading this script.</p>";
  return;
}
root.innerHTML = `<p class="bsf-region__loading">Loading…</p>`;

try {

/* ── WAIT FOR BASOFU ─────────────────────────────────────── */
function waitForBasofu() {
  return new Promise((resolve, reject) => {
    if (window.BASOFU) return resolve(window.BASOFU);
    const t0 = Date.now();
    const iv = setInterval(() => {
      if (window.BASOFU) { clearInterval(iv); resolve(window.BASOFU); }
      else if (Date.now() - t0 > 10000) { clearInterval(iv); reject(new Error("BASOFU not found")); }
    }, 50);
  });
}
const BASOFU = await waitForBasofu();

/* ── FETCH ───────────────────────────────────────────────── */
const [resultsData, honoursData, clubsData] = await Promise.all([
  BASOFU.getResults(REGION),
  BASOFU.getHonorsRaw(),
  BASOFU.getClubsMeta(REGION)
]);

/* ── NORMALISE ROWS ──────────────────────────────────────── */
const allRows = (resultsData || []).map(r => ({
  date:      r.date      || "",
  season:    normSeason(r.season || ""),
  region:    r.region    || "",
  league:    r.league    || "",
  homeShort: r.homeShort || r.home_short || "",
  awayShort: r.awayShort || r.away_short || "",
  homeLogo:  extractImgSrc(r.homeLogo  || r.home_logo  || ""),
  awayLogo:  extractImgSrc(r.awayLogo  || r.away_logo  || ""),
  hg: (r.hg !== "" && r.hg != null && r.hg !== undefined) ? Number(r.hg) : null,
  ag: (r.ag !== "" && r.ag != null && r.ag !== undefined) ? Number(r.ag) : null,
  gp: r.gp || ""
}));

const seasons = [...new Set(allRows.map(r => r.season).filter(Boolean))]
  .sort((a, b) => (parseInt(b) || 0) - (parseInt(a) || 0));
const SEASON = window.BSF_SEASON || seasons[0] || "";
const seasonRows = allRows.filter(r => r.season === SEASON);

console.log("[Basofu sections] REGION:", REGION, "SEASON:", SEASON,
  "allRows:", allRows.length, "seasonRows:", seasonRows.length);

/* ── CLUB MAPS ───────────────────────────────────────────── */
const clubPageMap = {};
const clubLogoMap = {};
(clubsData || []).forEach(c => {
  const key  = norm(c.shortName || "");
  const page = (c.page || "").trim();
  const logo = extractImgSrc(c.logo || "");
  if (key && page) clubPageMap[key] = page;
  if (key && logo) clubLogoMap[key]  = logo;
});

/* ── MATCH CARDS ─────────────────────────────────────────── */
/* ============================================================
   DIXON-COLES MODEL
   Fits attack/defence parameters per team using maximum
   likelihood estimation over a time-weighted Poisson model.
   Includes low-score correction (rho) for 0-0, 1-0, 0-1, 1-1.
   Reference: Dixon & Coles (1997), time-weighting per Rue & Salvesen.
============================================================ */

function dixonColes(allMatches, homeTeam, awayTeam, options) {
  options = options || {};
  const XI    = options.xi    || 0.0065; /* time decay per day */
  const ITERS = options.iters || 100;    /* gradient ascent iterations */
  const LR    = options.lr    || 0.01;   /* learning rate */

  /* ── 1. Filter to finished matches with both teams present ── */
  const now     = Date.now();
  const matches = allMatches.filter(m => {
    const hg = Number(m.home_goals ?? m.hg);
    const ag = Number(m.away_goals ?? m.ag);
    return !isNaN(hg) && !isNaN(ag) &&
           (m.home_goals ?? m.hg) !== "" &&
           (m.away_goals ?? m.ag) !== "";
  }).map(m => {
    const d = new Date(m.date);
    const age = isNaN(d) ? 365 : (now - d.getTime()) / 86400000;
    return {
      home: (m.homeShort || m.home_short || "").trim(),
      away: (m.awayShort || m.away_short || "").trim(),
      hg:   Number(m.home_goals ?? m.hg),
      ag:   Number(m.away_goals ?? m.ag),
      w:    Math.exp(-XI * age)  /* time weight */
    };
  }).filter(m => m.w > 0.01);   /* ignore very old matches */

  if (matches.length < 5) return null; /* not enough data */

  /* ── 2. Collect all teams ── */
  const teamSet = new Set();
  matches.forEach(m => { teamSet.add(m.home); teamSet.add(m.away); });
  if (!teamSet.has(homeTeam) || !teamSet.has(awayTeam)) return null;
  const teams  = [...teamSet];
  const tIdx   = {};
  teams.forEach((t, i) => tIdx[t] = i);
  const n      = teams.length;

  /* ── 3. Initialise parameters ──
     params: [attack_0..n-1, defence_0..n-1, homeAdv, rho]
     log scale for attack/defence for positivity */
  const params = new Float64Array(2 * n + 2);
  params.fill(0); /* log(1)=0 for attack/defence, homeAdv=0, rho=0 */

  function getAttack(i)  { return Math.exp(params[i]); }
  function getDefence(i) { return Math.exp(params[n + i]); }
  function getHome()     { return Math.exp(params[2*n]); }
  function getRho()      { return params[2*n + 1]; }

  /* Dixon-Coles tau correction for low scores */
  function tau(hg, ag, lambdaH, muA, rho) {
    if      (hg === 0 && ag === 0) return 1 - lambdaH * muA * rho;
    else if (hg === 1 && ag === 0) return 1 + muA * rho;
    else if (hg === 0 && ag === 1) return 1 + lambdaH * rho;
    else if (hg === 1 && ag === 1) return 1 - rho;
    else                            return 1;
  }

  function poisson(k, lambda) {
    /* log poisson for numerical stability */
    let lp = -lambda + k * Math.log(Math.max(lambda, 1e-10));
    for (let i = 2; i <= k; i++) lp -= Math.log(i);
    return Math.exp(lp);
  }

  /* ── 4. Log-likelihood ── */
  function logLik() {
    let ll  = 0;
    const h = getHome(), rho = getRho();
    matches.forEach(m => {
      const hi = tIdx[m.home], ai = tIdx[m.away];
      const lambdaH = getAttack(hi) * getDefence(ai) * h;
      const muA     = getAttack(ai) * getDefence(hi);
      const t       = tau(m.hg, m.ag, lambdaH, muA, rho);
      if (t <= 0) return;
      ll += m.w * (
        Math.log(t) +
        Math.log(Math.max(poisson(m.hg, lambdaH), 1e-10)) +
        Math.log(Math.max(poisson(m.ag, muA),      1e-10))
      );
    });
    return ll;
  }

  /* ── 5. Gradient ascent (numerical gradients) ── */
  const EPS = 1e-5;
  for (let iter = 0; iter < ITERS; iter++) {
    const ll0 = logLik();
    for (let i = 0; i < params.length; i++) {
      params[i] += EPS;
      const ll1 = logLik();
      params[i] -= EPS;
      const grad = (ll1 - ll0) / EPS;
      params[i] += LR * grad;
    }
    /* Constrain rho to (-0.15, 0.15) */
    params[2*n + 1] = Math.max(-0.15, Math.min(0.15, params[2*n + 1]));
  }

  /* ── 6. Predict scoreline probabilities ── */
  const MAX_GOALS = 8;
  const hi = tIdx[homeTeam], ai = tIdx[awayTeam];
  if (hi === undefined || ai === undefined) return null;

  const h       = getHome(), rho = getRho();
  const lambdaH = getAttack(hi) * getDefence(ai) * h;
  const muA     = getAttack(ai) * getDefence(hi);

  const matrix = []; /* matrix[hg][ag] = probability */
  let pHome = 0, pDraw = 0, pAway = 0;
  let bestP = 0, bestH = 0, bestA = 0;

  for (let hg = 0; hg <= MAX_GOALS; hg++) {
    matrix[hg] = [];
    for (let ag = 0; ag <= MAX_GOALS; ag++) {
      const t = tau(hg, ag, lambdaH, muA, rho);
      const p = Math.max(0, t * poisson(hg, lambdaH) * poisson(ag, muA));
      matrix[hg][ag] = p;
      if (hg > ag) pHome += p;
      else if (hg === ag) pDraw += p;
      else pAway += p;
      if (p > bestP) { bestP = p; bestH = hg; bestA = ag; }
    }
  }

  /* Normalise */
  const total = pHome + pDraw + pAway;
  return {
    homeWin:       Math.round(100 * pHome / total),
    draw:          Math.round(100 * pDraw / total),
    awayWin:       Math.round(100 * pAway / total),
    expectedHome:  lambdaH.toFixed(2),
    expectedAway:  muA.toFixed(2),
    likelyScore:   `${bestH}–${bestA}`,
    dataPoints:    matches.length,
  };
}


function makeCard(m, type) {
  const g    = String(m.gp || "").trim();
  const min  = type === "live" && !isNaN(Number(g)) && g !== "" ? `${g}′` : "";
  const hg   = type !== "upcoming" && m.hg !== null ? m.hg : null;
  const ag   = type !== "upcoming" && m.ag !== null ? m.ag : null;
  const hKey = norm(m.homeShort);
  const aKey = norm(m.awayShort);
  const hLogo = m.homeLogo || clubLogoMap[hKey] || "";
  const aLogo = m.awayLogo || clubLogoMap[aKey] || "";
  const hPage = clubPageMap[hKey] || "";
  const aPage = clubPageMap[aKey] || "";
  const hName = hPage ? `<a href="${esc(hPage)}" class="ko-team-name">${esc(m.homeShort)}</a>`
                       : `<span class="ko-team-name">${esc(m.homeShort)}</span>`;
  const aName = aPage ? `<a href="${esc(aPage)}" class="ko-team-name">${esc(m.awayShort)}</a>`
                       : `<span class="ko-team-name">${esc(m.awayShort)}</span>`;
  const hWon  = hg !== null && ag !== null && hg > ag;
  const aWon  = hg !== null && ag !== null && ag > hg;

  const el = document.createElement("div");
  el.className = "ko-match ko-animate";
  el.style.cssText = "flex:0 0 auto;min-width:240px;max-width:260px;scroll-snap-align:start;";
  const liveDot = type==="live" ? "<span style=\"display:inline-block;width:6px;height:6px;border-radius:50%;background:#C2A14A;margin-right:4px;animation:bsf-pulse 1.4s infinite;vertical-align:middle;\"></span>" : "";
  const hLogoHTML = hLogo ? "<img src=\"" + esc(hLogo) + "\" class=\"ko-logo\" alt=\"\">" : "";
  const aLogoHTML = aLogo ? "<img src=\"" + esc(aLogo) + "\" class=\"ko-logo\" alt=\"\">" : "";

  el.innerHTML = `
    <div class="ko-date">
      ${liveDot}
      ${esc(fmtDate(m.date))} · ${esc(m.league)}${min ? " · <strong>" + min + "</strong>" : ""}
    </div>
    <div class="ko-team ${hWon?"ko-winner":aWon?"ko-loser":""}">
      <div class="ko-team-left">
        ${hLogoHTML}
        ${hName}
      </div>
      <span class="ko-score">${hg !== null ? hg : ""}</span>
    </div>
    <div class="ko-team ${aWon?"ko-winner":hWon?"ko-loser":""}">
      <div class="ko-team-left">
        ${aLogoHTML}
        ${aName}
      </div>
      <span class="ko-score">${ag !== null ? ag : ""}</span>
    </div>`;

  /* H2H tooltip for upcoming */
  if (type === "upcoming") {
    const h2h = allRows.filter(r =>
      r.hg !== null && r.ag !== null &&
      ((norm(r.homeShort) === hKey && norm(r.awayShort) === aKey) ||
       (norm(r.homeShort) === aKey && norm(r.awayShort) === hKey))
    ).map(r => ({ ...r, _d: toDate(r.date) }))
     .filter(r => r._d).sort((a,b) => b._d - a._d).slice(0,6).reverse()
     .map(r => {
       const fromHome = norm(r.homeShort) === hKey;
       return { diff: fromHome ? r.hg - r.ag : r.ag - r.hg };
     });

    if (h2h.length) {
      let tip = null;
      el.addEventListener("mouseenter", e => {
        tip = tip || (() => {
          const t = document.createElement("div");
          Object.assign(t.style, {
            position:"fixed",zIndex:"9999",pointerEvents:"none",
            background:"rgba(255,255,255,0.98)",border:"1px solid #ccc",
            borderRadius:"8px",padding:"10px 12px",
            boxShadow:"0 2px 10px rgba(0,0,0,0.12)",
            fontFamily:"'Inter',system-ui,sans-serif",fontSize:"12px",
            maxWidth:"220px"
          });
          const w=180,h=80,pad=8,baseY=40;
          const maxA = Math.max(1,...h2h.map(p=>Math.abs(p.diff)));
          const bw = Math.max(8,Math.floor((w-pad*2)/h2h.length)-4);
          const bars = h2h.map((p,i)=>{
            if(!p.diff) return "";
            const x=pad+i*(bw+4), bh=Math.round(Math.abs(p.diff)/maxA*(baseY-pad));
            const y=p.diff>0?baseY-bh:baseY;
            return `<rect x="${x}" y="${y}" width="${bw}" height="${bh}" rx="2" fill="#003893"/>`;
          }).join("");
          t.innerHTML = `<div style="font-weight:600;margin-bottom:4px;">Head-to-Head</div>
            <div style="color:#888;font-size:10px;margin-bottom:8px;">Goal diff for ${esc(m.homeShort)}</div>
            <svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
              <line x1="${pad}" y1="${baseY}" x2="${w-pad}" y2="${baseY}" stroke="#ccc"/>
              ${bars}
            </svg>`;
          document.body.appendChild(t);
          return t;
        })();
        tip.style.display = "block";
        tip.style.left = (e.clientX+14)+"px";
        tip.style.top  = (e.clientY+14)+"px";
      });
      el.addEventListener("mousemove", e => {
        if(tip) { tip.style.left=(e.clientX+14)+"px"; tip.style.top=(e.clientY+14)+"px"; }
      });
      el.addEventListener("mouseleave", () => { if(tip) tip.style.display="none"; });
    }
  }

  /* Dixon-Coles prediction */
  if (type === "upcoming" && allRows) {
    setTimeout(() => {
      const dc = dixonColes(allRows, m.homeShort, m.awayShort, {});
      if (!dc) return;
      const pred = document.createElement("div");
      pred.className = "bsf-dc-tip";
      pred.innerHTML =
        "<div style='border-top:1px solid #e8e8e6;margin-top:8px;padding-top:8px;'>" +
        "<div style='font-weight:600;font-size:11px;margin-bottom:6px;'>Prediction</div>" +
        "<div style='display:flex;gap:4px;margin-bottom:6px;'>" +
          "<div style='flex:1;text-align:center;padding:4px;background:#2F3E46;color:#fff;border-radius:3px;'>" +
            "<div style='font-size:14px;font-weight:700;'>" + dc.homeWin + "%</div>" +
            "<div style='font-size:9px;opacity:0.7;'>" + esc(m.homeShort) + "</div>" +
          "</div>" +
          "<div style='flex:1;text-align:center;padding:4px;background:#888;color:#fff;border-radius:3px;'>" +
            "<div style='font-size:14px;font-weight:700;'>" + dc.draw + "%</div>" +
            "<div style='font-size:9px;opacity:0.7;'>Draw</div>" +
          "</div>" +
          "<div style='flex:1;text-align:center;padding:4px;background:#A44A3F;color:#fff;border-radius:3px;'>" +
            "<div style='font-size:14px;font-weight:700;'>" + dc.awayWin + "%</div>" +
            "<div style='font-size:9px;opacity:0.7;'>" + esc(m.awayShort) + "</div>" +
          "</div>" +
        "</div>" +
        "<div style='font-size:10px;color:#888;'>Most likely: <strong>" + dc.likelyScore + "</strong> · " +
          "xG " + dc.expectedHome + "–" + dc.expectedAway + " · " +
          dc.dataPoints + " matches</div>" +
        "</div>";
      el.appendChild(pred);
    }, 0);
  }

  return el;
}

/* ── RESULTS SECTION (TABBED) ────────────────────────────── */
const dated  = r => ({ ...r, _d: toDate(r.date) });
const live     = seasonRows.filter(isLive).map(dated).filter(r=>r._d).sort((a,b)=>a._d-b._d).slice(0,20);
const upcoming = seasonRows.filter(r=>!isLive(r)&&isUpcoming(r)).map(dated).filter(r=>r._d).sort((a,b)=>a._d-b._d).slice(0,20);
const recent   = seasonRows.filter(r=>!isLive(r)&&isFinished(r)).map(dated).filter(r=>r._d).sort((a,b)=>b._d-a._d).slice(0,20);

console.log("[Basofu sections] live:", live.length, "upcoming:", upcoming.length, "recent:", recent.length);

/* Build carousel HTML + DOM elements */
function carousel(id, matches, type) {
  const els = matches.map(m => makeCard(m, type));
  return {
    html: `<div style="display:flex;align-items:center;gap:0.5rem;margin-bottom:0.5rem;">
      <button class="bsf-region__carousel-btn" onclick="document.getElementById('${id}').scrollBy({left:-280,behavior:'smooth'})">◀</button>
      <div id="${id}" style="display:flex;gap:1rem;overflow-x:auto;scroll-snap-type:x mandatory;scroll-behavior:smooth;padding-bottom:0.5rem;flex:1;min-width:0;"></div>
      <button class="bsf-region__carousel-btn" onclick="document.getElementById('${id}').scrollBy({left:280,behavior:'smooth'})">▶</button>
    </div>`,
    id, els
  };
}

const slug  = REGION.replace(/\s/g,"-");
const liveC = carousel(`bsf-live-${slug}`,     live,     "live");
const upC   = carousel(`bsf-upcoming-${slug}`, upcoming, "upcoming");
const recC  = carousel(`bsf-recent-${slug}`,   recent,   "recent");

/* Tabs — only show Live/Upcoming if they have matches */
const tabs = [
  ...(live.length     ? [{ key:"live",     label: live.length+" LIVE", c: liveC }] : []),
  ...(upcoming.length ? [{ key:"upcoming", label:"UPCOMING",           c: upC   }] : []),
  ...(recent.length   ? [{ key:"recent",   label:"RESULTS",            c: recC  }] : []),
];
const defaultTab = (tabs[0] && tabs[0].key) || "recent";

const resultsHTML = tabs.length ? `
  <div class="bsf-region__section"><div class="bsf-region__section-label">Results</div></div>
  <div class="bsf-results-tabs">
    ${tabs.map(t => `<button class="bsf-results-tab${t.key===defaultTab?" active":""}" data-tab="${t.key}"
      onclick="(function(b){document.querySelectorAll('.bsf-results-tab').forEach(x=>x.classList.remove('active'));b.classList.add('active');document.querySelectorAll('.bsf-results-panel').forEach(x=>{x.style.display=x.dataset.panel===b.dataset.tab?'':'none';})})(this)">${t.label}</button>`).join("")}
  </div>
  ${tabs.map(t => `<div class="bsf-results-panel" data-panel="${t.key}" style="display:${t.key===defaultTab?"":"none"};">${t.c.html}</div>`).join("")}
` : "";

/* ── CHAMPIONS ───────────────────────────────────────────── */
const regionComps = new Set(
  allRows.filter(r => norm(r.region) === norm(REGION)).map(r => r.league.trim()).filter(Boolean)
);
const champsByComp = {};
(honoursData || []).forEach(r => {
  const loc    = (r.location || "").trim().toLowerCase();
  const comp   = (r.competition || "").trim();
  const winner = (r.winner || "").trim();
  const year   = normSeason(r.year || "");
  const skip   = new Set(["not known","not held","unknown","tbd","n/a",""]);
  if (skip.has(winner.toLowerCase())) return;
  const rl = REGION.toLowerCase();
  if (!loc.includes(rl) && !comp.toLowerCase().includes(rl) && !regionComps.has(comp)) return;
  if (!champsByComp[comp]) champsByComp[comp] = [];
  champsByComp[comp].push({ year, winner });
});
const compOrder = s => {
  const l = s.toLowerCase();
  if (/campeonato|liga regional/i.test(l)) return 0;
  if (/torneio/i.test(l))                  return 1;
  if (/ta[çcC]a|taca/i.test(l))               return 2;
  if (/supertac|super.?ta/i.test(l))           return 3;
  return 4;
};
const sortedComps = Object.keys(champsByComp).sort((a,b) => compOrder(a) - compOrder(b));
const champHTML = sortedComps.length ? `
  <div class="bsf-region__section"><div class="bsf-region__section-label">Champions</div></div>
  <div class="bsf-region__champs">
    ${sortedComps.map(comp => {
      const entries = champsByComp[comp].sort((a,b) => String(b.year).localeCompare(String(a.year)));
      const latest  = entries[0];
      const prev    = entries.slice(1,4);
      return `<div class="bsf-region__champ-card">
        <div class="bsf-region__champ-comp">${esc(comp)}</div>
        <div class="bsf-region__champ-winner">${esc(latest.winner)}</div>
        <div class="bsf-region__champ-year">${esc(latest.year)}</div>
        ${prev.length ? "<div class=\"bsf-region__champ-prev\">" + prev.map(e=>"<span>"+esc(e.winner)+" <em>"+esc(e.year)+"</em></span>").join("") + "</div>" : ""}
      </div>`;
    }).join("")}
  </div>` : "";

/* ── NEWS ────────────────────────────────────────────────── */
let newsHTML = "";
try {
  const tag = encodeURIComponent(REGION);
  const res = await fetch(`/news?tag=${tag}&format=json`, { cache:"no-store" });
  if (res.ok) {
    const json = await res.json();
    const items = (json.items || [])
      .filter(p => (p.tags||[]).some(t => norm(t) === norm(REGION)))
      .slice(0,8);
    if (items.length) {
      const newsId = `bsf-news-${slug}`;
      newsHTML = `
        <div class="bsf-region__section"><div class="bsf-region__section-label">News</div></div>
        <div style="display:flex;align-items:center;gap:0.5rem;margin-bottom:1rem;">
          <button class="bsf-region__carousel-btn" onclick="document.getElementById('${newsId}').scrollBy({left:-280,behavior:'smooth'})">◀</button>
          <div id="${newsId}" style="display:flex;gap:1rem;overflow-x:auto;scroll-snap-type:x mandatory;scroll-behavior:smooth;padding-bottom:0.5rem;flex:1;min-width:0;">
            ${items.map(p => {
              const img  = p.assetUrl || "";
              const url  = esc(p.fullUrl || "#");
              const date = p.publishOn ? fmtDate(new Date(p.publishOn).toISOString().slice(0,10)) : "";
              const imgHTML  = img ? "<div class=\"bsf-region__news-img\" style=\"background-image:url('" + esc(img) + "')\"></div>"
                                   : "<div class=\"bsf-region__news-img bsf-region__news-img--empty\"></div>";
              const dateHTML = date ? "<div class=\"bsf-region__news-date\">" + date + "</div>" : "";
              return `<a href="${url}" class="bsf-region__news-card">
                ${imgHTML}
                <div class="bsf-region__news-body">
                  ${dateHTML}
                  <div class="bsf-region__news-title">${esc(p.title||"")}</div>
                </div>
              </a>`;
            }).join("")}
          </div>
          <button class="bsf-region__carousel-btn" onclick="document.getElementById('${newsId}').scrollBy({left:280,behavior:'smooth'})">▶</button>
        </div>`;
    }
  }
} catch(e) { /* news is non-fatal */ }

/* ── SCORIGAMI HTML ──────────────────────────────────────── */
const scoriSlug  = REGION.replace(/\s/g, "-");
const scoriComps = [...new Set(allRows.map(r => r.league).filter(Boolean))].sort();
const scoriSeasons = seasons.slice(); /* already sorted desc */

const scorigamiHTML = `
  <div class="bsf-region__section"><div class="bsf-region__section-label">Scorigami</div></div>
  <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:10px;align-items:center;">
    <select id="bsf-sg-season-${scoriSlug}" class="bsf-club__season-select" style="min-width:100px;">
      <option value="">All Time</option>
      ${scoriSeasons.map(s => `<option value="${esc(s)}">${esc(s)}</option>`).join("")}
    </select>
    <select id="bsf-sg-comp-${scoriSlug}" class="bsf-club__season-select" style="min-width:160px;">
      <option value="">All Competitions</option>
      ${scoriComps.map(c => `<option value="${esc(c)}">${esc(c)}</option>`).join("")}
    </select>
  </div>
  <div id="bsf-sg-mount-${scoriSlug}" style="overflow-x:auto;"></div>`;

/* ── RENDER ──────────────────────────────────────────────── */
root.innerHTML = [
  BIO    ? `<div class="bsf-region__bio">${BIO}</div>` : "",
  resultsHTML,
  champHTML,
  scorigamiHTML,
  newsHTML,
].filter(Boolean).join("\n");

/* Inject card DOM elements into carousels */
[liveC, upC, recC].forEach(c => {
  if (!c.els.length) return;
  const el = document.getElementById(c.id);
  if (el) c.els.forEach(card => el.appendChild(card));
});

/* ── SCORIGAMI RENDERER ───────────────────────────────────── */
(function() {
  const mount   = document.getElementById(`bsf-sg-mount-${scoriSlug}`);
  const selSeas = document.getElementById(`bsf-sg-season-${scoriSlug}`);
  const selComp = document.getElementById(`bsf-sg-comp-${scoriSlug}`);
  if (!mount) return;

  function render() {
    const season = selSeas ? selSeas.value : "";
    const comp   = selComp ? selComp.value : "";
    const rows   = allRows.filter(r =>
      r.hg !== null && r.ag !== null &&
      (!season || r.season === season) &&
      (!comp   || r.league === comp)
    );

    let maxH = 0, maxA = 0;
    const cells = {};
    rows.forEach(r => {
      const h = Number(r.hg), a = Number(r.ag);
      if (isNaN(h) || isNaN(a)) return;
      maxH = Math.max(maxH, h);
      maxA = Math.max(maxA, a);
      const k = h + "," + a;
      cells[k] = (cells[k] || 0) + 1;
    });

    if (!Object.keys(cells).length) {
      mount.innerHTML = "<p style='font-size:11px;color:#888;'>No results to display.</p>";
      return;
    }

    const maxCount = Math.max(...Object.values(cells));
    const cellSize = Math.max(16, Math.min(32, Math.floor(560 / Math.max(maxH, maxA, 6))));
    const pad = 28;
    const svgW = pad + (maxH + 1) * cellSize;
    const svgH = pad + (maxA + 1) * cellSize;

    let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${svgW}" height="${svgH}" style="font-family:Inter,system-ui,sans-serif;">`;

    /* Axis labels */
    svg += `<text x="${svgW/2}" y="10" text-anchor="middle" font-size="9" fill="#555">Home Goals</text>`;
    for (let h = 0; h <= maxH; h++) {
      svg += `<text x="${pad + h*cellSize + cellSize/2}" y="${pad-6}" text-anchor="middle" font-size="9" fill="#888">${h}</text>`;
    }
    for (let a = 0; a <= maxA; a++) {
      svg += `<text x="${pad-4}" y="${pad + a*cellSize + cellSize/2 + 3}" text-anchor="end" font-size="9" fill="#888">${a}</text>`;
    }

    /* Away goals label rotated */
    svg += `<text transform="rotate(-90)" x="${-(svgH/2)}" y="10" text-anchor="middle" font-size="9" fill="#555">Away Goals</text>`;

    /* Cells */
    for (let h = 0; h <= maxH; h++) {
      for (let a = 0; a <= maxA; a++) {
        const k     = h + "," + a;
        const count = cells[k] || 0;
        const x     = pad + h * cellSize;
        const y     = pad + a * cellSize;
        let fill;
        if (!count) {
          fill = "#f0f0ee";
        } else {
          const t = 0.45 + 0.50 * (count / maxCount);
          if (h > a)      fill = `rgba(47,62,70,${t})`;    /* home win — navy */
          else if (h < a) fill = `rgba(164,74,63,${t})`;   /* away win — red  */
          else             fill = `rgba(194,161,74,${t})`; /* draw    — gold  */
        }
        const label = h + "–" + a + (count ? ` (${count}×)` : " (never)");
        svg += `<rect x="${x}" y="${y}" width="${cellSize-1}" height="${cellSize-1}" fill="${fill}" rx="2"><title>${label}</title></rect>`;
        if (count && cellSize >= 22) {
          svg += `<text x="${x+cellSize/2}" y="${y+cellSize/2+3}" text-anchor="middle" font-size="${Math.min(10,cellSize*0.35)}" fill="rgba(255,255,255,0.9)" font-weight="600">${count}</text>`;
        }
      }
    }

    svg += "</svg>";
    mount.innerHTML = svg;
  }

  render();
  if (selSeas) selSeas.addEventListener("change", render);
  if (selComp) selComp.addEventListener("change", render);
})();

/* ── LIVE REFRESH ────────────────────────────────────────── */
if (live.length) {
  setInterval(async () => {
    try {
      const fresh = (await BASOFU.getResults(REGION)).map(r => ({
        ...r,
        season: normSeason(r.season||""),
        hg: (r.hg!==null&&r.hg!==undefined&&r.hg!=="") ? Number(r.hg) : null,
        ag: (r.ag!==null&&r.ag!==undefined&&r.ag!=="") ? Number(r.ag) : null,
      }));
      const freshLive = fresh.filter(r=>normSeason(r.season)===SEASON&&isLive(r))
        .map(r=>({...r,_d:toDate(r.date)})).filter(r=>r._d)
        .sort((a,b)=>a._d-b._d).slice(0,20);
      const el = document.getElementById(`bsf-live-${slug}`);
      if (el && freshLive.length) {
        el.innerHTML = "";
        freshLive.forEach(m => el.appendChild(makeCard(m,"live")));
      }
    } catch(e) {}
  }, 60000);
}

} catch(err) {
  console.error("[Basofu region]", err);
  if (root) root.innerHTML = `<p style="color:red;font-family:monospace;font-size:12px;">Error: ${esc(err.message)}</p>`;
}

})();
