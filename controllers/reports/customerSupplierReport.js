const Sale = require('../../models/saleModel');
const Purchase = require('../../models/purchaseModel');
const SaleReturn = require('../../models/saleReturnModel');
const PurchaseReturn = require('../../models/purchaseReturnModel');
const Contact = require('../../models/contactModel');

exports.getCustomerSupplierReport = async (req, res) => {
  try {
    const {
      startDate,
      endDate,
      locationId,
      contactType,
      contactId
    } = req.query;

    if (!startDate || !endDate) {
      return res.status(400).json({ error: 'Start date and end date are required' });
    }

    // Build filters
    const dateFilter = {
      $gte: new Date(startDate),
      $lte: new Date(new Date(endDate).setHours(23, 59, 59, 999))
    };

    // Location filter
    const locationFilter = locationId && locationId !== 'All locations' 
      ? { businessLocation: locationId } 
      : {};

    // Contact type filter (customer, supplier, or both)
    const contactTypeFilter = {};
    if (contactType && contactType !== 'All') {
      contactTypeFilter.contactType = contactType;
    }

    // Specific contact filter
    const specificContactFilter = {};
    if (contactId && contactId !== 'All') {
      specificContactFilter._id = contactId;
    }

    // Combine all contact filters
    const contactFilters = {
      ...contactTypeFilter,
      ...specificContactFilter,
      isDeleted: { $ne: true }
    };

    // 1. Get all contacts based on filters
    const contacts = await Contact.find(contactFilters).select('_id firstName lastName businessName contactType');

    // 2. Process each contact to get their transaction data
    const contactReportData = await Promise.all(contacts.map(async (contact) => {
      const contactId = contact._id;
      
      // Get total purchases for this contact
      const purchases = await Purchase.find({ 
        supplier: contactId,
        purchaseDate: dateFilter,
        isDeleted: { $ne: true },
        createdFromReturn: { $ne: true },
        ...locationFilter
      });
      
      const totalPurchase = purchases.reduce((total, purchase) => {
        return total + (purchase.totalAmountWithGst || purchase.total || 0);
      }, 0);
      
      // Get total purchase returns for this contact
      const purchaseReturns = await PurchaseReturn.find({
        returnDate: dateFilter,
        isDeleted: { $ne: true },
        ...locationFilter
      }).populate({
        path: 'originalPurchase',
        match: { supplier: contactId }
      });
      
      // Filter out returns whose originalPurchase doesn't match the supplier or was not populated
      const filteredPurchaseReturns = purchaseReturns.filter(
        pr => pr.originalPurchase && pr.originalPurchase.supplier.toString() === contactId.toString()
      );
      
      const totalPurchaseReturn = filteredPurchaseReturns.reduce((total, purchaseReturn) => {
        return total + (purchaseReturn.totalReturnAmountWithGst || purchaseReturn.totalReturnAmount || 0);
      }, 0);
      
      // Get total sales for this contact
      const sales = await Sale.find({
        customer: contactId,
        saleDate: dateFilter,
        isDeleted: { $ne: true },
        ...locationFilter
      });
      
      const totalSale = sales.reduce((total, sale) => {
        return total + (sale.totalAmountWithGst || sale.total || 0);
      }, 0);
      
      // Get total sale returns from the Purchase model where createdFromReturn=true
      const saleReturnPurchases = await Purchase.find({
        createdFromReturn: true,
        purchaseDate: dateFilter,
        isDeleted: { $ne: true },
        ...locationFilter
      });
      
      // Filter the purchases to those that have a saleReturn with this contact as the customer
      const filteredSaleReturnPurchases = await Promise.all(
        saleReturnPurchases.map(async purchase => {
          if (!purchase.saleReturnRef) return null;
          
          const saleReturn = await SaleReturn.findById(purchase.saleReturnRef)
            .populate('originalSale', 'customer');
          
          if (saleReturn && 
              saleReturn.originalSale && 
              saleReturn.originalSale.customer && 
              saleReturn.originalSale.customer.toString() === contactId.toString()) {
            return purchase;
          }
          return null;
        })
      );
      
      const totalSaleReturn = filteredSaleReturnPurchases
        .filter(p => p !== null)
        .reduce((total, purchase) => {
          return total + (purchase.totalAmountWithGst || purchase.total || 0);
        }, 0);
      
      // Get opening balance - from contact record directly
      const openingBalanceDue = contact.openingBalance || 0;
      
      // Calculate current due amount based on the type of transactions the contact has
      let currentDue = 0;
      
      // Check if contact has supplier transactions
      const hasSupplierTransactions = totalPurchase > 0 || totalPurchaseReturn > 0;
      
      // Check if contact has customer transactions  
      const hasCustomerTransactions = totalSale > 0 || totalSaleReturn > 0;
      
      if (hasCustomerTransactions) {
        // For customer transactions
        // Sum all payments received from customer
        const totalPaymentsReceived = sales.reduce((total, sale) => {
          const salePayments = sale.payments || [];
          return total + salePayments.reduce((paymentTotal, payment) => {
            return paymentTotal + (payment.amount || 0);
          }, 0);
        }, 0);
        
        const customerDue = totalSale - totalSaleReturn - totalPaymentsReceived;
        currentDue += customerDue;
      }
      
      if (hasSupplierTransactions) {
        // For supplier transactions
        // Sum all payments made to supplier
        const totalPaymentsMade = purchases.reduce((total, purchase) => {
          const purchasePayments = purchase.payments || [];
          return total + purchasePayments.reduce((paymentTotal, payment) => {
            return paymentTotal + (payment.amount || 0);
          }, 0);
        }, 0);
        
        const supplierDue = totalPurchase - totalPurchaseReturn - totalPaymentsMade;
        currentDue += supplierDue;
      }
      
      // Format the contact name
      const contactName = contact.businessName ? contact.businessName + ' ' + `${contact.firstName || ''} ${contact.lastName || ''}`.trim() :
        `${contact.firstName || ''} ${contact.lastName || ''}`.trim();
      
      return {
        contactId: contact._id,
        contactName,
        contactType: contact.contactType,
        totalPurchase,
        totalPurchaseReturn,
        totalSale,
        totalSaleReturn,
        openingBalanceDue,
        currentDue
      };
    }));
    
    // 3. Calculate totals for the footer row
    const totals = contactReportData.reduce(
      (acc, contact) => {
        acc.totalPurchase += contact.totalPurchase;
        acc.totalPurchaseReturn += contact.totalPurchaseReturn;
        acc.totalSale += contact.totalSale;
        acc.totalSaleReturn += contact.totalSaleReturn;
        acc.openingBalanceDue += contact.openingBalanceDue;
        acc.currentDue += contact.currentDue;
        return acc;
      },
      {
        totalPurchase: 0,
        totalPurchaseReturn: 0,
        totalSale: 0,
        totalSaleReturn: 0,
        openingBalanceDue: 0,
        currentDue: 0
      }
    );
    
    // 4. Format the response
    const response = {
      filters: {
        startDate,
        endDate,
        locationId: locationId || 'All locations',
        contactType: contactType || 'All',
        contactId: contactId || 'All'
      },
      contacts: contactReportData.map(contact => ({
        contactName: contact.contactName,
        contactId: contact.contactId,
        contactType: contact.contactType,
        totalPurchase: contact.totalPurchase.toFixed(2),
        totalPurchaseReturn: contact.totalPurchaseReturn.toFixed(2),
        totalSale: contact.totalSale.toFixed(2),
        totalSaleReturn: contact.totalSaleReturn.toFixed(2),
        openingBalanceDue: contact.openingBalanceDue.toFixed(2),
        due: contact.currentDue.toFixed(2)
      })),
      totals: {
        totalPurchase: totals.totalPurchase.toFixed(2),
        totalPurchaseReturn: totals.totalPurchaseReturn.toFixed(2),
        totalSale: totals.totalSale.toFixed(2),
        totalSaleReturn: totals.totalSaleReturn.toFixed(2),
        openingBalanceDue: totals.openingBalanceDue.toFixed(2),
        due: totals.currentDue.toFixed(2)
      }
    };
    
    res.status(200).json(response);
  } catch (err) {
    console.error('Error generating customer & supplier report:', err);
    res.status(500).json({ error: err.message || 'Error generating customer & supplier report' });
  }
};
