const eventBus = require("../core/events/eventBus");
const EVENTS = require("../core/events/eventTypes");
const mainQueue = require("../queues/mainQueue");

async function handleUserRegistered(payload) {
  try {
    console.log("Worker received USER_REGISTERED");
    console.log("User ID:", payload.userId);

    // Offload heavy/unreliable tasks to persistent background queue
    await mainQueue.addJob('send-email', { email: payload.email, name: payload.name });
    await mainQueue.addJob('create-tenant', { userId: payload.userId, email: payload.email });
    await mainQueue.addJob('sync-data', { userId: payload.userId });
    
    // Some tasks can still be synchronous if they are fast/critical and non-blocking
    await logAnalytics(payload);
  } catch (error) {
    console.error("Worker error in USER_REGISTERED handler:", error);
  }
}

async function logAnalytics(payload) {
  console.log("Logging analytics for User ID:", payload.userId);
  // Implementation will go here
}


// Subscribe to events
eventBus.subscribe(EVENTS.USER_REGISTERED, handleUserRegistered);

eventBus.subscribe(EVENTS.USER_LOGGED_IN, (payload) => {
  console.log("Worker received USER_LOGGED_IN");
  console.log("User:", payload.email, "at", new Date(payload.timestamp).toLocaleString());
});

