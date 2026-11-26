// Only bundled in the payments-only browser worker. Never supply substitute
// consensus answers: an accidental name operation must fail, not look valid.
function unsupported() { throw new Error('The browser worker does not support name covenants.'); }
module.exports = {has: unsupported, get: unsupported, getByName: unsupported, locked: {get: unsupported}};
