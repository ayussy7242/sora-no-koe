"use strict";

/**
 * channels/x.js
 * - X（短文） v3.3.6 相当：空の配置 + dist(なう惑星) + 余韻 + close
 *
 * deps:
 * - getUserId, pickStable
 * - fmt(formatSkyLineX/formatYoinForX/buildYoinBlocks)
 * - pickCenterPublicContact, pickSecretPublicContact
 * - buildYoinLine, buildYoinGlobal
 * - buildNowModernPlanetCounts, buildDistLinesFromcounts
 * - pickCloseLines
 * - RENDER_COPY
 * - fmtAnyJa, publicSignJa, fmtAspectJa, fmtDeg
 */

function renderX(story, deps = {}) {
  const {
    getUserId,
    pickStable,
    fmt,
    pickCenterPublicContact,
    pickSecretPublicContact,
    buildYoinLine,
    buildYoinGlobal,
    buildNowModernPlanetCounts,
    buildDistLinesFromcounts,
    pickCloseLines,
    RENDER_COPY,
    fmtAnyJa,
    publicSignJa,
    fmtAspectJa,
    fmtDeg,
  } = deps || {};

  const dateLabel = String(story?.meta?.date_local || "").replace(/-/g, ".");
  const moonSignJa = story?.public?.moon?.sign_ja || "";

  const userSeed = typeof getUserId === "function" ? getUserId(story) : "u_unknown";
  const seedBase = `${story?.meta?.date_local || dateLabel}|${userSeed}`;

  const yoinPack =
    typeof fmt?.buildYoinBlocks === "function"
      ? fmt.buildYoinBlocks(
          story,
          { channel: "x", seedBase: `${seedBase}|yoin` },
          { buildYoinLine, buildYoinGlobal, RENDER_COPY, pickStable }
        )
      : { xYoinLine: typeof buildYoinLine === "function" ? buildYoinLine(story) : "" };

  const center = typeof pickCenterPublicContact === "function" ? pickCenterPublicContact(story, deps) : null;
  const secret = typeof pickSecretPublicContact === "function" ? pickSecretPublicContact(story, deps) : null;

  const main1 = center && typeof fmt?.formatSkyLineX === "function"
    ? fmt.formatSkyLineX(story, center, "☄️", { fmtAnyJa, publicSignJa, fmtAspectJa, fmtDeg })
    : "";
  const main2 = secret && typeof fmt?.formatSkyLineX === "function"
    ? fmt.formatSkyLineX(story, secret, "🪐", { fmtAnyJa, publicSignJa, fmtAspectJa, fmtDeg })
    : "";

  const yoin = typeof fmt?.formatYoinForX === "function"
    ? fmt.formatYoinForX(yoinPack?.xYoinLine)
    : String(yoinPack?.xYoinLine || "");

  const distShort =
    typeof buildDistLinesFromcounts === "function" && typeof buildNowModernPlanetCounts === "function"
      ? buildDistLinesFromcounts(buildNowModernPlanetCounts(story), { forX: true })
      : "";

  const closeLines = typeof pickCloseLines === "function"
    ? pickCloseLines(RENDER_COPY, story, { seedBase, pickStable })
    : [];

  const footer = String(RENDER_COPY?.FOOTER_X || "星は語る。🌎🛸").trim();
  const closeArr = (Array.isArray(closeLines) ? closeLines : [String(closeLines || "")])
    .map((l) => String(l || "").trim())
    .filter(Boolean)
    .filter((l) => l !== footer);

  const MAX = 270;

  function build({ keepSecond, keepYoin, keepClose, keepDist }) {
    const lines = [];
    lines.push(`🌌 ${dateLabel}｜空の配置`);
    lines.push("");

    if (moonSignJa) lines.push(`🌙月：${moonSignJa}`);
    lines.push("");

    if (main1) lines.push(main1);
    if (keepSecond && main2) {
      lines.push("");
      lines.push(main2);
    }

    if (keepDist && distShort) {
      lines.push("");
      lines.push(distShort);
    }

    if (keepYoin && yoin) {
      lines.push("");
      yoin.split("\n").forEach((l) => lines.push(l));
    }

    if (keepClose && closeArr.length) {
      lines.push("");
      lines.push(...closeArr);
    }

    lines.push("");
    lines.push(footer);

    return lines.join("\n").replace(/\n{3,}/g, "\n\n").trim();
  }

  const variants = [
    { keepSecond: true, keepYoin: true, keepClose: true, keepDist: true },
    { keepSecond: false, keepYoin: true, keepClose: true, keepDist: true },
    { keepSecond: false, keepYoin: true, keepClose: false, keepDist: true },
    { keepSecond: false, keepYoin: true, keepClose: false, keepDist: false },
    { keepSecond: false, keepYoin: false, keepClose: true, keepDist: false },
    { keepSecond: false, keepYoin: false, keepClose: false, keepDist: false },
  ];

  let text = "";
  for (const v of variants) {
    text = build(v);
    if (text.length <= MAX) break;
  }
  if (text.length > MAX) text = text.slice(0, MAX - 1) + "…";
  return text;
}

module.exports = { renderX };
