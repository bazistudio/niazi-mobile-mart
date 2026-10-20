export type MobileCondition = 'NEW' | 'USED';

export type PtaStatus = 'PTA_APPROVED' | 'NON_PTA' | 'JV' | 'GEVEY';

export type PhysicalBodyGrade = 'PRISTINE' | 'GOOD' | 'HEAVY_WEAR' | 'DENTED';

export type ScreenCondition = 'ORIGINAL' | 'REPLACED' | 'CRACKED';

export interface MobileSpecification {
  brand: string;
  model: string;
  storage: string;
  ram: string;
  color: string;
  imei1: string;
  imei2?: string;
  serialNumber?: string;
  ptaStatus: PtaStatus;
  expectedSalePrice: number;
  costPrice: number;
  notes?: string;
}

/**
 * Used Mobile Purchase Paperwork mapped directly from physical Urdu purchase slip
 * (Niazi Mobile Mart & Repairing Centre — فارم برائے خریداری استعمال شدہ موبائل).
 * NOTE: CNIC Copy Attached field is intentionally omitted per business specification.
 */
export interface UsedMobilePaperwork {
  voucherNo: string;
  purchaseDate: string;
  purchasePrice: number;
  sellerName: string;
  fatherName: string;
  sellerCnic: string; // Formatted 13-digit Pakistani CNIC: XXXXX-XXXXXXX-X
  sellerPhone: string;
  sellerAddress: string;
  ownershipDeclarationAcknowledged: boolean;
  physicalAffidavitAcknowledged: boolean;
}

export interface MobileInspectionChecklist {
  bodyGrade: PhysicalBodyGrade;
  screenCondition: ScreenCondition;
  touchWorking: boolean;
  batteryHealthPercent?: number;
  batteryBackupOk: boolean;
  frontCameraOk: boolean;
  backCameraOk: boolean;
  speakerOk: boolean;
  microphoneOk: boolean;
  chargingPortOk: boolean;
  buttonsOk: boolean;
  biometricsOk: boolean;
  wifiBluetoothOk: boolean;
  simNetworkOk: boolean;
  accessories: {
    box: boolean;
    originalCharger: boolean;
    cable: boolean;
    handsfree: boolean;
  };
  defectNotes?: string;
}

export interface MobileFormData {
  condition: MobileCondition;
  specs: MobileSpecification;
  paperwork: UsedMobilePaperwork;
  inspection: MobileInspectionChecklist;
}

export interface MobileInventoryItem {
  id: string;
  brand: string;
  model: string;
  condition: MobileCondition;
  storage: string;
  ram: string;
  color: string;
  imei1: string;
  purchaseCost: number;
  salePrice: number;
  ptaStatus: PtaStatus;
  branch: string;
  branchName?: string;
  branchCode?: string;
  status: 'IN_STOCK' | 'SOLD' | 'INSPECTION';
  sellerName?: string;
  voucherNo?: string;
  createdAt: string;
}
