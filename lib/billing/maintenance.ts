import { EXPIRY_REMINDER_DAYS } from "@/lib/constants";
import {
  listExpiredPlusUsers,
  listUsersNeedingExpiryReminders,
} from "@/lib/billing/entitlements";
import { downgradeUser } from "@/lib/billing/subscriptions";
import {
  sendDowngradeEmail,
  sendExpiryReminderEmail,
} from "@/lib/billing/email";
import {
  hasProcessedEvent,
  recordBillingEvent,
} from "@/lib/billing/subscriptions";

export async function runBillingMaintenance(now = Date.now()): Promise<{
  reminders: number;
  downgraded: number;
}> {
  let reminders = 0;
  let downgraded = 0;

  const needingReminders = listUsersNeedingExpiryReminders(
    EXPIRY_REMINDER_DAYS,
    now,
  );

  for (const user of needingReminders) {
    if (!user.email || !user.planPeriodEnd) continue;
    const eventId = `reminder_${user.id}_${user.daysLeft}_${user.planPeriodEnd.getTime()}`;
    if (hasProcessedEvent(eventId)) continue;

    await sendExpiryReminderEmail(
      user.email,
      user.daysLeft,
      user.planPeriodEnd,
    );
    recordBillingEvent(eventId, "stripe", `expiry_reminder_${user.daysLeft}d`);
    reminders += 1;
  }

  const expired = listExpiredPlusUsers(now);
  for (const user of expired) {
    // Active Stripe subscriptions without a past period end are filtered out in listExpiredPlusUsers
    const { paused } = downgradeUser(user.id);
    if (user.email) {
      await sendDowngradeEmail(user.email, paused);
    }
    recordBillingEvent(`downgrade_${user.id}_${now}`, "stripe", "plan_expired");
    downgraded += 1;
  }

  return { reminders, downgraded };
}
