/* ============================================================
   BASOFU — REGION PAGE SECTIONS (region-page-sections.js)
   Sets window.BSF_REGION and window.BSF_BIO before loading.
============================================================ */
(async function () {
"use strict";

if (window.__basofuSectionsRunning) return;
window.__basofuSectionsRunning = true;

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
  const hasGoals = m.hg !== null && m.hg !== undefined && m.hg !== "" &&
                   m.ag !== null && m.ag !== undefined && m.ag !== "";
  return !hasGoals && !isLive(m);
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
  hg: (r.hg !== null && r.hg !== undefined && r.hg !== "") ? Number(r.hg) : null,
  ag: (r.ag !== null && r.ag !== undefined && r.ag !== "") ? Number(r.ag) : null,
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

/* ── RENDER ──────────────────────────────────────────────── */
root.innerHTML = [
  BIO    ? `<div class="bsf-region__bio">${BIO}</div>` : "",
  resultsHTML,
  champHTML,
  newsHTML,
].filter(Boolean).join("\n");

/* Inject card DOM elements into carousels */
[liveC, upC, recC].forEach(c => {
  if (!c.els.length) return;
  const el = document.getElementById(c.id);
  if (el) c.els.forEach(card => el.appendChild(card));
});

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
  window.__basofuSectionsRunning = false;
  console.error("[Basofu region]", err);
  if (root) root.innerHTML = `<p style="color:red;font-family:monospace;font-size:12px;">Error: ${esc(err.message)}</p>`;
}

})();
