const mongoose = require('mongoose');

/**
 * Executes a callback within a MongoDB transaction.
 * 
 * @param {Function} callback - Async function(session) to execute within the transaction.
 * @param {Object} options - Mongoose transaction options (e.g. readConcern, writeConcern, maxCommitTimeMS).
 * @returns {Promise<any>} - Returns the result of the callback.
 */
async function runInTransaction(callback, options = {}) {
  const session = await mongoose.startSession();
  
  // Default options if none provided
  const txOptions = {
    readConcern: { level: 'snapshot' },
    writeConcern: { w: 'majority' },
    ...options
  };

  session.startTransaction(txOptions);
  
  try {
    const result = await callback(session);
    await session.commitTransaction();
    return result;
  } catch (error) {
    await session.abortTransaction();
    throw error;
  } finally {
    session.endSession();
  }
}

module.exports = {
  runInTransaction
};
