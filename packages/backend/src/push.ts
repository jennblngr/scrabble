import webpush from "web-push";
import { pool } from "./db/pool.js";
import { config } from "./config.js";

if (config.vapid.publicKey && config.vapid.privateKey) {
  webpush.setVapidDetails(config.vapid.subject, config.vapid.publicKey, config.vapid.privateKey);
}

export interface PushSubscriptionRow {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}

export async function saveSubscription(username: string, subscription: PushSubscriptionRow): Promise<void> {
  await pool.query(
    `INSERT INTO push_subscriptions (username, endpoint, keys) VALUES ($1, $2, $3)
     ON CONFLICT (username, endpoint) DO UPDATE SET keys = EXCLUDED.keys`,
    [username, subscription.endpoint, JSON.stringify(subscription.keys)]
  );
}

export async function notifyUser(username: string, payload: { title: string; body: string }): Promise<void> {
  await notifyUserDebug(username, payload);
}

// DEBUG: same as notifyUser but reports what actually happened for each subscription,
// instead of swallowing failures silently. Remove alongside the /api/push/test route.
export interface NotifyDebugResult {
  vapidConfigured: boolean;
  subscriptionCount: number;
  results: { endpoint: string; ok: boolean; error?: string }[];
}

export async function notifyUserDebug(
  username: string,
  payload: { title: string; body: string }
): Promise<NotifyDebugResult> {
  if (!config.vapid.publicKey || !config.vapid.privateKey) {
    return { vapidConfigured: false, subscriptionCount: 0, results: [] };
  }

  const { rows } = await pool.query<PushSubscriptionRow>(
    `SELECT endpoint, keys FROM push_subscriptions WHERE username = $1`,
    [username]
  );

  const results = await Promise.all(
    rows.map(async (row) => {
      try {
        await webpush.sendNotification(
          { endpoint: row.endpoint, keys: row.keys } as webpush.PushSubscription,
          JSON.stringify(payload)
        );
        return { endpoint: row.endpoint, ok: true };
      } catch (err) {
        // A 410/404 means the subscription is stale; remove it so we stop retrying.
        const statusCode = (err as { statusCode?: number }).statusCode;
        if (statusCode === 404 || statusCode === 410) {
          await pool.query(`DELETE FROM push_subscriptions WHERE username = $1 AND endpoint = $2`, [
            username,
            row.endpoint,
          ]);
        } else {
          console.error("Push notification failed", err);
        }
        const message = err instanceof Error ? err.message : String(err);
        return { endpoint: row.endpoint, ok: false, error: `${statusCode ?? "?"} ${message}` };
      }
    })
  );

  return { vapidConfigured: true, subscriptionCount: rows.length, results };
}
