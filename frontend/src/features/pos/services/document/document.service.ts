import { DBTransaction } from '@/types/db.types';

export interface ShopProfile {
  name: string;
  address: string;
  phone?: string;
  logo?: string;
}

export interface InvoiceDocument {
  invoiceId: string;
  transactionId: string;

  shop: ShopProfile;

  items: {
    name: string;
    qty: number;
    price: number;
    discount: number;
    subtotal: number;
  }[];

  summary: {
    subtotal: number;
    discountTotal: number;
    total: number;

    paid: number;
    due: number;
    change: number;
  };

  paymentBreakdown: {
    method: string;
    amount: number;
  }[];

  createdAt: number;
  version: number;
}

export class DocumentService {
  static buildInvoice(transaction: DBTransaction, shopProfile: ShopProfile): InvoiceDocument {
    return {
      invoiceId: `INV-${transaction.transactionId}`,
      transactionId: transaction.transactionId,

      shop: shopProfile,

      items: transaction.items.map(i => ({
        name: i.productName,
        qty: i.quantity,
        price: i.unitPrice,
        discount: i.discount,
        subtotal: i.subtotal
      })),

      summary: {
        subtotal: transaction.subtotal,
        discountTotal: transaction.discountTotal,
        total: transaction.grandTotal,
        paid: transaction.totalPaid,
        due: transaction.remainingDue,
        change: transaction.changeReturned
      },

      paymentBreakdown: transaction.paymentBreakdown || [],

      createdAt: transaction.createdAt,
      version: 1
    };
  }

  static async logPrint(invoiceId: string, action: 'PRINT' | 'PDF' | 'REPRINT') {
    console.log(`[PRINT LOG] Invoice ${invoiceId} logged action: ${action}`);
    return Promise.resolve();
  }

  static async generatePDF(invoice: InvoiceDocument) {
    const element = document.getElementById("print-area");
    if (!element) return;

    const [{ default: html2canvas }, { default: jsPDF }] = await Promise.all([
      import('html2canvas'),
      import('jspdf')
    ]);

    const canvas = await html2canvas(element, {
      scale: 2
    });

    const imgData = canvas.toDataURL("image/png");

    const pdf = new jsPDF("p", "mm", "a4");
    
    // Auto-scale width to 190mm (A4 margin), calculate height proportionally
    const pdfWidth = 190;
    const pdfHeight = (canvas.height * pdfWidth) / canvas.width;
    
    pdf.addImage(imgData, "PNG", 10, 10, pdfWidth, pdfHeight);

    pdf.save(`${invoice.invoiceId}.pdf`);
  }

  static async generateLedgerPDF(elementId: string, customerName: string) {
    const element = document.getElementById(elementId);
    if (!element) throw new Error("Could not find ledger element");

    const [{ default: html2canvas }, { default: jsPDF }] = await Promise.all([
      import('html2canvas'),
      import('jspdf')
    ]);

    const canvas = await html2canvas(element, { scale: 2 });
    const imgData = canvas.toDataURL("image/png");
    const pdf = new jsPDF("p", "mm", "a4");
    
    // Header
    pdf.setFontSize(16);
    pdf.text("Customer Ledger Statement", 10, 15);
    pdf.setFontSize(12);
    pdf.text(`Customer: ${customerName}`, 10, 22);
    pdf.text(`Generated: ${new Date().toLocaleDateString()}`, 10, 28);
    
    // Auto-scale width to 190mm (A4 margin), calculate height proportionally
    const pdfWidth = 190;
    const pageHeight = 297;
    const imgHeight = (canvas.height * pdfWidth) / canvas.width;
    let heightLeft = imgHeight;
    let position = 35; // Initial Y offset below header
    
    // Place ledger image below header
    pdf.addImage(imgData, "PNG", 10, position, pdfWidth, imgHeight);
    heightLeft -= (pageHeight - position);

    // Multi-page logic
    while (heightLeft >= 0) {
      position = heightLeft - imgHeight;
      pdf.addPage();
      pdf.addImage(imgData, "PNG", 10, position, pdfWidth, imgHeight);
      heightLeft -= pageHeight;
    }

    pdf.save(`Ledger_${customerName.replace(/\s+/g, '_')}.pdf`);
  }

}
