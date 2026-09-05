const repositories = require('./repositories');
const services = require('./services');

module.exports = {
  ...repositories,
  ...services
};
