/* ============================================================
   BASOFU — PRIMER PAGE SCRIPT
   Hosted on GitHub, served via jsDelivr CDN (same pattern as
   club-page.js / region-page-sections.js).

   Purpose: on "A Primer on the Leagues of Cabo Verde", replace
   hardcoded "20XX/YY Champions" lists and "Titles by Competition"
   images with data pulled live from the Champions + Clubs sheets,
   so the article never needs manual updates when a season ends.

   ── HOW IT WORKS ────────────────────────────────────────────
   The Champions sheet has NO region/island column — just
   Year | Winner | Runner Up | Competition | Location | Notes.
   Competition names repeat across islands ("Campeonato Regional"
   means something different on every island), so we can't group
   by Competition name alone.

   Instead: for each region block on the page, we fetch that
   island's clubs from the Clubs sheet (BASOFU.getClubsMeta),
   build a set of that island's club names, and keep only
   Champions rows whose Winner matches one of those clubs. Since
   a club can only ever win ITS OWN island's regional competitions,
   this disambiguates the generic competition names without
   needing a new sheet column.

   National-level rows (Campeonato Nacional, Taça Nacional,
   Supertaça de Cabo Verde, Taça Inter-Ilhas, etc.) are pulled out
   separately using BASOFU.isNationalCompetition(), so they always
   land in the National section rather than being attributed to
   whichever island the winning club happens to come from.

   ── HTML CONTRACT ───────────────────────────────────────────
   Each region section on the page needs mount points for men's
   and (optionally) women's competitions:

     <div class="bsf-primer__champs" data-bsf-champs="Boa Vista"></div>
     <div class="bsf-primer__titles" data-bsf-titles="Boa Vista"></div>

     <div class="bsf-primer__champs" data-bsf-champs="Boa Vista" data-bsf-gender="women"></div>
     <div class="bsf-primer__titles" data-bsf-titles="Boa Vista" data-bsf-gender="women"></div>

   Omitting data-bsf-gender (or setting it to "men") renders men's
   competitions. The value of data-bsf-champs / data-bsf-titles MUST
   exactly match the "Island" column in the Clubs sheet (same rule
   as window.BSF_ISLAND on club pages). For the national section use
   the special value "National" on both attributes — this skips the
   club-set filter and instead filters straight to
   isNationalCompetition() rows.

   ── "LATEST" IS ALWAYS RELATIVE, NEVER A HARDCODED SEASON ───
   "Latest champion" = whatever year is most recent IN THE SHEET
   for that specific competition, computed fresh on every page
   load. No season string is ever hardcoded here — if a region's
   2024/25 competition wasn't held, this correctly falls back to
   its last completed season (e.g. Brava/Maio showing 2023/24)
   without anyone needing to touch this file or the article HTML.
   As new seasons get added to the sheet, the page updates itself.

   ── WOMEN'S COMPETITIONS ────────────────────────────────────
   Distinguished purely by the Competition name carrying a
   "Feminino" suffix (e.g. "Campeonato Regional Feminino" vs
   "Campeonato Regional"). Add data-bsf-gender="women" to a mount
   point to render the women's side of that region/competition
   set; omit it (or use "men") for the men's side. Region-level
   club matching (winner → island) works the same for both, since
   women's club names ("Seven Stars Futebol Feminino" etc.) are
   matched the same fuzzy way as men's clubs.
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

  /* Same fuzzy club-name normaliser used on club pages, so
     "GD Palmeira" and "Palmeira" and "Grupo Desportivo da Palmeira"
     all resolve to the same club when matching Winner text. */
  function normClub(s) {
    return (s || "").trim().toLowerCase()
      .replace(/^(gd|cd|sc|cf|ad|sp|ge|asc|adf|gdsc|as)\s+/i, "")
      .replace(/\s+(fc|sc|cf|ad|gd|cd)$/i, "");
  }

  const SKIP_WINNERS = new Set(["not known", "not held", "unknown", "tbd", "n/a", ""]);

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

    /* Collect the distinct region names referenced on the page.
       (Gender doesn't affect which regions/clubs we need to fetch —
       men's and women's rows for a region draw from the same club
       list — so this stays keyed on region only.) */
    const regions = new Set();
    champMounts.forEach(el => regions.add(el.dataset.bsfChamps));
    titleMounts.forEach(el => regions.add(el.dataset.bsfTitles));

    /* Fetch the full Champions sheet once (small, heavily cached),
       plus each region's clubs in parallel (server-filtered by island). */
    let champRows = [];
    const clubsByRegion = {};
    try {
      const nonNational = [...regions].filter(r => r !== "National");
      const [champResult, ...clubResults] = await Promise.all([
        BASOFU.getHonorsRaw(),
        ...nonNational.map(r => BASOFU.getClubsMeta(r))
      ]);
      champRows = champResult || [];
      nonNational.forEach((r, i) => { clubsByRegion[r] = clubResults[i] || []; });
    } catch (e) {
      console.error("[Basofu primer] Failed to load sheet data", e);
      champMounts.forEach(el => el.innerHTML = `<p class="bsf-primer__error">Could not load champions data.</p>`);
      titleMounts.forEach(el => el.innerHTML = `<p class="bsf-primer__error">Could not load titles data.</p>`);
      return;
    }

    /* Normalise every Champions row once */
    const normRows = champRows.map(r => {
      const winner      = (r.winner || r["Winner"] || "").trim();
      const runnerUp    = (r.runnerUp || r["Runner Up"] || "").trim();
      const competition = (r.competition || r["Competition"] || "").trim();
      const rawYear     = (r.year || r["Year"] || "").toString().trim();
      const season      = BASOFU.seasonStart ? rawYear : rawYear; // kept raw; seasonStart used for sorting
      return { winner, runnerUp, competition, rawYear, seasonStart: BASOFU.seasonStart(rawYear) };
    }).filter(r => r.competition && r.rawYear && !SKIP_WINNERS.has(r.winner.toLowerCase()));

    /* Build a lookup: for a given region, the set of normalised club
       identifiers (full name + short name) that belong to it. */
    function clubSetFor(region) {
      const set = new Set();
      (clubsByRegion[region] || []).forEach(c => {
        const full  = c.team || c["Team"] || "";
        const short = c.shortName || c["Short Name"] || c.short || "";
        if (full)  set.add(normClub(full));
        if (short) set.add(normClub(short));
      });
      return set;
    }

    /* Rows belonging to a given region's OWN competitions, for a given
       gender: winner must be a club from that island, the competition
       must not be a national-level one (national wins are shown only
       in the National section, even if won by this island's club),
       and the competition's Feminino-suffix status must match the
       requested gender. */
    function rowsFor(region, gender) {
      const wantWomens = gender === "women";
      const base = region === "National"
        ? normRows.filter(r => BASOFU.isNationalCompetition(r.competition))
        : (() => {
            const clubSet = clubSetFor(region);
            if (!clubSet.size) return [];
            return normRows.filter(r =>
              !BASOFU.isNationalCompetition(r.competition) &&
              clubSet.has(normClub(r.winner))
            );
          })();
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

    /* Sort competitions: national first (won't apply within a region
       group since national's excluded), then supercup, cup, abertura,
       league — matches the ordering used on club pages. */
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
