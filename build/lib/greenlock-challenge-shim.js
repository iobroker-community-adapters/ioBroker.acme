"use strict";
/*
 * Bridges the Greenlock / ACME.js challenge contract to acme-client.
 *
 * The twelve acme-dns-01-* plugins and our own http-01 challenge server are all
 * written against the ACME.js contract:
 *
 *   init(opts), zones({dnsHosts}), set({challenge}), get({challenge}), remove({challenge})
 *   + propagationDelay / skipChallengeTest properties
 *
 * acme-client instead expects two callbacks:
 *
 *   challengeCreateFn(authz, challenge, keyAuthorization)
 *   challengeRemoveFn(authz, challenge, keyAuthorization)
 *
 * Bridging the signatures is trivial; the actual work is that the plugins do
 * not agree on which fields they read off the challenge object -- cloudflare
 * wants dnsAuthorization/dnsPrefix/dnsZone, netcup wants dnsHost/identifier/sub
 * -- so the whole Greenlock challenge has to be synthesised, zone resolution
 * included. The zone matching below reproduces ACME.js' pluckZone semantics.
 *
 * For dns-01, acme-client's keyAuthorization is already
 * base64url(sha256(token + '.' + thumbprint)) -- byte-identical to what
 * Greenlock calls dnsAuthorization -- so no hashing happens here.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.pluckZone = pluckZone;
exports.createChallengeShim = createChallengeShim;
const DNS_PREFIX = '_acme-challenge';
/** Matches example.com and foo.example.com, but not fooexample.com. */
function zoneRegExp(zonename) {
    return new RegExp(`(^|\\.)${zonename.replace(/\./g, '\\.')}$`);
}
/** ACME.js pluckZone: of all zones covering this host, the longest one wins. */
function pluckZone(zonenames, dnsHost) {
    return zonenames.filter(z => zoneRegExp(z).test(dnsHost)).sort((a, b) => b.length - a.length)[0];
}
/**
 * Wrap a Greenlock-style challenge plugin so acme-client can drive it.
 *
 * @param plugin the acme-dns-01-* plugin instance, or our http-01 challenge server
 * @param options shim options
 * @param options.log sink for progress messages
 * @param options.propagationDelay overrides the delay the plugin reports
 */
function createChallengeShim(plugin, options = {}) {
    const log = options.log || (() => { });
    // acme-client offers nowhere to keep state between create and remove, so we
    // hold on to the exact object handed to set() and give that same object
    // back to remove(). Plugins mutate it -- cloudflare sets challenge.removed
    // -- and rely on seeing their own object again.
    const pending = new Map();
    let zonesPromise = null;
    let initPromise = null;
    const keyOf = (authz, challenge) => `${authz.identifier.value}|${challenge.token}`;
    function ensureInit() {
        if (!initPromise) {
            // Greenlock passed a `request` helper here. Modern plugins use fetch
            // and ignore it, but init() must still run: cloudflare builds its
            // API client in it, and our http-01 server starts listening.
            initPromise = Promise.resolve(plugin.init ? plugin.init({ request: null }) : undefined);
        }
        return initPromise;
    }
    function ensureZones(dnsHosts) {
        if (!zonesPromise) {
            zonesPromise = Promise.resolve(plugin.zones ? plugin.zones({ dnsHosts }) : []).catch((err) => {
                // Not every plugin implements zones(); those resolve the
                // zone internally from dnsHost instead.
                log(`zones() unavailable (${err.message}) - continuing without zone resolution`);
                return [];
            });
        }
        return zonesPromise;
    }
    async function buildChallenge(authz, challenge, keyAuthorization) {
        // Wildcard identifiers arrive from the CA as the base domain plus a flag.
        const hostname = authz.identifier.value;
        const wildcard = !!authz.wildcard;
        const ch = {
            type: challenge.type,
            identifier: { type: 'dns', value: hostname },
            wildcard,
            altname: wildcard ? `*.${hostname}` : hostname,
            token: challenge.token,
            url: challenge.url,
            status: challenge.status,
            keyAuthorization,
        };
        if (challenge.type !== 'dns-01') {
            // http-01 only needs token + keyAuthorization, both already set.
            return ch;
        }
        const dnsHost = `${DNS_PREFIX}.${hostname}`;
        ch.dnsHost = dnsHost;
        // For dns-01 acme-client hands us the digest, which is exactly what
        // Greenlock calls dnsAuthorization.
        ch.dnsAuthorization = keyAuthorization;
        ch.keyAuthorizationDigest = keyAuthorization;
        const dnsZone = pluckZone(await ensureZones([dnsHost]), dnsHost);
        if (dnsZone) {
            ch.dnsZone = dnsZone;
            ch.dnsPrefix = dnsHost.replace(zoneRegExp(dnsZone), '').replace(/\.$/, '');
            ch.sub = ch.dnsPrefix;
        }
        return ch;
    }
    return {
        get propagationDelay() {
            if (typeof options.propagationDelay === 'number') {
                return options.propagationDelay;
            }
            return typeof plugin.propagationDelay === 'number' ? plugin.propagationDelay : 0;
        },
        get skipChallengeTest() {
            return !!plugin.skipChallengeTest;
        },
        async challengeCreateFn(authz, challenge, keyAuthorization) {
            await ensureInit();
            const ch = await buildChallenge(authz, challenge, keyAuthorization);
            pending.set(keyOf(authz, challenge), ch);
            log(`${challenge.type}: set ${ch.dnsHost || ch.altname}${ch.dnsZone ? ` (zone ${ch.dnsZone})` : ''}`);
            await plugin.set({ challenge: ch });
            // acme-client verifies the challenge immediately after this callback
            // returns, so the propagation wait has to happen here. Plugins that
            // poll their own nameservers report 0 and are not delayed.
            const delay = this.propagationDelay;
            if (delay > 0) {
                log(`${challenge.type}: waiting ${Math.round(delay / 1000)}s for propagation`);
                await new Promise(resolve => setTimeout(resolve, delay));
            }
        },
        async challengeRemoveFn(authz, challenge, keyAuthorization) {
            await ensureInit();
            const k = keyOf(authz, challenge);
            const ch = pending.get(k) || (await buildChallenge(authz, challenge, keyAuthorization));
            pending.delete(k);
            log(`${challenge.type}: remove ${ch.dnsHost || ch.altname}`);
            await plugin.remove({ challenge: ch });
        },
    };
}
