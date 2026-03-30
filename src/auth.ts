import { mkdirSync, writeFileSync, existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { getSessionDir, getSessionFile } from "./garmin-client.js";

/**
 * Login flow that uses the user's real Chrome profile to bypass Cloudflare.
 * Falls back to a fresh Playwright browser if Chrome profile isn't found.
 */
export async function runLogin(): Promise<void> {
  let playwright;
  try {
    playwright = await import("playwright");
  } catch {
    console.error(
      "Playwright is required for login. Install it:\n" +
        "  npm install playwright && npx playwright install chromium"
    );
    process.exit(1);
  }

  // Try to find Chrome user data dir for a real browser fingerprint
  const chromeDataDir = join(
    homedir(),
    "Library/Application Support/Google/Chrome"
  );
  const useChromeProfile = existsSync(chromeDataDir);

  let browser;
  let context;

  if (useChromeProfile) {
    console.error(
      "Launching with your Chrome profile (bypasses Cloudflare)..."
    );
    console.error(
      "  Note: Close all Chrome windows first, or this will fail.\n"
    );
    browser = await playwright.chromium.launchPersistentContext(chromeDataDir, {
      headless: false,
      channel: "chrome",
    });
    context = browser;
  } else {
    console.error("Launching Playwright Chromium...");
    browser = await playwright.chromium.launch({ headless: false });
    context = await browser.newContext();
  }

  const page = useChromeProfile
    ? await context.newPage()
    : await context.newPage();

  console.error("Opening Garmin Connect...");
  await page.goto("https://connect.garmin.com/app/activities");

  console.error(
    "\n  Log in to Garmin Connect in the browser window.\n" +
      "  Once you see your activities list, press Enter here...\n"
  );

  await new Promise<void>((resolve) => {
    process.stdin.once("data", () => resolve());
  });

  // Extract CSRF token from <meta name="csrf-token">
  const csrf: string | null = await page.evaluate(
    "() => document.querySelector('meta[name=\"csrf-token\"]')?.content ?? null"
  );

  if (!csrf) {
    console.error(
      "Warning: could not find CSRF token. Make sure you're on the activities page."
    );
  }

  const cookies = useChromeProfile
    ? await context.cookies()
    : await context.cookies();

  if (useChromeProfile) {
    await context.close();
  } else {
    await context.close();
    await browser.close();
  }

  const sessionData = {
    csrf_token: csrf ?? "",
    cookies: cookies
      .filter(
        (c: { domain?: string }) => c.domain && c.domain.includes("garmin")
      )
      .map((c: { name: string; value: string; domain: string }) => ({
        name: c.name,
        value: c.value,
        domain: c.domain,
      })),
  };

  const dir = getSessionDir();
  mkdirSync(dir, { recursive: true, mode: 0o700 });

  const file = getSessionFile();
  writeFileSync(file, JSON.stringify(sessionData, null, 2), { mode: 0o600 });

  console.error(`\nSession saved to ${file}`);
  console.error(`CSRF token: ${(csrf ?? "").substring(0, 20)}...`);
  console.error(`Cookies: ${sessionData.cookies.length} saved`);
}
