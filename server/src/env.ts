import { z } from 'zod';

const schema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().int().default(3000),
  DATABASE_PATH: z.string().default('./data/budget.db'),
  /** Editable config.json (categories + cards). Must be writable; the Settings page saves here. */
  CONFIG_PATH: z.string().default('./data/config.json'),
  /** Bundled defaults copied to CONFIG_PATH on first start. */
  DEFAULT_CONFIG_PATH: z.string().default('./config/defaults.json'),

  BETTER_AUTH_SECRET: z.string().min(32, 'BETTER_AUTH_SECRET must be at least 32 characters'),
  /** The URL you open the app at, e.g. http://192.168.1.50:3000 */
  BETTER_AUTH_URL: z.string().url().default('http://localhost:3000'),
  /** Extra comma-separated origins allowed to call the API (e.g. hostname + IP). */
  TRUSTED_ORIGINS: z.string().default(''),
  /**
   * Set only when running behind a reverse proxy: Express "trust proxy" value, e.g. `1`
   * (one proxy hop) or the proxy's IP/subnet. Empty = clients connect directly.
   */
  TRUST_PROXY: z.string().default(''),
  /**
   * Where the Sign up form and the (unverified) Forgot password reset work:
   * `lan` = only for requests that didn't come through a Cloudflare tunnel, `everywhere`, or `off`.
   */
  SIGNUP_AND_RESET: z.enum(['lan', 'everywhere', 'off']).default('lan'),

  ADMIN_USERNAME: z.string().min(3).default('admin'),
  ADMIN_PASSWORD: z.string().min(8, 'ADMIN_PASSWORD must be at least 8 characters'),

  ANTHROPIC_API_KEY: z.string().optional(),
  STATEMENT_PARSER_MODEL: z.string().default('claude-sonnet-5-5'),
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  console.error('Invalid environment configuration:');
  for (const issue of parsed.error.issues) console.error(`  ${issue.path.join('.')}: ${issue.message}`);
  process.exit(1);
}

export const env = parsed.data;
export const isProd = env.NODE_ENV === 'production';
