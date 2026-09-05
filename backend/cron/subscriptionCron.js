const cron = require('node-cron');
const Subscription = require('../models/Subscription');
const SubscriptionService = require('../services/subscriptionService');
const mongoose = require('mongoose');

// Run every midnight (00:00)
const initSubscriptionCron = () => {
  cron.schedule('0 0 * * *', async () => {
    console.log('[CRON] Running daily subscription expiry check...');
    try {
      const now = new Date();
      
      // Find all ACTIVE subscriptions where expiryDate has passed
      const expiredSubscriptions = await Subscription.find({
        status: 'ACTIVE',
        expiryDate: { $lt: now }
      });

      for (const sub of expiredSubscriptions) {
        try {
          // Expire via service to log history properly and sync owner status
          await SubscriptionService.expireSubscription(sub._id);

          console.log(`[CRON] Expired subscription and suspended owner ${sub.ownerId}.`);
          // Trigger any future notification hooks here if needed

        } catch (err) {
          console.error(`[CRON] Failed to suspend subscription ${sub._id}:`, err);
        }
      }

      console.log(`[CRON] Expiry check completed. Processed ${expiredSubscriptions.length} subscriptions.`);

      // Upcoming Expiry Notifications (7, 3, 1 days)
      const notifyDays = [7, 3, 1];
      for (const days of notifyDays) {
        const targetDateStart = new Date(now);
        targetDateStart.setDate(targetDateStart.getDate() + days);
        targetDateStart.setHours(0, 0, 0, 0);

        const targetDateEnd = new Date(targetDateStart);
        targetDateEnd.setDate(targetDateEnd.getDate() + 1);

        const expiringSoon = await Subscription.find({
          status: 'ACTIVE',
          expiryDate: { $gte: targetDateStart, $lt: targetDateEnd }
        });

        for (const sub of expiringSoon) {
          try {
            const NotificationService = require('../services/notificationService');
            await NotificationService.createSystemNotification({
              type: 'SUBSCRIPTION_EXPIRING_SOON',
              message: `Subscription for owner ${sub.ownerId} expires in ${days} days.`,
              metadata: { ownerType: sub.ownerType, ownerId: sub.ownerId, daysRemaining: days, expiryDate: sub.expiryDate }
            });
            console.log(`[CRON] Created expiry notification for owner ${sub.ownerId} (${days} days)`);
          } catch (err) {
            console.error(`[CRON] Failed to create expiry notification for subscription ${sub._id}:`, err);
          }
        }
      }

    } catch (error) {
      console.error('[CRON] Error during subscription expiry check:', error);
    }
  });
};

module.exports = initSubscriptionCron;
