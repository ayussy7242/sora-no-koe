"use strict";

const { buildGlyphImgTag, replaceGlyphsWithImages } = require("./glyphs");

function renderPageIntro(intro, escapeHtml) {
  if (Array.isArray(intro)) {
    const [head, body] = intro;
    const headHtml = head ? `<strong>${escapeHtml(head)}</strong>` : "";
    const bodyHtml = body ? `<br/>${escapeHtml(body)}` : "";
    return `${headHtml}${bodyHtml}`;
  }
  return intro ? escapeHtml(intro) : "";
}

function renderSysPage(ctx) {
  const { renderBg, strongBg, nextPageNumber, escapeHtml, renderRichText, p, PAGE_INTROS } = ctx;
  return `
  <section class="page page--space" style="--space-opacity: 0.85;">
    ${renderBg("sys", strongBg)}
    <div class="blueprint-grid"></div>
    ${nextPageNumber()}
    <div class="page-corner">✦</div>
    <div class="slide">
      <div class="top">
        <div class="title">あなたの星の設計図</div>
        <div class="subtext title-en sys-title-en">BIRTH STAR BLUEPRINT</div>
        <div class="page-intro" style="margin-top:28px;">${renderPageIntro(PAGE_INTROS.sys, escapeHtml)}</div>
        <div class="subtext sys-signline" style="letter-spacing:0.4em; font-size:18px; opacity:0.8;">${escapeHtml(p.signatureLineSymbols)}</div>
        <div class="text sys-owner">${escapeHtml(p.ownerName)}</div>
        <div class="subtext sys-birth">${escapeHtml(p.birthText)}</div>
      </div>
      <div class="middle">
        <div class="sys-grid-2">
          <div class="chart-box">
            <div class="card-head">星の軸</div>
            <div class="card-sub">STAR AXIS</div>
            <div class="card-list">
              ${p.coreAxisLines.map((row) => `<div>${escapeHtml(row)}</div>`).join("")}
            </div>
          </div>
          <div class="chart-box">
            <div class="card-head">星の駆動</div>
            <div class="card-sub">STAR DRIVE</div>
            <div class="card-list">
            ${(p.drivingForceLines || []).map((row) => `<div>${escapeHtml(row)}</div>`).join("")}
            </div>
          </div>
          <div class="chart-box">
            <div class="card-head">星の重心</div>
            <div class="card-sub">STAR DOMINANCE</div>
            <div class="card-list">
              ${p.dominanceLines.map((row) => `<div>${escapeHtml(row)}</div>`).join("")}
            </div>
          </div>
          <div class="chart-box">
            <div class="card-head">星の構成</div>
            <div class="card-sub">STAR COMPOSITION</div>
            <div class="card-list">
              ${p.structureLines.map((row) => `<div>${escapeHtml(row)}</div>`).join("")}
            </div>
          </div>
          <div class="chart-box span-2 full-width">
            <div class="card-head">星のシグネチャ</div>
            <div class="card-sub">STAR SIGNATURE</div>
            <div class="card-body text-block">${renderRichText(p.starSignatureText || "")}</div>
          </div>
        </div>
      </div>
      <div class="bottom"></div>
    </div>
  </section>`;
}

function renderMapPage(ctx) {
  const { nextPageNumber, escapeHtml, renderRichText, p, PAGE_INTROS, dominantSignRows } = ctx;
  const keyPointRows = (p.keyPointsList || []).map((row) => {
    const safe = escapeHtml(row);
    return replaceGlyphsWithImages(safe, { className: "glyph-img", size: 20 });
  });
  const dominantSignText = (dominantSignRows || []).slice(0, 3).join("｜");
  const dominantHouseText = (p.dominantHouses || []).slice(0, 3).join("｜");
  const elementGlyph = (glyph, color) =>
    buildGlyphImgTag(glyph, { className: "astro-symbol-img", size: 22, color });
  const modalityGlyph = (glyph, color) =>
    buildGlyphImgTag(glyph, { className: "astro-symbol-img", size: 24, color });
  return `
  <section class="page page--map">
    <div class="blueprint-grid"></div>
    ${nextPageNumber()}
    <div class="page-corner">✧</div>
    <div class="slide">
      <div class="top">
        <div class="label">STAR MAP</div>
        <div class="title">星の構造マップ</div>
        
        <div class="page-intro">${renderPageIntro(PAGE_INTROS.map, escapeHtml)}</div>
      </div>
      <div class="middle">
        <div class="grid-6">
          <div class="chart-box span-3">
            <div class="card-head map-title">エレメント</div>
            <div class="card-sub">ELEMENT BALANCE</div>
            <div class="bar-list bar-list--element" style="margin-top:16px;">
              <div class="metric-row">
                <div class="metric-label">${elementGlyph("🜂", "#FF6B6B")}<span class="metric-name">火</span><span class="metric-count">${p.elementCounts?.fire ?? ""}</span></div>
                <div class="metric-bar"><div class="bar" style="--bar-fill:${p.elementBars?.fire ?? 62}%; --bar-color:#FF6B6B;"></div></div>
              </div>
              <div class="metric-row">
                <div class="metric-label">${elementGlyph("🜃", "#E6C36D")}<span class="metric-name">地</span><span class="metric-count">${p.elementCounts?.earth ?? ""}</span></div>
                <div class="metric-bar"><div class="bar" style="--bar-fill:${p.elementBars?.earth ?? 42}%; --bar-color:#E6C36D;"></div></div>
              </div>
              <div class="metric-row">
                <div class="metric-label">${elementGlyph("🜁", "#7FBF8F")}<span class="metric-name">風</span><span class="metric-count">${p.elementCounts?.air ?? ""}</span></div>
                <div class="metric-bar"><div class="bar" style="--bar-fill:${p.elementBars?.air ?? 54}%; --bar-color:#7FBF8F;"></div></div>
              </div>
              <div class="metric-row">
                <div class="metric-label">${elementGlyph("🜄", "#7AA7FF")}<span class="metric-name">水</span><span class="metric-count">${p.elementCounts?.water ?? ""}</span></div>
                <div class="metric-bar"><div class="bar" style="--bar-fill:${p.elementBars?.water ?? 30}%; --bar-color:#7AA7FF;"></div></div>
              </div>
            </div>
          </div>
          <div class="chart-box span-3">
            <div class="card-head map-title">モード</div>
            <div class="card-sub">MODALITY BALANCE</div>
            <div class="bar-list bar-list--modality" style="margin-top:16px;">
              <div class="metric-row">
                <div class="metric-label">${modalityGlyph("△", "#FFB27A")}<span class="metric-name">活動宮</span><span class="metric-count">${p.modalityCounts?.cardinal ?? ""}</span></div>
                <div class="metric-bar"><div class="bar" style="--bar-fill:${p.modalityBars?.cardinal ?? 46}%; --bar-color:#FFB27A;"></div></div>
              </div>
              <div class="metric-row">
                <div class="metric-label">${modalityGlyph("□", "#9EC5FF")}<span class="metric-name">不動宮</span><span class="metric-count">${p.modalityCounts?.fixed ?? ""}</span></div>
                <div class="metric-bar"><div class="bar" style="--bar-fill:${p.modalityBars?.fixed ?? 64}%; --bar-color:#9EC5FF;"></div></div>
              </div>
              <div class="metric-row">
                <div class="metric-label">${modalityGlyph("◇", "#9FD3A8")}<span class="metric-name">柔軟宮</span><span class="metric-count">${p.modalityCounts?.mutable ?? ""}</span></div>
                <div class="metric-bar"><div class="bar" style="--bar-fill:${p.modalityBars?.mutable ?? 36}%; --bar-color:#9FD3A8;"></div></div>
              </div>
            </div>
          </div>
          <div class="chart-box span-6">
            <div class="card-head">エネルギーの流れ</div>
            <div class="card-sub">ENERGY FLOW</div>
            <div class="card-body text-block">${renderRichText(p.energyFlowText)}</div>
          </div>
        </div>
        <div class="map-grid">
          <div class="chart-box">
            <div class="card-head map-title">支配サイン</div>
            <div class="card-sub">DOMINANT SIGNS</div>
            <div class="card-list">
              ${dominantSignText ? `<div>${escapeHtml(dominantSignText)}</div>` : ""}
            </div>
          </div>
          <div class="chart-box">
            <div class="card-head map-title">支配ハウス</div>
            <div class="card-sub">DOMINANT HOUSES</div>
            <div class="card-list">
              ${dominantHouseText ? `<div>${escapeHtml(dominantHouseText)}</div>` : ""}
            </div>
          </div>
          <div class="chart-box map-block-full">
            ${(p.keyPointsList && p.keyPointsList.length) ? `
            <div class="map-duo">
              <div class="map-duo-col map-duo-col--left">
                <div class="map-duo-head">
                  <div class="card-head map-title">天体分布</div>
                  <div class="card-sub">PLANET DISTRIBUTION</div>
                </div>
                <div class="map-duo-body">
                  <div class="planet-list">
                    ${(p.planetDistributionList || p.planetDistribution || []).map((row) => `<div>${escapeHtml(row)}</div>`).join("")}
                  </div>
                </div>
              </div>
              <div class="map-duo-col map-duo-col--right">
                <div class="map-duo-head">
                  <div class="map-duo-spacer" aria-hidden="true"></div>
                  <div class="card-sub key-points-title">KEY POINTS</div>
                </div>
                <div class="map-duo-body">
                  <div class="key-points-list">
                    ${keyPointRows.map((row) => `<div>${row}</div>`).join("")}
                  </div>
                </div>
              </div>
            </div>
            ` : `
            <div class="card-head map-title">天体分布</div>
            <div class="card-sub">PLANET DISTRIBUTION</div>
            <div class="planet-list">
              ${(p.planetDistributionList || p.planetDistribution || []).map((row) => `<div>${escapeHtml(row)}</div>`).join("")}
            </div>
            `}
          </div>
        </div>
      </div>
      <div class="bottom">
        
      </div>
    </div>
  </section>`;
}

function renderObsPage(ctx) {
  const { renderBg, strongBg, nextPageNumber, escapeHtml, renderRichText, p, PAGE_INTROS, natalWheelMarkup } = ctx;
  return `
  <section class="page page--space page--obs" style="--space-opacity: 0.9;">
    ${renderBg("obs", strongBg)}
    <div class="blueprint-grid"></div>
    ${nextPageNumber()}
    <div class="page-corner">✶</div>
    <div class="slide">
      <div class="top center">
        <div class="label">NATAL WHEEL</div>
        <div class="title">出生ホイール</div>
        <div class="page-intro">${renderPageIntro(PAGE_INTROS.obs, escapeHtml)}</div>
      </div>
      <div class="middle center">
        ${natalWheelMarkup}
      </div>
      <div class="bottom">
        <div class="chart-box full-width">
          <div class="card-head">チャート観測</div>
          <div class="card-sub">CHART OBSERVATION</div>
          <div class="card-body text-block">${renderRichText(p.natalObservation)}</div>
        </div>
      </div>
    </div>
  </section>`;
}

function renderAngPage(ctx) {
  const { nextPageNumber, escapeHtml, renderRichText, p, PAGE_INTROS } = ctx;
  return `
  <section class="page page--pln">
    <div class="blueprint-grid"></div>
    ${nextPageNumber()}
    <div class="page-corner">✦</div>
    <div class="slide">
      <div class="top">
        <div class="label">STAR AXIS</div>
        <div class="title">星の接続軸</div>
        <div class="page-intro">${renderPageIntro(PAGE_INTROS.ang, escapeHtml)}</div>
      </div>
      <div class="middle">
        <div class="ang-grid">
          <div class="chart-box">
            <div class="card-title">ASC<span class="card-meta-inline">${p.angleMetaInlineHtml?.asc || escapeHtml(p.angleMeta?.asc || "")}</span></div>
            <div class="card-role">${escapeHtml(p.angleRoles?.asc || "")}</div>
            <div class="card-body text-block">${renderRichText(p.anglesText?.asc || "")}</div>
          </div>
          <div class="chart-box">
            <div class="card-title">MC<span class="card-meta-inline">${p.angleMetaInlineHtml?.mc || escapeHtml(p.angleMeta?.mc || "")}</span></div>
            <div class="card-role">${escapeHtml(p.angleRoles?.mc || "")}</div>
            <div class="card-body text-block">${renderRichText(p.anglesText?.mc || "")}</div>
          </div>
          <div class="chart-box">
            <div class="card-title">IC<span class="card-meta-inline">${p.angleMetaInlineHtml?.ic || escapeHtml(p.angleMeta?.ic || "")}</span></div>
            <div class="card-role">${escapeHtml(p.angleRoles?.ic || "")}</div>
            <div class="card-body text-block">${renderRichText(p.anglesText?.ic || "")}</div>
          </div>
          <div class="chart-box">
            <div class="card-title">DC<span class="card-meta-inline">${p.angleMetaInlineHtml?.dc || escapeHtml(p.angleMeta?.dc || "")}</span></div>
            <div class="card-role">${escapeHtml(p.angleRoles?.dc || "")}</div>
            <div class="card-body text-block">${renderRichText(p.anglesText?.dc || "")}</div>
          </div>
        </div>
      </div>
      <div class="bottom"></div>
    </div>
  </section>`;
}

function renderPlnPages(ctx) {
  const { plnPages, nextPageNumber, escapeHtml, PAGE_INTROS } = ctx;
  return plnPages.map((page, idx) => {
    const suffix = idx === 0 ? "" : idx === 1 ? "B" : "C";
    return `
  <section class="page page--pln">
    <div class="blueprint-grid"></div>
    ${nextPageNumber()}
    <div class="page-corner">✧</div>
    <div class="slide">
      <div class="top">
        <div class="label">PLANET ROLES</div>
        <div class="title">星の役割</div>
        <div class="page-intro">${renderPageIntro(PAGE_INTROS.pln, escapeHtml)}</div>
      </div>
      <div class="middle">
        <div style="width:100%;">
          <div class="pln-grid">
            ${page.blocks.map((block) => block.html).join("\n")}
          </div>
        </div>
      </div>
      <div class="bottom"></div>
    </div>
  </section>`;
  }).join("\n");
}

function renderLayPages(ctx) {
  const { layPages, nextPageNumber, escapeHtml, PAGE_INTROS } = ctx;
  return layPages.map((page) => `
  <section class="page">
    <div class="blueprint-grid"></div>
    ${nextPageNumber()}
    <div class="page-corner">✦</div>
    <div class="slide">
      <div class="top">
        <div class="label">STAR LAYERS</div>
        <div class="title">星のレイヤー</div>
        <div class="page-intro">${renderPageIntro(PAGE_INTROS.lay, escapeHtml)}</div>
      </div>
      <div class="middle">
        <div class="lay-grid">
          ${page.blocks.map((block) => block.html).join("\n")}
        </div>
      </div>
      <div class="bottom"></div>
    </div>
  </section>`).join("\n");
}

function renderDepPages(ctx) {
  const { depPages, nextPageNumber, escapeHtml, PAGE_INTROS } = ctx;
  return depPages.map((page) => `
  <section class="page page--dep">
    <div class="blueprint-grid"></div>
    ${nextPageNumber()}
    <div class="page-corner">✶</div>
    <div class="slide">
      <div class="top">
        <div class="label">DEEP AXIS</div>
        <div class="title">深層の軸</div>
        <div class="page-intro">${renderPageIntro(PAGE_INTROS.dep, escapeHtml)}</div>
      </div>
      <div class="middle">
        <div class="dep-grid">
          ${page.blocks.map((block) => block.html).join("\n")}
        </div>
      </div>
      <div class="bottom"></div>
    </div>
  </section>`).join("\n");
}

function renderAspPages(ctx) {
  const { renderBg, midBg, buildAspectSvg, aspPages, nextPageNumber, escapeHtml, PAGE_INTROS } = ctx;
  return aspPages.map((page) => `
  <section class="page page--medium page--aspect" style="--space-opacity: 0.6;">
    ${renderBg("asp", midBg)}
    <div class="blueprint-grid"></div>
    ${nextPageNumber()}
    <div class="page-corner">✧</div>
    <div class="slide">
      <div class="top">
        <div class="label">ASPECT NETWORK</div>
        <div class="title">星の関係</div>
        <div class="page-intro">${renderPageIntro(PAGE_INTROS.asp, escapeHtml)}</div>
      </div>
      <div class="middle">
        <div class="chart-box aspect-box" style="width: 100%; display:flex; flex-direction:column; align-items:center;">
          <div class="aspect-holder">
            ${buildAspectSvg() || `<div class="aspect-wheel"><div class="aspect-lines"></div></div>`}
          </div>
        </div>
      </div>
      <div class="bottom">
        <div class="asp-footer-stack">
          ${page.blocks.map((block) => block.html).join("\n")}
        </div>
      </div>
    </div>
  </section>`).join("\n");
}

function renderPatPage(ctx) {
  const { renderBg, strongBg, nextPageNumber, escapeHtml, renderRichText, p, PAGE_INTROS } = ctx;
  return `
  <section class="page page--space page--pat" style="--space-opacity: 0.9;">
    ${renderBg("pat", strongBg)}
    <div class="blueprint-grid"></div>
    ${nextPageNumber()}
    <div class="page-corner">✦</div>
    <div class="slide">
      <div class="top">
        <div class="label">STAR PATTERN</div>
        <div class="title">星のパターン</div>
        <div class="page-intro">${renderPageIntro(PAGE_INTROS.pat, escapeHtml)}</div>
      </div>
      <div class="middle">
        <div class="pat-grid">
          <div class="chart-box pat-name">
            <div class="card-head">パターン名</div>
            <div class="card-sub">PATTERN NAME</div>
            <div class="card-body text-block">${renderRichText(p.patternName)}</div>
          </div>
        </div>
      </div>
      <div class="bottom">
        <div class="chart-box full-width pat-summary">
          <div class="card-head">構造まとめ</div>
          <div class="card-sub">STRUCTURE SUMMARY</div>
          <div class="card-body text-block">${renderRichText(p.closingSummary)}</div>
        </div>
        <div class="subtext pat-footnote">This chart is a living system.</div>
      </div>
    </div>
  </section>`;
}

module.exports = {
  renderSysPage,
  renderMapPage,
  renderObsPage,
  renderAngPage,
  renderPlnPages,
  renderLayPages,
  renderDepPages,
  renderAspPages,
  renderPatPage,
};
