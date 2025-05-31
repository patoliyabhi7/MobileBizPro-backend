const mongoose = require('mongoose');
const puppeteer = require('puppeteer');
const Sale = require('../../models/saleModel');
const InvoiceLayout = require('../../models/invoiceLayoutModel');
const path = require('path');

exports.generateInvoice = async (req, res) => {
  try {
    const { saleId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(saleId)) {
      return res.status(400).json({ error: 'Invalid Sale ID format' });
    }

    const sale = await Sale.findById(saleId)
      .populate('customer')
      .populate('addedBy')
      .populate('businessLocation')
      .populate('products.product')
      .populate('payments.method')
      .populate('payments.account');

    if (!sale || sale.isDeleted) {
      return res.status(404).json({ error: 'Sale not found' });
    }

    const layout = await InvoiceLayout.findOne({ isDefault: true, isDeleted: false });

    if (!layout) {
      return res.status(400).json({ error: 'Default invoice layout not set' });
    }

    const totalQuantity = sale.products.reduce((sum, p) => sum + (p.quantity || 0), 0);
    const totalPaid = sale.payments.reduce((sum, p) => sum + (p.amount || 0), 0);
    const totalInWords = numberToWords(sale.total || 0);

    const productRows = sale.products.map(prod => `
      <tr>
        <td>${prod.product?.name || ''}</td>
        <td>${prod.imeiNo || '-'}</td>
        <td>${prod.color || '-'}</td>
        <td>${prod.storage || '-'}</td>
        <td>${prod.quantity || 0}</td>
        <td>${(prod.unitPrice || 0).toFixed(2)}</td>
        <td>${(prod.lineTotal || 0).toFixed(2)}</td>
      </tr>
    `).join('');

    const paymentRows = sale.payments.map(p => `
      <tr>
        <td>${p.method?.name || '-'}</td>
        <td>${p.account?.name || '-'}</td>
        <td>${p.paymentRefNo || '-'}</td>
        <td>${formatDate(p.paidOn)}</td>
        <td>${(p.amount || 0).toFixed(2)}</td>
      </tr>
    `).join('');

    const logoPath = layout.logo ? `file://${path.join(__dirname, '../../uploads/', layout.logo)}` : '';

    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; margin: 40px; }
          .header, .footer { text-align: center; }
          .logo { max-height: 80px; }
          .invoice-box { width: 100%; border-collapse: collapse; margin-top: 20px; }
          .invoice-box th, .invoice-box td { border: 1px solid #ddd; padding: 8px; }
          .invoice-box th { background-color: #f2f2f2; }
          .section-title { margin-top: 40px; font-size: 18px; font-weight: bold; }
          .totals td { font-weight: bold; }
        </style>
      </head>
      <body>
        <div class="header">
          ${logoPath ? `<img src="${logoPath}" class="logo"><br>` : ''}
          <h1>${layout.shopName}</h1>
          <p>${layout.slogan || ''}</p>
          <p>${layout.address || ''}</p>
          <p>Mobile: ${layout.mobileNumber || ''}</p>
        </div>

        <hr>

        <h2>Invoice</h2>
        <p><strong>Invoice No:</strong> ${sale.invoiceNo || sale._id.toString()}</p>
        <p><strong>Date:</strong> ${formatDate(sale.saleDate)}</p>

        <h3>Customer Details</h3>
        <p><strong>Name:</strong> ${sale.customer?.firstName || ''} ${sale.customer?.lastName || ''}</p>
        <p><strong>Mobile:</strong> ${sale.customer?.mobileNumber || '-'}</p>

        <div class="section-title">Products</div>
        <table class="invoice-box">
          <thead>
            <tr>
              <th>Product</th>
              <th>IMEI</th>
              <th>Color</th>
              <th>Storage</th>
              <th>Qty</th>
              <th>Unit Price</th>
              <th>Line Total</th>
            </tr>
          </thead>
          <tbody>${productRows}</tbody>
        </table>

        <div class="section-title">Payments</div>
        <table class="invoice-box">
          <thead>
            <tr>
              <th>Method</th>
              <th>Account</th>
              <th>Reference</th>
              <th>Paid On</th>
              <th>Amount</th>
            </tr>
          </thead>
          <tbody>${paymentRows}</tbody>
        </table>

        <div class="section-title">Summary</div>
        <table class="invoice-box">
          <tbody class="totals">
            <tr><td>Total Quantity</td><td>${totalQuantity}</td></tr>
            <tr><td>Subtotal</td><td>${(sale.total || 0).toFixed(2)}</td></tr>
            <tr><td>Total Paid</td><td>${totalPaid.toFixed(2)}</td></tr>
            <tr><td>Total</td><td>${(sale.total || 0).toFixed(2)}</td></tr>
            <tr><td>Total in Words</td><td>${totalInWords}</td></tr>
          </tbody>
        </table>

        <div class="section-title">Terms and Conditions</div>
        <p>${layout.termsAndConditions || 'Thank you for shopping with us!'}</p>

        <div class="footer">
          <p>Thank you for your business!</p>
        </div>
      </body>
      </html>
    `;

    const browser = await puppeteer.launch({ headless: 'new' });
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'networkidle0' });

    const pdfBuffer = await page.pdf({ format: 'A4' });
    await browser.close();

    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename=invoice-${sale.invoiceNo || sale._id}.pdf`,
    });

    return res.send(pdfBuffer);
  } catch (err) {
    console.error('Error generating invoice:', err);
    res.status(500).json({ error: err.message });
  }
};

// Format date to dd/mm/yyyy
function formatDate(date) {
  const d = new Date(date);
  return isNaN(d) ? '-' : `${d.getDate().toString().padStart(2, '0')}/${(d.getMonth() + 1)
    .toString().padStart(2, '0')}/${d.getFullYear()}`;
}

// Helper: Convert number to words (basic Indian style)
function numberToWords(num) {
  const a = [
    '', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine',
    'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen',
    'Seventeen', 'Eighteen', 'Nineteen',
  ];
  const b = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

  if ((num = num.toString()).length > 9) return 'Overflow';
  let n = ('000000000' + num).substr(-9).match(/.{1,3}/g);
  let str = '';
  str += (n[0] != 0) ? (a[Number(n[0])] || b[n[0][0]] + ' ' + a[n[0][1]]) + ' Crore ' : '';
  str += (n[1] != 0) ? (a[Number(n[1])] || b[n[1][0]] + ' ' + a[n[1][1]]) + ' Lakh ' : '';
  str += (n[2] != 0) ? (a[Number(n[2])] || b[n[2][0]] + ' ' + a[n[2][1]]) + ' Thousand ' : '';
  str += (n[3] != 0) ? (a[Number(n[3])] || b[n[3][0]] + ' ' + a[n[3][1]]) + ' Hundred ' : '';
  str += (n[4] != 0) ? ((str != '') ? 'and ' : '') + (a[Number(n[4])] || b[n[4][0]] + ' ' + a[n[4][1]]) : '';
  return str.trim() + ' Only';
}
