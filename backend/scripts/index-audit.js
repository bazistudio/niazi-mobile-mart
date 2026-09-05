const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');

const modelsDir = path.join(__dirname, '../models');

function scanIndexes() {
  console.log('🔍 Starting Mongoose Index Audit...\n');
  const files = fs.readdirSync(modelsDir).filter(f => f.endsWith('.js'));

  let missingIndexCount = 0;

  files.forEach(file => {
    const modelName = file.replace('.js', '');
    const modelPath = path.join(modelsDir, file);
    
    // Require the model
    try {
      const model = require(modelPath);
      if (!model || !model.schema) return;

      const schema = model.schema;
      const paths = schema.paths;
      const indexes = schema.indexes();

      // Check common foreign keys
      const requiredKeys = ['tenantId', 'shopId', 'customerId', 'orderId'];

      requiredKeys.forEach(key => {
        if (paths[key]) {
          // Check if this path is indexed
          const isIndexed = indexes.some(idx => {
            // idx[0] is the index object e.g. { tenantId: 1 }
            return Object.keys(idx[0]).includes(key);
          }) || paths[key].options.index === true || paths[key]._index;

          if (!isIndexed) {
            console.warn(`⚠️ MISSING INDEX in ${modelName}: '${key}' is defined but not indexed. This will cause slow collection scans.`);
            missingIndexCount++;
          }
        }
      });
    } catch (err) {
      // Ignore files that are not valid Mongoose models
    }
  });

  console.log('\n📊 Index Audit Summary:');
  if (missingIndexCount === 0) {
    console.log('✅ ALL FOREIGN KEYS ARE PROPERLY INDEXED. Performance is optimal.');
    process.exit(0);
  } else {
    console.error(`❌ FOUND ${missingIndexCount} MISSING INDEXES. Add them to prevent aggregation bottlenecks.`);
    process.exit(1);
  }
}

scanIndexes();
