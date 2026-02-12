"use strict";

const { spawnSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const OUT_DIR = process.env.CHECK_OUT_DIR || "/tmp/sora_checks";

const COMMANDS = [
  {
    name: "line_auto",
    cmd: ["curl", "-s", "http://localhost:8080/stories?app_user_id=u_me_yxhONE59qsE8hdpcdsGZ&mode=auto&format=text&channel=line&outputs=true"],
  },
  {
    name: "sora_line",
    cmd: ["curl", "-s", "http://localhost:8080/stories?app_user_id=public&mode=public&format=text&channel=sora_line&outputs=true"],
  },
  {
    name: "line_sora_all",
    cmd: ["curl", "-s", "http://localhost:8080/stories?app_user_id=public&mode=public&format=text&channel=line_sora_all&outputs=true"],
  },
  {
    name: "sora_ura",
    cmd: ["curl", "-s", "http://localhost:8080/stories?app_user_id=public&mode=public&format=text&channel=sora_ura&outputs=true"],
  },
  {
    name: "sora_ura_silent",
    cmd: ["curl", "-s", "http://localhost:8080/stories?app_user_id=public&mode=public&format=text&channel=sora_ura_silent&outputs=true"],
  },
  {
    name: "sora_ura_rare",
    cmd: ["curl", "-s", "http://localhost:8080/stories?app_user_id=public&mode=public&format=text&channel=sora_ura_rare&outputs=true"],
  },
  {
    name: "sora_ura_harmony",
    cmd: ["curl", "-s", "http://localhost:8080/stories?app_user_id=public&mode=public&format=text&channel=sora_ura_harmony&outputs=true"],
  },
  {
    name: "anshin",
    cmd: ["curl", "-s", "http://localhost:8080/stories?app_user_id=u_me_yxhONE59qsE8hdpcdsGZ&mode=auto&format=text&channel=anshin&outputs=true"],
  },
  {
    name: "blog_daily",
    cmd: [
      "curl",
      "-s",
      "-X",
      "POST",
      "http://localhost:8080/cron/blog/daily?date_local=2026-02-12&dryRun=1",
      "-H",
      `x-cron-token: ${process.env.CRON_TOKEN || ""}`,
    ],
    requiresToken: true,
  },
  {
    name: "health_local",
    cmd: ["curl", "-s", "http://localhost:8080/health"],
  },
  {
    name: "health_line_local",
    cmd: ["curl", "-s", "http://localhost:8080/line/health"],
  },
  {
    name: "health_remote",
    cmd: ["curl", "-s", "https://sora-no-koe-v2-256321662770.asia-northeast1.run.app/health"],
  },
  {
    name: "health_line_remote",
    cmd: ["curl", "-s", "https://sora-no-koe-v2-256321662770.asia-northeast1.run.app/line/health"],
  },
  {
    name: "x_public",
    cmd: ["curl", "-s", "http://localhost:8080/stories?app_user_id=public&mode=public&format=text&channel=x&outputs=true"],
  },
  {
    name: "threads_public",
    cmd: ["curl", "-s", "http://localhost:8080/stories?app_user_id=public&mode=public&format=text&channel=threads&outputs=true"],
  },
];

const PLANET_WORDS = [
  "太陽",
  "月",
  "水星",
  "金星",
  "火星",
  "木星",
  "土星",
  "天王星",
  "海王星",
  "冥王星",
  "リリス",
  "キロン",
  "ノード",
  "北ノード",
  "南ノード",
];

const SIGN_WORDS = [
  "牡羊座",
  "牡牛座",
  "双子座",
  "蟹座",
  "獅子座",
  "乙女座",
  "天秤座",
  "蠍座",
  "射手座",
  "山羊座",
  "水瓶座",
  "魚座",
];

const ASPECT_WORDS = [
  "スクエア",
  "トライン",
  "セクスタイル",
  "セミセクスタイル",
  "セミスクエア",
  "セスキスクエア",
  "オポジション",
  "インコンジャンクト",
  "クインタイル",
  "バイクインタイル",
  "セプタイル",
  "ノヴィル",
  "デシル",
  "アスペクト",
  "角度",
  "オーブ",
  "orb",
  "配置",
];

const CAUSAL_WORDS = [
  "によって",
  "による",
  "のため",
  "ために",
  "だから",
  "なので",
  "ゆえに",
  "結果",
  "因果",
  "影響",
  "理由",
  "を生む",
  "につながる",
  "が起きる",
  "が起こる",
];

const CLOSURE_WORDS = [
  "つまり",
  "要するに",
  "結論",
  "まとめると",
  "結局",
  "だからこそ",
];

const STRUCT_MARKERS = [
  "【",
  "】",
  "×",
  "｜",
  "orb",
  "°",
  "度",
  "ASC",
  "MC",
  "IC",
  "DC",
  "☉",
  "☽",
  "☿",
  "♀",
  "♂",
  "♃",
  "♄",
  "♅",
  "♆",
  "♇",
  "⚸",
  "⚷",
];

function ensureOutDir() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
}

function runCommand(name, cmd, requiresToken) {
  if (requiresToken && !process.env.CRON_TOKEN) {
    return {
      name,
      ok: false,
      skipped: true,
      reason: "CRON_TOKEN missing",
      stdout: "",
      stderr: "",
      code: null,
    };
  }
  const res = spawnSync(cmd[0], cmd.slice(1), { encoding: "utf8" });
  return {
    name,
    ok: res.status === 0,
    skipped: false,
    stdout: res.stdout || "",
    stderr: res.stderr || "",
    code: res.status,
  };
}

function writeOutput(name, stdout, stderr) {
  fs.writeFileSync(path.join(OUT_DIR, `${name}.txt`), stdout || "");
  fs.writeFileSync(path.join(OUT_DIR, `${name}.err`), stderr || "");
}

function containsAny(text, words) {
  return words.some((w) => text.includes(w));
}

function analyzeText(text) {
  const lines = String(text || "").split(/\r?\n/);
  const issues = {
    dissolve: [],
    causal: [],
    closure: [],
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    const hasStarWord =
      containsAny(line, PLANET_WORDS) ||
      containsAny(line, SIGN_WORDS) ||
      containsAny(line, ASPECT_WORDS);

    const looksStructural = containsAny(line, STRUCT_MARKERS);

    if (hasStarWord && !looksStructural) {
      issues.dissolve.push({ line: i + 1, text: line });
    }

    if (containsAny(line, CAUSAL_WORDS)) {
      issues.causal.push({ line: i + 1, text: line });
    }

    if (containsAny(line, CLOSURE_WORDS)) {
      issues.closure.push({ line: i + 1, text: line });
    }
  }

  return issues;
}

function printIssueGroup(label, list) {
  if (!list.length) return;
  console.log(`  - ${label}: ${list.length}件`);
  list.slice(0, 5).forEach((x) => {
    console.log(`    L${x.line}: ${x.text}`);
  });
  if (list.length > 5) console.log("    ...");
}

function main() {
  ensureOutDir();

  const results = COMMANDS.map((c) => runCommand(c.name, c.cmd, c.requiresToken));
  for (const r of results) writeOutput(r.name, r.stdout, r.stderr);

  console.log("=== Run Summary ===");
  results.forEach((r) => {
    if (r.skipped) {
      console.log(`${r.name}: SKIP (${r.reason})`);
    } else if (!r.ok) {
      console.log(`${r.name}: FAIL (code=${r.code}) ${r.stderr.trim() ? "err=" + r.stderr.trim().slice(0, 120) : ""}`);
    } else {
      console.log(`${r.name}: OK (${r.stdout.trim().length} chars)`);
    }
  });

  console.log("\n=== Content Checks ===");
  results.forEach((r) => {
    if (!r.ok) return;
    const issues = analyzeText(r.stdout);
    const total = issues.dissolve.length + issues.causal.length + issues.closure.length;
    if (!total) return;
    console.log(`\n[${r.name}]`);
    printIssueGroup("溶解失敗(固有名詞/構造語露出)", issues.dissolve);
    printIssueGroup("因果/説明っぽい語", issues.causal);
    printIssueGroup("結論っぽい語", issues.closure);
  });

  console.log(`\nOutputs saved to: ${OUT_DIR}`);
}

main();
