"use strict";

const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");
const { CANVAS } = require("./shared");

function resolveFfmpegBin(input) {
  if (input) return String(input);
  if (process.env.FFMPEG_BIN) return String(process.env.FFMPEG_BIN);
  return "ffmpeg";
}

function ensureDir(dir) {
  if (!dir) return;
  fs.mkdirSync(dir, { recursive: true });
}

function buildFfmpegArgs({
  framesDir,
  pattern = "frame_%04d.png",
  inputFps = 1,
  outputFps = 30,
  crf = 18,
  preset = "slow",
  pixFmt = "yuv420p",
  faststart = true,
  enforceSize = false,
  width = CANVAS.width,
  height = CANVAS.height,
  extraArgs = [],
  outputPath,
} = {}) {
  if (!framesDir) throw new Error("framesDir required");
  if (!outputPath) throw new Error("outputPath required");

  const inputPath = path.join(framesDir, pattern);
  const args = [
    "-y",
    "-framerate", String(inputFps),
    "-start_number", "1",
    "-i", inputPath,
    "-r", String(outputFps),
    "-c:v", "libx264",
    "-profile:v", "high",
    "-pix_fmt", pixFmt,
    "-crf", String(crf),
    "-preset", preset,
  ];

  if (enforceSize && Number.isFinite(Number(width)) && Number.isFinite(Number(height))) {
    const w = Math.round(Number(width));
    const h = Math.round(Number(height));
    args.push("-vf", `scale=${w}:${h}:flags=lanczos,format=${pixFmt}`);
  }

  if (faststart) args.push("-movflags", "+faststart");
  if (Array.isArray(extraArgs) && extraArgs.length) args.push(...extraArgs);
  args.push(outputPath);

  return args;
}

function runFfmpeg({ ffmpegBin, args, log = true } = {}) {
  const bin = resolveFfmpegBin(ffmpegBin);
  return new Promise((resolve, reject) => {
    const child = spawn(bin, args, {
      stdio: log ? "inherit" : "ignore",
    });
    child.on("error", (err) => reject(err));
    child.on("close", (code) => {
      if (code === 0) return resolve({ ok: true });
      return reject(new Error(`ffmpeg failed with code ${code}`));
    });
  });
}

async function exportMonthlyOverviewVideo({
  framesDir,
  outputPath,
  ffmpegBin,
  log = true,
  ...opts
} = {}) {
  if (!framesDir) throw new Error("framesDir required");
  if (!outputPath) throw new Error("outputPath required");
  ensureDir(path.dirname(outputPath));

  const args = buildFfmpegArgs({
    framesDir,
    outputPath,
    ...opts,
  });

  await runFfmpeg({ ffmpegBin, args, log });
  return { ok: true, outputPath, args };
}

module.exports = {
  buildFfmpegArgs,
  exportMonthlyOverviewVideo,
};
