if (process.env.REDIS_URL || process.env.REDIS_HOST) {
  require("./auth.worker");
  require("./search.worker");
  require("./queue.worker");
  require("./audit.worker");
  require("./notification.worker");
  console.log("Workers initialized");
} else {
  console.log("Redis not configured, skipping workers initialization.");
}
