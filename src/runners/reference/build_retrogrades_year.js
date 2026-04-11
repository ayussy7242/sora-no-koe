#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");
const { ensureDir } = require("../../utils/infra/fs");
const {
  buildRetrogradesYearReference,
  buildRetrogradesYearDeck,
} = require("../../usecases/reference/retrogrades_year");
const { createSchemaValidator } = require("../../utils/schema/validator");

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

function writeJson(p, data) {
  fs.writeFileSync(p, `${JSON.stringify(data, null, 2)}\n`);
}

function formatErrors(errors = []) {
  return errors.map((err) => {
    const at = err.instancePath || "/";
    const msg = err.message || "invalid";
    return `${at} ${msg}`.trim();
  });
}

function validatePayloads({ reference, deck, exportPayload }) {
  const validator = createSchemaValidator();
  const checks = [
    { label: "reference", schemaId: "retrogrades_year.v1.schema.json", data: reference },
    { label: "deck", schemaId: "retrogrades_year.deck.v1.schema.json", data: deck },
    { label: "export", schemaId: "retrogrades_year.export.v1.schema.json", data: exportPayload },
  ];

  const failures = [];
  for (const check of checks) {
    const result = validator.validate(check.schemaId, check.data);
    if (!result.ok) {
      failures.push({
        label: check.label,
        schemaId: check.schemaId,
        errors: formatErrors(result.errors),
      });
    }
  }

  if (failures.length) {
    const details = failures
      .map((fail) => `- ${fail.label} (${fail.schemaId})\n  ${fail.errors.join("\n  ")}`)
      .join("\n");
    throw new Error(`schema validation failed:\n${details}`);
  }
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const year = Number(args.year || args.y);
  if (!Number.isFinite(year)) {
    throw new Error("--year is required (e.g., --year 2026)");
  }

  const templatePath = args.template || path.resolve(process.cwd(), "src/content/templates/instagram/retrogrades_year.v1.json");
  const outRoot = args.out || path.resolve(process.cwd(), "tmp/exports");
  const saveReference = Boolean(args.saveReference || args.save_reference);

  const reference = buildRetrogradesYearReference({ year });
  const template = readJson(templatePath);
  const deck = buildRetrogradesYearDeck({ reference, template });

  const outDir = path.join(outRoot, String(year), "retrogrades_year");
  ensureDir(outDir);

  const refPath = path.join(outDir, `${year}.retrogrades_year.v1.json`);
  const deckPath = path.join(outDir, `${year}.retrogrades_year.deck.v1.json`);
  const exportPath = path.join(outDir, `${year}.retrogrades_year.export.v1.json`);

  const exportPayload = {
    type: "retrogrades_year_export",
    version: "v1",
    year,
    time_zone: reference.time_zone,
    generated_at_utc: new Date().toISOString(),
    reference,
    deck,
  };

  const skipValidate = Boolean(args.skipValidate || args.skip_validate);
  if (!skipValidate) {
    validatePayloads({ reference, deck, exportPayload });
  }

  writeJson(refPath, reference);
  writeJson(deckPath, deck);
  writeJson(exportPath, exportPayload);

  if (saveReference) {
    const refDir = path.resolve(process.cwd(), "src/content/reference/calendars/year");
    ensureDir(refDir);
    const savedPath = path.join(refDir, `${year}.retrogrades_year.v1.json`);
    writeJson(savedPath, reference);
  }

  console.log("[retrogrades_year] generated", {
    year,
    outDir,
    reference: refPath,
    deck: deckPath,
    export: exportPath,
    saveReference,
    validated: !skipValidate,
  });
}

if (require.main === module) {
  main();
}
