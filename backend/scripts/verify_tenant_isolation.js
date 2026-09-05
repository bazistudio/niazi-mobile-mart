const mongoose = require("mongoose");
const crypto = require("crypto");
const Organization = require("../models/Organization");
const Product = require("../models/Product");
const { tenantContext, getTenantStore } = require("../middleware/context/asyncContext");
require("dotenv").config();

async function runIsolationTest() {
  try {
    await mongoose.connect(process.env.MONGO_URI || "mongodb://localhost:27017/tijaratpro_dev");
    
    // Clear test data
    await Organization.deleteMany({ name: { $in: ["Test Org A", "Test Org B"] } });
    await Product.deleteMany({ name: { $in: ["Product A", "Product B"] } });
    
    // Create Org A and Product A
    const orgA_id = crypto.randomUUID();
    await Organization.create({ _id: orgA_id, name: "Test Org A", slug: "test-org-a", code: "ORG_A", status: "ACTIVE" });
    await Product.create({ _id: crypto.randomUUID(), organizationId: orgA_id, branchId: orgA_id, name: "Product A", productCode: "PRD-A", sellingPrice: 100, status: "ACTIVE", baseUnitId: crypto.randomUUID() });
    
    // Create Org B and Product B
    const orgB_id = crypto.randomUUID();
    await Organization.create({ _id: orgB_id, name: "Test Org B", slug: "test-org-b", code: "ORG_B", status: "ACTIVE" });
    await Product.create({ _id: crypto.randomUUID(), organizationId: orgB_id, branchId: orgB_id, name: "Product B", productCode: "PRD-B", sellingPrice: 200, status: "ACTIVE", baseUnitId: crypto.randomUUID() });
    
    // User from Org A tries to query products
    let resultsOrgA = null;
    await new Promise((resolve) => {
        tenantContext.run({ organizationId: orgA_id }, async () => {
            resultsOrgA = await Product.find({ status: "ACTIVE" });
            resolve();
        });
    });

    // Verify User from Org A ONLY sees Product A
    console.log(`User in Org A found ${resultsOrgA.length} products.`);
    if (resultsOrgA.length !== 1 || resultsOrgA[0].name !== "Product A") {
        throw new Error("Tenant isolation failed! User A saw products they shouldn't have.");
    }
    
    // User from Org A tries to specifically query Product B
    let productBSearch = null;
    await new Promise((resolve) => {
        tenantContext.run({ organizationId: orgA_id }, async () => {
            productBSearch = await Product.findOne({ name: "Product B" });
            resolve();
        });
    });

    if (productBSearch) {
        throw new Error("Tenant isolation failed! User A could query Product B explicitly.");
    }

    console.log("✅ Multi-tenant Isolation Test PASSED! Identity segregation is working perfectly.");
    
    process.exit(0);
  } catch (err) {
    console.error("Test Failed: ", err);
    process.exit(1);
  }
}

runIsolationTest();
