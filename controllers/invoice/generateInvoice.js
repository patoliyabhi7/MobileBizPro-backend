const mongoose = require('mongoose');
const puppeteer = require('puppeteer');
const Sale = require('../../models/saleModel');
const InvoiceLayout = require('../../models/invoiceLayoutModel');
const path = require('path');
const fs = require('fs');

// CRITICAL: Global browser instance - this is the biggest performance killer
let globalBrowser = null;

// Advanced Browser Pool with warmup
class AdvancedBrowserPool {
  constructor(maxBrowsers = 2) {
    this.browsers = [];
    this.maxBrowsers = maxBrowsers;
    this.currentIndex = 0;
    this.warmupComplete = false;
  }

  async warmup() {
    if (this.warmupComplete) return;
    
    const startTime = Date.now();
    
    // Pre-launch browsers
    const browserPromises = Array(this.maxBrowsers).fill().map(() => 
      puppeteer.launch({
        headless: 'new',
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-gpu',
          '--disable-software-rasterizer',
          '--no-first-run',
          '--no-zygote',
          '--disable-default-apps',
          '--disable-features=TranslateUI,VizDisplayCompositor',
          '--disable-background-timer-throttling',
          '--disable-renderer-backgrounding',
          '--disable-backgrounding-occluded-windows',
          '--disable-ipc-flooding-protection',
          '--memory-pressure-off',
          '--renderer-process-limit=1',
          '--max_old_space_size=4096'
        ],
        pipe: true, // Use pipe instead of websocket for better performance
        defaultViewport: { width: 1200, height: 1600 },
        timeout: 10000
      })
    );
    
    this.browsers = await Promise.all(browserPromises);
    this.warmupComplete = true;
  }

  async getBrowser() {
    if (!this.warmupComplete) {
      await this.warmup();
    }
    
    const browser = this.browsers[this.currentIndex];
    this.currentIndex = (this.currentIndex + 1) % this.browsers.length;
    return browser;
  }

  async cleanup() {
    await Promise.all(this.browsers.map(browser => browser.close()));
    this.browsers = [];
    this.warmupComplete = false;
  }
}

// Global browser pool
const browserPool = new AdvancedBrowserPool(2);

// Enhanced caching system
class InvoiceCache {
  constructor() {
    this.layoutCache = new Map();
    this.logoCache = new Map();
    this.htmlCache = new Map();
    this.dataCache = new Map();
  }

  async getLayout() {
    const cacheKey = 'default_layout';
    const cached = this.layoutCache.get(cacheKey);
    
    if (cached && Date.now() - cached.timestamp < 10 * 60 * 1000) {
      return cached.data;
    }

    const layout = await InvoiceLayout.findOne({ isDefault: true, isDeleted: false }).lean();
    if (!layout) {
      throw new Error('Default invoice layout not set');
    }

    // Process logo
    let logoTag = `<strong>${layout.shopName || ''}</strong>`;
    
    if (layout.logo) {
      const logoPath = path.join(__dirname, '../../uploads', path.basename(layout.logo));
      
      if (fs.existsSync(logoPath)) {
        let logoData = this.logoCache.get(layout.logo);
        
        if (!logoData) {
          const imgData = fs.readFileSync(logoPath).toString('base64');
          const ext = path.extname(layout.logo).toLowerCase();
          const mime = ext === '.png' ? 'image/png' : 'image/jpeg';
          logoData = `data:${mime};base64,${imgData}`;
          this.logoCache.set(layout.logo, logoData);
        }
        
        logoTag = `<img src="${logoData}" style="height:150px; width:auto;">`;
      }
    }

    const processedLayout = { ...layout, logoTag };
    this.layoutCache.set(cacheKey, { data: processedLayout, timestamp: Date.now() });
    
    return processedLayout;
  }

  getSaleData(saleId) {
    const cached = this.dataCache.get(saleId);
    if (cached && Date.now() - cached.timestamp < 5 * 60 * 1000) { // 5 minutes
      return cached.data;
    }
    return null;
  }

  setSaleData(saleId, data) {
    this.dataCache.set(saleId, { data, timestamp: Date.now() });
  }

  clearOldCache() {
    const now = Date.now();
    const maxAge = 10 * 60 * 1000; // 10 minutes
    
    for (const [key, value] of this.dataCache.entries()) {
      if (now - value.timestamp > maxAge) {
        this.dataCache.delete(key);
      }
    }
  }
}

const cache = new InvoiceCache();

// Optimized database query with selective population
async function fetchSaleData(saleId) {
  const cachedData = cache.getSaleData(saleId);
  if (cachedData) return cachedData;

  const sale = await Sale.findOne({ _id: saleId })
    .populate('customer', 'firstName lastName') // Only needed fields
    .populate('businessLocation', 'name address')
    .populate({
      path: 'products.product',
      select: 'productName',
      populate: {
        path: 'brand',
        select: 'name'
      },
    })
    .populate('payments.method', 'name')
    .select('-__v -createdAt -updatedAt') // Exclude unnecessary fields
    .lean();

  if (!sale || sale.isDeleted) {
    throw new Error('Sale not found');
  }

  cache.setSaleData(saleId, sale);
  return sale;
}

// Pre-calculate everything in one go
function calculateInvoiceData(sale, layout) {
  const allProducts = sale.products || [];
  const payments = sale.payments || [];
  
  // Use reduce for better performance
  const totals = allProducts.reduce((acc, p) => {
    acc.quantity += p.quantity || 0;
    acc.amount += p.lineTotal || 0;
    return acc;
  }, { quantity: 0, amount: 0 });

  // Only count payments not marked for shop use
  const totalPaid = payments.reduce((sum, p) => {
    // Include payment only if forShopUse is explicitly false or undefined (for backward compatibility)
    if (p.forShopUse !== true) {
      return sum + (p.amount || 0);
    }
    return sum;
  }, 0);
  const paymentDue = sale.paymentDue || 0;
  
  // Optimize number to words conversion
  const totalInWords = capitalizeFirstChar(numberToIndianWords(Math.floor(sale.total || 0))) + ' rupees only';

  const formattedTerms = (layout.termsAndConditions || 'No returns after 7 days')
    .split('\n')
    .map(line => `<p style="margin: 0; padding: 0;">• ${line}</p>`)
    .join('');

  // Generate product rows with string concatenation (faster than template literals in loops)
  const productRows = allProducts.map((p, i) => {
    const isReturn = p.isReturn;
    const returnLabel = isReturn ? '<strong style="color: red;">[ Returned ]</strong>' : '';
    const description = [
      p.product?.brand?.name || '',
      p.product?.productName || '',
      p.storage || '',
      p.color || ''
    ].filter(Boolean).join(' ');

    return `<tr>
      <td>${i + 1}</td>
      <td>${description} ${returnLabel}</td>
      <td>${p.imeiNo || '-'}</td>
      <td>${p.quantity || 0}</td>
      <td>₹${(p.unitPrice || 0).toFixed(2)}</td>
      <td>₹${(p.lineTotal || 0).toFixed(2)}</td>
    </tr>`;
  }).join('');

  return {
    totalQuantity: totals.quantity,
    totalPaid,
    paymentDue,
    totalInWords,
    formattedTerms,
    productRows
  };
}

// Optimized HTML generation with minimal template
function generateOptimizedHTML(sale, layout, calculations) {
  const { totalQuantity, totalPaid, paymentDue, totalInWords, productRows, formattedTerms } = calculations;

  return `<!DOCTYPE html>
<html><head><meta charset="UTF-8"><title>Invoice</title><style>
body{font-family:"Segoe UI",sans-serif;margin:0;padding:20px;background:#fff;color:#000;font-size:14px}
.invoice-box{max-width:820px;margin:auto;padding:30px;border:2px solid #000;border-radius:8px;display:flex;flex-direction:column;min-height:900px}
.header{display:flex;justify-content:space-between;align-items:center}
.header img{max-height:100px}.shop-info{text-align:right}.shop-info h2{font-size:22px;margin:0}
.shop-info p{font-size:12px;margin:2px 0}hr{border:1px dashed #000;margin:20px 0}
.customer-info,.invoice-meta{display:flex;justify-content:space-between;font-size:13px;margin-bottom:10px}
table.table{width:100%;border-collapse:collapse;margin-top:20px;font-size:13px;border:none}
table.table thead th{border-bottom:2px solid #000;padding:10px 8px;font-weight:600;text-align:left}
table.table tbody tr:not(:last-child){border-bottom:1px solid #ccc}
table.table tbody td{padding:12px 8px;vertical-align:middle}
table.table tbody tr:nth-child(even){background-color:#f9f9f9}
.content-wrapper{flex:1}.payment-section{margin-top:auto}
.payment-summary{line-height:2;font-size:13px}
.payment-summary .row{display:flex;justify-content:space-between;border-bottom:1px solid #eee}
.payment-summary .row.total{font-weight:bold}
.terms{margin-top:25px;font-size:12px;line-height:1.6}
.terms h4{margin-bottom:6px;font-size:13px;text-decoration:underline}
</style></head><body><div class="invoice-box">
<div class="header"><div class="logo">${layout.logoTag}</div>
<div class="shop-info"><h2>${layout.shopName || ''}</h2><p>${layout.slogan || ''}</p>
<p>${layout.address || ''}</p><p>Mobile: ${layout.mobileNumber || '-'}</p></div></div><hr>
<div class="customer-info"><div><strong>Customer:</strong> ${sale.customer?.firstName || ''} ${sale.customer?.lastName || ''}<br/>
<strong>Mobile:</strong> ${sale.contactNumber || '-'}</div>
<div class="invoice-meta"><div><strong>Invoice #:</strong> ${sale.invoiceNo || sale._id}<br/>
<strong>Date:</strong> ${formatDate(sale.saleDate)}</div></div></div>
<div class="content-wrapper"><table class="table" cellpadding="0" cellspacing="0"><thead><tr>
<th>#</th><th>Product Detail</th><th>IMEI</th><th>Qty</th><th>Unit Price</th><th>Subtotal</th></tr></thead>
<tbody>${productRows}</tbody></table></div>
<div class="payment-section"><div class="payment-summary">
<div class="row"><strong>Payment Method:</strong><span>${sale.payments[0]?.method?.name || '-'}</span></div>
<div class="row"><span>Total Quantity:</span><span>${totalQuantity}</span></div>
<div class="row"><span>Subtotal:</span><span>₹${(sale.total || 0).toFixed(2)}</span></div>
<div class="row"><span>Total Paid:</span><span>₹${totalPaid.toFixed(2)}</span></div>
<div class="row"><span>Payment Due:</span><span>₹${paymentDue.toFixed(2)}</span></div>
<div class="row total"><span>Total (in words):</span><span>${totalInWords}</span></div></div>
<div class="terms"><h4>Terms & Conditions</h4>${formattedTerms}</div></div></div></body></html>`;
}

// Main optimized function
exports.generateInvoice = async (req, res) => {
  const startTime = Date.now();
  
  try {
    const { saleId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(saleId)) {
      return res.status(400).json({ error: 'Invalid Sale ID format' });
    }

    // Parallel data fetching
    const [sale, layout] = await Promise.all([
      fetchSaleData(saleId),
      cache.getLayout()
    ]);

    // Pre-calculate everything
    const calculations = calculateInvoiceData(sale, layout);

    // Generate optimized HTML
    const html = generateOptimizedHTML(sale, layout, calculations);

    // Get browser and generate PDF
    const browser = await browserPool.getBrowser();
    const page = await browser.newPage();
    
    // Ultra-fast PDF generation
    await page.setContent(html, { waitUntil: 'domcontentloaded' });
    
    const pdfBuffer = await page.pdf({
      format: 'A4',
      printBackground: true,
      preferCSSPageSize: true,
      margin: { top: '10mm', right: '10mm', bottom: '10mm', left: '10mm' }
    });
    
    await page.close();

    // Stream response for better performance
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename=invoice-${sale.invoiceNo || sale._id}.pdf`,
      'Content-Length': pdfBuffer.length,
      'Cache-Control': 'no-cache'
    });
    
    res.send(pdfBuffer);

  } catch (err) {
    console.error('Error generating invoice:', err);
    res.status(500).json({ error: err.message });
  }
};

// Warmup function - call this when your server starts
exports.warmupInvoiceSystem = async () => {
  try {
    await browserPool.warmup();
    await cache.getLayout(); // Warm up layout cache
  } catch (err) {
    console.error('Invoice system warmup failed:', err);
  }
};

// Cleanup function - call this when your server shuts down
exports.cleanupInvoiceSystem = async () => {
  await browserPool.cleanup();
};

// Periodic cache cleanup
setInterval(() => {
  cache.clearOldCache();
}, 5 * 60 * 1000); // Every 5 minutes

// Optimized utility functions
function formatDate(date) {
  if (!date) return '-';
  const d = new Date(date);
  if (isNaN(d)) return '-';
  
  const day = d.getDate().toString().padStart(2, '0');
  const month = (d.getMonth() + 1).toString().padStart(2, '0');
  const year = d.getFullYear();
  
  return `${day}/${month}/${year}`;
}

// Optimized number to words - cached results
const numberWordsCache = new Map();

function numberToIndianWords(num) {
  if (numberWordsCache.has(num)) {
    return numberWordsCache.get(num);
  }

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

  const crore = Math.floor(num / 10000000);
  const lakh = Math.floor((num % 10000000) / 100000);
  const thousand = Math.floor((num % 100000) / 1000);
  const hundred = Math.floor((num % 1000) / 100);
  const rest = num % 100;

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

  const finalResult = result.trim();
  numberWordsCache.set(num, finalResult);
  return finalResult;
}

function capitalizeFirstChar(str) {
  if (!str) return '';
  return str.charAt(0).toUpperCase() + str.slice(1);
}

// Graceful shutdown
process.on('SIGTERM', async () => {
  await browserPool.cleanup();
  process.exit(0);
});

process.on('SIGINT', async () => {
  await browserPool.cleanup();
  process.exit(0);
});