require("dotenv").config();
const mongoose = require("mongoose");
const Subscription = require("../models/Subscription");
const Package = require("../models/Package");

async function migrate() {
  try {
    const mongoUri = process.env.MONGO_URI || "mongodb://127.0.0.1:27017/tijaratpro";
    console.log(`Connecting to ${mongoUri}`);
    await mongoose.connect(mongoUri);
    
    console.log("Connected. Finding subscriptions without snapshot fields...");

    // Find subscriptions where snapshot fields are missing
    const subscriptions = await Subscription.find({
      $or: [
        { durationType: { $exists: false } },
        { "limits.maxBranches": { $exists: false } }
      ]
    }).populate("packageId");

    console.log(`Found ${subscriptions.length} subscriptions to migrate.`);

    let updatedCount = 0;
    
    for (const sub of subscriptions) {
      if (!sub.packageId) {
        console.warn(`Subscription ${sub._id} has no packageId. Skipping.`);
        continue;
      }
      
      const pkg = sub.packageId;
      
      sub.durationType = pkg.durationType || "MONTHS";
      sub.durationValue = pkg.durationValue || 1;
      
      sub.limits = {
        maxBranches: pkg.maxBranches ?? 1,
        maxUsers: pkg.maxUsers ?? 1,
        maxProducts: pkg.maxProducts ?? 100,
        storageLimit: pkg.storageLimit ?? 1024
      };
      
      sub.enabledModules = pkg.enabledModules || [];
      
      // We don't overwrite subscriptionPrice if it already exists and > 0, 
      // but just in case it's 0, we can snap from pkg.price
      if (sub.subscriptionPrice === 0 && pkg.price) {
        sub.subscriptionPrice = pkg.price;
      }

      await sub.save({ validateBeforeSave: false }); // Skip strict validation on existing records
      updatedCount++;
    }

    console.log(`Migration complete. Updated ${updatedCount} subscriptions.`);
    
  } catch (error) {
    console.error("Migration failed:", error);
  } finally {
    await mongoose.disconnect();
    console.log("Disconnected.");
  }
}

migrate();
