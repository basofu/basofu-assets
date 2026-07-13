/* ============================================================
   BASOFU — PRIMER PAGE SCRIPT
   Hosted on GitHub, served via jsDelivr CDN (same pattern as
   club-page.js / region-page-sections.js).

   Purpose: on "A Primer on the Leagues of Cabo Verde", replace
   hardcoded "20XX/YY Champions" lists and "Titles by Competition"
   images with data pulled live from the Champions sheet, so the
   article never needs manual updates when a season ends.

   ── HOW IT WORKS ────────────────────────────────────────────
   The Champions sheet now has a "Region" column mapping every
   row to the exact island/zone that competition belongs to
   (Year | Winner | Runner Up | Competition | Location | Notes |
   Region). We filter purely on an EXACT match against that
   column — no more fuzzy winner-name matching against the Clubs
   sheet, which was the source of a real bug: ambiguous club
   names (e.g. multiple "Académica" clubs across islands) could
   slip through and attribute a title to the wrong region.

   Two regions split into North/South and also carry their own
   island-wide label:
     - "Santiago"           → island-wide competitions only
     - "Santiago Norte"     → North-specific competitions only
     - "Santiago Sul"       → South-specific competitions only
     - "Santo Antão"        → island-wide competitions only
     - "Santo Antão Norte"  → North-specific competitions only
     - "Santo Antão Sul"    → South-specific competitions only
   These are treated as three completely distinct Region values —
   there is no fallback or inheritance between them. A row tagged
   "Santo Antão" will NOT appear under "Santo Antão Norte" or
   "Santo Antão Sul", and vice versa. Whoever fills in the Region
   column controls this precisely.

   For national competitions, this script matches Region values of
   "National" or "Nacional" (case-insensitive). If neither appears
   for a given row, it falls back to BASOFU.isNationalCompetition()
   on the Competition name as a safety net for any legacy rows that
   haven't been given a Region value yet.

   ── HTML CONTRACT ───────────────────────────────────────────
   Each region section on the page needs mount points for men's
   and (optionally) women's competitions:

     <div class="bsf-primer__champs" data-bsf-champs="Boa Vista"></div>
     <div class="bsf-primer__titles" data-bsf-titles="Boa Vista"></div>

     <div class="bsf-primer__champs" data-bsf-champs="Boa Vista" data-bsf-gender="women"></div>
     <div class="bsf-primer__titles" data-bsf-titles="Boa Vista" data-bsf-gender="women"></div>

   Omitting data-bsf-gender (or setting it to "men") renders men's
   competitions. The value of data-bsf-champs / data-bsf-titles MUST
   exactly match a value used in the Region column of the Champions
   sheet (accents/case are normalised for comparison, but the text
   should otherwise match, e.g. "Santo Antão Norte").

   ── "LATEST" IS ALWAYS RELATIVE, NEVER A HARDCODED SEASON ───
   "Latest champion" = whatever year is most recent IN THE SHEET
   for that specific competition, computed fresh on every page
   load. No season string is ever hardcoded here — if a region's
   most recent competition wasn't held, this correctly falls back
   to its last completed season, without anyone needing to touch
   this file or the article HTML. As new seasons get added to the
   sheet, the page updates itself.

   ── WOMEN'S COMPETITIONS ────────────────────────────────────
   Distinguished purely by the Competition name carrying a
   "Feminino" suffix (e.g. "Campeonato Regional Feminino" vs
   "Campeonato Regional"). Add data-bsf-gender="women" to a mount
   point to render the women's side of that region/competition
   set; omit it (or use "men") for the men's side.
   ============================================================ */

(function () {
  "use strict";

  /* ── WAIT FOR window.BASOFU ──────────────────────────────── */
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

  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;")
      .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }

  /* Normalise a region name for comparison only (never for display):
     lower-case, trim, and fold accents so "Santo Antão" and
     "santo antao" compare equal regardless of how either side
     typed it. */
  function normRegion(s) {
    return (s || "")
      .normalize("NFD").replace(/[\u0300-\u036f]/g, "") // strip accents
      .trim().toLowerCase();
  }

  /* Fuzzy club-name normaliser — still used for the titles tally,
     where we group a competition's wins by winner, not for region
     matching (region matching is now exact via the Region column). */
  function normClub(s) {
    return (s || "").trim().toLowerCase()
      .replace(/^(gd|cd|sc|cf|ad|sp|ge|asc|adf|gdsc|as)\s+/i, "")
      .replace(/\s+(fc|sc|cf|ad|gd|cd)$/i, "");
  }

  const SKIP_WINNERS = new Set(["not known", "not held", "unknown", "tbd", "n/a", ""]);
  const NATIONAL_REGION_VALUES = new Set(["national", "nacional"]);

  /* Women's competitions carry a "Feminino" suffix in the Competition
     name column, e.g. "Campeonato Regional Feminino". Everything
     without that suffix is treated as men's. */
  function isWomensCompetition(name) {
    return /feminino/i.test(name || "");
  }

  /* ── MAIN ────────────────────────────────────────────────── */
  (async function init() {
    const champMounts = document.querySelectorAll("[data-bsf-champs]");
    const titleMounts = document.querySelectorAll("[data-bsf-titles]");
    if (!champMounts.length && !titleMounts.length) return; // nothing on this page needs it

    let BASOFU;
    try {
      BASOFU = await waitForBasofu();
    } catch (e) {
      console.error("[Basofu primer] BASOFU global never loaded", e);
      return;
    }

    /* Fetch the full Champions sheet once — that's all this script
       needs now that Region is a real column. */
    let champRows = [];
    try {
      champRows = await BASOFU.getHonorsRaw() || [];
    } catch (e) {
      console.error("[Basofu primer] Failed to load Champions sheet", e);
      champMounts.forEach(el => el.innerHTML = `<p class="bsf-primer__error">Could not load champions data.</p>`);
      titleMounts.forEach(el => el.innerHTML = `<p class="bsf-primer__error">Could not load titles data.</p>`);
      return;
    }

    /* Normalise every Champions row once */
    const normRows = champRows.map(r => {
      const winner      = (r.winner || r["Winner"] || "").trim();
      const runnerUp    = (r.runnerUp || r["Runner Up"] || "").trim();
      const competition = (r.competition || r["Competition"] || "").trim();
      const region      = (r.region || r["Region"] || "").trim();
      const rawYear     = (r.year || r["Year"] || "").toString().trim();
      return {
        winner, runnerUp, competition, region, rawYear,
        seasonStart: BASOFU.seasonStart(rawYear)
      };
    }).filter(r => r.competition && r.rawYear && !SKIP_WINNERS.has(r.winner.toLowerCase()));

    /* Rows belonging to an EXACT region match, for a given gender.
       "National" is special: matches Region values of National/
       Nacional, with a fallback to isNationalCompetition() on the
       Competition name for any row that hasn't been tagged yet. */
    function rowsFor(region, gender) {
      const wantWomens = gender === "women";
      const wantRegion = normRegion(region);

      const base = wantRegion === "national"
        ? normRows.filter(r =>
            NATIONAL_REGION_VALUES.has(normRegion(r.region)) ||
            (!r.region && BASOFU.isNationalCompetition(r.competition))
          )
        : normRows.filter(r => normRegion(r.region) === wantRegion);

      return base.filter(r => isWomensCompetition(r.competition) === wantWomens);
    }

    /* Group rows by competition name */
    function groupByCompetition(rows) {
      const groups = {};
      rows.forEach(r => {
        if (!groups[r.competition]) groups[r.competition] = [];
        groups[r.competition].push(r);
      });
      return groups;
    }

    /* Sort competitions: supercup, cup, abertura, group, league —
       matches the ordering used on club pages. */
    const compOrder = { national: 0, supercup: 1, cup: 2, abertura: 3, group: 4, league: 5 };
    function sortCompetitions(names) {
      return names.sort((a, b) => {
        const ta = compOrder[BASOFU.competitionType(a)] ?? 6;
        const tb = compOrder[BASOFU.competitionType(b)] ?? 6;
        return ta - tb || a.localeCompare(b);
      });
    }

    /* ── RENDER: latest champions list ───────────────────────── */
    function renderChampions(region, gender) {
      const rows = rowsFor(region, gender);
      if (!rows.length) {
        const label = gender === "women" ? "women's" : "men's";
        return `<p class="bsf-primer__empty">No ${label} champions found in the sheet for ${esc(region)} yet.</p>`;
      }
      const groups = groupByCompetition(rows);
      const comps  = sortCompetitions(Object.keys(groups));

      /* Always take whichever year is most recent IN THE SHEET for
         this specific competition — never a hardcoded season. */
      const items = comps.map(comp => {
        const compRows = groups[comp];
        const latest = compRows.slice().sort((a, b) => b.seasonStart - a.seasonStart)[0];
        return `<li><strong>${esc(comp)}</strong> ${esc(latest.winner)} <span class="bsf-primer__season">(${esc(latest.rawYear)})</span></li>`;
      }).join("");

      return `<ul class="bsf-primer__champs-list">${items}</ul>`;
    }

    /* ── RENDER: all-time titles by competition (replaces the
       static bar-chart images) ──────────────────────────────── */
    function renderTitles(region, gender) {
      const rows = rowsFor(region, gender);
      if (!rows.length) {
        const label = gender === "women" ? "women's" : "men's";
        return `<p class="bsf-primer__empty">No ${label} title history found in the sheet for ${esc(region)} yet.</p>`;
      }
      const groups = groupByCompetition(rows);
      const comps  = sortCompetitions(Object.keys(groups));

      const blocks = comps.map(comp => {
        const compRows = groups[comp];
        /* Count distinct years per winner so a duplicate row for the
           same club/year (data-entry slip) doesn't double count. */
        const yearsByWinner = {};
        compRows.forEach(r => {
          const key = normClub(r.winner);
          if (!yearsByWinner[key]) yearsByWinner[key] = { display: r.winner, years: new Set() };
          yearsByWinner[key].years.add(r.rawYear);
          /* Prefer the longest/most complete display name seen */
          if (r.winner.length > yearsByWinner[key].display.length) yearsByWinner[key].display = r.winner;
        });

        const tally = Object.values(yearsByWinner)
          .map(v => ({ name: v.display, count: v.years.size }))
          .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));

        const maxCount = tally[0] ? tally[0].count : 1;

        const barRows = tally.map(t => `
          <div class="bsf-primer__bar-row">
            <span class="bsf-primer__bar-label">${esc(t.name)}</span>
            <div class="bsf-primer__bar-track">
              <div class="bsf-primer__bar-fill" style="width:${Math.max(6, Math.round(100 * t.count / maxCount))}%"></div>
            </div>
            <span class="bsf-primer__bar-count">${t.count}&times;</span>
          </div>`).join("");

        return `
          <div class="bsf-primer__titles-group">
            <div class="bsf-primer__titles-heading">${esc(comp)}</div>
            ${barRows}
          </div>`;
      }).join("");

      return blocks;
    }

    /* ── APPLY ────────────────────────────────────────────────── */
    champMounts.forEach(el => {
      const region = el.dataset.bsfChamps;
      const gender = (el.dataset.bsfGender || "men").toLowerCase();
      try { el.innerHTML = renderChampions(region, gender); }
      catch (e) { console.error("[Basofu primer] champions render failed for", region, gender, e); el.innerHTML = `<p class="bsf-primer__error">Error loading champions.</p>`; }
    });

    titleMounts.forEach(el => {
      const region = el.dataset.bsfTitles;
      const gender = (el.dataset.bsfGender || "men").toLowerCase();
      try { el.innerHTML = renderTitles(region, gender); }
      catch (e) { console.error("[Basofu primer] titles render failed for", region, gender, e); el.innerHTML = `<p class="bsf-primer__error">Error loading titles.</p>`; }
    });
  })();
})();
