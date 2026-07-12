import { readFileSync, existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const SESSION_DIR = join(homedir(), ".garmin-connect-mcp");
const SESSION_FILE = join(SESSION_DIR, "session.json");

interface Cookie {
  name: string;
  value: string;
  domain: string;
}

interface SessionData {
  csrf_token: string;
  cookies: Cookie[];
}

export function getSessionDir(): string {
  return SESSION_DIR;
}

export function getSessionFile(): string {
  return SESSION_FILE;
}

export function sessionExists(): boolean {
  return existsSync(SESSION_FILE);
}

function loadSession(): SessionData {
  if (!existsSync(SESSION_FILE)) {
    throw new Error(
      `No saved session found at ${SESSION_FILE}. Run: npx garmin-connect-mcp login`
    );
  }
  return JSON.parse(readFileSync(SESSION_FILE, "utf-8"));
}

/**
 * Garmin Connect API client that routes requests through a headless Playwright
 * browser to bypass Cloudflare TLS fingerprinting.
 *
 * The browser navigates to connect.garmin.com once (with saved cookies),
 * then all API calls are made via page.evaluate(fetch(...)) from the
 * browser context — inheriting the real Chrome TLS fingerprint.
 */
export class GarminClient {
  private page: any = null; // playwright Page
  private browser: any = null;
  private csrfToken: string;
  private cookies: Cookie[];
  private initialized = false;
  private displayName: string | null = null;

  constructor(sessionPath?: string) {
    const session = sessionPath
      ? JSON.parse(readFileSync(sessionPath, "utf-8"))
      : loadSession();

    this.csrfToken = session.csrf_token;
    this.cookies = session.cookies;
  }

  private async init(): Promise<void> {
    if (this.initialized) return;

    let playwright;
    try {
      playwright = await import("playwright");
    } catch {
      throw new Error(
        "Playwright is required. Install: npm install playwright && npx playwright install chromium"
      );
    }

    this.browser = await playwright.chromium.launch({ headless: true });
    const context = await this.browser.newContext();

    // Load saved cookies into the browser context
    await context.addCookies(
      this.cookies.map((c) => ({
        name: c.name,
        value: c.value,
        domain: c.domain,
        path: "/",
      }))
    );

    this.page = await context.newPage();

    // Navigate to a static endpoint on connect.garmin.com to set the origin.
    // We avoid /app/* routes because they redirect through sso.garmin.com
    // which may be rate-limited by Cloudflare.
    await this.page.goto(
      "https://connect.garmin.com/site-status/garmin-connect-status.json",
      { waitUntil: "domcontentloaded", timeout: 30000 }
    );

    this.initialized = true;
    console.error("Garmin browser session initialized");
  }

  async getDisplayName(): Promise<string> {
    if (this.displayName) return this.displayName;
    const settings = (await this.get(
      "userprofile-service/userprofile/settings"
    )) as Record<string, unknown>;
    this.displayName = settings.displayName as string;
    if (!this.displayName) {
      throw new Error(
        "Could not resolve displayName from userprofile settings"
      );
    }
    return this.displayName;
  }

  async close(): Promise<void> {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
      this.page = null;
      this.initialized = false;
    }
  }

  async get(
    path: string,
    params?: Record<string, string | number>
  ): Promise<unknown> {
    await this.init();

    let url = `/gc-api/${path}`;
    if (params) {
      const qs = new URLSearchParams();
      for (const [k, v] of Object.entries(params)) {
        qs.set(k, String(v));
      }
      url += `?${qs.toString()}`;
    }

    const csrfToken = this.csrfToken;
    const result = await this.page.evaluate(
      async ({ url, csrfToken }: { url: string; csrfToken: string }) => {
        const resp = await fetch(url, {
          headers: {
            "connect-csrf-token": csrfToken,
            Accept: "*/*",
          },
        });
        const text = await resp.text();
        return { status: resp.status, body: text };
      },
      { url, csrfToken }
    );

    if (result.status === 204 || (result.status === 200 && !result.body)) {
      return { noData: true, status: result.status, path };
    }
    if (result.status === 401) {
      // Invalidate the singleton so the next call re-reads the session file
      _sharedClient = null;
      await this.close();
      throw new Error(`Garmin API 401: ${path} — ${result.body}`);
    }
    if (result.status !== 200) {
      throw new Error(`Garmin API ${result.status}: ${path} — ${result.body}`);
    }
    return JSON.parse(result.body);
  }

  async getBytes(path: string): Promise<Buffer> {
    await this.init();

    const url = `/gc-api/${path}`;
    const csrfToken = this.csrfToken;

    const result = await this.page.evaluate(
      async ({ url, csrfToken }: { url: string; csrfToken: string }) => {
        const resp = await fetch(url, {
          headers: {
            "connect-csrf-token": csrfToken,
            Accept: "*/*",
          },
        });
        if (!resp.ok) {
          return { status: resp.status, error: await resp.text(), data: null };
        }
        const buf = await resp.arrayBuffer();
        // Convert to base64 to pass through page.evaluate boundary
        const bytes = new Uint8Array(buf);
        let binary = "";
        for (let i = 0; i < bytes.length; i++) {
          binary += String.fromCharCode(bytes[i]);
        }
        return { status: resp.status, error: null, data: btoa(binary) };
      },
      { url, csrfToken }
    );

    if (result.status !== 200 || !result.data) {
      throw new Error(
        `Garmin API ${result.status}: ${path} — ${result.error ?? ""}`
      );
    }
    return Buffer.from(result.data, "base64");
  }

  async post(path: string, body: unknown): Promise<unknown> {
    await this.init();

    const url = `/gc-api/${path}`;
    const csrfToken = this.csrfToken;
    const bodyStr = JSON.stringify(body);

    const result = await this.page.evaluate(
      async ({
        url,
        csrfToken,
        bodyStr,
      }: {
        url: string;
        csrfToken: string;
        bodyStr: string;
      }) => {
        const resp = await fetch(url, {
          method: "POST",
          headers: {
            "connect-csrf-token": csrfToken,
            "Content-Type": "application/json",
            Accept: "application/json, */*",
          },
          body: bodyStr,
        });
        const text = await resp.text();
        return { status: resp.status, body: text };
      },
      { url, csrfToken, bodyStr }
    );

    if (result.status === 204 || (result.status === 200 && !result.body)) {
      return { noData: true, status: result.status, path };
    }
    if (result.status < 200 || result.status >= 300) {
      throw new Error(`Garmin API ${result.status}: ${path} — ${result.body}`);
    }
    return JSON.parse(result.body);
  }

  async delete(path: string): Promise<unknown> {
    await this.init();

    const url = `/gc-api/${path}`;
    const csrfToken = this.csrfToken;

    const result = await this.page.evaluate(
      async ({ url, csrfToken }: { url: string; csrfToken: string }) => {
        const resp = await fetch(url, {
          method: "DELETE",
          headers: {
            "connect-csrf-token": csrfToken,
            Accept: "*/*",
          },
        });
        const text = await resp.text();
        return { status: resp.status, body: text };
      },
      { url, csrfToken }
    );

    if (result.status === 204 || (result.status === 200 && !result.body)) {
      return { noData: true, status: result.status, path };
    }
    if (result.status < 200 || result.status >= 300) {
      throw new Error(`Garmin API ${result.status}: ${path} — ${result.body}`);
    }
    return result.body ? JSON.parse(result.body) : { success: true };
  }
}

// Singleton client for reuse across tool calls
let _sharedClient: GarminClient | null = null;

export function getSharedClient(): GarminClient {
  if (!_sharedClient) {
    _sharedClient = new GarminClient();
  }
  return _sharedClient;
}

export async function resetSharedClient(): Promise<void> {
  if (_sharedClient) {
    await _sharedClient.close();
    _sharedClient = null;
  }
}

// Clean up on process exit
process.on("exit", () => {
  _sharedClient?.close();
});
process.on("SIGINT", () => {
  _sharedClient?.close();
  process.exit(0);
});
process.on("SIGTERM", () => {
  _sharedClient?.close();
  process.exit(0);
});
