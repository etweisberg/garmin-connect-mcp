/**
 * Standalone CLI for gear operations.
 *
 * Usage:
 *   npx tsx src/gear-cli.ts list-gear
 *   npx tsx src/gear-cli.ts get-activity-gear <activityId>
 *   npx tsx src/gear-cli.ts set-activity-gear <activityId> <gearUuid>
 *
 * Outputs JSON to stdout. Exits 0 on success, 1 on error (with error JSON
 * on stderr). Designed to be called from external scripts (e.g. the
 * Python strava-tagger).
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerTools } from "./tools.js";
import { getSharedClient } from "./garmin-client.js";

interface ToolResult {
  content: { type: string; text: string }[];
  isError?: boolean;
}

async function callTool(
  server: McpServer,
  name: string,
  args: Record<string, unknown> = {}
): Promise<ToolResult> {
  const result = (await (server as any)._registeredTools[name].handler(
    { ...args },
    { signal: new AbortController().signal }
  )) as ToolResult;
  return result;
}

async function main() {
  const args = process.argv.slice(2);
  if (args.length === 0) {
    console.error("Usage: gear-cli <command> [args...]");
    console.error("Commands: list-gear, get-activity-gear, set-activity-gear");
    process.exit(1);
  }

  const server = new McpServer({ name: "gear-cli", version: "0.0.0" });
  registerTools(server);

  const cmd = args[0];
  let result: ToolResult;

  try {
    if (cmd === "list-gear") {
      result = await callTool(server, "list-gear");
    } else if (cmd === "get-activity-gear") {
      if (args.length < 2) {
        console.error("Usage: gear-cli get-activity-gear <activityId>");
        process.exit(1);
      }
      result = await callTool(server, "get-activity-gear", {
        activityId: args[1],
      });
    } else if (cmd === "set-activity-gear") {
      if (args.length < 3) {
        console.error("Usage: gear-cli set-activity-gear <activityId> <gearUuid>");
        process.exit(1);
      }
      result = await callTool(server, "set-activity-gear", {
        activityId: args[1],
        gearUuid: args[2],
      });
    } else if (cmd === "set-activity-gear-by-time" || cmd === "rename-activity-by-time") {
      // Find Garmin activity matching a given start time, then set its gear
      // and/or rename it.
      //
      // Usage:
      //   set-activity-gear-by-time <iso-start-time> <gearUuid> [name]
      //   rename-activity-by-time   <iso-start-time> <name>
      //
      // Matches if a Garmin activity's startTimeGMT is within +/-120s.
      const isRename = cmd === "rename-activity-by-time";
      if (isRename && args.length < 3) {
        console.error("Usage: gear-cli rename-activity-by-time <iso-start-time> <name>");
        process.exit(1);
      }
      if (!isRename && args.length < 3) {
        console.error(
          "Usage: gear-cli set-activity-gear-by-time <iso-start-time> <gearUuid> [name]"
        );
        process.exit(1);
      }
      const targetTime = new Date(args[1]);
      if (isNaN(targetTime.getTime())) {
        console.error(`Invalid ISO time: ${args[1]}`);
        process.exit(1);
      }
      // Argument layout differs between the two commands:
      //   set-activity-gear-by-time <time> <gearUuid> [name]
      //   rename-activity-by-time   <time> <name>
      const gearUuid = isRename ? null : args[2];
      const newName = isRename ? args[2] : (args.length >= 4 ? args[3] : null);

      // Query Garmin for activities within the day of the target time.
      // We bracket +/- 1 day to handle UTC vs local time edge cases at
      // midnight. The underlying activitylist-service supports startDate
      // and endDate as YYYY-MM-DD query params.
      const dayBefore = new Date(targetTime.getTime() - 86400_000);
      const dayAfter = new Date(targetTime.getTime() + 86400_000);
      const startDate = dayBefore.toISOString().slice(0, 10);
      const endDate = dayAfter.toISOString().slice(0, 10);

      // Use the underlying client.get() directly so we can pass startDate/endDate
      // (the list-activities tool doesn't expose those params yet).
      const client = (await import("./garmin-client.js")).getSharedClient();
      const activities = (await client.get(
        "activitylist-service/activities/search/activities",
        { limit: 100, start: 0, startDate, endDate }
      )) as Array<{
        activityId: number;
        activityName: string;
        startTimeGMT?: string;
        startTimeLocal?: string;
      }>;

      // Find best match within +/- 120 seconds
      let best: { id: number; deltaMs: number; name: string } | null = null;
      for (const a of activities) {
        const tStr = a.startTimeGMT ?? a.startTimeLocal;
        if (!tStr) continue;
        // Garmin returns "2026-04-12 19:30:00.0" which is ISO-ish but not strict.
        // Treat startTimeGMT as UTC, startTimeLocal as local without TZ.
        let parsed: Date;
        if (a.startTimeGMT) {
          parsed = new Date(a.startTimeGMT.replace(" ", "T") + "Z");
        } else {
          parsed = new Date(a.startTimeLocal!.replace(" ", "T"));
        }
        const delta = Math.abs(parsed.getTime() - targetTime.getTime());
        if (delta <= 120_000) {
          if (best === null || delta < best.deltaMs) {
            best = { id: a.activityId, deltaMs: delta, name: a.activityName };
          }
        }
      }

      if (!best) {
        console.error(
          `No Garmin activity found within +/-120s of ${targetTime.toISOString()}`
        );
        await getSharedClient().close();
        process.exit(2); // exit 2 = "no match" (distinct from other errors)
      }

      // Set gear (if requested) on the matched activity
      let gearSetResult: unknown = null;
      if (gearUuid) {
        const setResult = await callTool(server, "set-activity-gear", {
          activityId: String(best.id),
          gearUuid,
        });
        if (setResult.isError) {
          console.error(setResult.content[0]?.text);
          await getSharedClient().close();
          process.exit(1);
        }
        gearSetResult = JSON.parse(setResult.content[0]?.text ?? "null");
      }

      // Rename (if requested) on the matched activity
      let renameResult: unknown = null;
      if (newName && newName !== best.name) {
        const rResult = await callTool(server, "set-activity-name", {
          activityId: String(best.id),
          name: newName,
        });
        if (rResult.isError) {
          console.error(rResult.content[0]?.text);
          await getSharedClient().close();
          process.exit(1);
        }
        renameResult = JSON.parse(rResult.content[0]?.text ?? "null");
      } else if (newName && newName === best.name) {
        renameResult = { skipped: "name already matches" };
      }

      const wrapped = {
        matched: {
          garminActivityId: best.id,
          name: best.name,
          deltaSeconds: best.deltaMs / 1000,
        },
        gearSetResult,
        renameResult,
      };
      result = {
        content: [
          { type: "text", text: JSON.stringify(wrapped, null, 2) },
        ],
      };
    } else {
      console.error(`Unknown command: ${cmd}`);
      process.exit(1);
    }

    if (result.isError) {
      console.error(result.content[0]?.text ?? "unknown error");
      await getSharedClient().close();
      process.exit(1);
    }

    // Print JSON result to stdout
    process.stdout.write(result.content[0]?.text ?? "");
    process.stdout.write("\n");
    await getSharedClient().close();
    process.exit(0);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error(msg);
    try {
      await getSharedClient().close();
    } catch {}
    process.exit(1);
  }
}

main();
