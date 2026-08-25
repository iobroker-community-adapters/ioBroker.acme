#!/usr/bin/env node
/*
 * Order a real certificate from Let's Encrypt *staging* over the adapter's own
 * code path: the compiled challenge shim from build/lib driving the configured
 * acme-dns-01-* plugin, exactly as src/main.ts does.
 *
 * This is the check CI cannot do. The adapter tests start the adapter but never
 * order anything, so nothing there ever asks the CA to validate a challenge --
 * which is how "request is not a function" reached main unnoticed.
 *
 * Nothing is written to ioBroker and nothing touches production: the account
 * and certificate live only in this process, against the staging CA.
 *
 * Usage:
 *   ACME_EMAIL=you@yourdomain.tld \
 *   ACME_DOMAIN=yourdomain.tld \
 *   ACME_DNS_MODULE=acme-dns-01-ionos \
 *   ACME_DNS_TOKEN=... \
 *   node scripts/staging-order.mjs
 *
 * Optional:
 *   ACME_WILDCARD=1              also order *.<domain>, the case that puts two
 *                                values on one _acme-challenge name
 *   ACME_DNS_BASEURL=...         deSEC / PowerDNS
 *   ACME_DNS_KEY / _SECRET / _APIKEY / _APIUSER / _APIPASSWORD /
 *   ACME_DNS_USERNAME / _CUSTOMERNUMBER / _CLIENTIP
 *   ACME_PROPAGATION_DELAY=120000
 *   ACME_KEEP=1                  skip challenge cleanup, to inspect the zone
 */

import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const acme = require('acme-client');
const { createChallengeShim, createRequestHelper } = require('../build/lib/greenlock-challenge-shim.js');

/** Providers implemented in this repository rather than pulled from npm. */
const LOCAL_MODULES = {
    'acme-dns-01-ionos': '../build/lib/dns-01-ionos.js',
    'acme-dns-01-hetzner': '../build/lib/dns-01-hetzner.js',
    'acme-dns-01-dynu': '../build/lib/dns-01-dynu.js',
};

const env = (name, fallback) => process.env[name] ?? fallback;
const required = name => {
    const value = process.env[name];
    if (!value) {
        console.error(`Missing ${name}. See the header of this file.`);
        process.exit(2);
    }
    return value;
};

const EMAIL = required('ACME_EMAIL');
const DOMAIN = required('ACME_DOMAIN');
const MODULE = required('ACME_DNS_MODULE');
const WILDCARD = !!env('ACME_WILDCARD');
const KEEP = !!env('ACME_KEEP');

// Mirrors how src/main.ts turns dns01O* config fields into plugin options.
const options = {};
for (const [suffix, key] of [
    ['TOKEN', 'token'],
    ['KEY', 'key'],
    ['SECRET', 'secret'],
    ['APIKEY', 'apiKey'],
    ['APIUSER', 'apiUser'],
    ['APIPASSWORD', 'apiPassword'],
    ['USERNAME', 'username'],
    ['CUSTOMERNUMBER', 'customerNumber'],
    ['CLIENTIP', 'clientIp'],
    ['BASEURL', 'baseUrl'],
]) {
    const value = process.env[`ACME_DNS_${suffix}`];
    if (value) {
        options[key] = value;
    }
}
options.log = message => console.log(`    [plugin] ${message}`);
if (MODULE === 'acme-dns-01-netcup') {
    options.verifyPropagation = true;
}

const domains = WILDCARD ? [DOMAIN, `*.${DOMAIN}`] : [DOMAIN];
const redacted = Object.keys(options).filter(k => k !== 'log' && k !== 'baseUrl');

console.log('Let\'s Encrypt STAGING order');
console.log(`  domains   ${domains.join(', ')}`);
console.log(`  module    ${MODULE}${LOCAL_MODULES[MODULE] ? ' (shipped with the adapter)' : ' (npm)'}`);
console.log(`  options   ${redacted.join(', ') || '(none)'} ${options.baseUrl ? `baseUrl=${options.baseUrl}` : ''}`);
console.log('');

const started = Date.now();
const elapsed = () => `${((Date.now() - started) / 1000).toFixed(1)}s`;

try {
    // ---- load the plugin exactly as the adapter does -----------------------
    const local = LOCAL_MODULES[MODULE];
    const loaded = local ? require(local) : require(MODULE);
    const plugin = (loaded.default ?? loaded).create(options);

    // src/main.ts copies dns01P* config onto the plugin object after create(),
    // which is where the generic 120s propagation wait comes from. Netcup and
    // eDNS poll their own nameservers and have that deleted, so they keep the
    // 0 they report themselves. Mirror both, or this tests something the
    // adapter never does.
    const SELF_POLLING = ['acme-dns-01-netcup', 'acme-dns-01-ednsde'];
    if (!SELF_POLLING.includes(MODULE)) {
        plugin.propagationDelay = Number(env('ACME_PROPAGATION_DELAY', 120000));
    }

    const shim = createChallengeShim(plugin, {
        log: message => console.log(`  [${elapsed()}] ${message}`),
        request: createRequestHelper(),
    });
    console.log(`  plugin loaded, propagationDelay=${shim.propagationDelay}ms skipChallengeTest=${shim.skipChallengeTest}`);

    // ---- account -----------------------------------------------------------
    acme.setLogger(message => process.env.ACME_DEBUG && console.log(`    [acme-client] ${message}`));
    const accountKey = await acme.crypto.createPrivateKey();
    const client = new acme.Client({
        directoryUrl: acme.directory.letsencrypt.staging,
        accountKey,
    });
    await client.createAccount({ termsOfServiceAgreed: true, contact: [`mailto:${EMAIL}`] });
    console.log(`  [${elapsed()}] account ${client.getAccountUrl()}`);

    // ---- CSR ---------------------------------------------------------------
    const [certKey, csr] = await acme.crypto.createCsr({
        commonName: domains[0],
        altNames: domains.slice(1),
    });

    // ---- order -------------------------------------------------------------
    console.log(`  [${elapsed()}] ordering; the CA will validate for real from here`);
    const certPem = await client.auto({
        csr,
        email: EMAIL,
        termsOfServiceAgreed: true,
        skipChallengeVerification: shim.skipChallengeTest,
        challengePriority: ['dns-01'],
        challengeCreateFn: (authz, challenge, keyAuthorization) =>
            shim.challengeCreateFn(authz, challenge, keyAuthorization),
        challengeRemoveFn: (authz, challenge, keyAuthorization) =>
            KEEP
                ? Promise.resolve(console.log(`  [${elapsed()}] ACME_KEEP set, leaving the record in place`))
                : shim.challengeRemoveFn(authz, challenge, keyAuthorization),
    });

    // ---- report ------------------------------------------------------------
    const chain = acme.crypto.splitPemChain(certPem);
    const info = await acme.crypto.readCertificateInfo(chain[0]);
    console.log('');
    console.log(`SUCCESS in ${elapsed()}`);
    console.log(`  subject     ${info.domains.commonName}`);
    console.log(`  altNames    ${info.domains.altNames.join(', ')}`);
    console.log(`  issuer      ${info.issuer.commonName}`);
    console.log(`  notAfter    ${info.notAfter.toISOString()}`);
    console.log(`  chain       ${chain.length} certificate(s)`);
    console.log(`  private key ${certKey.toString().split('\n')[0]}`);
    console.log('');
    console.log('The challenge was validated by the staging CA, so this provider works end to end.');
    process.exit(0);
} catch (err) {
    console.error('');
    console.error(`FAILED after ${elapsed()}: ${err.message}`);
    if (/is not a function/.test(err.message)) {
        console.error('  -> the plugin was handed something it did not expect; check the shim contract');
    }
    if (err.response?.data) {
        console.error(`  CA said: ${JSON.stringify(err.response.data)}`);
    }
    if (!KEEP) {
        console.error('  Re-run with ACME_KEEP=1 to leave the TXT record in place and inspect the zone.');
    }
    process.exit(1);
}
