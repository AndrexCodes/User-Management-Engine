const { EventEmitter } = require('node:events');

class AppEvents extends EventEmitter {}

const appEvents = new AppEvents();

const events = {
  USER_CREATED: 'user.created',
  USER_UPDATED: 'user.updated',
};

module.exports = appEvents;
module.exports.events = events;
