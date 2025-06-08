const mongoose = require('mongoose');
const Sale = require('../../models/saleModel');
const Purchase = require('../../models/purchaseModel');
const Account = require('../../models/accountModel');
const Expense = require('../../models/expenseModel');
const Deposit = require('../../models/depositModel');
const FundTransfer = require('../../models/fundTransferModel');
const Stock = require('../../models/stockModel');
const PurchaseReturn = require('../../models/purchaseReturnModel');
const SaleReturn = require('../../models/saleReturnModel');

exports.getBalanceSheet = async (req, res) => {
  try {
    let { location_id, date } = req.query;

    if (!location_id || location_id === 'All locations') location_id = undefined;
    if (!date || date === 'All') date = undefined;

    const matchLocation = location_id ? { businessLocation: new mongoose.Types.ObjectId(location_id) } : {};
    const endOfDate = date ? new Date(date + 'T23:59:59.999Z') : undefined;

    const baseMatch = (modelDateField) => {
      const condition = { isDeleted: false, ...matchLocation };
      if (endOfDate) condition[modelDateField] = { $lte: endOfDate };
      return condition;
    };

    const [
      sales,
      purchases,
      expenses,
      deposits,
      fundTransfers,
      accounts,
      purchaseReturns,
      saleReturns
    ] = await Promise.all([
      Sale.find(baseMatch('saleDate')).lean(),
      Purchase.find(baseMatch('purchaseDate')).lean(),
      Expense.find(baseMatch('transactionDate')).lean(),
      Deposit.find(baseMatch('dateTime')).lean(),
      FundTransfer.find(baseMatch('dateTime')).lean(),
      Account.find({ is_active: true, ...matchLocation }).lean(),
      PurchaseReturn.find(baseMatch('returnDate')).lean(),
      SaleReturn.find(baseMatch('returnDate')).lean()
    ]);

    // --- DUES ---
    let customerDue = sales.reduce((acc, s) => acc + Number(s.paymentDue || 0), 0);
    let supplierDue = purchases.reduce((acc, p) => acc + Number(p.paymentDue || 0), 0);

    // Adjust dues with returns
    customerDue -= saleReturns.reduce((sum, r) => sum + Number(r.paymentDue || 0), 0);
    supplierDue -= purchaseReturns.reduce((sum, r) => sum + Number(r.paymentDue || 0), 0);

    const totalExpense = expenses.reduce((sum, e) => sum + Number(e.totalAmount || 0), 0);

    // --- BALANCE CALC ---
    const accountBalanceMap = {};
    const addCredit = (accId, amount) => {
      if (!accId) return;
      if (!accountBalanceMap[accId]) accountBalanceMap[accId] = 0;
      accountBalanceMap[accId] += Number(amount || 0);
    };
    const addDebit = (accId, amount) => {
      if (!accId) return;
      if (!accountBalanceMap[accId]) accountBalanceMap[accId] = 0;
      accountBalanceMap[accId] -= Number(amount || 0);
    };
    const isValidDate = (d) => !endOfDate || new Date(d) <= endOfDate;

    // Sales (Credit)
    sales.forEach(sale => {
      sale.payments?.forEach(p => {
        if (isValidDate(p.paidOn)) addCredit(p.account?.toString(), p.amount);
      });
    });

    // Sale Return (Debit)
    saleReturns.forEach(saleReturn => {
      saleReturn.returnPayments?.forEach(p => {
        if (isValidDate(p.paidOn)) addDebit(p.account?.toString(), p.amount);
      });
    });

    // Purchases (Debit)
    purchases.forEach(purchase => {
      purchase.payments?.forEach(p => {
        if (isValidDate(p.paidOn)) addDebit(p.account?.toString(), p.amount);
      });
    });

    // Purchase Return (Credit)
    purchaseReturns.forEach(purchaseReturn => {
      purchaseReturn.returnPayments?.forEach(p => {
        if (isValidDate(p.paidOn)) addCredit(p.account?.toString(), p.amount);
      });
    });

    // Expenses (Debit)
    expenses.forEach(exp => {
      exp.payments?.forEach(p => {
        if (isValidDate(p.paidOn)) addDebit(p.account?.toString(), p.amount);
      });
    });

    // Deposits (Credit)
    deposits.forEach(dep => {
      if (isValidDate(dep.paidOn)) addCredit(dep.account?.toString(), dep.amount);
    });

    // Fund Transfers
    fundTransfers.forEach(ft => {
      if (isValidDate(ft.date)) {
        addDebit(ft.from_account?.toString(), ft.amount);
        addCredit(ft.to_account?.toString(), ft.amount);
      }
    });

    // --- Account Balances ---
    let totalAccountBalance = 0;
    const accountBalances = [];
    const usedAccountIds = new Set();

    accounts.forEach(acc => {
      const accId = acc._id.toString();
      const transactionTotal = accountBalanceMap[accId] || 0;
      const initialBalance = Number(acc.initialBalance || 0);
      const finalBalance = transactionTotal + initialBalance;

      totalAccountBalance += finalBalance;

      accountBalances.push({
        accountId: acc._id,
        name: acc.name,
        balance: finalBalance.toFixed(2),
      });

      if (transactionTotal !== 0) {
        usedAccountIds.add(accId);
      }
    });

    accounts.forEach(acc => {
      const accId = acc._id.toString();
      const alreadyIncluded = accountBalances.some(a => a.accountId.toString() === accId);
      const createdBeforeOrOnDate = !endOfDate || new Date(acc.createdAt) <= endOfDate;

      if (!alreadyIncluded && createdBeforeOrOnDate) {
        const initialBalance = Number(acc.initialBalance || 0);
        totalAccountBalance += initialBalance;

        accountBalances.push({
          accountId: acc._id,
          name: acc.name,
          balance: initialBalance.toFixed(2),
        });
      }
    });

    // --- Closing Stock ---
    const stockMatch = {
      status: 1,
      ...matchLocation,
    };

    if (endOfDate) {
      stockMatch.createdAt = { $lte: endOfDate };
    }

    const closingStockDocs = await Stock.find(stockMatch)
      .populate({
        path: 'purchaseRef',
        select: 'products',
      })
      .lean();

    const closingStockValue = closingStockDocs.reduce((total, stockItem) => {
      const purchaseProducts = stockItem.purchaseRef?.products || [];
      const matchedProduct = purchaseProducts.find(
        (p) => p.product?.toString() === stockItem.product?.toString()
      );
      const unitCost = matchedProduct?.unitCost || 0;
      return total + unitCost;
    }, 0);

    const totalAsset = totalAccountBalance + closingStockValue + customerDue;
    const totalLiability = supplierDue + totalExpense;

    return res.status(200).json({
      customer_due: customerDue.toFixed(2),
      supplier_due: supplierDue.toFixed(2),
      account_balance: totalAccountBalance.toFixed(2),
      account_balances: accountBalances,
      total_expense: totalExpense.toFixed(2),
      closing_stock: closingStockValue.toFixed(2),
      date: date || 'Till today',
      location_id: location_id || 'All locations',
      total_liability: totalLiability.toFixed(2),
      total_asset: totalAsset.toFixed(2),
    });

  } catch (err) {
    console.error("Balance sheet error:", err);
    return res.status(500).json({ error: "Server error" });
  }
};


// exports.getBalanceSheet = async (req, res) => {
//   try {
//     let { location_id, date } = req.query;

//     if (!location_id || location_id === 'All locations') location_id = undefined;
//     if (!date || date === 'All') date = undefined;

//     const matchLocation = location_id ? { businessLocation: new mongoose.Types.ObjectId(location_id) } : {};

//     const endOfDate = date ? new Date(date + 'T23:59:59.999Z') : undefined;

//     const baseMatch = (modelDateField) => {
//       const condition = { isDeleted: false, ...matchLocation };
//       if (endOfDate) condition[modelDateField] = { $lte: endOfDate };
//       return condition;
//     };

//     const [sales, purchases, expenses, deposits, fundTransfers, accounts] = await Promise.all([
//       Sale.find(baseMatch('saleDate')).lean(),
//       Purchase.find(baseMatch('purchaseDate')).lean(),
//       Expense.find(baseMatch('transactionDate')).lean(),
//       Deposit.find(baseMatch('dateTime')).lean(),
//       FundTransfer.find(baseMatch('dateTime')).lean(),
//       Account.find({ is_active: true, ...matchLocation }).lean(),
//     ]);

//     // --- DUES ---
//     let customerDue = sales.reduce((acc, s) => acc + Number(s.paymentDue || 0), 0);
//     let supplierDue = purchases.reduce((acc, p) => acc + Number(p.paymentDue || 0), 0);
//     const totalExpense = expenses.reduce((sum, e) => sum + Number(e.totalAmount || 0), 0);

//     // --- BALANCE CALC ---
//     const accountBalanceMap = {};

//     const addCredit = (accId, amount) => {
//       if (!accId) return;
//       if (!accountBalanceMap[accId]) accountBalanceMap[accId] = 0;
//       accountBalanceMap[accId] += Number(amount || 0);
//     };

//     const addDebit = (accId, amount) => {
//       if (!accId) return;
//       if (!accountBalanceMap[accId]) accountBalanceMap[accId] = 0;
//       accountBalanceMap[accId] -= Number(amount || 0);
//     };

//     const isValidDate = (d) => !endOfDate || new Date(d) <= endOfDate;

//     // --- Sales (Credit) ---
//     sales.forEach(sale => {
//       sale.payments?.forEach(p => {
//         if (isValidDate(p.paidOn)) addCredit(p.account?.toString(), p.amount);
//       });
//     });

//     // --- Purchases (Debit) ---
//     purchases.forEach(purchase => {
//       purchase.payments?.forEach(p => {
//         if (isValidDate(p.paidOn)) addDebit(p.account?.toString(), p.amount);
//       });
//     });

//     // --- Expenses (Debit) ---
//     expenses.forEach(exp => {
//       exp.payments?.forEach(p => {
//         if (isValidDate(p.paidOn)) addDebit(p.account?.toString(), p.amount);
//       });
//     });

//     // --- Deposits (Credit) ---
//     deposits.forEach(dep => {
//       if (isValidDate(dep.paidOn)) addCredit(dep.account?.toString(), dep.amount);
//     });

//     // --- Fund Transfers ---
//     fundTransfers.forEach(ft => {
//       if (isValidDate(ft.date)) {
//         addDebit(ft.from_account?.toString(), ft.amount);
//         addCredit(ft.to_account?.toString(), ft.amount);
//       }
//     });

//     // --- Build Account Balances ---
//     let totalAccountBalance = 0;
//     const accountBalances = [];
//     const usedAccountIds = new Set();

//     // Step 1: Process accounts that had any transactions
//     accounts.forEach(acc => {
//       const accId = acc._id.toString();
//       const transactionTotal = accountBalanceMap[accId] || 0;
//       const initialBalance = Number(acc.initialBalance || 0);
//       const finalBalance = transactionTotal + initialBalance;

//       totalAccountBalance += finalBalance;

//       accountBalances.push({
//         accountId: acc._id,
//         name: acc.name,
//         balance: finalBalance.toFixed(2),
//       });

//       if (transactionTotal !== 0) {
//         usedAccountIds.add(accId);
//       }
//     });

//     // Step 2: Add remaining accounts that match date/location filter even if balance = 0
//     accounts.forEach(acc => {
//       const accId = acc._id.toString();
//       const alreadyIncluded = accountBalances.some(a => a.accountId.toString() === accId);
//       const createdBeforeOrOnDate = !endOfDate || new Date(acc.createdAt) <= endOfDate;

//       if (!alreadyIncluded && createdBeforeOrOnDate) {
//         const initialBalance = Number(acc.initialBalance || 0);
//         totalAccountBalance += initialBalance;

//         accountBalances.push({
//           accountId: acc._id,
//           name: acc.name,
//           balance: initialBalance.toFixed(2),
//         });
//       }
//     });

//     // --- Closing Stock ---
//     const stockMatch = {
//       status: 1,
//       ...matchLocation,
//     };
    
//     if (endOfDate) {
//       stockMatch.createdAt = { $lte: endOfDate };
//     }
    
//     const closingStockDocs = await Stock.find(stockMatch)
//       .populate({
//         path: 'purchaseRef',
//         select: 'products',
//       })
//       .lean();
    
//     const closingStockValue = closingStockDocs.reduce((total, stockItem) => {
//       const purchaseProducts = stockItem.purchaseRef?.products || [];
    
//       // Find the matching product in purchaseRef.products array
//       const matchedProduct = purchaseProducts.find(
//         (p) => p.product?.toString() === stockItem.product?.toString()
//       );
    
//       const unitCost = matchedProduct?.unitCost || 0;
//       return total + unitCost;
//     }, 0);    

//     const totalAsset = totalAccountBalance + closingStockValue + customerDue;
//     const totalLiability = supplierDue + totalExpense;

//     return res.status(200).json({
//       customer_due: customerDue.toFixed(2),
//       supplier_due: supplierDue.toFixed(2),
//       account_balance: totalAccountBalance.toFixed(2),
//       account_balances: accountBalances,
//       total_expense: totalExpense.toFixed(2),
//       closing_stock: closingStockValue.toFixed(2),
//       date: date || 'Till today',
//       location_id: location_id || 'All locations',
//       total_liability: totalLiability.toFixed(2),
//       total_asset: totalAsset.toFixed(2),
//     });

//   } catch (err) {
//     console.error("Balance sheet error:", err);
//     return res.status(500).json({ error: "Server error" });
//   }
// };
