// Schema changes belong in database/sql/*.sql — not at request time.
// This module is kept only for backward-compatible imports.

async function ensureSaasSchema() {
  return true;
}

module.exports = {
  ensureSaasSchema,
};
