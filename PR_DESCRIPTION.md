# Add gear management tools (5 new MCP tools)

## Why

The existing tools cover read operations on gear-adjacent data (activity details, splits, FIT downloads) but there's no way to manage gear assignments. This is a gap for use cases like:

- Auto-tagging which bike was used on a ride based on power meter / cadence sensor / GPS signals
- Migrating gear assignments from another platform (e.g. Strava) into Garmin Connect
- Bulk-correcting historical activity gear after switching watches or device defaults
- "One bike per ride" automation where you want to clear-and-replace existing gear

I built this for a personal Strava → Garmin auto-tagging tool. The Strava API has gear write support; Garmin Connect's underlying gear-service endpoints exist but no MCP tool wrapped them. Hence this PR.

## What's added

| Tool | Description |
|------|-------------|
| `list-gear` | List all gear (bikes, shoes, equipment) registered to the user. Returns each item's `uuid`, `displayName`, `gearTypeName`, retirement status, lifetime distance |
| `get-activity-gear` | List the gear currently linked to a specific activity (zero or more items) |
| `link-gear-to-activity` | Attach a gear item to an activity. Garmin's gear API is many-to-many |
| `unlink-gear-from-activity` | Detach a specific gear item from an activity |
| `set-activity-gear` | Convenience tool: clear all existing gear on an activity and attach a single specified item. Implements "one bike per ride" semantics |

## Implementation notes

**`GarminClient.put()`** -- new method that mirrors `post()`, with optional body. Garmin's gear link/unlink endpoints use PUT and don't take a body, so I made the body parameter optional. This may also be useful for other gear-service-style endpoints.

**`GarminClient.getUserProfilePk()`** -- new helper. The `filterGear` endpoint requires the numeric user profile ID, which is distinct from `displayName` (used elsewhere). This caches the value after the first call so we don't re-fetch.

**Routing through Playwright** -- all 5 tools call the existing `client.get()` / `client.put()` methods, which means they automatically inherit the headless-browser TLS fingerprint workaround. No new auth or session handling needed. Just works.

**Endpoints called:**

- `GET /gear-service/gear/filterGear?userProfilePk={pk}` -- list gear
- `GET /gear-service/gear/activity/{activityId}` -- get gear on an activity
- `PUT /gear-service/gear/link/{gearUuid}/activity/{activityId}` -- link gear
- `PUT /gear-service/gear/unlink/{gearUuid}/activity/{activityId}` -- unlink gear

These are the same endpoints used by the (now deprecated) `python-garminconnect` library, so they have a track record of being stable.

## Testing

- ✅ TypeScript builds clean (`npm run build`)
- ✅ ESLint clean (`npm run lint`)
- ⏳ Live API testing pending -- I haven't run the tools against my own Garmin account yet because I'm still in the Garmin SSO 429 cooldown from earlier today (separate issue, unrelated to this PR). Once cleared, I'll test all 5 tools end-to-end and report back.

If you'd prefer I hold the PR until I've validated against live Garmin endpoints, just say so and I'll update once tested. Or you can merge speculatively and I'll file follow-ups if anything needs adjustment.

## Out of scope (deliberately)

- Gear creation / deletion (beyond linking) -- I didn't add `create-gear` or `delete-gear` because they're more involved and not needed for the auto-tagging use case
- Gear stats / lifetime distance modifications -- read-only via the existing data
- Gear defaults (which gear gets auto-attached to a given activity type) -- could be a follow-up PR if useful

Happy to iterate on naming, descriptions, or behavior. Thanks for building this MCP server -- it's a much cleaner solution than the deprecated garth/garminconnect Python path, and the Playwright TLS-fingerprint workaround is genuinely the right move for the post-March-2026 Garmin landscape.
