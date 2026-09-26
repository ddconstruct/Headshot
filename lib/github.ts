/**
 * lib/github.ts — trigger the GitHub Actions worker from the web app.
 *
 * The Stripe webhook calls triggerWorkerDispatch() after enqueueing a paid
 * order so generation starts within seconds — no always-on host needed.
 * Failures are safe: the 12-hour scheduled sweep is the backup.
 */

const REPO = "ddconstruct/Headshot";
const WORKFLOW = "worker.yml";

export async function triggerWorkerDispatch(orderId: string): Promise<void> {
  const token = process.env.GITHUB_DISPATCH_TOKEN;
  if (!token) {
    console.log("GITHUB_DISPATCH_TOKEN not set; skipping worker dispatch (scheduled sweep will handle it).");
    return;
  }
  const res = await fetch(
    `https://api.github.com/repos/${REPO}/actions/workflows/${WORKFLOW}/dispatches`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github+json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ ref: "main", inputs: { order_id: orderId } }),
    }
  );
  if (!res.ok) {
    throw new Error(`GitHub dispatch ${res.status}: ${(await res.text()).slice(0, 200)}`);
  }
  console.log(`Dispatched headshot-worker for order ${orderId}.`);
}
