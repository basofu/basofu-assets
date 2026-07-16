/* ============================================================
   BASOFU — CLUB PAGE SCRIPT
   Hosted on GitHub, served via jsDelivr CDN.
   Each club page Code Block sets window.BSF_ISLAND and
   window.BSF_SHORT before loading this script.

   To update all club pages at once:
   1. Edit this file and push to GitHub
   2. Create a new release/tag on GitHub to bust the CDN cache
      OR append ?v=X to the script src in Squarespace
   ============================================================ */

(async function () {
  "use strict";

  /* ============================================================
     CONFIG — read from window variables set in the Code Block:
       window.BSF_ISLAND  — must match "Island" column exactly
       window.BSF_SHORT   — must match "Short Name" column exactly
  ============================================================ */
  const ISLAND     = window.BSF_ISLAND || "";
  const SHORT_NAME = window.BSF_SHORT  || "";

  if (!ISLAND || !SHORT_NAME) {
    document.getElementById("bsf-club-root").innerHTML =
      "<div class='bsf-club__error'>Club not configured. Set window.BSF_ISLAND and window.BSF_SHORT before loading this script.</div>";
    return;
  }
  /* ============================================================ */

  const N_RECENT = 8;
  const root     = document.getElementById("bsf-club-root");
  const loading  = document.getElementById("bsf-club-loading");

  /* ── WAIT FOR window.BASOFU ──────────────────────────────── */
  function waitForBasofu () {
    return new Promise((resolve, reject) => {
      if (window.BASOFU) return resolve(window.BASOFU);
      const t0 = Date.now();
      const iv = setInterval(() => {
        if (window.BASOFU) { clearInterval(iv); resolve(window.BASOFU); }
        else if (Date.now() - t0 > 10000) { clearInterval(iv); reject(new Error("BASOFU global not found")); }
      }, 50);
    });
  }

  /* ── HELPERS ─────────────────────────────────────────────── */
  function esc (s) {
    return String(s || "")
      .replace(/&/g,"&amp;").replace(/</g,"&lt;")
      .replace(/>/g,"&gt;").replace(/"/g,"&quot;");
  }

  function fmtDate (s) {
    if (!s) return "";
    /* Parse ISO dates (YYYY-MM-DD) as local date to avoid UTC timezone shift */
    const iso = String(s).match(/^(\d{4})-(\d{2})-(\d{2})$/);
    const d   = iso ? new Date(+iso[1], +iso[2]-1, +iso[3]) : new Date(s);
    if (isNaN(d)) return s;
    return d.toLocaleDateString("pt-CV", { day:"numeric", month:"short", year:"numeric" });
  }

  /* ── TOOLTIP POSITIONING ──────────────────────────────────────
     Fix: on narrow screens the old cursor-follow tooltip could open
     bottom-right and run off the viewport. Below ~640px we instead
     dock the tooltip over the match card itself (same width, same
     top position) so it always stays fully on screen. On wider
     screens we keep cursor-follow but clamp it to the viewport. ── */
  function placeTooltip(tip, el, e) {
    var isNarrow = window.innerWidth <= 640;
    if (isNarrow) {
      var r = el.getBoundingClientRect();
      tip.style.maxWidth = r.width + "px";
      tip.style.width = r.width + "px";
      tip.style.left = Math.max(6, r.left) + "px";
      tip.style.top  = Math.max(6, r.top) + "px";
      return;
    }
    tip.style.width = "";
    tip.style.maxWidth = "220px";
    var tw = tip.offsetWidth || 220, th = tip.offsetHeight || 100;
    var vw = window.innerWidth, vh = window.innerHeight;
    var x = e.clientX + 14, y = e.clientY + 14;
    if (x + tw > vw - 8) x = Math.max(8, e.clientX - tw - 14);
    if (y + th > vh - 8) y = Math.max(8, e.clientY - th - 14);
    tip.style.left = x + "px";
    tip.style.top  = y + "px";
  }

  /* parseRosterCell removed — roster now loaded live from Players sheet */

  /* ── KIT SVG BUILDER ─────────────────────────────────────────
     JERSEY PATTERNS — driven by the "Kit Home Pattern" / "Kit Away
     Pattern" columns in the Clubs sheet (see BasofuAPI.gs getClubs()).
     Accepted values: "normal" | "hoops" | "stripes" | "sash"
     (case-insensitive; blank/unrecognised falls back to "normal").
     primary = body colour, secondary = sleeves/collar (normal) or
     the contrasting stripe/hoop/sash colour (other patterns).
  ─────────────────────────────────────────────────────────── */
  const SHIRT_BODY_PATH = "M20,20 L8,35 L18,40 L18,80 L62,80 L62,40 L72,35 L60,20 Q52,14 40,14 Q28,14 20,20 Z";
  const SHIRT_CLIP_ID_SEQ = (function(){ let n = 0; return () => "bsfShirtClip" + (n++); })();

  function kitSVG (primary, secondary, label, pattern) {
    const p = primary   || "#cccccc";
    const s = secondary || "#999999";
    const pat = (pattern || "normal").toLowerCase().trim();
    const clipId = SHIRT_CLIP_ID_SEQ();

    let bodyFillLayer = `<path d="${SHIRT_BODY_PATH}" fill="${esc(p)}"/>`;

    if (pat === "hoops") {
      /* Horizontal stripes across the body, clipped to the shirt shape */
      const rows = [];
      for (let y = 14; y < 80; y += 11) {
        rows.push(`<rect x="0" y="${y}" width="80" height="5.5" fill="${esc(s)}"/>`);
      }
      bodyFillLayer = `
        <clipPath id="${clipId}"><path d="${SHIRT_BODY_PATH}"/></clipPath>
        <path d="${SHIRT_BODY_PATH}" fill="${esc(p)}"/>
        <g clip-path="url(#${clipId})">${rows.join("")}</g>`;
    } else if (pat === "stripes") {
      /* Vertical stripes across the body, clipped to the shirt shape */
      const cols = [];
      for (let x = 8; x < 72; x += 11) {
        cols.push(`<rect x="${x}" y="10" width="5.5" height="76" fill="${esc(s)}"/>`);
      }
      bodyFillLayer = `
        <clipPath id="${clipId}"><path d="${SHIRT_BODY_PATH}"/></clipPath>
        <path d="${SHIRT_BODY_PATH}" fill="${esc(p)}"/>
        <g clip-path="url(#${clipId})">${cols.join("")}</g>`;
    } else if (pat === "sash") {
      /* Single diagonal band, top-right to bottom-left */
      bodyFillLayer = `
        <clipPath id="${clipId}"><path d="${SHIRT_BODY_PATH}"/></clipPath>
        <path d="${SHIRT_BODY_PATH}" fill="${esc(p)}"/>
        <g clip-path="url(#${clipId})">
          <polygon points="80,14 80,34 26,90 6,90" fill="${esc(s)}"/>
        </g>`;
    }
    /* "normal" (default) just uses bodyFillLayer as initialised above */

    return `
      <svg class="bsf-club__shirt" width="80" height="90" viewBox="0 0 80 90" xmlns="http://www.w3.org/2000/svg">
        ${bodyFillLayer}
        <path d="${SHIRT_BODY_PATH}" fill="none" stroke="#00000022" stroke-width="1"/>
        <!-- Sleeves -->
        <path d="M20,20 L8,35 L18,40 L24,28 Z" fill="${esc(s)}" stroke="#00000022" stroke-width="1"/>
        <path d="M60,20 L72,35 L62,40 L56,28 Z" fill="${esc(s)}" stroke="#00000022" stroke-width="1"/>
        <!-- Collar -->
        <path d="M32,14 Q40,10 48,14 Q44,22 40,22 Q36,22 32,14 Z" fill="${esc(s)}" stroke="#00000022" stroke-width="1"/>
      </svg>
      <div class="bsf-club__kit-label">${esc(label)}</div>
    `;
  }

  /* ── TABLE BUILDER ───────────────────────────────────────── */
  function buildStandings (matches) {
    const t = {};
    const sorted = [...matches].sort((a, b) => (Number(a.week)||0) - (Number(b.week)||0));
    sorted.forEach(m => {
      const h = m.homeKey, a = m.awayKey;
      if (!h || !a) return;
      [h, a].forEach(k => {
        if (!t[k]) t[k] = { key:k, full:"", short:"", logo:"", p:0, w:0, d:0, l:0, gf:0, ga:0, pts:0 };
      });
      if (!t[h].full && m.home_full)  t[h].full  = m.home_full;
      if (!t[h].short && m.home_short) t[h].short = m.home_short;
      if (!t[h].logo && m.home_logo)  t[h].logo  = m.home_logo;
      if (!t[a].full && m.away_full)  t[a].full  = m.away_full;
      if (!t[a].short && m.away_short) t[a].short = m.away_short;
      if (!t[a].logo && m.away_logo)  t[a].logo  = m.away_logo;

      const hg = m.home_goals, ag = m.away_goals;
      if (hg == null || ag == null) return;
      t[h].p++; t[a].p++;
      t[h].gf += hg; t[h].ga += ag;
      t[a].gf += ag; t[a].ga += hg;
      if (hg > ag)      { t[h].w++; t[h].pts += 3; t[a].l++; }
      else if (ag > hg) { t[a].w++; t[a].pts += 3; t[h].l++; }
      else              { t[h].d++; t[a].d++; t[h].pts++; t[a].pts++; }
    });
    return Object.values(t).sort((a,b) =>
      b.pts - a.pts || (b.gf-b.ga) - (a.gf-a.ga) || b.gf - a.gf
    );
  }

  /* ── MAIN ────────────────────────────────────────────────── */
  try {
    const BASOFU = await waitForBasofu();

    /* ── TARGETED API CALLS IN PARALLEL ─────────────────────────
       Each call fetches only what this page needs:
       - clubs:   just this one club's metadata
       - results: only this island's matches (server-filtered)
       - honours: full sheet (small, heavily cached)
       - players: only this island's players (server-filtered)
    ─────────────────────────────────────────────────────────── */
    loading.textContent = "Loading club data…";

    const [metaArr, allRows, champRows, playerRows] = await Promise.all([
      BASOFU.getClubsMeta(ISLAND, SHORT_NAME),
      /* Fetch island + national results in parallel, combine into one array */
      Promise.all([
        BASOFU.getResults(ISLAND),
        Promise.race([
          BASOFU.getResults("National"),
          new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), 8000))
        ]).catch(() => [])
      ]).then(([regional, national]) => [...regional, ...national]),
      BASOFU.getHonorsRaw(),
      BASOFU.getPlayers(ISLAND)
    ]);

    loading.textContent = "Building page…";

    const meta = metaArr[0];
    if (!meta) throw new Error(`Club not found: ${SHORT_NAME} / ${ISLAND}`);

    /* GAS endpoint already resolves logo URLs — use directly */
    const logoUrl   = meta.logo     || "";
    const FULL_NAME = meta.team     || meta["Team"] || "";
    const founded   = meta.founded  || "";
    const stadium   = meta.stadium  || "";
    const capacity  = meta.capacity || "";
    const city      = meta.city     || "";
    const nickname  = meta["Club Nicknames"] || meta.clubNicknames || "";
    const colours   = meta.colours  || "";
    const bio       = meta.bio      || "";
    const manager   = meta.manager  || "";
    const website   = meta.website  || "";
    const twitter   = meta.twitter  || "";
    const instagram = meta.instagram|| "";
    const facebook  = meta.facebook || "";
    const bluesky   = meta.bluesky  || "";
    const rivalsRaw     = meta.rivals        || meta["Rivals"]         || "";
    const clubNicknames = meta.clubNicknames  || meta["Club Nicknames"] || "";
    const kitHomePattern = meta.kitHomePattern || "normal";
    const kitAwayPattern = meta.kitAwayPattern || "normal";
    const kitHome1  = meta.kitHome1 || "#2F3E46";
    const kitHome2  = meta.kitHome2 || "#C2A14A";
    const kitAway1  = meta.kitAway1 || "#EDE6D8";
    const kitAway2  = meta.kitAway2 || "#2F3E46";

    function norm (s) { return (s || "").normalize("NFC").trim().toLowerCase(); }

    /* ── SEASON NORMALISER ───────────────────────────────────────
       Sheets sometimes stores season values as Dates, serialised as
       "Thu Dec 01 2011 00:00:00 GMT-0700". Convert to "YYYY/YY".
    ─────────────────────────────────────────────────────────── */
    function normSeason(val) {
      if (!val) return "";
      const s = String(val).trim();
      if (/^\d{4}\/\d{2}$/.test(s)) return s;
      if (/^\d{4}-\d{2}$/.test(s)) return s.replace("-", "/");
      if (/^\d{4}$/.test(s)) { const y = parseInt(s); return y + "/" + String(y+1).slice(2); }
      try {
        const d = new Date(s);
        if (!isNaN(d.getTime())) { const y = d.getFullYear(); return y + "/" + String(y+1).slice(2); }
      } catch(e) {}
      return s;
    }

    /* Normalise GAS result rows to the field names the rest of the script expects.
       GAS returns camelCase keys; the original code used TSV column-name keys.
       Map them here so nothing else needs to change. */
    const normRow = r => ({
      date:       r.date      || r["Date"]           || "",
      season:     normSeason(r.season || r["Season"] || ""),
      week:       r.week      || r["Week"]            || "",
      region:     r.region    || r["Region"]          || "",
      league:     r.league    || r["League"]          || "",
      division:   r.division  || r["Division"]        || "1",
      group:      r.group     || r["Group"]           || "",
      homeKey:    norm(r.home      || r["Home"]       || ""),
      awayKey:    norm(r.away      || r["Away"]       || ""),
      home_full:  r.homeFull  || r["Home Team Full"]  || "",
      away_full:  r.awayFull  || r["Away Team Full"]  || "",
      home_short: r.homeShort || r["Home Short"]      || "",
      away_short: r.awayShort || r["Away Short"]      || "",
      home_logo:  r.homeLogo  || r["Home Logo"]       || "",
      away_logo:  r.awayLogo  || r["Away Logo"]       || "",
      home_goals: (r.hg !== "" && r.hg != null && r.hg !== undefined) ? Number(r.hg) : null,
      away_goals: (r.ag !== "" && r.ag != null && r.ag !== undefined) ? Number(r.ag) : null,
      gp:         r.gp        || r["Game Progress"]   || "",
      notes:      r.notes     || r["Notes"]           || ""
    });

    const normalisedRows = allRows.map(normRow).filter(r =>
      !isNaN(r.home_goals === null ? NaN : r.home_goals) || r.home_goals === null
    );

    /* Replace allRows with normalised version for all downstream code */
    const normAllRows = normalisedRows;

    /* extractImgSrc still needed for any raw values (GAS handles logos, but keep as safety) */
    function extractImgSrc (raw) {
      if (!raw) return "";
      const s = String(raw).trim();
      const m = s.match(/src\s*=\s*["']\s*([^"'\s]+)\s*["']/i);
      if (m) {
        const url = m[1].trim();
        if (/^https?:\/\//i.test(url)) return url;
        return "https://www.basofu.com/s/" + url.replace(/^\/+/, "");
      }
      if (/^https?:\/\//i.test(s)) return s;
      if (s && !/[<>]/.test(s)) return "https://www.basofu.com/s/" + s.replace(/^\/+/, "");
      return "";
    }


    /* normAllRows already has the right field names from the normRow mapping above.
       Just filter to matches involving this club. */
    const isThisClub = m =>
      norm(m.home_full)  === norm(FULL_NAME)  ||
      norm(m.away_full)  === norm(FULL_NAME)  ||
      norm(m.home_short) === norm(SHORT_NAME) ||
      norm(m.away_short) === norm(SHORT_NAME);

    const clubMatches = normAllRows.filter(isThisClub);

    const isPlayed = m => {
      const g = String(m.gp || "").trim();
      if (g === "Upcoming" || g === "") return false;
      return g === "FT" || (m.home_goals != null && m.away_goals != null);
    };
    const isLiveMatch = m => {
      const g = String(m.gp || "").trim();
      return g !== "" && g !== "FT" && !isNaN(Number(g));
    };
    const isUpcomingMatch = m => {
      const g = String(m.gp || "").trim();
      /* Upcoming: gp is "Upcoming" or blank, and no goals recorded */
      return g === "Upcoming" || (g === "" && m.home_goals == null && m.away_goals == null);
    };

    /* Seasons */
    const seasons = [...new Set(clubMatches.map(m => m.season).filter(Boolean))]
      .sort().reverse();
    const latestSeason = seasons[0] || "";

    /* Sort all club matches by date */
    const datedClubMatches = clubMatches
      .map(m => ({ ...m, _date: BASOFU.parseDate(m.date) }))
      .filter(m => m._date);

    /* Live, upcoming and recent */
    const liveMatches     = datedClubMatches.filter(isLiveMatch)
      .sort((a,b) => a._date - b._date).slice(0, 10);
    const upcomingMatches = datedClubMatches.filter(isUpcomingMatch)
      .sort((a,b) => a._date - b._date).slice(0, 10);
    const recentMatches   = datedClubMatches
      .filter(isPlayed)
      .filter(m => m.home_goals != null && m.away_goals != null)
      .sort((a, b) => b._date - a._date)
      .slice(0, N_RECENT);

    /* Regional league filter — only Campeonato Regional counts for
       standings and position charts. Excludes cups, abertura, national. */
    function isRegionalLeague(leagueName) {
      const s = (leagueName || "").trim().toLowerCase();
      return s === "campeonato regional" ||
             s === "liga regional" ||
             s.startsWith("campeonato regional") ||
             s.startsWith("liga regional");
    }

    /* League table for current season, regional matches only */
    function getLeagueTable (season) {
      /* normAllRows already has the right field names */
      const leagueMatches = normAllRows
        .filter(m => {
          const g = String(m.gp || "").trim();
          return m.season === season &&
                 isRegionalLeague(m.league) &&
                 (g === "FT" || (g !== "" && !isNaN(g) && +g > 0)) &&
                 m.home_goals != null && m.away_goals != null;
        });

      /* Group by division */
      const divs = {};
      leagueMatches.forEach(m => {
        const d = m.division || "1";
        if (!divs[d]) divs[d] = [];
        divs[d].push(m);
      });
      return divs;
    }

    /* ── RENDER ─────────────────────────────────────────────── */

    /* Header */
    const logoHTML = logoUrl
      ? `<img class="bsf-club__logo" src="${esc(logoUrl)}" alt="${esc(FULL_NAME)} badge">`
      : `<div class="bsf-club__logo-placeholder">${esc(SHORT_NAME.slice(0,3).toUpperCase())}</div>`;

    const factsHTML = [
      founded   && `<span class="bsf-club__fact"><strong>Founded</strong> ${esc(founded)}</span>`,
      city      && `<span class="bsf-club__fact"><strong>City</strong> ${esc(city)}</span>`,
      colours   && `<span class="bsf-club__fact"><strong>Colours</strong> ${esc(colours)}</span>`,
      manager   && `<span class="bsf-club__fact"><strong>Manager</strong> ${esc(manager)}</span>`,
    ].filter(Boolean).join('<span class="bsf-club__fact-sep"></span>');

    /* Standings for latest season */
    /* ── STANDINGS: only show the division this club is in ──────
       Find which division the club appears in for the latest season,
       then render only that table. Show 3 rows above + below the club
       when the table is larger than 9 rows.
    ──────────────────────────────────────────────────────────── */
    const thisNorm = norm(FULL_NAME);

    /* ── STANDINGS RENDERER — called on load and on season change ── */
    function renderStandingsForSeason (season) {
      const divTables  = getLeagueTable(season);
      const divKeys    = Object.keys(divTables).sort();

      /* Find which division this club is in for this season */
      let clubDivKey = null;
      for (const dk of divKeys) {
        const t = buildStandings(divTables[dk]);
        if (t.findIndex(r => norm(r.full) === thisNorm || norm(r.short) === norm(SHORT_NAME)) >= 0) {
          clubDivKey = dk; break;
        }
      }

      const renderDivKeys = clubDivKey ? [clubDivKey] : divKeys;

      if (!renderDivKeys.length || !divKeys.length) {
        return `<p style="font-size:11px;color:var(--muted);">No league data for ${esc(season)}.</p>`;
      }

      return renderDivKeys.map(divKey => {
        const table   = buildStandings(divTables[divKey]);
        const thisIdx = table.findIndex(r => norm(r.full) === thisNorm || norm(r.short) === norm(SHORT_NAME));
        let rows = table;
        if (thisIdx >= 0 && table.length > 9) {
          const start = Math.max(0, thisIdx - 3);
          const end   = Math.min(table.length, thisIdx + 4);
          rows = table.slice(start, end);
        }

        const divLabel = divKey === "1" ? "1ª Divisão"
          : divKey === "2" ? "2ª Divisão"
          : `Divisão ${divKey}`;

        const rowsHTML = rows.map(r => {
          const pos    = table.indexOf(r) + 1;
          const isThis = norm(r.full) === thisNorm || norm(r.short) === norm(SHORT_NAME);
          const gd     = r.gf - r.ga;
          return `
            <tr class="${isThis ? "bsf-this-club" : ""}">
              <td class="col-pos">${pos}</td>
              <td class="col-logo">${r.logo ? `<img src="${esc(r.logo)}" alt="">` : ""}</td>
              <td class="col-team">${esc(r.short || r.full)}</td>
              <td>${r.p}</td><td>${r.w}</td><td>${r.d}</td><td>${r.l}</td>
              <td>${gd >= 0 ? "+" : ""}${gd}</td>
              <td class="col-pts">${r.pts}</td>
            </tr>`;
        }).join("");

        return `
          <div style="margin-bottom:20px;">
            <div style="background:var(--body);padding:6px 10px;font-size:9px;font-weight:700;letter-spacing:0.18em;text-transform:uppercase;color:#fff;">
              ${esc(divLabel)} · ${esc(season)}
            </div>
            <div class="bsf-club__table-wrap">
              <table class="bsf-club__table">
                <thead><tr>
                  <th>#</th><th></th><th style="text-align:left">Club</th>
                  <th>P</th><th>W</th><th>D</th><th>L</th><th>GD</th><th>Pts</th>
                </tr></thead>
                <tbody>${rowsHTML}</tbody>
              </table>
            </div>
          </div>`;
      }).join("");
    }

    /* Build the season options for the dropdown — only seasons where
       this club has league matches */
    const leagueSeasons = [...new Set(
      normAllRows
        .filter(m => {
          const g = String(m.gp || "").trim();
          return isRegionalLeague(m.league) &&
                 (g === "FT" || (g !== "" && !isNaN(g) && +g > 0)) &&
                 (norm(m.home_full) === thisNorm || norm(m.away_full) === thisNorm);
        })
        .map(m => m.season)
        .filter(Boolean)
    )].sort().reverse();

    const standingsSeasonOptions = leagueSeasons
      .map(s => `<option value="${esc(s)}"${s === latestSeason ? " selected" : ""}>${esc(s)}</option>`)
      .join("");

    /* ── POSITION-OVER-TIME CHART DATA ───────────────────────────
       normAllRows is already filtered to this island by the GAS endpoint.
    ──────────────────────────────────────────────────────────── */
    const allLeagueRows = normAllRows.filter(m => {
      const g = String(m.gp || "").trim();
      return isRegionalLeague(m.league) &&
             (g === "FT" || (g !== "" && !isNaN(g) && +g > 0)) &&
             m.home_goals != null && m.away_goals != null;
    });

    /* All seasons present in the data, sorted chronologically */
    const allSeasons = [...new Set(allLeagueRows.map(m => m.season))]
      .filter(Boolean)
      .sort((a, b) => parseInt(a) - parseInt(b));

    /* For each season: record per-division tables AND this club's position.
       divSizeBySeasonDiv[season][div] = number of teams in that division.
       This lets us draw ALL division bands even if the club never played in Div 2. */
    const chartPoints      = []; /* { season, position, divPos, division, divSize, allDivSizes } */
    let   maxOverallPos    = 0;

    allSeasons.forEach(season => {
      const seasonRows = allLeagueRows.filter(m => m.season === season);
      const divs = {};
      seasonRows.forEach(m => {
        const d = m.division || "1";
        if (!divs[d]) divs[d] = [];
        divs[d].push(m);
      });

      const sortedDivKeys = Object.keys(divs).sort();
      const allDivSizes   = {};
      let offset = 0;
      let found  = false;
      let clubDiv = null, clubPos = null, clubDivPos = null;

      sortedDivKeys.forEach(d => {
        const table = buildStandings(divs[d]);
        allDivSizes[d] = table.length;
        const idx = table.findIndex(r =>
          norm(r.full) === thisNorm || norm(r.short) === norm(SHORT_NAME)
        );
        if (idx >= 0 && !found) {
          clubDivPos = idx + 1;           /* position within this division */
          clubPos    = offset + idx + 1;  /* overall position for y-axis */
          clubDiv    = d;
          found      = true;
        }
        offset += table.length;
      });

      maxOverallPos = Math.max(maxOverallPos, offset);
      chartPoints.push({
        season,
        position:    clubPos,
        divPos:      clubDivPos,    /* position within own division */
        division:    clubDiv,
        divSize:     clubDiv ? allDivSizes[clubDiv] : 0,
        allDivSizes  /* per-season sizes for accurate band rendering */
      });

      /* Weekly positions for drill-down */
    });

    /* ── MATCH CARDS (Live / Upcoming / Recent) ───────────────── */
/* ============================================================
   DIXON-COLES MODEL v2 — Iterative Proportional Fitting
   Much more reliable than gradient ascent for small datasets.
   Uses closed-form updates for attack/defence parameters,
   then scans rho analytically.
============================================================ */
function dixonColes(allMatches, homeTeam, awayTeam, options) {
  options = options || {};
  const XI    = options.xi    || 0.0065; /* time decay ~107 day half-life */
  const ITERS = options.iters || 50;     /* IPF iterations */

  /* ── 1. Build weighted match list ── */
  const now     = Date.now();
  const matches = [];
  allMatches.forEach(function(m) {
    const hg = m.home_goals !== undefined ? m.home_goals : m.hg;
    const ag = m.away_goals !== undefined ? m.away_goals : m.ag;
    if (hg === null || hg === undefined || hg === "" ||
        ag === null || ag === undefined || ag === "") return;
    const hgN = Number(hg), agN = Number(ag);
    if (isNaN(hgN) || isNaN(agN)) return;
    const d   = new Date(m.date);
    const age = isNaN(d.getTime()) ? 365 : (now - d.getTime()) / 86400000;
    const w   = Math.exp(-XI * Math.max(0, age));
    if (w < 0.01) return;
    matches.push({
      home: (m.homeShort || m.home_short || m.home || "").trim(),
      away: (m.awayShort || m.away_short || m.away || "").trim(),
      hg: hgN, ag: agN, w
    });
  });

  if (matches.length < 10) return null;

  /* ── 2. Collect teams ── */
  const teamSet = new Set();
  matches.forEach(function(m) { teamSet.add(m.home); teamSet.add(m.away); });
  if (!teamSet.has(homeTeam) || !teamSet.has(awayTeam)) return null;
  const teams = Array.from(teamSet);
  const tIdx  = {};
  teams.forEach(function(t, i) { tIdx[t] = i; });
  const n = teams.length;

  /* ── 3. Initialise attack=1, defence=1, homeAdv=1.3, rho=-0.1 ── */
  const attack  = new Float64Array(n).fill(1.0);
  const defence = new Float64Array(n).fill(1.0);
  let   homeAdv = 1.3;
  let   rho     = -0.05;

  /* Weighted totals for each team */
  const wHomeGoals   = new Float64Array(n);
  const wAwayGoals   = new Float64Array(n);
  const wHomeConcede = new Float64Array(n);
  const wAwayConcede = new Float64Array(n);
  const wHomeGames   = new Float64Array(n);
  const wAwayGames   = new Float64Array(n);
  let   totalW = 0;

  matches.forEach(function(m) {
    const hi = tIdx[m.home], ai = tIdx[m.away];
    wHomeGoals[hi]   += m.w * m.hg;
    wAwayGoals[ai]   += m.w * m.ag;
    wHomeConcede[ai] += m.w * m.hg;
    wAwayConcede[hi] += m.w * m.ag;
    wHomeGames[hi]   += m.w;
    wAwayGames[ai]   += m.w;
    totalW += m.w;
  });

  /* ── 4. IPF: alternate updating attack and defence ── */
  for (let iter = 0; iter < ITERS; iter++) {
    /* Update home advantage */
    let numH = 0, denH = 0;
    matches.forEach(function(m) {
      const hi = tIdx[m.home], ai = tIdx[m.away];
      numH += m.w * m.hg;
      denH += m.w * attack[hi] * defence[ai];
    });
    homeAdv = numH / Math.max(denH, 1e-10);

    /* Update attack parameters */
    for (let i = 0; i < n; i++) {
      let expGoals = 0;
      matches.forEach(function(m) {
        const ai = tIdx[m.away];
        if (tIdx[m.home] === i) expGoals += m.w * homeAdv * defence[ai];
        if (tIdx[m.away] === i) expGoals += m.w * attack[tIdx[m.home]];
        /* Note: second term uses opponent's attack, contributing to away scoring */
      });
      /* Simpler: attack[i] = weighted avg goals scored / expected */
      const scored = wHomeGoals[i] + wAwayGoals[i];
      let expected = 0;
      matches.forEach(function(m) {
        if (tIdx[m.home] === i) expected += m.w * homeAdv * defence[tIdx[m.away]];
        else if (tIdx[m.away] === i) expected += m.w * defence[tIdx[m.home]];
      });
      /* Wait, this is wrong. Let's do proper IPF: */
      /* attack[i] = total weighted goals scored by i / sum(expected goals by i) */
      /* where expected = attack[i] * defence[opponent] * (homeAdv if home) */
      /* Cancelling attack[i]: new_attack[i] = scored / (sum defence[opp] * w * hadv) */
      let denom = 0;
      matches.forEach(function(m) {
        const hi = tIdx[m.home], ai = tIdx[m.away];
        if (hi === i) denom += m.w * homeAdv * defence[ai];
        if (ai === i) denom += m.w * defence[hi];
      });
      if (denom > 1e-10) attack[i] = scored / denom;
    }

    /* Update defence parameters */
    for (let i = 0; i < n; i++) {
      const conceded = wHomeConcede[i] + wAwayConcede[i];
      let denom = 0;
      matches.forEach(function(m) {
        const hi = tIdx[m.home], ai = tIdx[m.away];
        if (ai === i) denom += m.w * homeAdv * attack[hi];
        if (hi === i) denom += m.w * attack[ai];
      });
      if (denom > 1e-10) defence[i] = conceded / denom;
    }

    /* Normalise: set mean attack = 1 */
    let meanAtk = 0;
    for (let i = 0; i < n; i++) meanAtk += attack[i];
    meanAtk /= n;
    for (let i = 0; i < n; i++) { attack[i] /= meanAtk; defence[i] *= meanAtk; }
  }

  /* ── 5. Estimate rho via grid search ── */
  function tauCorr(hg, ag, lH, mA, r) {
    if      (hg===0 && ag===0) return Math.max(0.01, 1 - lH*mA*r);
    else if (hg===1 && ag===0) return Math.max(0.01, 1 + mA*r);
    else if (hg===0 && ag===1) return Math.max(0.01, 1 + lH*r);
    else if (hg===1 && ag===1) return Math.max(0.01, 1 - r);
    return 1;
  }
  function poisson(k, lambda) {
    if (lambda <= 0) return k === 0 ? 1 : 0;
    let lp = -lambda + k * Math.log(lambda);
    for (let i = 2; i <= k; i++) lp -= Math.log(i);
    return Math.exp(lp);
  }
  function logLikRho(r) {
    let ll = 0;
    matches.forEach(function(m) {
      const hi = tIdx[m.home], ai = tIdx[m.away];
      const lH = attack[hi] * defence[ai] * homeAdv;
      const mA = attack[ai] * defence[hi];
      ll += m.w * (
        Math.log(tauCorr(m.hg, m.ag, lH, mA, r)) +
        Math.log(Math.max(poisson(m.hg, lH), 1e-10)) +
        Math.log(Math.max(poisson(m.ag, mA), 1e-10))
      );
    });
    return ll;
  }
  let bestRho = 0, bestLL = -Infinity;
  for (let r = -0.15; r <= 0.15; r += 0.01) {
    const ll = logLikRho(r);
    if (ll > bestLL) { bestLL = ll; bestRho = r; }
  }
  rho = bestRho;

  /* ── 6. Predict ── */
  const MAX_G = 7;
  const hi = tIdx[homeTeam], ai = tIdx[awayTeam];
  const lH = attack[hi] * defence[ai] * homeAdv;
  const mA = attack[ai] * defence[hi];

  let pHome = 0, pDraw = 0, pAway = 0;
  let bestP = 0, bestH = 0, bestA = 0;

  for (let h = 0; h <= MAX_G; h++) {
    for (let a = 0; a <= MAX_G; a++) {
      const p = Math.max(0, tauCorr(h, a, lH, mA, rho) * poisson(h, lH) * poisson(a, mA));
      if (h > a)      pHome += p;
      else if (h < a) pAway += p;
      else             pDraw += p;
      if (p > bestP)  { bestP = p; bestH = h; bestA = a; }
    }
  }

  const total = pHome + pDraw + pAway || 1;
  return {
    homeWin:      Math.round(100 * pHome / total),
    draw:         Math.round(100 * pDraw / total),
    awayWin:      Math.round(100 * pAway / total),
    expectedHome: lH.toFixed(2),
    expectedAway: mA.toFixed(2),
    likelyScore:  bestH + "\u2013" + bestA,
    dataPoints:   matches.length,
    homeTeam:     homeTeam,
    awayTeam:     awayTeam
  };
}



        function makeClubCard(m, type, allForH2H) {
      const isHome   = norm(m.home_full) === norm(FULL_NAME) || norm(m.home_short) === norm(SHORT_NAME);
      const hg       = type !== "upcoming" && m.home_goals != null ? m.home_goals : null;
      const ag       = type !== "upcoming" && m.away_goals != null ? m.away_goals : null;
      const g        = String(m.gp || "").trim();
      const min      = type === "live" && !isNaN(Number(g)) ? g + "\u2032" : "";
      const hLogo    = m.home_logo || "";
      const aLogo    = m.away_logo || "";
      const hShort   = m.home_short || m.home_full || "";
      const aShort   = m.away_short || m.away_full || "";
      const hPage    = norm(hShort) === norm(SHORT_NAME) ? "" : "";
      const aPage    = norm(aShort) === norm(SHORT_NAME) ? "" : "";
      const hWon     = hg !== null && ag !== null && hg > ag;
      const aWon     = hg !== null && ag !== null && ag > hg;
      const liveDot  = type === "live"
        ? "<span style=\"display:inline-block;width:6px;height:6px;border-radius:50%;background:#C2A14A;margin-right:4px;animation:bsf-pulse 1.4s infinite;vertical-align:middle;\"></span>"
        : "";
      const hLogoHTML = hLogo ? "<img src=\"" + esc(hLogo) + "\" class=\"ko-logo\" alt=\"\">": "";
      const aLogoHTML = aLogo ? "<img src=\"" + esc(aLogo) + "\" class=\"ko-logo\" alt=\"\">": "";

      const el = document.createElement("div");
      el.className = "ko-match ko-animate";
      el.style.cssText = "flex:0 0 auto;box-sizing:border-box;width:min(260px,86vw);max-width:260px;scroll-snap-align:start;";
      el.innerHTML =
        "<div class=\"ko-date\">" + liveDot + esc(fmtDate(m.date)) + " &middot; " + esc(m.league) + (min ? " &middot; <strong>" + min + "</strong>" : "") + "</div>" +
        "<div class=\"ko-team " + (hWon ? "ko-winner" : aWon ? "ko-loser" : "") + "\">" +
          "<div class=\"ko-team-left\">" + hLogoHTML + "<span class=\"ko-team-name\">" + esc(hShort) + "</span></div>" +
          "<span class=\"ko-score\">" + (hg !== null ? hg : "") + "</span>" +
        "</div>" +
        "<div class=\"ko-team " + (aWon ? "ko-winner" : hWon ? "ko-loser" : "") + "\">" +
          "<div class=\"ko-team-left\">" + aLogoHTML + "<span class=\"ko-team-name\">" + esc(aShort) + "</span></div>" +
          "<span class=\"ko-score\">" + (ag !== null ? ag : "") + "</span>" +
        "</div>";

      /* H2H tooltip for upcoming */
      if (type === "upcoming" && allForH2H) {
        const oppKey = isHome ? norm(aShort) : norm(hShort);
        const h2h = allForH2H.filter(r =>
          r.home_goals != null && r.away_goals != null &&
          ((norm(r.home_short) === norm(SHORT_NAME) && norm(r.away_short) === oppKey) ||
           (norm(r.away_short) === norm(SHORT_NAME) && norm(r.home_short) === oppKey))
        ).map(r => ({
          ...r, _d: BASOFU.parseDate(r.date)
        })).filter(r => r._d).sort((a,b) => b._d - a._d).slice(0,6).reverse()
         .map(r => {
           const myGoals  = norm(r.home_short) === norm(SHORT_NAME) ? r.home_goals : r.away_goals;
           const oppGoals = norm(r.home_short) === norm(SHORT_NAME) ? r.away_goals : r.home_goals;
           return { diff: myGoals - oppGoals };
         });

        if (h2h.length) {
          let tip = null;
          el.addEventListener("mouseenter", function(e) {
            if (!tip) {
              tip = document.createElement("div");
              Object.assign(tip.style, {
                position:"fixed",zIndex:"9999",pointerEvents:"none",
                background:"rgba(255,255,255,0.98)",border:"1px solid #ccc",
                borderRadius:"8px",padding:"10px 12px",
                boxShadow:"0 2px 10px rgba(0,0,0,0.12)",
                fontFamily:"Inter,system-ui,sans-serif",fontSize:"12px",maxWidth:"220px",
                boxSizing:"border-box"
              });
              var w=180,h=80,pad=8,baseY=40;
              var maxA = Math.max(1,Math.max.apply(null,h2h.map(function(p){return Math.abs(p.diff);})));
              var bw = Math.max(8,Math.floor((w-pad*2)/h2h.length)-4);
              var bars = h2h.map(function(p,i){
                if(!p.diff) return "";
                var x=pad+i*(bw+4), bh=Math.round(Math.abs(p.diff)/maxA*(baseY-pad));
                var y=p.diff>0?baseY-bh:baseY;
                return "<rect x=\""+x+"\" y=\""+y+"\" width=\""+bw+"\" height=\""+bh+"\" rx=\"2\" fill=\"#003893\"/>";
              }).join("");
              tip.innerHTML = "<div style=\"font-weight:600;margin-bottom:4px;\">Head-to-Head</div>" +
                "<div style=\"color:#888;font-size:10px;margin-bottom:8px;\">Goal diff for " + esc(SHORT_NAME) + "</div>" +
                "<svg width=\""+w+"\" height=\""+h+"\" viewBox=\"0 0 "+w+" "+h+"\">" +
                "<line x1=\""+pad+"\" y1=\""+baseY+"\" x2=\""+(w-pad)+"\" y2=\""+baseY+"\" stroke=\"#ccc\"/>" +
                bars + "</svg>";
              document.body.appendChild(tip);
            }
            tip.style.display = "block";
            placeTooltip(tip, el, e);
          });
          el.addEventListener("mousemove", function(e) {
            if(tip) placeTooltip(tip, el, e);
          });
          el.addEventListener("mouseleave", function() { if(tip) tip.style.display="none"; });
        }
      }

      /* Dixon-Coles prediction — runs async so card renders immediately */
      if (type === "upcoming") {
        setTimeout(function() {
          const oppShort = isHome ? aShort : hShort;
          const dc = dixonColes(allForH2H || [], SHORT_NAME, oppShort, {});
          if (!dc) return;
          /* Append prediction to existing tooltip or create new one */
          var existing = el.querySelector(".bsf-dc-tip");
          if (!existing) {
            existing = document.createElement("div");
            existing.className = "bsf-dc-tip";
          }
          existing.innerHTML =
            "<div style=\"border-top:1px solid #e8e8e6;margin-top:8px;padding-top:8px;\">" +
            "<div style=\"font-weight:600;font-size:11px;margin-bottom:6px;\">Prediction</div>" +
            "<div style=\"display:flex;gap:4px;margin-bottom:6px;\">" +
              "<div style=\"flex:1;text-align:center;padding:4px;background:#2F3E46;color:#fff;border-radius:3px;\">" +
                "<div style=\"font-size:14px;font-weight:700;\">" + dc.homeWin + "%</div>" +
                "<div style=\"font-size:9px;opacity:0.7;\">" + esc(hShort) + "</div>" +
              "</div>" +
              "<div style=\"flex:1;text-align:center;padding:4px;background:#888;color:#fff;border-radius:3px;\">" +
                "<div style=\"font-size:14px;font-weight:700;\">" + dc.draw + "%</div>" +
                "<div style=\"font-size:9px;opacity:0.7;\">Draw</div>" +
              "</div>" +
              "<div style=\"flex:1;text-align:center;padding:4px;background:#A44A3F;color:#fff;border-radius:3px;\">" +
                "<div style=\"font-size:14px;font-weight:700;\">" + dc.awayWin + "%</div>" +
                "<div style=\"font-size:9px;opacity:0.7;\">" + esc(aShort) + "</div>" +
              "</div>" +
            "</div>" +
            "<div style=\"font-size:10px;color:#888;\">Most likely: <strong>" + dc.likelyScore + "</strong> · " +
              "xG " + dc.expectedHome + "–" + dc.expectedAway + " · " +
              dc.dataPoints + " matches</div>" +
            "</div>";
          el.appendChild(existing);
        }, 0);
      }

      return el;
    }

    function makeClubCarousel(id, matches, type, allForH2H) {
      var wrap = document.createElement("div");
      wrap.style.cssText = "display:flex;align-items:center;gap:0.5rem;margin-bottom:0.5rem;";
      var btnL = document.createElement("button");
      btnL.className = "bsf-region__carousel-btn";
      btnL.textContent = "\u25C4";
      var track = document.createElement("div");
      track.id = id;
      track.style.cssText = "display:flex;gap:1rem;overflow-x:auto;scroll-snap-type:x mandatory;scroll-behavior:smooth;padding-bottom:0.5rem;flex:1;min-width:0;";
      var btnR = document.createElement("button");
      btnR.className = "bsf-region__carousel-btn";
      btnR.textContent = "\u25BA";
      btnL.onclick = function(){ track.scrollBy({left:-280,behavior:"smooth"}); };
      btnR.onclick = function(){ track.scrollBy({left:280,behavior:"smooth"}); };
      matches.forEach(function(m){ track.appendChild(makeClubCard(m, type, allForH2H)); });
      wrap.appendChild(btnL); wrap.appendChild(track); wrap.appendChild(btnR);
      return wrap;
    }

    /* Build tabbed results section */
    var resultsTabs = [
      liveMatches.length     ? {key:"live",     label:liveMatches.length+" LIVE",  matches:liveMatches,     type:"live",     h2h:null} : null,
      upcomingMatches.length ? {key:"upcoming", label:"UPCOMING",                  matches:upcomingMatches, type:"upcoming", h2h:normAllRows} : null,
      recentMatches.length   ? {key:"recent",   label:"RESULTS",                   matches:recentMatches,   type:"recent",   h2h:null} : null,
    ].filter(Boolean);

    var resultsHTML = "";
    var tabsEl  = document.createElement("div");
    var panelsEl = document.createElement("div");
    tabsEl.className = "bsf-results-tabs";
    if (resultsTabs.length) {
      var defaultTab = resultsTabs[0].key;
      resultsTabs.forEach(function(tab) {
        var btn = document.createElement("button");
        btn.className = "bsf-results-tab" + (tab.key === defaultTab ? " active" : "");
        btn.dataset.tab = tab.key;
        btn.textContent = tab.label;
        btn.onclick = function() {
          tabsEl.querySelectorAll(".bsf-results-tab").forEach(function(b){ b.classList.remove("active"); });
          btn.classList.add("active");
          panelsEl.querySelectorAll(".bsf-results-panel").forEach(function(p){
            p.style.display = p.dataset.panel === tab.key ? "" : "none";
          });
        };
        tabsEl.appendChild(btn);

        var panel = document.createElement("div");
        panel.className = "bsf-results-panel";
        panel.dataset.panel = tab.key;
        panel.style.display = tab.key === defaultTab ? "" : "none";
        panel.appendChild(makeClubCarousel("bsf-club-carousel-"+tab.key, tab.matches, tab.type, tab.h2h));
        panelsEl.appendChild(panel);
      });
    }
    /* ── HONOURS — scraped from Champions sheet ─────────────────
       Sheet columns: Year | Winner | Runner Up | Competition | Location | Notes
       We match FULL_NAME against Winner (case-insensitive, trimmed).
       Skips rows where Winner is "not known", "not held", or blank.
       Groups wins by Competition, sorts competitions by type then alpha.
    ─────────────────────────────────────────────────────────── */

    /* Normalise a winner name for fuzzy matching:
       strip common suffixes/prefixes that vary across seasons */
    function normClub (s) {
      return (s || "").trim().toLowerCase()
        .replace(/^(gd|cd|sc|cf|ad|sp|ge|asc|adf|gdsc|as)\s+/i, "")
        .replace(/\s+(fc|sc|cf|ad|gd|cd)$/i, "");
    }

    const SKIP = new Set(["not known", "not held", "unknown", "tbd", "n/a", ""]);
    const myNorm    = normClub(FULL_NAME);
    const myNormSh  = normClub(SHORT_NAME);

    /* Collect wins: { competition → [year, year, …] } */
    const winsByComp = {};

    champRows.forEach(r => {
      /* GAS returns camelCase; fall back to column-name keys */
      const winner = (r.winner || r["Winner"] || "").trim();
      if (SKIP.has(winner.toLowerCase())) return;

      const winnerNorm = normClub(winner);
      const isMatch =
        winnerNorm === myNorm ||
        winnerNorm === myNormSh ||
        winner.toLowerCase() === FULL_NAME.toLowerCase() ||
        winner.toLowerCase() === SHORT_NAME.toLowerCase() ||
        (myNorm.length > 5 && winnerNorm.includes(myNorm)) ||
        (myNorm.length > 5 && myNorm.includes(winnerNorm));

      if (!isMatch) return;

      const year = normSeason((r.year || r["Year"] || "").trim()) || (r.year || r["Year"] || "").trim();
      const comp = (r.competition || r["Competition"] || "").trim();
      if (!comp || !year) return;

      if (!winsByComp[comp]) winsByComp[comp] = [];
      winsByComp[comp].push(year);
    });

    /* Sort competitions: national first, then supercup, then cup, then league */
    const compOrder = { national: 0, supercup: 1, cup: 2, abertura: 3, league: 4 };
    const sortedComps = Object.keys(winsByComp).sort((a, b) => {
      const ta = compOrder[BASOFU.competitionType(a)] ?? 5;
      const tb = compOrder[BASOFU.competitionType(b)] ?? 5;
      return ta - tb || a.localeCompare(b);
    });

    /* Map competition type → colour bar class */
    function honourBarClass (compName) {
      const t = BASOFU.competitionType(compName);
      if (t === "national")  return "bsf-club__honour-bar--national";
      if (t === "supercup")  return "bsf-club__honour-bar--national";
      if (t === "cup")       return "bsf-club__honour-bar--cup";
      return "bsf-club__honour-bar--regional";
    }

    const honoursHTML = sortedComps.length
      ? `<div class="bsf-club__honours">
          ${sortedComps.map(comp => {
            const years = winsByComp[comp].sort();
            return `
              <div class="bsf-club__honour">
                <div class="bsf-club__honour-bar ${honourBarClass(comp)}"></div>
                <div style="flex:1">
                  <div class="bsf-club__honour-title">${esc(comp)}</div>
                  <div class="bsf-club__honour-years">${years.join(", ")}</div>
                </div>
                <div class="bsf-club__honour-count">${years.length}×</div>
              </div>`;
          }).join("")}
         </div>`
      : `<p style="font-size:11px;color:var(--muted);">No titles found in the Champions sheet for this club.</p>`;

    /* ── ROSTER — Players sheet ──────────────────────────────────
       Columns: Region | Club | Number | Name | Shortname | Position | Photo
    ─────────────────────────────────────────────────────────── */

    function extractPhotoUrl (raw) {
      if (!raw) return "";
      const m = String(raw).match(/src\s*=\s*["']([^"']+)["']/i);
      if (m) return m[1].trim();
      const s = String(raw).trim();
      return /^https?:\/\//i.test(s) ? s : "";
    }

    const POS_LABEL = {
      GK:"Goalkeeper", CB:"Centre-back", LB:"Left-back", RB:"Right-back",
      CM:"Midfielder", DM:"Defensive Mid", AM:"Attacking Mid",
      LM:"Left Mid", RM:"Right Mid", LW:"Left Wing", RW:"Right Wing",
      ST:"Striker", CF:"Centre-forward", FW:"Forward", MF:"Midfielder", DF:"Defender"
    };

    /* Which roster section a position code belongs to. Anything not
       matched falls into "Midfielders" as a safe middle ground. */
    const POS_SECTION = {
      GK:"Keepers",
      CB:"Defenders", LB:"Defenders", RB:"Defenders", DF:"Defenders",
      CM:"Midfielders", DM:"Midfielders", AM:"Midfielders", MF:"Midfielders",
      LM:"Midfielders", RM:"Midfielders",
      LW:"Forwards", RW:"Forwards", ST:"Forwards", CF:"Forwards", FW:"Forwards"
    };
    const SECTION_ORDER = ["Coach", "Keepers", "Defenders", "Midfielders", "Forwards"];

    /* Minimal country → ISO flag-emoji lookup for the "Nationality"
       column. Add more entries here as needed — unmatched names just
       show no flag, nothing breaks. */
    const COUNTRY_ISO = {
      "cape verde":"CV", "cabo verde":"CV", "portugal":"PT", "brazil":"BR", "brasil":"BR",
      "angola":"AO", "guinea-bissau":"GW", "guiné-bissau":"GW", "senegal":"SN",
      "france":"FR", "netherlands":"NL", "holland":"NL", "spain":"ES", "morocco":"MA",
      "mozambique":"MZ", "usa":"US", "united states":"US", "italy":"IT", "belgium":"BE",
      "germany":"DE", "england":"GB", "united kingdom":"GB", "sao tome":"ST",
      "são tomé e príncipe":"ST", "gambia":"GM", "mali":"ML", "ivory coast":"CI",
      "côte d'ivoire":"CI", "nigeria":"NG", "luxembourg":"LU", "switzerland":"CH"
    };
    function flagEmoji(nat) {
      const iso = COUNTRY_ISO[(nat || "").trim().toLowerCase()];
      if (!iso) return "";
      return iso.toUpperCase().replace(/./g, c =>
        String.fromCodePoint(127397 + c.charCodeAt(0)));
    }

    const roster = playerRows
      .filter(r => {
        /* GAS returns camelCase; fall back to column-name keys for safety */
        const rRegion = (r.region || r["Region"] || "").trim().toLowerCase();
        const rClub   = (r.club   || r["Club"]   || "").trim().toLowerCase();
        return rRegion === ISLAND.toLowerCase() &&
               (rClub === FULL_NAME.toLowerCase() ||
                normClub(rClub) === normClub(FULL_NAME));
      })
      .map(r => ({
        number:      (r.number      || r["Number"]      || "").trim(),
        name:        (r.name        || r["Name"]        || "").trim(),
        short:       (r.short       || r["Shortname"]   || "").replace(/^\[|\]$/g, "").trim(),
        pos:         (r.position    || r["Position"]    || "").trim(),
        photo:       r.photo        || extractPhotoUrl(r["Photo"] || ""),
        nationality: (r.nationality || r["Nationality"] || "").trim(),
        age:         (r.age         || r["Age"]         || "").trim()
      }))
      .filter(p => p.name)
      .sort((a, b) => {
        const na = parseInt(a.number, 10), nb = parseInt(b.number, 10);
        if (!isNaN(na) && !isNaN(nb)) return na - nb;
        if (!isNaN(na)) return -1;
        if (!isNaN(nb)) return 1;
        return a.name.localeCompare(b.name);
      });

    /* Kits */
    const kitsHTML = `
      <div class="bsf-club__kits">
        <div class="bsf-club__kit">
          ${kitSVG(kitHome1, kitHome2, "Home", kitHomePattern)}
        </div>
        <div class="bsf-club__kit">
          ${kitSVG(kitAway1, kitAway2, "Away", kitAwayPattern)}
        </div>
      </div>;

    /* Venue */
    const venueHTML = stadium
      ? `<div class="bsf-club__venue">
          <div class="bsf-club__venue-icon">🏟</div>
          <div>
            <div class="bsf-club__venue-name">${esc(stadium)}</div>
            <div class="bsf-club__venue-detail">
              ${city ? `${esc(city)}, ` : ""}${esc(ISLAND)}
              ${capacity ? ` · Capacity: ${esc(capacity)}` : ""}
            </div>
          </div>
        </div>`
      : `<p style="font-size:11px;color:var(--muted);">Add a "Stadium" column to the clubs sheet to show venue info here.</p>`;

    /* ── Roster — grouped list (Coach / Keepers / Defenders / Midfielders / Forwards),
       mirrors the standard "squad list" layout used by most football apps. ── */
    function playerRowHTML(p) {
      const displayName = p.short || p.name;
      const posLabel     = POS_LABEL[p.pos.toUpperCase()] || p.pos || "";
      const flag         = flagEmoji(p.nationality);
      const photoHTML = p.photo
        ? `<img class="bsf-club__roster-photo" src="${esc(p.photo)}" alt="${esc(displayName)}" loading="lazy">`
        : `<div class="bsf-club__roster-photo bsf-club__roster-photo--empty"></div>`;
      return `
        <div class="bsf-club__roster-row">
          ${photoHTML}
          <div class="bsf-club__roster-main">
            <div class="bsf-club__roster-name">
              ${p.number ? `<span class="bsf-club__roster-num">${esc(p.number)}</span>` : ""}
              ${esc(displayName)}
            </div>
            ${(flag || p.nationality) ? `
              <div class="bsf-club__roster-nat">
                ${flag ? `<span class="bsf-club__roster-flag">${flag}</span>` : ""}
                ${esc(p.nationality)}
              </div>` : (posLabel ? `<div class="bsf-club__roster-nat">${esc(posLabel)}</div>` : "")}
          </div>
          ${p.age ? `<div class="bsf-club__roster-age">${esc(p.age)}</div>` : ""}
        </div>`;
    }

    function rosterGroupHTML(title, rows) {
      if (!rows.length) return "";
      return `
        <div class="bsf-club__roster-group">
          <div class="bsf-club__roster-group-head">
            <span>${esc(title)}</span><span>${title === "Coach" ? "" : "Age"}</span>
          </div>
          ${rows.map(playerRowHTML).join("")}
        </div>`;
    }

    const bySection = { "Keepers":[], "Defenders":[], "Midfielders":[], "Forwards":[] };
    roster.forEach(p => {
      const section = POS_SECTION[p.pos.toUpperCase()] || "Midfielders";
      bySection[section].push(p);
    });

    /* Coach comes from the club's "Manager" column (clubs sheet), not the
       Players sheet — shown as its own single-row section for consistency. */
    const coachRows = manager ? [{ name: manager, short:"", number:"", pos:"", photo:"", nationality:"", age:"" }] : [];

    const rosterHTML = roster.length || coachRows.length
      ? [
          rosterGroupHTML("Coach", coachRows),
          rosterGroupHTML("Keepers", bySection["Keepers"]),
          rosterGroupHTML("Defenders", bySection["Defenders"]),
          rosterGroupHTML("Midfielders", bySection["Midfielders"]),
          rosterGroupHTML("Forwards", bySection["Forwards"])
        ].filter(Boolean).join("")
      : `<p style="font-size:11px;color:var(--muted);">No players found in the Players sheet for this club. Check that the Region and Club columns match exactly.</p>`;

    /* Bio */
    /* ── RIVALS — parse [[Rival, Derby Name], ...] format ──────── */
    let rivalsHTML = "";
    if (rivalsRaw) {
      try {
        /* Handle both [[R,D]] and [[R,D],[R2,D2]] formats */
        const cleaned = rivalsRaw.trim();
        /* Extract all [Rival, Derby] pairs using regex */
        const pairs = [];
        const pairRe = /\[([^\[\]]+),\s*([^\[\]]+)\]/g;
        let m;
        while ((m = pairRe.exec(cleaned)) !== null) {
          pairs.push({ rival: m[1].trim(), derby: m[2].trim() });
        }
        if (pairs.length) {
          rivalsHTML = `
            <div class="bsf-club__rivals">
              ${pairs.map(p => `
                <div class="bsf-club__rival">
                  <div class="bsf-club__rival-name">${esc(p.rival)}</div>
                  <div class="bsf-club__rival-derby">${esc(p.derby)}</div>
                </div>`).join("")}
            </div>`;
        }
      } catch(e) {
        console.warn("[Basofu] Could not parse rivals:", rivalsRaw, e);
      }
    }

    const bioHTML = bio
      ? `<div class="bsf-club__bio">${bio.split("\n").filter(Boolean).map(p => `<p>${esc(p)}</p>`).join("")}</div>`
      : `<p style="font-size:11px;color:var(--muted);">Add a "Bio" column to the clubs sheet for club history here.</p>`;

    /* Social links */
    const socialLinks = [
      website   && { href: website,                                label: "Website",   icon: "🌐" },
      twitter   && { href: twitter.startsWith("http") ? twitter : `https://x.com/${twitter.replace(/^@/,"")}`,   label: "X / Twitter", icon: "𝕏" },
      instagram && { href: instagram.startsWith("http") ? instagram : `https://instagram.com/${instagram.replace(/^@/,"")}`, label: "Instagram",   icon: "📷" },
      facebook  && { href: facebook.startsWith("http") ? facebook : `https://facebook.com/${facebook}`,          label: "Facebook",    icon: "f" },
      bluesky   && { href: bluesky.startsWith("http")  ? bluesky  : `https://bsky.app/profile/${bluesky.replace(/^@/,"")}`, label: "Bluesky",    icon: "🦋" },
    ].filter(Boolean);

    const socialHTML = socialLinks.length
      ? `<div class="bsf-club__social">
          ${socialLinks.map(s => `
            <a href="${esc(s.href)}" target="_blank" rel="noopener" class="bsf-club__social-link">
              <span class="bsf-club__social-icon">${s.icon}</span>
              <span>${esc(s.label)}</span>
            </a>`).join("")}
         </div>`
      : "";

    /* ── ASSEMBLE PAGE ──────────────────────────────────────── */
    root.innerHTML = `
      <a href="/${encodeURIComponent(ISLAND.toLowerCase().replace(/\s+/g,"-"))}" class="bsf-club__back">${esc(ISLAND)}</a>

      <!-- HEADER -->
      <div class="bsf-club__header">
        ${logoHTML}
        <div class="bsf-club__header-meta">
          <div class="bsf-club__region-label">${esc(ISLAND)} · Regional Football</div>
          <h1 class="bsf-club__name">${esc(FULL_NAME)}</h1>
          ${clubNicknames ? `<div class="bsf-club__nickname">${esc(clubNicknames)}</div>` : ""}
          <div class="bsf-club__facts">${factsHTML}</div>
          ${socialHTML}
        </div>
      </div>

      <!-- RESULTS + TABLE -->
      <div class="bsf-club__grid">
        <div>
          <div class="bsf-club__section"><h2>Recent Results</h2></div>
          <div id="bsf-club-results-mount"></div>
        </div>
        <div>
          <div class="bsf-club__section">
            <h2>League Table</h2>
            ${leagueSeasons.length > 1
              ? `<select class="bsf-club__season-select" id="bsf-standings-season">${standingsSeasonOptions}</select>`
              : `<span class="bsf-club__section-sub">${esc(latestSeason)}</span>`}
          </div>
          <div id="bsf-standings-container">
            ${renderStandingsForSeason(latestSeason)}
          </div>
        </div>
      </div>

      <!-- HONOURS -->
      <div class="bsf-club__section"><h2>Honours</h2></div>
      ${honoursHTML}

      <!-- SCORIGAMI -->
      <div class="bsf-club__section"><h2>Scorigami</h2></div>
      <div id="bsf-scorigami-controls" style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:10px;align-items:center;">
        <select id="bsf-scorigami-season" class="bsf-club__season-select" style="min-width:100px;">
          <option value="">All Time</option>
        </select>
        <select id="bsf-scorigami-comp" class="bsf-club__season-select" style="min-width:160px;">
          <option value="">All Competitions</option>
        </select>
      </div>
      <div id="bsf-scorigami-mount" style="overflow-x:auto;"></div>

      <!-- POSITION CHART -->
      <div class="bsf-club__section"><h2>League Position by Season</h2></div>

      <div class="bsf-club__chart-wrap">
        <canvas id="bsf-position-chart"></canvas>
      </div>

      <!-- KITS + VENUE -->
      <div class="bsf-club__grid" style="margin-top:0;">
        <div>
          <div class="bsf-club__section"><h2>Kits</h2></div>
          ${kitsHTML}
        </div>
        <div>
          <div class="bsf-club__section"><h2>Venue</h2></div>
          ${venueHTML}
        </div>
      </div>

      <!-- HISTORY -->
      <div class="bsf-club__section"><h2>History</h2></div>
      ${bioHTML}

      <!-- NEWS CAROUSEL -->
      <div class="bsf-club__section"><h2>News</h2></div>
      <div class="bsf-club__news-wrap" id="bsf-club-news">
        <div class="bsf-club__loading" style="padding:16px 0;">Loading articles…</div>
      </div>

      <!-- RIVALRIES -->
      ${rivalsHTML ? `
      <div class="bsf-club__section"><h2>Rivalries</h2></div>
      ${rivalsHTML}` : ""}

      <!-- ROSTER -->
      <div class="bsf-club__section"><h2>Squad</h2></div>
      ${rosterHTML}
    `;

    /* Inject DOM-based results tabs into mount point */
    const resultMount = document.getElementById("bsf-club-results-mount");
    if (resultMount) {
      if (resultsTabs && resultsTabs.length) {
        resultMount.appendChild(tabsEl);
        resultMount.appendChild(panelsEl);
      } else {
        resultMount.innerHTML = "<p style=\"font-size:11px;color:var(--muted);\">No results found.</p>";
      }
    }
    /* Build honorSeasonSet and honorDetails from winsByComp for chart annotations */
    const honorSeasonSet = new Set();
    const honorDetails   = {}; /* season → ["Campeonato Regional", "Taça ..."] */
    Object.entries(winsByComp).forEach(([comp, years]) => {
      years.forEach(y => {
        honorSeasonSet.add(y);
        if (!honorDetails[y]) honorDetails[y] = [];
        honorDetails[y].push(comp);
      });
    });

    /* ── STANDINGS SEASON DROPDOWN ──────────────────────────────── */
    const standingsSel = document.getElementById("bsf-standings-season");
    if (standingsSel) {
      standingsSel.addEventListener("change", () => {
        const container = document.getElementById("bsf-standings-container");
        if (container) container.innerHTML = renderStandingsForSeason(standingsSel.value);
      });
    }

    /* ── POSITION CHART ───────────────────────────────────────────
       Two modes:
       • All Time  — one point per season, final position
       • By Season — one point per match week, cumulative position
       Division bands shown for ALL divisions that exist that season,
       even if this club was never in them.
    ─────────────────────────────────────────────────────────── */

    const DIV_FILL = {
      "1": "rgba(180,180,180,0.22)",
      "2": "rgba(120,120,120,0.22)",
      "3": "rgba(70,70,70,0.22)",
      "4": "rgba(40,40,40,0.22)"
    };
    const DIV_LABEL_COLOR = {
      "1": "rgba(130,130,130,0.6)",
      "2": "rgba(90,90,90,0.6)",
      "3": "rgba(60,60,60,0.6)",
      "4": "rgba(40,40,40,0.6)"
    };
    const DIV_TEXT = {
      "1": "1ª Divisão", "2": "2ª Divisão", "3": "3ª Divisão", "4": "4ª Divisão"
    };

    /* Compute division bands from a set of { div, size } entries */
    function computeDivBands (divSizeMap) {
      const bands = [];
      let offset = 1;
      Object.keys(divSizeMap).sort().forEach(d => {
        const size = divSizeMap[d] || 0;
        if (!size) return;
        bands.push({ div: d, start: offset, end: offset + size - 1 });
        offset += size;
      });
      return bands;
    }

    /* Max div size across all seasons, for the all-time chart */
    const globalDivMaxSize = {};
    chartPoints.forEach(p => {
      if (!p.allDivSizes) return;
      Object.entries(p.allDivSizes).forEach(([d, sz]) => {
        globalDivMaxSize[d] = Math.max(globalDivMaxSize[d] || 0, sz);
      });
    });

    /* Recalculate overall y-axis position using globalDivMaxSize so points
       always land in the correct band regardless of per-season div size.
       divPos (position within own division) is preserved for the tooltip. */
    chartPoints.forEach(p => {
      if (p.division == null || p.divPos == null) return;
      let offset = 0;
      Object.keys(globalDivMaxSize).sort().forEach(d => {
        if (d < p.division) offset += globalDivMaxSize[d];
      });
      p.position = offset + p.divPos;
    });

    let posChart = null;

    /* ── CUSTOM DRAWING ────────────────────────────────────────────
       Chart.js 4 inline plugins go in the top-level plugins array
       but ONLY if registered. Instead we use a single custom plugin
       registered once via Chart.register(), storing draw params in
       the chart's own config so each instance is independent.
    ──────────────────────────────────────────────────────────── */
    const basofuChartPlugin = {
      id: "basofuChartPlugin",
      beforeDraw(chart) {
        const { ctx, chartArea, scales } = chart;
        if (!chartArea) return;
        const cfg = chart.config.options._basofuCfg || {};

        ctx.save();

        /* Division bands */
        (cfg.bands || []).forEach(b => {
          const y1 = scales.y.getPixelForValue(b.start - 0.5);
          const y2 = scales.y.getPixelForValue(b.end   + 0.5);
          const ct = Math.max(Math.min(y1, y2), chartArea.top);
          const cb = Math.min(Math.max(y1, y2), chartArea.bottom);
          if (cb <= ct) return;
          ctx.fillStyle = DIV_FILL[b.div] || "rgba(150,150,150,0.15)";
          ctx.fillRect(chartArea.left, ct, chartArea.width, cb - ct);
          /* Division label removed — shown in legend below chart */
        });

        /* Gap / missing season hatching — category scale needs adjacent pixel positions */
        (cfg.gaps || []).forEach((p, i) => {
          if (p.position != null) return;
          const labels = cfg.labels || [];
          /* Get pixel of this point and neighbours to compute cell width */
          const px     = scales.x.getPixelForValue(labels[i]);
          const pxPrev = i > 0 ? scales.x.getPixelForValue(labels[i - 1]) : null;
          const pxNext = i < labels.length - 1 ? scales.x.getPixelForValue(labels[i + 1]) : null;
          const halfW  = pxPrev != null ? (px - pxPrev) / 2
                       : pxNext != null ? (pxNext - px) / 2
                       : 20;
          const x1 = px - halfW;
          const x2 = px + halfW;
          const cx1 = Math.max(x1, chartArea.left);
          const cx2 = Math.min(x2, chartArea.right);
          if (cx2 <= cx1) return;
          ctx.fillStyle = "rgba(200,200,200,0.2)";
          ctx.fillRect(cx1, chartArea.top, cx2 - cx1, chartArea.height);
          ctx.save();
          ctx.beginPath();
          ctx.rect(cx1, chartArea.top, cx2 - cx1, chartArea.height);
          ctx.clip();
          ctx.strokeStyle = "rgba(160,160,160,0.4)";
          ctx.lineWidth = 1;
          ctx.beginPath();
          for (let s = -chartArea.height; s < cx2 - cx1 + chartArea.height; s += 6) {
            ctx.moveTo(cx1 + s, chartArea.top);
            ctx.lineTo(cx1 + s - chartArea.height, chartArea.top + chartArea.height);
          }
          ctx.stroke();
          ctx.restore();
        });

        ctx.restore();
      },
      afterDraw(chart) {
        const { ctx, chartArea, scales } = chart;
        if (!chartArea) return;
        const cfg = chart.config.options._basofuCfg || {};

        /* Stars removed — honour seasons shown via gold point colour and tooltip */
      }
    };

    /* Registration moved inside initChart() — Chart.js must be loaded first */

    function buildLegend (container, bands, hasGaps, hasTrophies) {
      const legend = document.createElement("div");
      legend.style.cssText = "display:flex;flex-wrap:wrap;gap:10px;margin-top:8px;padding:0 4px;";
      bands.forEach(b => {
        const item = document.createElement("div");
        item.style.cssText = "display:flex;align-items:center;gap:5px;font-family:'Inter',sans-serif;font-size:9px;font-weight:600;letter-spacing:0.1em;text-transform:uppercase;color:#888;";
        const sw = document.createElement("div");
        sw.style.cssText = `width:12px;height:12px;background:${DIV_FILL[b.div]||"#ccc"};border:1px solid #e8e8e6;`;
        item.appendChild(sw);
        item.appendChild(document.createTextNode(DIV_TEXT[b.div] || `Divisão ${b.div}`));
        legend.appendChild(item);
      });
      if (hasGaps) {
        const gi = document.createElement("div");
        gi.style.cssText = "display:flex;align-items:center;gap:5px;font-family:'Inter',sans-serif;font-size:9px;font-weight:600;letter-spacing:0.1em;text-transform:uppercase;color:#888;";
        gi.innerHTML = `<div style="width:12px;height:12px;background:repeating-linear-gradient(45deg,#ccc,#ccc 2px,transparent 2px,transparent 5px);border:1px solid #e8e8e6;"></div>No data`;
        legend.appendChild(gi);
      }
      if (hasTrophies) {
        const ti = document.createElement("div");
        ti.style.cssText = "display:flex;align-items:center;gap:5px;font-family:'Inter',sans-serif;font-size:9px;font-weight:600;letter-spacing:0.1em;text-transform:uppercase;color:#888;";
        ti.innerHTML = `<span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:#C2A14A;margin-right:2px;vertical-align:middle;"></span>Title won`;
        legend.appendChild(ti);
      }
      container.appendChild(legend);
    }

    function renderAllTime () {
      /* Force-destroy any existing chart on this canvas regardless of posChart state */
      const canvas = document.getElementById("bsf-position-chart");
      if (!canvas) return;
      const existing = Chart.getChart(canvas);
      if (existing) existing.destroy();
      posChart = null;

      const bands   = computeDivBands(globalDivMaxSize);
      const maxPos  = bands.length ? bands[bands.length - 1].end : maxOverallPos || 10;
      const hasGaps = chartPoints.some(p => p.position == null);

      const allTimeLabels = chartPoints.map(p => p.season);
      posChart = new Chart(canvas, {
        type: "line",
        data: {
          labels: allTimeLabels,
          datasets: [{
            data:                 chartPoints.map(p => p.position),
            borderColor:          "#2F3E46",
            pointBackgroundColor: chartPoints.map(p =>
              honorSeasonSet.has(p.season) ? "#C2A14A" : "#2F3E46"
            ),
            pointBorderColor:    "#fff",
            pointBorderWidth:    2,
            pointRadius:         chartPoints.map(p => p.position != null ? 4 : 0),
            pointHoverRadius:    7,
            borderWidth:         2,
            tension:             0,
            spanGaps:            false
          }]
        },
        options: {
          _basofuCfg: {
            bands,
            gaps:         chartPoints,
            honorSeasons: honorSeasonSet,
            honorDetails: honorDetails,
            labels:       allTimeLabels
          },
          responsive: true,
          maintainAspectRatio: true,
          aspectRatio: window.innerWidth < 640 ? 1.2 : 2.4,
          layout: { padding: { top: 20, right: 90 } },
          scales: {
            y: {
              reverse: true, min: 0.5, max: maxPos + 0.5,
              ticks: { stepSize: 1, callback: v => Number.isInteger(v) ? v : "" },
              title: { display: true, text: "Position" },
              grid:  { color: "rgba(0,0,0,0.04)" }
            },
            x: {
              grid:  { display: false },
              ticks: { maxRotation: 45, autoSkip: true,
                       maxTicksLimit: window.innerWidth < 640 ? 6 : 16 }
            }
          },
          plugins: {
            legend: { display: false },
            tooltip: {
              callbacks: {
                title: c => {
                  const p = chartPoints[c[0].dataIndex];
                  if (!p) return "";
                  let t = p.season || "";
                  const titles = honorDetails[p.season];
                  if (titles && titles.length) {
                    t += " · 🏆 " + titles.join(", ");
                  }
                  return t;
                },
                label: c => {
                  const p = chartPoints[c.dataIndex];
                  if (!p || p.position == null) return "No data / gap season";
                  const d    = DIV_TEXT[p.division] || (p.division ? `${p.division}ª Divisão` : "");
                  const pos  = p.divPos || p.position;
                  const ord  = pos === 1 ? "1st" : pos === 2 ? "2nd" : pos === 3 ? "3rd" : `${pos}th`;
                  return `${ord}${d ? " · " + d : ""}`;
                }
              }
            }
          }
        }
      });

      const wrap = canvas.parentElement;
      const old  = wrap.querySelector(".bsf-legend");
      if (old) old.remove();
      const leg = document.createElement("div");
      leg.className = "bsf-legend";
      buildLegend(leg, bands, hasGaps, honorSeasonSet.size > 0);
      wrap.appendChild(leg);
    }


    function initChart () {
      const canvas = document.getElementById("bsf-position-chart");
      if (!canvas || !chartPoints.length) return;

      /* Register custom plugin now that Chart.js is loaded */
      if (!Chart.registry.plugins.get("basofuChartPlugin")) {
        Chart.register(basofuChartPlugin);
      }

      const hasData = chartPoints.some(p => p.position != null);
      if (!hasData) {
        canvas.parentElement.innerHTML =
          `<p style="font-size:11px;color:var(--muted);">Not enough historical data to plot.</p>`;
        return;
      }

      renderAllTime();
    }

    /* Load Chart.js then render */
    if (window.Chart) {
      initChart();
    } else {
      const s = document.createElement("script");
      s.src = "https://cdn.jsdelivr.net/npm/chart.js@4.4.1/dist/chart.umd.min.js";
      s.onload = initChart;
      document.head.appendChild(s);

    }

    /* Load Chart.js then render */
    if (window.Chart) {
      initChart();
    } else {
      const s = document.createElement("script");
      s.src = "https://cdn.jsdelivr.net/npm/chart.js@4.4.1/dist/chart.umd.min.js";
      s.onload = initChart;
      document.head.appendChild(s);

    }

    /* ── SCORIGAMI ─────────────────────────────────────────────── */
    (function initScorigami() {
      const mount    = document.getElementById("bsf-scorigami-mount");
      const selSeas  = document.getElementById("bsf-scorigami-season");
      const selComp  = document.getElementById("bsf-scorigami-comp");
      if (!mount || !selSeas || !selComp) return;

      /* Populate filter dropdowns */
      const sgSeasons = [...new Set(normAllRows.map(m => m.season).filter(Boolean))]
        .sort((a,b) => String(b).localeCompare(String(a)));
      sgSeasons.forEach(s => {
        const o = document.createElement("option");
        o.value = s; o.textContent = s;
        selSeas.appendChild(o);
      });
      const sgComps = [...new Set(normAllRows.map(m => m.league).filter(Boolean))].sort();
      sgComps.forEach(c => {
        const o = document.createElement("option");
        o.value = c; o.textContent = c;
        selComp.appendChild(o);
      });

      function renderScorigami() {
        const season = selSeas.value;
        const comp   = selComp.value;
        const rows   = normAllRows.filter(m =>
          m.home_goals != null && m.away_goals != null &&
          (!season || m.season === season) &&
          (!comp   || m.league === comp)
        );

        /* From club's perspective: goals for vs goals against */
        const cells = {};
        let maxFor = 0, maxAgainst = 0;
        rows.forEach(m => {
          const isHome = norm(m.home_full) === norm(FULL_NAME) || norm(m.home_short) === norm(SHORT_NAME);
          const gf = isHome ? m.home_goals : m.away_goals;
          const ga = isHome ? m.away_goals : m.home_goals;
          if (gf == null || ga == null) return;
          const key = gf + "," + ga;
          cells[key] = (cells[key] || 0) + 1;
          maxFor     = Math.max(maxFor,     gf);
          maxAgainst = Math.max(maxAgainst, ga);
        });

        if (!Object.keys(cells).length) {
          mount.innerHTML = "<p style='font-size:11px;color:var(--muted);'>No results to display.</p>";
          return;
        }

        const maxCount = Math.max(...Object.values(cells));
        const cellSize = Math.max(18, Math.min(36, Math.floor(500 / Math.max(maxFor, maxAgainst, 5))));
        const pad      = 28;

        let svg = "<svg xmlns='http://www.w3.org/2000/svg' " +
          "width='" + ((maxFor+1)*cellSize + pad) + "' " +
          "height='" + ((maxAgainst+1)*cellSize + pad) + "' " +
          "style='font-family:Inter,system-ui,sans-serif;'>";

        /* Axis labels */
        for (let gf = 0; gf <= maxFor; gf++) {
          svg += "<text x='" + (pad + gf*cellSize + cellSize/2) + "' y='" + (pad-6) + "' " +
            "text-anchor='middle' font-size='9' fill='#888'>" + gf + "</text>";
        }
        for (let ga = 0; ga <= maxAgainst; ga++) {
          svg += "<text x='" + (pad-4) + "' y='" + (pad + ga*cellSize + cellSize/2 + 3) + "' " +
            "text-anchor='end' font-size='9' fill='#888'>" + ga + "</text>";
        }

        /* Grid cells */
        for (let gf = 0; gf <= maxFor; gf++) {
          for (let ga = 0; ga <= maxAgainst; ga++) {
            const key   = gf + "," + ga;
            const count = cells[key] || 0;
            const x     = pad + gf * cellSize;
            const y     = pad + ga * cellSize;
            /* Basofu palette — muted: navy win, gold draw, red loss, rule grey unseen */
            let fill;
            if (!count) {
              fill = "#f0f0ee";
            } else {
              /* Base colours mixed with white for muted effect */
              const t = 0.45 + 0.50 * (count / maxCount); /* 0.45–0.95 range */
              if (gf > ga) {
                /* Win: muted navy */
                fill = "rgba(47,62,70," + t + ")";
              } else if (gf === ga) {
                /* Draw: muted gold */
                fill = "rgba(194,161,74," + t + ")";
              } else {
                /* Loss: muted red */
                fill = "rgba(164,74,63," + t + ")";
              }
            }
            svg += "<rect x='" + x + "' y='" + y + "' width='" + (cellSize-1) + "' height='" + (cellSize-1) + "' " +
              "fill='" + fill + "' rx='2'>" +
              "<title>" + gf + "–" + ga + (count ? " (" + count + "×)" : " (never)") + "</title>" +
              "</rect>";
            if (count && cellSize >= 22) {
              svg += "<text x='" + (x + cellSize/2) + "' y='" + (y + cellSize/2 + 3) + "' " +
                "text-anchor='middle' font-size='" + Math.min(10, cellSize*0.35) + "' " +
                "fill='rgba(255,255,255,0.9)' font-weight='600'>" + count + "</text>";
            }
          }
        }

        /* Axis titles */
        svg += "<text x='" + (pad + (maxFor+1)*cellSize/2) + "' y='10' " +
          "text-anchor='middle' font-size='9' fill='#555'>Goals For (" + SHORT_NAME + ")</text>";
        svg += "</svg>";

        mount.innerHTML = svg;
      }

      renderScorigami();
      selSeas.addEventListener("change", renderScorigami);
      selComp.addEventListener("change", renderScorigami);
    })();

    /* ── NEWS CAROUSEL ────────────────────────────────────────────
       Tag must match SHORT_NAME exactly (case-insensitive) on each post.
       Falls back gracefully if the blog endpoint is unavailable.
    ─────────────────────────────────────────────────────────── */
    (async function loadNews () {
      const newsEl = document.getElementById("bsf-club-news");
      if (!newsEl) return;

      try {
        /* Squarespace blog JSON endpoint — adjust /articles to match your blog URL slug */
        const tag = encodeURIComponent(SHORT_NAME.toLowerCase());
        const res = await fetch(
          `/api/open/useraccounts/current/blog?tag=${tag}&pageSize=8&format=json`,
          { cache: "no-store" }
        );

        /* Squarespace also supports ?tag= on the blog page URL via its API */
        let posts = [];
        if (res.ok) {
          const json = await res.json();
          posts = (json.items || json.posts || []).slice(0, 8);
        }

        /* Fallback: try the standard Squarespace collection API */
        if (!posts.length) {
          const res2 = await fetch(`/articles?tag=${tag}&format=json`, { cache: "no-store" });
          if (res2.ok) {
            const json2 = await res2.json();
            posts = (json2.items || [])
              .filter(p => {
                const tags = (p.tags || []).map(t => String(t).toLowerCase());
                return tags.some(t => t === SHORT_NAME.toLowerCase() || t === FULL_NAME.toLowerCase());
              })
              .slice(0, 8);
          }
        }

        if (!posts.length) {
          newsEl.innerHTML = `<p style="font-size:11px;color:var(--muted);">No articles tagged with this club yet. Tag posts with "${esc(SHORT_NAME)}" in Squarespace to show them here.</p>`;
          return;
        }

        newsEl.innerHTML = `
          <div class="bsf-club__news-carousel" id="bsf-news-track">
            ${posts.map(p => {
              const title    = esc(p.title || "Untitled");
              const url      = esc(p.fullUrl || p.url || "#");
              const dateStr  = p.publishOn
                ? new Date(p.publishOn).toLocaleDateString("pt-CV", { day:"numeric", month:"short", year:"numeric" })
                : "";
              const excerpt  = esc((p.excerpt || p.body || "").replace(/<[^>]*>/g,"").slice(0,120));
              const imgUrl   = p.assetUrl || (p.items && p.items[0]?.assetUrl) || "";
              return `
                <a href="${url}" class="bsf-club__news-card">
                  ${imgUrl
                    ? `<div class="bsf-club__news-img" style="background-image:url('${esc(imgUrl)}')"></div>`
                    : `<div class="bsf-club__news-img bsf-club__news-img--empty"></div>`}
                  <div class="bsf-club__news-body">
                    ${dateStr ? `<div class="bsf-club__news-date">${dateStr}</div>` : ""}
                    <div class="bsf-club__news-title">${title}</div>
                    ${excerpt ? `<div class="bsf-club__news-excerpt">${excerpt}…</div>` : ""}
                  </div>
                </a>`;
            }).join("")}
          </div>
          <div class="bsf-club__news-nav">
            <button class="bsf-club__news-btn" onclick="document.getElementById('bsf-news-track').scrollBy({left:-320,behavior:'smooth'})">◀</button>
            <button class="bsf-club__news-btn" onclick="document.getElementById('bsf-news-track').scrollBy({left:320,behavior:'smooth'})">▶</button>
          </div>`;
      } catch (e) {
        newsEl.innerHTML = `<p style="font-size:11px;color:var(--muted);">Could not load news articles.</p>`;
      }
    })();

  } catch (err) {
    root.innerHTML = `<div class="bsf-club__error">Error loading club: ${esc(err.message)}</div>`;
    console.error("[Basofu club page]", err);
  }

})();
