const xlsx = require('xlsx');
const Contact = require('../../models/contactModel');

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

      const contact = new Contact({
        contactType: contactTypeMap[row['Contact type (Required)']] || 'Customer',
        prefix: row['Prefix (Optional)'] || '',
        firstName: row['First Name (Required)'],
        middleName: row['Middle name (Optional)'],
        lastName: row['Last Name (Optional)'],
        businessName: row['Business Name\n(Required if contact type is supplier or both)'],
        contactId: row['Contact ID (Optional)'],
        taxNumber: row['Tax number (Optional)'],
        openingBalance: row['Opening Balance (Optional)'] || 0,
        payTerm: row['Pay term\n(Required if contact type is supplier or both)'] || null,
        payTermPeriod: row['Pay term period\n(Required if contact type is supplier or both)'],
        creditLimit: row['Credit Limit (Optional)'] || null,
        email: row['Email (Optional)'],
        mobile: row['Mobile (Required)'],
        altContactNumber: row['Alternate contact number (Optional)'],
        landline: row['Landline (Optional)'],
        city: row['City (Optional)'],
        state: row['State (Optional)'],
        country: row['Country (Optional)'],
        addressLine1: row['Address line 1 (Optional)'],
        addressLine2: row['Address line 2 (Optional)'],
        zipCode: row['Zip Code (Optional)'],
        dateOfBirth: row['Date of birth (Optional)']
          ? new Date(row['Date of birth (Optional)'])
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
