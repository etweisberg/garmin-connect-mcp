import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import {
  getSharedClient,
  sessionExists,
  getSessionFile,
} from "./garmin-client.js";

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
 * Minimal zip extraction — finds and extracts the first .fit file from a zip buffer.
 * Avoids needing a zip library dependency.
 */
function extractFitFromZip(
  buf: Buffer,
  activityId: string
): { name: string; data: Buffer } | null {
  // ZIP local file header signature: PK\x03\x04
  let offset = 0;
  while (offset < buf.length - 30) {
    if (
      buf[offset] === 0x50 &&
      buf[offset + 1] === 0x4b &&
      buf[offset + 2] === 0x03 &&
      buf[offset + 3] === 0x04
    ) {
      const compressionMethod = buf.readUInt16LE(offset + 8);
      const compressedSize = buf.readUInt32LE(offset + 18);
      const uncompressedSize = buf.readUInt32LE(offset + 22);
      const nameLength = buf.readUInt16LE(offset + 26);
      const extraLength = buf.readUInt16LE(offset + 28);
      const name = buf.toString("utf-8", offset + 30, offset + 30 + nameLength);
      const dataStart = offset + 30 + nameLength + extraLength;

      if (name.endsWith(".fit") && compressionMethod === 0) {
        // Stored (no compression) — just slice the data
        const data = buf.subarray(dataStart, dataStart + uncompressedSize);
        return { name: `${activityId}.fit`, data: Buffer.from(data) };
      }

      if (name.endsWith(".fit") && compressionMethod === 8) {
        // Deflate compressed — use Node's zlib
        const { inflateRawSync } = await_import_zlib();
        const compressed = buf.subarray(dataStart, dataStart + compressedSize);
        const data = inflateRawSync(compressed);
        return { name: `${activityId}.fit`, data };
      }

      // Skip to next file header
      offset = dataStart + compressedSize;
    } else {
      offset++;
    }
  }
  return null;
}

function await_import_zlib() {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require("node:zlib") as typeof import("node:zlib");
}
