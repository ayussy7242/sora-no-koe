"use strict";

const path = require("path");
const { PAGE_WIDTH, PAGE_HEIGHT } = require("./constants");

function buildFontFaceCss() {
  const fontDir = path.resolve(__dirname, "..", "..", "..", "..", "assets", "fonts");
  const shipp = path.join(fontDir, "ShipporiMincho-Regular.ttf");
  const shippBold = path.join(fontDir, "ShipporiMincho-Bold.ttf");
  const zen = path.join(fontDir, "ZenKakuGothicNew-Regular.ttf");
  const zenMed = path.join(fontDir, "ZenKakuGothicNew-Medium.ttf");
  const zenBold = path.join(fontDir, "ZenKakuGothicNew-Bold.ttf");
  const notoSymbols = path.join(fontDir, "NotoSansSymbols-Regular.ttf");
  const notoSymbols2 = path.join(fontDir, "NotoSansSymbols2-Regular.ttf");
  const symbola = path.join(fontDir, "Symbola_hint.ttf");

  const toFileUrl = (p) => `file://${p}`;
  return [
    `@font-face { font-family: 'Shippori Mincho'; src: url('${toFileUrl(shipp)}') format('truetype'); font-weight: 400; font-style: normal; }`,
    `@font-face { font-family: 'Shippori Mincho'; src: url('${toFileUrl(shippBold)}') format('truetype'); font-weight: 700; font-style: normal; }`,
    `@font-face { font-family: 'Zen Kaku Gothic'; src: url('${toFileUrl(zen)}') format('truetype'); font-weight: 400; font-style: normal; }`,
    `@font-face { font-family: 'Zen Kaku Gothic'; src: url('${toFileUrl(zenMed)}') format('truetype'); font-weight: 500; font-style: normal; }`,
    `@font-face { font-family: 'Zen Kaku Gothic'; src: url('${toFileUrl(zenBold)}') format('truetype'); font-weight: 700; font-style: normal; }`,
    `@font-face { font-family: 'Noto Symbols'; src: url('${toFileUrl(notoSymbols)}') format('truetype'); font-weight: 400; font-style: normal; }`,
    `@font-face { font-family: 'Noto Symbols 2'; src: url('${toFileUrl(notoSymbols2)}') format('truetype'); font-weight: 400; font-style: normal; }`,
    `@font-face { font-family: 'Symbola'; src: url('${toFileUrl(symbola)}') format('truetype'); font-weight: 400; font-style: normal; }`,
  ].join("\n");
}

function buildBlueprintCss() {
  return `
${buildFontFaceCss()}

:root {
  --bg: #14162B;
  --card: #1C1F3A;
  --text: #EDEEFF;
  --muted: #B9BDD9;
  --line: #EDEEFF40;
  --space-veil: rgba(20, 22, 43, 0.08);
  --space-opacity: 0.2;
  --space-1: 24px;
  --space-2: 48px;
  --space-3: 72px;
  --space-4: 96px;
  --page-margin-bump: 10px;
  --page-margin-x: calc((var(--space-4) + var(--page-margin-bump)) * 0.65);
  --page-margin-top: calc((90px + var(--page-margin-bump)) * 0.8);
  --page-margin-bottom: calc((110px + var(--page-margin-bump)) * 0.8);
  --section-gap: var(--space-3);
  --card-gap: var(--space-2);
  --column-gap: 40px;
  --card-padding: var(--space-2);
  --nav-gap: 80px;
  --content-max: 888px;
  --ui: 1.815;
  --title-scale: 1.5;
  --fs-bump: 3px;
  --fs-title: calc(24px * var(--ui) * var(--title-scale));
  --fs-label: calc(14px * var(--ui) - 2px);
  --fs-body: calc(13.4px * var(--ui));
  --fs-sub: calc(9.9px * var(--ui));
  --fs-sub-label: calc(13.2px * var(--ui));
  --fs-card-head: calc(16px * var(--ui) * var(--title-scale));
  --fs-card-title: calc(16px * var(--ui) * var(--title-scale));
  --fs-card-meta: calc(10.2px * var(--ui));
  --fs-card-text: calc(13.4px * var(--ui));
  --fs-card-list: calc(13px * var(--ui));
  --fs-body-text: calc(var(--fs-body) + var(--fs-bump) + 2px);
  --lh-body-text: calc(1.72em + 3px);
  --metric-label-width: 160px;
  --lh-sub-label: 1.5;
  --ls-sub-label: 0.01em;
  --fs-tag: calc(12px * var(--ui));
  --ls-title: 0.04em;
  --ls-sub: 0.08em;
}

* { box-sizing: border-box; }
html, body { margin: 0; padding: 0; }
body {
  font-family: 'Zen Kaku Gothic', sans-serif;
  color: var(--text);
  background: var(--bg);
  text-align: justify;
}

.page {
  position: relative;
  width: ${PAGE_WIDTH}px;
  height: ${PAGE_HEIGHT}px;
  margin: 0 auto;
  page-break-after: always;
  overflow: hidden;
  background: var(--bg);
}

.bg-space {
  position: absolute;
  inset: 0;
  z-index: 0;
}

.bg-img {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
  z-index: 0;
}

.bg-space::after {
  content: '';
  position: absolute;
  inset: 0;
  background: var(--space-veil);
}

.bg-space__svg {
  width: 100%;
  height: 100%;
  display: block;
  opacity: var(--space-opacity);
}

.page--space .bg-space__svg { opacity: 0.85; }
.page--medium .bg-space__svg { opacity: 0.6; }

.blueprint-grid {
  display: none;
}

.slide {
  position: relative;
  z-index: 2;
  height: 100%;
  display: grid;
  grid-template-rows: auto auto 1fr;
  align-content: start;
  padding: var(--page-margin-top) var(--page-margin-x) var(--page-margin-bottom);
  row-gap: calc(var(--section-gap) * 0.33);
}

.top {
  display: flex;
  flex-direction: column;
  justify-content: flex-start;
  gap: 0;
  width: 100%;
  max-width: min(100%, var(--content-max));
  margin: 0;
  align-self: flex-start;
}

.top.center {
  align-self: center;
  margin-left: auto;
  margin-right: auto;
  text-align: center;
}

.label {
  font-size: calc(var(--fs-label) + var(--fs-bump));
  letter-spacing: var(--ls-sub);
  text-transform: uppercase;
  color: var(--muted);
  line-height: 1.6;
}

.title {
  font-family: 'Shippori Mincho', serif;
  font-size: calc(var(--fs-title) + var(--fs-bump));
  letter-spacing: var(--ls-title);
  line-height: 1.69;
}

.middle {
  display: flex;
  align-items: flex-start;
  justify-content: center;
  gap: 20px;
  align-self: stretch;
  width: 100%;
  max-width: var(--content-max);
  margin: 0;
}

.bottom {
  display: flex;
  flex-direction: column;
  justify-content: flex-start;
  gap: 12px;
  align-self: stretch;
  width: 100%;
  max-width: var(--content-max);
  margin: 0;
  padding-bottom: var(--nav-gap);
}

.grid-6 {
  display: grid;
  grid-template-columns: repeat(6, 1fr);
  gap: var(--card-gap);
  width: 100%;
  align-items: start;
}

.span-6 { grid-column: span 6; }
.span-3 { grid-column: span 3; }
.span-2 { grid-column: span 2; }

.sys-grid {
  display: grid;
  grid-template-columns: repeat(6, 1fr);
  gap: var(--card-gap);
  width: 100%;
}

.sys-grid-2 {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: var(--card-gap);
  width: 100%;
}

.sys-grid-2 .span-2 {
  grid-column: span 2;
}

.map-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  row-gap: var(--card-gap);
  column-gap: var(--column-gap);
  width: 100%;
}

.str-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  row-gap: var(--card-gap);
  column-gap: var(--column-gap);
  width: 100%;
}

.str-stack {
  display: grid;
  grid-template-columns: 1fr;
  gap: var(--card-gap);
  width: 100%;
}

.pln-grid {
  display: grid;
  grid-template-columns: 1fr;
  row-gap: var(--card-gap);
  column-gap: var(--column-gap);
  width: 100%;
}

.ang-grid {
  display: grid;
  grid-template-columns: 1fr;
  row-gap: var(--card-gap);
  column-gap: var(--column-gap);
  width: 100%;
}

.lay-grid {
  display: grid;
  grid-template-columns: 1fr;
  gap: var(--card-gap);
  width: 100%;
}

.dep-grid {
  display: grid;
  grid-template-columns: 1fr;
  gap: var(--card-gap);
  width: 100%;
}

.asp-footer-grid {
  display: grid;
  grid-template-columns: 1fr;
  gap: var(--card-gap);
  width: 100%;
}

.asp-footer-row {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: var(--column-gap);
}

.pat-grid {
  display: grid;
  grid-template-columns: 1fr;
  gap: var(--card-gap);
  width: 100%;
}

.text {
  font-size: var(--fs-body-text);
  line-height: var(--lh-body-text);
  color: var(--text);
}

.subtext {
  font-size: calc(var(--fs-sub) + var(--fs-bump));
  line-height: 2.28;
  color: var(--muted);
}

.title-en {
  font-size: calc(var(--fs-title) * 0.42 + var(--fs-bump));
  letter-spacing: var(--ls-sub);
  color: var(--muted);
}

.sys-title-en {
  letter-spacing: 0.22em;
  opacity: 0.75;
}

.sys-owner {
  margin-top: 36px;
  font-size: calc(var(--fs-body) + 2px + var(--fs-bump));
  letter-spacing: 0.04em;
}

.sys-birth {
  margin-top: 0;
  line-height: 2;
  margin-bottom: 48px;
  letter-spacing: 0.08em;
  font-size: calc(var(--fs-body) + 4px + var(--fs-bump));
}

.sys-signline {
  margin-bottom: 0;
}

.page-intro {
  font-size: calc(15px * var(--ui) + var(--fs-bump));
  opacity: 0.7;
  margin-top: 10px;
  margin-bottom: 16px;
  letter-spacing: 0.02em;
  line-height: 1.6;
}

.page-number {
  position: absolute;
  bottom: 64px;
  right: 32px;
  opacity: 0.4;
  font-size: calc(12px + var(--fs-bump));
  letter-spacing: 0.2em;
}

.page-corner {
  position: absolute;
  top: 28px;
  right: 28px;
  opacity: 0.2;
  font-size: calc(16px + var(--fs-bump));
}

.tagline {
  font-size: calc(16px * var(--ui) * 0.95 + var(--fs-bump));
  letter-spacing: 0.06em;
  color: var(--muted);
  margin-top: 10px;
}

.angles-intro {
  margin-top: 18px;
  font-size: calc(var(--fs-body) + var(--fs-bump));
  line-height: 1.75;
  color: var(--text);
}

.section-divider {
  width: 100%;
  height: 1px;
  background: var(--line);
  margin: 18px 0 18px;
}

.axis-mini {
  margin-top: 10px;
  font-size: calc(var(--fs-sub) + var(--fs-bump));
  letter-spacing: 0.04em;
  color: var(--muted);
}

.chart-box {
  width: 100%;
  border: none;
  border-left: 2px solid var(--line);
  border-radius: 0;
  padding: 0 0 0 28px;
  background: transparent;
}

.wheel {
  width: 760px;
  height: 760px;
  border: 1px solid var(--line);
  border-radius: 50%;
  box-shadow: 0 0 48px rgba(255,255,255,0.2);
}

.wheel.cover { width: 820px; height: 820px; }
.wheel.medium { width: 660px; height: 660px; }

.wheel-svg {
  width: 110%;
  max-width: 1080px;
  aspect-ratio: 1 / 1;
}

.wheel-svg svg {
  width: 100%;
  height: 100%;
  display: block;
}

.page--obs .middle {
  margin-top: -30px;
}

.page--map .slide {
  row-gap: calc(var(--section-gap) * 0.5);
}

.page--map .middle {
  display: block;
}

.page--map .bottom {
  margin-top: 0;
}

.page--map .bottom .text-block {
  max-width: 100%;
}

.map-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 28px;
  margin-top: 28px;
}

.map-grid .chart-box {
  min-width: 0;
}

.map-block-full {
  grid-column: 1 / -1;
  margin-bottom: 0;
}

.map-title {
  white-space: nowrap;
  letter-spacing: 0.08em;
}

.map-duo {
  display: grid;
  grid-template-columns: 1.05fr 0.95fr;
  gap: 46px;
  align-items: start;
}

.map-duo-col--right {
  padding-left: 6px;
}

.map-duo-head {
  display: grid;
  gap: 4px;
}

.map-duo-spacer {
  height: calc(var(--fs-card-head) * 1.78);
}

.map-duo-body {
  margin-top: var(--space-1);
}

.planet-list {
  display: grid;
  grid-template-columns: max-content max-content;
  row-gap: 18px;
  column-gap: 42px;
  justify-content: start;
}

.key-points-title {
  font-size: calc(var(--fs-card-meta) * 0.95 + var(--fs-bump));
  letter-spacing: 0.14em;
  color: var(--muted);
}

.key-points-list {
  display: grid;
  gap: 18px;
}

.planet-list,
.key-points-list {
  font-size: calc(var(--fs-card-text) * 0.78 + var(--fs-bump));
  line-height: 1.7;
  font-family: 'Zen Kaku Gothic', 'Noto Symbols 2', 'Noto Symbols', 'Symbola', sans-serif;
}

.key-points-list .glyph {
  font-family: "Noto Sans Symbols 2","Noto Sans Symbols","Symbola","Apple Symbols","Segoe UI Symbol",sans-serif;
  margin-right: 4px;
  font-weight: 400;
}

.bar-list {
  width: 100%;
  display: grid;
  gap: 10px;
}

.metric-row {
  display: grid;
  grid-template-columns: var(--metric-label-width) 1fr;
  column-gap: 8px;
  align-items: center;
}

.bar-list--element .metric-row {
  column-gap: 0;
}

.bar-list--modality .metric-row {
  column-gap: 24px;
}

.metric-label {
  min-width: 0;
  white-space: nowrap;
  padding-right: 0;
  font-size: var(--fs-body-text);
  line-height: 1.5;
  display: flex;
  align-items: center;
  gap: 6px;
  justify-content: flex-start;
}

.astro-symbol {
  font-family: 'Noto Sans Symbols 2', 'Noto Sans Symbols', 'Symbola', 'Apple Symbols', 'Segoe UI Symbol', sans-serif;
  margin-right: 2px;
  display: inline-block;
}

.metric-count {
  margin-left: 0;
  opacity: 0.95;
  padding-right: 0;
  min-width: 28px;
  text-align: right;
}

.metric-bar {
  flex: 1;
  margin-left: 0;
}

.bar {
  height: 14px;
  border-radius: 999px;
  background: rgba(237,238,255,0.12);
  position: relative;
  overflow: hidden;
}

.bar::after {
  content: '';
  position: absolute;
  left: 0;
  top: 0;
  bottom: 0;
  width: var(--bar-fill, 62%);
  background: var(--bar-color, #9EC5FF);
  border-radius: inherit;
}

.card-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 16px;
  width: 100%;
}

.planet-section {
  display: grid;
  gap: 12px;
}

.planet-group-row {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  margin-bottom: 12px;
}

.planet-group {
  font-size: calc(var(--fs-tag) + var(--fs-bump));
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--muted);
  border-bottom: 1px solid var(--line);
  padding-bottom: 6px;
}

.planet-section-title {
  font-size: calc(20px + var(--fs-bump));
  letter-spacing: 0.02em;
  color: var(--text);
  font-weight: 600;
}

.card-meta-inline {
  margin-left: 12px;
}

.planet-section-sub {
  font-size: calc(11px + var(--fs-bump));
  letter-spacing: 0.2em;
  text-transform: uppercase;
  color: var(--muted);
}

.planet-section-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 16px;
}

.dashboard {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 16px;
  width: 100%;
}

.dashboard .span-2 { grid-column: span 2; }

.sys-panels {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 12px;
  width: 100%;
}

.signature {
  border-top: 1px solid var(--line);
  padding-top: 12px;
}

.card {
  border: none;
  border-left: 2px solid var(--line);
  border-radius: 0;
  padding: 0 0 0 28px;
  background: transparent;
}

.card-title {
  font-size: calc(var(--fs-card-title) + var(--fs-bump));
  font-weight: 600;
  margin-bottom: 2px;
  display: flex;
  align-items: center;
  gap: 10px;
}
.card-meta {
  font-size: calc(var(--fs-sub-label) + var(--fs-bump));
  line-height: var(--lh-sub-label);
  letter-spacing: var(--ls-sub-label);
  color: var(--muted);
  margin-top: 6px;
}
.card-text { font-size: var(--fs-body-text); line-height: var(--lh-body-text); margin-top: 8px; color: var(--text); }


.page--dep .card-head-line {
  display: flex;
  align-items: baseline;
  gap: 12px;
  flex-wrap: wrap;
}

.page--dep .card-head-line .card-meta {
  margin-top: 0;
  font-size: calc(var(--fs-card-title) * 0.8 + var(--fs-bump));
  color: var(--muted);
  font-weight: 500;
}
.card-meta-inline {
  font-size: calc(var(--fs-sub-label) + 4px + var(--fs-bump));
  line-height: var(--lh-sub-label);
  letter-spacing: var(--ls-sub-label);
  color: var(--muted);
  font-weight: 500;
}

.zodiac-glyph {
  font-size: calc(var(--fs-sub-label) + 4px + var(--fs-bump));
  line-height: 1;
  vertical-align: -0em;
  margin-right: 2px;
}

.card-role {
  margin: 6px 0 10px;
  font-size: calc(var(--fs-sub-label) + var(--fs-bump));
  line-height: var(--lh-sub-label);
  color: var(--muted);
  opacity: 0.72;
  letter-spacing: var(--ls-sub-label);
}

.card-head {
  font-size: calc(var(--fs-card-head) + var(--fs-bump));
  letter-spacing: var(--ls-title);
  color: var(--text);
  font-weight: 600;
  line-height: 1.69;
}

.card-head .glyph {
  font-family: "Noto Sans Symbols 2","Segoe UI Symbol","Apple Symbols","Symbola",sans-serif;
  font-weight: 400;
  margin-right: 6px;
}

.glyph-img {
  width: 1em;
  height: 1em;
  display: inline-block;
  vertical-align: -0.12em;
  margin-right: 6px;
}

.glyph-img--head {
  width: 1.1em;
  height: 1.1em;
  margin-right: 8px;
}

.glyph-img--axis {
  margin-right: 6px;
}

.node-axis-line {
  margin-top: 6px;
  font-size: calc(var(--fs-body) * 0.88 + var(--fs-bump));
  color: var(--text);
  letter-spacing: 0.01em;
}

.node-axis-summary {
  margin-top: 4px;
  font-size: calc(var(--fs-sub-label) + var(--fs-bump));
  line-height: var(--lh-sub-label);
  color: var(--muted);
  letter-spacing: var(--ls-sub-label);
}

.card-head::after,
.planet-section-title::after {
  content: "";
  display: block;
  width: 60px;
  height: 1px;
  margin-top: 6px;
  background: rgba(255,255,255,0.35);
}

.card-sub {
  font-size: calc(var(--fs-sub-label) - 2px + var(--fs-bump));
  letter-spacing: var(--ls-sub-label);
  line-height: var(--lh-sub-label);
  text-transform: uppercase;
  color: var(--muted);
  opacity: 0.75;
  margin-top: 8px;
  white-space: nowrap;
}

.card-body {
  font-size: var(--fs-body-text);
  line-height: var(--lh-body-text);
  margin-top: var(--space-1);
  color: var(--text);
}


.full-width .text-block,
.full-width.text-block {
  max-width: 100%;
}


.page--ang .chart-box.full-width {
  width: 100%;
}


.text-block p,
.card-body p,
.card-text p {
  margin: 0 0 10px;
  line-height: var(--lh-body-text);
}

.text-block p:last-child,
.card-body p:last-child,
.card-text p:last-child {
  margin-bottom: 0;
}

.card-list {
  margin-top: var(--space-1);
  display: grid;
  gap: 6px;
  font-size: var(--fs-body-text);
}

.card-list.inline {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  font-size: calc(16px + 2px + var(--fs-bump));
  opacity: 0.8;
}

.card-list.inline > div::after {
  content: "ー";
  margin: 0 8px;
  color: var(--muted);
}

.aspect-list {
  list-style: disc;
  padding-left: 18px;
  margin: 0;
  display: grid;
  gap: 16px;
}

.aspect-list li {
  margin: 0;
}

.card-list.inline > div:last-child::after {
  content: "";
  margin: 0;
}

.card-meta {
  margin-top: 6px;
  margin-bottom: 10px;
}

.angular-block {
  margin-top: 12px;
  padding-top: 8px;
  border-top: 1px solid rgba(237,238,255,0.12);
}

.axis-mini {
  margin-top: 12px;
  font-size: calc(var(--fs-tag) + var(--fs-bump));
  color: var(--muted);
}

.axis-mini-diagram {
  display: grid;
  grid-template-columns: auto 1fr auto;
  gap: 8px;
  align-items: center;
  margin-top: 6px;
  font-size: calc(var(--fs-tag) + var(--fs-bump));
  color: var(--muted);
}


.tag-row { display: flex; flex-wrap: wrap; gap: 10px; }
.tag {
  font-size: calc(var(--fs-tag) + var(--fs-bump));
  padding: 6px 14px;
  border-radius: 999px;
  background: rgba(237,238,255,0.12);
  color: var(--text);
  letter-spacing: 0.02em;
}

.astro-symbol {
  font-family: 'Noto Symbols 2', 'Noto Symbols', 'Symbola', 'Zen Kaku Gothic', sans-serif;
  margin-right: 6px;
}

.aspect-wheel {
  width: 592px;
  height: 592px;
  border: 1px solid var(--line);
  border-radius: 50%;
  position: relative;
}

.aspect-svg {
  width: 592px;
  height: 592px;
}

.aspect-wheel::before,
.aspect-wheel::after {
  content: '';
  position: absolute;
  inset: 12%;
  border: 1px dashed rgba(237,238,255,0.3);
  border-radius: 50%;
}

.aspect-wheel::after { inset: 30%; }

.aspect-lines {
  position: absolute;
  inset: 18%;
  border-top: 1px solid rgba(237,238,255,0.4);
  border-left: 1px solid rgba(237,238,255,0.4);
  transform: rotate(24deg);
}

.aspect-holder {
  transform: none;
}

.aspect-svg {
  width: 592px;
  height: 592px;
}

.asp-footer-stack {
  display: grid;
  grid-template-columns: 1fr;
  gap: 18px;
}

.asp-footer-stack .card-body.text-block {
  font-size: calc(var(--fs-body) - 1px + var(--fs-bump));
}

.page--aspect .card-body {
  white-space: normal;
  word-break: break-word;
}

.page--pln .slide {
  row-gap: calc(var(--section-gap) * 0.5);
}

.page--pln .top {
  gap: 4px;
}


.page--ang .bottom .text-block {
  max-width: 100%;
}

.page--pat .pat-grid .text-block {
  max-width: 100%;
}

.page--pat .pat-summary {
  margin-top: 32px;
}

.page--pat .pat-footnote {
  margin-top: 0;
  font-size: calc(var(--fs-sub) * 1.35 + var(--fs-bump));
  opacity: 0.6;
}

.page--pat .subtext {
  font-size: calc(var(--fs-sub) + 12px + var(--fs-bump));
  line-height: 6;
  margin-top: 0;
}

.page--pat .slide {
  padding-top: calc(var(--page-margin-top) + 12px);
  padding-bottom: calc(var(--page-margin-bottom) + 12px);
  row-gap: calc(var(--section-gap) * 1.1);
  text-align: center;
}

.page--pat .top .title {
  margin-bottom: 8px;
}

.page--pat .pat-name {
  margin-bottom: 24px;
}

.page--pat .pat-summary .card-body {
  margin-top: calc(var(--space-1) + 12px);
  line-height: calc(var(--lh-body-text) + 4px);
}

.page--pat .pat-summary .text-block {
  max-width: 90%;
  margin: 42px 0 0 66px;
  text-align: justify;
}

.page--pat .chart-box {
  border-left: none;
  padding-left: 0;
}

.page--pat .card-head::after {
  margin-left: auto;
  margin-right: auto;
}

.asp-energy {
  margin-top: 34px;
}


.node-meta {
  margin-bottom: 36px;
}

.node-body {
  margin-top: 0;
}

.axis-node {
  position: absolute;
  top: -28px;
  width: 54px;
  height: 54px;
  border-radius: 50%;
  background: #EDEEFF;
  border: 2px solid #EDEEFF;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: calc(38px + var(--fs-bump));
  line-height: 1;
  padding-bottom: 2px;
  color: #14162B;
}

.axis-node.left { left: 10%; }
.axis-node.right { right: 10%; }

.axis-arrow {
  display: none;
}

.star-nav {
  display: flex;
  justify-content: center;
  gap: 8px;
  font-size: calc(16px + var(--fs-bump));
  letter-spacing: 0.3em;
  color: rgba(237,238,255,0.5);
  position: absolute;
  left: 0;
  right: 0;
  bottom: calc(var(--page-margin-bottom) + 20px);
}

.nav-dot.active { color: #ffffff; }

.coordinate {
  position: absolute;
  top: 16px;
  right: 24px;
  font-size: calc(14px + var(--fs-bump));
  letter-spacing: 0.2em;
  color: var(--muted);
}

.sys-header {
  position: absolute;
  top: 90px;
  left: 72px;
  right: 72px;
}

.sys-core {
  position: absolute;
  top: 320px;
  left: 72px;
  right: 72px;
}

.sys-focus {
  position: absolute;
  top: 520px;
  left: 72px;
  right: 72px;
}

.sys-sub {
  position: absolute;
  top: 720px;
  left: 72px;
  right: 72px;
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 20px;
}

.sys-traits {
  position: absolute;
  top: 980px;
  left: 72px;
  right: 72px;
}

.sys-signature {
  position: absolute;
  top: 1240px;
  left: 72px;
  right: 72px;
}


.center { text-align: center; }

.cover-title {
  font-family: 'Shippori Mincho', serif;
  font-size: calc(24px + var(--fs-bump));
  letter-spacing: 0.01em;
}

.cover-title-en {
  font-family: 'Shippori Mincho', serif;
  font-size: calc(11px + var(--fs-bump));
  letter-spacing: 1.6px;
  color: var(--muted);
}

.cover-meta {
  font-size: calc(16px + var(--fs-bump));
  color: var(--text);
}

.cover-label {
  font-size: calc(11px + var(--fs-bump));
  letter-spacing: 1.6px;
  text-transform: uppercase;
  color: var(--muted);
}

.cover-card {
  border: 1px solid var(--line);
  background: var(--card);
  border-radius: 12px;
  padding: 22px;
  display: grid;
  gap: 18px;
}

.cover-divider {
  border-top: 1px solid var(--line);
  margin: 4px 0;
}

.cover-section-title {
  font-size: calc(16px + var(--fs-bump));
  letter-spacing: 0.01em;
  color: var(--muted);
  margin-bottom: 6px;
}

.cover-lines {
  display: grid;
  gap: 6px;
  font-size: calc(14px + var(--fs-bump));
  color: var(--text);
}

.cover-en {
  font-size: calc(10px + var(--fs-bump));
  letter-spacing: 1.6px;
  color: var(--muted);
  text-transform: uppercase;
}
  `;
}

module.exports = { buildBlueprintCss };
