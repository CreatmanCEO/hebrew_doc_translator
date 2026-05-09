// @hdt/shared — common contracts for the HDT monorepo.
// JSDoc-typed exports; see ARCHITECTURE.md §3 for the formal interfaces.

module.exports = {
  // env schema is exported lazily so consumers can opt in
  get envSchema() {
    return require('./env/schema');
  },
};
