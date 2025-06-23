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

    // Location filter - ensure proper filtering of location data
    let parsedLocationId = null;
    if (locationId && locationId !== 'All locations') {
      // Convert locationId to ObjectId if it's a string
      parsedLocationId = locationId;
    }

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
      isDeleted: false
    };

    // 1. Get all contacts based on filters
    const contacts = await Contact.find(contactFilters).select('_id firstName lastName businessName contactType mobile email contactId');
    
    console.log(`Found ${contacts.length} contacts with filters:`, contactFilters);

    // 2. Process each contact to get their transaction data
    const contactReportData = await Promise.all(contacts.map(async (contact) => {
      const contactId = contact._id;
      
      // Get total purchases for this contact with all filters in a single query - include ALL purchases
      const purchases = await Purchase.find({ 
        supplier: contactId,
        purchaseDate: dateFilter,
        isDeleted: false,
        ...(parsedLocationId ? { businessLocation: parsedLocationId } : {})
      });
      
      // Calculate total purchases (including both regular purchases and those created from returns)
      const totalPurchase = purchases.reduce((total, purchase) => {
        return total + (purchase.totalAmountWithGst || purchase.total || 0);
      }, 0);
      
      // Get total purchase returns for this contact
      const purchaseReturns = await PurchaseReturn.find({
        returnDate: dateFilter,
        isDeleted: { $ne: true },
        ...(parsedLocationId ? { businessLocation: parsedLocationId } : {})
      }).populate({
        path: 'originalPurchase',
        match: { supplier: contactId, isDeleted: { $ne: true } }
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
        isDeleted: false,
        ...(parsedLocationId ? { businessLocation: parsedLocationId } : {})
      });
      
      const totalSale = sales.reduce((total, sale) => {
        return total + (sale.totalAmountWithGst || sale.total || 0);
      }, 0);
      
      // Get sale returns data directly from Purchase model where createdFromReturn=true
      const saleReturnPurchases = await Purchase.find({
        createdFromReturn: true,
        purchaseDate: dateFilter,
        isDeleted: false,
        ...(parsedLocationId ? { businessLocation: parsedLocationId } : {})
      }).populate({
        path: 'saleReturnRef',
        match: { isDeleted: false },
        populate: {
          path: 'originalSale',
          select: 'customer',
          match: { isDeleted: false }
        }
      });
      
      // Filter to get only those purchases/returns that belong to this customer
      const filteredSaleReturnPurchases = saleReturnPurchases.filter(purchase => 
        purchase.saleReturnRef && 
        purchase.saleReturnRef.originalSale && 
        purchase.saleReturnRef.originalSale.customer && 
        purchase.saleReturnRef.originalSale.customer.toString() === contactId.toString()
      );
      
      // Calculate total sale returns from the Purchase model data
      const totalSaleReturn = filteredSaleReturnPurchases.reduce((total, purchase) => {
        return total + (purchase.totalAmountWithGst || purchase.total || 0);
      }, 0);
      
      // Get opening balance - from contact record directly
      const openingBalanceDue = contact.openingBalance || 0;
      
      // Calculate current due amount based on the type of transactions the contact has
      let currentDue = 0;
      
      // Add opening balance to current due
      currentDue += openingBalanceDue;
      
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
        
        // For customer transactions, sale return is already handled as a purchase payment 
        // when it's converted to a purchase, so don't subtract it again here
        const customerDue = totalSale - totalPaymentsReceived;
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
        mobile: contact.mobile,
        systemContactId: contact.contactId,
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
    
    // 4. Combine duplicate contacts
    const uniqueContactsMap = new Map();
    
    contactReportData.forEach(contact => {
      // Use the MongoDB _id directly for uniqueness check
      const uniqueKey = contact.contactId.toString();
      
      if (uniqueContactsMap.has(uniqueKey)) {
        // If contact already exists in our map, combine the values
        const existingContact = uniqueContactsMap.get(uniqueKey);
        existingContact.totalPurchase += contact.totalPurchase;
        existingContact.totalPurchaseReturn += contact.totalPurchaseReturn;
        existingContact.totalSale += contact.totalSale;
        existingContact.totalSaleReturn += contact.totalSaleReturn;
        existingContact.openingBalanceDue += contact.openingBalanceDue;
        existingContact.currentDue += contact.currentDue;
      } else {
        // Add to map if first occurrence
        uniqueContactsMap.set(uniqueKey, { ...contact });
      }
    });
    
    // Convert map back to array
    const uniqueContactsArray = Array.from(uniqueContactsMap.values());
    
    console.log(`After deduplication: ${uniqueContactsArray.length} contacts`);
    
    // 5. Format the response
    const response = {
      filters: {
        startDate,
        endDate,
        locationId: locationId || 'All locations',
        contactType: contactType || 'All',
        contactId: contactId || 'All'
      },
      contacts: uniqueContactsArray.map(contact => ({
        contactName: contact.contactName,
        contactId: contact.contactId,
        contactType: contact.contactType,
        mobile: contact.mobile,
        systemContactId: contact.systemContactId,
        totalPurchase: Number(contact.totalPurchase).toFixed(2),
        totalPurchaseReturn: Number(contact.totalPurchaseReturn).toFixed(2),
        totalSale: Number(contact.totalSale).toFixed(2),
        totalSaleReturn: Number(contact.totalSaleReturn).toFixed(2),
        openingBalanceDue: Number(contact.openingBalanceDue).toFixed(2),
        due: Number(contact.currentDue).toFixed(2)
      })),
      totals: {
        totalPurchase: Number(totals.totalPurchase).toFixed(2),
        totalPurchaseReturn: Number(totals.totalPurchaseReturn).toFixed(2),
        totalSale: Number(totals.totalSale).toFixed(2),
        totalSaleReturn: Number(totals.totalSaleReturn).toFixed(2),
        openingBalanceDue: Number(totals.openingBalanceDue).toFixed(2),
        due: Number(totals.currentDue).toFixed(2)
      }
    };
    
    // Log for debugging
    console.log('Generated customer supplier report with filter:', 
      { startDate, endDate, locationId, contactType, contactId });
    
    res.status(200).json(response);
  } catch (err) {
    console.error('Error generating customer & supplier report:', err);
    res.status(500).json({ error: err.message || 'Error generating customer & supplier report' });
  }
};
