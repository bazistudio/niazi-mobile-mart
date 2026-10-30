import React from 'react';
import {
  Keyboard,
  Tag,
  DollarSign,
  ShieldCheck,
  AlertTriangle,
  Radio,
  Flashlight,
  Volume2,
  Mic,
  Battery,
  Plug,
  Monitor,
  Package,
} from 'lucide-react';
import { Card, Badge } from '@/components/ui';
import type { PtaStatus } from '../types/mobile.types';

export interface KeypadFormData {
  brand: string;
  model: string;
  color: string;
  imei1: string;
  imei2: string;
  ptaStatus: PtaStatus;
  costPrice: number;
  expectedSalePrice: number;
  notes: string;
  // Keypad-specific hardware & inspection checklist
  keypadButtonsWorking: boolean;
  torchWorking: boolean;
  displayWorking: boolean;
  speakerWorking: boolean;
  microphoneWorking: boolean;
  chargingPortWorking: boolean;
  batteryWorking: boolean;
  simNetworkWorking: boolean;
  memoryCardSlotWorking: boolean;
  // Included accessories
  originalBatteryIncluded: boolean;
  chargerIncluded: boolean;
  boxIncluded: boolean;
}

export const INITIAL_KEYPAD_FORM_DATA: KeypadFormData = {
  brand: '',
  model: '',
  color: '',
  imei1: '',
  imei2: '',
  ptaStatus: 'PTA_APPROVED',
  costPrice: 0,
  expectedSalePrice: 0,
  notes: '',
  keypadButtonsWorking: true,
  torchWorking: true,
  displayWorking: true,
  speakerWorking: true,
  microphoneWorking: true,
  chargingPortWorking: true,
  batteryWorking: true,
  simNetworkWorking: true,
  memoryCardSlotWorking: true,
  originalBatteryIncluded: true,
  chargerIncluded: false,
  boxIncluded: false,
};

export const POPULAR_KEYPAD_BRANDS = [
  'Nokia',
  'Itel',
  'QMobile',
  'Jazz Digit',
  'GFive',
  'Infinix',
  'Dcode',
  'Voice',
  'Vgo Tel',
  'Calme',
];

interface KeypadSpecsSectionProps {
  data: KeypadFormData;
  onChange: (updater: (prev: KeypadFormData) => KeypadFormData) => void;
  isUsed: boolean;
  imeiCheckStatus: 'idle' | 'checking' | 'available' | 'taken';
  imeiCheckMessage: string | null;
  onImei1Change: (val: string) => void;
}

export const KeypadSpecsSection: React.FC<KeypadSpecsSectionProps> = ({
  data,
  onChange,
  isUsed,
  imeiCheckStatus,
  imeiCheckMessage,
  onImei1Change,
}) => {
  return (
    <div className="flex flex-col gap-6">
      {/* 1. Core Keypad Device Identity */}
      <Card variant="default" padding="lg" className="bg-surface border-border">
        <div className="flex items-center gap-2.5 pb-4 border-b border-border mb-6">
          <div className="p-1.5 bg-primary/10 rounded text-primary">
            <Keyboard className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-base font-bold text-text-primary">
              Keypad Phone Specifications
            </h3>
            <p className="text-xs text-text-muted mt-0.5">
              Enter basic handset identification, dual IMEIs, and network approval.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {/* Brand */}
          <div>
            <label className="block text-xs font-semibold text-text-secondary mb-1.5">
              Brand Name <span className="text-danger">*</span>
            </label>
            <input
              type="text"
              list="keypad-brand-suggestions"
              value={data.brand}
              onChange={(e) => onChange((prev) => ({ ...prev, brand: e.target.value }))}
              placeholder="e.g. Nokia, Itel, QMobile"
              className="w-full px-3 py-2 text-sm bg-surface text-text-primary border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/40"
            />
            <datalist id="keypad-brand-suggestions">
              {POPULAR_KEYPAD_BRANDS.map((b) => (
                <option key={b} value={b} />
              ))}
            </datalist>
          </div>

          {/* Model */}
          <div>
            <label className="block text-xs font-semibold text-text-secondary mb-1.5">
              Model Name / Number <span className="text-danger">*</span>
            </label>
            <input
              type="text"
              value={data.model}
              onChange={(e) => onChange((prev) => ({ ...prev, model: e.target.value }))}
              placeholder="e.g. 105, 106, Magic 2, Digit 4G"
              className="w-full px-3 py-2 text-sm bg-surface text-text-primary border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/40"
            />
          </div>

          {/* Color */}
          <div>
            <label className="block text-xs font-semibold text-text-secondary mb-1.5">
              Color
            </label>
            <input
              type="text"
              value={data.color}
              onChange={(e) => onChange((prev) => ({ ...prev, color: e.target.value }))}
              placeholder="e.g. Black, Dark Blue, Cyan"
              className="w-full px-3 py-2 text-sm bg-surface text-text-primary border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/40"
            />
          </div>

          {/* Primary IMEI */}
          <div>
            <label className="block text-xs font-semibold text-text-secondary mb-1.5">
              Primary IMEI (SIM 1) <span className="text-danger">*</span>
            </label>
            <input
              type="text"
              maxLength={15}
              value={data.imei1}
              onChange={(e) => {
                const numeric = e.target.value.replace(/\D/g, '');
                onChange((prev) => ({ ...prev, imei1: numeric }));
                onImei1Change(numeric);
              }}
              placeholder="15 numeric digits"
              className="w-full px-3 py-2 text-sm font-mono bg-surface text-text-primary border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/40"
            />
            {imeiCheckStatus === 'checking' && (
              <span className="text-[11px] text-text-muted mt-1 block">Checking IMEI availability...</span>
            )}
            {imeiCheckStatus === 'available' && (
              <span className="text-[11px] text-success mt-1 block flex items-center gap-1">
                <ShieldCheck className="w-3 h-3" /> Available
              </span>
            )}
            {imeiCheckStatus === 'taken' && (
              <span className="text-[11px] text-danger mt-1 block flex items-center gap-1">
                <AlertTriangle className="w-3 h-3" /> Already registered
              </span>
            )}
          </div>

          {/* Secondary IMEI */}
          <div>
            <label className="block text-xs font-semibold text-text-secondary mb-1.5">
              Secondary IMEI (SIM 2 - Optional)
            </label>
            <input
              type="text"
              maxLength={15}
              value={data.imei2}
              onChange={(e) => {
                const numeric = e.target.value.replace(/\D/g, '');
                onChange((prev) => ({ ...prev, imei2: numeric }));
              }}
              placeholder="15 digits (Dual SIM)"
              className="w-full px-3 py-2 text-sm font-mono bg-surface text-text-primary border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/40"
            />
          </div>

          {/* PTA Status */}
          <div>
            <label className="block text-xs font-semibold text-text-secondary mb-1.5">
              PTA Registration Status <span className="text-danger">*</span>
            </label>
            <select
              value={data.ptaStatus}
              onChange={(e) => onChange((prev) => ({ ...prev, ptaStatus: e.target.value as PtaStatus }))}
              className="w-full px-3 py-2 text-sm bg-surface text-text-primary border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/40 cursor-pointer"
            >
              <option value="PTA_APPROVED">PTA Approved (Official)</option>
              <option value="NON_PTA">Non-PTA (Unregistered)</option>
              <option value="JV">JV (Network Locked)</option>
              <option value="GEVEY">Gevey</option>
            </select>
          </div>
        </div>

        {/* Pricing for NEW Keypad */}
        {!isUsed && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 mt-6 pt-5 border-t border-border">
            <div>
              <label className="block text-xs font-semibold text-text-secondary mb-1.5">
                Purchase / Cost Price (Rs.) <span className="text-danger">*</span>
              </label>
              <input
                type="number"
                min={0}
                value={data.costPrice || ''}
                onChange={(e) => onChange((prev) => ({ ...prev, costPrice: Number(e.target.value) }))}
                placeholder="0"
                className="w-full px-3 py-2 text-sm font-semibold bg-surface text-text-primary border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/40"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-text-secondary mb-1.5">
                Expected Sale Price (Rs.)
              </label>
              <input
                type="number"
                min={0}
                value={data.expectedSalePrice || ''}
                onChange={(e) => onChange((prev) => ({ ...prev, expectedSalePrice: Number(e.target.value) }))}
                placeholder="0"
                className="w-full px-3 py-2 text-sm font-semibold text-primary bg-surface border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/40"
              />
            </div>
          </div>
        )}
      </Card>

      {/* 2. Keypad-Specific Hardware Checkpoints */}
      <Card variant="default" padding="lg" className="bg-surface border-border">
        <div className="flex items-center gap-2.5 pb-4 border-b border-border mb-6">
          <div className="p-1.5 bg-primary/10 rounded text-primary">
            <Radio className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-base font-bold text-text-primary">
              Keypad Functional Inspection Checklist
            </h3>
            <p className="text-xs text-text-muted mt-0.5">
              Verify physical buttons, torch, charging, and call audio functionality.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
          {/* Keypad Buttons */}
          <label className="flex items-center gap-2.5 p-3 rounded-lg border border-border hover:bg-surface-hover cursor-pointer transition-colors">
            <input
              type="checkbox"
              checked={data.keypadButtonsWorking}
              onChange={(e) => onChange((prev) => ({ ...prev, keypadButtonsWorking: e.target.checked }))}
              className="w-4 h-4 text-primary rounded"
            />
            <span className="text-xs font-medium text-text-primary flex items-center gap-1.5">
              <Keyboard className="w-3.5 h-3.5 text-text-muted" /> All Buttons OK
            </span>
          </label>

          {/* Torch Light */}
          <label className="flex items-center gap-2.5 p-3 rounded-lg border border-border hover:bg-surface-hover cursor-pointer transition-colors">
            <input
              type="checkbox"
              checked={data.torchWorking}
              onChange={(e) => onChange((prev) => ({ ...prev, torchWorking: e.target.checked }))}
              className="w-4 h-4 text-primary rounded"
            />
            <span className="text-xs font-medium text-text-primary flex items-center gap-1.5">
              <Flashlight className="w-3.5 h-3.5 text-text-muted" /> Torch / Flashlight OK
            </span>
          </label>

          {/* Display */}
          <label className="flex items-center gap-2.5 p-3 rounded-lg border border-border hover:bg-surface-hover cursor-pointer transition-colors">
            <input
              type="checkbox"
              checked={data.displayWorking}
              onChange={(e) => onChange((prev) => ({ ...prev, displayWorking: e.target.checked }))}
              className="w-4 h-4 text-primary rounded"
            />
            <span className="text-xs font-medium text-text-primary flex items-center gap-1.5">
              <Monitor className="w-3.5 h-3.5 text-text-muted" /> Display Screen Clean
            </span>
          </label>

          {/* Speaker */}
          <label className="flex items-center gap-2.5 p-3 rounded-lg border border-border hover:bg-surface-hover cursor-pointer transition-colors">
            <input
              type="checkbox"
              checked={data.speakerWorking}
              onChange={(e) => onChange((prev) => ({ ...prev, speakerWorking: e.target.checked }))}
              className="w-4 h-4 text-primary rounded"
            />
            <span className="text-xs font-medium text-text-primary flex items-center gap-1.5">
              <Volume2 className="w-3.5 h-3.5 text-text-muted" /> Ringer / Speaker OK
            </span>
          </label>

          {/* Microphone */}
          <label className="flex items-center gap-2.5 p-3 rounded-lg border border-border hover:bg-surface-hover cursor-pointer transition-colors">
            <input
              type="checkbox"
              checked={data.microphoneWorking}
              onChange={(e) => onChange((prev) => ({ ...prev, microphoneWorking: e.target.checked }))}
              className="w-4 h-4 text-primary rounded"
            />
            <span className="text-xs font-medium text-text-primary flex items-center gap-1.5">
              <Mic className="w-3.5 h-3.5 text-text-muted" /> Call Mic OK
            </span>
          </label>

          {/* Charging Port */}
          <label className="flex items-center gap-2.5 p-3 rounded-lg border border-border hover:bg-surface-hover cursor-pointer transition-colors">
            <input
              type="checkbox"
              checked={data.chargingPortWorking}
              onChange={(e) => onChange((prev) => ({ ...prev, chargingPortWorking: e.target.checked }))}
              className="w-4 h-4 text-primary rounded"
            />
            <span className="text-xs font-medium text-text-primary flex items-center gap-1.5">
              <Plug className="w-3.5 h-3.5 text-text-muted" /> Charging Port OK
            </span>
          </label>

          {/* Battery */}
          <label className="flex items-center gap-2.5 p-3 rounded-lg border border-border hover:bg-surface-hover cursor-pointer transition-colors">
            <input
              type="checkbox"
              checked={data.batteryWorking}
              onChange={(e) => onChange((prev) => ({ ...prev, batteryWorking: e.target.checked }))}
              className="w-4 h-4 text-primary rounded"
            />
            <span className="text-xs font-medium text-text-primary flex items-center gap-1.5">
              <Battery className="w-3.5 h-3.5 text-text-muted" /> Battery Backup OK
            </span>
          </label>

          {/* SIM Signals */}
          <label className="flex items-center gap-2.5 p-3 rounded-lg border border-border hover:bg-surface-hover cursor-pointer transition-colors">
            <input
              type="checkbox"
              checked={data.simNetworkWorking}
              onChange={(e) => onChange((prev) => ({ ...prev, simNetworkWorking: e.target.checked }))}
              className="w-4 h-4 text-primary rounded"
            />
            <span className="text-xs font-medium text-text-primary flex items-center gap-1.5">
              <Radio className="w-3.5 h-3.5 text-text-muted" /> SIM 1 & 2 Signals OK
            </span>
          </label>
        </div>

        {/* Accessories Included */}
        <div className="mt-6 pt-5 border-t border-border">
          <label className="block text-xs font-semibold text-text-secondary mb-3">
            Package & Included Accessories
          </label>
          <div className="flex flex-wrap items-center gap-4">
            <label className="flex items-center gap-2 text-xs text-text-primary cursor-pointer">
              <input
                type="checkbox"
                checked={data.originalBatteryIncluded}
                onChange={(e) => onChange((prev) => ({ ...prev, originalBatteryIncluded: e.target.checked }))}
                className="w-4 h-4 text-primary rounded"
              />
              <span>Original Battery</span>
            </label>

            <label className="flex items-center gap-2 text-xs text-text-primary cursor-pointer">
              <input
                type="checkbox"
                checked={data.chargerIncluded}
                onChange={(e) => onChange((prev) => ({ ...prev, chargerIncluded: e.target.checked }))}
                className="w-4 h-4 text-primary rounded"
              />
              <span>Charger Included</span>
            </label>

            <label className="flex items-center gap-2 text-xs text-text-primary cursor-pointer">
              <input
                type="checkbox"
                checked={data.boxIncluded}
                onChange={(e) => onChange((prev) => ({ ...prev, boxIncluded: e.target.checked }))}
                className="w-4 h-4 text-primary rounded"
              />
              <span>Box / Packing</span>
            </label>
          </div>
        </div>
      </Card>
    </div>
  );
};
