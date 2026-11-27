// Gera as chaves VAPID para notificações push.
// Uso: node scripts/vapid.mjs  → copie as linhas para .dev.vars ou `wrangler secret put`.
const { subtle } = globalThis.crypto;
const pair = await subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign"]);
const raw = new Uint8Array(await subtle.exportKey("raw", pair.publicKey));
const jwk = await subtle.exportKey("jwk", pair.privateKey);
const b64url = (b) => Buffer.from(b).toString("base64url");
console.log(`VAPID_PUBLIC_KEY=${b64url(raw)}`);
console.log(`VAPID_PRIVATE_KEY=${jwk.d}`);
