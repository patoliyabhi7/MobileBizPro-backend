const Contact = require('../../models/contactModel');
const Purchase = require('../../models/purchaseModel');
const Sale = require('../../models/saleModel');
const PurchaseReturn = require('../../models/purchaseReturnModel');
const SaleReturn = require('../../models/saleReturnModel');
const Product = require('../../models/productModel');
const Stock = require('../../models/stockModel');
const mongoose = require('mongoose');

exports.getViewContactReport = async (req, res) => {
  try {
    const { 
      contactId, 
      startDate, 
      endDate, 
      businessLocationId, 
      tab = 'ledger', 
      format = '1',
      paymentStatus = 'All' 
    } = req.query;

    // Validate required parameter
    if (!contactId) {
      return res.status(400).json({ error: 'Contact ID is required' });
    }

    // Parse dates
    const start = startDate ? new Date(startDate) : new Date(new Date().getFullYear(), 0, 1); // Default to start of current year
    const end = endDate ? new Date(endDate) : new Date(); // Default to today
    
    // Ensure proper time range
    start.setHours(0, 0, 0, 0);
    end.setHours(23, 59, 59, 999);

    // Fetch contact details
    const contact = await Contact.findById(contactId).lean();
    
    if (!contact) {
      return res.status(404).json({ error: 'Contact not found' });
    }

    // Build location filter if provided
    const locationFilter = businessLocationId && businessLocationId !== 'all' 
      ? { businessLocation: new mongoose.Types.ObjectId(businessLocationId) } 
      : {};

    // Switch based on the requested tab
    switch (tab.toLowerCase()) {
      case 'purchases':
        return await getPurchasesTab(contact, start, end, locationFilter, res);
      case 'stockreport':
        return await getStockReportTab(contact, locationFilter, res);
      case 'sales':
        return await getSalesTab(contact, start, end, locationFilter, paymentStatus, res);
      case 'documents':
        return await getDocumentsTab(contact, res);
      case 'payments':
        return await getPaymentsTab(contact, start, end, locationFilter, res);
      case 'activities':
        return await getActivitiesTab(contact, res);
      case 'ledger':
      default:
        return await getLedgerTab(contact, start, end, locationFilter, format, res);
    }
  } catch (err) {
    console.error('Error fetching contact report:', err);
    res.status(500).json({ error: err.message });
  }
};

// Ledger tab
async function getLedgerTab(contact, start, end, locationFilter, format, res) {
  try {
    // Fetch all purchases for this contact
    const purchases = await Purchase.find({
      supplier: new mongoose.Types.ObjectId(contact._id),
      purchaseDate: { $gte: start, $lte: end },
      isDeleted: { $ne: true },
      ...locationFilter
    })
    .populate('businessLocation', 'name')
    .populate('supplier', 'firstName lastName businessName')
    .populate('payments.method', 'name')
    .sort({ purchaseDate: 1 })
    .lean();

    // Fetch all purchase returns for this contact
    const purchaseReturns = await PurchaseReturn.find({
      supplier: new mongoose.Types.ObjectId(contact._id),
      returnDate: { $gte: start, $lte: end },
      isDeleted: { $ne: true },
      ...locationFilter
    })
    .populate('businessLocation', 'name')
    .populate('returnPayments.method', 'name')
    .sort({ returnDate: 1 })
    .lean();

    // Calculate summary data
    let openingBalance = contact.openingBalance || 0;
    let totalPurchase = 0;
    let totalInvoice = 0;
    let totalPaid = 0;
    
    // Process purchases
    purchases.forEach(purchase => {
      totalPurchase += purchase.total || 0;
      
      // Add payments
      if (purchase.payments && purchase.payments.length > 0) {
        purchase.payments.forEach(payment => {
          totalPaid += payment.amount || 0;
        });
      }
    });
    
    // Calculate balance due
    const advanceBalance = contact.advanceBalance || 0;
    const balanceDue = totalPurchase - totalPaid - advanceBalance;

    // Create transactions array for the ledger
    let transactions = [];
    
    // Add opening balance transaction
    transactions.push({
      date: start,
      referenceNo: '',
      type: 'Opening Balance',
      location: '',
      paymentStatus: '',
      debit: 0,
      credit: 0,
      balance: openingBalance,
      paymentMethod: '',
      others: ''
    });
    
    // Process purchases into transactions
    purchases.forEach(purchase => {
      transactions.push({
        date: purchase.purchaseDate,
        referenceNo: purchase.referenceNo,
        type: 'Purchase',
        location: purchase.businessLocation ? purchase.businessLocation.name : '',
        paymentStatus: purchase.paymentStatus === 'paid' ? 'Paid' : purchase.paymentStatus === 'partial' ? 'Partial' : 'Due',
        debit: 0,
        credit: purchase.total,
        balance: 0, // Will be calculated later
        paymentMethod: purchase.payments && purchase.payments.length > 0 ? purchase.payments[0].method.name : '',
        others: purchase.additionalNotes || ''
      });
      
      // Add payments for this purchase
      if (purchase.payments && purchase.payments.length > 0) {
        purchase.payments.forEach(payment => {
          transactions.push({
            date: payment.paidOn,
            referenceNo: `PURPYMNT${payment.paymentRefNo}`,
            type: 'Payment',
            location: purchase.businessLocation ? purchase.businessLocation.name : '',
            paymentStatus: '',
            debit: payment.amount,
            credit: 0,
            balance: 0, // Will be calculated later
            paymentMethod: payment.method ? payment.method.name : 'Bank Transfer', // Use actual payment method name if available
            others: payment.note || ''
          });
        });
      }
    });
    
    // Process purchase returns (these reduce what the supplier is owed)
    purchaseReturns.forEach(purchaseReturn => {
      transactions.push({
        date: purchaseReturn.returnDate,
        referenceNo: purchaseReturn.referenceNo,
        type: 'Purchase Return',
        location: purchaseReturn.businessLocation ? purchaseReturn.businessLocation.name : '',
        paymentStatus: '',
        debit: purchaseReturn.total,
        credit: 0,
        balance: 0, // Will be calculated later
        paymentMethod: purchaseReturn.returnPayments && purchaseReturn.returnPayments.length > 0 ? 
          (purchaseReturn.returnPayments[0].method ? purchaseReturn.returnPayments[0].method.name : '') : '',
        others: ''
      });
      
      // Add return payments if any
      if (purchaseReturn.returnPayments && purchaseReturn.returnPayments.length > 0) {
        purchaseReturn.returnPayments.forEach(payment => {
          transactions.push({
            date: payment.paidOn,
            referenceNo: `RETPYMNT${payment.paymentRefNo || ''}`,
            type: 'Return Payment',
            location: purchaseReturn.businessLocation ? purchaseReturn.businessLocation.name : '',
            paymentStatus: '',
            debit: 0,
            credit: payment.amount,
            balance: 0, // Will be calculated later
            paymentMethod: payment.method ? payment.method.name : '',
            others: payment.note || ''
          });
        });
      }
    });
    
    // Sort transactions by date
    transactions.sort((a, b) => new Date(a.date) - new Date(b.date));
    
    // Calculate running balance
    let runningBalance = openingBalance;
    transactions.forEach(transaction => {
      if (transaction.type !== 'Opening Balance') {
        runningBalance = runningBalance + transaction.debit - transaction.credit;
      }
      transaction.balance = runningBalance;
      
      // Format the balance for display
      // If negative (credit balance), append CR
      if (transaction.balance < 0) {
        transaction.balance = Math.abs(transaction.balance).toFixed(2) + ' CR';
      } else {
        transaction.balance = transaction.balance.toFixed(2);
      }
      
      // Format date for better display
      transaction.date = new Date(transaction.date).toLocaleString();
    });

    // Format summary information
    const formattedResult = {
      contactDetails: {
        id: contact._id,
        name: `${contact.firstName || ''} ${contact.lastName || ''}`.trim(),
        businessName: contact.businessName || '',
        contactType: contact.contactType,
        taxNumber: contact.taxNumber || '',
        payTerm: contact.payTerm || '',
        payTermPeriod: contact.payTermPeriod || 'days',
        mobile: contact.mobile || '',
        addressLine1: contact.addressLine1 || '',
        addressLine2: contact.addressLine2 || '',
        city: contact.city || '',
        state: contact.state || '',
        country: contact.country || '',
      },
      accountSummary: {
        dateRange: `${start.toLocaleDateString()} to ${end.toLocaleDateString()}`,
        openingBalance,
        totalPurchase,
        totalInvoice,
        totalPaid,
        advanceBalance,
        balanceDue
      },
      transactions,
      ledgerFormat: format,
      tab: 'ledger'
    };

    res.status(200).json(formattedResult);
  } catch (error) {
    console.error("Error in getLedgerTab:", error);
    res.status(500).json({ error: error.message });
  }
}

// Purchases tab
async function getPurchasesTab(contact, start, end, locationFilter, res) {
  try {
    // Fetch all purchases for this contact
    const purchases = await Purchase.find({
      supplier: new mongoose.Types.ObjectId(contact._id),
      purchaseDate: { $gte: start, $lte: end },
      isDeleted: { $ne: true },
      ...locationFilter
    })
    .populate('businessLocation', 'name')
    .populate('addedBy', 'name')
    .sort({ purchaseDate: -1 }) // Newest first
    .lean();
    
    // Fetch purchase returns for this contact
    const purchaseReturns = await PurchaseReturn.find({
      supplier: new mongoose.Types.ObjectId(contact._id),
      returnDate: { $gte: start, $lte: end },
      isDeleted: { $ne: true },
      ...locationFilter
    })
    .lean();
    
    let total = 0;
    let purchaseDue = 0;
    let purchaseReturn = 0;
    
    // Calculate purchase return total
    purchaseReturns.forEach(returnItem => {
      purchaseReturn += returnItem.totalReturnAmount || 0;
    });
    
    const formattedPurchases = purchases.map(purchase => {
      total += purchase.total || 0;
      purchaseDue += purchase.paymentDue || 0;
      
      return {
        action: "",
        date: new Date(purchase.purchaseDate).toLocaleString(),
        referenceNo: purchase.referenceNo,
        purchaseStatus: purchase.status || 'received',
        paymentStatus: purchase.paymentStatus || 'due',
        grandTotal: purchase.total,
        paymentDue: purchase.paymentDue,
        addedBy: purchase.addedBy.name || '',
        supplier: contact.businessName || `${contact.firstName} ${contact.lastName}`,
        location: purchase.businessLocation?.name || ''
      };
    });

    // Format result
    const result = {
      contactDetails: {
        id: contact._id,
        name: `${contact.firstName || ''} ${contact.lastName || ''}`.trim(),
        businessName: contact.businessName || '',
        contactType: contact.contactType,
        taxNumber: contact.taxNumber || '',
        mobile: contact.mobile || '',
      },
      purchases: formattedPurchases,
      totals: {
        purchase: total,
        purchaseDue: purchaseDue,
        purchaseReturn: purchaseReturn
      },
      tab: 'purchases'
    };

    res.status(200).json(result);
  } catch (error) {
    console.error("Error in getPurchasesTab:", error);
    res.status(500).json({ error: error.message });
  }
}

// Stock Report tab
async function getStockReportTab(contact, locationFilter, res) {
  try {
    // Get purchases for this supplier to find products
    const purchases = await Purchase.find({
      supplier: new mongoose.Types.ObjectId(contact._id),
      isDeleted: { $ne: true },
      ...locationFilter
    })
    .populate({
      path: 'products.product',
      model: 'Product',
      select: 'productName sku quantity purchasePrice'
    })
    .lean();

    // Create map of unique products
    const productMap = new Map();
    
    // Process purchases to extract product info
    purchases.forEach(purchase => {
      purchase.products.forEach(item => {
        if (item.product) {
          const productId = item.product._id.toString();
          
          if (!productMap.has(productId)) {
            productMap.set(productId, {
              product: item.product.productName,
              sku: item.product.sku,
              purchaseQuantity: 0,
              totalSold: 0,
              totalTransferred: 0,
              totalReturned: 0,
              currentStock: item.product.quantity || 0,
              currentStockValue: (item.product.quantity * item.unitCost) || 0
            });
          }
          
          const productData = productMap.get(productId);
          productData.purchaseQuantity += item.quantity || 0;
        }
      });
    });

    // Convert map to array
    const stockItems = Array.from(productMap.values());

    // Format result
    const result = {
      contactDetails: {
        id: contact._id,
        name: `${contact.firstName || ''} ${contact.lastName || ''}`.trim(),
        businessName: contact.businessName || '',
        contactType: contact.contactType,
        taxNumber: contact.taxNumber || '',
        mobile: contact.mobile || '',
      },
      stockItems,
      tab: 'stockReport'
    };

    res.status(200).json(result);
  } catch (error) {
    console.error("Error in getStockReportTab:", error);
    res.status(500).json({ error: error.message });
  }
}

// Sales tab
async function getSalesTab(contact, start, end, locationFilter, paymentStatus, res) {
  try {
    // If this contact is not a customer, return empty sales
    if (contact.contactType === 'Supplier') {
      return res.status(200).json({
        contactDetails: {
          id: contact._id,
          name: `${contact.firstName || ''} ${contact.lastName || ''}`.trim(),
          businessName: contact.businessName || '',
          contactType: contact.contactType,
        },
        sales: [],
        tab: 'sales'
      });
    }
    
    // Payment status filter
    const statusFilter = paymentStatus && paymentStatus !== 'All' ? 
      { paymentStatus: paymentStatus.toLowerCase() } : {};
    
    // Fetch sales for this customer
    const sales = await Sale.find({
      customer: new mongoose.Types.ObjectId(contact._id),
      saleDate: { $gte: start, $lte: end },
      isDeleted: { $ne: true },
      ...locationFilter,
      ...statusFilter
    })
    .populate('businessLocation', 'name')
    .populate('addedBy', 'name')
    .populate('payments.method', 'name')
    .sort({ saleDate: -1 })
    .lean();
    
    // Fetch sale returns for this customer
    const saleReturns = await SaleReturn.find({
      originalSale: { $in: sales.map(sale => sale._id) },
      returnDate: { $gte: start, $lte: end },
      isDeleted: { $ne: true }
    })
    .lean();
    
    // Create a map of sale returns by sale ID
    const saleReturnMap = new Map();
    saleReturns.forEach(returnItem => {
      if (returnItem.originalSale) {
        const saleId = returnItem.originalSale.toString();
        if (!saleReturnMap.has(saleId)) {
          saleReturnMap.set(saleId, 0);
        }
        saleReturnMap.set(saleId, saleReturnMap.get(saleId) + returnItem.totalReturnAmount);
      }
    });
    
    // Format sales data
    const formattedSales = sales.map(sale => {
      const saleId = sale._id.toString();
      const saleReturnAmount = saleReturnMap.has(saleId) ? saleReturnMap.get(saleId) : 0;
      
      return {
        action: "",
        date: new Date(sale.saleDate).toLocaleString(),
        invoiceNo: sale.invoiceNo,
        customer: contact.businessName || `${contact.firstName} ${contact.lastName}`,
        contactNumber: contact.mobile || '',
        location: sale.businessLocation?.name || '',
        paymentStatus: sale.paymentStatus || 'due',
        paymentMethod: sale.payments && sale.payments.length > 0 ? (sale.payments[0].method ? sale.payments[0].method.name : '') : '',
        totalAmount: sale.total,
        totalPaid: sale.total - (sale.paymentDue || 0),
        sellDue: sale.paymentDue || 0,
        sellReturn: saleReturnAmount,
        shippingStatus: sale.shippingStatus || '',
        totalItems: sale.totalItems || 0,
        addedBy: sale.addedBy.name || '',
        staffNote: sale.staffNote || '',
        sellNote: sale.additionalNotes || '',
        shippingDetails: sale.shippingDetails || ''
      };
    });

    // Format result
    const result = {
      contactDetails: {
        id: contact._id,
        name: `${contact.firstName || ''} ${contact.lastName || ''}`.trim(),
        businessName: contact.businessName || '',
        contactType: contact.contactType,
      },
      sales: formattedSales,
      tab: 'sales'
    };

    res.status(200).json(result);
  } catch (error) {
    console.error("Error in getSalesTab:", error);
    res.status(500).json({ error: error.message });
  }
}

// Documents & Note tab
async function getDocumentsTab(contact, res) {
  try {
    // In a real implementation, fetch documents and notes
    // For now, return empty array
    const result = {
      contactDetails: {
        id: contact._id,
        name: `${contact.firstName || ''} ${contact.lastName || ''}`.trim(),
        businessName: contact.businessName || '',
        contactType: contact.contactType,
      },
      documents: [],
      tab: 'documents'
    };
    
    res.status(200).json(result);
  } catch (error) {
    console.error("Error in getDocumentsTab:", error);
    res.status(500).json({ error: error.message });
  }
}

// Payments tab
async function getPaymentsTab(contact, start, end, locationFilter, res) {
  try {
    // Fetch all purchases with payments for this contact
    const purchases = await Purchase.find({
      supplier: new mongoose.Types.ObjectId(contact._id),
      'payments.paidOn': { $gte: start, $lte: end },
      isDeleted: { $ne: true },
      ...locationFilter
    })
    .populate('payments.method', 'name')
    .lean();
    
    // Extract payment information
    const payments = [];
    
    purchases.forEach(purchase => {
      if (purchase.payments && purchase.payments.length > 0) {
        purchase.payments.forEach(payment => {
          if (payment.paidOn >= start && payment.paidOn <= end) {
            payments.push({
              paidOn: new Date(payment.paidOn).toLocaleString(),
              referenceNo: payment.paymentRefNo,
              amount: payment.amount,
              paymentMethod: payment.method ? payment.method.name : `Bank Transfer${payment.bankAccountNo ? ' (Bank Account No.: ' + payment.bankAccountNo + ')' : ''}`,
              paymentFor: `${purchase.referenceNo} (Purchase)`,
              action: ""
            });
          }
        });
      }
    });
    
    // Sort by date (newest first)
    payments.sort((a, b) => new Date(b.paidOn) - new Date(a.paidOn));
    
    // Format result
    const result = {
      contactDetails: {
        id: contact._id,
        name: `${contact.firstName || ''} ${contact.lastName || ''}`.trim(),
        businessName: contact.businessName || '',
        contactType: contact.contactType,
      },
      payments,
      tab: 'payments'
    };
    
    res.status(200).json(result);
  } catch (error) {
    console.error("Error in getPaymentsTab:", error);
    res.status(500).json({ error: error.message });
  }
}

// Activities tab
async function getActivitiesTab(contact, res) {
  try {
    // Get recent purchases
    const purchases = await Purchase.find({
      supplier: new mongoose.Types.ObjectId(contact._id),
      isDeleted: { $ne: true }
    })
    .sort({ purchaseDate: -1 })
    .limit(5)
    .populate('addedBy', 'name')
    .lean();

    // Get recent sales if contact is a customer
    const sales = contact.contactType !== 'Supplier' ? await Sale.find({
      customer: new mongoose.Types.ObjectId(contact._id),
      isDeleted: { $ne: true }
    })
    .sort({ saleDate: -1 })
    .limit(5)
    .populate('addedBy', 'name')
    .lean() : [];

    // Create activity log
    const activities = [
      {
        date: new Date(contact.createdAt || contact.addedOn || Date.now()).toLocaleString(),
        action: 'Contact Added',
        by: 'System',
        note: `Contact type: ${contact.contactType}`
      }
    ];
    
    // Add purchase activities
    purchases.forEach(purchase => {
      activities.push({
        date: new Date(purchase.purchaseDate).toLocaleString(),
        action: `Purchase Created (${purchase.referenceNo})`,
        by: purchase.addedBy.name || '',
        note: `Total amount: ${purchase.total}, Status: ${purchase.status}`
      });
    });

    // Add sale activities
    sales.forEach(sale => {
      activities.push({
        date: new Date(sale.saleDate).toLocaleString(),
        action: `Sale Created (${sale.invoiceNo})`,
        by: sale.addedBy.name || '',
        note: `Total amount: ${sale.total}, Status: ${sale.status}`
      });
    });
    
    // Sort activities by date (newest first)
    activities.sort((a, b) => new Date(b.date) - new Date(a.date));
    
    // Format result
    const result = {
      contactDetails: {
        id: contact._id,
        name: `${contact.firstName || ''} ${contact.lastName || ''}`.trim(),
        businessName: contact.businessName || '',
        contactType: contact.contactType,
      },
      activities,
      tab: 'activities'
    };
    
    res.status(200).json(result);
  } catch (error) {
    console.error("Error in getActivitiesTab:", error);
    res.status(500).json({ error: error.message });
  }
}
