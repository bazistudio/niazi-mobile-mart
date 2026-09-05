const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');
const MigrationHistory = require('../models/MigrationHistory');

// Assuming migrations folder is at backend/migrations
const migrationsDir = path.join(__dirname, '../migrations');

class MigrationRunner {
  static async validatePreMigration() {
    console.log("Validating pre-migration constraints...");
    if (mongoose.connection.readyState !== 1) {
      throw new Error("Database not connected. Aborting.");
    }
    // Add other checks here (disk space, backup verification, etc.)
    console.log("Pre-migration validation passed.");
  }

  static async runMigrations(dryRun = false) {
    await this.validatePreMigration();

    if (!fs.existsSync(migrationsDir)) {
      console.log("No migrations folder found.");
      return;
    }

    const files = fs.readdirSync(migrationsDir).filter(f => f.endsWith('.js')).sort();

    for (const file of files) {
      const migrationId = file.replace('.js', '');
      
      // Check if already executed successfully
      const history = await MigrationHistory.findOne({ migrationId, status: "SUCCESS" });
      if (history) {
        continue;
      }

      console.log(`\nExecuting migration: ${file}`);
      const migration = require(path.join(migrationsDir, file));

      // Validate required metadata
      const requiredMeta = ['name', 'version', 'purpose'];
      for (const field of requiredMeta) {
        if (!migration.metadata || !migration.metadata[field]) {
          throw new Error(`Migration ${file} is missing required metadata field: ${field}`);
        }
      }

      if (dryRun) {
        console.log(`[DRY RUN] Would execute: ${migration.metadata.name}`);
        continue;
      }

      const startTime = Date.now();
      let status = "FAILED";
      let errorLog = null;
      
      // We will attempt to run the migration within a transaction if replica set allows.
      const isStandalone = process.env.NO_TRANSACTIONS === '1' || mongoose.connection.client.topology.s.description.type === 'Standalone';
      const session = isStandalone ? null : await mongoose.startSession();
      if (session) session.startTransaction();

      try {
        await migration.up(mongoose.connection.db, mongoose.connection.client, session);
        if (session) await session.commitTransaction();
        status = "SUCCESS";
        console.log(`✅ Migration ${file} completed successfully.`);
      } catch (error) {
        if (session) await session.abortTransaction();
        errorLog = error.message;
        console.error(`❌ Migration ${file} failed:`, error);
        
        // Stop execution on first failure
        throw error;
      } finally {
        if (session) session.endSession();

        const duration = Date.now() - startTime;
        
        // Log to MigrationHistory
        await MigrationHistory.findOneAndUpdate(
          { migrationId },
          {
            migrationId,
            migrationName: migration.metadata.name,
            version: migration.metadata.version,
            executedAt: new Date(),
            duration,
            executedBy: "System",
            status,
            rollbackAvailable: typeof migration.down === 'function',
            errorLog
          },
          { upsert: true }
        );
      }
    }

    console.log("\n🎉 All migrations completed successfully.");
  }

  static async rollbackMigration(migrationId) {
    await this.validatePreMigration();

    const history = await MigrationHistory.findOne({ migrationId, status: "SUCCESS" });
    if (!history) {
      console.log(`Migration ${migrationId} not found or not successful. Cannot rollback.`);
      return;
    }

    if (!history.rollbackAvailable) {
      throw new Error(`Migration ${migrationId} does not support rollback.`);
    }

    const file = `${migrationId}.js`;
    const migrationPath = path.join(migrationsDir, file);
    if (!fs.existsSync(migrationPath)) {
      throw new Error(`Migration file ${file} not found.`);
    }

    console.log(`\nRolling back migration: ${file}`);
    const migration = require(migrationPath);

    const isStandalone = process.env.NO_TRANSACTIONS === '1' || mongoose.connection.client.topology.s.description.type === 'Standalone';
    const session = isStandalone ? null : await mongoose.startSession();
    if (session) session.startTransaction();

    try {
      await migration.down(mongoose.connection.db, mongoose.connection.client, session);
      if (session) await session.commitTransaction();
      
      // Update history
      await MigrationHistory.updateOne({ migrationId }, { $set: { status: "ROLLED_BACK" } });
      console.log(`✅ Rollback of ${file} completed successfully.`);
    } catch (error) {
      if (session) await session.abortTransaction();
      console.error(`❌ Rollback of ${file} failed:`, error);
      throw error;
    } finally {
      if (session) session.endSession();
    }
  }
}

// Support CLI execution
if (require.main === module) {
  const args = process.argv.slice(2);
  const isDryRun = args.includes('--dry-run');

  mongoose.connect('mongodb://127.0.0.1:27017/tijaratpro_dev')
    .then(() => MigrationRunner.runMigrations(isDryRun))
    .then(() => process.exit(0))
    .catch(err => {
      console.error(err);
      process.exit(1);
    });
}

module.exports = MigrationRunner;
