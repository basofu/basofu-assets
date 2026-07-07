(async function () {
  /* ============================================================
     CONFIG
  ============================================================ */

  // >>> Change this per region page, OR set window.BSF_REGION before loading this script <<<
  const REGION = window.BSF_REGION || "São Vicente";

  // Promotion / Relegation config
  // Only applied to Division 1 tables, not groups.
  const PROREL = {
    "Fogo": {
      div1: {
        solidFromBottom: 3    // separation 2 from bottom (relegation)
      },
      div2: {
        solidAfter: 2,        // separation after 2nd place (promotion)
      }
    },
    "Sal": {
      div1: {
        solidFromBottom: 2
      },
      div2: {
        solidAfter: 1,
      }
    },
    "Santiago Norte": {
      div1: {
        solidFromBottom: 3
      },
      div2: {
        solidAfter: 2,
      }
    },
    "Santiago Sul": {
      div1: {
        solidFromBottom: 3
      },
      div2: {
        solidAfter: 2,
      }
    },
    "São Vicente": {
      div1: {
        solidFromBottom: 2,
        dashedFromBottom: 3
      },
      div2: {
        solidAfter: 1,
        dashedAfter: 2,
      }
    },
    "Boa Vista": {},
    "Brava": {},
    "Maio": {},
    "Santo Antão Norte": {},
    "Santo Antão Sul": {},
    "São Nicolau": {}
  };

  /* ============================================================
   COMPETITION TYPES (Region → Competition → Type)
   - "league"          = table only
   - "knockout"        = knockout bracket only
   - "group-knockout"  = group tables + bracket
============================================================ */

const COMPETITION_TYPE = {
  "Boa Vista": {
    "Campeonato Regional": "league",
    "Torneio de Abertura": "league",
    "Taça Bubista": "knockout",
    "Supertaça": "knockout"
  },

  "Brava": {
    "Campeonato Regional": "league",
    "Torneio de Abertura": "league",
    "Taça da Brava": "group-knockout",
    "Supertaça": "knockout"
  },

  "Fogo": {
    "Campeonato Regional": "league",
    "Torneio de Abertura": "league",
    "Taça Fogo": "knockout",
    "Taça Inter-campeões": "knockout",
    "Supertaça": "knockout"
  },

  "Maio": {
    "Campeonato Regional": "league",
    "Torneio de Abertura": "league",
    "Taça Djar Maio": "group-knockout",
    "Taça dos Campeões": "knockout",
    "Supertaça": "knockout"
  },

  "Sal": {
    "Campeonato Regional": "league",
    "Torneio de Abertura": "league",
    "Taça Dja D'Sal": "knockout",
    "Supertaça": "knockout"
  },

  "Santo Antão Norte": {
    "Campeonato Regional": "league",
    "Taça Santo Antão Norte": "group-knockout",
    "Supertaça": "knockout"
  },

  "Santo Antão Sul": {
    "Campeonato Regional": "league",
    "Taça Santo Antão Sul": "knockout",
    "Supertaça": "knockout"
  },

  "São Nicolau": {
    "Campeonato Regional": "league",
    "Torneio de Abertura": "league",
    "Taça São Nicolau": "knockout",
    "Supertaça": "knockout"
  },

  "São Vicente": {
    "Campeonato Regional": "league",
    "Torneio de Abertura": "group-knockout",
    "Taça São Vicente": "knockout",
    "Supertaça": "knockout",
    "Champions Tournament": "group-knockout"
  },

  "Santiago Norte": {
    "Campeonato Regional": "league",
    "Torneio de Abertura": "league",
    "Taça Regional": "knockout",
    "Supertaça": "knockout",
    "Taça Grupo Amantes Futebol Tarrafal": "group-knockout"
  },

  "Santiago Sul": {
    "Campeonato Regional": "league",
    "Torneio de Abertura": "league",
    "Taça Santiago Sul": "knockout",
    "Supertaça": "knockout",
    "Taça Grupo Amantes Futebol Tarrafal": "group-knockout"

  },

  "National": {
    "Campeonato Nacional": "group-knockout",
    "Taça Nacional": "knockout",
    "Supertaça Nacional": "knockout",
    "GAFT Cup": "knockout"
  }
};


  const SHEET_ID = "1DW7ManjyRcPMguQOvx8WQqEnjvs3e4rTW48lezqnM4c";
  const GID = "714759634";

  const COL = {
    date: "Date",
    season: "Season",
    week: "Week",
    home: "Home",
    homeGoals: "Home Goals",
    away: "Away",
    awayGoals: "Away Goals",
    region: "Region",
    league: "League",
    division: "Division",
    group: "Group",
    homeScorers: "Home Scorers",
    awayScorers: "Away Scorers",
    notes: "Notes",
    homeTeamFull: "Home Team Full",
    awayTeamFull: "Away Team Full",
    homeShort: "Home Short",
    awayShort: "Away Short",
    homeLogo: "Home Logo",
    awayLogo: "Away Logo",
    gameProgress: "Game Progress"
  };

  function norm(str) {
    return (str || "").normalize("NFC").trim();
  }

  const FILTERS = {
    region: norm(REGION),
    league: "",
    division: "",
    group: "",
    season: ""
  };

  /* Deferred DOM lookups — elements may not exist at parse time
     if region-page-sections.js builds them asynchronously */
  const getContainer    = () => document.getElementById("basofu-league-container");
  const getSeasonSelect = () => document.getElementById("basofu-season-select");
  const getTabsContainer= () => document.getElementById("basofu-competition-tabs");
  /* Alias for backwards compat with code that uses container directly */
  let container     = null;
  let seasonSelect  = null;
  let tabsContainer = null;

  // Live refresh: auto-recalculate tables every minute while any match is in-progress
  let __basofuLiveTimer = null;

  function hasLiveMatches(rows) {
    return (rows || []).some(r => isInProgressMatch(r.game_progress));
  }

  async function refreshAndRender(regionRows) {
    try {
      const allRows = await fetchResults();
      const rr = allRows.filter(r => norm(r.region) === norm(REGION));
      // preserve current filters
      populateSeasonOptions(rr);
      populateCompetitionTabs(rr);
      mainRender(rr);
      updateDebugOverlay();
      scheduleLiveRefresh(rr);
    } catch (e) {
      console.warn("Basofu live refresh failed:", e);
    }
  }

  function scheduleLiveRefresh(regionRows) {
    const filtered = applyFilters(regionRows);
    const live = hasLiveMatches(filtered);
    document.body.classList.toggle("basofu-has-live", live);

    if (!live) {
      if (__basofuLiveTimer) clearInterval(__basofuLiveTimer);
      __basofuLiveTimer = null;
      return;
    }

    if (__basofuLiveTimer) return; // already running
    __basofuLiveTimer = setInterval(() => refreshAndRender(regionRows), 60 * 1000);
  }

 /* ============================================================
   Determine Competition Type Based on Region Mapping
============================================================ */

function getCompetitionType(region, compName) {
  const r = COMPETITION_TYPE[region];
  if (r && r[compName]) return r[compName];
  return "league"; // fallback
}

function isKnockoutCompetition(compName) {
  return getCompetitionType(FILTERS.region, compName) === "knockout";
}

function isGroupKnockoutCompetition(compName) {
  return getCompetitionType(FILTERS.region, compName) === "group-knockout";
}


  /* ============================================================
     HELPERS
  ============================================================ */

  function cleanURL(u) {
    if (!u) return "";
    const srcMatch = String(u).match(/src\s*=\s*["']([^"']+)["']/i);
    if (srcMatch) return srcMatch[1].trim();
    return String(u).replace(/^"|"$/g, "").trim();
  }

  function extractScorers(str) {
    if (!str) return [];
    const regex = /\[\s*([^,\[\]]+)\s*,/g;
    const out = [];
    let m;
    while ((m = regex.exec(str)) !== null) {
      out.push(m[1].trim().replace(/^['"]|['"]$/g, ""));
    }
    return out;
  }

  /* ============================================================
     DATA LOADER — via Cloudflare Worker (window.BASOFU)
  ============================================================ */

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

  /* Map GAS camelCase response → the field names normalizeRow expects */
  function gasRowToSheetRow(r) {
    function extractSrc(raw) {
      if (!raw) return "";
      const m = String(raw).match(/src\s*=\s*["']\s*([^"'\s]+)\s*["']/i);
      if (m) return m[1].trim();
      if (/^https?:\/\//i.test(String(raw).trim())) return String(raw).trim();
      return raw;
    }
    function normSeason(val) {
      if (!val) return "";
      const s = String(val).trim();
      if (/^\d{4}\/\d{2}$/.test(s)) return s;
      if (/^\d{4}-\d{2}$/.test(s)) return s.replace("-", "/");
      try { const d = new Date(s); if (!isNaN(d)) { const y = d.getFullYear(); return y + "/" + String(y+1).slice(2); } } catch(e) {}
      return s;
    }
    return {
      "Date":           r.date       || r["Date"]           || "",
      "Season":         normSeason(r.season || r["Season"]  || ""),
      "Week":           r.week       || r["Week"]           || "",
      "Home":           r.home       || r["Home"]           || "",
      "Home Goals":     r.hg !== undefined ? (r.hg === "" ? "" : r.hg) : (r["Home Goals"] || ""),
      "Away":           r.away       || r["Away"]           || "",
      "Away Goals":     r.ag !== undefined ? (r.ag === "" ? "" : r.ag) : (r["Away Goals"] || ""),
      "Region":         r.region     || r["Region"]         || "",
      "League":         r.league     || r["League"]         || "",
      "Division":       r.division   || r["Division"]       || "",
      "Group":          r.group      || r["Group"]          || "",
      "Home Scorers":   r.homeScorers || r["Home Scorers"]  || "",
      "Away Scorers":   r.awayScorers || r["Away Scorers"]  || "",
      "Notes":          r.notes      || r["Notes"]          || "",
      "Home Team Full": r.homeFull   || r["Home Team Full"] || "",
      "Away Team Full": r.awayFull   || r["Away Team Full"] || "",
      "Home Short":     r.homeShort  || r["Home Short"]     || "",
      "Away Short":     r.awayShort  || r["Away Short"]     || "",
      "Home Logo":      extractSrc(r.homeLogo || r["Home Logo"] || ""),
      "Away Logo":      extractSrc(r.awayLogo || r["Away Logo"] || ""),
      "Game Progress":  r.gp         || r["Game Progress"]  || ""
    };
  }

  async function fetchResults() {
    const B = await waitForBasofu();
    const rows = await B.getResults(REGION);
    return rows.map(r => normalizeRow(gasRowToSheetRow(r)));
  }

  function normalizeRow(r) {
    // Goals: keep null for blanks so "Upcoming" matches don't look like 0–0
    const hgRaw = r[COL.homeGoals];
    const agRaw = r[COL.awayGoals];

    // Try to detect a status column if present (varies across sheets)
    const statusRaw =
      (r["Status"] || r["Game Status"] || r["State"] || r["Result Type"] || r["FT/Upcoming"] || "");

    return {
      date: r[COL.date] || "",
      season: norm(r[COL.season]),
      week: (r[COL.week] || "").trim(),
      homeKey: norm(r[COL.home]),
      awayKey: norm(r[COL.away]),
      home_full: norm(r[COL.homeTeamFull]),
      away_full: norm(r[COL.awayTeamFull]),
      home_short: norm(r[COL.homeShort]),
      away_short: norm(r[COL.awayShort]),
      home_goals: (hgRaw === "" || hgRaw == null) ? null : Number(hgRaw),
      away_goals: (agRaw === "" || agRaw == null) ? null : Number(agRaw),
      region: norm(r[COL.region]),
      competition: norm(r[COL.league]),
      division: norm(r[COL.division]),
      group: norm(r[COL.group]),
      home_scorers: r[COL.homeScorers] || "",
      away_scorers: r[COL.awayScorers] || "",
      notes: r[COL.notes] || "",
      status: norm(statusRaw),
      game_progress: (r[COL.gameProgress] || "").trim(),
      home_logo: cleanURL(r[COL.homeLogo]),
      away_logo: cleanURL(r[COL.awayLogo])
    };
  }

  /* ============================================================
     FILTERING, GROUPING, STANDINGS
  ============================================================ */

  
  // ============================================================
  // LEAGUE TABLE INCLUSION RULES (Basofu)
  // Only count matches where Game Progress is FT or a numeric minute.
  // ============================================================
  function parseProgressMinute(gp) {
    const s = String(gp || "").trim();
    if (!s) return null;
    if (s === "FT") return null;
    // Accept pure numbers (e.g., 1..120). If your sheet uses "90+3", this will return 90.
    const m = s.match(/^\s*(\d{1,3})/);
    if (!m) return null;
    const n = Number(m[1]);
    return Number.isFinite(n) ? n : null;
  }

  function isValidLeagueMatch(gp) {
    if (gp == null) return false;
    const s = String(gp).trim();
    if (s === "FT") return true;
    return s !== "" && !isNaN(s);
  }

  function isInProgressMatch(gp) {
    const s = String(gp || "").trim();
    return s !== "" && s !== "FT" && !isNaN(s);
  }

  // Debug: track excluded matches from league table calculations
  const BASOFU_DEBUG = {
    enabled: true,
    excluded: [] // {competition, bucketType, bucketKey, date, home, away, progress, status, score, reason}
  };

  function addExcludedMatch(m, ctx, reason) {
    if (!BASOFU_DEBUG.enabled) return;
    BASOFU_DEBUG.excluded.push({
      competition: ctx.competition || "",
      bucketType: ctx.bucketType || "",
      bucketKey: ctx.bucketKey || "",
      date: m.date || "",
      home: m.home_full || m.homeKey || "",
      away: m.away_full || m.awayKey || "",
      progress: m.game_progress || "",
      status: m.status || "",
      score: (m.home_goals == null && m.away_goals == null) ? "" : `${m.home_goals ?? ""}-${m.away_goals ?? ""}`,
      reason
    });
  }

  function filterLeagueMatches(matches, ctx) {
    const included = [];
    const live = [];
    (matches || []).forEach(m => {
      if (isValidLeagueMatch(m.game_progress)) {
        included.push(m);
        if (isInProgressMatch(m.game_progress)) live.push(m);
      } else {
        addExcludedMatch(m, ctx, `Excluded: Game Progress="${String(m.game_progress || "").trim() || "(blank)"}"`);
      }
    });
    return { included, live };
  }

  // ============================================================
  // DEBUG OVERLAY UI (Ctrl+Shift+D to toggle)
  // ============================================================
  let __basofuDebugOverlayEl = null;

  function ensureDebugOverlay() {
    if (__basofuDebugOverlayEl) return __basofuDebugOverlayEl;

    const el = document.createElement("div");
    el.id = "basofu-debug-overlay";
    el.className = "basofu-debug-overlay basofu-debug-hidden";
    el.innerHTML = `
      <div class="basofu-debug-header">
        <div>
          <strong>Basofu Debug</strong>
          <span class="basofu-debug-sub">Excluded league-table matches</span>
        </div>
        <div class="basofu-debug-actions">
          <button type="button" class="basofu-debug-btn" data-action="copy">Copy</button>
          <button type="button" class="basofu-debug-btn" data-action="clear">Clear</button>
          <button type="button" class="basofu-debug-btn" data-action="close">Close</button>
        </div>
      </div>
      <div class="basofu-debug-body">
        <div class="basofu-debug-summary"></div>
        <div class="basofu-debug-list"></div>
      </div>
    `;
    document.body.appendChild(el);

    el.addEventListener("click", async (e) => {
      const btn = e.target.closest("button[data-action]");
      if (!btn) return;
      const action = btn.getAttribute("data-action");
      if (action === "close") toggleDebugOverlay(false);
      if (action === "clear") { BASOFU_DEBUG.excluded = []; updateDebugOverlay(); }
      if (action === "copy") {
        const txt = JSON.stringify(BASOFU_DEBUG.excluded, null, 2);
        try { await navigator.clipboard.writeText(txt); btn.textContent = "Copied!"; setTimeout(()=>btn.textContent="Copy", 900); }
        catch { btn.textContent = "Copy failed"; setTimeout(()=>btn.textContent="Copy", 900); }
      }
    });

    document.addEventListener("keydown", (e) => {
      if (e.ctrlKey && e.shiftKey && (e.key === "D" || e.key === "d")) {
        e.preventDefault();
        toggleDebugOverlay();
      }
    });

    // Small floating toggle button
    const fab = document.createElement("button");
    fab.type = "button";
    fab.id = "basofu-debug-fab";
    fab.className = "basofu-debug-fab";
    fab.textContent = "Debug";
    fab.addEventListener("click", () => toggleDebugOverlay());
    document.body.appendChild(fab);

    __basofuDebugOverlayEl = el;
    return el;
  }

  function toggleDebugOverlay(force) {
    const el = ensureDebugOverlay();
    const show = (typeof force === "boolean")
      ? force
      : el.classList.contains("basofu-debug-hidden");
    el.classList.toggle("basofu-debug-hidden", !show);
    updateDebugOverlay();
  }

  function updateDebugOverlay() {
    const el = ensureDebugOverlay();
    const summary = el.querySelector(".basofu-debug-summary");
    const list = el.querySelector(".basofu-debug-list");

    const ex = BASOFU_DEBUG.excluded || [];
    summary.textContent = `${ex.length} excluded match(es)`;

    if (!ex.length) {
      list.innerHTML = `<div class="basofu-debug-empty">No excluded matches in the current render.</div>`;
      return;
    }

    const rows = ex.slice(-200).reverse().map(x => {
      const where = [x.competition, x.bucketType ? `${x.bucketType}:${x.bucketKey}` : ""].filter(Boolean).join(" • ");
      const line1 = `${x.date ? x.date + " — " : ""}${x.home} vs ${x.away}`;
      const line2 = `${where}${x.score ? " • " + x.score : ""}${x.progress ? " • GP=" + x.progress : ""}${x.status ? " • " + x.status : ""}`;
      return `
        <div class="basofu-debug-item">
          <div class="basofu-debug-line1">${escapeHtml(line1)}</div>
          <div class="basofu-debug-line2">${escapeHtml(line2)}</div>
          <div class="basofu-debug-reason">${escapeHtml(x.reason || "")}</div>
        </div>
      `;
    }).join("");

    list.innerHTML = rows;
  }

  function escapeHtml(s) {
    return String(s || "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }


function applyFilters(rows) {
    return rows.filter(r =>
      (FILTERS.region === "" || norm(r.region) === norm(FILTERS.region)) &&
      (FILTERS.league === "" || norm(r.competition) === norm(FILTERS.league)) &&
      (FILTERS.division === "" || norm(r.division) === norm(FILTERS.division)) &&
      (FILTERS.group === "" || norm(r.group) === norm(FILTERS.group)) &&
      (FILTERS.season === "" || norm(r.season) === norm(FILTERS.season))
    );
  }

  function computeStandings(matches) {
    const table = {};

    function ensure(key) {
      if (!table[key]) {
        table[key] = {
          key,
          fullName: "",
          shortName: "",
          played: 0,
          won: 0,
          drawn: 0,
          lost: 0,
          gf: 0,
          ga: 0,
          gd: 0,
          pts: 0,
          logo: "",
          form: []
        };
      }
    }

    const sorted = [...matches].sort((a, b) => Number(a.week) - Number(b.week));

    sorted.forEach(m => {
      const home = m.homeKey;
      const away = m.awayKey;
      const hg = (m.home_goals == null ? 0 : m.home_goals);
      const ag = (m.away_goals == null ? 0 : m.away_goals);
      if (!home || !away) return;

      ensure(home);
      ensure(away);

      if (!table[home].fullName && m.home_full) table[home].fullName = m.home_full;
      if (!table[home].shortName && m.home_short) table[home].shortName = m.home_short;
      if (!table[away].fullName && m.away_full) table[away].fullName = m.away_full;
      if (!table[away].shortName && m.away_short) table[away].shortName = m.away_short;

      if (!table[home].logo && m.home_logo) table[home].logo = m.home_logo;
      if (!table[away].logo && m.away_logo) table[away].logo = m.away_logo;

      table[home].played++;
      table[away].played++;

      table[home].gf += hg;
      table[home].ga += ag;
      table[away].gf += ag;
      table[away].ga += hg;

      if (hg > ag) {
        table[home].won++; table[home].pts += 3;
        table[away].lost++;
        table[home].form.push("W");
        table[away].form.push("L");
      } else if (ag > hg) {
        table[away].won++; table[away].pts += 3;
        table[home].lost++;
        table[home].form.push("L");
        table[away].form.push("W");
      } else {
        table[home].drawn++; table[away].drawn++;
        table[home].pts++; table[away].pts++;
        table[home].form.push("D");
        table[away].form.push("D");
      }

      table[home].gd = table[home].gf - table[home].ga;
      table[away].gd = table[away].gf - table[away].ga;
    });

    const rows = Object.values(table).sort(
      (a, b) =>
        b.pts - a.pts ||
        b.gd - a.gd ||
        b.gf - a.gf
    );

    rows.forEach(r => r.form = r.form.slice(-5));
    return rows;
  }

  function computePrevWeek(matches) {
    const weeks = matches.map(m => Number(m.week) || 0);
    const maxWeek = Math.max(...weeks);
    const prev = matches.filter(m => Number(m.week) < maxWeek);
    if (!prev.length) return [];
    return computeStandings(prev);
  }

  function computeGoldenBoot(matches) {
    const s = {};
    matches.forEach(m => {
      extractScorers(m.home_scorers).forEach(n => {
        const key = n + "||" + m.homeKey;
        if (!s[key]) s[key] = { player: n, team: m.home_full || m.homeKey, goals: 0 };
        s[key].goals++;
      });
      extractScorers(m.away_scorers).forEach(n => {
        const key = n + "||" + m.awayKey;
        if (!s[key]) s[key] = { player: n, team: m.away_full || m.awayKey, goals: 0 };
        s[key].goals++;
      });
    });
    return Object.values(s).sort((a, b) =>
      b.goals - a.goals || a.player.localeCompare(b.player)
    );
  }

  /* ============================================================
     GOLDEN BOOT RENDERER
     (only when ≥1 match AND at least 2 scorers)
  ============================================================ */

  function renderGoldenBootForMatches(matches) {
    if (!matches || !matches.length) return "";
    const list = computeGoldenBoot(matches);
    if (list.length < 2) return "";

    const top = list.slice(0, 10);

    return `
      <h4>Golden Boot</h4>
      <table class="standings">
        <thead>
          <tr><th>Player</th><th>Team</th><th>Goals</th></tr>
        </thead>
        <tbody>
          ${top.map(x => `
            <tr>
              <td class="team-name">
                <span class="name-full">${x.player}</span>
                <span class="name-short">${x.player}</span>
              </td>
              <td>${x.team}</td>
              <td>${x.goals}</td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    `;
  }

    /* ============================================================
     KNOCKOUT HELPERS
  ============================================================ */

  function formatScore(m) {
    const base = `${m.home_goals} – ${m.away_goals}`;
    const note = (m.notes || "").toLowerCase();
    if (note.includes("pen") || note.includes("shootout")) {
      const penMatch = note.match(/(\d+)\D+(\d+)/);
      if (penMatch) {
        const p1 = penMatch[1];
        const p2 = penMatch[2];
        return `${base} <span class="ko-pen">(${p1}–${p2} pens)</span>`;
      }
      return `${base} <span class="ko-pen">(pens)</span>`;
    }
    return base;
  }

  function formatDate(m) {
    if (!m.date) return "";
    return `<div class="ko-date">${m.date}</div>`;
  }

  // Determine winner of a single knockout match (incl. pens)
  function computeMatchWinnerKey(m) {
    const hg = m.home_goals;
    const ag = m.away_goals;
    if (hg > ag) return m.homeKey;
    if (ag > hg) return m.awayKey;

    const note = (m.notes || "").toLowerCase();
    if (note.includes("pen") || note.includes("shootout")) {
      const penMatch = note.match(/(\d+)\D+(\d+)/);
      if (penMatch) {
        const p1 = Number(penMatch[1]);
        const p2 = Number(penMatch[2]);
        if (p1 > p2) return m.homeKey;
        if (p2 > p1) return m.awayKey;
      }
    }
    return null;
  }

  function isNumericRound(val) {
  return /^\d+$/.test(String(val || "").trim());
}

function normalizeRoundLabel(label) {
  const v = String(label || "").trim();
  if (!v) return "";
  const lower = v.toLowerCase();
  if (lower === "semi-final" || lower === "semi finals" || lower === "semi finals") return "Semifinal";
  if (lower === "semi-finals" || lower === "semi finals") return "Semifinal";
  if (lower === "quarter-finals" || lower === "quarter finals" || lower === "quarter-final") return "Quarterfinal";
  if (lower === "final") return "Final";
  // Keep "Round of 16" as-is casing
  if (lower.includes("round of 16")) return "Round of 16";
  if (lower.includes("semi")) return "Semifinal";
  if (lower.includes("quarter")) return "Quarterfinal";
  if (lower.includes("final")) return "Final";
  return v;
}

function parseLegInfo(roundText) {
  const raw = String(roundText || "").trim();
  const m = raw.match(/^(.*?)(?:\s+leg\s*(\d+))$/i);
  if (!m) return { base: normalizeRoundLabel(raw), leg: null, raw };
  return { base: normalizeRoundLabel(m[1].trim()), leg: Number(m[2]), raw };
}

function isExplicitKnockoutRound(val) {
  if (!val) return false;
  const v = String(val).toLowerCase();
  return (
    v.includes("round of") ||
    v.includes("quarter") ||
    v.includes("semi") ||
    v.includes("final")
  );
}

function isUpcomingMatch(m) {
  const status = String(m.status || "").toLowerCase();
  const note = String(m.notes || "").toLowerCase();

  const upcomingFlag =
    status.includes("upcoming") || status.includes("tbd") || status.includes("scheduled") ||
    note.includes("upcoming") || note.includes("tbd") || note.includes("scheduled");

  // If goals are blank/null, treat as upcoming (do NOT auto-infer 0–0)
  const noGoals = (m.home_goals == null && m.away_goals == null);

  return upcomingFlag || noGoals;
}

// Placeholder text for upcoming rounds (used for Final, etc.)
function placeholderForRound(prevRoundBase, matchIndex) {
  const r = String(prevRoundBase || "").toLowerCase();
  if (r.includes("semi")) return `Winner of SF${matchIndex + 1}`;
  if (r.includes("quarter")) return `Winner of QF${matchIndex + 1}`;
  if (r.includes("round of 16")) return `Winner of R16-${matchIndex + 1}`;
  return "Winner";
}

/* ============================================================
   PENALTY HELPERS
============================================================ */

function extractPenalties(notes) {
  if (!notes) return null;

  const n = String(notes).toLowerCase();
  if (!n.includes("pen")) return null;

  // Try to extract numbers like 3-2 or 4–3
  const m = n.match(/(\d+)\D+(\d+)/);
  if (!m) return { home: null, away: null };

  return {
    home: Number(m[1]),
    away: Number(m[2])
  };
}

function penaltyWinnerKey(m) {
  const pens = extractPenalties(m.notes);
  if (!pens) return null;

  if (pens.home > pens.away) return m.homeKey;
  if (pens.away > pens.home) return m.awayKey;
  return null;
}

/* ============================================================
   KNOCKOUT ROUND INFERENCE
============================================================ */

function inferRoundLabel(matchCount) {
  if (matchCount === 8) return "Round of 16";
  if (matchCount === 4) return "Quarter-Finals";
  if (matchCount === 2) return "Semi-Finals";
  if (matchCount === 1) return "Final";
  return null;
}

/* ============================================================
   KNOCKOUT GROUPING (FINAL)
============================================================ */
function didHomeWin(m) {
  if (m.home_goals > m.away_goals) return true;
  if (m.away_goals > m.home_goals) return false;

  const note = (m.notes || "").toLowerCase();
  if (note.includes("pen")) {
    const pm = note.match(/(\d+)\D+(\d+)/);
    if (pm) return Number(pm[1]) > Number(pm[2]);
  }
  return false;
}

function normalizeKnockoutRound(wk) {
  if (!wk) return null;
  const w = wk.toLowerCase();

  if (w.includes("round of 16")) return "Round of 16";
  if (w.includes("quarter")) return "Quarter-Finals";
  if (w.includes("semi")) return "Semi-Finals";
  if (w.includes("final")) return "Final";

  return null;
}

function groupKnockout(matches, compType) {
  // Returns an ordered object:
  // {
  //   "Round of 16": { ties: [...], upcoming: [...] },
  //   "Quarterfinal": { ... },
  //   "Semifinal": { ... },
  //   "Final": { ... }
  // }
  const rounds = {};

  (matches || []).forEach(m => {
    const wkRaw = String(m.week || "").trim();
    if (!wkRaw) return;

    // GROUP-KNOCKOUT: numeric rounds (and any row with a group label) are group stage only
    if (compType === "group-knockout") {
      if (isNumericRound(wkRaw) || (m.group && String(m.group).trim())) return;
      if (!isExplicitKnockoutRound(wkRaw)) return;
    }

    // Pure knockout: only explicit knockout labels
    if (compType === "knockout") {
      if (!isExplicitKnockoutRound(wkRaw)) return;
    }

    const info = parseLegInfo(wkRaw);
    const base = info.base || wkRaw;

    if (!rounds[base]) rounds[base] = [];
    rounds[base].push({ ...m, _roundBase: base, _leg: info.leg, _roundRaw: info.raw });
  });

  const order = ["Round of 16", "Quarterfinal", "Semifinal", "Final"];
  const ordered = {};
  order.forEach(r => {
    if (rounds[r] && rounds[r].length) ordered[r] = rounds[r];
  });

  // Include any other explicit rounds that might appear (rare) at the end
  Object.keys(rounds).forEach(r => {
    if (!ordered[r]) ordered[r] = rounds[r];
  });

  return ordered;
}

/* ============================================================
   KNOCKOUT BRACKET RENDERER (FINAL)
============================================================ */
function placeholderForRound(prevRound, index) {
  if (!prevRound) return "TBD";

  const r = prevRound.toLowerCase();

  if (r.includes("semi")) return `Winner of SF${index + 1}`;
  if (r.includes("quarter")) return `Winner of QF${index + 1}`;
  if (r.includes("round of 16")) return `Winner of R16-${index + 1}`;

  return "Winner";
}

function isLegMatch(m) {
  return /leg\s*\d/i.test(String(m.week || ""));
}

function getAggregateKey(m) {
  // Order-independent pairing
  return [m.homeKey, m.awayKey].sort().join("||");
}

function computeAggregates(matches) {
  const agg = {};

  matches.forEach(m => {
    if (!isLegMatch(m)) return;

    const key = getAggregateKey(m);
    if (!agg[key]) {
      agg[key] = {
        home: m.homeKey,
        away: m.awayKey,
        hg: 0,
        ag: 0
      };
    }
    agg[key].hg += Number(m.home_goals || 0);
    agg[key].ag += Number(m.away_goals || 0);
  });

  return agg;
}

function getAggregateWinner(agg, legMatches = []) {
  if (!agg || !agg.teams) return null;

  const entries = Object.entries(agg.teams);
  if (entries.length !== 2) return null;

  const [[t1, g1], [t2, g2]] = entries;

  // Aggregate winner
  if (g1 > g2) return t1;
  if (g2 > g1) return t2;

  // Aggregate tie → penalties on last leg
  const lastLeg = [...legMatches]
    .filter(isLegMatch)
    .sort((a, b) => String(a.week).localeCompare(String(b.week)))
    .pop();

  if (!lastLeg) return null;

  return penaltyWinnerKey(lastLeg);
}


function renderKnockoutBracket(rounds, clubPageMap) {
  clubPageMap = clubPageMap || {};
  const roundNames = Object.keys(rounds || {});
  if (!roundNames.length) return "";

  function tieKey(m) {
    const a = String(m.homeKey || "").trim();
    const b = String(m.awayKey || "").trim();
    return [a, b].sort().join("||");
  }

  function extractPenalties(notes) {
    if (!notes) return null;
    const n = String(notes).toLowerCase();
    if (!n.includes("pen")) return null;

    // supports 4-3, 4–3, "4 3", etc.
    const m = n.match(/(\d+)\D+(\d+)/);
    if (!m) return null;
    return { home: Number(m[1]), away: Number(m[2]) };
  }

  function formatSingleScore(v) {
    return (v == null || Number.isNaN(v)) ? "" : String(v);
  }

  function computeAggregate(legs) {
    const totals = {}; // teamKey -> goals
    legs.forEach(l => {
      if (l.home_goals != null) totals[l.homeKey] = (totals[l.homeKey] || 0) + Number(l.home_goals);
      if (l.away_goals != null) totals[l.awayKey] = (totals[l.awayKey] || 0) + Number(l.away_goals);
    });

    const teams = Object.keys(totals);
    if (teams.length !== 2) return { totals, winnerKey: null, aggText: "", penText: "" };

    const [t1, t2] = teams;
    const g1 = totals[t1] || 0;
    const g2 = totals[t2] || 0;

    let winnerKey = null;
    let penText = "";

    const latest = [...legs]
      .sort((a,b) => (a._leg || 0) - (b._leg || 0))
      .slice(-1)[0];

    if (g1 > g2) winnerKey = t1;
    else if (g2 > g1) winnerKey = t2;
    else {
      // agg tie → decide by pens in latest leg (if present)
      const pens = extractPenalties(latest.notes);
      if (pens) {
        penText = `pens ${pens.home}–${pens.away}`;
        winnerKey = (pens.home > pens.away) ? latest.homeKey : latest.awayKey;
      } else {
        // fallback to your existing winner logic (might look for "pen" / shootout text)
        winnerKey = computeMatchWinnerKey(latest);
      }
    }

    // agg text oriented by latest leg home/away
    const homeAgg = totals[latest.homeKey] ?? 0;
    const awayAgg = totals[latest.awayKey] ?? 0;

    return {
      totals,
      winnerKey,
      aggText: `(agg ${homeAgg}–${awayAgg})`,
      penText
    };
  }

  let html = `<div class="ko-bracket-grid">`;

  roundNames.forEach((roundName, roundIdx) => {
    const matches = rounds[roundName] || [];

    // group into ties (two-leg) by team identity
    const byTie = {};
    matches.forEach(m => {
      const k = tieKey(m);
      if (!byTie[k]) byTie[k] = [];
      byTie[k].push(m);
    });

    const ties = Object.values(byTie).map(legs => {
      legs.sort((a,b) =>
        ((a._leg || 0) - (b._leg || 0)) ||
        String(a.date||"").localeCompare(String(b.date||"")) ||
        String(a.week||"").localeCompare(String(b.week||""))
      );
      return legs;
    });

    const prevRoundBase = roundIdx > 0 ? roundNames[roundIdx - 1] : null;

    html += `
      <div class="ko-col">
        <h3 class="ko-round-title">${roundName}</h3>
        <div class="ko-col-inner">
          ${ties.map((legs) => {
            const isTwoLeg = legs.length >= 2;
            const anyUpcoming = legs.some(isUpcomingMatch);

            // Upcoming placeholder (single row)
            if (anyUpcoming && legs.length === 1) {
              const m = legs[0];
              const homeName = placeholderForRound(prevRoundBase, 0);
              const awayName = placeholderForRound(prevRoundBase, 1);

              return `
                <div class="ko-tie">
                  <div class="ko-match ko-animate ko-upcoming">
                    ${m.date ? `<div class="ko-date">${m.date}</div>` : `<div class="ko-round-upcoming">Upcoming</div>`}

                    <div class="ko-team ko-upcoming-team">
                      <div class="ko-team-left">
                        ${m.home_logo ? `<img class="ko-logo" src="${m.home_logo}">` : ""}
                        ${homeName.toString().startsWith("<a") ? homeName : `<span class="ko-team-name">${homeName}</span>`}
                      </div>
                    </div>

                    <div class="ko-team ko-upcoming-team">
                      <div class="ko-team-left">
                        ${m.away_logo ? `<img class="ko-logo" src="${m.away_logo}">` : ""}
                        ${awayName.toString().startsWith("<a") ? awayName : `<span class="ko-team-name">${awayName}</span>`}
                      </div>
                    </div>
                  </div>
                </div>
              `;
            }

            // winner + meta
            const agg = isTwoLeg
              ? computeAggregate(legs)
              : (() => {
                  const m = legs[0];
                  const pens = extractPenalties(m.notes);
                  return {
                    winnerKey: computeMatchWinnerKey(m),
                    aggText: "",
                    penText: pens ? `pens ${pens.home}–${pens.away}` : ""
                  };
                })();

            const wrapClass = isTwoLeg ? "ko-tie ko-two-leg" : "ko-tie";

            const legCardsHtml = legs.map((m, legIdx) => {
              const winnerKey = agg.winnerKey;
              const homeIsWinner = !!(winnerKey && winnerKey === m.homeKey);
              const awayIsWinner = !!(winnerKey && winnerKey === m.awayKey);

              const _hKey    = (m.home_short || m.homeKey || "").trim().toLowerCase();
              const _aKey    = (m.away_short || m.awayKey || "").trim().toLowerCase();
              const _hUrl    = clubPageMap[_hKey] || "";
              const _aUrl    = clubPageMap[_aKey] || "";
              const _hLabel  = m.home_short || m.homeKey || "";
              const _aLabel  = m.away_short || m.awayKey || "";
              const homeName = _hUrl ? `<a href="${_hUrl}" class="ko-team-name">${_hLabel}</a>` : _hLabel;
              const awayName = _aUrl ? `<a href="${_aUrl}" class="ko-team-name">${_aLabel}</a>` : _aLabel;

              // For single-leg ties (Final etc.), render pens on the card.
              const showSingleLegPens = (!isTwoLeg && agg.penText);

              return `
                <div class="ko-match ko-animate">
                  ${m.date ? `<div class="ko-date">${m.date}</div>` : ""}

                  <div class="ko-team ${homeIsWinner ? "ko-winner" : "ko-loser"}">
                    <div class="ko-team-left">
                      ${m.home_logo ? `<img class="ko-logo" src="${m.home_logo}">` : ""}
                      ${homeName.toString().startsWith("<a") ? homeName : `<span class="ko-team-name">${homeName}</span>`}
                    </div>
                    <span class="ko-score">${formatSingleScore(m.home_goals)}</span>
                  </div>

                  <div class="ko-team ${awayIsWinner ? "ko-winner" : "ko-loser"}">
                    <div class="ko-team-left">
                      ${m.away_logo ? `<img class="ko-logo" src="${m.away_logo}">` : ""}
                      ${awayName.toString().startsWith("<a") ? awayName : `<span class="ko-team-name">${awayName}</span>`}
                    </div>
                    <span class="ko-score">${formatSingleScore(m.away_goals)}</span>
                  </div>

                  ${isTwoLeg && (legIdx === legs.length - 1) ? `
                    <div class="ko-aggregate">
                      ${agg.aggText}
                      ${agg.penText ? `<span class="ko-pen">${agg.penText}</span>` : ``}
                    </div>
                  ` : ``}

                  ${showSingleLegPens ? `
                    <div class="ko-aggregate">
                      <span class="ko-pen">${agg.penText}</span>
                    </div>
                  ` : ``}
                </div>
              `;
            }).join("");

            return `<div class="${wrapClass}">${legCardsHtml}</div>`;
          }).join("")}
        </div>
      </div>
    `;
  });

  html += `</div>`;
  return html;
}

  function renderKnockoutMiniList(matches) {
    if (!matches || !matches.length) return "";

    const sorted = [...matches].sort((a, b) =>
      (a.date || "").localeCompare(b.date || "") ||
      (Number(a.week) || 0) - (Number(b.week) || 0)
    );

    return `
      <h4>Match List</h4>
      <table class="standings">
        <thead>
          <tr>
            <th>Date</th>
            <th>Home</th>
            <th>Score</th>
            <th>Away</th>
          </tr>
        </thead>
        <tbody>
          ${sorted.map(m => `
            <tr>
              <td>${m.date || ""}</td>
              <td class="team-name">
                <span class="name-full">${m.home_full || m.homeKey}</span>
                <span class="name-short">${m.home_short || m.homeKey}</span>
              </td>
              <td>${formatScore(m)}</td>
              <td class="team-name">
                <span class="name-full">${m.away_full || m.awayKey}</span>
                <span class="name-short">${m.away_short || m.awayKey}</span>
              </td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    `;
  }

  /* ============================================================
     COMPETITION GROUPING
  ============================================================ */

  function groupCompetitions(rows) {
    const comps = {};

    rows.forEach(r => {
      const comp = norm(r.competition);
      const div  = norm(r.division);
      const grp  = norm(r.group);

      if (!comps[comp]) {
        comps[comp] = {
          divisions: new Set(),
          groups: new Set(),
          buckets: {}
        };
      }

      const compObj = comps[comp];

      let bucketKey  = "MAIN";
      let bucketType = "main";

      if (grp) {
        bucketKey = grp;
        bucketType = "group";
        compObj.groups.add(grp);
      } else if (div) {
        bucketKey = div;
        bucketType = "division";
        compObj.divisions.add(div);
      }

      if (!compObj.buckets[bucketKey]) {
        compObj.buckets[bucketKey] = { type: bucketType, matches: [] };
      }
      compObj.buckets[bucketKey].matches.push(r);
    });

    return comps;
  }

  /* ============================================================
     PRO/REL RULE LOOKUP
  ============================================================ */

  function getProRelRules(region, divisionRaw, bucketType) {
    if (bucketType !== "division") return null;   // Only division tables
    const regionRules = PROREL[region];
    if (!regionRules) return null;

    const d = norm(divisionRaw).toLowerCase();
    let key = null;

    if (!d || d === "1" || d.includes("1ª") || d.includes("primeira") || d === "i") {
      key = "div1";
    } else if (d === "2" || d.includes("segunda") || d.includes("2ª") || d === "ii") {
      key = "div2";
    }

    if (!key) return null;
    return regionRules[key] || null;
  }

  /* ============================================================
     STANDINGS TABLE RENDERER
  ============================================================ */

  function renderStandingsTable(rows, prevRows, opts = {}) {
    const prevRank = {};
    (prevRows || []).forEach((r, i) => prevRank[r.key] = i + 1);

    const showArrows  = (opts.showArrows !== false);
    const bucketType  = opts.bucketType || "main";
    const divisionKey = opts.division || "";
    const totalRows   = rows.length;

    const rules = getProRelRules(FILTERS.region, divisionKey, bucketType);

    
    const liveMatches = (opts.liveMatches || []);
    const liveRowHtml = liveMatches.length
      ? (() => {
          const items = liveMatches.slice(0, 6).map(m => {
            const min = parseProgressMinute(m.game_progress);
            const minuteLabel = (min != null) ? `${min}′` : "LIVE";
            const score = `${m.home_goals ?? 0}–${m.away_goals ?? 0}`;
            return `${m.home_short || m.homeKey} ${score} ${m.away_short || m.awayKey} (${minuteLabel})`;
          }).join(" • ");
          const more = (liveMatches.length > 6) ? ` • +${liveMatches.length - 6} more` : "";
          return `<tr class="standings-live-row"><td colspan="17"><span class="live-dot"></span><span class="live-text">LIVE:</span> ${items}${more}</td></tr>`;
        })()
      : "";

    const bodyRowsHtml = rows.map((r, idx) => {
      const pos = idx + 1;
      let arrow = "";
      let rowClass = "";
      let arrowClass = "arrow";

      if (showArrows && prevRank[r.key]) {
        if (prevRank[r.key] > pos) {
          arrow = "↑";
          rowClass = "move-up";
          arrowClass += " arrow-up";
        } else if (prevRank[r.key] < pos) {
          arrow = "↓";
          rowClass = "move-down";
          arrowClass += " arrow-down";
        }
      }

      let trClasses = rowClass;

      if (rules) {
        if (rules.solidAfter && idx === rules.solidAfter) {
          trClasses += " pro-solid-top";
        }
        if (rules.dashedAfter && idx === rules.dashedAfter) {
          trClasses += " pro-dash-top";
        }
        if (rules.solidFromBottom && idx === (totalRows - rules.solidFromBottom)) {
          trClasses += " rel-solid-bot";
        }
        if (rules.dashedFromBottom && idx === (totalRows - rules.dashedFromBottom)) {
          trClasses += " rel-dash-bot";
        }
      }

      const fullName  = r.fullName || r.key;
      const shortName = r.shortName || r.key;

      return `
        <tr class="${trClasses.trim()}">
          <td class="${arrowClass}">${arrow}</td>
          <td>${pos}</td>
          <td>${r.logo ? `<img class="team-logo" src="${r.logo}" />` : ""}</td>
          <td class="team-name">
            ${(() => {
              const pageUrl = (opts.clubPageMap || {})[norm(r.shortName || r.key)]
                           || (opts.clubPageMap || {})[norm(r.fullName  || r.key)];
              return pageUrl
                ? `<a href="${pageUrl}" class="team-link">${shortName}</a>`
                : shortName;
            })()}
          </td>
          <td>${r.played}</td>
          <td>${r.won}</td>
          <td>${r.drawn}</td>
          <td>${r.lost}</td>
          <td>${r.gf}</td>
          <td>${r.ga}</td>
          <td>${r.gd}</td>
          ${r.form.map(f => `<td data-result="${f}">${f}</td>`).join("")}
          ${Array(5 - r.form.length).fill("<td></td>").join("")}
          <td class="points-col">${r.pts}</td>
        </tr>
      `;
    }).join("");

    return `
      <div class="table-wrapper">
        <table class="standings">
          <colgroup>
            <col style="width:24px;">
            <col style="width:32px;">
            <col style="width:60px;">
            <col style="width:auto;">
            <col style="width:40px;">
            <col style="width:40px;">
            <col style="width:40px;">
            <col style="width:40px;">
            <col style="width:40px;">
            <col style="width:40px;">
            <col style="width:40px;">
            <col style="width:32px;">
            <col style="width:32px;">
            <col style="width:32px;">
            <col style="width:32px;">
            <col style="width:32px;">
            <col style="width:80px;">
          </colgroup>
          <thead>
            <tr>
              <th></th>
              <th>#</th>
              <th></th>
              <th>Team</th>
              <th>GP</th>
              <th>W</th>
              <th>D</th>
              <th>L</th>
              <th>GF</th>
              <th>GA</th>
              <th>GD</th>
              <th colspan="5">Form</th>
              <th class="points-header"></th>
            </tr>
          </thead>
          <tbody>
            ${liveRowHtml}${bodyRowsHtml}
          </tbody>
        </table>
      </div>
    `;
  }

  /* ============================================================
     UI: SEASON SELECT & COMPETITION TABS
  ============================================================ */

  function populateSeasonOptions(regionRows) {
    const seasons = Array.from(
      new Set(regionRows.map(r => r.season).filter(Boolean))
    ).sort().reverse();

    seasonSelect.innerHTML =
      `<option value="">All Seasons</option>` +
      seasons.map(s => `<option value="${s}">${s}</option>`).join("");

    if (seasons.length) {
      FILTERS.season = seasons[0];
      seasonSelect.value = seasons[0];
    }
  }

  function chooseDefaultCompetition(competitions) {
    if (!competitions.length) return "";

    const priority = [
      "campeonato regional",
      "torneio de abertura",
      "taca", "taça",
      "supertaça", "super taca"
    ];

    const lower = competitions.map(c => c.toLowerCase());

    for (const p of priority) {
      const idx = lower.findIndex(c => c.includes(p));
      if (idx >= 0) return competitions[idx];
    }

    return competitions[0];
  }

  function populateCompetitionTabs(regionRows) {
    const rowsForSeason = regionRows.filter(
      r => FILTERS.season === "" || norm(r.season) === norm(FILTERS.season)
    );

    const competitions = Array.from(
      new Set(rowsForSeason.map(r => norm(r.competition)).filter(Boolean))
    ).sort();

    if (!competitions.length) {
      tabsContainer.innerHTML = "";
      FILTERS.league = "";
      return;
    }

    // Set default league if not already chosen
    if (!FILTERS.league) {
      FILTERS.league = chooseDefaultCompetition(competitions);
    }

    let html = `<button class="basofu-tab${FILTERS.league === "" ? " active" : ""}" data-comp="">All</button>`;
    html += competitions.map(c =>
      `<button class="basofu-tab${FILTERS.league === c ? " active" : ""}" data-comp="${c}">${c}</button>`
    ).join("");

    tabsContainer.innerHTML = html;

    tabsContainer.querySelectorAll(".basofu-tab").forEach(btn => {
      btn.addEventListener("click", () => {
        FILTERS.league = norm(btn.getAttribute("data-comp"));
        tabsContainer.querySelectorAll(".basofu-tab").forEach(b => b.classList.remove("active"));
        btn.classList.add("active");
        mainRender(regionRows);
        updateDebugOverlay();
        scheduleLiveRefresh(regionRows);
      updateDebugOverlay();
      scheduleLiveRefresh(regionRows);
    updateDebugOverlay();
    scheduleLiveRefresh(regionRows);
      });
    });
  }

  /* ============================================================
     MAIN RENDERER
     - Pure league competitions → tables only
     - Pure knockout competitions → bracket + GB + mini list
     - Group+KO competitions → group tables, then bracket+GB+mini list
  ============================================================ */

  function mainRender(regionRows) {
  // reset excluded list per render
  BASOFU_DEBUG.excluded = [];
  const filtered = applyFilters(regionRows);
  const comps = groupCompetitions(filtered);

  let html = "";

  for (const compName in comps) {
    const compObj = comps[compName];
    const buckets = compObj.buckets;
    const bucketKeys = Object.keys(buckets);

    if (!bucketKeys.length) continue;

    const hasMultiGroups = compObj.groups.size > 1;
    const hasMultiDivs   = compObj.divisions.size > 1;
    const multipleBuckets = bucketKeys.length > 1;

    const compType = getCompetitionType(FILTERS.region, compName);

    // Competition title
    html += `<h2 class="competition-title">${compName}</h2>`;

    /* =========================
       LEAGUE ONLY
    ========================== */
    if (compType === "league") {
      for (const bucketKey of bucketKeys) {
        const bucket = buckets[bucketKey];
        const matches = bucket.matches;
        const ctx = { competition: compName, bucketType: bucket.type, bucketKey };
        const { included: tableMatches, live: liveMatches } = filterLeagueMatches(matches, ctx);
        if (!matches.length) continue;

        if (multipleBuckets && bucket.type !== "main") {
          if (bucket.type === "group" && hasMultiGroups) {
            html += `<h3 class="group-title">Group ${bucketKey}</h3>`;
          } else if (bucket.type === "division" && hasMultiDivs) {
            html += `<h3 class="group-title">Division ${bucketKey}</h3>`;
          }
        }

        const now  = computeStandings(tableMatches);
        const prev = computePrevWeek(tableMatches);

        html += renderStandingsTable(now, prev, { clubPageMap,
          liveMatches,
          showArrows: true,
          bucketType: bucket.type,
          division: bucket.type === "division" ? bucketKey : ""
        });

        html += renderGoldenBootForMatches(tableMatches);
      }
    }

    /* =========================
       KNOCKOUT ONLY
    ========================== */
    else if (compType === "knockout") {

      const allMatches = bucketKeys.flatMap(k => buckets[k].matches);
      if (!allMatches.length) continue;

      const hasGroupStage = (compObj.groups.size > 0 || compObj.divisions.size > 0);

      if (hasGroupStage) {
        for (const bucketKey of bucketKeys) {
          const bucket = buckets[bucketKey];
          const matches = bucket.matches;
          if (!matches.length) continue;

          if (multipleBuckets && bucket.type !== "main") {
            if (bucket.type === "group" && hasMultiGroups) {
              html += `<h3 class="group-title">Group ${bucketKey}</h3>`;
            } else if (bucket.type === "division" && hasMultiDivs) {
              html += `<h3 class="group-title">Division ${bucketKey}</h3>`;
            }
          }

          const now  = computeStandings(matches);
          const prev = computePrevWeek(matches);

          html += renderStandingsTable(now, prev, { clubPageMap,
            showArrows: true,
            bucketType: bucket.type,
            division: bucket.type === "division" ? bucketKey : ""
          });
        }
      }

      // Now knockout stage
      const rounds = groupKnockout(
  allMatches,
  compType,
  hasGroupStage
);

      html += renderKnockoutBracket(rounds, clubPageMap);
      html += renderGoldenBootForMatches(allMatches);
      html += renderKnockoutMiniList(allMatches);
    }

    /* =========================
       GROUP → KNOCKOUT HYBRID
    ========================== */
    else if (compType === "group-knockout") {

      const allMatches = bucketKeys.flatMap(k => buckets[k].matches);
      if (!allMatches.length) continue;

      // Group tables first
      for (const bucketKey of bucketKeys) {
        const bucket = buckets[bucketKey];
        const matches = bucket.matches;
        if (!matches.length) continue;

        if (bucket.type !== "main") {
          html += `<h3 class="group-title">${bucket.type === "group" ? "Group" : "Division"} ${bucketKey}</h3>`;
        }

        const now  = computeStandings(matches);
        const prev = computePrevWeek(matches);

        html += renderStandingsTable(now, prev, { clubPageMap,
          showArrows: true,
          bucketType: bucket.type,
          division: bucket.type === "division" ? bucketKey : ""
        });
      }

      // Then knockout
      const rounds = groupKnockout(allMatches);
      html += renderKnockoutBracket(rounds, clubPageMap);
      html += renderGoldenBootForMatches(allMatches);
      html += renderKnockoutMiniList(allMatches);
    }
  }

  container.innerHTML = html || "<p>No matches found for this selection.</p>";
}


  /* ============================================================
     MAIN
  ============================================================ */

  try {
    /* Wait for BASOFU global (footer injection) */
    const BASOFU = await waitForBasofu();

    /* Resolve DOM elements — by now region-page-sections.js has
       already injected the standings HTML skeleton into the page */
    container     = getContainer();
    seasonSelect  = getSeasonSelect();
    tabsContainer = getTabsContainer();

    if (!container) {
      console.warn("[Basofu standings] #basofu-league-container not found — standings cannot render");
      return;
    }

    container.innerHTML = "<p>Loading…</p>";

    /* Fetch results + clubs metadata in parallel */
    const [allRows, clubsData] = await Promise.all([
      BASOFU.getResults(REGION).then(rows => rows.map(r => normalizeRow(gasRowToSheetRow(r)))),
      BASOFU.getClubsMeta(REGION).catch(() => [])
    ]);

    /* Build shortName → page URL lookup from clubs sheet */
    const clubPageMap = {};
    (clubsData || []).forEach(c => {
      const key  = norm(c.shortName || c["Short Name"] || "");
      const page = (c.page || c["Page"] || "").trim();
      if (key && page) clubPageMap[key] = page;
    });

    const regionRows = allRows.filter(r => norm(r.region) === norm(REGION));

    ensureDebugOverlay();

    populateSeasonOptions(regionRows);
    populateCompetitionTabs(regionRows);

    seasonSelect.addEventListener("change", () => {
      FILTERS.season = norm(seasonSelect.value);
      FILTERS.league = "";  // force recompute default
      populateCompetitionTabs(regionRows);
      mainRender(regionRows);
    });

    mainRender(regionRows);

  } catch (err) {
    console.error(err);
    container.innerHTML = "<p>Error loading Basofu standings.</p>";
  }
})();

/* ============================================================
   BASOFU – Knockout SVG Connectors & Enhancements
   Adds:
   1. SVG elbow connectors (responsive, no bleed)
   2. Aggregate (two-leg) handling
   3. Winner placeholders (e.g. Winner of SF1)
   4. CSS-controlled advancement coloring
============================================================ */

/* ============================================================
   SVG CONNECTOR DRAWER
============================================================ */

function drawKoConnectors() {
  const wrapper = document.querySelector(".ko-wrapper");
  const grid = wrapper?.querySelector(".ko-bracket-grid");
  const svg = wrapper?.querySelector(".ko-connectors");

  if (!wrapper || !grid || !svg) return;

  svg.innerHTML = "";

  const wRect = wrapper.getBoundingClientRect();
  svg.setAttribute("viewBox", `0 0 ${wRect.width} ${wRect.height}`);
  svg.setAttribute("width", wRect.width);
  svg.setAttribute("height", wRect.height);

  const cols = [...grid.querySelectorAll(".ko-col")];

  for (let i = 0; i < cols.length - 1; i++) {
    const fromMatches = cols[i].querySelectorAll(".ko-match");
    const toMatches = cols[i + 1].querySelectorAll(".ko-match");

    if (!toMatches.length) continue;

    toMatches.forEach((toMatch, idx) => {
      const toRect = toMatch.getBoundingClientRect();
      const tx = toRect.left - wRect.left;
      const ty = toRect.top + toRect.height / 2 - wRect.top;

      const sourceMatches = idx < fromMatches.length
        ? [fromMatches[idx]]
        : fromMatches;

      sourceMatches.forEach(fromMatch => {
        const r = fromMatch.getBoundingClientRect();
        const x1 = r.right - wRect.left;
        const y1 = r.top + r.height / 2 - wRect.top;
        const midX = x1 + (tx - x1) / 2;

        const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
        path.setAttribute(
          "d",
          `M ${x1} ${y1} H ${midX} V ${ty} H ${tx}`
        );
        path.setAttribute("class", "ko-connector");

        svg.appendChild(path);
      });
    });
  }
}

/* ============================================================
   AGGREGATE HANDLING
============================================================ */

function computeAggregateKey(m) {
  return [
    m.homeKey,
    m.awayKey,
    m.competition,
    m.roundLabel || ""
  ].sort().join("|");
}

function computeAggregates(matches) {
  const agg = {};

  matches.forEach(m => {
    if (!/leg/i.test(m.week)) return;

    const key = computeAggregateKey(m);
    if (!agg[key]) {
      agg[key] = {
        home: m.homeKey,
        away: m.awayKey,
        hg: 0,
        ag: 0
      };
    }
    agg[key].hg += m.home_goals;
    agg[key].ag += m.away_goals;
  });

  return agg;
}

/* ============================================================
   WINNER PLACEHOLDER SUPPORT
============================================================ */

function winnerPlaceholder(label) {
  return {
    placeholder: true,
    label
  };
}

function resolveWinnerLabel(match, fallback) {
  if (!match) return fallback;
  if (match.placeholder) return match.label;

  if (match.home_goals > match.away_goals) return match.home_short || match.homeKey;
  if (match.away_goals > match.home_goals) return match.away_short || match.awayKey;

  return fallback;
}

/* ============================================================
   RENDER HOOK
============================================================ */

function enhanceKnockoutRendering() {
  drawKoConnectors();
}

window.addEventListener("resize", drawKoConnectors);

/* ===== ENHANCED BRACKET FEATURES ===== */


/* ============================================================
   BASOFU — COMPETITIONS (ENHANCED BRACKETS)
   ------------------------------------------------------------
   DROP-IN Squarespace Code Block JS
   Features:
   ✔ League filtering (FT or numeric Game Progress)
   ✔ Auto-recalc every minute for live games
   ✔ LIVE table markers
   ✔ Debug overlay for excluded matches
   ✔ Division-aware group-knockout rendering
   ✔ Progression-sorted knockout brackets
   ✔ Animated winner flow
   ✔ Hover path highlighting
   ✔ Bracket collapsing (round toggle)
   ✔ Mobile-friendly stacked brackets
   ============================================================ */

/* =====================
   CONFIG
   ===================== */
const BASOFU_REFRESH_MS = 60000;

/* =====================
   GAME PROGRESS FILTER
   ===================== */
function isValidLeagueMatch(gp) {
  if (gp == null) return false;
  const v = String(gp).trim();
  if (v === "FT") return true;
  return !isNaN(v) && v !== "";
}

/* =====================
   WINNER HELPERS
   ===================== */
function getWinner(match) {
  if (match.home_goals == null || match.away_goals == null) return null;
  if (match.home_goals > match.away_goals) return match.homeKey;
  if (match.away_goals > match.home_goals) return match.awayKey;
  if (match.pen_home != null && match.pen_away != null) {
    return match.pen_home > match.pen_away ? match.homeKey : match.awayKey;
  }
  return null;
}

/* =====================
   KNOCKOUT PROGRESSION SORT
   ===================== */
function sortRoundByProgression(roundMatches, nextRoundMatches) {
  if (!nextRoundMatches || !nextRoundMatches.length) return roundMatches;

  const slotMap = {};
  nextRoundMatches.forEach((m, i) => {
    slotMap[m.homeKey] = i;
    slotMap[m.awayKey] = i;
  });

  const groups = {};
  roundMatches.forEach(m => {
    const w = getWinner(m);
    const slot = w != null && slotMap[w] != null ? slotMap[w] : "unknown";
    if (!groups[slot]) groups[slot] = [];
    groups[slot].push(m);
  });

  const ordered = [];
  Object.keys(groups)
    .sort((a, b) => a === "unknown" ? 1 : b === "unknown" ? -1 : a - b)
    .forEach(k => ordered.push(...groups[k]));

  return ordered;
}

/* =====================
   BRACKET COLLAPSING
   ===================== */
function enableBracketCollapse(container) {
  container.querySelectorAll(".ko-round-title").forEach(title => {
    title.addEventListener("click", () => {
      const col = title.closest(".ko-col");
      col.classList.toggle("collapsed");
    });
  });
}

/* =====================
   HOVER PATH HIGHLIGHT
   ===================== */
function enableHoverPaths(container) {
  container.querySelectorAll(".ko-team").forEach(team => {
    team.addEventListener("mouseenter", () => {
      const key = team.dataset.teamKey;
      container.querySelectorAll(`[data-team-key="${key}"]`)
        .forEach(el => el.classList.add("ko-highlight"));
    });
    team.addEventListener("mouseleave", () => {
      container.querySelectorAll(".ko-highlight")
        .forEach(el => el.classList.remove("ko-highlight"));
    });
  });
}

/* =====================
   ANIMATED WINNER FLOW
   ===================== */
function animateWinners(container) {
  container.querySelectorAll(".ko-team.ko-winner").forEach(el => {
    el.classList.add("ko-flow");
  });
}

/* =====================
   MOBILE STACKING
   ===================== */
function enableMobileStacking(container) {
  if (window.innerWidth <= 768) {
    container.classList.add("ko-mobile-stack");
  }
}

/* =====================
   MAIN INIT (called after render)
   ===================== */
function enhanceKnockout(container) {
  animateWinners(container);
  enableHoverPaths(container);
  enableBracketCollapse(container);
  enableMobileStacking(container);
}

/* =====================
   AUTO REFRESH FOR LIVE GAMES
   ===================== */
setInterval(() => {
  if (document.querySelector(".live-dot")) {
    console.log("[Basofu] Live match detected — refreshing tables");
    location.reload();
  }
}, BASOFU_REFRESH_MS);
