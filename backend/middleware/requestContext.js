const { AsyncLocalStorage } = require('async_hooks');
const crypto = require('crypto');

const asyncLocalStorage = new AsyncLocalStorage();

/**
 * Middleware to inject a unique requestId into every request context
 * accessible globally via getRequestId()
 */
const requestContextMiddleware = (req, res, next) => {
  const requestId = req.headers['x-request-id'] || crypto.randomUUID();
  
  // Set it on response headers for client tracking
  res.setHeader('x-request-id', requestId);

  const store = new Map();
  store.set('requestId', requestId);
  
  if (req.user) {
    store.set('userId', req.user._id);
    store.set('tenantId', req.user.tenantId || req.tenantId);
  }

  asyncLocalStorage.run(store, () => {
    next();
  });
};

/**
 * Retrieves the current request context from AsyncLocalStorage
 */
const getContext = () => {
  return asyncLocalStorage.getStore();
};

/**
 * Retrieves the requestId for the current execution context
 */
const getRequestId = () => {
  const store = getContext();
  return store ? store.get('requestId') : null;
};

module.exports = {
  requestContextMiddleware,
  asyncLocalStorage,
  getContext,
  getRequestId
};
