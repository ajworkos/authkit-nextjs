# E2E Testing with WorkOS AuthKit

This directory contains end-to-end tests for WorkOS AuthKit authentication using programmatic authentication instead of UI-based login flows.

## Setup

1. **Environment Variables**

```bash
# WorkOS Configuration
WORKOS_CLIENT_ID=your_client_id
WORKOS_API_KEY=your_api_key
WORKOS_COOKIE_PASSWORD=your_cookie_password
NEXT_PUBLIC_WORKOS_REDIRECT_URI=http://localhost:3000/callback

# Test Configuration (optional)
TEST_BASE_URL=http://localhost:3000

# Test Users
TEST_USER_ADMIN_EMAIL=admin@test-org.test
TEST_USER_ADMIN_PASSWORD=admin-password

TEST_USER_REGULAR_EMAIL=user@test-org.test
TEST_USER_REGULAR_PASSWORD=user-password

# Legacy single user support
TEST_USER_EMAIL=test-user@test-org.test
TEST_USER_PASSWORD=test-password
```

2. **Install Dependencies**

```bash
npm install
```

3. **Run Tests**

```bash
npm run test:playwright
```

## Test Endpoint

The tests use a test-only API endpoint for programmatic authentication:

**Endpoint:** `POST /api/test/set-session`

**Request Body:**

```json
{
  "user": { "email": "...", "id": "...", ... },
  "accessToken": "...",
  "refreshToken": "..."
}
```

**Response:** Sets encrypted `wos-session` cookie using WorkOS AuthKit's `saveSession` method.

**Security:** Only available in non-production environments.

## Usage

Import the test fixtures:

```typescript
import { test, expect } from "./fixtures";
```

**Authenticated Tests:**

```typescript
test.describe("Admin Features", () => {
  test.use({ user: process.env.TEST_USER_ADMIN_EMAIL });

  test("can access admin panel", async ({ page }) => {
    await page.goto("/admin"); // Already authenticated
  });
});
```

**Unauthenticated Tests:**

```typescript
test.describe("Public Features", () => {
  // No test.use() = unauthenticated

  test("shows login page", async ({ page }) => {
    await page.goto("/");
  });
});
```

**Mixed Authentication:**

```typescript
test.describe("Mixed Tests", () => {
  test("public access", async ({ page }) => {
    // Unauthenticated
    await page.goto("/");
  });

  test("admin access", async ({ page }) => {
    test.use({ user: process.env.TEST_USER_ADMIN_EMAIL });
    await page.goto("/admin");
  });
});
```

## User Resolution

The fixture system resolves users by email address. Users are automatically discovered from environment variables matching the pattern:

```
TEST_USER_<NAME>_EMAIL=email@domain.com
TEST_USER_<NAME>_PASSWORD=password
```

**Supported user formats:**

- `process.env.TEST_USER_ADMIN_EMAIL` (recommended)
- `"admin@test-org.test"` (direct email)

## Authentication Flow

1. **API Authentication:** Uses WorkOS SDK to authenticate with email/password
2. **Session Creation:** POSTs to `/api/test/set-session` which calls `saveSession`
3. **Cookie Injection:** Extracts `wos-session` cookie and injects into browser
4. **Cache:** Cookies are cached per user for 1 hour

## Files

- `fixtures.ts` - Authentication fixture system
- `authenticated-flows.spec.ts` - Tests for logged-in users
- `unauthenticated-flows.spec.ts` - Tests for anonymous users
- `../src/app/api/test/set-session/route.ts` - Test endpoint using `saveSession`
