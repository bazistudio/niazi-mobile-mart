const { MongoClient, ObjectId } = require('mongodb');
const crypto = require('crypto');

async function run() {
  const client = new MongoClient('mongodb://localhost:27017');
  await client.connect();
  const db = client.db('tijaratpro');

  console.log('Starting Phase 4A Database UUID Migration Cleanup...');

  const idMap = new Map(); // Map<hexString, uuidString>

  // 1. Scan major collections and build mapping, generate UUID if missing
  const collectionsWithIds = [
    'organizations', 'branches', 'users', 'subscriptions', 'products', 'shops', 'tenants'
  ];

  for (const collName of collectionsWithIds) {
    const coll = db.collection(collName);
    const docs = await coll.find({ _id: { $type: "objectId" } }).toArray();
    for (const doc of docs) {
      const hex = doc._id.toString();
      const uuid = doc.uuid || crypto.randomUUID();
      idMap.set(hex, uuid);
    }
  }

  console.log(`Generated UUID mapping for ${idMap.size} documents.`);

  // 2. Update _id of documents from ObjectId to UUID string
  for (const collName of collectionsWithIds) {
    const coll = db.collection(collName);
    const docs = await coll.find({ _id: { $type: "objectId" } }).toArray();
    let updatedCount = 0;
    for (const doc of docs) {
      const hex = doc._id.toString();
      const newId = idMap.get(hex);
      
      const newDoc = { ...doc, _id: newId };
      if (!newDoc.uuid) newDoc.uuid = newId;
      if (!newDoc.code && collName === 'organizations') newDoc.code = 'ORG-' + crypto.randomBytes(4).toString('hex').toUpperCase();

      await coll.deleteOne({ _id: doc._id });
      try {
        await coll.insertOne(newDoc);
      } catch (err) {
        // Fallback: put it back if failed
        await coll.insertOne(doc);
        throw err;
      }
      updatedCount++;
    }
    console.log(`Migrated ${updatedCount} _ids in ${collName}`);
  }

  // 3. Update foreign keys across ALL collections
  // To be safe, we iterate through every document in every collection, find ObjectIds, and replace them if they are in idMap
  // We also replace specific string foreign keys if they match an old ObjectId hex
  const allCollections = await db.listCollections().toArray();
  for (const collInfo of allCollections) {
    const collName = collInfo.name;
    const coll = db.collection(collName);
    const docs = await coll.find({}).toArray();
    let updatedCount = 0;

    for (const doc of docs) {
      let modified = false;
      
      // Recursive function to update object properties
      const updateObj = (obj) => {
        if (!obj) return;
        for (const [key, val] of Object.entries(obj)) {
          if (key === '_id') continue; // Handled above

          if (val instanceof ObjectId) {
            const hex = val.toString();
            if (idMap.has(hex)) {
              obj[key] = idMap.get(hex);
              modified = true;
            } else {
              // Convert any leftover ObjectId foreign key to string anyway
              obj[key] = hex;
              modified = true;
            }
          } else if (typeof val === 'string' && val.length === 24 && idMap.has(val)) {
             // If it was already a string but was a hex pointing to an old ObjectId
             obj[key] = idMap.get(val);
             modified = true;
          } else if (Array.isArray(val)) {
            for (let i = 0; i < val.length; i++) {
              if (val[i] instanceof ObjectId) {
                const hex = val[i].toString();
                val[i] = idMap.has(hex) ? idMap.get(hex) : hex;
                modified = true;
              } else if (typeof val[i] === 'string' && val[i].length === 24 && idMap.has(val[i])) {
                val[i] = idMap.get(val[i]);
                modified = true;
              } else if (typeof val[i] === 'object') {
                updateObj(val[i]);
              }
            }
          } else if (typeof val === 'object') {
            updateObj(val);
          }
        }
      };

      updateObj(doc);

      if (modified) {
        await coll.updateOne({ _id: doc._id }, { $set: doc });
        updatedCount++;
      }
    }
    console.log(`Updated ${updatedCount} foreign keys in ${collName}`);
  }

  console.log('Migration completed successfully!');
  await client.close();
}

run().catch(console.error);
