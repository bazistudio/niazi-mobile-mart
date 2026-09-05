const EventEmitter = require('events');
const marketplaceEvents = new EventEmitter();

marketplaceEvents.PRODUCT_UPDATED = 'product_updated';
marketplaceEvents.PRODUCT_DELETED = 'product_deleted';
marketplaceEvents.PRODUCT_CREATED = 'product_created';

module.exports = marketplaceEvents;
