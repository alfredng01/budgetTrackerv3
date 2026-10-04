import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { hashPassword, verifyPassword } from 'better-auth/crypto';
import { username } from 'better-auth/plugins';
import { and, eq } from 'drizzle-orm';
import { db } from './db/index.js';
import * as schema from './db/schema.js';
import { env, isProd } from './env.js';

/**
 * Better Auth requires an email on every user, but this app only uses usernames.
 * Each account gets a synthetic, non-routable address derived from the username.
 */
export const syntheticEmail = (name: string) => `${name.toLowerCase()}@users.budget.local`;

/** Header carrying the client IP as resolved by Express; set server-side, never trusted from clients. */
export const CLIENT_IP_HEADER = 'x-budget-client-ip';

/** Browsers send the bare origin, so "https://host/" or "https://host/path" in the env would never match. */
function toOrigin(url: string): string {
  try {
    return new URL(url).origin;
  } catch {
    throw new Error(`Not a valid URL in BETTER_AUTH_URL / TRUSTED_ORIGINS: "${url}"`);
  }
}

const trustedOrigins = [
  env.BETTER_AUTH_URL,
  ...env.TRUSTED_ORIGINS.split(',').map((o) => o.trim()).filter(Boolean),
  ...(isProd ? [] : ['http://localhost:5173']),
].map(toOrigin);

/**
 * Secure cookies are never sent back over plain HTTP, so they're only used when every allowed
 * origin is HTTPS. With an HTTPS tunnel plus an http://<lan-ip> origin, LAN sign-in keeps working.
 */
const allHttps = trustedOrigins.every((o) => o.startsWith('https://'));

export const auth = betterAuth({
  baseURL: env.BETTER_AUTH_URL,
  secret: env.BETTER_AUTH_SECRET,
  trustedOrigins,
  database: drizzleAdapter(db, {
    provider: 'sqlite',
    schema: {
      user: schema.user,
      session: schema.session,
      account: schema.account,
      verification: schema.verification,
    },
  }),
  // Passwords are hashed with salted scrypt by Better Auth before being stored.
  emailAndPassword: { enabled: true, minPasswordLength: 8, maxPasswordLength: 128, autoSignIn: true },
  user: {
    additionalFields: {
      // input: false => clients can never set their own role during sign-up/update.
      role: { type: 'string', defaultValue: 'user', input: false },
    },
  },
  session: {
    expiresIn: 60 * 60 * 24 * 30, // 30 days
    updateAge: 60 * 60 * 24, // refresh expiry once a day
  },
  plugins: [username({ minUsernameLength: 3, maxUsernameLength: 32 })],
  advanced: {
    useSecureCookies: allHttps,
    // Rate limits and session records are keyed per client IP (see the middleware in app.ts).
    ipAddress: { ipAddressHeaders: [CLIENT_IP_HEADER] },
  },
  rateLimit: { enabled: true, window: 60, max: 30 },
  telemetry: { enabled: false },
});

async function setCredentialPassword(userId: string, password: string) {
  await db
    .update(schema.account)
    .set({ password: await hashPassword(password) })
    .where(and(eq(schema.account.userId, userId), eq(schema.account.providerId, 'credential')));
}

/**
 * Sets a new password for a regular (non-admin) user and signs them out everywhere.
 * Intentionally unverified: the app is LAN-only and the owners accepted that tradeoff.
 */
export async function resetUserPassword(name: string, newPassword: string): Promise<boolean> {
  const found = await db.query.user.findFirst({
    where: and(eq(schema.user.username, name.toLowerCase()), eq(schema.user.role, 'user')),
    columns: { id: true },
  });
  if (!found) return false;
  await setCredentialPassword(found.id, newPassword);
  await db.delete(schema.session).where(eq(schema.session.userId, found.id));
  return true;
}

/**
 * Ensures the read-only admin account exists and that its password matches ADMIN_PASSWORD,
 * so the env var is always the source of truth for admin credentials.
 */
export async function ensureAdminUser() {
  const adminName = env.ADMIN_USERNAME.toLowerCase();
  let admin = await db.query.user.findFirst({ where: eq(schema.user.username, adminName) });

  if (!admin) {
    await auth.api.signUpEmail({
      body: { email: syntheticEmail(adminName), password: env.ADMIN_PASSWORD, name: 'Admin', username: adminName },
    });
    admin = await db.query.user.findFirst({ where: eq(schema.user.username, adminName) });
    console.log(`Created admin account "${adminName}"`);
  }
  if (!admin) throw new Error('Failed to create admin user');

  if (admin.role !== 'admin') {
    await db.update(schema.user).set({ role: 'admin' }).where(eq(schema.user.id, admin.id));
  }

  const cred = await db.query.account.findFirst({
    where: and(eq(schema.account.userId, admin.id), eq(schema.account.providerId, 'credential')),
    columns: { password: true },
  });
  const matches = cred?.password ? await verifyPassword({ hash: cred.password, password: env.ADMIN_PASSWORD }) : false;
  if (!matches) {
    await setCredentialPassword(admin.id, env.ADMIN_PASSWORD);
    await db.delete(schema.session).where(eq(schema.session.userId, admin.id));
    console.log('Admin password updated from ADMIN_PASSWORD');
  }
}
