# Zibal payment relay

A tiny PHP script that forwards Zibal payment API calls from a **fixed-IP host**.

## Why

Zibal only accepts API calls from IP addresses on the merchant's whitelist.
Azura is hosted on Vercel, whose egress IPs rotate, so Vercel cannot be
whitelisted. The relay sits on the relay host and makes the call from there, so
Zibal sees the relay's stable IP.

Without it, `createPayment` and `verifyPayment` are rejected by Zibal with
`result: 114` (invalid merchant) — which is what an un-whitelisted IP looks like.

## Contract

`lib/payment/zibal-provider.ts` calls:

```
POST {ZIBAL_RELAY_URL}/relay.php?ep=request|verify|inquiry
Content-Type: application/json
x-relay-secret: {ZIBAL_RELAY_SECRET}

{ the Zibal payload, unchanged }
```

`relay.php` returns Zibal's response verbatim, same status code.

## Setup

### 1. Point a hostname at the relay server

In Cloudflare (DNS only / grey cloud):

```
Type: A      Name: relay      Target: <the relay server IP>
```

Use a **dedicated hostname**, not a cPanel admin port. Ports like `:2083` serve
the cPanel login page and will not reach PHP scripts.

### 2. Generate a secret

```bash
openssl rand -hex 32
```

Keep it — you need the same value in cPanel and in Vercel.

### 3. Upload the script

Put `relay.php` in that hostname's web root via cPanel → File Manager, and set
the secret (either is fine):

- **Environment variable** `ZIBAL_RELAY_SECRET`, or
- a file named `.relay-secret` next to `relay.php` containing only the secret

Then set **PHP 8.1+** for that domain and confirm the server allows outbound
HTTPS to `gateway.zibal.ir`.

### 4. Verify before going live

A wrong setup returns 401, not a payment error — so test it first:

```bash
# 1. No secret -> must return 401 unauthorized
curl -i -X POST "https://relay.azuraai.ir/relay.php?ep=verify" \
  -H 'Content-Type: application/json' -d '{}'

# 2. Wrong secret -> must also return 401
curl -i -X POST "https://relay.azuraai.ir/relay.php?ep=verify" \
  -H 'Content-Type: application/json' -H 'x-relay-secret: nope' -d '{}'

# 3. Correct secret -> Zibal's own answer (e.g. 119 track id not found)
curl -i -X POST "https://relay.azuraai.ir/relay.php?ep=verify" \
  -H 'Content-Type: application/json' -H 'x-relay-secret: YOUR_SECRET' \
  -d '{"merchant":"YOUR_MERCHANT_ID","trackId":1}'
```

Only once step 3 returns a Zibal JSON body should you set the Vercel vars.

### 5. Point the app at it

On the **`azura-marketing`** Vercel project:

| Variable | Value |
|---|---|
| `ZIBAL_RELAY_URL` | `https://relay.azuraai.ir/relay.php` |
| `ZIBAL_RELAY_SECRET` | the secret from step 2 |

`ZIBAL_RELAY_URL` may also be the bare host (`https://relay.azuraai.ir`) — the
provider appends `/relay.php` itself.

Then redeploy so the new env vars are picked up.

## Zibal setup

In the Zibal merchant panel, whitelist the relay server's IP for API access.
Without that, the relay will be rejected just like Vercel is.

## Security notes

- The relay secret authorises anyone who holds it to create and verify payments
  as this merchant. Treat it like a password: never commit it, never paste it
  into chat, and rotate it if it leaks.
- The relay is intentionally a pass-through — it stores nothing and logs only
  failures.