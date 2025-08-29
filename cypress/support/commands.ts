/// <reference types="cypress" />

declare global {
  namespace Cypress {
    interface Chainable {
      /**
       * Login as the specified user using programmatic authentication
       * @param email - Email address of the user to authenticate as
       */
      loginAs(email: string): Chainable<void>;
    }
  }
}

/**
 * Discovers users from Cypress environment variables using the pattern:
 * TEST_USER_<USERNAME>_EMAIL and TEST_USER_<USERNAME>_PASSWORD
 */
function discoverUsersFromEnv(): Record<
  string,
  { email: string; password: string }
> {
  const users: Record<string, { email: string; password: string }> = {};

  // Scan Cypress environment variables for TEST_USER_*_EMAIL pattern
  const emailPattern = /^TEST_USER_([A-Z_]+)_EMAIL$/;

  const cypressEnv = Cypress.env();

  for (const [key, value] of Object.entries(cypressEnv)) {
    const match = key.match(emailPattern);
    if (match && value) {
      const username = match[1].toLowerCase();
      const passwordKey = `TEST_USER_${match[1]}_PASSWORD`;
      const password = cypressEnv[passwordKey];

      if (password) {
        users[username] = {
          email: value as string,
          password: password as string,
        };
      }
    }
  }

  // Add legacy single user support
  if (cypressEnv.TEST_USER_EMAIL && cypressEnv.TEST_USER_PASSWORD) {
    users.testuser = {
      email: cypressEnv.TEST_USER_EMAIL,
      password: cypressEnv.TEST_USER_PASSWORD,
    };
  }

  return users;
}

/**
 * Resolves an email address to user credentials
 */
function resolveUser(email: string): { email: string; password: string } {
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

  // User not found
  const availableEmails = Object.values(users).map((u) => u.email);

  throw new Error(
    `User with email '${email}' not found.\n\n` +
      `Available users:\n` +
      availableEmails.map((e) => `  - ${e}`).join("\n") +
      "\n\n" +
      `To add this user, set environment variables:\n` +
      `  TEST_USER_<NAME>_EMAIL=${email}\n` +
      `  TEST_USER_<NAME>_PASSWORD=your_password`
  );
}

/**
 * Custom command for programmatic authentication
 * Uses cy.session for caching per email address
 * Follows the same pattern as Playwright tests
 */
Cypress.Commands.add("loginAs", (email: string) => {
  const user = resolveUser(email);

  cy.session(
    email,
    () => {
      const workosApiKey = Cypress.env("WORKOS_API_KEY");
      const workosClientId = Cypress.env("WORKOS_CLIENT_ID");
      const baseURL = Cypress.env("TEST_BASE_URL");

      if (!workosApiKey || !workosClientId) {
        throw new Error(
          "Missing WORKOS_API_KEY or WORKOS_CLIENT_ID in Cypress environment"
        );
      }

      cy.log(`Authenticating user: ${email}`);

      // Step 1: Authenticate with WorkOS API directly (same as Playwright)
      cy.task("authenticateWithWorkOS", {
        email: user.email,
        password: user.password,
        workosApiKey,
        workosClientId,
      }).then((authResponse: any) => {
        cy.log("API authentication successful");

        // Step 2: Call our test endpoint to save the session (same as Playwright)
        cy.request({
          method: "POST",
          url: `${baseURL}/api/test/set-session`,
          body: {
            user: authResponse.user,
            accessToken: authResponse.accessToken,
            refreshToken: authResponse.refreshToken,
          },
        }).then((response) => {
          expect(response.status).to.eq(200);
          cy.log("Session saved successfully");

          // The endpoint sets the wos-session cookie
          // Cypress handles cookies from cy.request responses automatically
        });
      });
    },
    {
      validate() {
        // Validate that the session is still valid by checking authenticated state
        cy.visit("/");
        cy.get("body").should("contain.text", "Welcome back");
      },
    }
  );
});

export {};
