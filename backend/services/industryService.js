/**
 * IndustryService
 * Handles sector-specific validation rules (Pharmacy, Auto Parts, etc.)
 */

const validatePharmacyItem = (product, quantity) => {
  if (product.industry !== "pharmacy") return;

  // 1. Expiry Validation
  if (product.industryMetadata?.expiryDate) {
    const expiry = new Date(product.industryMetadata.expiryDate);
    const today = new Date();
    if (expiry <= today) {
      throw new Error(`Product ${product.name} has expired!`);
    }
  }

  // 2. Prescription Check
  if (product.industryMetadata?.requiresPrescription) {
    // In a real system, we would check if a prescription ID was provided in the order
    // For now, we log a warning or flag it
  }
};

const validateAutoPartsItem = (product) => {
  if (product.industry !== "auto_parts") return;
  // compatibility checks, etc.
};

module.exports = {
  validatePharmacyItem,
  validateAutoPartsItem
};
