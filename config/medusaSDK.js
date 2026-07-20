require('dotenv').config();
const MedusaImport = require('@medusajs/js-sdk');
const Medusa = MedusaImport.default;

/**
 * MedusaAdminSDK
 * A minimal Node.js wrapper around @medusajs/js-sdk for scripted/backoffice
 * automation against a Medusa v2 server's Admin API.
 *
 * NOTE ON PACKAGES:
 * @medusajs/admin-sdk (the one originally referenced) is a *frontend* toolkit
 * for building widgets/routes that run inside the Medusa Admin dashboard
 * (defineWidgetConfig / defineRouteConfig). It has no HTTP client and cannot
 * be used to script requests from a standalone Node process. The package
 * that does that is @medusajs/js-sdk, which is what this file wraps.
 */
class MedusaAdminSDK {
  constructor() {
    const { MEDUSA_BACKEND_URL, MEDUSA_ADMIN_EMAIL, MEDUSA_ADMIN_PASSWORD, MEDUSA_ADMIN_API_KEY, MEDUSA_DEFAULT_CURRENCY } = process.env;

    if (!MEDUSA_BACKEND_URL) {
      throw new Error('MEDUSA_BACKEND_URL is required (e.g. http://localhost:9000)');
    }

    // Either a static API key OR an email/password pair must be present.
    if (!MEDUSA_ADMIN_API_KEY && !(MEDUSA_ADMIN_EMAIL && MEDUSA_ADMIN_PASSWORD)) {
      throw new Error('Provide either MEDUSA_ADMIN_API_KEY, or both MEDUSA_ADMIN_EMAIL and MEDUSA_ADMIN_PASSWORD');
    }

    this.config = {
      backendUrl: MEDUSA_BACKEND_URL.replace(/\/$/, ''),
      adminEmail: MEDUSA_ADMIN_EMAIL,
      adminPassword: MEDUSA_ADMIN_PASSWORD,
      adminApiKey: MEDUSA_ADMIN_API_KEY || null,
      defaultCurrency: (MEDUSA_DEFAULT_CURRENCY || 'usd').toLowerCase(),
    };

    console.log('MedusaAdminSDK config:', {
      backendUrl: this.config.backendUrl,
      adminEmail: this.config.adminEmail,
      adminApiKey: this.config.adminApiKey ? '****' : null,
      defaultCurrency: this.config.defaultCurrency,
    });

    this.client = new Medusa({
      baseUrl: this.config.backendUrl,
      apiKey: this.config.adminApiKey,
      auth: {
        type: 'jwt',
        jwtTokenStorageMethod: 'memory', // no browser storage available in Node
      },
    });
    this._authenticated = false;
    this.ready = this.init();
  }

  // ---------------------------------------------------------------------
  // init
  // ---------------------------------------------------------------------
  /**
   * Authenticates the default admin user (or uses a static API key if one
   * was supplied) and stores the resulting JWT in memory for subsequent
   * requests made through this.client.
   *
   * Required env params:
   *  - MEDUSA_BACKEND_URL            (always required)
   *  - MEDUSA_ADMIN_EMAIL            (required unless MEDUSA_ADMIN_API_KEY set)
   *  - MEDUSA_ADMIN_PASSWORD         (required unless MEDUSA_ADMIN_API_KEY set)
   *  - MEDUSA_ADMIN_API_KEY          (optional shortcut; skips login entirely)
   *
   * @returns {Promise<{ id: string, email: string }>} the authenticated user
   */
  async init() {
    const { products, count } = await this.client.admin.product.list({
      limit: 10,
      offset: 0,
      fields: 'id,title,status,*variants',
    });

    this._authenticated = true;
    console.log('MedusaAdminSDK authenticated successfully.');

    // console.log(`Found ${count} products`)
    // products.forEach((p) => console.log(`- ${p.title} (${p.status})`))
    return { products, count };
  }

  _assertAuthenticated() {
    if (!this._authenticated) {
      throw new Error('Call init() before using this method.');
    }
  }

  // ---------------------------------------------------------------------
  // createStore
  // ---------------------------------------------------------------------
  /**
   * Creates a sales channel and a stock location, then links the two so
   * inventory at that location is sellable through that channel.
   *
   * @param {Object} params
   * @param {string} params.name                 Required. Sales channel & default location display name base.
   * @param {string} [params.description]         Optional. Sales channel description.
   * @param {string} [params.locationName]        Optional. Defaults to `${name} Warehouse`.
   * @param {Object} params.address               Required. Stock location address.
   * @param {string} params.address.address_1     Required.
   * @param {string} [params.address.address_2]
   * @param {string} params.address.city          Required.
   * @param {string} [params.address.province]
   * @param {string} params.address.postal_code   Required.
   * @param {string} params.address.country_code  Required. ISO 2-letter (e.g. "us").
   *
   * @returns {Promise<{ salesChannel: object, stockLocation: object }>}
   */
  async createStore({ name, description, locationName, address }) {
    this._assertAuthenticated();

    if (!name) throw new Error('createStore: `name` is required');
    if (!address) throw new Error('createStore: `address` is required');
    for (const field of ['address_1', 'city', 'postal_code', 'country_code']) {
      if (!address[field]) {
        throw new Error(`createStore: address.${field} is required`);
      }
    }

    // 1. Sales channel
    const { sales_channel: salesChannel } = await this.client.admin.salesChannel.create({
      name,
      description: description ?? `${name} sales channel`,
    });

    // 2. Stock location
    const { stock_location: stockLocation } = await this.client.admin.stockLocation.create({
      name: locationName ?? `${name} Warehouse`,
      address,
    });

    // 3. Link the stock location to the sales channel so products stocked
    //    there can be sold through it.
    await this.client.admin.stockLocation.updateSalesChannels(stockLocation.id, {
      add: [salesChannel.id],
    });

    return { salesChannel, stockLocation };
  }

  // ---------------------------------------------------------------------
  // addItem
  // ---------------------------------------------------------------------
  /**
   * Creates a product (with at least one variant) attached to a sales
   * channel, then writes stocked quantity for each variant's inventory item
   * at the given stock location ("sync to default stock location").
   *
   * @param {Object} params
   * @param {string} params.title                  Required. Product title.
   * @param {string} params.salesChannelId          Required. From createStore().salesChannel.id.
   * @param {string} params.stockLocationId         Required. From createStore().stockLocation.id.
   * @param {string} [params.description]           Optional. Product description.
   * @param {string} [params.status]                Optional. "draft" | "published" (default "published").
   * @param {Array}  params.variants                Required. At least one variant.
   * @param {string} params.variants[].title         Required, e.g. "Default variant".
   * @param {string} params.variants[].sku           Required, must be unique.
   * @param {Array}  params.variants[].prices        Required. e.g. [{ currency_code: "usd", amount: 1000 }]
   * @param {number} [params.variants[].quantity]    Optional. Stocked quantity at stockLocationId (default 0).
   * @param {Array}  [params.options]                Optional. Product options, e.g. [{ title: "Size", values: ["S","M"] }].
   *                                                  Defaults to a single "Default option"/"Default variant" pairing
   *                                                  if omitted and only one variant is given.
   *
   * @returns {Promise<{ product: object }>}
   */
  async addItem({ title, salesChannelId, stockLocationId, description, status = 'published', variants, options, images, thumbnail }) {
    this._assertAuthenticated();

    if (!title) throw new Error('addItem: `title` is required');
    if (!salesChannelId) throw new Error('addItem: `salesChannelId` is required');
    if (!stockLocationId) throw new Error('addItem: `stockLocationId` is required');
    if (!variants?.length) throw new Error('addItem: at least one variant is required');

    for (const v of variants) {
      if (!v.title || !v.sku || !v.prices?.length) {
        throw new Error('addItem: each variant needs `title`, `sku`, and non-empty `prices`');
      }
    }

    // Default to a single implicit option if the caller didn't specify one
    // (Medusa requires every variant to map to a product option value).
    const productOptions = options ?? [{ title: 'Default option', values: variants.map((v) => v.title) }];

    // Normalize images to Medusa's expected `{ url, metadata? }` shape,
    // whether the caller passed plain strings or objects.
    const normalizedImages = (images ?? []).map((img) => (typeof img === 'string' ? { url: img } : img));

    const { product } = await this.client.admin.product.create({
      title,
      description,
      status,
      options: productOptions,
      variants: variants.map((v) => ({
        title: v.title,
        sku: v.sku,
        prices: v.prices,
        options: { [productOptions[0].title]: v.title },
      })),
      sales_channels: [{ id: salesChannelId }],
      ...(normalizedImages.length ? { images: normalizedImages } : {}),
      ...(thumbnail ? { thumbnail } : normalizedImages.length ? { thumbnail: normalizedImages[0].url } : {}),
    });

    // Fetch back with inventory items expanded so we have inventory_item ids
    // to write stock levels against.
    const { product: withInventory } = await this.client.admin.product.retrieve(product.id, { fields: '*variants.inventory_items.inventory.id' });

    for (const variant of withInventory.variants) {
      const requested = variants.find((v) => v.sku === variant.sku);
      const quantity = requested?.quantity ?? 0;

      for (const invItem of variant.inventory_items ?? []) {
        const inventoryItemId = invItem.inventory?.id ?? invItem.inventory_item_id;
        if (!inventoryItemId) continue;

        await this.client.admin.inventoryItem.updateLocationLevel(inventoryItemId, stockLocationId, { stocked_quantity: quantity });
      }
    }

    return { product: withInventory };
  }
}

module.exports = MedusaAdminSDK;
module.exports.MedusaAdminSDK = MedusaAdminSDK;
