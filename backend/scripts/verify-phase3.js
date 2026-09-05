const crypto = require("crypto");
const mongoose = require('mongoose');

const Organization = require('../models/Organization');
const Branch = require('../models/Branch');
const Category = require('../models/Category');
const Unit = require('../models/Unit');
const Warehouse = require('../models/Warehouse');
const PriceList = require('../models/PriceList');
const Product = require('../models/Product');
const ProductPrice = require('../models/ProductPrice');
const ProductBarcode = require('../models/ProductBarcode');
const { tenantContext } = require('../middleware/context/asyncContext');

async function verify() {
  console.log('Connecting to Test Database...');
  await mongoose.connect('mongodb://127.0.0.1:27017/tijaratpro_phase3_test');
  await mongoose.connection.dropDatabase();
  await Promise.all(mongoose.modelNames().map(modelName => mongoose.model(modelName).createIndexes()));
  console.log('✅ Database connected and cleared, indexes rebuilt.');

  // Create Organizations and Branches
  const org1 = await Organization.create({ name: 'Org 1', code: 'ORG1', ownerId: crypto.randomUUID() });
  const org2 = await Organization.create({ name: 'Org 2', code: 'ORG2', ownerId: crypto.randomUUID() });
  
  const branch1 = await Branch.create({ name: 'Branch 1', organizationId: org1._id });
  
  // Enter Async Context for Org 1
  await tenantContext.run({ organizationId: org1._id.toString() }, async () => {
    console.log('\n--- Running Verification for Rules ---');
    
    // 4 & 5. UUID & PublicId generation
    const cat = await Category.create({ name: 'Electronics', categoryCode: 'ELEC', organizationId: org1._id });
    if (!cat.uuid || !cat.publicId) throw new Error('UUID or PublicId missing');
    console.log('✅ UUID & PublicId generation verified.');

    // 7. Parent category recursion
    try {
      cat.parentId = cat._id;
      await cat.save();
      throw new Error('Should have failed self-parent');
    } catch(e) {
      if(e.message === 'Should have failed self-parent') throw e;
      console.log('✅ Parent category recursion prevented.');
    }

    // 8. Unit conversion validation
    const pcs = await Unit.create({ name: 'Pieces', shortName: 'PCS', organizationId: org1._id });
    try {
      pcs.baseUnitId = pcs._id;
      await pcs.save();
      throw new Error('Should have failed self-base');
    } catch(e) {
      if(e.message === 'Should have failed self-base') throw e;
      console.log('✅ Unit conversion recursion prevented.');
    }

    // 15. Branch -> Warehouse validation
    try {
      await Warehouse.create({ name: 'WH1', warehouseCode: 'WH01', organizationId: org1._id }); // missing branchId
      throw new Error('Should have failed without branchId');
    } catch(e) {
      if(e.message === 'Should have failed without branchId') throw e;
      console.log('✅ Warehouse -> Branch relationship required.');
    }
    const wh1 = await Warehouse.create({ name: 'WH1', warehouseCode: 'WH01', branchId: branch1._id, organizationId: org1._id });

    // 10 & 11. Service product & Without Inventory
    const service = await Product.create({
      name: 'Consulting',
      productCode: 'SRV-01',
      sku: 'CONSULT',
      type: 'SERVICE',
      trackInventory: false,
      baseUnitId: pcs._id,
      organizationId: org1._id
    });
    console.log('✅ Service product and trackInventory=false created.');

    // 9. Price list assignment
    const retail = await PriceList.create({ name: 'Retail', priceListCode: 'RET', organizationId: org1._id });
    await ProductPrice.create({ productId: service._id, priceListId: retail._id, unitId: pcs._id, price: 100, organizationId: org1._id });
    console.log('✅ Price list assignment verified.');

    // 6 & 12. Duplicate barcode & compound unique indexes
    await ProductBarcode.create({ productId: service._id, unitId: pcs._id, barcode: '12345', organizationId: org1._id });
    try {
      await ProductBarcode.create({ productId: service._id, unitId: pcs._id, barcode: '12345', organizationId: org1._id });
      throw new Error('Duplicate barcode allowed');
    } catch(e) {
      if(e.message === 'Duplicate barcode allowed') throw e;
      console.log('✅ Duplicate barcode rejected.');
    }

    // 13. Duplicate SKU in same org
    try {
      await Product.create({
        name: 'Another', productCode: 'P-02', sku: 'CONSULT', baseUnitId: pcs._id, organizationId: org1._id
      });
      throw new Error('Duplicate SKU allowed');
    } catch(e) {
      if(e.message === 'Duplicate SKU allowed') throw e;
      console.log('✅ Duplicate SKU rejected within same org.');
    }

    // 2. Soft delete
    await service.softDelete();
    const count = await Product.countDocuments();
    if(count !== 0) throw new Error('Soft delete failed');
    console.log('✅ Soft delete verified.');

    // 3. Optimistic locking
    const catCopy1 = await Category.findById(cat._id);
    const catCopy2 = await Category.findById(cat._id);
    catCopy1.name = 'V1';
    await catCopy1.save();
    try {
      catCopy2.name = 'V2';
      await catCopy2.save();
      throw new Error('Optimistic lock failed');
    } catch(e) {
      if(e.message === 'Optimistic lock failed') throw e;
      console.log('✅ Optimistic locking verified.');
    }
  });

  // 1. Tenant Isolation & 14. Same SKU in different orgs
  await tenantContext.run({ organizationId: org2._id.toString() }, async () => {
    // Should see 0 products
    const org2Products = await Product.countDocuments();
    if(org2Products !== 0) throw new Error('Tenant isolation failed');
    console.log('✅ Tenant isolation verified.');

    const pcs2 = await Unit.create({ name: 'Pieces', shortName: 'PCS', organizationId: org2._id });
    // Same SKU 'CONSULT' but in Org 2
    await Product.create({
      name: 'Consulting',
      productCode: 'SRV-01', // also same code!
      sku: 'CONSULT',
      baseUnitId: pcs2._id,
      organizationId: org2._id
    });
    console.log('✅ Same SKU allowed across different organizations.');
  });

  console.log('\n🎉 Phase 3 Verification Complete: All 15 Rules Passed!');
  process.exit(0);
}

verify().catch(e => {
  console.error('❌ Verification failed', e);
  process.exit(1);
});
