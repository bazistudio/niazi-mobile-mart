export interface InventoryAlert {
  id: string;
  productId: string;
  productName: string;
  currentStock: number;
  minThreshold: number;
  status: 'low' | 'out_of_stock';
}
