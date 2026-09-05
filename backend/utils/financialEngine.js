/**
 * FinancialEngine
 * Authoritative source for all monetary calculations in TijaratPro.
 * Ensures that prices, taxes, and totals are computed consistently on the backend.
 */

const calculateOrderTotals = (items, taxRate = 0, globalDiscount = 0) => {
  let subtotal = 0;

  const processedItems = items.map(item => {
    // Backend should re-verify item prices from DB in a real production flow
    const price = item.salePrice !== undefined ? item.salePrice : (item.price || 0);
    const itemTotal = price * (item.quantity || 1);
    subtotal += itemTotal;
    
    return {
      ...item,
      itemTotal
    };
  });

  const taxAmount = (subtotal * taxRate) / 100;
  const grandTotal = (subtotal + taxAmount) - globalDiscount;

  return {
    items: processedItems,
    subtotal,
    taxAmount,
    discountAmount: globalDiscount,
    grandTotal: subtotal < 0 ? grandTotal : Math.max(0, grandTotal)
  };
};

module.exports = {
  calculateOrderTotals,
};
