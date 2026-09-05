const EventEmitter = require("events");

class EventBus extends EventEmitter {
  constructor() {
    super();
    this.setMaxListeners(50);
  }

  emitEvent(event, payload) {
    console.log("EVENT EMITTED:", event);
    this.emit(event, payload);
  }

  subscribe(event, handler) {
    console.log("SUBSCRIBED TO:", event);
    this.on(event, handler);
  }
}

module.exports = new EventBus();
