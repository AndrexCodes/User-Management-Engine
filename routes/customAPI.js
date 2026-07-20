const express = require('express');
const customAPIController = require('../controllers/customAPI');

const router = express.Router();

/**
 * GET /api/custom/add-item
 * Display context for adding a new item — user's assigned sales channel/stock location
 */
router.get('/add-item', customAPIController.getAddItem);

/**
 * POST /api/custom/add-item
 * Add a new product item to Medusa
 *
 * Request body:
 * {
 *   "title": "Product Name",
 *   "description": "Optional description",
 *   "status": "published",
 *   "variants": [
 *     {
 *       "title": "Default Variant",
 *       "sku": "UNIQUE-SKU-123",
 *       "prices": [{ "currency_code": "usd", "amount": 1000 }],
 *       "quantity": 50
 *     }
 *   ],
 *   "options": [{ "title": "Color", "values": ["Red", "Blue"] }],
 *   "images": ["https://example.com/image.jpg"],
 *   "thumbnail": "https://example.com/thumbnail.jpg"
 * }
 */
router.post('/add-item', customAPIController.postAddItem);

module.exports = router;
