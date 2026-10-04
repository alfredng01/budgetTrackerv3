import { createAuthClient } from 'better-auth/react';
import { usernameClient } from 'better-auth/client/plugins';

export const authClient = createAuthClient({
  baseURL: window.location.origin,
  plugins: [usernameClient()],
});

/** Better Auth needs an email per user; this app is username-only, so derive a placeholder. */
export const syntheticEmail = (username: string) => `${username.trim().toLowerCase()}@users.budget.local`;
