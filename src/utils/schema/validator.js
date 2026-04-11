"use strict";

const fs = require("fs");
const path = require("path");
const Ajv = require("ajv");
const addFormats = require("ajv-formats");

function loadSchemasFromDir(ajv, dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isFile()) continue;
    if (!entry.name.endsWith(".schema.json")) continue;
    const filePath = path.join(dir, entry.name);
    const schema = JSON.parse(fs.readFileSync(filePath, "utf8"));
    const schemaId = schema.$id || entry.name;
    ajv.addSchema(schema, schemaId);
  }
}

function createSchemaValidator({ schemaDir, strict = false } = {}) {
  const ajv = new Ajv({ allErrors: true, strict: !!strict });
  addFormats(ajv);

  const dir = schemaDir || path.resolve(process.cwd(), "src/content/schema");
  if (fs.existsSync(dir)) {
    loadSchemasFromDir(ajv, dir);
  }

  function validate(schemaId, data) {
    const id = schemaId || "";
    const validator = ajv.getSchema(id) || ajv.getSchema(path.basename(id));
    if (!validator) {
      throw new Error(`schema not found: ${schemaId}`);
    }
    const ok = validator(data);
    return { ok: !!ok, errors: validator.errors || [] };
  }

  return { ajv, validate };
}

module.exports = {
  createSchemaValidator,
};
