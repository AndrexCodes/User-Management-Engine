const appEvents = require('./events');
const { events } = require('./events');
const MedusaAdminSDK = require('./medusaSDK');
const UserSalesChannel = require('../models/UserSalesChannel');

const client = new MedusaAdminSDK();

// Handle user created event by triggering a create store admin API call to the Medusa backend.
appEvents.on(events.USER_CREATED, async (user) => {
  if (!client) {
    console.warn('Skipping Medusa store creation because Medusa credentials are not configured.');
    return;
  }

  console.log(`Creating Medusa store for user ${user}...`);

  try {
    // Create a new store for the user using the Medusa Admin SDK
    const storeName = 'My Store'; // You can customize this as needed
    const description = process.env.MEDUSA_STORE_DESCRIPTION || `Store created for ${user.email}`;

    const address = {
      address_1: 'Nairobi',
      address_2: 'Nairobi',
      city: 'Nairobi',
      province: 'Nairobi',
      postal_code: '00100',
      country_code: 'KE',
    };

    const missingAddressFields = ['address_1', 'city', 'postal_code', 'country_code'].filter((field) => !address[field]);

    if (missingAddressFields.length > 0) {
      throw new Error(`Missing Medusa store address env vars: ${missingAddressFields.join(', ')}`);
    }

    const result = await client.createStore({
      name: storeName,
      description,
      locationName: process.env.MEDUSA_STORE_LOCATION_NAME,
      address,
    });

    console.log(`Created Medusa store for ${user.email}:`, {
      salesChannelId: result.salesChannel.id,
      stockLocationId: result.stockLocation.id,
    });

    // Attach use to userSalesChannel model
    await UserSalesChannel.assignUserToChannel(
      user._id,
      result.salesChannel.id,
      result.stockLocation.id,
      true, // Set as default channel for the user
    );
  } catch (error) {
    console.error(`Failed to create a Medusa store for ${user?.email || 'unknown user'}:`, error);
  }
});
