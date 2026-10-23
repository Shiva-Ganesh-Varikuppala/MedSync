// Express 5 already forwards rejected promises, but keeping this wrapper makes
// the intent obvious and keeps controllers working if the version changes.
module.exports = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
