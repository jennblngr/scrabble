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
  if (!config.vapid.publicKey || !config.vapid.privateKey) return;

  const { rows } = await pool.query<PushSubscriptionRow>(
    `SELECT endpoint, keys FROM push_subscriptions WHERE username = $1`,
    [username]
  );

  await Promise.all(
    rows.map(async (row) => {
      try {
        await webpush.sendNotification(
          { endpoint: row.endpoint, keys: row.keys } as webpush.PushSubscription,
          JSON.stringify(payload)
        );
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
      }
    })
  );
}
