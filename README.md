# Budget Tracker

A self-hosted budget tracker for a small household, meant to run on a LAN (e.g. an Unraid server).

- **Statement import (AI)**: upload a PDF statement; Claude reads the transactions, then you review every row in an editable table (date, description, amount, category, card, note) before saving. Payments/transfers are skipped and likely duplicates are flagged.
- **CSV import (no AI)**: upload a bank CSV export, confirm which columns are date / description / amount, and review in the same table. The file is parsed in the browser and never uploaded.
- **Accounts**: per-user balances for Checking, High Yield Savings, Savings, Venmo (configurable). Income is deposited to an account; debit-card and Venmo purchases draw from one; card payments come out of the payment account; transfers move money between accounts. Set a starting balance once and re-sync with "Set balance" whenever it drifts.
- **Credit cards**: last paid date and amount per credit card, filled in automatically when an import contains a card payment (or recorded by hand).
- **Allowance**: a weekly amount that accrues from Jan 1 (week of the year × amount), minus this year's spending in the categories you choose. Resets every year.
- **Settings**: any user can add, rename, reorder or remove purchase categories, cards and accounts, link cards to accounts, and pick the account card payments come from.
- **Dashboard** (defaults to the current month): spending-by-category donut, budget-vs-actual bars with overages in red, and income / spent / net (green when positive, red when negative).
- **Manual entries** for expenses and income, **per-category monthly budgets**, and a **history** view by month and year.
- **Accounts**: each user sees only their own data. A read-only **admin** account can see everyone's data, filtered by user.

## Stack

| Layer    | Tech                                                                    |
| -------- | ----------------------------------------------------------------------- |
| Frontend | React 19 + Vite + TypeScript, Mantine UI, `@mantine/charts` (Recharts)  |
| Backend  | Express 5 + TypeScript, Better Auth (username/password)                 |
| Database | SQLite (better-sqlite3, WAL) via Drizzle ORM + migrations               |
| Parsing  | `unpdf` text extraction → Claude API (structured JSON output)           |

```
shared/   Types, zod schemas and money helpers used by both sides
server/   Express API, DB schema + migrations (server/drizzle), config/defaults.json
client/   React app
```

## Running locally

```bash
cp .env.example .env      # then fill in BETTER_AUTH_SECRET and ADMIN_PASSWORD
npm install
npm run dev               # API on :3000, Vite on :5173 (proxies /api)
```

Open http://localhost:5173, create an account with **Sign up**, or sign in as the admin from `.env`.

Useful scripts:

- `npm run build` builds the client and bundles the server.
- `npm start` runs the production server. It serves `client/dist` on the same port.
- `npm run typecheck` typechecks all three workspaces.
- `npm run db:generate` generates a new migration after editing `server/src/db/schema.ts`. Migrations run automatically on startup.

## Configuration

All settings come from environment variables (see `.env.example`):

| Variable                 | Purpose                                                                                       |
| ------------------------ | --------------------------------------------------------------------------------------------- |
| `BETTER_AUTH_URL`        | **The exact URL you open the app at**, e.g. `http://192.168.1.50:3000`. Sign-in fails if it doesn't match. |
| `TRUSTED_ORIGINS`        | Other URLs you also use, comma-separated (e.g. `http://tower.local:3000`).                    |
| `TRUST_PROXY`            | Leave empty unless a reverse proxy or Cloudflare tunnel sits in front; then `1` (or the proxy's IP/subnet), so per-client rate limits see real client IPs. |
| `SIGNUP_AND_RESET`       | Where the Sign up form and the unverified Forgot password reset work: `lan` (default: everywhere except through a Cloudflare tunnel), `everywhere`, or `off`. |
| `BETTER_AUTH_SECRET`     | 32+ random characters (`openssl rand -base64 32`). Signs session cookies.                     |
| `ADMIN_USERNAME` / `ADMIN_PASSWORD` | The read-only admin account. It's created on first start, and its password is re-synced from the env on every start. |
| `ANTHROPIC_API_KEY`      | Enables statement parsing. Leave empty to disable it.                                         |
| `STATEMENT_PARSER_MODEL` | Claude model used for parsing (default `claude-sonnet-5-5`).                                  |
| `DATABASE_PATH`          | SQLite file location.                                                                         |
| `CONFIG_PATH`            | Writable `config.json` with the category and card lists (default `./data/config.json`).       |

### Categories, cards and accounts

Edit these on the **Settings** page. Any signed-in user can open it, including the admin. Changes are saved to `config.json` at `CONFIG_PATH`; on first start that file is copied from [`server/config/defaults.json`](server/config/defaults.json), and older files without accounts are upgraded automatically.

- **Renaming** updates existing records.
- **Removing** hides an entry from dropdowns. Past records keep their label, and adding the same name again brings back the original entry.
- **Cards** without a linked account are credit cards: purchases don't touch an account until the card is paid, and they're listed on the Credit cards tab. Linked cards draw from their account directly (Checking Account → Checking). A linked card whose account isn't the payment account, such as Venmo, offers a per-purchase choice between its own balance and the payment account.
- **Category colours** follow creation order, so reordering or removing categories never changes another category's colour, and a new category always gets a new one.

`config.json` format (credit cards can be plain strings):

```json
{
  "categories": ["Food", "Groceries"],
  "cards": ["Discover", { "name": "Venmo", "account": "Venmo" }, { "name": "Checking Account", "account": "Checking" }],
  "accounts": ["Checking", "High Yield Savings", "Savings", "Venmo"],
  "paymentAccount": "Checking"
}
```

You can also edit `config.json` by hand and restart, but entries are matched by name, so a rename made that way creates a new entry instead of renaming the old one.

### How balances and the allowance are calculated

- **Account balance** = balance adjustments + transfers in − transfers out + income deposited − purchases paid from the account − card payments made from it. "Set balance" records the difference between what you enter and the tracked balance as an adjustment, and both adjustments and transfers can be undone from the account's activity list.
- **Allowance** = weekly amount × week of the year (Jan 1–7 is week 1, Dec 31 is week 53) − spending this year in the chosen categories, up to today. Changing the weekly amount applies to the whole year so far.

## Statement parsing

1. The uploaded file is held **in memory only**. It's never written to disk, and the buffer is zeroed after parsing.
2. The text is extracted from the PDF. CSV and TXT files are read as-is. Scanned, image-only PDFs aren't supported.
3. Long digit runs (card, account and routing numbers) are masked to `****1234` before anything leaves the server.
4. The text goes to the Claude API, which returns structured JSON:
   - date, description, amount, kind and a suggested category for each transaction
   - a guess at which card the statement is from
5. Card payments are listed separately and saved as payments (lowering the payment account and updating the card's last paid date). Transfers and deposits are dropped. Refunds become negative amounts.
6. Rows matching an existing transaction (same date and amount, similar description) are flagged and unchecked by default.
7. If you've categorised a merchant before, that category is used. Otherwise Claude's suggestion is used.

### CSV import

CSV import is fully local. The browser parses the file, and the server only receives the parsed rows to check for duplicates and suggest categories from your history.

- Column mapping is auto-detected for typical exports (Chase, Discover, Amex, Capital One, Apple Card, most checking accounts). You confirm the guess and can see a preview before continuing.
- Some banks show purchases as negative numbers and some as positive. The importer guesses the sign from rows like "PAYMENT - THANK YOU" or payroll deposits, and you can flip it.
- Rows that look like card payments go to the card payments section. Rows that look like deposits or transfers start unchecked with a flag. Rows with an unreadable date or amount are skipped and counted.
- A card payment within 5 days of an already-recorded payment of the same amount is flagged, since the same payment usually appears on both the card and checking statements.

**Cost:** the API is billed separately from a Claude Pro subscription. With Sonnet 5.5, a typical statement costs about $0.04–0.06 to parse.

## Deploying with Docker / Unraid

```bash
cp .env.example .env   # set BETTER_AUTH_URL to http://<server-ip>:3000, secret, admin password, API key
docker compose up -d --build
```

### Unraid (Compose Manager plugin)

1. Copy the project to the server, without `node_modules`, `.env` or `data`:
   `rsync -av --exclude node_modules --exclude .env --exclude data ./ root@tower:/mnt/cache/appdata/budget-tracker/src/`
2. In the Unraid terminal, create the data folder:
   `mkdir -p /mnt/cache/appdata/budget-tracker/data && chown 99:100 /mnt/cache/appdata/budget-tracker/data`
3. In Compose Manager, add a stack and paste in `docker-compose.yml` unchanged. For the env file, use `.env.example` filled in, including the Unraid section at the bottom (`SOURCE_DIR`, `DATA_DIR`, `PUID=99`, `PGID=100`).
4. Compose Up. The first build takes a few minutes.
5. To update later, re-run the rsync, then rebuild: `docker compose up -d --build`.

- Data lives in the `/data` volume: `budget.db` (plus its `-wal`/`-shm` files) and `config.json`.
- **Don't open `budget.db` with another program while the container is running** (for example a SQLite browser on a network share). SQLite's WAL mode coordinates through shared memory, and two processes on different machines or VMs can corrupt the file. To back up, stop the container first, then copy the whole folder.
- On Unraid, prefer a direct disk or pool path for `/data` (e.g. `/mnt/cache/appdata/budget-tracker`) over `/mnt/user/...`, which goes through Unraid's user-share layer and is a known source of SQLite locking problems.
- If a reverse proxy (SWAG, Nginx Proxy Manager…) sits in front, set `TRUST_PROXY=1` and add the proxy's URL to `BETTER_AUTH_URL` / `TRUSTED_ORIGINS`.

### Cloudflare tunnel

1. In the tunnel's public hostname settings, point the service at the container: `http://<unraid-ip>:3000`, or `http://budget-tracker:3000` if cloudflared shares a Docker network with it.
2. In the env file:
   ```
   BETTER_AUTH_URL=https://budget.example.com
   TRUSTED_ORIGINS=http://<unraid-ip>:3000   # only if you also open it directly on the LAN
   TRUST_PROXY=1                             # or cloudflared's IP/subnet if LAN access is also used
   ```
3. Restart the stack. Everyone has to sign in again once, because the session cookie settings change.

Notes:
- "Invalid origin" on sign-in means the address in the browser bar isn't in `BETTER_AUTH_URL` or `TRUSTED_ORIGINS`. The match is exact: scheme, host and port.
- Cookies get the `Secure` flag only when every allowed origin is HTTPS. With a plain-HTTP LAN address in `TRUSTED_ORIGINS` they don't, so LAN sign-in keeps working.
- Through the tunnel, Sign up and Forgot password are hidden and blocked (`SIGNUP_AND_RESET=lan`). Use them from the LAN. Cloudflare marks every tunnelled request with a `CF-Connecting-IP` header, which is how the app tells the two apart.
- Cloudflare drops requests that take longer than 100 seconds. Parsing a long PDF statement can come close; if an upload fails with a 524 error, import it from the LAN or use CSV import.
- Consider putting Cloudflare Access (Zero Trust → Access → Applications) in front of the hostname, so only your email addresses can reach the login page at all.

## Security notes

- Passwords are hashed with salted scrypt by Better Auth. Sessions are httpOnly cookies, and the auth endpoints are rate-limited.
- Every query is scoped to the signed-in user. The admin account is read-only: the server rejects writes from it.
- **Forgot password resets without verification.** Anyone who can reach the app can set a new password for any regular user, and doing so signs that user out everywhere. This is a deliberate trade-off for a LAN app, so by default it's only offered on the LAN, not through a Cloudflare tunnel (`SIGNUP_AND_RESET`). If you expose the app through any other kind of proxy, set `SIGNUP_AND_RESET=off` there. The admin password can only be changed through `ADMIN_PASSWORD`.
- Cookies use the `Secure` flag automatically when every allowed origin is `https://`.
