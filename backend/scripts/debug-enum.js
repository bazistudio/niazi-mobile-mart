const Order = require('../models/Order');
console.log('Order Enums:', Order.schema.path('status').enumValues);
