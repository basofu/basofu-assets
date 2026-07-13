/* ============================================================
   BASOFU — INTERNATIONAL RANKINGS WIDGET (international-rankings.js)
   ------------------------------------------------------------
   Hosted on GitHub, served via jsDelivr CDN.
   Loaded by the footer injection whenever window.BSF_INTERNATIONAL
   is set (alongside window.BSF_REGION = "International").

   Mounts into: <div id="bsf-international-rankings-root"></div>

   Data source: BASOFU.getRankings() via the GAS Web App → Worker
   pipeline (NOT a direct fetch with a hardcoded secret — that
   pattern is deprecated, see project reference).
============================================================ */
(async function () {
  "use strict";

  /* Double-render guard — Squarespace sometimes runs code blocks twice */
  if (window.__basofuRankingsRunning) return;
  window.__basofuRankingsRunning = true;

  const ROOT_ID    = "bsf-international-rankings-root";
  const REFRESH_MS = 3600000; /* 1 hour */

  const root = document.getElementById(ROOT_ID);
  if (!root) {
    console.error("[Basofu rankings] #" + ROOT_ID + " not found");
    return;
  }
  root.innerHTML = `<p class="bsf-region__loading">Loading rankings…</p>`;

  /* ── HELPERS ─────────────────────────────────────────────── */
  function esc(s) {
    return String(s || "")
      .replace(/&/g, "&amp;").replace(/</g, "&lt;")
      .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }

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

  /* GAS returns camelCase keys; fall back to PascalCase sheet-column
     names in case getRankings() hasn't been normalised server-side yet. */
  function normRow(r) {
    return {
      date:   r.date   || r.Date   || "",
      team:   r.team   || r.Team   || "",
      rank:   r.rank   || r.Rank   || "",
      points: r.points || r.Points || "",
      change: r.change || r.Change || ""
    };
  }

  /* ── SPARKLINE SVG ───────────────────────────────────────────
     Y-axis inverted: lower rank number = higher on chart.
  ─────────────────────────────────────────────────────────── */
  function renderSparkline(points, color) {
    const W = 100, H = 28, pad = 2;
    if (points.length < 2) return "";

    const ranks = points.map(p => p.rank);
    const minR = Math.min(...ranks);
    const maxR = Math.max(...ranks);
    const range = maxR - minR || 1;

    const coords = points.map((p, i) => {
      const x = pad + (i / (points.length - 1)) * (W - pad * 2);
      const y = pad + ((p.rank - minR) / range) * (H - pad * 2);
      return [x, y];
    });

    const pathD = coords.map((c, i) => `${i === 0 ? "M" : "L"}${c[0].toFixed(1)},${c[1].toFixed(1)}`).join(" ");
    const last = coords[coords.length - 1];

    return `
      <svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" style="display:block;">
        <path d="${pathD}" fill="none" stroke="${color}" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
        <circle cx="${last[0].toFixed(1)}" cy="${last[1].toFixed(1)}" r="2.5" fill="${color}"/>
      </svg>
    `;
  }

  function moveBadge(delta) {
    if (delta === null) return "";
    if (delta > 0) return `<span style="display:inline-flex;align-items:center;gap:3px;font-size:11px;padding:2px 8px;background:rgba(47,62,70,0.08);color:#2F3E46;">▲ ${delta}</span>`;
    if (delta < 0) return `<span style="display:inline-flex;align-items:center;gap:3px;font-size:11px;padding:2px 8px;background:rgba(164,74,63,0.08);color:#A44A3F;">▼ ${Math.abs(delta)}</span>`;
    return `<span style="font-size:11px;padding:2px 8px;background:#f0f0ee;color:#888;">— 0</span>`;
  }

  function rankBlock(current, move, sparkPoints, sparkColor, label) {
    if (!current) {
      return `<div style="flex:1;text-align:center;opacity:0.5;font-size:12px;font-family:'Inter',system-ui,sans-serif;">No data</div>`;
    }
    const updated = current.date
      ? `<span style="font-size:10px;color:#888;">Updated ${esc(current.date)}</span>`
      : "";
    return `
      <div style="flex:1;text-align:center;min-width:0;">
        <div style="font-size:10px;letter-spacing:0.14em;text-transform:uppercase;color:#888;margin-bottom:6px;font-weight:600;">
          ${esc(label)}
        </div>
        <div style="font-size:36px;font-weight:600;line-height:1;color:#1C1C1C;font-family:'EB Garamond',Georgia,serif;">
          #${esc(current.rank)}
        </div>
        <div style="margin:8px 0 6px;">
          ${moveBadge(move)}
        </div>
        <div style="display:flex;justify-content:center;margin:6px 0 6px;">
          ${renderSparkline(sparkPoints, sparkColor)}
        </div>
        ${updated}
      </div>
    `;
  }

  function movement(series, current) {
    if (!current || series.length < 2) return null;
    const prev = series[series.length - 2];
    return Number(prev.rank) - Number(current.rank); /* positive = improved */
  }

  /* ── RENDER ──────────────────────────────────────────────── */
  function render(rawRows) {
    const rows = (rawRows || []).map(normRow);

    const men = rows
      .filter(r => (r.team || "").trim().toLowerCase() === "men")
      .sort((a, b) => new Date(a.date) - new Date(b.date));

    const women = rows
      .filter(r => (r.team || "").trim().toLowerCase() === "women")
      .sort((a, b) => new Date(a.date) - new Date(b.date));

    const menCurrent   = men[men.length - 1]   || null;
    const womenCurrent = women[women.length - 1] || null;

    const menPoints   = men.slice(-12).map(r => ({ date: r.date, rank: Number(r.rank) }));
    const womenPoints = women.slice(-12).map(r => ({ date: r.date, rank: Number(r.rank) }));

    const menMove   = movement(men, menCurrent);
    const womenMove = movement(women, womenCurrent);

    /* Navy for men, Basofu red for women — stays within the 3-colour palette */
    const MEN_COLOR   = "#2F3E46";
    const WOMEN_COLOR = "#A44A3F";

    root.innerHTML = `
      <div style="border:1px solid #e8e8e6;padding:1.25rem 1.5rem 1rem;background:#fafaf8;font-family:'Inter',system-ui,sans-serif;">
        <div style="font-size:10px;letter-spacing:0.14em;text-transform:uppercase;color:#888;padding-bottom:10px;border-bottom:2px solid #C2A14A;margin-bottom:16px;font-weight:600;">
          FIFA World Rankings · Cabo Verde
        </div>

        <div style="display:flex;gap:0;align-items:flex-start;">
          ${rankBlock(menCurrent, menMove, menPoints, MEN_COLOR, "Tubarões Azuis · Men")}
          <div style="width:1px;background:#e8e8e6;align-self:stretch;margin:0 1.25rem;"></div>
          ${rankBlock(womenCurrent, womenMove, womenPoints, WOMEN_COLOR, "Tubarões Azuis · Women")}
        </div>

        <div style="margin-top:14px;padding-top:10px;border-top:1px solid #e8e8e6;display:flex;justify-content:space-between;align-items:center;">
          <div style="display:flex;align-items:center;gap:16px;font-size:10px;color:#888;">
            <span style="display:flex;align-items:center;gap:4px;">
              <svg width="28" height="10" viewBox="0 0 28 10"><line x1="0" y1="5" x2="24" y2="5" stroke="${MEN_COLOR}" stroke-width="1.5"/><circle cx="26" cy="5" r="2" fill="${MEN_COLOR}"/></svg>
              Men
            </span>
            <span style="display:flex;align-items:center;gap:4px;">
              <svg width="28" height="10" viewBox="0 0 28 10"><line x1="0" y1="5" x2="24" y2="5" stroke="${WOMEN_COLOR}" stroke-width="1.5"/><circle cx="26" cy="5" r="2" fill="${WOMEN_COLOR}"/></svg>
              Women
            </span>
          </div>
          <span style="font-size:10px;color:#888;">12-month trend</span>
        </div>
      </div>
    `;
  }

  /* ── FETCH LOOP ──────────────────────────────────────────── */
  async function fetchAndRender(BASOFU) {
    try {
      const rows = await BASOFU.getRankings();
      render(rows);
    } catch (err) {
      console.error("[Basofu rankings]", err);
      root.innerHTML = `<p style="font-size:11px;color:var(--muted, #888);">Error loading rankings.</p>`;
    }
  }

  try {
    const BASOFU = await waitForBasofu();
    fetchAndRender(BASOFU);
    setInterval(() => fetchAndRender(BASOFU), REFRESH_MS);
  } catch (err) {
    root.innerHTML = `<p style="font-size:11px;color:var(--muted, #888);">Error loading rankings.</p>`;
    console.error("[Basofu rankings]", err);
  }

})();
