import { ParsedInvoice, UnifiedImportPayload } from '../types/import.types';
import { normalizePakPhone } from '@/utils/phoneUtils';

export const parseInvoiceData = (text: string): ParsedInvoice => {
  const nameMatch = text.match(/Customer:\s*([a-zA-Z\s]+)/i) || text.match(/Name:\s*([a-zA-Z\s]+)/i);
  const phoneMatch = text.match(/Phone:\s*([\d\-\+\s]+)/i) || text.match(/Mobile:\s*([\d\-\+\s]+)/i);
  const totalMatch = text.match(/Total(?: Amount)?:\s*(?:Rs\.?|PKR)?\s*([\d,\.]+)/i);
  const dateMatch = text.match(/Date:\s*([\d\/\-\.]+)/i);

  const customerName = nameMatch ? nameMatch[1].trim() : 'Unknown Customer';
  let phone = phoneMatch ? phoneMatch[1].trim() : '';
  phone = phone ? normalizePakPhone(phone) : '00000000000';

  const rawTotal = totalMatch ? totalMatch[1].replace(/,/g, '') : '0';
  const totalAmount = parseFloat(rawTotal) || 0;
  
  const date = dateMatch ? dateMatch[1].trim() : new Date().toLocaleDateString();

  const items: ParsedInvoice['items'] = [];
  const itemRegex = /(\d+)\s*x\s*([\d,\.]+)\s*([a-zA-Z0-9\s]+)/gi;
  let match;
  while ((match = itemRegex.exec(text)) !== null) {
    items.push({
      qty: parseInt(match[1]),
      price: parseFloat(match[2].replace(/,/g, '')),
      name: match[3].trim()
    });
  }

  return {
    customerName,
    phone,
    totalAmount,
    date,
    items
  };
};

export const normalizeImportPayload = (parsedData: ParsedInvoice): UnifiedImportPayload => {
  return {
    type: 'invoice-import',
    customer: {
      name: parsedData.customerName,
      phone: parsedData.phone
    },
    items: parsedData.items,
    totalAmount: parsedData.totalAmount,
    date: parsedData.date,
    source: 'pdf'
  };
};

export const validateParsedData = (data: ParsedInvoice): string[] => {
  return [];
};
