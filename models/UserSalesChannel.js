// UserSalesChannel.js
const mongoose = require('mongoose');

const userSalesChannelSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },

    // Medusa sales channel id, e.g. 'sc_01KXZGWDN67WFPHN5Y4XKDM4D1'
    salesChannelId: { type: String, required: true },

    // Default Medusa stock location id for this user within this channel,
    // e.g. 'sloc_01KXZGWDQCNNX04DC23666WHP2'
    stockLocationId: { type: String, required: true },

    // Marks which of a user's channel assignments is their default/active one,
    // relevant only if a user can belong to more than one channel
    isDefault: { type: Boolean, default: false },
  },
  { timestamps: true },
);

// A user can only be assigned to a given sales channel once
userSalesChannelSchema.index({ userId: 1, salesChannelId: 1 }, { unique: true });

// Fast lookup of all users in a channel (e.g. for channel-scoped notifications/admin views)
userSalesChannelSchema.index({ salesChannelId: 1 });

// Enforce a single isDefault: true per user at the application layer, since Mongo
// can't express "unique per userId where isDefault=true" declaratively without a
// partial index. A partial unique index is used instead:
userSalesChannelSchema.index({ userId: 1, isDefault: 1 }, { unique: true, partialFilterExpression: { isDefault: true } });

// Helper: fetch a user's default (or only) channel assignment
userSalesChannelSchema.statics.findDefaultForUser = function findDefaultForUser(userId) {
  return this.findOne({ userId, isDefault: true }) || this.findOne({ userId });
};

// Helper: assign a user to a channel, optionally as their default.
// If isDefault is true, clears any existing default for this user first
// so the partial unique index above never trips.
userSalesChannelSchema.statics.assignUserToChannel = async function assignUserToChannel(userId, salesChannelId, stockLocationId, isDefault = false) {
  if (isDefault) {
    await this.updateMany({ userId, isDefault: true }, { $set: { isDefault: false } });
  }
  return this.findOneAndUpdate({ userId, salesChannelId }, { $set: { stockLocationId, isDefault } }, { upsert: true, new: true, setDefaultsOnInsert: true });
};

const UserSalesChannel = mongoose.model('UserSalesChannel', userSalesChannelSchema);

module.exports = UserSalesChannel;
