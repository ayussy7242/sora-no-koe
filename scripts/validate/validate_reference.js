#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");
const { createSchemaValidator } = require("../../src/utils/schema/validator");

function formatErrors(errors = []) {
  return errors.map((err) => {
    const at = err.instancePath || "/";
    const msg = err.message || "invalid";
    return `${at} ${msg}`.trim();
  });
}

function readJson(p) {
  return JSON.parse(fs.readFileSync(p, "utf8"));
}

function validateFile({ validator, schemaId, label, filePath }) {
  if (!fs.existsSync(filePath)) {
    return { ok: false, label, filePath, errors: [`missing file: ${filePath}`] };
  }
  const data = readJson(filePath);
  const result = validator.validate(schemaId, data);
  if (result.ok) return { ok: true, label, filePath, errors: [] };
  return { ok: false, label, filePath, errors: formatErrors(result.errors) };
}

function findCalendarYearTargets(rootDir) {
  if (!fs.existsSync(rootDir)) return [];
  const entries = fs.readdirSync(rootDir, { withFileTypes: true });
  const targets = [];

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const year = entry.name;
    const dir = path.join(rootDir, year, "calendar_year");
    if (!fs.existsSync(dir)) continue;
    const referencePath = path.join(dir, `${year}.moon_calendar.v1.json`);
    const deckPath = path.join(dir, `${year}.calendar_year.deck.v1.json`);
    const exportPath = path.join(dir, `${year}.calendar_year.export.v1.json`);
    targets.push({ year, dir, referencePath, deckPath, exportPath });
  }

  return targets;
}

function main() {
  const rootDir = path.resolve(process.cwd(), "tmp/exports");
  const targets = findCalendarYearTargets(rootDir);

  if (!targets.length) {
    console.error("[validate] no calendar_year exports found under tmp/exports");
    process.exit(1);
  }

  const validator = createSchemaValidator();
  let failed = false;

  for (const target of targets) {
    const results = [
      validateFile({
        validator,
        schemaId: "calendar_year.v1.schema.json",
        label: `reference(${target.year})`,
        filePath: target.referencePath,
      }),
      validateFile({
        validator,
        schemaId: "carousel_deck.v1.schema.json",
        label: `deck(${target.year})`,
        filePath: target.deckPath,
      }),
      validateFile({
        validator,
        schemaId: "calendar_year.export.v1.schema.json",
        label: `export(${target.year})`,
        filePath: target.exportPath,
      }),
    ];

    const failures = results.filter((r) => !r.ok);
    if (failures.length) {
      failed = true;
      for (const fail of failures) {
        console.error(`[validate] ${fail.label} invalid: ${fail.filePath}`);
        for (const msg of fail.errors) {
          console.error(`  - ${msg}`);
        }
      }
    } else {
      console.log(`[validate] ok: calendar_year ${target.year}`);
    }
  }

  if (failed) process.exit(1);
}

if (require.main === module) {
  main();
}
