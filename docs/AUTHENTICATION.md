# Accounts & email verification 🔐📬

FlashQuest’s keeps the public featured deck easy to try while requiring a verified account before a user can create private decks.

## User journey

```text
Visitor
  │
  ├── Try featured Platform Engineering deck
  │
  └── Sign up
       │
       ▼
Unverified account
       │ verification email
       ▼
Verified account
       │
       ├── Sign in
       ├── Create private decks
       ├── Copy starter decks
       └── Keep per-user study progress
```

## Password storage

Passwords are never stored directly.

FlashQuest’s uses salted **PBKDF2-HMAC-SHA256** password hashes. Each password receives a random salt, a high iteration count, and constant-time digest comparison during login.

## Login sessions

The API returns a high-entropy opaque bearer token after a successful verified login.

Only a SHA-256 hash of that token is stored in PostgreSQL. Sessions have an expiration time and can be explicitly revoked on logout.

The V1 React client stores the bearer token in browser local storage so sessions survive navigation/reloads. For a higher-assurance production environment, an HttpOnly secure-cookie architecture would be a reasonable hardening step.

## Email verification

Verification links are also opaque random tokens.

The database stores only the token hash plus:

- user id;
- creation time;
- expiration time;
- one-time `used_at` state.

Creating a new verification link invalidates older unused links for that user.

The default expiration is **60 minutes** and is configurable with `VERIFICATION_TOKEN_MINUTES`.

## Email delivery

Two delivery modes are supported:

### Local / CI

```text
EMAIL_DELIVERY_MODE=console
```

The verification URL is printed to the API log. This is useful for local development and automated tests.

### Hosted

```text
EMAIL_DELIVERY_MODE=resend
RESEND_API_KEY=<secret>
EMAIL_FROM=FlashQuest <verified-sender@example.com>
FRONTEND_URL=https://flashcards-tobias.netlify.app
```

Hosted verification uses the Resend HTTP API. The API key must be stored as a deployment secret, never committed to the repository.

For Fly.io, a typical secret setup is:

```bash
fly secrets set \
  RESEND_API_KEY='...' \
  DEMO_DELETE_PASSWORD='...' \
  -a flashcards-tobias
```

Non-secret environment configuration such as `FRONTEND_URL` can live in deployment configuration.

## Demo protection

The featured Platform Engineering deck is public to study but protected from normal editing/deletion.

- Visitors cannot edit built-in cards.
- Signed-in users can copy the featured deck and edit their private copy.
- Built-in destructive operations require `DEMO_DELETE_PASSWORD` on the server.
- The demo password is entered only when the owner performs maintenance; it is not embedded in the frontend bundle.

## Privacy boundary

Public API calls expose built-in starter content only. Authenticated card/deck listing is scoped to:

1. built-in public decks; and
2. decks owned by the signed-in user.

A user cannot update or delete another user’s custom deck/cards through the normal API routes.

## Important production configuration

Before enabling public signup, configure:

```text
APP_ENV=production
FRONTEND_URL=https://flashcards-tobias.netlify.app
EMAIL_DELIVERY_MODE=resend
RESEND_API_KEY=<secret>
EMAIL_FROM=<verified sender>
DEMO_DELETE_PASSWORD=<strong secret>
```

!!! warning "Email delivery is a deployment dependency"
    If hosted email delivery is configured as `resend` without a valid API key, account creation may succeed but verification delivery will return a service error. The user can use **Resend verification** once the provider is configured.

[Build a custom deck →](MAKE_YOUR_OWN_DECK.md){ .md-button .md-button--primary }
[Operations & deployment →](OPERATIONS.md){ .md-button }
