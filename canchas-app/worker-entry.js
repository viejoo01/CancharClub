import openNextWorker from "./.open-next/worker.js";
export * from "./.open-next/worker.js";

const CRON_ROUTES = {
  "0 4 * * *": "/api/cron/recurring-slots-rollforward",
  "0 6 * * *": "/api/cron/saas-dunning",
  "0 10 * * *": "/api/cron/waitlist-cascade",
  "0 12 * * *": "/api/cron/keep-alive",
  "0 18 * * *": "/api/cron/match-reminders",
};

export default {
  async fetch(request, env, ctx) {
    return openNextWorker.fetch(request, env, ctx);
  },

  async scheduled(event, env, ctx) {
    const cronSchedule = event.cron;
    const path = CRON_ROUTES[cronSchedule];
    if (path) {
      console.log(`[Cron Trigger] Executing ${path} for schedule: ${cronSchedule}`);
      const appUrl = env.NEXT_PUBLIC_APP_URL || "https://cancharclub.com.ar";
      const cronUrl = `${appUrl}${path}`;
      const headers = {
        "User-Agent": "Cloudflare-Cron-Trigger",
      };
      if (env.CRON_SECRET) {
        headers["Authorization"] = `Bearer ${env.CRON_SECRET}`;
      }
      ctx.waitUntil(
        fetch(cronUrl, { method: "GET", headers })
          .then(async (res) => {
            console.log(`[Cron Trigger] ${path} executed - Status: ${res.status}`);
          })
          .catch((err) => {
            console.error(`[Cron Trigger] ${path} error:`, err);
          })
      );
    } else {
      console.warn(`[Cron Trigger] Unrecognized schedule: ${cronSchedule}`);
    }
  },
};
