import { test as base, expect, type BrowserContext } from "@playwright/test";
import { WorkOS } from "@workos-inc/node";

// User configuration map
interface TestUser {
  email: string;
  password: string;
  cookies?: any[]; // Cached cookies
  expiresAt?: number; // Cache expiration
}

// Cache for discovered users
let discoveredUsers: Record<string, TestUser> | null = null;

/**
 * Discovers users from environment variables using the pattern:
 * TEST_USER_<USERNAME>_EMAIL and TEST_USER_<USERNAME>_PASSWORD
 *
 * Examples:
 * - TEST_USER_ADMIN_EMAIL=admin@test.com + TEST_USER_ADMIN_PASSWORD=pass123
 * - TEST_USER_VIEWER_EMAIL=viewer@test.com + TEST_USER_VIEWER_PASSWORD=pass456
 */
function discoverUsersFromEnv(): Record<string, TestUser> {
  if (discoveredUsers !== null) {
    return discoveredUsers;
  }

  discoveredUsers = {};

  // Scan environment variables for TEST_USER_*_EMAIL pattern
  const emailPattern = /^TEST_USER_([A-Z_]+)_EMAIL$/;

  for (const [key, value] of Object.entries(process.env)) {
    const match = key.match(emailPattern);
    if (match && value) {
      const username = match[1].toLowerCase(); // Convert ADMIN -> admin
      const passwordKey = `TEST_USER_${match[1]}_PASSWORD`;
      const password = process.env[passwordKey];

      if (password) {
        discoveredUsers[username] = {
          email: value,
          password: password,
        };
      } else {
        console.warn(`⚠️  Found ${key} but missing ${passwordKey}`);
      }
    }
  }

  // Add default fallback user if TEST_USER_EMAIL/PASSWORD are set (for backwards compatibility)
  if (process.env.TEST_USER_EMAIL && process.env.TEST_USER_PASSWORD) {
    discoveredUsers.testuser = {
      email: process.env.TEST_USER_EMAIL,
      password: process.env.TEST_USER_PASSWORD,
    };
  }

  return discoveredUsers;
}

/**
 * Resolves an email address to a TestUser object.
 * Simply looks up the email in discovered users and throws if not found.
 *
 * @param email - Email address to look up (can come from env var or be literal)
 * @returns TestUser object with email and password
 */
function resolveUser(email: string): TestUser {
  if (!email) {
    throw new Error("User email cannot be empty");
  }

  const users = discoverUsersFromEnv();

  // Find user by email address
  for (const user of Object.values(users)) {
    if (user.email === email) {
      return user;
    }
  }

  // User not found - provide helpful error message
  const availableEmails = Object.values(users).map((u) => u.email);

  throw new Error(
    `User with email '${email}' not found.\n\n` +
      `Available users:\n` +
      availableEmails.map((e) => `  - ${e}`).join("\n") +
      "\n\n" +
      `To add this user, set environment variables:\n` +
      `  TEST_USER_<NAME>_EMAIL=${email}\n` +
      `  TEST_USER_<NAME>_PASSWORD=your_password\n\n` +
      `Example:\n` +
      `  TEST_USER_ADMIN_EMAIL=admin@test.com\n` +
      `  TEST_USER_ADMIN_PASSWORD=admin123`
  );
}

// Extended test interface
interface TestFixtures {
  user: string | null; // Email address to authenticate as, or null for unauthenticated
}

interface WorkerFixtures {
  // Worker-scoped fixtures could go here if needed
}

async function authenticateUser(
  email: string,
  request: any,
  context: BrowserContext
): Promise<void> {
  const user = resolveUser(email);

  // Check if we have valid cached cookies
  if (user.cookies && user.expiresAt && Date.now() < user.expiresAt) {
    console.log(`Using cached cookies for user: ${email}`);
    await context.addCookies(user.cookies);
    return;
  }

  console.log(`Authenticating user: ${email}`);

  const workosApiKey = process.env.WORKOS_API_KEY;
  const workosClientId = process.env.WORKOS_CLIENT_ID;

  if (!workosApiKey || !workosClientId) {
    throw new Error(
      "Missing WORKOS_API_KEY or WORKOS_CLIENT_ID environment variables"
    );
  }

  const workos = new WorkOS(workosApiKey, {
    apiHostname: process.env.WORKOS_API_HOSTNAME,
  });

  try {
    // Step 1: Get tokens from WorkOS API
    const authResponse = await workos.userManagement.authenticateWithPassword({
      clientId: workosClientId,
      email: user.email,
      password: user.password,
    });

    // Step 2: Save session via our test endpoint
    const baseURL = process.env.TEST_BASE_URL || "http://localhost:3000";
    const sessionResponse = await request.post(
      `${baseURL}/api/test/set-session`,
      {
        data: {
          user: authResponse.user,
          accessToken: authResponse.accessToken,
          refreshToken: authResponse.refreshToken,
        },
        headers: {
          "Content-Type": "application/json",
        },
      }
    );

    if (!sessionResponse.ok()) {
      const errorText = await sessionResponse.text();
      throw new Error(
        `Authentication failed: ${sessionResponse.status()} - ${errorText}`
      );
    }

    // Step 3: Extract and cache cookies
    const responseCookies = sessionResponse.headers()["set-cookie"];
    if (responseCookies) {
      const cookies = [];
      const cookieStrings = Array.isArray(responseCookies)
        ? responseCookies
        : [responseCookies];

      for (const cookieString of cookieStrings) {
        if (cookieString && cookieString.includes("wos-session")) {
          const [nameValue, ...attributes] = cookieString.split(";");
          const [name, value] = nameValue.split("=");

          const cookie = {
            name: name.trim(),
            value: value.trim(),
            domain: "localhost",
            path: "/",
            httpOnly: true,
            secure: false,
            sameSite: "Lax" as const,
          };

          cookies.push(cookie);
        }
      }

      if (cookies.length > 0) {
        // Cache cookies for future use (expire in 1 hour or when cookie expires)
        user.cookies = cookies;
        user.expiresAt = Date.now() + 60 * 60 * 1000; // 1 hour cache

        // Add cookies to current context
        await context.addCookies(cookies);
        console.log(`Authenticated and cached user: ${email}`);
      } else {
        throw new Error("No wos-session cookie found in response");
      }
    } else {
      throw new Error("No Set-Cookie header found in response");
    }
  } catch (error) {
    console.error(`Authentication failed for user ${email}:`, error);
    throw error;
  }
}

// Create extended test with user fixture
export const test = base.extend<TestFixtures, WorkerFixtures>({
  user: [null, { option: true }], // Default to null (unauthenticated)

  // Override the default page fixture to handle authentication
  page: async ({ page, user, request, context }, use) => {
    if (user !== null) {
      // Authenticate the user by email before providing the page
      await authenticateUser(user, request, context);
    }
    // If user is null, page remains unauthenticated
    await use(page);
  },
});

export { expect };
