const extractMobileProducts = (lines) => {
  if (!Array.isArray(lines)) return [];
  
  const products = [];

  const categories = [
    "battery",
    "display",
    "charger",
    "cable",
    "motherboard",
    "camera",
    "panel"
  ];

  lines.forEach((line) => {
    if (!line || typeof line !== 'string') return;
    
    try {
      const lower = line.toLowerCase();

      let category = categories.find(c => lower.includes(c));

      let priceMatch = line.match(/(\d{3,6})\s?(PKR|Rs|RS)?/i);
      let qtyMatch = line.match(/(\d+)\s?(pcs|pc|qty)?/i);

      let modelMatch = line.match(/(iphone\s?\d+|a\d+|redmi\s?note\s?\d+)/i);

      if (priceMatch && modelMatch) {
        products.push({
          name: line.trim(),
          model: modelMatch[0],
          category: category || "unknown",
          price: priceMatch[1] ? parseInt(priceMatch[1], 10) : 0,
          quantity: qtyMatch && qtyMatch[1] ? parseInt(qtyMatch[1], 10) : 1
        });
      }
    } catch (err) {
      // Catch any unexpected regex or parsing error for a single line
      console.error("Error extracting product from line:", line, err);
    }
  });

  return products;
};

module.exports = {
  extractMobileProducts,
};
