//render.js

"use strict";

function createRenderers({ BODY_JA, POINT_JA, ASPECT_JA }) {
  function fmtAspectJa(aspect) { return ASPECT_JA[aspect] || aspect; }
  function fmtBodyJa(body) { return BODY_JA[body] || body; }
  function fmtPointJa(p) { return POINT_JA[p] || p; }

  function renderLine(story) {
    const dateLabel = String(story?.meta?.date_local || "").replaceAll("-", ".");
    const top = story?.personal?.touch_points_top3 || [];
    const moonSign = story?.public?.moon?.sign_ja || null;

    const circ = ["①", "②", "③"];
    const lines = top.slice(0, 3).map((r, i) => {
      const t = fmtBodyJa(r.transit_body);
      const n = fmtPointJa(r.natal_body_or_point);
      const a = fmtAspectJa(r.aspect);
      const deg = (r.aspect_deg ?? "").toString();
      return `${circ[i] || `${i + 1}.`} ${t} × ${n}｜${a}（約${deg}°｜orb ${r.orb_deg}°）`;
    });

    const moonLine = moonSign
      ? `【今日の月の位置】\n月は ${moonSign} を通過中。`
      : `【今日の月の位置】\n月のサインは取得中。`;

    // ✅ story に埋め込まれた tone_hints を読むだけ
    const bullets = story?.public?.tone_hints?.resonance_bullets || [];
    const bulletLines = bullets.length ? bullets : ["・（今日は静かな日。感じたものだけ受け取ってOK）"];

    return [
      `🌌 今日のソラのこえ。｜${dateLabel}`,
      ``,
      `【今日の星の配置（構造）】`,
      lines.length ? lines.join("\n") : "（今日は強い接触は少なめの日）",
      moonLine,
      ``,
      `【立ち上がりやすい共鳴（例）】`,
      ...bulletLines,
      ``,
      `どれか一つでも、まったく違っても大丈夫。`,
      ``,
      `解釈は、あなたのもの。`,
      `星は語る。決めるのは、人。`,
    ].join("\n");
  }

  function renderX(story) {
    const dateLabel = String(story?.meta?.date_local || "").replaceAll("-", ".");
    const sky = story?.public?.sky_top || [];
    const moonSign = story?.public?.moon?.sign_ja || null;

    const skyLines = sky.length
      ? sky.map((s, i) => `${i + 1}) ${fmtBodyJa(s.a)} × ${fmtBodyJa(s.b)}｜${fmtAspectJa(s.type)}（orb ${s.orb_deg}°）`).join("\n")
      : "（今日は空の情報を静かに置きます）";

    const moonLine = moonSign ? `\n月は ${moonSign} を通過中。` : "";
    return `🌌 ソラのこえ。
［${dateLabel}｜空の配置］${moonLine}

${skyLines}

解釈は、あなたのもの。`;
  }

  function renderIG(story) {
    const dateLabel = String(story?.meta?.date_local || "").replaceAll("-", ".");
    const moonSign = story?.public?.moon?.sign_ja || null;
    const sky = story?.public?.sky_top || [];

    const skyLines = sky.length
      ? sky.map((s) => `・${fmtBodyJa(s.a)} × ${fmtBodyJa(s.b)}｜${fmtAspectJa(s.type)}（orb ${s.orb_deg}°）`).join("\n")
      : "・（今日は空の情報を静かに置きます）";

    const moonLine = moonSign ? `月は ${moonSign} を通過中。` : "月のサインは取得中。";

    return `🌌 ソラのこえ。｜${dateLabel}

${moonLine}

【空の主な配置】
${skyLines}

解釈は、あなたのもの。
星は語る。決めるのは、人。`;
  }

  return { renderLine, renderX, renderIG, fmtAspectJa, fmtBodyJa, fmtPointJa };
}

module.exports = { createRenderers };
