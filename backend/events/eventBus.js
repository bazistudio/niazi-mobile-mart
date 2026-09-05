const EventEmitter = require('events');

class EventBus extends EventEmitter {
  constructor() {
    super();
    // Allow more listeners since a large app might have many subscribers to 'sale.created' etc.
    this.setMaxListeners(20);
  }

  /**
   * Publish an event to the bus.
   * 
   * @param {string} eventName - The namespaced event name (e.g. 'sale.created', 'inventory.low_stock')
   * @param {Object} payload - The data to pass to subscribers
   */
  publish(eventName, payload) {
    // In the future, this can be replaced with Kafka, RabbitMQ, or NATS publish logic
    setImmediate(() => {
      this.emit(eventName, payload);
    });
  }

  /**
   * Publish an event safely without throwing synchronous errors.
   */
  safePublish(eventName, payload) {
    Promise.resolve(this.publish(eventName, payload))
      .catch(err => console.error(`[EventBus] Error publishing ${eventName}:`, err));
  }

  /**
   * Subscribe to an event on the bus.
   * 
   * @param {string} eventName - The namespaced event name
   * @param {Function} handler - The async callback function to execute
   */
  subscribe(eventName, handler) {
    // Wrap handler to safely catch and log errors in async listeners
    this.on(eventName, async (payload) => {
      try {
        await handler(payload);
      } catch (err) {
        console.error(`[EventBus] Error handling event ${eventName}:`, err);
      }
    });
  }
}

// Export as a singleton
module.exports = new EventBus();
