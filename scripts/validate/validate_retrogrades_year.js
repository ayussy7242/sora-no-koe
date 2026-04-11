#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");
const { createSchemaValidator } = require("../../src/utils/schema/validator");

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith("--")) continue;
    const key = a.slice(2);
    const next = argv[i + 1];
    if (next && !next.startsWith("--")) {
      out[key] = next;
      i += 1;
    } else {
      out[key] = true;
    }
  }
  return out;
}

function readJson(p) {
  return JSON.parse(fs.readFileSync(p, "utf8"));
}

function formatErrors(errors = []) {
  return errors.map((err) => {
    const at = err.instancePath || "/";
    const msg = err.message || "invalid";
    return `${at} ${msg}`.trim();
  });
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

function main() {
  const args = parseArgs(process.argv.slice(2));
  const year = Number(args.year || args.y);
  if (!Number.isFinite(year)) {
    throw new Error("--year is required (e.g., --year 2026)");
  }

  const outRoot = args.out || path.resolve(process.cwd(), "tmp/exports");
  const dir = args.dir || path.join(outRoot, String(year), "retrogrades_year");

  const referencePath = args.reference || path.join(dir, `${year}.retrogrades_year.v1.json`);
  const deckPath = args.deck || path.join(dir, `${year}.retrogrades_year.deck.v1.json`);
  const exportPath = args.export || path.join(dir, `${year}.retrogrades_year.export.v1.json`);

  const validator = createSchemaValidator();
  const results = [
    validateFile({
      validator,
      schemaId: "retrogrades_year.v1.schema.json",
      label: "reference",
      filePath: referencePath,
    }),
    validateFile({
      validator,
      schemaId: "retrogrades_year.deck.v1.schema.json",
      label: "deck",
      filePath: deckPath,
    }),
    validateFile({
      validator,
      schemaId: "retrogrades_year.export.v1.schema.json",
      label: "export",
      filePath: exportPath,
    }),
  ];

  const failures = results.filter((r) => !r.ok);
  if (failures.length) {
    for (const fail of failures) {
      console.error(`[validate] ${fail.label} invalid: ${fail.filePath}`);
      for (const msg of fail.errors) {
        console.error(`  - ${msg}`);
      }
    }
    process.exit(1);
  }

  console.log(`[validate] ok: retrogrades_year ${year}`);
}

if (require.main === module) {
  main();
}
