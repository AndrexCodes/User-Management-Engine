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
  // findOrCreateCategory
  // ---------------------------------------------------------------------
  /**
   * Looks up a product category by exact name (case-insensitive) and
   * returns it; creates it if it doesn't exist yet. This avoids the
   * "such entity does not exist" 404 you get from guessing/hardcoding a
   * `pcat_...` ID that was never actually created.
   *
   * @param {string} name Required. Exact category name to find or create.
   * @returns {Promise<object>} the existing or newly created product category
   */
  async findOrCreateCategory(name) {
    this._assertAuthenticated();
    if (!name) throw new Error('findOrCreateCategory: `name` is required');

    // `q` does a fuzzy/partial search server-side, so confirm an exact
    // (case-insensitive) name match before reusing a result — otherwise a
    // search for "Shirt" could incorrectly match an existing "Shirts".
    const { product_categories } = await this.client.admin.productCategory.list({
      q: name,
      limit: 100,
    });

    const existing = product_categories?.find((c) => c.name.toLowerCase() === name.toLowerCase());
    if (existing) return existing;

    const { product_category } = await this.client.admin.productCategory.create({
      name,
    });
    return product_category;
  }

  // ---------------------------------------------------------------------
  // addItem
  // ---------------------------------------------------------------------
  /**
   * Creates a product with sensible defaults, its variants (with initial
   * stock synced per-variant to a stock location), per-variant images
   * (via metadata, since Medusa has no native variant.images field),
   * custom business metadata (wholesale price, purchase cost, barcode),
   * and category assignment — all in one call.
   *
   * @param {Object} params
   * @param {string} params.title                     Required. Product title.
   * @param {string} params.salesChannelId             Required. Sales channel to attach the product to.
   * @param {string} params.stockLocationId            Required. Stock location to write initial stock against.
   * @param {string} [params.description]              Optional. Defaults to `""`.
   * @param {string} [params.subtitle]                 Optional. Defaults to `null`.
   * @param {string} [params.status]                   Optional. "draft" | "published" (default "published").
   * @param {boolean} [params.discountable]            Optional. Default `true`.
   * @param {string} [params.handle]                   Optional. URL handle/slug. Medusa auto-generates from title if omitted.
   * @param {string[]} [params.categoryIds]            Optional. Real, already-existing product category IDs
   *                                                    (`pcat_...`) to assign. Use this when you already looked
   *                                                    the ID up yourself. No existence check is performed here —
   *                                                    an invalid ID will 404 ("such entity does not exist").
   * @param {string[]} [params.categoryNames]          Optional. Category names to assign by name instead of ID.
   *                                                    Each name is resolved via `findOrCreateCategory()` — an
   *                                                    existing category with that exact name (case-insensitive)
   *                                                    is reused, otherwise a new one is created. Safe to call
   *                                                    repeatedly; it won't create duplicates.
   *                                                    `categoryIds` and `categoryNames` can be combined; both are
   *                                                    merged into the final `categories` relation sent to Medusa.
   * @param {Array}  [params.options]                  Optional. Product options, e.g. [{ title: "Color", values: ["Black","White"] }].
   *                                                    If omitted, a single "Default option" is derived from variant titles.
   * @param {Array}  params.variants                   Required. At least one variant.
   * @param {string} params.variants[].title            Required, e.g. "Black / M".
   * @param {string} params.variants[].sku              Required, must be unique.
   * @param {Array}  params.variants[].prices           Required. e.g. [{ currency_code: "usd", amount: 1000 }]
   * @param {number} [params.variants[].quantity]       Optional. Initial stocked quantity at stockLocationId (default 0).
   * @param {Object} [params.variants[].optionValues]   Optional. Explicit `{ [optionTitle]: value }` map for multi-option
   *                                                     products (e.g. `{ Color: "Black", Size: "M" }`). If omitted, the
   *                                                     variant is mapped to the first option's value using `title`.
   * @param {string} [params.variants[].imageUrl]       Optional. Image for this specific variant. Since Medusa has no
   *                                                     native per-variant image field, this is (a) pushed into the
   *                                                     product's `images` gallery tagged with `metadata.variant_sku`,
   *                                                     and (b) also written directly to `variant.metadata.image_url`
   *                                                     for simple, no-matching-required lookup.
   * @param {string} [params.variants[].barcode]        Optional. Native Medusa variant field.
   * @param {number} [params.variants[].wholesalePrice] Optional. Custom field -> stored as `variant.metadata.wholesale_price`.
   * @param {number} [params.variants[].purchaseCost]   Optional. Custom field -> stored as `variant.metadata.purchase_cost`.
   * @param {Object} [params.variants[].metadata]       Optional. Any additional custom key/value pairs merged into
   *                                                     `variant.metadata` alongside the fields above.
   *
   * @returns {Promise<{ product: object }>}
   */
  async addItem({ title, salesChannelId, stockLocationId, description = '', subtitle = null, status = 'published', discountable = true, handle, categoryIds, categoryNames, options, variants }) {
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

    // Resolve any category names to real IDs (creating them if needed),
    // then merge with any already-known IDs the caller passed directly.
    const resolvedCategoryIds = [...(categoryIds ?? [])];
    for (const name of categoryNames ?? []) {
      const category = await this.findOrCreateCategory(name);
      resolvedCategoryIds.push(category.id);
    }

    // Default to a single implicit option if the caller didn't specify one
    // (Medusa requires every variant to map to a product option value).
    const productOptions = options ?? [{ title: 'Default option', values: variants.map((v) => v.title) }];

    // Collect per-variant images into the product's gallery, tagged so they
    // can be traced back to the variant that requested them.
    const galleryImages = variants.filter((v) => v.imageUrl).map((v) => ({ url: v.imageUrl, metadata: { variant_sku: v.sku } }));

    const { product } = await this.client.admin.product.create({
      title,
      description,
      subtitle,
      status,
      discountable,
      ...(handle ? { handle } : {}),
      ...(resolvedCategoryIds.length ? { categories: resolvedCategoryIds.map((id) => ({ id })) } : {}),
      options: productOptions,
      ...(galleryImages.length ? { images: galleryImages } : {}),
      ...(galleryImages.length ? { thumbnail: galleryImages[0].url } : {}),
      variants: variants.map((v) => {
        const optionValues = v.optionValues ?? { [productOptions[0].title]: v.title };

        const metadata = {
          ...(v.metadata ?? {}),
          ...(v.imageUrl ? { image_url: v.imageUrl } : {}),
          ...(v.wholesalePrice != null ? { wholesale_price: v.wholesalePrice } : {}),
          ...(v.purchaseCost != null ? { purchase_cost: v.purchaseCost } : {}),
        };

        return {
          title: v.title,
          sku: v.sku,
          prices: v.prices,
          options: optionValues,
          ...(v.barcode ? { barcode: v.barcode } : {}),
          ...(Object.keys(metadata).length ? { metadata } : {}),
        };
      }),
      sales_channels: [{ id: salesChannelId }],
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

const medusaClient = new MedusaAdminSDK();

module.exports = MedusaAdminSDK;
module.exports.MedusaAdminSDK = MedusaAdminSDK;
module.exports.medusaClient = medusaClient;
