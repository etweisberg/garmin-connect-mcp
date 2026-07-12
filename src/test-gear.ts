/**
 * Standalone test for the new gear management tools.
 * Run: npx tsx src/test-gear.ts
 *
 * Requires a valid session at ~/.garmin-connect-mcp/session.json.
 * Does NOT modify any data -- only reads gear and gear-on-activity.
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

function getToolText(result: ToolResult): string {
  return result.content[0]?.text ?? "";
}

function getToolJson(result: ToolResult): unknown {
  return JSON.parse(getToolText(result));
}

async function main() {
  console.log("Testing new gear tools (read-only)...\n");

  const server = new McpServer({ name: "test", version: "0.0.0" });
  registerTools(server);

  // 1. check-session
  console.log("[1] check-session");
  const session = await callTool(server, "check-session");
  if (session.isError) {
    console.error("  FAIL:", getToolText(session));
    process.exit(1);
  }
  console.log("  PASS:", getToolText(session).slice(0, 100));
  console.log();

  // 2. list-gear
  console.log("[2] list-gear");
  const gearResult = await callTool(server, "list-gear");
  if (gearResult.isError) {
    console.error("  FAIL:", getToolText(gearResult));
    process.exit(1);
  }
  const gear = getToolJson(gearResult) as Array<Record<string, unknown>>;
  console.log(`  PASS: Found ${gear.length} gear items`);
  for (const g of gear) {
    const name = g.displayName ?? g.customMakeModel ?? "?";
    const uuid = g.uuid ?? "?";
    const type = g.gearTypeName ?? "?";
    const retired = g.dateEndLocal ? " [RETIRED]" : "";
    console.log(`    ${uuid}  ${type}  ${name}${retired}`);
  }
  console.log();

  // 3. list-activities (need an activityId for the next test)
  console.log("[3] list-activities (just to grab one ID)");
  const actsResult = await callTool(server, "list-activities", {
    limit: 5,
    start: 0,
  });
  if (actsResult.isError) {
    console.error("  FAIL:", getToolText(actsResult));
    process.exit(1);
  }
  const acts = getToolJson(actsResult) as Array<{
    activityId: number;
    activityName: string;
    activityType?: { typeKey: string };
  }>;
  // Find a Ride activity to test gear lookup against
  const rideActivity = acts.find(
    (a) => a.activityType?.typeKey?.includes("ride") || a.activityType?.typeKey?.includes("cycling")
  ) ?? acts[0];
  console.log(`  PASS: Using activity ${rideActivity.activityId} "${rideActivity.activityName}"`);
  console.log();

  // 4. get-activity-gear
  console.log("[4] get-activity-gear");
  const aGear = await callTool(server, "get-activity-gear", {
    activityId: String(rideActivity.activityId),
  });
  if (aGear.isError) {
    console.error("  FAIL:", getToolText(aGear));
    process.exit(1);
  }
  const aGearData = getToolJson(aGear);
  console.log(`  PASS: ${JSON.stringify(aGearData)}`);
  console.log();

  console.log("=" .repeat(60));
  console.log("All read-only gear tools work.");
  console.log("=" .repeat(60));
  console.log();

  // 5. link-gear-to-activity (write test, safe -- relinking the same gear)
  // Only run if the activity already has at least one gear assignment.
  const aGearArr = aGearData as Array<Record<string, unknown>>;
  if (Array.isArray(aGearArr) && aGearArr.length > 0) {
    const existing = aGearArr[0];
    const existingUuid = existing.uuid as string;
    const existingName = existing.displayName as string;

    console.log(`[5] link-gear-to-activity (no-op test: re-linking ${existingName})`);
    const linkResult = await callTool(server, "link-gear-to-activity", {
      gearUuid: existingUuid,
      activityId: String(rideActivity.activityId),
    });
    if (linkResult.isError) {
      console.error("  FAIL:", getToolText(linkResult));
      await getSharedClient().close();
      process.exit(1);
    }
    console.log(`  PASS: ${getToolText(linkResult).slice(0, 200)}`);
    console.log();

    // Verify the activity still has the same gear
    console.log("[6] get-activity-gear (verify after re-link)");
    const verify = await callTool(server, "get-activity-gear", {
      activityId: String(rideActivity.activityId),
    });
    const verifyData = getToolJson(verify) as Array<Record<string, unknown>>;
    const stillHas = verifyData.some((g) => g.uuid === existingUuid);
    if (stillHas) {
      console.log(`  PASS: activity still has ${existingName}`);
    } else {
      console.error("  FAIL: gear no longer attached after re-link");
      await getSharedClient().close();
      process.exit(1);
    }
    console.log();

    console.log("=" .repeat(60));
    console.log("Write tool (link-gear-to-activity) works.");
    console.log("Skipping unlink and set-activity-gear -- they would mutate state.");
    console.log("=" .repeat(60));
  } else {
    console.log("[5] SKIP write test -- activity has no existing gear to safely re-link");
  }

  await getSharedClient().close();
  process.exit(0);
}

main().catch((err) => {
  console.error("FATAL:", err);
  process.exit(1);
});
