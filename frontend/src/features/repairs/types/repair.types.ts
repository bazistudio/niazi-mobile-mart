export type RepairStatus = 
  | 'Received'
  | 'Diagnosing'
  | 'Waiting Customer Approval'
  | 'Waiting Parts'
  | 'Repair In Progress'
  | 'Quality Check'
  | 'Ready for Pickup'
  | 'Delivered'
  | 'Cancelled'
  | 'Rejected'
  | 'On Hold'
  | 'Returned Under Warranty';

export type RepairPriority = 'Low' | 'Normal' | 'High' | 'Urgent';

export interface RepairTimelineEvent {
  _id: string;
  status: string;
  timestamp: string;
  user: {
    _id: string;
    name: string;
    email: string;
  };
  description: string;
  note?: string;
}

export interface PartUsed {
  _id: string;
  productId: {
    _id: string;
    name: string;
    sku: string;
    currentStock: number;
    cost: number;
    price: number;
  };
  qty: number;
  cost: number;
  price: number;
  addedAt: string;
}

export interface LaborCharge {
  _id: string;
  description: string;
  amount: number;
}

export interface RepairPayment {
  _id: string;
  amount: number;
  method: string;
  timestamp: string;
  reference?: string;
}

export interface DeviceInfo {
  type: string;
  brand: string;
  model: string;
  color: string;
  imei: string;
  password?: string;
}

export interface Accessories {
  charger: boolean;
  battery: boolean;
  sim: boolean;
  memoryCard: boolean;
  cover: boolean;
  box: boolean;
  other?: string;
}

export interface RepairJob {
  id: string; // mapped from _id
  _id: string;
  jobId: string;
  customerId: any; // Populated Customer or Party
  customerModel: 'Customer' | 'Party';
  device: DeviceInfo;
  accessories: Accessories;
  problemDescription: string;
  initialInspection: string[];
  technicianId?: any; // Populated User
  priority: RepairPriority;
  estimatedCost: number;
  expectedDeliveryDate?: string;
  status: RepairStatus;
  timeline: RepairTimelineEvent[];
  partsUsed: PartUsed[];
  laborCharges: LaborCharge[];
  additionalCharges: number;
  discount: number;
  payments: RepairPayment[];
  internalNotes?: string;
  customerNotes?: string;
  images: {
    before: string[];
    after: string[];
    proof: string[];
  };
  warranty?: {
    period: string;
    expiryDate: string;
    notes: string;
    status: 'Active' | 'Expired' | 'Voided';
  };
  // Virtuals
  partsTotal: number;
  laborTotal: number;
  grandTotal: number;
  totalPaid: number;
  remainingBalance: number;
  createdAt: string;
  updatedAt: string;
}
