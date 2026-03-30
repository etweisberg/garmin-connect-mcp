# garmin-connect-mcp

MCP server for Garmin Connect. Access your activities, health stats, sleep data, FIT files, and more from Claude Code or any MCP client.

## Why This Exists

In March 2026, Garmin changed their authentication API, breaking [garth](https://github.com/matin/garth) and [python-garminconnect](https://github.com/cyberjunky/python-garminconnect) — the two most popular libraries for accessing Garmin data programmatically. Garth has been [officially deprecated](https://github.com/matin/garth/discussions/222). Garmin added Cloudflare TLS fingerprinting that blocks all non-browser HTTP clients (Node.js `fetch`, Python `requests`, `curl`) from their API endpoints.

This project works around that by routing all API calls through a headless Playwright browser, inheriting a real Chrome TLS fingerprint. Authentication uses browser cookies captured from a manual login session.

## Install

```bash
npm install -g @etweisberg/garmin-connect-mcp
npx playwright install chromium
```

Or register directly with Claude Code:

```bash
claude mcp add garmin -- npx @etweisberg/garmin-connect-mcp
```

### Prerequisites

- Node.js 18+
- [Playwright MCP server](https://www.npmjs.com/package/@playwright/mcp) (`claude mcp add playwright -- npx @playwright/mcp@latest`) — needed for the login flow

## Setup

### 1. Login

In Claude Code, call the `garmin-login` tool. It will walk you through:

1. Opening Garmin Connect in the Playwright browser
2. Logging in manually
3. Extracting cookies and CSRF token
4. Saving the session to `~/.garmin-connect-mcp/session.json`

### 2. Verify

Call the `check-session` tool to confirm authentication works.

Session cookies expire after a few hours. Re-run the login flow when they do.

## Available Tools

### Session & Auth
| Tool | Description |
|------|-------------|
| `garmin-login` | Returns login instructions for the Playwright MCP browser |
| `check-session` | Validates the saved session is still active |
| `run-tests` | Returns a test plan to verify all tools work |

### Activities
| Tool | Description |
|------|-------------|
| `list-activities` | List activities with pagination |
| `get-activity` | Full activity summary (distance, duration, HR, calories) |
| `get-activity-details` | Time-series metrics (HR, cadence, elevation over time) |
| `get-activity-splits` | Lap/split data |
| `get-activity-hr-zones` | Heart rate time-in-zone breakdown |
| `get-activity-polyline` | Full-resolution GPS track |
| `get-activity-weather` | Weather conditions during activity |
| `download-fit` | Download original FIT file |

### Daily Health
| Tool | Description |
|------|-------------|
| `get-daily-summary` | Steps, calories, distance, intensity minutes |
| `get-daily-heart-rate` | Heart rate data throughout the day |
| `get-daily-stress` | Stress levels throughout the day |
| `get-daily-summary-chart` | Combined wellness chart data |
| `get-daily-intensity-minutes` | Intensity minutes for a date |
| `get-daily-movement` | Movement/activity data |
| `get-daily-respiration` | Respiration rate data |

### Sleep / Body Battery / HRV
| Tool | Description |
|------|-------------|
| `get-sleep` | Sleep score, duration, stages, SpO2 |
| `get-body-battery` | Body battery charged/drained values |
| `get-hrv` | Heart rate variability data |

### Weight / Records / Fitness
| Tool | Description |
|------|-------------|
| `get-weight` | Weight measurements over a date range |
| `get-personal-records` | All personal records with history |
| `get-fitness-stats` | Aggregated activity stats by type |
| `get-vo2max` | Latest VO2 Max estimate |
| `get-hr-zones-config` | Heart rate zone boundaries |
| `get-user-profile` | User profile and settings |

## Architecture

```
Claude Code / MCP Client
        |
        | MCP (stdio)
        v
garmin-connect-mcp server
        |
        | page.evaluate(fetch(...))
        v
Headless Playwright Chromium
        |
        | HTTPS (real Chrome TLS fingerprint)
        v
connect.garmin.com/gc-api/*
```

All API calls are made from within a headless Chromium browser context via `page.evaluate(fetch(...))`. This inherits the real Chrome TLS fingerprint, bypassing Cloudflare's detection of non-browser clients.

**Auth flow**: Cookies + CSRF token are captured from a manual browser login (via the Playwright MCP server) and stored at `~/.garmin-connect-mcp/session.json`. The headless browser loads these cookies on startup.

**Why not direct HTTP?** Cloudflare blocks Node.js `fetch`, Python `requests`, and even `curl` with a 403. Only requests from a real browser TLS stack are accepted.

## Development

```bash
git clone https://github.com/etweisberg/garmin-connect-mcp.git
cd garmin-connect-mcp
npm install
npx playwright install chromium
npm run build
```

### Scripts

| Command | Description |
|---------|-------------|
| `npm run build` | Compile TypeScript |
| `npm run lint` | Run ESLint |
| `npm run format` | Format with Prettier |
| `npm run typecheck` | Type check without emitting |
| `npm test` | Run integration tests (requires valid session) |

### Local Integration Testing

The standalone test suite (`npm test`) requires a valid Garmin session and hits the real API. Run it locally after authenticating:

```bash
npm test
```

## Contributing

1. Fork the repo and create a feature branch
2. Make your changes
3. Run checks:
   ```bash
   npm run lint
   npm run format
   npm run typecheck
   npm run build
   ```
4. **Test via Claude Code**: The recommended way to verify your changes is through Claude Code. After building, call the `run-tests` MCP tool — it returns a test plan that exercises all 27 tools against the live Garmin API. Tell Claude to execute the plan and report results.
5. Open a PR against `main`

CI runs lint, format check, typecheck, and build on every PR. Integration tests run locally only (they require Garmin authentication that can't safely run in CI).

### Releasing

Releases are automated via GitHub Actions:

```bash
# Bump version
npm version patch  # or minor, major

# Push the tag
git push --follow-tags

# GitHub Actions will:
# 1. Build the package
# 2. Publish to npm with provenance
# 3. Create a GitHub Release
```

## License

[AGPL-3.0](LICENSE)
