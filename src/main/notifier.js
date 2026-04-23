const { Notification } = require('electron');

class Notifier {
  notify({ title, body }) {
    if (!Notification.isSupported()) return false;
    const notification = new Notification({ title, body });
    notification.show();
    return true;
  }
}

module.exports = { Notifier };
