const xlsx = require('xlsx');
const Contact = require('../../models/contactModel');
const generateAutoId = require('../../utils/generateAutoId');

exports.importContacts = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const workbook = xlsx.read(req.file.buffer, { type: 'buffer' });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const rows = xlsx.utils.sheet_to_json(sheet);

    const insertedContacts = [];

    for (const row of rows) {
      const contactTypeMap = {
        '1': 'Customer',
        '2': 'Supplier',
        '3': 'Both',
      };

      if(!row['CONTACT ID']) {
        row['CONTACT ID'] = await generateAutoId('CONT');
      }

      const contact = new Contact({
        contactType: contactTypeMap[row['CONTACT TYPE']] || 'Customer',
        prefix: row['PREFIX'] || '',
        firstName: row['FIRST NAME'],
        lastName: row['LAST NAME'],
        businessName: row['BUSINESS NAME'],
        contactId: row['CONTACT ID'],
        taxNumber: row['TAX NUMBER'],
        openingBalance: row['OPENING BALANCE'] || 0,
        advanceBalance: row['ADVANCE BALANCE'] || 0,
        payTerm: row['PAY TERM'] || null,
        payTermPeriod: row['PAY TERM PERIOD'] || null,
        creditLimit: row['CREDIT LIMIT'] || null,
        email: row['EMAIL'],
        mobile: row['MOBILE'],
        altContactNumber: row['ALT. CONTACT NO.'],
        landline: row['LANDLINE'],
        city: row['CITY'],
        state: row['STATE'],
        country: row['COUNTRY'],
        addressLine1: row['ADDRESS LINE 1'],
        addressLine2: row['ADDRESS LINE 2'],
        zipCode: row['ZIP CODE'],
        dateOfBirth: row['DOB']
          ? new Date(row['DOB'])
          : undefined,
      });

      await contact.save();
      insertedContacts.push(contact);
    }

    res.status(201).json({ message: 'Contacts imported successfully', insertedContacts });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
