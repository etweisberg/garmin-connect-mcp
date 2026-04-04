/**
 * Integration test suite for garmin-connect-mcp.
 * Tests the actual MCP tool handlers (not just raw API endpoints)
 * to catch bugs in zip extraction, file I/O, date defaults, etc.
 *
 * Requires a valid session at ~/.garmin-connect-mcp/session.json.
 * Run: npm test
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerTools, registerResources } from "./tools.js";
import { existsSync, rmSync } from "node:fs";
import { getSharedClient } from "./garmin-client.js";

const TEST_FIT_DIR = "/tmp/garmin-mcp-test-fit";

interface ToolResult {
  content: { type: string; text: string }[];
  isError?: boolean;
}

interface ResourceResult {
  contents: { uri: string; mimeType: string; text: string }[];
}

async function callTool(
  server: McpServer,
  name: string,
  args: Record<string, unknown> = {}
): Promise<ToolResult> {
  // Access internal tool handler via the server's registered tools
  const result = (await (server as any)._registeredTools[name].handler(
    { ...args },
    { signal: new AbortController().signal }
  )) as ToolResult;
  return result;
}

async function callResource(
  server: McpServer,
  uri: string
): Promise<ResourceResult> {
  const resource = (server as any)._registeredResources[uri];
  if (!resource) throw new Error(`Resource not registered: ${uri}`);
  const result = (await resource.readCallback(new URL(uri), {
    signal: new AbortController().signal,
  })) as ResourceResult;
  return result;
}

function getToolText(result: ToolResult): string {
  return result.content[0]?.text ?? "";
}

function getToolJson(result: ToolResult): unknown {
  return JSON.parse(getToolText(result));
}

interface TestCase {
  name: string;
  run: (server: McpServer) => Promise<void>;
}

// ── Resource tests (no session required) ──────────────────────────────
const resourceTests: TestCase[] = [
  {
    name: "resource: workout://templates/simple-run",
    run: async (server) => {
      const uri = "workout://templates/simple-run";
      const result = await callResource(server, uri);
      if (!result.contents || result.contents.length === 0)
        throw new Error("no contents");
      const content = result.contents[0];
      if (content.uri !== uri) throw new Error(`wrong uri: ${content.uri}`);
      if (content.mimeType !== "application/json")
        throw new Error(`wrong mimeType: ${content.mimeType}`);
      const data = JSON.parse(content.text) as {
        workoutName: string;
        sportType: { sportTypeKey: string };
        workoutSegments: unknown[];
      };
      if (!data.workoutName) throw new Error("no workoutName");
      if (!data.sportType?.sportTypeKey) throw new Error("no sportTypeKey");
      if (
        !Array.isArray(data.workoutSegments) ||
        data.workoutSegments.length === 0
      )
        throw new Error("no workoutSegments");
    },
  },
  {
    name: "resource: workout://templates/interval-running",
    run: async (server) => {
      const uri = "workout://templates/interval-running";
      const result = await callResource(server, uri);
      const content = result.contents[0];
      if (content.mimeType !== "application/json")
        throw new Error(`wrong mimeType: ${content.mimeType}`);
      const data = JSON.parse(content.text) as {
        workoutName: string;
        workoutSegments: { workoutSteps: unknown[] }[];
      };
      if (data.workoutName !== "Interval Running")
        throw new Error(`unexpected workoutName: ${data.workoutName}`);
      // Interval running must have a RepeatGroupDTO
      const steps = data.workoutSegments[0]?.workoutSteps ?? [];
      const hasRepeatGroup = (steps as { type: string }[]).some(
        (s) => s.type === "RepeatGroupDTO"
      );
      if (!hasRepeatGroup) throw new Error("missing RepeatGroupDTO");
    },
  },
  {
    name: "resource: workout://templates/tempo-run",
    run: async (server) => {
      const uri = "workout://templates/tempo-run";
      const result = await callResource(server, uri);
      const content = result.contents[0];
      const data = JSON.parse(content.text) as {
        workoutName: string;
        sportType: { sportTypeKey: string };
        workoutSegments: { workoutSteps: unknown[] }[];
      };
      if (data.workoutName !== "Tempo Run")
        throw new Error(`unexpected workoutName: ${data.workoutName}`);
      if (data.sportType.sportTypeKey !== "running")
        throw new Error("expected running sport type");
      const steps = data.workoutSegments[0]?.workoutSteps ?? [];
      if ((steps as unknown[]).length < 3)
        throw new Error("expected at least warmup/interval/cooldown steps");
    },
  },
  {
    name: "resource: workout://templates/strength-circuit",
    run: async (server) => {
      const uri = "workout://templates/strength-circuit";
      const result = await callResource(server, uri);
      const content = result.contents[0];
      const data = JSON.parse(content.text) as {
        workoutName: string;
        sportType: { sportTypeKey: string };
        workoutSegments: { workoutSteps: unknown[] }[];
      };
      if (data.workoutName !== "Strength Circuit")
        throw new Error(`unexpected workoutName: ${data.workoutName}`);
      if (data.sportType.sportTypeKey !== "strength_training")
        throw new Error("expected strength_training sport type");
      // Must have a RepeatGroupDTO
      const steps = data.workoutSegments[0]?.workoutSteps ?? [];
      const hasRepeatGroup = (steps as { type: string }[]).some(
        (s) => s.type === "RepeatGroupDTO"
      );
      if (!hasRepeatGroup) throw new Error("missing RepeatGroupDTO");
    },
  },
  {
    name: "resource: workout://reference/structure",
    run: async (server) => {
      const uri = "workout://reference/structure";
      const result = await callResource(server, uri);
      if (!result.contents || result.contents.length === 0)
        throw new Error("no contents");
      const content = result.contents[0];
      if (content.uri !== uri) throw new Error(`wrong uri: ${content.uri}`);
      if (content.mimeType !== "text/markdown")
        throw new Error(`wrong mimeType: ${content.mimeType}`);
      if (!content.text.includes("Workout"))
        throw new Error("reference text missing expected content");
    },
  },
];

const tests: TestCase[] = [
  // ── Session ────────────────────────────────────────────────────────
  {
    name: "check-session",
    run: async (server) => {
      const result = await callTool(server, "check-session");
      if (result.isError) throw new Error(getToolText(result));
      const data = getToolJson(result) as { status: string };
      if (data.status !== "ok") throw new Error("status not ok");
    },
  },
  {
    name: "get-user-profile",
    run: async (server) => {
      const result = await callTool(server, "get-user-profile");
      if (result.isError) throw new Error(getToolText(result));
      const data = getToolJson(result) as { id: number };
      if (!data.id) throw new Error("no user id");
    },
  },

  // ── Activities ─────────────────────────────────────────────────────
  {
    name: "list-activities",
    run: async (server) => {
      const result = await callTool(server, "list-activities", {
        limit: 2,
        start: 0,
      });
      if (result.isError) throw new Error(getToolText(result));
      const data = getToolJson(result) as unknown[];
      if (!Array.isArray(data) || data.length === 0)
        throw new Error("no activities");
    },
  },
  {
    name: "get-activity",
    run: async (server) => {
      const result = await callTool(server, "get-activity", {
        activityId: activityId,
      });
      if (result.isError) throw new Error(getToolText(result));
      const data = getToolJson(result) as { summaryDTO?: unknown };
      if (!data.summaryDTO) throw new Error("no summaryDTO");
    },
  },
  {
    name: "get-activity-details",
    run: async (server) => {
      const result = await callTool(server, "get-activity-details", {
        activityId: activityId,
        maxChartSize: 10000,
      });
      if (result.isError) throw new Error(getToolText(result));
      const data = getToolJson(result) as { metricDescriptors?: unknown[] };
      if (!data.metricDescriptors) throw new Error("no metricDescriptors");
    },
  },
  {
    name: "get-activity-splits",
    run: async (server) => {
      const result = await callTool(server, "get-activity-splits", {
        activityId: activityId,
      });
      if (result.isError) throw new Error(getToolText(result));
      const data = getToolJson(result) as { lapDTOs?: unknown[] };
      if (!data.lapDTOs) throw new Error("no lapDTOs");
    },
  },
  {
    name: "get-activity-hr-zones",
    run: async (server) => {
      const result = await callTool(server, "get-activity-hr-zones", {
        activityId: activityId,
      });
      if (result.isError) throw new Error(getToolText(result));
      const data = getToolJson(result) as unknown[];
      if (!Array.isArray(data) || data.length !== 5)
        throw new Error(`expected 5 zones, got ${data.length}`);
    },
  },
  {
    name: "get-activity-polyline",
    run: async (server) => {
      const result = await callTool(server, "get-activity-polyline", {
        activityId: activityId,
      });
      if (result.isError) throw new Error(getToolText(result));
    },
  },
  {
    name: "get-activity-weather",
    run: async (server) => {
      const result = await callTool(server, "get-activity-weather", {
        activityId: activityId,
      });
      if (result.isError) throw new Error(getToolText(result));
    },
  },
  {
    name: "download-fit (zip extraction + file write)",
    run: async (server) => {
      // Clean up from previous runs
      if (existsSync(TEST_FIT_DIR)) rmSync(TEST_FIT_DIR, { recursive: true });
      const result = await callTool(server, "download-fit", {
        activityId: activityId,
        outputDir: TEST_FIT_DIR,
      });
      if (result.isError) throw new Error(getToolText(result));
      const text = getToolText(result);
      if (!text.includes("Downloaded FIT file"))
        throw new Error(`unexpected response: ${text}`);
      // Verify file actually exists on disk
      const expectedPath = `${TEST_FIT_DIR}/${activityId}.fit`;
      if (!existsSync(expectedPath))
        throw new Error(`FIT file not found at ${expectedPath}`);
    },
  },

  // ── Daily Health (test date defaults) ──────────────────────────────
  {
    name: "get-daily-summary (default date)",
    run: async (server) => {
      const result = await callTool(server, "get-daily-summary");
      if (result.isError) throw new Error(getToolText(result));
      const data = getToolJson(result) as { calendarDate?: string };
      if (!data.calendarDate) throw new Error("no calendarDate");
    },
  },
  {
    name: "get-daily-heart-rate",
    run: async (server) => {
      const result = await callTool(server, "get-daily-heart-rate");
      if (result.isError) throw new Error(getToolText(result));
    },
  },
  {
    name: "get-daily-stress",
    run: async (server) => {
      const result = await callTool(server, "get-daily-stress");
      if (result.isError) throw new Error(getToolText(result));
    },
  },
  {
    name: "get-daily-summary-chart",
    run: async (server) => {
      const result = await callTool(server, "get-daily-summary-chart");
      if (result.isError) throw new Error(getToolText(result));
    },
  },
  {
    name: "get-daily-intensity-minutes",
    run: async (server) => {
      const result = await callTool(server, "get-daily-intensity-minutes");
      if (result.isError) throw new Error(getToolText(result));
    },
  },
  {
    name: "get-daily-movement",
    run: async (server) => {
      const result = await callTool(server, "get-daily-movement");
      if (result.isError) throw new Error(getToolText(result));
    },
  },
  {
    name: "get-daily-respiration",
    run: async (server) => {
      const result = await callTool(server, "get-daily-respiration");
      if (result.isError) throw new Error(getToolText(result));
    },
  },

  // ── Sleep / Body Battery / HRV ─────────────────────────────────────
  {
    name: "get-sleep",
    run: async (server) => {
      const result = await callTool(server, "get-sleep");
      if (result.isError) throw new Error(getToolText(result));
    },
  },
  {
    name: "get-body-battery",
    run: async (server) => {
      const result = await callTool(server, "get-body-battery");
      if (result.isError) throw new Error(getToolText(result));
    },
  },
  {
    name: "get-hrv",
    run: async (server) => {
      const result = await callTool(server, "get-hrv");
      if (result.isError) throw new Error(getToolText(result));
      // noData is acceptable
    },
  },

  // ── Weight / Records / Fitness ─────────────────────────────────────
  {
    name: "get-weight",
    run: async (server) => {
      const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000)
        .toISOString()
        .slice(0, 10);
      const today = new Date().toISOString().slice(0, 10);
      const result = await callTool(server, "get-weight", {
        startDate: thirtyDaysAgo,
        endDate: today,
      });
      if (result.isError) throw new Error(getToolText(result));
    },
  },
  {
    name: "get-personal-records (displayName resolution)",
    run: async (server) => {
      const result = await callTool(server, "get-personal-records");
      if (result.isError) throw new Error(getToolText(result));
      const data = getToolJson(result) as unknown[];
      if (!Array.isArray(data)) throw new Error("expected array");
    },
  },
  {
    name: "get-fitness-stats",
    run: async (server) => {
      const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000)
        .toISOString()
        .slice(0, 10);
      const today = new Date().toISOString().slice(0, 10);
      const result = await callTool(server, "get-fitness-stats", {
        startDate: thirtyDaysAgo,
        endDate: today,
        aggregation: "daily",
        metric: "duration",
      });
      if (result.isError) throw new Error(getToolText(result));
    },
  },
  {
    name: "get-vo2max",
    run: async (server) => {
      const result = await callTool(server, "get-vo2max");
      if (result.isError) throw new Error(getToolText(result));
    },
  },
  {
    name: "get-hr-zones-config",
    run: async (server) => {
      const result = await callTool(server, "get-hr-zones-config");
      if (result.isError) throw new Error(getToolText(result));
      const data = getToolJson(result) as unknown[];
      if (!Array.isArray(data) || data.length === 0)
        throw new Error("no zones returned");
    },
  },
  // ── Training & Recovery ─────────────────────────────────────────
  {
    name: "get-training-readiness",
    run: async (server) => {
      const result = await callTool(server, "get-training-readiness");
      if (result.isError) throw new Error(getToolText(result));
    },
  },
  {
    name: "get-sleep-stats",
    run: async (server) => {
      const sevenDaysAgo = new Date(Date.now() - 7 * 86400000)
        .toISOString()
        .slice(0, 10);
      const today = new Date().toISOString().slice(0, 10);
      const result = await callTool(server, "get-sleep-stats", {
        startDate: sevenDaysAgo,
        endDate: today,
      });
      if (result.isError) throw new Error(getToolText(result));
    },
  },

  // ── Calendar, Goals, Badges ────────────────────────────────────────
  {
    name: "get-calendar",
    run: async (server) => {
      const result = await callTool(server, "get-calendar", {
        year: 2026,
        month: 2,
      });
      if (result.isError) throw new Error(getToolText(result));
    },
  },
  {
    name: "get-goals",
    run: async (server) => {
      const result = await callTool(server, "get-goals", { status: "active" });
      if (result.isError) throw new Error(getToolText(result));
    },
  },
  {
    name: "get-badges",
    run: async (server) => {
      const result = await callTool(server, "get-badges");
      if (result.isError) throw new Error(getToolText(result));
    },
  },
  {
    name: "get-badge-leaderboard",
    run: async (server) => {
      const result = await callTool(server, "get-badge-leaderboard", {
        limit: 5,
      });
      if (result.isError) throw new Error(getToolText(result));
    },
  },

  // ── Hydration & Power Zones ────────────────────────────────────────
  {
    name: "get-hydration",
    run: async (server) => {
      const result = await callTool(server, "get-hydration");
      if (result.isError) throw new Error(getToolText(result));
    },
  },
  {
    name: "get-power-zones",
    run: async (server) => {
      const result = await callTool(server, "get-power-zones");
      if (result.isError) throw new Error(getToolText(result));
    },
  },

  // ── Workouts ───────────────────────────────────────────────────────
  {
    name: "list-workouts",
    run: async (server) => {
      const result = await callTool(server, "list-workouts", {
        start: 0,
        limit: 5,
      });
      if (result.isError) throw new Error(getToolText(result));
    },
  },
  {
    name: "workout CRUD (create -> schedule -> delete)",
    run: async (server) => {
      // Create
      const workout = {
        workoutName: "MCP Test Workout (safe to delete)",
        sportType: { sportTypeId: 1, sportTypeKey: "running" },
        workoutSegments: [
          {
            segmentOrder: 1,
            sportType: { sportTypeId: 1, sportTypeKey: "running" },
            workoutSteps: [
              {
                type: "ExecutableStepDTO",
                stepOrder: 1,
                stepType: { stepTypeId: 3, stepTypeKey: "interval" },
                endCondition: {
                  conditionTypeId: 2,
                  conditionTypeKey: "time",
                },
                endConditionValue: 600,
                targetType: {
                  workoutTargetTypeId: 1,
                  workoutTargetTypeKey: "no.target",
                },
              },
            ],
          },
        ],
      };
      const createResult = await callTool(server, "create-workout", {
        workout: JSON.stringify(workout),
      });
      if (createResult.isError) throw new Error(getToolText(createResult));
      const created = getToolJson(createResult) as { workoutId: number };
      if (!created.workoutId) throw new Error("no workoutId returned");

      const wid = String(created.workoutId);

      // Schedule to tomorrow
      const tomorrow = new Date(Date.now() + 86400000)
        .toISOString()
        .slice(0, 10);
      const schedResult = await callTool(server, "schedule-workout", {
        workoutId: wid,
        date: tomorrow,
      });
      if (schedResult.isError) throw new Error(getToolText(schedResult));

      // Delete (cleanup)
      const delResult = await callTool(server, "delete-workout", {
        workoutId: wid,
      });
      if (delResult.isError) throw new Error(getToolText(delResult));
    },
  },
];

// Resolved during bootstrap
let activityId = "";

async function main() {
  console.log("garmin-connect-mcp integration tests (tool-level)\n");

  // Set up a real MCP server with all tools and resources registered
  const server = new McpServer({
    name: "garmin-connect-mcp-test",
    version: "0.0.0",
  });
  registerTools(server);
  registerResources(server);

  // ── Run resource tests (no session required) ────────────────────────
  console.log("── Resources (no session required) ──\n");
  let passed = 0;
  let failed = 0;

  for (const test of resourceTests) {
    const start = Date.now();
    try {
      await test.run(server);
      const ms = Date.now() - start;
      console.log(`  PASS  ${test.name} (${ms}ms)`);
      passed++;
    } catch (e) {
      const ms = Date.now() - start;
      const msg = e instanceof Error ? e.message : String(e);
      const short = msg.length > 120 ? msg.slice(0, 120) + "..." : msg;
      console.log(`  FAIL  ${test.name} (${ms}ms) — ${short}`);
      failed++;
    }
  }

  // ── Bootstrap: get a recent activityId ─────────────────────────────
  console.log("\n── Integration tests (session required) ──\n");
  console.log("Bootstrapping...");
  const listResult = await callTool(server, "list-activities", {
    limit: 1,
    start: 0,
  });
  const activities = getToolJson(listResult) as { activityId: number }[];
  activityId = String(activities[0]?.activityId ?? "");
  if (!activityId) {
    console.error("FATAL: No activities found");
    process.exit(1);
  }
  console.log(`  activityId: ${activityId}\n`);

  for (const test of tests) {
    const start = Date.now();
    try {
      await test.run(server);
      const ms = Date.now() - start;
      console.log(`  PASS  ${test.name} (${ms}ms)`);
      passed++;
    } catch (e) {
      const ms = Date.now() - start;
      const msg = e instanceof Error ? e.message : String(e);
      const short = msg.length > 120 ? msg.slice(0, 120) + "..." : msg;
      console.log(`  FAIL  ${test.name} (${ms}ms) — ${short}`);
      failed++;
    }
  }

  // Cleanup
  if (existsSync(TEST_FIT_DIR)) rmSync(TEST_FIT_DIR, { recursive: true });

  console.log(
    `\nResults: ${passed} passed, ${failed} failed, ${passed + failed} total`
  );
  await getSharedClient().close();
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
