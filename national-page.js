/* ============================================================
   BASOFU — NATIONAL PAGE SCRIPT (national-page.js)
   ------------------------------------------------------------
   Covers: Campeonato Nacional (league phase + knockout),
   Taça Cabo Verde, SuperTaça Cabo Verde, Inter-ilhas.
   Men's / Women's split throughout: side-by-side on desktop,
   stacked on mobile.

   Set window.BSF_NATIONAL = true before loading this script.
   Mounts into: <div id="bsf-national-root"></div>
============================================================ */
(async function () {
  "use strict";

  if (window.__basofuNationalRunning) return;
  window.__basofuNationalRunning = true;

  const root = document.getElementById("bsf-national-root");
  if (!root) { console.error("[Basofu national] #bsf-national-root not found"); return; }
  root.innerHTML = `<p class="bsf-region__loading">Loading…</p>`;

  const BIO = window.BSF_BIO || "";

  /* ── GENERIC HELPERS ─────────────────────────────────────── */
  function esc(s) {
    return String(s || "").replace(/&/g,"&amp;").replace(/</g,"&lt;")
      .replace(/>/g,"&gt;").replace(/"/g,"&quot;");
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
      if (!isNaN(d)) { const y = d.getFullYear(); return y + "/" + String(y+1).slice(2); }
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

  /* Accent + punctuation insensitive key for competition-name matching.
     "Taça Cabo Verde" -> "taca cabo verde"; "Inter-ilhas" -> "inter ilhas" */
  function matchKey(s) {
    return String(s || "")
      .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, " ")
      .trim();
  }
  function isWomensLeague(league) { return /feminino/i.test(league || ""); }

  const COMP_DEFS = [
    { id: "nacional",   label: "Campeonato Nacional",  test: k => k.indexOf("campeonato nacional") === 0 },
    { id: "taca",       label: "Taça Cabo Verde",       test: k => k.indexOf("taca cabo verde") === 0 },
    { id: "supertaca",  label: "SuperTaça Cabo Verde",  test: k => k.indexOf("supertaca cabo verde") === 0 },
    { id: "interilhas", label: "Inter-ilhas",           test: k => k.indexOf("inter ilhas") === 0 }
  ];
  function compDefFor(league) {
    const k = matchKey(league);
    return COMP_DEFS.find(c => c.test(k)) || null;
  }

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

  try {
    const BASOFU = await waitForBasofu();

    /* National-level clubs are drawn from every island, and the GAS
       clubs endpoint is filtered by Island, so we fetch each island
       in parallel and merge. NOTE: verify these match the exact
       spelling/accents used in your sheet's "Island" column. */
    const ISLANDS = ["Santiago","São Vicente","Santo Antão","Fogo","Sal","Boa Vista","Maio","São Nicolau","Brava"];

    /* ── FETCH ─────────────────────────────────────────────────
       Merge Region="National" with a defensive Region="Inter-ilhas"
       fetch, deduped, in case Inter-ilhas lives under its own
       Region value rather than under National. */
    const [nationalRows, interIlhasRowsMaybe, honoursData, clubsByIsland] = await Promise.all([
      BASOFU.getResults("National"),
      BASOFU.getResults("Inter-ilhas").catch(() => []),
      BASOFU.getHonorsRaw(),
      Promise.all(ISLANDS.map(isl => BASOFU.getClubsMeta(isl).catch(() => [])))
    ]);

    /* ── CLUB PAGE LINKS (Page column, Clubs sheet) ───────────── */
    const clubPageMap = {};
    (clubsByIsland || []).forEach(list => {
      (list || []).forEach(c => {
        const page = (c.page || c["Page"] || "").trim();
        if (!page) return;
        const shortKey = norm(c.shortName || c["Short Name"] || "");
        const fullKey  = norm(c.team      || c["Team"]       || "");
        if (shortKey) clubPageMap[shortKey] = page;
        if (fullKey)  clubPageMap[fullKey]  = page;
      });
    });
    /* Wraps a team name in a link to its club page when we have one,
       otherwise falls back to a plain span (same ko-team-name class
       either way, so styling stays consistent). */
    function teamLink(name) {
      const label = esc(name || "");
      const link  = clubPageMap[norm(name || "")] || "";
      return link
        ? "<a href=\""+esc(link)+"\" class=\"ko-team-name bsf-national__club-link\">"+label+"</a>"
        : "<span class=\"ko-team-name\">"+label+"</span>";
    }

    function normRow(r) {
      return {
        date:       r.date      || "",
        season:     normSeason(r.season || ""),
        week:       String(r.week || "").trim(),
        league:     r.league    || "",
        home_full:  r.homeFull  || "",
        away_full:  r.awayFull  || "",
        home_short: r.homeShort || "",
        away_short: r.awayShort || "",
        home_logo:  extractImgSrc(r.homeLogo || ""),
        away_logo:  extractImgSrc(r.awayLogo || ""),
        home_goals: (r.hg !== "" && r.hg != null) ? Number(r.hg) : null,
        away_goals: (r.ag !== "" && r.ag != null) ? Number(r.ag) : null,
        gp:         r.gp        || "",
        notes:      r.notes     || ""
      };
    }

    const seen = new Set();
    const dedupeKey = r => [r.date, r.league, r.homeShort, r.awayShort].join("||");
    const allRows = [];
    (nationalRows || []).forEach(r => { const k = dedupeKey(r); if (!seen.has(k)) { seen.add(k); allRows.push(normRow(r)); } });
    (interIlhasRowsMaybe || []).forEach(r => { const k = dedupeKey(r); if (!seen.has(k)) { seen.add(k); allRows.push(normRow(r)); } });

    /* Keep only rows that belong to one of our four target competitions */
    const rows = allRows.filter(r => compDefFor(r.league));
    rows.forEach(r => { r._gender = isWomensLeague(r.league) ? "women" : "men"; r._comp = compDefFor(r.league); });

    /* ── MATCH STATE ───────────────────────────────────────── */
    function isLive(m) {
      const g = String(m.gp||"").trim();
      return g !== "" && g !== "FT" && !isNaN(Number(g));
    }
    function isFinished(m) {
      return !isLive(m) && m.home_goals != null && m.away_goals != null;
    }
    function isUpcoming(m) {
      const g = String(m.gp || "").trim();
      return g === "Upcoming" || (g === "" && m.home_goals == null && m.away_goals == null);
    }
    function isLeaguePhase(m)  { return /^\d+$/.test(m.week); }
    function isKnockoutPhase(m) { return !isLeaguePhase(m) && m.week !== ""; }

    /* ── SEASONS ───────────────────────────────────────────── */
    const seasons = [...new Set(rows.map(r => r.season).filter(Boolean))]
      .sort((a,b) => (parseInt(b)||0) - (parseInt(a)||0));
    let SEASON = window.BSF_SEASON || seasons[0] || "";

    /* ================================================================
       DIXON-COLES (same model used elsewhere on Basofu) — used only
       for the upcoming-match H2H prediction tooltip.
    ================================================================ */
    function dixonColes(allMatches, homeTeam, awayTeam, options) {
      options = options || {};
      const XI = options.xi || 0.0065, ITERS = options.iters || 50;
      const now = Date.now();
      const matches = [];
      allMatches.forEach(m => {
        if (m.home_goals == null || m.away_goals == null) return;
        const d = new Date(m.date);
        const age = isNaN(d.getTime()) ? 365 : (now - d.getTime()) / 86400000;
        const w = Math.exp(-XI * Math.max(0, age));
        if (w < 0.01) return;
        matches.push({ home: (m.home_short||"").trim(), away: (m.away_short||"").trim(),
          hg: m.home_goals, ag: m.away_goals, w });
      });
      if (matches.length < 10) return null;
      const teamSet = new Set();
      matches.forEach(m => { teamSet.add(m.home); teamSet.add(m.away); });
      if (!teamSet.has(homeTeam) || !teamSet.has(awayTeam)) return null;
      const teams = Array.from(teamSet);
      const tIdx = {}; teams.forEach((t,i) => tIdx[t]=i);
      const n = teams.length;
      const attack = new Float64Array(n).fill(1), defence = new Float64Array(n).fill(1);
      let homeAdv = 1.3;
      const wHomeGoals=new Float64Array(n), wAwayGoals=new Float64Array(n);
      const wHomeConcede=new Float64Array(n), wAwayConcede=new Float64Array(n);
      matches.forEach(m => {
        const hi=tIdx[m.home], ai=tIdx[m.away];
        wHomeGoals[hi]+=m.w*m.hg; wAwayGoals[ai]+=m.w*m.ag;
        wHomeConcede[ai]+=m.w*m.hg; wAwayConcede[hi]+=m.w*m.ag;
      });
      for (let iter=0; iter<ITERS; iter++) {
        let numH=0, denH=0;
        matches.forEach(m => { const hi=tIdx[m.home], ai=tIdx[m.away]; numH+=m.w*m.hg; denH+=m.w*attack[hi]*defence[ai]; });
        homeAdv = numH / Math.max(denH,1e-10);
        for (let i=0;i<n;i++) {
          const scored = wHomeGoals[i]+wAwayGoals[i];
          let denom=0;
          matches.forEach(m => { const hi=tIdx[m.home], ai=tIdx[m.away];
            if (hi===i) denom += m.w*homeAdv*defence[ai];
            if (ai===i) denom += m.w*defence[hi]; });
          if (denom>1e-10) attack[i] = scored/denom;
        }
        for (let i=0;i<n;i++) {
          const conceded = wHomeConcede[i]+wAwayConcede[i];
          let denom=0;
          matches.forEach(m => { const hi=tIdx[m.home], ai=tIdx[m.away];
            if (ai===i) denom += m.w*homeAdv*attack[hi];
            if (hi===i) denom += m.w*attack[ai]; });
          if (denom>1e-10) defence[i] = conceded/denom;
        }
        let meanAtk=0; for (let i=0;i<n;i++) meanAtk+=attack[i]; meanAtk/=n;
        for (let i=0;i<n;i++) { attack[i]/=meanAtk; defence[i]*=meanAtk; }
      }
      function poisson(k,l){ if(l<=0) return k===0?1:0; let lp=-l+k*Math.log(l); for(let i=2;i<=k;i++) lp-=Math.log(i); return Math.exp(lp); }
      function tau(hg,ag,lH,mA,r){
        if (hg===0&&ag===0) return Math.max(0.01,1-lH*mA*r);
        if (hg===1&&ag===0) return Math.max(0.01,1+mA*r);
        if (hg===0&&ag===1) return Math.max(0.01,1+lH*r);
        if (hg===1&&ag===1) return Math.max(0.01,1-r);
        return 1;
      }
      let bestRho=0, bestLL=-Infinity;
      for (let r=-0.15; r<=0.15; r+=0.01) {
        let ll=0;
        matches.forEach(m => {
          const hi=tIdx[m.home], ai=tIdx[m.away];
          const lH=attack[hi]*defence[ai]*homeAdv, mA=attack[ai]*defence[hi];
          ll += m.w*(Math.log(tau(m.hg,m.ag,lH,mA,r)) + Math.log(Math.max(poisson(m.hg,lH),1e-10)) + Math.log(Math.max(poisson(m.ag,mA),1e-10)));
        });
        if (ll>bestLL) { bestLL=ll; bestRho=r; }
      }
      const rho=bestRho, MAX_G=7;
      const hi=tIdx[homeTeam], ai=tIdx[awayTeam];
      const lH=attack[hi]*defence[ai]*homeAdv, mA=attack[ai]*defence[hi];
      let pHome=0,pDraw=0,pAway=0,bestP=0,bestH=0,bestA=0;
      for (let h=0;h<=MAX_G;h++) for (let a=0;a<=MAX_G;a++) {
        const p = Math.max(0, tau(h,a,lH,mA,rho)*poisson(h,lH)*poisson(a,mA));
        if (h>a) pHome+=p; else if (h<a) pAway+=p; else pDraw+=p;
        if (p>bestP) { bestP=p; bestH=h; bestA=a; }
      }
      const total = pHome+pDraw+pAway || 1;
      return { homeWin:Math.round(100*pHome/total), draw:Math.round(100*pDraw/total),
        awayWin:Math.round(100*pAway/total), expectedHome:lH.toFixed(2), expectedAway:mA.toFixed(2),
        likelyScore: bestH+"\u2013"+bestA, dataPoints: matches.length };
    }

    /* Shared row markup (logo + linked name + score, winner highlighted) —
       used by both the results carousels and the knockout bracket cards,
       so they always look identical. */
    function matchRowsHTML(m, hg, ag) {
      const hWon = hg!=null && ag!=null && hg>ag;
      const aWon = hg!=null && ag!=null && ag>hg;
      const hLogoHTML = m.home_logo ? "<img src=\""+esc(m.home_logo)+"\" class=\"ko-logo\" alt=\"\">" : "";
      const aLogoHTML = m.away_logo ? "<img src=\""+esc(m.away_logo)+"\" class=\"ko-logo\" alt=\"\">" : "";
      return (
        "<div class=\"ko-team "+(hWon?"ko-winner":aWon?"ko-loser":"")+"\">"+
          "<div class=\"ko-team-left\">"+hLogoHTML+teamLink(m.home_short||m.home_full)+"</div>"+
          "<span class=\"ko-score\">"+(hg!=null?hg:"")+"</span>"+
        "</div>"+
        "<div class=\"ko-team "+(aWon?"ko-winner":hWon?"ko-loser":"")+"\">"+
          "<div class=\"ko-team-left\">"+aLogoHTML+teamLink(m.away_short||m.away_full)+"</div>"+
          "<span class=\"ko-score\">"+(ag!=null?ag:"")+"</span>"+
        "</div>"
      );
    }

    /* ── MATCH CARD (mirrors club-page.js / region-page-sections.js) ── */
    function makeCard(m, type, allForH2H) {
      const hg = type !== "upcoming" ? m.home_goals : null;
      const ag = type !== "upcoming" ? m.away_goals : null;
      const g  = String(m.gp||"").trim();
      const min = type === "live" && !isNaN(Number(g)) ? g+"\u2032" : "";
      const liveDot = type==="live" ? "<span style=\"display:inline-block;width:6px;height:6px;border-radius:50%;background:#C2A14A;margin-right:4px;animation:bsf-pulse 1.4s infinite;vertical-align:middle;\"></span>" : "";

      const el = document.createElement("div");
      el.className = "ko-match ko-animate";
      el.style.cssText = "flex:0 0 auto;min-width:230px;max-width:250px;scroll-snap-align:start;";
      el.innerHTML =
        "<div class=\"ko-date\">"+liveDot+esc(fmtDate(m.date))+" &middot; "+esc(m._comp ? m._comp.label : m.league)+(min?" &middot; <strong>"+min+"</strong>":"")+"</div>"+
        matchRowsHTML(m, hg, ag);

      if (type === "upcoming" && allForH2H) {
        setTimeout(() => {
          const dc = dixonColes(allForH2H, m.home_short, m.away_short, {});
          if (!dc) return;
          const pred = document.createElement("div");
          pred.innerHTML =
            "<div style=\"border-top:1px solid #e8e8e6;margin-top:8px;padding-top:8px;\">"+
            "<div style=\"font-weight:600;font-size:11px;margin-bottom:6px;\">Prediction</div>"+
            "<div style=\"display:flex;gap:4px;margin-bottom:6px;\">"+
              "<div style=\"flex:1;text-align:center;padding:4px;background:#2F3E46;color:#fff;border-radius:3px;\"><div style=\"font-size:13px;font-weight:700;\">"+dc.homeWin+"%</div></div>"+
              "<div style=\"flex:1;text-align:center;padding:4px;background:#888;color:#fff;border-radius:3px;\"><div style=\"font-size:13px;font-weight:700;\">"+dc.draw+"%</div></div>"+
              "<div style=\"flex:1;text-align:center;padding:4px;background:#A44A3F;color:#fff;border-radius:3px;\"><div style=\"font-size:13px;font-weight:700;\">"+dc.awayWin+"%</div></div>"+
            "</div>"+
            "<div style=\"font-size:10px;color:#888;\">Most likely: <strong>"+dc.likelyScore+"</strong> &middot; xG "+dc.expectedHome+"&ndash;"+dc.expectedAway+"</div>"+
            "</div>";
          el.appendChild(pred);
        }, 0);
      }
      return el;
    }

    function carousel(containerId, matches, type, allForH2H) {
      if (!matches.length) return "";
      const els = matches.map(m => makeCard(m, type, allForH2H));
      setTimeout(() => {
        const track = document.getElementById(containerId);
        if (track) els.forEach(e => track.appendChild(e));
      }, 0);
      return `<div style="display:flex;align-items:center;gap:0.5rem;margin-bottom:0.5rem;">
        <button class="bsf-region__carousel-btn" onclick="document.getElementById('${containerId}').scrollBy({left:-260,behavior:'smooth'})">◀</button>
        <div id="${containerId}" style="display:flex;gap:1rem;overflow-x:auto;scroll-snap-type:x mandatory;scroll-behavior:smooth;padding-bottom:0.5rem;flex:1;min-width:0;"></div>
        <button class="bsf-region__carousel-btn" onclick="document.getElementById('${containerId}').scrollBy({left:260,behavior:'smooth'})">▶</button>
      </div>`;
    }

    /* ── STANDINGS (Campeonato Nacional, league phase only) ──── */
    function buildStandings(matches) {
      const t = {};
      matches.forEach(m => {
        const h = norm(m.home_short||m.home_full), a = norm(m.away_short||m.away_full);
        if (!h || !a) return;
        [[h,m.home_short||m.home_full],[a,m.away_short||m.away_full]].forEach(([k,name]) => {
          if (!t[k]) t[k] = { key:k, name, p:0,w:0,d:0,l:0,gf:0,ga:0,pts:0 };
        });
        const hg = m.home_goals, ag = m.away_goals;
        if (hg == null || ag == null) return;
        t[h].p++; t[a].p++;
        t[h].gf += hg; t[h].ga += ag; t[a].gf += ag; t[a].ga += hg;
        if (hg > ag)      { t[h].w++; t[h].pts+=3; t[a].l++; }
        else if (ag > hg) { t[a].w++; t[a].pts+=3; t[h].l++; }
        else              { t[h].d++; t[a].d++; t[h].pts++; t[a].pts++; }
      });
      return Object.values(t).sort((x,y) => y.pts-x.pts || (y.gf-y.ga)-(x.gf-x.ga) || y.gf-x.gf);
    }

    function renderStandingsTable(table) {
      if (!table.length) return `<p style="font-size:11px;color:#888;">No league-phase results yet.</p>`;
      const rowsHTML = table.map((r, idx) => {
        const pos = idx+1;
        const promoted = pos <= 4;
        const gd = r.gf - r.ga;
        const link = clubPageMap[norm(r.name)] || "";
        const nameCell = link
          ? "<a href=\""+esc(link)+"\" class=\"bsf-national__club-link\">"+esc(r.name)+"</a>"
          : esc(r.name);
        return `<tr class="${promoted ? "bsf-national__promote" : ""}">
          <td class="col-pos">${pos}</td>
          <td class="col-team">${nameCell}${promoted ? " <span class=\"bsf-national__promote-tag\">→ KO</span>" : ""}</td>
          <td>${r.p}</td><td>${r.w}</td><td>${r.d}</td><td>${r.l}</td>
          <td>${r.gf}</td><td>${r.ga}</td>
          <td>${gd>=0?"+":""}${gd}</td>
          <td class="col-pts">${r.pts}</td>
        </tr>`;
      }).join("");
      return `<div class="bsf-club__table-wrap">
        <table class="bsf-club__table">
          <thead><tr><th>#</th><th style="text-align:left">Club</th><th>P</th><th>W</th><th>D</th><th>L</th><th>GF</th><th>GA</th><th>GD</th><th>Pts</th></tr></thead>
          <tbody>${rowsHTML}</tbody>
        </table>
      </div>`;
    }

    /* ── KNOCKOUT BRACKET (Semifinal / Final, handles 2-legged ties) ── */
    function groupTies(matches) {
      const groups = {};
      matches.forEach(m => {
        const key = [norm(m.home_short||m.home_full), norm(m.away_short||m.away_full)].sort().join("||");
        if (!groups[key]) groups[key] = [];
        groups[key].push({ ...m, _d: toDate(m.date) });
      });
      return Object.values(groups).map(legs => legs.sort((a,b) => (a._d||0)-(b._d||0)));
    }

    /* Each tie renders as one or two standard match cards (identical
       style to the results carousel, logos + winner highlight included),
       plus an aggregate line when there are two legs. */
    function renderTie(legs) {
      const teamA = legs[0].home_short || legs[0].home_full;
      const teamB = legs[0].away_short || legs[0].away_full;
      let aggA = 0, aggB = 0, played = 0;

      const legCards = legs.map((leg, i) => {
        const isAHome = norm(leg.home_short||leg.home_full) === norm(teamA);
        if (leg.home_goals != null && leg.away_goals != null) {
          played++;
          aggA += isAHome ? leg.home_goals : leg.away_goals;
          aggB += isAHome ? leg.away_goals : leg.home_goals;
        }
        const legLabel = legs.length > 1 ? ("Leg "+(i+1)+" &middot; ") : "";
        return `<div class="ko-match ko-animate" style="width:100%;max-width:100%;box-sizing:border-box;margin-bottom:6px;">
          <div class="ko-date">${legLabel}${esc(fmtDate(leg.date))}</div>
          ${matchRowsHTML(leg, leg.home_goals, leg.away_goals)}
        </div>`;
      }).join("");

      const aggLabel = legs.length > 1 && played
        ? "<div class=\"ko-date\" style=\"margin:2px 0 10px;\">Aggregate: <strong>"+teamLink(teamA)+" "+aggA+"\u2013"+aggB+" "+teamLink(teamB)+"</strong></div>"
        : "";

      return `<div class="bsf-national__tie" style="width:100%;max-width:100%;box-sizing:border-box;margin-bottom:12px;">
        ${legCards}
        ${aggLabel}
      </div>`;
    }

    /* Typical bracket layout: one column per round, Semifinals feeding
       into the Final, left-to-right on desktop, stacked on mobile.
       Uses the site's existing .ko-bracket/.ko-round/.ko-match-list
       classes (so any bracket styling already in Basofu_complete.css
       still applies) plus scoped fallback sizing/columns of our own. */
    function renderKnockout(matches) {
      const order = ["semifinal", "final"];
      const byRound = {};
      matches.forEach(m => {
        const key = norm(m.week);
        if (!byRound[key]) byRound[key] = [];
        byRound[key].push(m);
      });
      const roundKeys = Object.keys(byRound).sort((a,b) => {
        const ia = order.indexOf(a), ib = order.indexOf(b);
        return (ia<0?99:ia) - (ib<0?99:ib);
      });
      if (!roundKeys.length) return "";
      const roundsHTML = roundKeys.map(rk => {
        const ties = groupTies(byRound[rk]);
        const label = rk.charAt(0).toUpperCase()+rk.slice(1);
        return `<div class="ko-round bsf-national__ko-round">
          <div class="ko-round-title bsf-national__ko-round-title">${esc(label)}</div>
          <div class="ko-match-list">${ties.map(renderTie).join("")}</div>
        </div>`;
      }).join("");
      return `<div class="ko-bracket bsf-national__bracket">${roundsHTML}</div>`;
    }

    /* ── CHAMPIONS (4 named competitions, per gender) ─────────── */
    function championsFor(gender) {
      const genderRows = (honoursData || []).filter(h => isWomensLeague(h.competition||"") === (gender==="women"));
      const cards = COMP_DEFS.map(cd => {
        const entries = genderRows.filter(h => {
          const k = matchKey(h.competition||"");
          return cd.test(k);
        }).map(h => ({
          year: normSeason(h.year||"") || (h.year||""),
          winner: (h.winner||"").trim()
        })).filter(e => e.winner && !["not known","not held","unknown","tbd","n/a",""].includes(e.winner.toLowerCase()));

        if (!entries.length) return null;
        entries.sort((a,b) => String(b.year).localeCompare(String(a.year)));
        const latest = entries[0];
        const prev = entries.slice(1,3);
        return `<div class="bsf-region__champ-card">
          <div class="bsf-region__champ-comp">${esc(cd.label)}</div>
          <div class="bsf-region__champ-winner">${esc(latest.winner)}</div>
          <div class="bsf-region__champ-year">${esc(latest.year)}</div>
          ${prev.length ? "<div class=\"bsf-region__champ-prev\">"+prev.map(e=>"<span>"+esc(e.winner)+" <em>"+esc(e.year)+"</em></span>").join("")+"</div>" : ""}
        </div>`;
      }).filter(Boolean);
      return cards.length
        ? `<div class="bsf-region__champs">${cards.join("")}</div>`
        : `<p style="font-size:11px;color:#888;">No champions found yet.</p>`;
    }

    /* ── BUILD ONE GENDER COLUMN ───────────────────────────────── */
    function buildColumn(gender, slug) {
      const genderRows = rows.filter(r => r._gender === gender);
      const seasonRows = genderRows.filter(r => r.season === SEASON);

      const dated = r => ({ ...r, _d: toDate(r.date) });
      const live     = seasonRows.filter(isLive).map(dated).filter(r=>r._d).sort((a,b)=>a._d-b._d).slice(0,10);
      const upcoming = seasonRows.filter(r=>!isLive(r)&&isUpcoming(r)).map(dated).filter(r=>r._d).sort((a,b)=>a._d-b._d).slice(0,10);
      const recent   = seasonRows.filter(r=>!isLive(r)&&isFinished(r)).map(dated).filter(r=>r._d).sort((a,b)=>b._d-a._d).slice(0,10);

      const tabs = [
        live.length     ? { key:"live",     label: live.length+" LIVE" } : null,
        upcoming.length ? { key:"upcoming", label:"UPCOMING" }           : null,
        recent.length   ? { key:"recent",   label:"RESULTS" }           : null
      ].filter(Boolean);
      const defaultTab = (tabs[0] && tabs[0].key) || "recent";

      const resultsHTML = tabs.length ? `
        <div class="bsf-results-tabs">
          ${tabs.map(t => `<button class="bsf-results-tab${t.key===defaultTab?" active":""}" data-tab="${t.key}"
            onclick="(function(b){var s=b.closest('.bsf-national__col');s.querySelectorAll('.bsf-results-tab').forEach(function(x){x.classList.remove('active');});b.classList.add('active');s.querySelectorAll('.bsf-results-panel').forEach(function(x){x.style.display=x.dataset.panel===b.dataset.tab?'':'none';});})(this)">${t.label}</button>`).join("")}
        </div>
        <div class="bsf-results-panel" data-panel="live" style="display:${defaultTab==="live"?"":"none"};">${carousel("bsf-nat-live-"+slug, live, "live", null)}</div>
        <div class="bsf-results-panel" data-panel="upcoming" style="display:${defaultTab==="upcoming"?"":"none"};">${carousel("bsf-nat-upcoming-"+slug, upcoming, "upcoming", genderRows)}</div>
        <div class="bsf-results-panel" data-panel="recent" style="display:${defaultTab==="recent"?"":"none"};">${carousel("bsf-nat-recent-"+slug, recent, "recent", null)}</div>
      ` : `<p style="font-size:11px;color:#888;">No matches found.</p>`;

      /* League table: Campeonato Nacional, league phase only, this season */
      const leagueMatches = genderRows.filter(r =>
        r._comp && r._comp.id === "nacional" && r.season === SEASON && isLeaguePhase(r) &&
        r.home_goals != null && r.away_goals != null
      );
      const standings = buildStandings(leagueMatches);

      /* Knockout: Campeonato Nacional, non-numeric week, this season */
      const knockoutMatches = genderRows.filter(r =>
        r._comp && r._comp.id === "nacional" && r.season === SEASON && isKnockoutPhase(r)
      );

      const genderLabel = gender === "women" ? "Women" : "Men";

      return `
        <div class="bsf-national__col">
          <div class="bsf-national__col-header">${esc(genderLabel)}</div>

          <div class="bsf-region__section"><div class="bsf-region__section-label">Champions</div></div>
          ${championsFor(gender)}

          <div class="bsf-region__section"><div class="bsf-region__section-label">Results</div></div>
          ${resultsHTML}

          <div class="bsf-region__section">
            <div class="bsf-region__section-label">Campeonato Nacional — League Phase</div>
            ${SEASON ? `<span class="bsf-club__section-sub">${esc(SEASON)}</span>` : ""}
          </div>
          ${renderStandingsTable(standings)}
          <p style="font-size:10px;color:#888;margin:6px 0 0;">Top 4 (gold, <em>→ KO</em>) advance to the knockout stage.</p>

          ${knockoutMatches.length ? `
          <div class="bsf-region__section"><div class="bsf-region__section-label">Campeonato Nacional — Knockout</div></div>
          ${renderKnockout(knockoutMatches)}` : ""}
        </div>
      `;
    }

    /* ── NEWS (shared, full width, tag "National") ────────────── */
    let newsHTML = "";
    try {
      const res = await fetch(`/news?tag=National&format=json`, { cache:"no-store" });
      if (res.ok) {
        const json = await res.json();
        const items = (json.items || []).filter(p => (p.tags||[]).some(t => norm(t) === "national")).slice(0,8);
        if (items.length) {
          newsHTML = `
            <div class="bsf-region__section"><div class="bsf-region__section-label">News</div></div>
            <div style="display:flex;align-items:center;gap:0.5rem;margin-bottom:1rem;">
              <button class="bsf-region__carousel-btn" onclick="document.getElementById('bsf-nat-news').scrollBy({left:-280,behavior:'smooth'})">◀</button>
              <div id="bsf-nat-news" style="display:flex;gap:1rem;overflow-x:auto;scroll-snap-type:x mandatory;scroll-behavior:smooth;padding-bottom:0.5rem;flex:1;min-width:0;">
                ${items.map(p => {
                  const img = p.assetUrl || "";
                  const date = p.publishOn ? fmtDate(new Date(p.publishOn).toISOString().slice(0,10)) : "";
                  const imgHTML = img ? "<div class=\"bsf-region__news-img\" style=\"background-image:url('"+esc(img)+"')\"></div>" : "<div class=\"bsf-region__news-img bsf-region__news-img--empty\"></div>";
                  return `<a href="${esc(p.fullUrl||"#")}" class="bsf-region__news-card">
                    ${imgHTML}
                    <div class="bsf-region__news-body">
                      ${date ? "<div class=\"bsf-region__news-date\">"+date+"</div>" : ""}
                      <div class="bsf-region__news-title">${esc(p.title||"")}</div>
                    </div>
                  </a>`;
                }).join("")}
              </div>
              <button class="bsf-region__carousel-btn" onclick="document.getElementById('bsf-nat-news').scrollBy({left:280,behavior:'smooth'})">▶</button>
            </div>`;
        }
      }
    } catch(e) { /* news is non-fatal */ }

    /* ── SCOPED STYLES (injected once) ────────────────────────── */
    const styleHTML = `<style>
      .bsf-national__cols, .bsf-national__cols * { box-sizing:border-box; }
      .bsf-national__cols { display:grid; grid-template-columns:minmax(0,1fr) minmax(0,1fr); gap:2rem; align-items:start; max-width:100%; overflow-x:hidden; }
      .bsf-national__col { min-width:0; max-width:100%; overflow-x:hidden; }
      @media (max-width:900px) { .bsf-national__cols { grid-template-columns:minmax(0,1fr); gap:0; } .bsf-national__col { margin-bottom:2rem; } }
      .bsf-national__col-header { font-family:'Inter',system-ui,sans-serif; font-size:11px; font-weight:700; letter-spacing:0.16em; text-transform:uppercase; color:#fff; background:#1C1C1C; padding:8px 12px; margin-bottom:14px; }
      .bsf-national__promote td { background:rgba(194,161,74,0.08); border-left:3px solid #C2A14A; }
      .bsf-national__promote-tag { font-size:9px; font-weight:700; letter-spacing:0.06em; color:#C2A14A; white-space:nowrap; }
      .bsf-national__club-link { color:inherit; text-decoration:none; border-bottom:1px solid transparent; }
      .bsf-national__club-link:hover { border-bottom-color:currentColor; }
      .bsf-national__col .bsf-club__table-wrap { overflow-x:auto; -webkit-overflow-scrolling:touch; max-width:100%; margin:0; padding:0; }
      .bsf-national__col .bsf-club__table { width:100%; }
      .bsf-national__col td, .bsf-national__col th { overflow-wrap:break-word; word-break:break-word; }
      .bsf-national__bracket { display:flex; gap:1.5rem; align-items:flex-start; width:100%; max-width:100%; overflow-x:auto; }
      .bsf-national__ko-round { flex:1 1 0; min-width:210px; max-width:100%; }
      .bsf-national__ko-round-title { font-size:9px; font-weight:700; letter-spacing:0.14em; text-transform:uppercase; color:#888; margin-bottom:8px; }
      .bsf-national__tie .ko-match { overflow-wrap:break-word; word-break:break-word; }
      @media (max-width:640px) { .bsf-national__bracket { flex-direction:column; } .bsf-national__ko-round { min-width:0; width:100%; } }
    </style>`;

    /* ── RENDER (re-invoked in place whenever the season changes;
       SEASON is a closure variable, not a global, so this never
       needs a page reload) ──────────────────────────────────── */
    function renderPage() {
      const seasonSelectHTML = seasons.length > 1 ? `
        <div style="margin-bottom:1rem;">
          <label>Season:
            <select id="bsf-national-season">
              ${seasons.map(s => `<option value="${esc(s)}"${s===SEASON?" selected":""}>${esc(s)}</option>`).join("")}
            </select>
          </label>
        </div>` : "";

      root.innerHTML = [
        styleHTML,
        BIO ? `<div class="bsf-region__bio">${BIO}</div>` : "",
        seasonSelectHTML,
        `<div class="bsf-national__cols">${buildColumn("men","men")}${buildColumn("women","women")}</div>`,
        newsHTML
      ].join("\n");

      const seasonSel = document.getElementById("bsf-national-season");
      if (seasonSel) {
        seasonSel.addEventListener("change", () => {
          SEASON = seasonSel.value;
          renderPage();
        });
      }
    }

    renderPage();

  } catch (err) {
    console.error("[Basofu national]", err);
    root.innerHTML = `<p style="color:red;font-family:monospace;font-size:12px;">Error: ${esc(err.message)}</p>`;
  }

})();
