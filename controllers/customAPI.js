const MedusaAdminSDK = require('../config/medusaSDK');
const UserSalesChannel = require('../models/UserSalesChannel');

/**
 * POST /api/custom/add-item
 * Add a new product item to Medusa using the user's assigned sales channel and stock location
 */
exports.postAddItem = async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ error: 'User not authenticated' });
    }

    // Get user's default sales channel and stock location assignment
    const userChannelAssignment = await UserSalesChannel.findDefaultForUser(userId);
    if (!userChannelAssignment) {
      return res.status(400).json({
        error: 'User has no assigned sales channel. Please contact support.',
      });
    }

    const { salesChannelId, stockLocationId } = userChannelAssignment;

    // Extract product details from request body
    const { title, description, status, variants, options, images, thumbnail } = req.body;

    // Validate required fields
    if (!title) {
      return res.status(400).json({ error: 'Product title is required' });
    }
    if (!variants || !Array.isArray(variants) || variants.length === 0) {
      return res.status(400).json({ error: 'At least one variant is required' });
    }

    // Validate variant structure
    for (const variant of variants) {
      if (!variant.title || !variant.sku || !variant.prices?.length) {
        return res.status(400).json({
          error: 'Each variant requires title, sku, and prices array',
        });
      }
    }

    // Initialize Medusa SDK and add item
    const medusa = new MedusaAdminSDK();
    await medusa.ready;

    const result = await medusa.addItem({
      title,
      description,
      status: status || 'published',
      variants,
      options,
      images,
      thumbnail,
      salesChannelId,
      stockLocationId,
    });

    return res.status(201).json({
      success: true,
      message: 'Product added successfully',
      product: result.product,
      channel: {
        salesChannelId,
        stockLocationId,
      },
    });
  } catch (error) {
    console.error('Error adding item to Medusa:', error.message);
    return res.status(500).json({
      error: 'Failed to add product to Medusa',
      details: error.message,
    });
  }
};

/**
 * GET /api/custom/add-item
 * Display form context and user's assigned sales channel/stock location
 */
exports.getAddItem = async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ error: 'User not authenticated' });
    }

    // Get user's channel assignment to display current context
    const userChannelAssignment = await UserSalesChannel.findDefaultForUser(userId);
    if (!userChannelAssignment) {
      return res.status(400).json({
        error: 'User has no assigned sales channel',
      });
    }

    return res.status(200).json({
      message: 'Add item form',
      userChannel: {
        salesChannelId: userChannelAssignment.salesChannelId,
        stockLocationId: userChannelAssignment.stockLocationId,
      },
    });
  } catch (error) {
    console.error('Error retrieving add item form:', error.message);
    return res.status(500).json({
      error: 'Failed to retrieve form data',
    });
  }
};
