import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { inflateRawSync } from "node:zlib";
import {
  getSharedClient,
  resetSharedClient,
  sessionExists,
  getSessionFile,
} from "./garmin-client.js";
export { registerResources } from "./resources.js";

function jsonResult(data: unknown) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }],
  };
}

function textResult(text: string) {
  return { content: [{ type: "text" as const, text }] };
}

function errorResult(msg: string) {
  return { content: [{ type: "text" as const, text: msg }], isError: true };
}

function todayDate(): string {
  return new Date().toISOString().slice(0, 10);
}

function getClient() {
  if (!sessionExists()) {
    throw new Error(
      "No Garmin session found. The user needs to run: npx garmin-connect-mcp login"
    );
  }
  return getSharedClient();
}

export function registerTools(server: McpServer): void {
  // ── garmin-login ────────────────────────────────────────────────────

  server.tool(
    "garmin-login",
    "Returns step-by-step instructions for authenticating with Garmin Connect. Requires the Playwright MCP server to be installed. After following these steps, ALWAYS call the check-session tool to verify the login worked.",
    {},
    async () => {
      const sessionFile = getSessionFile();
      return textResult(
        `# Garmin Connect Login

To authenticate, you need the Playwright MCP server installed (\`@playwright/mcp\`).

## Steps (execute these in order):

1. **Open Garmin Connect** using the Playwright MCP browser_navigate tool:
   \`\`\`
   browser_navigate → https://connect.garmin.com/app/activities
   \`\`\`

2. **Tell the user** to log in to Garmin Connect in the browser window that opened. Wait for them to confirm they are logged in and can see their activities.

3. **Navigate to the activities page** (the login may redirect elsewhere):
   \`\`\`
   browser_navigate → https://connect.garmin.com/app/activities
   \`\`\`

4. **Extract the CSRF token** using browser_evaluate (NOT browser_run_code — the meta tag needs the page to be fully rendered):
   \`\`\`javascript
   () => {
     const meta = document.querySelector('meta[name="csrf-token"]');
     return meta ? meta.getAttribute('content') : 'NOT_FOUND';
   }
   \`\`\`
   Save this value — you'll need it in step 6.

5. **Extract cookies** using browser_run_code:
   \`\`\`javascript
   async (page) => {
     const cookies = await page.context().cookies();
     const garminCookies = cookies
       .filter(c => c.domain && c.domain.includes('garmin'))
       .map(c => ({ name: c.name, value: c.value, domain: c.domain }));
     return JSON.stringify(garminCookies);
   }
   \`\`\`

6. **Write the session file** to: ${sessionFile}
   - Create the directory \`~/.garmin-connect-mcp/\` if it doesn't exist (mkdir -p)
   - Combine the CSRF token from step 4 and cookies from step 5 into: \`{ "csrf_token": "<from step 4>", "cookies": <from step 5> }\`
   - Write this JSON to the session file

7. **IMPORTANT: Call the \`check-session\` tool** to verify the login worked.

## Notes
- Session cookies expire after a few hours — re-run this flow when they do.
- The Playwright browser must stay open during steps 4-5 (don't close it before extracting).
`
      );
    }
  );

  // ── check-session ──────────────────────────────────────────────────

  server.tool(
    "check-session",
    "Check if the saved Garmin Connect session is still valid. MUST be called after garmin-login to verify authentication worked.",
    {},
    async () => {
      if (!sessionExists()) {
        return errorResult(
          "No session file found. Call the garmin-login tool for instructions."
        );
      }
      try {
        const client = getClient();
        const profile = await client.get(
          "userprofile-service/userprofile/user-settings/"
        );
        return jsonResult({ status: "ok", profile });
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        // Reset the singleton so the next attempt re-reads the session file
        await resetSharedClient();
        return errorResult(
          `Session invalid or expired: ${msg}\nCall the garmin-login tool to re-authenticate.`
        );
      }
    }
  );

  // ── list-activities ────────────────────────────────────────────────

  server.tool(
    "list-activities",
    "List your Garmin Connect activities with pagination",
    {
      limit: z
        .number()
        .default(20)
        .describe("Max activities to return (1-100)"),
      start: z.number().default(0).describe("Pagination offset"),
    },
    async ({ limit, start }) => {
      const client = getClient();
      const data = await client.get(
        "activitylist-service/activities/search/activities",
        { limit, start }
      );
      return jsonResult(data);
    }
  );

  // ── get-activity ───────────────────────────────────────────────────

  server.tool(
    "get-activity",
    "Get full activity summary (name, type, distance, duration, HR, calories, etc.)",
    {
      activityId: z.string().describe("The activity ID"),
    },
    async ({ activityId }) => {
      const client = getClient();
      const data = await client.get(`activity-service/activity/${activityId}`);
      return jsonResult(data);
    }
  );

  // ── get-activity-details ───────────────────────────────────────────

  server.tool(
    "get-activity-details",
    "Get time-series metrics for an activity (HR, cadence, elevation, pace over time)",
    {
      activityId: z.string().describe("The activity ID"),
      maxChartSize: z
        .number()
        .default(10000)
        .describe("Max data points to return"),
    },
    async ({ activityId, maxChartSize }) => {
      const client = getClient();
      const data = await client.get(
        `activity-service/activity/${activityId}/details`,
        { maxChartSize, maxPolylineSize: 0, maxHeatMapSize: 2000 }
      );
      return jsonResult(data);
    }
  );

  // ── get-activity-splits ────────────────────────────────────────────

  server.tool(
    "get-activity-splits",
    "Get lap/split data for an activity",
    {
      activityId: z.string().describe("The activity ID"),
    },
    async ({ activityId }) => {
      const client = getClient();
      const data = await client.get(
        `activity-service/activity/${activityId}/splits`
      );
      return jsonResult(data);
    }
  );

  // ── get-activity-hr-zones ──────────────────────────────────────────

  server.tool(
    "get-activity-hr-zones",
    "Get heart rate time-in-zone breakdown for an activity",
    {
      activityId: z.string().describe("The activity ID"),
    },
    async ({ activityId }) => {
      const client = getClient();
      const data = await client.get(
        `activity-service/activity/${activityId}/hrTimeInZones`
      );
      return jsonResult(data);
    }
  );

  // ── get-activity-polyline ──────────────────────────────────────────

  server.tool(
    "get-activity-polyline",
    "Get full-resolution GPS track/polyline for an activity",
    {
      activityId: z.string().describe("The activity ID"),
    },
    async ({ activityId }) => {
      const client = getClient();
      const data = await client.get(
        `activity-service/activity/${activityId}/polyline/full-resolution/`
      );
      return jsonResult(data);
    }
  );

  // ── get-activity-weather ───────────────────────────────────────────

  server.tool(
    "get-activity-weather",
    "Get weather conditions during an activity",
    {
      activityId: z.string().describe("The activity ID"),
    },
    async ({ activityId }) => {
      const client = getClient();
      const data = await client.get(
        `activity-service/activity/${activityId}/weather`
      );
      return jsonResult(data);
    }
  );

  // ── get-user-profile ───────────────────────────────────────────────

  server.tool(
    "get-user-profile",
    "Get your Garmin Connect user profile and settings",
    {},
    async () => {
      const client = getClient();
      const data = await client.get(
        "userprofile-service/userprofile/user-settings/"
      );
      return jsonResult(data);
    }
  );

  // ── download-fit ───────────────────────────────────────────────────

  server.tool(
    "download-fit",
    "Download the original FIT file for an activity. Returns the file path.",
    {
      activityId: z.string().describe("The activity ID"),
      outputDir: z
        .string()
        .default("./fit_files")
        .describe("Directory to save the FIT file"),
    },
    async ({ activityId, outputDir }) => {
      const client = getClient();
      const zipBytes = await client.getBytes(
        `download-service/files/activity/${activityId}`
      );

      mkdirSync(outputDir, { recursive: true });

      // The response is a zip containing the .fit file
      // Use a minimal zip extraction (ZIP local file header parsing)
      const fitFile = extractFitFromZip(zipBytes, activityId);

      if (fitFile) {
        const outPath = join(outputDir, fitFile.name);
        writeFileSync(outPath, fitFile.data);
        return textResult(
          `Downloaded FIT file: ${outPath} (${fitFile.data.length} bytes)`
        );
      }

      // Fallback: save the raw zip
      const zipPath = join(outputDir, `${activityId}.zip`);
      writeFileSync(zipPath, zipBytes);
      return textResult(
        `No .fit file found in archive. Saved raw zip: ${zipPath}`
      );
    }
  );

  // ══════════════════════════════════════════════════════════════════
  // Daily Health
  // ══════════════════════════════════════════════════════════════════

  server.tool(
    "get-daily-summary",
    "Get daily summary: steps, calories, distance, intensity minutes, floors, etc.",
    {
      date: z.string().optional().describe("YYYY-MM-DD, defaults to today"),
    },
    async ({ date }) => {
      const client = getClient();
      const d = date ?? todayDate();
      const displayName = await client.getDisplayName();
      const data = await client.get(
        `usersummary-service/usersummary/daily/${displayName}`,
        { calendarDate: d }
      );
      return jsonResult(data);
    }
  );

  server.tool(
    "get-daily-heart-rate",
    "Get heart rate data throughout the day (resting HR, HR timeline)",
    {
      date: z.string().optional().describe("YYYY-MM-DD, defaults to today"),
    },
    async ({ date }) => {
      const client = getClient();
      const d = date ?? todayDate();
      const data = await client.get(
        "wellness-service/wellness/dailyHeartRate",
        { date: d }
      );
      return jsonResult(data);
    }
  );

  server.tool(
    "get-daily-stress",
    "Get stress level data throughout the day",
    {
      date: z.string().optional().describe("YYYY-MM-DD, defaults to today"),
    },
    async ({ date }) => {
      const client = getClient();
      const d = date ?? todayDate();
      const data = await client.get(
        `wellness-service/wellness/dailyStress/${d}`
      );
      return jsonResult(data);
    }
  );

  server.tool(
    "get-daily-summary-chart",
    "Get daily wellness summary chart data (combined health metrics)",
    {
      date: z.string().optional().describe("YYYY-MM-DD, defaults to today"),
    },
    async ({ date }) => {
      const client = getClient();
      const d = date ?? todayDate();
      const data = await client.get(
        "wellness-service/wellness/dailySummaryChart/",
        { date: d }
      );
      return jsonResult(data);
    }
  );

  server.tool(
    "get-daily-intensity-minutes",
    "Get intensity minutes earned for a date",
    {
      date: z.string().optional().describe("YYYY-MM-DD, defaults to today"),
    },
    async ({ date }) => {
      const client = getClient();
      const d = date ?? todayDate();
      const data = await client.get(`wellness-service/wellness/daily/im/${d}`);
      return jsonResult(data);
    }
  );

  server.tool(
    "get-daily-movement",
    "Get daily movement/activity data",
    {
      date: z.string().optional().describe("YYYY-MM-DD, defaults to today"),
    },
    async ({ date }) => {
      const client = getClient();
      const d = date ?? todayDate();
      const data = await client.get("wellness-service/wellness/dailyMovement", {
        calendarDate: d,
      });
      return jsonResult(data);
    }
  );

  server.tool(
    "get-daily-respiration",
    "Get respiration rate data for a date",
    {
      date: z.string().optional().describe("YYYY-MM-DD, defaults to today"),
    },
    async ({ date }) => {
      const client = getClient();
      const d = date ?? todayDate();
      const data = await client.get(
        `wellness-service/wellness/daily/respiration/${d}`
      );
      return jsonResult(data);
    }
  );

  // ══════════════════════════════════════════════════════════════════
  // Sleep, Body Battery, HRV
  // ══════════════════════════════════════════════════════════════════

  server.tool(
    "get-sleep",
    "Get sleep data: score, duration, stages, SpO2, HRV during sleep",
    {
      date: z.string().optional().describe("YYYY-MM-DD, defaults to today"),
    },
    async ({ date }) => {
      const client = getClient();
      const d = date ?? todayDate();
      const data = await client.get("sleep-service/sleep/dailySleepData", {
        date: d,
        nonSleepBufferMinutes: 60,
      });
      return jsonResult(data);
    }
  );

  server.tool(
    "get-body-battery",
    "Get today's body battery charged/drained values",
    {},
    async () => {
      const client = getClient();
      const data = await client.get(
        "wellness-service/wellness/bodyBattery/messagingToday"
      );
      return jsonResult(data);
    }
  );

  server.tool(
    "get-hrv",
    "Get heart rate variability (HRV) data for a date",
    {
      date: z.string().optional().describe("YYYY-MM-DD, defaults to today"),
    },
    async ({ date }) => {
      const client = getClient();
      const d = date ?? todayDate();
      const data = await client.get(`hrv-service/hrv/${d}`);
      return jsonResult(data);
    }
  );

  // ══════════════════════════════════════════════════════════════════
  // Weight
  // ══════════════════════════════════════════════════════════════════

  server.tool(
    "get-weight",
    "Get weight measurements over a date range",
    {
      startDate: z.string().describe("Start date YYYY-MM-DD"),
      endDate: z.string().describe("End date YYYY-MM-DD"),
    },
    async ({ startDate, endDate }) => {
      const client = getClient();
      const data = await client.get(
        `weight-service/weight/range/${startDate}/${endDate}`,
        { includeAll: "true" }
      );
      return jsonResult(data);
    }
  );

  // ══════════════════════════════════════════════════════════════════
  // Personal Records
  // ══════════════════════════════════════════════════════════════════

  server.tool(
    "get-personal-records",
    "Get all personal records with history (fastest mile, longest run, etc.)",
    {},
    async () => {
      const client = getClient();
      const displayName = await client.getDisplayName();
      const data = await client.get(
        `personalrecord-service/personalrecord/prs/${displayName}`,
        { includeHistory: "true" }
      );
      return jsonResult(data);
    }
  );

  // ══════════════════════════════════════════════════════════════════
  // Fitness Stats / Reports
  // ══════════════════════════════════════════════════════════════════

  server.tool(
    "get-fitness-stats",
    "Get aggregated fitness stats by activity type over a date range",
    {
      startDate: z.string().describe("Start date YYYY-MM-DD"),
      endDate: z.string().describe("End date YYYY-MM-DD"),
      aggregation: z
        .string()
        .default("daily")
        .describe("Aggregation period: daily, weekly, monthly"),
      metric: z
        .string()
        .default("duration")
        .describe("Metric: duration, distance, calories"),
    },
    async ({ startDate, endDate, aggregation, metric }) => {
      const client = getClient();
      const data = await client.get("fitnessstats-service/activity", {
        aggregation,
        startDate,
        endDate,
        groupByActivityType: "true",
        standardizedUnits: "true",
        groupByParentActivityType: "false",
        userFirstDay: "sunday",
        metric,
      });
      return jsonResult(data);
    }
  );

  server.tool(
    "get-vo2max",
    "Get latest VO2 Max / fitness level estimate",
    {
      date: z.string().optional().describe("YYYY-MM-DD, defaults to today"),
    },
    async ({ date }) => {
      const client = getClient();
      const d = date ?? todayDate();
      const data = await client.get(
        `metrics-service/metrics/maxmet/latest/${d}`
      );
      return jsonResult(data);
    }
  );

  server.tool(
    "get-hr-zones-config",
    "Get your configured heart rate zone boundaries",
    {},
    async () => {
      const client = getClient();
      const data = await client.get("biometric-service/heartRateZones/");
      return jsonResult(data);
    }
  );

  // ══════════════════════════════════════════════════════════════════
  // Training & Recovery
  // ══════════════════════════════════════════════════════════════════

  server.tool(
    "get-training-readiness",
    "Get training readiness score for a date (based on sleep, recovery, training load)",
    {
      date: z.string().optional().describe("YYYY-MM-DD, defaults to today"),
    },
    async ({ date }) => {
      const client = getClient();
      const d = date ?? todayDate();
      const data = await client.get(
        `metrics-service/metrics/trainingreadiness/${d}`
      );
      return jsonResult(data);
    }
  );

  server.tool(
    "get-sleep-stats",
    "Get sleep statistics over a date range (averages, trends)",
    {
      startDate: z.string().describe("Start date YYYY-MM-DD"),
      endDate: z.string().describe("End date YYYY-MM-DD"),
    },
    async ({ startDate, endDate }) => {
      const client = getClient();
      const data = await client.get(
        `sleep-service/stats/sleep/daily/${startDate}/${endDate}`
      );
      return jsonResult(data);
    }
  );

  // ══════════════════════════════════════════════════════════════════
  // Calendar, Goals, Badges
  // ══════════════════════════════════════════════════════════════════

  server.tool(
    "get-calendar",
    "Get monthly calendar with activities, workouts, and events",
    {
      year: z.number().describe("Year (e.g. 2026)"),
      month: z.number().describe("Month number 0-11 (0=January, 11=December)"),
    },
    async ({ year, month }) => {
      const client = getClient();
      const data = await client.get(
        `calendar-service/year/${year}/month/${month}`
      );
      return jsonResult(data);
    }
  );

  server.tool(
    "get-goals",
    "Get fitness goals",
    {
      status: z
        .string()
        .default("active")
        .describe("Goal status: active, future, or past"),
    },
    async ({ status }) => {
      const client = getClient();
      const data = await client.get("goal-service/goal/goals", { status });
      return jsonResult(data);
    }
  );

  server.tool(
    "get-badges",
    "Get all earned badges/achievements",
    {},
    async () => {
      const client = getClient();
      const data = await client.get("badge-service/badge/earned");
      return jsonResult(data);
    }
  );

  server.tool(
    "get-badge-leaderboard",
    "Get badge leaderboard among your connections",
    {
      limit: z.number().default(25).describe("Max entries to return"),
    },
    async ({ limit }) => {
      const client = getClient();
      const data = await client.get("badge-service/badge/leaderboard", {
        limit,
      });
      return jsonResult(data);
    }
  );

  // ══════════════════════════════════════════════════════════════════
  // Hydration & Power Zones
  // ══════════════════════════════════════════════════════════════════

  server.tool(
    "get-hydration",
    "Get daily hydration/water intake data",
    {
      date: z.string().optional().describe("YYYY-MM-DD, defaults to today"),
    },
    async ({ date }) => {
      const client = getClient();
      const d = date ?? todayDate();
      const data = await client.get(
        `usersummary-service/usersummary/hydration/allData/${d}`
      );
      return jsonResult(data);
    }
  );

  server.tool(
    "get-power-zones",
    "Get power zone configuration for all sports",
    {},
    async () => {
      const client = getClient();
      const data = await client.get("biometric-service/powerZones/sports/all");
      return jsonResult(data);
    }
  );

  // ══════════════════════════════════════════════════════════════════
  // Workouts (read + write)
  // ══════════════════════════════════════════════════════════════════

  server.tool(
    "list-workouts",
    "List your saved workouts",
    {
      start: z.number().default(0).describe("Pagination offset"),
      limit: z.number().default(100).describe("Max workouts to return"),
    },
    async ({ start, limit }) => {
      const client = getClient();
      const data = await client.get("workout-service/workouts", {
        start,
        limit,
      });
      return jsonResult(data);
    }
  );

  server.tool(
    "get-workout",
    "Get a single workout by ID with full step/segment details",
    {
      workoutId: z.string().describe("The workout ID"),
    },
    async ({ workoutId }) => {
      const client = getClient();
      const data = await client.get(`workout-service/workout/${workoutId}`);
      return jsonResult(data);
    }
  );

  server.tool(
    "download-workout-fit",
    "Download a workout as a FIT file",
    {
      workoutId: z.string().describe("The workout ID"),
      outputDir: z
        .string()
        .default("./fit_files")
        .describe("Directory to save the FIT file"),
    },
    async ({ workoutId, outputDir }) => {
      const client = getClient();
      const fitBytes = await client.getBytes(
        `workout-service/workout/FIT/${workoutId}`
      );
      mkdirSync(outputDir, { recursive: true });
      const outPath = join(outputDir, `workout_${workoutId}.fit`);
      writeFileSync(outPath, fitBytes);
      return textResult(
        `Downloaded workout FIT: ${outPath} (${fitBytes.length} bytes)`
      );
    }
  );

  server.tool(
    "create-workout",
    `Upload a workout from JSON data.

Creates a new workout in Garmin Connect from structured workout data.

IMPORTANT: Step types must use Garmin's DTO format:
- Use "ExecutableStepDTO" for regular steps (warmup, interval, cooldown, recovery)
- Use "RepeatGroupDTO" for repeat/interval groups with numberOfIterations

IMPORTANT: For heart rate zone targets, use "zoneNumber" (1-5), NOT targetValueOne/targetValueTwo.
targetValueOne/targetValueTwo are only for absolute value ranges (e.g. pace in m/s, power in watts).

Sport type IDs: 1=running, 2=cycling, 3=swimming, 4=walking, 5=strength_training, 6=fitness_equipment, 7=hiking.
Step type IDs: warmup (1), cooldown (2), interval (3), recovery (4), rest (5).
End condition IDs: time (2, value in seconds), distance (3, value in meters), lap.button (7, no value), reps (10, value = rep count — use for strength exercises).
Target type IDs: no.target (1), speed (2, m/s range via targetValueOne/targetValueTwo), heart.rate.zone (4, use zoneNumber 1-5), power.zone (11, use zoneNumber).

**Available Templates:**
Instead of building workout JSON from scratch, use these MCP resources as starting points:
- workout://templates/simple-run - Basic warmup/run/cooldown structure
- workout://templates/interval-running - Interval training with repeat groups
- workout://templates/tempo-run - Tempo run with heart rate zone targets
- workout://templates/strength-circuit - Strength training circuit structure
- workout://reference/structure - Complete JSON structure reference with all fields

Access these resources using your MCP client's resource reading capability, modify the template
as needed, and pass the resulting JSON as the workout parameter.

Example workout structure with HR zone target:
{
  "workoutName": "My Workout",
  "sportType": {"sportTypeId": 1, "sportTypeKey": "running"},
  "workoutSegments": [{
    "segmentOrder": 1,
    "sportType": {"sportTypeId": 1, "sportTypeKey": "running"},
    "workoutSteps": [{
      "type": "ExecutableStepDTO",
      "stepOrder": 1,
      "stepType": {"stepTypeId": 3, "stepTypeKey": "interval"},
      "endCondition": {"conditionTypeId": 2, "conditionTypeKey": "time"},
      "endConditionValue": 1200.0,
      "targetType": {"workoutTargetTypeId": 4, "workoutTargetTypeKey": "heart.rate.zone"},
      "zoneNumber": 3
    }]
  }]
}

Example with RepeatGroupDTO for intervals:
{
  "workoutName": "Interval Run",
  "sportType": {"sportTypeId": 1, "sportTypeKey": "running"},
  "workoutSegments": [{
    "segmentOrder": 1,
    "sportType": {"sportTypeId": 1, "sportTypeKey": "running"},
    "workoutSteps": [
      {
        "type": "ExecutableStepDTO",
        "stepOrder": 1,
        "stepType": {"stepTypeId": 1, "stepTypeKey": "warmup"},
        "endCondition": {"conditionTypeId": 2, "conditionTypeKey": "time"},
        "endConditionValue": 600.0,
        "targetType": {"workoutTargetTypeId": 1, "workoutTargetTypeKey": "no.target"}
      },
      {
        "type": "RepeatGroupDTO",
        "stepOrder": 2,
        "numberOfIterations": 6,
        "workoutSteps": [
          {
            "type": "ExecutableStepDTO",
            "stepOrder": 1,
            "stepType": {"stepTypeId": 3, "stepTypeKey": "interval"},
            "endCondition": {"conditionTypeId": 2, "conditionTypeKey": "time"},
            "endConditionValue": 60.0,
            "targetType": {"workoutTargetTypeId": 4, "workoutTargetTypeKey": "heart.rate.zone"},
            "zoneNumber": 5
          },
          {
            "type": "ExecutableStepDTO",
            "stepOrder": 2,
            "stepType": {"stepTypeId": 4, "stepTypeKey": "recovery"},
            "endCondition": {"conditionTypeId": 2, "conditionTypeKey": "time"},
            "endConditionValue": 90.0,
            "targetType": {"workoutTargetTypeId": 4, "workoutTargetTypeKey": "heart.rate.zone"},
            "zoneNumber": 2
          }
        ]
      },
      {
        "type": "ExecutableStepDTO",
        "stepOrder": 3,
        "stepType": {"stepTypeId": 2, "stepTypeKey": "cooldown"},
        "endCondition": {"conditionTypeId": 2, "conditionTypeKey": "time"},
        "endConditionValue": 600.0,
        "targetType": {"workoutTargetTypeId": 1, "workoutTargetTypeKey": "no.target"}
      }
    ]
  }]
}`,
    {
      workout: z
        .string()
        .describe("JSON string of the workout object to create"),
    },
    async ({ workout }) => {
      const client = getClient();
      const workoutObj = JSON.parse(workout);
      const data = await client.post("workout-service/workout", workoutObj);
      return jsonResult(data);
    }
  );

  server.tool(
    "schedule-workout",
    "Schedule an existing workout to a date on your calendar. The workout will sync to your device.",
    {
      workoutId: z.string().describe("The workout ID"),
      date: z.string().describe("Date to schedule YYYY-MM-DD"),
    },
    async ({ workoutId, date }) => {
      const client = getClient();
      const data = await client.post(`workout-service/schedule/${workoutId}`, {
        date,
      });
      return jsonResult(data);
    }
  );

  server.tool(
    "delete-workout",
    "Delete a workout from Garmin Connect",
    {
      workoutId: z.string().describe("The workout ID to delete"),
    },
    async ({ workoutId }) => {
      const client = getClient();
      await client.delete(`workout-service/workout/${workoutId}`);
      return textResult(`Workout ${workoutId} deleted`);
    }
  );

  // ══════════════════════════════════════════════════════════════════
  // Testing
  // ══════════════════════════════════════════════════════════════════

  server.tool(
    "run-tests",
    "Returns a test plan for verifying all garmin-connect-mcp tools work. Call each tool listed and report results.",
    {},
    async () => {
      return textResult(`# garmin-connect-mcp Test Plan

Execute each tool below and verify it returns valid data (not an error).
Report results as a table: tool name, status (PASS/FAIL), notes.

## Prerequisites
1. Call check-session first. If it fails, call garmin-login to authenticate.

## Tests (run in order)

### Session
- check-session -> should return { status: "ok", profile: { ... } }

### Activities
- list-activities (limit: 3) -> should return array of 3 activities
- get-activity (use activityId from above) -> should return activity object with summaryDTO
- get-activity-details (same ID) -> should return metricDescriptors + metrics
- get-activity-splits (same ID) -> should return lapDTOs array
- get-activity-hr-zones (same ID) -> should return array of 5 zones with secsInZone
- get-activity-polyline (same ID) -> should return polyline data (may fail for indoor activities)
- get-activity-weather (same ID) -> should return weather data (may fail for indoor activities)

### Daily Health (use today's date or omit for default)
- get-daily-summary -> should return steps, calories, distance fields
- get-daily-heart-rate -> should return heartRateValues array
- get-daily-stress -> should return stressValuesArray
- get-daily-summary-chart -> should return chart data object
- get-daily-intensity-minutes -> should return intensity minutes data
- get-daily-movement -> should return movement data
- get-daily-respiration -> should return respiration data

### Sleep / Body Battery / HRV
- get-sleep -> should return sleep score, duration, sleep stages
- get-body-battery -> should return charged/drained values
- get-hrv -> should return HRV data (may return { noData: true } if no overnight data yet)

### Weight / Records / Fitness
- get-weight (startDate: 30 days ago, endDate: today) -> should return weight data (may be empty array)
- get-personal-records -> should return personal records with history
- get-fitness-stats (startDate: 30 days ago, endDate: today) -> should return activity stats by type
- get-vo2max -> should return VO2 max estimate
- get-hr-zones-config -> should return HR zone boundaries
- get-user-profile -> should return user settings with userData

### Download
- download-fit (use activityId from list, outputDir: /tmp/garmin-test) -> should save .fit file and return path

## Expected Acceptable Failures
- get-activity-polyline / get-activity-weather may fail for indoor activities (no GPS/weather data)
- get-hrv may return { noData: true } for today if overnight data hasn't synced yet
- get-weight may return empty array if no weight entries recorded

## Report
Present results as a markdown table: | Tool | Status | Notes |
Count total passed vs failed at the end.`);
    }
  );
}

/**
 * Minimal zip extraction — finds the first .fit file using the central
 * directory (which always has correct sizes, unlike local headers that
 * may use data descriptors with size=0).
 */
function extractFitFromZip(
  buf: Buffer,
  activityId: string
): { name: string; data: Buffer } | null {
  // Find End of Central Directory (EOCD): PK\x05\x06
  let eocdOffset = buf.length - 22;
  while (eocdOffset >= 0) {
    if (
      buf[eocdOffset] === 0x50 &&
      buf[eocdOffset + 1] === 0x4b &&
      buf[eocdOffset + 2] === 0x05 &&
      buf[eocdOffset + 3] === 0x06
    )
      break;
    eocdOffset--;
  }
  if (eocdOffset < 0) return null;

  const cdOffset = buf.readUInt32LE(eocdOffset + 16);
  const cdEntries = buf.readUInt16LE(eocdOffset + 10);

  // Walk central directory entries: PK\x01\x02
  let pos = cdOffset;
  for (let i = 0; i < cdEntries; i++) {
    if (
      buf[pos] !== 0x50 ||
      buf[pos + 1] !== 0x4b ||
      buf[pos + 2] !== 0x01 ||
      buf[pos + 3] !== 0x02
    )
      break;

    const method = buf.readUInt16LE(pos + 10);
    const compressedSize = buf.readUInt32LE(pos + 20);
    const uncompressedSize = buf.readUInt32LE(pos + 24);
    const nameLength = buf.readUInt16LE(pos + 28);
    const extraLength = buf.readUInt16LE(pos + 30);
    const commentLength = buf.readUInt16LE(pos + 32);
    const localHeaderOffset = buf.readUInt32LE(pos + 42);
    const name = buf.toString("utf-8", pos + 46, pos + 46 + nameLength);

    if (name.endsWith(".fit")) {
      // Read local header to find data start
      const localNameLen = buf.readUInt16LE(localHeaderOffset + 26);
      const localExtraLen = buf.readUInt16LE(localHeaderOffset + 28);
      const dataStart = localHeaderOffset + 30 + localNameLen + localExtraLen;

      if (method === 0) {
        const data = buf.subarray(dataStart, dataStart + uncompressedSize);
        return { name: `${activityId}.fit`, data: Buffer.from(data) };
      }
      if (method === 8) {
        const compressed = buf.subarray(dataStart, dataStart + compressedSize);
        const data = inflateRawSync(compressed);
        return { name: `${activityId}.fit`, data };
      }
    }

    pos += 46 + nameLength + extraLength + commentLength;
  }
  return null;
}
