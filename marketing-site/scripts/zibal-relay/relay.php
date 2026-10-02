<?php
declare(strict_types=1);

/**
 * Zibal payment relay.
 *
 * Why this exists
 * ---------------
 * Zibal only accepts API calls from IP addresses on a merchant's whitelist.
 * Azura runs on Vercel, whose egress IPs rotate constantly, so they cannot be
 * whitelisted. This script lives on a fixed-IP host and forwards requests to
 * Zibal from there — Zibal sees the relay's stable IP instead.
 *
 * Contract with the caller (lib/payment/zibal-provider.ts)
 * -------------------------------------------------------
 *   POST  {ZIBAL_RELAY_URL}/relay.php?ep=request|verify|inquiry
 *   Header: Content-Type: application/json
 *   Header: x-relay-secret: {ZIBAL_RELAY_SECRET}
 *   Body:   the Zibal JSON payload, passed through untouched
 *   Result: Zibal's JSON response, returned untouched (same status code)
 *
 * Configuration — set these in cPanel → Environment Variables, or edit the
 * constants below if you prefer to hardcode them:
 *
 *   ZIBAL_RELAY_SECRET  a long random string; must match ZIBAL_RELAY_SECRET
 *                       on Vercel. Anyone holding it can create and verify
 *                       payments as this merchant.
 *   ZIBAL_API_BASE      optional, defaults to https://gateway.zibal.ir/v1
 *
 * Deploy to the web root of a hostname whose DNS A record points at this
 * server, served over plain HTTPS on port 443. Do NOT point it at a cPanel
 * admin port such as :2083 — those serve a login page, not this script.
 */

const ZIBAL_DEFAULT_BASE = 'https://gateway.zibal.ir/v1';

/** Only these endpoints may be proxied. Nothing else is ever forwarded. */
const ALLOWED_ENDPOINTS = ['request', 'verify', 'inquiry'];

/** Respond in the shape callers (and Zibal's own client) expect. */
function respond(int $status, array $body): never
{
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    // Payment responses are per-request; never let a proxy cache them.
    header('Cache-Control: no-store');
    echo json_encode($body, JSON_UNESCAPED_UNICODE);
    exit;
}

/** Constant-time comparison so the secret can't be probed byte by byte. */
function secretMatches(string $provided, string $expected): bool
{
    return hash_equals($expected, $provided);
}

$envSecret = getenv('ZIBAL_RELAY_SECRET') ?: '';
// Fall back to a sibling secret file so the secret never lives in the script.
if ($envSecret === '') {
    $secretFile = __DIR__ . '/.relay-secret';
    $envSecret = is_readable($secretFile) ? trim((string) file_get_contents($secretFile)) : '';
}

if ($envSecret === '') {
    respond(500, ['result' => -1, 'message' => 'relay_not_configured']);
}

$providedSecret = $_SERVER['HTTP_X_RELAY_SECRET'] ?? '';
if ($providedSecret === '' || !secretMatches($providedSecret, $envSecret)) {
    // Deliberately vague: don't reveal whether the secret or the format was
    // wrong. Log the real reason server-side.
    error_log('[zibal-relay] rejected request: missing or invalid x-relay-secret');
    respond(401, ['result' => -1, 'message' => 'unauthorized']);
}

$endpoint = (string) ($_GET['ep'] ?? '');
if (!in_array($endpoint, ALLOWED_ENDPOINTS, true)) {
    respond(400, ['result' => -1, 'message' => 'unknown_endpoint']);
}

if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') {
    respond(405, ['result' => -1, 'message' => 'method_not_allowed']);
}

$rawBody = file_get_contents('php://input');
if ($rawBody === false || trim($rawBody) === '') {
    respond(400, ['result' => -1, 'message' => 'empty_body']);
}

// Reject malformed JSON before spending an outbound call on it.
$decoded = json_decode($rawBody, true);
if (!is_array($decoded)) {
    respond(400, ['result' => -1, 'message' => 'invalid_json']);
}

$base = rtrim(getenv('ZIBAL_API_BASE') ?: ZIBAL_DEFAULT_BASE, '/');
$target = $base . '/' . $endpoint;

/**
 * Forward the request with a bounded timeout. Payments are interactive, so a
 * long hang blocks the user's browser — 20s is the ceiling.
 */
$ch = curl_init($target);
curl_setopt_array($ch, [
    CURLOPT_POST           => true,
    CURLOPT_POSTFIELDS     => $rawBody,
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_TIMEOUT        => 20,
    CURLOPT_CONNECTTIMEOUT => 8,
    CURLOPT_FOLLOWLOCATION => false,
    CURLOPT_HTTPHEADER     => [
        'Content-Type: application/json',
        'Accept: application/json',
    ],
]);

$responseBody = curl_exec($ch);
$status       = (int) curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
$curlErr      = curl_error($ch);
curl_close($ch);

if ($responseBody === false) {
    error_log("[zibal-relay] curl failure on {$endpoint}: {$curlErr}");
    respond(502, ['result' => -1, 'message' => 'upstream_unreachable']);
}

// Pass Zibal's own status and body through untouched — the caller maps
// result codes (100 paid, 201 already verified, 202 unpaid, …).
http_response_code($status > 0 ? $status : 502);
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
echo $responseBody;