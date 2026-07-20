// ...existing code...
const express = require('express');
const { medusaClient } = require('../config/medusaSDK');
const UserSalesChannel = require('../models/UserSalesChannel');

const customAPIRouter = express.Router();

/**
 * POST /api/default/add-item
 * Proxy request body to medusaClient.addItem and return created product
 * If the authenticated user has a default UserSalesChannel, attach its
 * salesChannelId and stockLocationId to the payload when calling addItem.
 */
customAPIRouter.post('/add-item', async (req, res, next) => {
  try {
    await medusaClient.ready;
    const payload = { ...(req.body || {}) };

    const userChannel = await UserSalesChannel.findDefaultForUser(req.user._id);
    if (!userChannel) {
      return res.status(400).json({ error: 'No default sales channel found for user' });
    }

    payload.salesChannelId = userChannel.salesChannelId;
    payload.stockLocationId = userChannel.stockLocationId;

    // Ensure required Medusa params are present
    if (!payload.salesChannelId) {
      return res.status(400).json({ error: 'salesChannelId is required' });
    }
    if (!payload.stockLocationId) {
      return res.status(400).json({ error: 'stockLocationId is required' });
    }

    const result = await medusaClient.addItem(payload);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

module.exports = customAPIRouter;
