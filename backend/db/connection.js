const mongoose = require('mongoose');

// Apply Global Plugins before connecting
const tenantGuardPlugin = require('../plugins/tenantGuard.plugin');
mongoose.plugin(tenantGuardPlugin);

/**
 * Connects to MongoDB with robust connection pooling and settings.
 * @returns {Promise<mongoose.Connection>}
 */
const connectDB = async () => {
  try {
    if (!process.env.MONGO_URI) {
      throw new Error("CRITICAL ERROR: MONGO_URI environment variable is missing.");
    }

    const options = {
      maxPoolSize: 50,
      serverSelectionTimeoutMS: 30000,
      socketTimeoutMS: 45000,
    };

    console.log("[DB] Connecting to MongoDB...");
    const conn = await mongoose.connect(process.env.MONGO_URI, options);
    console.log("[DB] MongoDB connected successfully.");
    console.log(`MongoDB Connected: ${conn.connection.host}`);
    
    mongoose.connection.on('disconnected', () => {
      console.warn('MongoDB disconnected. Attempting to reconnect...');
    });
    
    mongoose.connection.on('error', (err) => {
      console.error('MongoDB connection error:', err);
    });

    return conn.connection;
  } catch (error) {
    console.error(`Database Connection Error: ${error.message}`);
    throw error;
  }
};

/**
 * Gets the current Mongoose connection client
 * @returns {mongoose.mongo.MongoClient}
 */
const getClient = () => mongoose.connection.getClient();

/**
 * Helper to start a MongoDB session for transactions
 * @returns {Promise<mongoose.ClientSession | null>}
 */
const startSession = async () => {
  const client = getClient();
  const isReplicaSet = client && client.topology && client.topology.description && 
    (client.topology.description.type === 'ReplicaSetWithPrimary' || 
     client.topology.description.type === 'ReplicaSetNoPrimary' || 
     client.topology.description.type === 'Sharded');
     
  if (!isReplicaSet) return null;
  
  const session = await mongoose.startSession();
  session.startTransaction();
  return session;
};

/**
 * Executes a function within a MongoDB transaction, automatically retrying
 * up to 3 times on transient transaction errors.
 * @param {Function} fn - The async function to execute. Receives the session as an argument.
 * @param {number} maxRetries - Maximum number of retries (default: 3)
 * @returns {Promise<any>}
 */
const withTransaction = async (fn, maxRetries = 3) => {
  const client = getClient();
  const isReplicaSet = client && client.topology && client.topology.description && 
    (client.topology.description.type === 'ReplicaSetWithPrimary' || 
     client.topology.description.type === 'ReplicaSetNoPrimary' || 
     client.topology.description.type === 'Sharded');

  if (!isReplicaSet) {
    // If running in local standalone Mongo, just execute the function without a real session
    return await fn(null);
  }

  let attempt = 0;
  while (attempt < maxRetries) {
    attempt++;
    const session = await mongoose.startSession();
    try {
      session.startTransaction();
      
      const result = await fn(session);
      
      if (session.inTransaction()) {
        await session.commitTransaction();
      }
      return result;
    } catch (error) {
      if (session.inTransaction()) {
        await session.abortTransaction();
      }
      
      // Check if the error is a transient error that can be retried
      const isTransient = error.hasErrorLabel && error.hasErrorLabel('TransientTransactionError');
      const isUnknownCommit = error.hasErrorLabel && error.hasErrorLabel('UnknownTransactionCommitResult');

      if ((isTransient || isUnknownCommit) && attempt < maxRetries) {
        console.warn(`Transaction failed with transient error. Retrying... Attempt ${attempt} of ${maxRetries}`);
        // Exponential backoff before retry
        await new Promise(res => setTimeout(res, attempt * 200));
        continue;
      }
      throw error;
    } finally {
      session.endSession();
    }
  }
};

module.exports = { connectDB, getClient, startSession, withTransaction };
