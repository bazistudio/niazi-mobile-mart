const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');

const doc = new PDFDocument();
const pdfPath = path.join(__dirname, '..', 'test-invoice.pdf');
const writeStream = fs.createWriteStream(pdfPath);

doc.pipe(writeStream);

// Add text lines matching the mobileParser service
doc.fontSize(12).text('INVOICE FOR PROCUREMENT');
doc.moveDown();
doc.text('Iphone 13 Display 5000 RS 5 pcs');
doc.text('Redmi Note 10 Battery 1200 Rs 10 pcs');
doc.text('A54 Charger 1500 PKR 3 qty');
doc.moveDown();
doc.text('Total items: 3');

doc.end();

writeStream.on('finish', () => {
  console.log('PDF generated successfully at:', pdfPath);
  process.exit(0);
});
