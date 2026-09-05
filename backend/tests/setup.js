const mongoose = require('mongoose');
const { MongoMemoryReplSet } = require('mongodb-memory-server');
const redisClient = require('../utils/redisClient');

let mongoServer;

jest.setTimeout(30000);

beforeAll(async () => {
  // Disconnect if already connected from a previous run or app startup
  if (mongoose.connection.readyState !== 0) {
    await mongoose.disconnect();
  }

  mongoServer = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  const mongoUri = mongoServer.getUri();
  
  await mongoose.connect(mongoUri);
}, 60000);

afterAll(async () => {
  if (mongoose.connection.readyState !== 0) {
    await mongoose.disconnect();
  }
  if (mongoServer) {
    await mongoServer.stop();
  }
  // Quit Redis if we used it in tests
  if (redisClient.status === 'ready') {
    await redisClient.quit();
  }
}, 30000);

afterEach(async () => {
  // Clear all collections between tests
  const collections = mongoose.connection.collections;
  for (const key in collections) {
    const collection = collections[key];
    await collection.deleteMany({});
  }
}, 30000);
