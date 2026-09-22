function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const base64Safe = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64Safe);
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
}

export async function subscribeToPush(): Promise<void> {
  if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
    throw new Error("Ce navigateur ne supporte pas les notifications push (Web Push)");
  }

  const permission = await Notification.requestPermission();
  if (permission !== "granted") {
    throw new Error(`Permission de notification: "${permission}" (pas "granted")`);
  }

  const { publicKey } = await fetch("/api/push/vapid-public-key").then((r) => r.json());
  if (!publicKey) {
    throw new Error("Clé VAPID publique manquante côté serveur (variables d'env non configurées)");
  }

  const registration = await navigator.serviceWorker.ready;
  const existing = await registration.pushManager.getSubscription();
  const subscription =
    existing ??
    (await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(publicKey) as BufferSource,
    }));

  await fetch("/api/push/subscribe", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ subscription: subscription.toJSON() }),
  });
}

// DEBUG: triggers a test push notification to the logged-in user, and returns diagnostics
// about what actually happened. Remove once the push notification flow has been verified
// end-to-end (along with its call site and button).
export interface TestPushResult {
  vapidConfigured: boolean;
  subscriptionCount: number;
  results: { endpoint: string; ok: boolean; error?: string }[];
}

export async function sendTestPush(): Promise<TestPushResult> {
  await subscribeToPush();
  const res = await fetch("/api/push/test", { method: "POST", credentials: "include" });
  if (!res.ok) throw new Error("Échec de l'envoi de la notification de test");
  return res.json();
}
