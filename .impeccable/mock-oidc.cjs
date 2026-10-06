/* A faithful local OIDC provider used only to verify Feature 15 end to end: real HTTPS (a
 * self-signed localhost cert), real RS256 signatures, a real discovery document, a real code
 * round-trip with state + nonce + PKCE challenge storage. It exists so the sign-in slice can be
 * PROVEN without a Google client. The identity of the person is chosen with ?as=<n> on /authorize.
 * Usage: node .impeccable/mock-oidc.cjs <port> <key.pem> <cert.pem> */
const https = require('https');
const fs = require('fs');
const crypto = require('node:crypto');

const PORT = +(process.argv[2] || 9443);
const key = fs.readFileSync(process.argv[3] || '/tmp/arova-mock-key.pem');
const cert = fs.readFileSync(process.argv[4] || '/tmp/arova-mock-cert.pem');
const ISSUER = `https://localhost:${PORT}`;
const pub = crypto.createPublicKey(key);
const jwk = pub.export({ format: 'jwk' });
const KID = 'mock-1';

const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
const flows = new Map(); // code -> { nonce, sub, email, name }

function idToken(claims) {
  const head = b64({ alg: 'RS256', typ: 'JWT', kid: KID });
  const payload = b64(claims);
  const signer = crypto.createSign('RSA-SHA256');
  signer.update(`${head}.${payload}`, 'ascii');
  return `${head}.${payload}.${signer.sign(key).toString('base64url')}`;
}

const PEOPLE = {
  1: { sub: 'mock-user-1', email: 'owner@example.test', name: 'Mock Owner' },
  2: { sub: 'mock-user-2', email: 'person2@example.test', name: 'Mock Second' },
};

https.createServer({ key, cert }, (req, res) => {
  const url = new URL(req.url, `https://localhost:${PORT}`);
  const send = (code, body, headers = {}) => { res.writeHead(code, headers); res.end(body); };
  if (url.pathname === '/.well-known/openid-configuration') {
    return send(200, JSON.stringify({
      issuer: ISSUER,
      authorization_endpoint: `${ISSUER}/authorize`,
      token_endpoint: `${ISSUER}/token`,
      jwks_uri: `${ISSUER}/jwks`,
      response_types_supported: ['code'],
      code_challenge_methods_supported: ['S256'],
    }), { 'content-type': 'application/json' });
  }
  if (url.pathname === '/jwks') return send(200, JSON.stringify({ keys: [{ kty: jwk.kty, n: jwk.n, e: jwk.e, use: 'sig', alg: 'RS256', kid: KID }] }), { 'content-type': 'application/json' });
  if (url.pathname === '/authorize') {
    const redirect = url.searchParams.get('redirect_uri');
    const state = url.searchParams.get('state');
    const nonce = url.searchParams.get('nonce');
    const person = PEOPLE[url.searchParams.get('as')] || PEOPLE[1];
    const code = crypto.randomBytes(12).toString('base64url');
    flows.set(code, { nonce, person, clientId: url.searchParams.get('client_id') });
    const back = new URL(redirect);
    back.searchParams.set('code', code);
    if (state) back.searchParams.set('state', state);
    return send(302, '', { location: back.toString() });
  }
  if (url.pathname === '/token' && req.method === 'POST') {
    let body = '';
    req.on('data', d => body += d);
    req.on('end', () => {
      const form = new URLSearchParams(body);
      const grant = form.get('grant_type');
      const code = form.get('code');
      if (grant !== 'authorization_code' || !flows.has(code)) {
        return send(400, JSON.stringify({ error: 'invalid_grant', error_description: 'unknown code or grant' }), { 'content-type': 'application/json' });
      }
      const { nonce, person, clientId } = flows.get(code);
      flows.delete(code);
      const id_token = idToken({ iss: ISSUER, aud: clientId, sub: person.sub, email: person.email, name: person.name, nonce, exp: Math.floor(Date.now() / 1000) + 600, iat: Math.floor(Date.now() / 1000) });
      send(200, JSON.stringify({ access_token: 'mock-access', id_token, token_type: 'Bearer' }), { 'content-type': 'application/json' });
    });
    return;
  }
  send(404, 'not found');
}).listen(PORT, '127.0.0.1', () => console.log(`mock oidc on https://localhost:${PORT}`));
