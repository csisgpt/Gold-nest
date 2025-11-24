function initialize() {
  return (_req, _res, next) => next();
}

function authenticate(_strategy, _options) {
  return (_req, _res, next) => next();
}

module.exports = { initialize, authenticate };
