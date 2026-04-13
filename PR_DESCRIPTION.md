# Add gear management tools, activity rename, standalone CLI

## Why

The existing tools cover read operations on activity-adjacent data (details, splits, FIT downloads) but the only writes were workout-related (`create-workout`, `schedule-workout`, `delete-workout`). This PR adds the missing gear management tools plus an activity rename tool, both motivated by the same concrete use case:

I built this for a personal **Strava → Garmin auto-bike-tagging tool** that uses physical-signal rules (power meter presence, cadence sensor, GPS geography) to determine which bike was used on a ride, then mirrors the gear assignment + activity name from Strava into Garmin Connect. The Strava API has both gear and name write support; Garmin Connect's underlying gear-service and activity-service endpoints exist but no MCP tool wrapped them. Hence this PR.

Other use cases this enables:
- Bulk-correcting historical activity gear after switching watches or device defaults
- "One bike per ride" automation
- Migrating gear assignments from another platform
- Renaming activities from auto-generated names ("Toronto Cycling") to meaningful titles

## What's added

### 6 new MCP tools

| Tool | Description |
|------|-------------|
| `list-gear` | List all gear (bikes, shoes, equipment) registered to the user. Returns each item's `uuid`, `displayName`, `gearTypeName`, retirement status, lifetime distance |
| `get-activity-gear` | List the gear currently linked to a specific activity (zero or more items) |
| `link-gear-to-activity` | Attach a gear item to an activity. Garmin's gear API is many-to-many |
| `unlink-gear-from-activity` | Detach a specific gear item from an activity |
| `set-activity-gear` | Convenience tool: clear all existing gear on an activity and attach a single specified item. Implements "one bike per ride" semantics |
| `set-activity-name` | Rename a Garmin activity (replace the auto-generated city-based name with something meaningful) |

### 1 standalone CLI (`src/gear-cli.ts`)

A subprocess-friendly CLI that wraps the gear tools without requiring an MCP client. Designed to be called from external scripts:

```bash
npx tsx src/gear-cli.ts list-gear
npx tsx src/gear-cli.ts get-activity-gear <activityId>
npx tsx src/gear-cli.ts set-activity-gear <activityId> <gearUuid>
npx tsx src/gear-cli.ts set-activity-gear-by-time <iso-start-time> <gearUuid> [name]
npx tsx src/gear-cli.ts rename-activity-by-time <iso-start-time> <new-name>
```

The two `*-by-time` variants are critical for the Strava→Garmin sync use case: Strava's `external_id` field on synced activities contains a `garmin_ping_<id>` notification ID, **not** the Garmin activity ID. So there's no direct ID-to-ID mapping. Instead, `*-by-time` queries Garmin for activities within a date range (`startDate`/`endDate` query params on the underlying `activitylist-service`) and matches by `startTimeGMT` within ±120 seconds. This is reliable because both Strava and Garmin source the timestamp from the same FIT file upload.

### Tests

`src/test-gear.ts` -- standalone live integration test that exercises `check-session`, `list-gear`, `list-activities`, `get-activity-gear`, and `link-gear-to-activity` end-to-end against a real Garmin account. The link test re-links an activity's existing gear (no-op semantics) so it doesn't mutate state.

## Implementation notes

**`GarminClient.put()`** -- new method that mirrors `post()`, with optional body. Garmin's gear link/unlink endpoints use PUT and don't take a body, so I made the body parameter optional. Also useful for the activity rename endpoint (which uses PUT with a body).

**`GarminClient.getUserProfilePk()`** -- new helper. The `filterGear` endpoint requires the numeric user profile ID, which is distinct from `displayName` (used elsewhere). Cached after first call.

**Routing through Playwright** -- all tools call the existing `client.get()` / `client.put()` methods, so they automatically inherit the headless-browser TLS fingerprint workaround. No new auth or session handling needed.

**Endpoints called:**

- `GET /gear-service/gear/filterGear?userProfilePk={pk}` -- list gear
- `GET /gear-service/gear/filterGear?activityId={activityId}` -- get gear on an activity (note: NOT `/gear/activity/{id}` -- that returns 405 NotAllowedException; Garmin uses the same `filterGear` endpoint for both list-by-user and list-by-activity, distinguished by query parameter)
- `PUT /gear-service/gear/link/{gearUuid}/activity/{activityId}` -- link gear
- `PUT /gear-service/gear/unlink/{gearUuid}/activity/{activityId}` -- unlink gear
- `PUT /activity-service/activity/{activityId}` (with body `{activityId, activityName}`) -- rename activity

These are the same endpoints used by the (deprecated) `python-garminconnect` library, so they have a track record of being stable.

## Testing -- live results

✅ **TypeScript builds clean** (`npm run build`)
✅ **ESLint clean** (`npm run lint`)
✅ **Live tested against a real Garmin account** (mine):

- `check-session` -- PASS
- `list-gear` -- PASS (returned 7 bikes with UUIDs and lifetime distances)
- `get-activity-gear` -- PASS (after fixing initial wrong endpoint path; see commit history)
- `link-gear-to-activity` -- PASS (idempotent re-link succeeds)
- `set-activity-gear` -- PASS via `set-activity-gear-by-time` in production use
- `set-activity-name` -- PASS in production use (renamed 198 activities, see below)

✅ **Production use:** I ran a full year of historical data through these tools against my real Garmin account on 2026-04-12:
- **198/198 activities** had their gear assignment correctly set via `set-activity-gear-by-time`
- **198/198 activities** were renamed from Garmin's auto-generated names ("Toronto Cycling", "Vancouver Cycling", "Markham Road Cycling", "Dysart, Dudley, Harcourt and Others Road Cycling") to meaningful titles ("FOUND THE AUTOBOT HAT!!!", "Tour de Wanless", "The Amazing and Mysterious East", "Loonie 4evah")
- **Zero errors, zero data loss, zero false-positive matches**
- The only operational note: Garmin sessions appear to expire after ~45-60 minutes of active use, so a long sequential job may need a session refresh mid-run. We hit this once in a 198-activity run and recovered cleanly by re-running after refreshing `~/.garmin-connect-mcp/session.json` via the Playwright login flow.

## Out of scope (deliberately)

- Gear creation / deletion / retirement -- not needed for the auto-tagging use case
- Gear stats / lifetime distance modifications -- can read via existing data, no need to write
- Gear defaults (which gear gets auto-attached to a given activity type) -- could be a follow-up PR if useful
- Activity type changes (separate Garmin endpoint) -- could be a follow-up PR

## Compatibility

- No breaking changes to existing tools
- No new runtime dependencies (uses existing Playwright client infrastructure)
- New `GarminClient.put()` and `GarminClient.getUserProfilePk()` methods are additive
- TypeScript strict mode passes
- All existing tests still pass

Happy to iterate on naming, descriptions, or behavior. Thanks for building this MCP server -- the headless-Playwright TLS-fingerprint workaround is the right answer for the post-March-2026 Garmin Connect landscape, and these gear management tools fill a meaningful gap.
