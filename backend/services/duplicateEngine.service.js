const Product = require("../models/Product");
const { normalizeText } = require("./normalize.service");

const findBestMatch = async (parsedProduct) => {
  if (!parsedProduct) {
    return { status: "new", product: null, reason: "Invalid product data" };
  }

  try {
    const name = normalizeText(parsedProduct.name || "");
    const model = normalizeText(parsedProduct.model || "");

    // 1. Try exact SKU match (if exists)
    if (parsedProduct.sku) {
      const skuMatch = await Product.findOne({ sku: parsedProduct.sku });
      if (skuMatch) {
        return {
          status: "update",
          product: skuMatch,
          reason: "SKU match",
        };
      }
    }

    // 2. Try barcode match
    if (parsedProduct.barcode) {
      const barcodeMatch = await Product.findOne({ barcode: parsedProduct.barcode });
      if (barcodeMatch) {
        return {
          status: "update",
          product: barcodeMatch,
          reason: "Barcode match",
        };
      }
    }

    // 3. Name + model fuzzy match
    if (name) {
      const searchWord = name.split(" ")[0];
      if (searchWord) {
        const candidates = await Product.find({
          name: { $regex: searchWord, $options: "i" },
        });

        for (let product of candidates) {
          const dbName = normalizeText(product.name || "");
          const dbModel = normalizeText(product.model || "");

          if (dbName && (dbName.includes(name) || name.includes(dbName))) {
            return {
              status: "update",
              product,
              reason: "Name similarity match",
            };
          }

          if (model && dbModel && dbModel.includes(model)) {
            return {
              status: "update",
              product,
              reason: "Model match",
            };
          }
        }
      }
    }

    // 4. No match found
    return {
      status: "new",
      product: null,
      reason: "No match found",
    };
  } catch (error) {
    console.error("Duplicate engine error for:", parsedProduct.name, error);
    return {
      status: "new",
      product: null,
      reason: "Error during matching fallback",
    };
  }
};

module.exports = { findBestMatch };
