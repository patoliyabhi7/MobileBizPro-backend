const mongoose = require('mongoose');
const puppeteer = require('puppeteer');
const numberToWords = require('number-to-words');
const Sale = require('../../models/saleModel');
const InvoiceLayout = require('../../models/invoiceLayoutModel');
const path = require('path');
const fs = require('fs');

exports.generateInvoice = async (req, res) => {
    try {
        const { saleId } = req.params;

        if (!mongoose.Types.ObjectId.isValid(saleId)) {
            return res.status(400).json({ error: 'Invalid Sale ID format' });
        }

        // Fetch sale data with relations
        const sale = await Sale.findOne({ _id: saleId })
            .populate('customer')
            .populate('addedBy')
            .populate('businessLocation')
            .populate({
                path: 'products.product',
                populate: {
                    path: 'brand',
                },
            })
            .populate('payments.method')
            .populate('payments.account');

        if (!sale || sale.isDeleted) {
            return res.status(404).json({ error: 'Sale not found' });
        }

        // Fetch default invoice layout
        const layout = await InvoiceLayout.findOne({ isDefault: true, isDeleted: false });
        if (!layout) {
            return res.status(400).json({ error: 'Default invoice layout not set' });
        }

        // Calculate totals and words
        const totalQuantity = sale.products.reduce((sum, p) => sum + (p.quantity || 0), 0);
        const totalPaid = sale.payments.reduce((sum, p) => sum + (p.amount || 0), 0);
        const paymentDue = (sale.total || 0) - totalPaid;
        const totalInWords = capitalizeFirstChar(numberToIndianWords(Math.floor(sale.total || 0))) + ' rupees only';

        // Prepare logo as base64 if exists
        let logoTag = `<strong>${layout.shopName || ''}</strong>`;

        // Only try to embed if logo is defined
        if (layout.logo) {
            // Full path to logo file
            const logoPath = path.join(__dirname, '../../uploads', path.basename(layout.logo));
            
            if (fs.existsSync(logoPath)) {
                const imgData = fs.readFileSync(logoPath).toString('base64');
                const ext = path.extname(layout.logo).toLowerCase();
                const mime = ext === '.png' ? 'image/png' : 'image/jpeg';

                logoTag = `<img src="data:${mime};base64,${imgData}" style="height:150px; width:auto;">`;
            } else {
                console.warn('Logo file not found:', logoPath);
            }
        }

        // Generate product table rows with your specific columns including IMEI
        const productRows = sale.products
            .map((p, i) => `
    <tr>
      <td>${i + 1}</td>
      <td>
        ${p.product?.brand?.name + " " + p.product?.productName + " " + p.storage + " " + p.color || ''}
      </td>
      <td>${p.imeiNo || '-'}</td>
      <td>${p.quantity || 0}</td>
      <td>₹${(p.unitPrice || 0).toFixed(2)}</td>
      <td>₹${(p.lineTotal || 0).toFixed(2)}</td>
    </tr>
  `)
            .join('');


        // HTML invoice with your exact style and black color, modern border styles
        const html = `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8" />
      <title>Invoice</title>
      <style>
        body {
          font-family: "Segoe UI", Tahoma, Geneva, Verdana, sans-serif;
          margin: 0;
          padding: 20px;
          background: #fff;
          color: #000;
          font-size: 14px;
        }
        .invoice-box {
          max-width: 820px;
          margin: auto;
          padding: 30px;
          border: 2px solid #000;
          border-radius: 8px;
        }
        .header {
          display: flex;
          justify-content: space-between;
          align-items: center;
        }
        .header img {
          max-height: 100px;
        }
        .shop-info {
          text-align: right;
        }
        .shop-info h2 {
          font-size: 22px;
          margin: 0;
        }
        .shop-info p {
          font-size: 12px;
          margin: 2px 0;
        }
        hr {
          border: 1px dashed #000;
          margin: 20px 0;
        }
        .customer-info,
        .invoice-meta {
          display: flex;
          justify-content: space-between;
          font-size: 13px;
          margin-bottom: 10px;
        }
        table.table {
          width: 100%;
          border-collapse: collapse;
          margin-top: 20px;
          font-size: 13px;
          border: none;
        }
        table.table thead th {
          border-bottom: 2px solid #000;
          padding: 10px 8px;
          font-weight: 600;
          text-align: left;
        }
        table.table tbody tr:not(:last-child) {
          border-bottom: 1px solid #ccc;
        }
        table.table tbody td {
          padding: 12px 8px;
          vertical-align: middle;
        }
        /* Zebra stripes */
        table.table tbody tr:nth-child(even) {
          background-color: #f9f9f9;
        }
        .summary {
          margin-top: 30px;
          font-size: 13px;
        }
        .summary table {
          width: 100%;
          border-collapse: collapse;
        }
        .summary td {
          padding: 6px 0;
          border-bottom: 1px solid #ddd;
        }
        .summary tr.total td {
          font-weight: bold;
          font-size: 14px;
          border-bottom: none;
        }
        .terms {
          margin-top: 25px;
          font-size: 12px;
          line-height: 1.6;
        }
        .terms h4 {
          margin-bottom: 6px;
          font-size: 13px;
          text-decoration: underline;
        }
      </style>
    </head>
    <body>
      <div class="invoice-box">
        <div class="header">
          <div class="logo">${logoTag}</div>
          <div class="shop-info">
            <h2>${layout.shopName || ''}</h2>
            <p>${layout.slogan || ''}</p>
            <p>${layout.address || ''}</p>
            <p>Mobile: ${layout.mobileNumber || '-'}</p>
          </div>
        </div>

        <hr />

        <div class="customer-info">
          <div>
            <strong>Customer:</strong> ${sale.customer?.firstName || ''} ${sale.customer?.lastName || ''}<br/>
            <strong>Mobile:</strong> ${sale.contactNumber || '-'}
          </div>
          <div class="invoice-meta">
            <div>
              <strong>Invoice #:</strong> ${sale.invoiceNo || sale._id}<br/>
              <strong>Date:</strong> ${formatDate(sale.saleDate)}
            </div>
          </div>
        </div>

        <table class="table" cellpadding="0" cellspacing="0">
          <thead>
            <tr>
              <th>#</th>
              <th>Product Detail</th>
              <th>IMEI</th>
              <th>Qty</th>
              <th>Unit Price</th>
              <th>Subtotal</th>
            </tr>
          </thead>
          <tbody>
            ${productRows}
          </tbody>
        </table>

        <div class="summary">
          <table>
            <tr>
              <td><strong>Payment Method:</strong></td>
              <td>${sale.payments[0]?.method?.name || '-'}</td>
            </tr>
            <tr>
              <td>Total Quantity:</td>
              <td>${totalQuantity}</td>
            </tr>
            <tr>
              <td>Subtotal:</td>
              <td>₹${(sale.total || 0).toFixed(2)}</td>
            </tr>
            <tr class="total">
              <td>Total Paid:</td>
              <td>₹${totalPaid.toFixed(2)}</td>
            </tr>
            <tr class="total">
              <td>Payment Due:</td>
              <td>₹${paymentDue.toFixed(2)}</td>
            </tr>
            <tr class="total">
              <td>Total (in words):</td>
              <td>${totalInWords}</td>
            </tr>
          </table>
        </div>

        <div class="terms">
          <h4>Terms & Conditions</h4>
          <p>${layout.termsAndConditions || 'Thank you for your purchase!'}</p>
        </div>
      </div>
    </body>
    </html>
    `;

        // Launch puppeteer to generate PDF
        const browser = await puppeteer.launch({ headless: 'new' });
        const page = await browser.newPage();
        await page.setContent(html, { waitUntil: 'networkidle0' });
        const pdfBuffer = await page.pdf({ format: 'A4', printBackground: true });
        await browser.close();

        // Send PDF as response
        res.set({
            'Content-Type': 'application/pdf',
            'Content-Disposition': `attachment; filename=invoice-${sale.invoiceNo || sale._id}.pdf`,
        });
        res.send(pdfBuffer);
    } catch (err) {
        console.error('Error generating invoice:', err);
        res.status(500).json({ error: err.message });
    }
};

function formatDate(date) {
    const d = new Date(date);
    return isNaN(d)
        ? '-'
        : `${d.getDate().toString().padStart(2, '0')}/${(d.getMonth() + 1)
            .toString()
            .padStart(2, '0')}/${d.getFullYear()}`;
}

function numberToIndianWords(num) {
    const ones = ['', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten',
        'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen'];
    const tens = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];

    if (num === 0) return 'zero';

    function numToWords(n, suffix) {
        let str = '';
        if (n > 19) {
            str += tens[Math.floor(n / 10)] + (n % 10 !== 0 ? ' ' + ones[n % 10] : '');
        } else if (n > 0) {
            str += ones[n];
        }
        if (n > 0) str += ' ' + suffix + ' ';
        return str;
    }

    let crore = Math.floor(num / 10000000);
    let lakh = Math.floor((num % 10000000) / 100000);
    let thousand = Math.floor((num % 100000) / 1000);
    let hundred = Math.floor((num % 1000) / 100);
    let rest = num % 100;

    let result = '';
    if (crore > 0) result += numToWords(crore, 'crore');
    if (lakh > 0) result += numToWords(lakh, 'lakh');
    if (thousand > 0) result += numToWords(thousand, 'thousand');
    if (hundred > 0) result += numToWords(hundred, 'hundred');
    if (rest > 0) {
        if (result !== '') result += 'and ';
        if (rest > 19) {
            result += tens[Math.floor(rest / 10)] + (rest % 10 !== 0 ? ' ' + ones[rest % 10] : '');
        } else {
            result += ones[rest];
        }
    }
    return result.trim();
}

function capitalizeFirstChar(str) {
    if (!str) return '';
    return str.charAt(0).toUpperCase() + str.slice(1);
}
