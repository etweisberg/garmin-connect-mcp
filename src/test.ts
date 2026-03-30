/**
 * Integration test suite for garmin-connect-mcp.
 * Requires a valid session at ~/.garmin-connect-mcp/session.json.
 * Run: npm test
 */

import { GarminClient } from "./garmin-client.js";

interface TestCase {
  name: string;
  run: (ctx: TestContext) => Promise<unknown>;
}

interface TestContext {
  client: GarminClient;
  displayName: string;
  activityId: string;
  today: string;
  thirtyDaysAgo: string;
}

const tests: TestCase[] = [
  // ── Session / Profile ──────────────────────────────────────────────
  {
    name: "check-session",
    run: ({ client }) =>
      client.get("userprofile-service/userprofile/user-settings/"),
  },
  {
    name: "get-user-profile",
    run: ({ client }) =>
      client.get("userprofile-service/userprofile/user-settings/"),
  },

  // ── Activities ─────────────────────────────────────────────────────
  {
    name: "list-activities",
    run: ({ client }) =>
      client.get("activitylist-service/activities/search/activities", {
        limit: 2,
        start: 0,
      }),
  },
  {
    name: "get-activity",
    run: ({ client, activityId }) =>
      client.get(`activity-service/activity/${activityId}`),
  },
  {
    name: "get-activity-details",
    run: ({ client, activityId }) =>
      client.get(`activity-service/activity/${activityId}/details`, {
        maxChartSize: 100,
        maxPolylineSize: 0,
        maxHeatMapSize: 100,
      }),
  },
  {
    name: "get-activity-splits",
    run: ({ client, activityId }) =>
      client.get(`activity-service/activity/${activityId}/splits`),
  },
  {
    name: "get-activity-hr-zones",
    run: ({ client, activityId }) =>
      client.get(`activity-service/activity/${activityId}/hrTimeInZones`),
  },
  {
    name: "get-activity-polyline",
    run: ({ client, activityId }) =>
      client.get(
        `activity-service/activity/${activityId}/polyline/full-resolution/`
      ),
  },
  {
    name: "get-activity-weather",
    run: ({ client, activityId }) =>
      client.get(`activity-service/activity/${activityId}/weather`),
  },
  {
    name: "download-fit",
    run: ({ client, activityId }) =>
      client.getBytes(`download-service/files/activity/${activityId}`),
  },

  // ── Daily Health ───────────────────────────────────────────────────
  {
    name: "get-daily-summary",
    run: ({ client, displayName, today }) =>
      client.get(`usersummary-service/usersummary/daily/${displayName}`, {
        calendarDate: today,
      }),
  },
  {
    name: "get-daily-heart-rate",
    run: ({ client, today }) =>
      client.get("wellness-service/wellness/dailyHeartRate", { date: today }),
  },
  {
    name: "get-daily-stress",
    run: ({ client, today }) =>
      client.get(`wellness-service/wellness/dailyStress/${today}`),
  },
  {
    name: "get-daily-summary-chart",
    run: ({ client, today }) =>
      client.get("wellness-service/wellness/dailySummaryChart/", {
        date: today,
      }),
  },
  {
    name: "get-daily-intensity-minutes",
    run: ({ client, today }) =>
      client.get(`wellness-service/wellness/daily/im/${today}`),
  },
  {
    name: "get-daily-movement",
    run: ({ client, today }) =>
      client.get("wellness-service/wellness/dailyMovement", {
        calendarDate: today,
      }),
  },
  {
    name: "get-daily-respiration",
    run: ({ client, today }) =>
      client.get(`wellness-service/wellness/daily/respiration/${today}`),
  },

  // ── Sleep, Body Battery, HRV ───────────────────────────────────────
  {
    name: "get-sleep",
    run: ({ client, today }) =>
      client.get("sleep-service/sleep/dailySleepData", {
        date: today,
        nonSleepBufferMinutes: 60,
      }),
  },
  {
    name: "get-body-battery",
    run: ({ client }) =>
      client.get("wellness-service/wellness/bodyBattery/messagingToday"),
  },
  {
    name: "get-hrv",
    run: ({ client, today }) => client.get(`hrv-service/hrv/${today}`),
  },

  // ── Weight ─────────────────────────────────────────────────────────
  {
    name: "get-weight",
    run: ({ client, today, thirtyDaysAgo }) =>
      client.get(`weight-service/weight/range/${thirtyDaysAgo}/${today}`, {
        includeAll: "true",
      }),
  },

  // ── Personal Records ───────────────────────────────────────────────
  {
    name: "get-personal-records",
    run: ({ client, displayName }) =>
      client.get(`personalrecord-service/personalrecord/prs/${displayName}`, {
        includeHistory: "true",
      }),
  },

  // ── Fitness Stats / Reports ────────────────────────────────────────
  {
    name: "get-fitness-stats",
    run: ({ client, today, thirtyDaysAgo }) =>
      client.get("fitnessstats-service/activity", {
        aggregation: "daily",
        startDate: thirtyDaysAgo,
        endDate: today,
        groupByActivityType: "true",
        standardizedUnits: "true",
        groupByParentActivityType: "false",
        userFirstDay: "sunday",
        metric: "duration",
      }),
  },
  {
    name: "get-vo2max",
    run: ({ client, today }) =>
      client.get(`metrics-service/metrics/maxmet/latest/${today}`),
  },
  {
    name: "get-hr-zones-config",
    run: ({ client }) => client.get("biometric-service/heartRateZones/"),
  },
];

async function main() {
  console.log("garmin-connect-mcp integration tests\n");

  const client = new GarminClient();
  const today = new Date().toISOString().slice(0, 10);
  const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000)
    .toISOString()
    .slice(0, 10);

  // Bootstrap: resolve displayName
  console.log("Bootstrapping...");
  const settings = (await client.get(
    "userprofile-service/userprofile/settings"
  )) as { displayName?: string };
  const displayName = settings.displayName;
  if (!displayName) {
    console.error("FATAL: Could not resolve displayName from settings");
    console.error("Response:", JSON.stringify(settings).slice(0, 500));
    await client.close();
    process.exit(1);
  }
  console.log(`  displayName: ${displayName}`);

  // Bootstrap: get a recent activityId
  const activities = (await client.get(
    "activitylist-service/activities/search/activities",
    { limit: 1, start: 0 }
  )) as { activityId: number }[];
  const activityId = String(activities?.[0]?.activityId ?? "");
  if (!activityId) {
    console.error("FATAL: No activities found");
    await client.close();
    process.exit(1);
  }
  console.log(`  activityId: ${activityId}`);
  console.log(`  date range: ${thirtyDaysAgo} → ${today}\n`);

  const ctx: TestContext = {
    client,
    displayName,
    activityId,
    today,
    thirtyDaysAgo,
  };

  let passed = 0;
  let failed = 0;

  for (const test of tests) {
    const start = Date.now();
    try {
      const result = await test.run(ctx);
      if (result === undefined) {
        throw new Error("undefined response");
      }
      const ms = Date.now() - start;
      const noData = result && typeof result === "object" && "noData" in result;
      console.log(
        `  PASS  ${test.name} (${ms}ms)${noData ? " [no data for date]" : ""}`
      );
      passed++;
    } catch (e) {
      const ms = Date.now() - start;
      const msg = e instanceof Error ? e.message : String(e);
      // Truncate long error messages
      const short = msg.length > 120 ? msg.slice(0, 120) + "..." : msg;
      console.log(`  FAIL  ${test.name} (${ms}ms) — ${short}`);
      failed++;
    }
  }

  console.log(
    `\nResults: ${passed} passed, ${failed} failed, ${passed + failed} total`
  );
  await client.close();
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
