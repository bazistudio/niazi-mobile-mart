const PDFDocument = require('pdfkit');

/**
 * Generate a professional PDF invoice
 * @param {Object} invoice - The invoice data
 * @param {Object} shop - The shop/business data
 * @returns {Promise<Buffer>} - PDF buffer
 */
exports.generateInvoicePDF = (invoice, shop) => {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 50 });
    let buffers = [];
    doc.on('data', buffers.push.bind(buffers));
    doc.on('end', () => resolve(Buffer.concat(buffers)));
    doc.on('error', reject);

    // ─── Header ──────────────────────────────────────────────────────────────
    doc
      .fillColor('#444444')
      .fontSize(20)
      .text(shop.name || 'TijaratPro Business', 50, 57)
      .fontSize(10)
      .text(shop.address || '', 50, 80)
      .text(`${shop.city || ''}, ${shop.phone || ''}`, 50, 95)
      .moveDown();

    doc
      .fillColor('#000000')
      .fontSize(25)
      .text('INVOICE', 0, 57, { align: 'right' })
      .fontSize(10)
      .text(`Invoice #: ${invoice.invoiceNumber}`, 0, 90, { align: 'right' })
      .text(`Date: ${new Date(invoice.issuedAt).toLocaleDateString()}`, 0, 105, { align: 'right' })
      .text(`Status: ${invoice.status.toUpperCase()}`, 0, 120, { align: 'right' })
      .moveDown();

    doc.moveTo(50, 150).lineTo(550, 150).stroke();

    // ─── Customer Details ────────────────────────────────────────────────────
    doc
      .fontSize(12)
      .text('Bill To:', 50, 170)
      .fontSize(10)
      .text(invoice.customerId?.name || 'Walk-in Customer', 50, 185)
      .text(invoice.customerId?.email || '', 50, 200)
      .text(invoice.customerId?.phone || '', 50, 215)
      .moveDown();

    // ─── Items Table ─────────────────────────────────────────────────────────
    const tableTop = 260;
    doc.fontSize(10).font('Helvetica-Bold');
    doc.text('Item', 50, tableTop);
    doc.text('Qty', 280, tableTop, { width: 50, align: 'right' });
    doc.text('Price', 350, tableTop, { width: 70, align: 'right' });
    doc.text('Total', 450, tableTop, { width: 100, align: 'right' });

    doc.moveTo(50, tableTop + 15).lineTo(550, tableTop + 15).stroke();

    let i = 0;
    doc.font('Helvetica');
    invoice.items.forEach(item => {
      const y = tableTop + 30 + (i * 25);
      doc.text(item.name, 50, y);
      doc.text(item.quantity.toString(), 280, y, { width: 50, align: 'right' });
      doc.text(item.price.toFixed(2), 350, y, { width: 70, align: 'right' });
      doc.text(item.total.toFixed(2), 450, y, { width: 100, align: 'right' });
      i++;
    });

    const subtotalY = tableTop + 40 + (i * 25);
    doc.moveTo(350, subtotalY).lineTo(550, subtotalY).stroke();

    doc.fontSize(10).font('Helvetica-Bold');
    doc.text('Subtotal:', 350, subtotalY + 10, { width: 70, align: 'right' });
    doc.font('Helvetica').text(invoice.subtotal.toFixed(2), 450, subtotalY + 10, { width: 100, align: 'right' });

    doc.font('Helvetica-Bold').text('Tax:', 350, subtotalY + 25, { width: 70, align: 'right' });
    doc.font('Helvetica').text(invoice.tax.toFixed(2), 450, subtotalY + 25, { width: 100, align: 'right' });

    doc.fontSize(12).font('Helvetica-Bold');
    doc.text('Grand Total:', 350, subtotalY + 45, { width: 70, align: 'right' });
    doc.text(invoice.grandTotal.toFixed(2), 450, subtotalY + 45, { width: 100, align: 'right' });

    // ─── Footer ──────────────────────────────────────────────────────────────
    doc
      .fontSize(10)
      .fillColor('#777777')
      .text('Thank you for your business!', 50, 700, { align: 'center', width: 500 });

    doc.end();
  });
};
