# E2E Testing with Playwright and WorkOS AuthKit

End-to-end tests for WorkOS AuthKit authentication using programmatic authentication.

## Setup

**Environment Variables:**

```bash
# WorkOS Configuration
WORKOS_CLIENT_ID=your_client_id
WORKOS_API_KEY=your_api_key
WORKOS_COOKIE_PASSWORD=your_cookie_password
NEXT_PUBLIC_WORKOS_REDIRECT_URI=http://localhost:3000/callback

# Test Configuration (optional)
TEST_BASE_URL=http://localhost:3000
```

**Run Tests:**

```bash
npm run test:playwright
```

## Test Endpoints

The tests use test-only API endpoints for programmatic authentication:

**Endpoint:** `POST /api/test/set-session`

- **Purpose:** Create session from authentication tokens
- **Body:** `{ user, accessToken, refreshToken }`
- **Response:** Uses WorkOS AuthKit's `saveSession` method to create encrypted session cookie

The endpoint is disabled in production environments.

## Usage

**Import fixtures:**

```typescript
import { test, expect } from "./fixtures";
```

**Authenticated tests:**

```typescript
test.describe("Admin Features", () => {
  test.use({ user: process.env.TEST_USER_ADMIN_EMAIL });

  test("admin panel access", async ({ page }) => {
    await page.goto("/admin"); // Already authenticated
  });
});
```

**Unauthenticated tests:**

```typescript
test.describe("Public Features", () => {
  // No test.use() = unauthenticated

  test("login page", async ({ page }) => {
    await page.goto("/");
  });
});
```

## Authentication System

**User Resolution:** Tests resolve users by email address from environment variables matching `TEST_USER_<NAME>_EMAIL/PASSWORD`.

**Caching:** Authentication cookies are cached per email for 1 hour.

**Flow:**

1. API authentication via WorkOS SDK
2. Session creation via `saveSession` endpoint
3. Cookie extraction and browser injection
4. Page navigation with authenticated state

## Files

- `fixtures.ts` - Authentication fixture system
- `authenticated-flows.spec.ts` - Tests for authenticated users
- `unauthenticated-flows.spec.ts` - Tests for unauthenticated users
