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

import type { Authorization, Challenge } from 'acme-client/types/rfc8555';

const DNS_PREFIX = '_acme-challenge';

/** Matches example.com and foo.example.com, but not fooexample.com. */
function zoneRegExp(zonename: string): RegExp {
    return new RegExp(`(^|\\.)${zonename.replace(/\./g, '\\.')}$`);
}

/** ACME.js pluckZone: of all zones covering this host, the longest one wins. */
export function pluckZone(zonenames: string[], dnsHost: string): string | undefined {
    return zonenames.filter(z => zoneRegExp(z).test(dnsHost)).sort((a, b) => b.length - a.length)[0];
}

/** The subset of the Greenlock plugin contract we rely on. */
export interface GreenlockPlugin {
    init?: (opts: Record<string, unknown>) => unknown;
    zones?: (opts: { dnsHosts: string[] }) => Promise<string[]> | string[];
    set: (data: { challenge: GreenlockChallenge }) => unknown;
    get?: (data: { challenge: GreenlockChallenge }) => unknown;
    remove: (data: { challenge: GreenlockChallenge }) => unknown;
    propagationDelay?: number;
    skipChallengeTest?: boolean;
}

/** The challenge object shape the plugins expect to be handed. */
export interface GreenlockChallenge {
    type: string;
    identifier: { type: string; value: string };
    wildcard: boolean;
    altname: string;
    token: string;
    url?: string;
    status?: string;
    keyAuthorization: string;
    dnsHost?: string;
    dnsAuthorization?: string;
    keyAuthorizationDigest?: string;
    dnsZone?: string;
    dnsPrefix?: string;
    sub?: string;
    [extra: string]: unknown;
}

export interface ChallengeShim {
    challengeCreateFn: (authz: Authorization, challenge: Challenge, keyAuthorization: string) => Promise<void>;
    challengeRemoveFn: (authz: Authorization, challenge: Challenge, keyAuthorization: string) => Promise<void>;
    readonly propagationDelay: number;
    readonly skipChallengeTest: boolean;
}

/**
 * Wrap a Greenlock-style challenge plugin so acme-client can drive it.
 *
 * @param plugin the acme-dns-01-* plugin instance, or our http-01 challenge server
 * @param options shim options
 * @param options.log sink for progress messages
 * @param options.propagationDelay overrides the delay the plugin reports
 */
export function createChallengeShim(
    plugin: GreenlockPlugin,
    options: { log?: (message: string) => void; propagationDelay?: number } = {},
): ChallengeShim {
    const log = options.log || ((): void => {});
    // acme-client offers nowhere to keep state between create and remove, so we
    // hold on to the exact object handed to set() and give that same object
    // back to remove(). Plugins mutate it -- cloudflare sets challenge.removed
    // -- and rely on seeing their own object again.
    const pending = new Map<string, GreenlockChallenge>();
    let zonesPromise: Promise<string[]> | null = null;
    let initPromise: Promise<unknown> | null = null;

    const keyOf = (authz: Authorization, challenge: Challenge): string =>
        `${authz.identifier.value}|${challenge.token}`;

    function ensureInit(): Promise<unknown> {
        if (!initPromise) {
            // Greenlock passed a `request` helper here. Modern plugins use fetch
            // and ignore it, but init() must still run: cloudflare builds its
            // API client in it, and our http-01 server starts listening.
            initPromise = Promise.resolve(plugin.init ? plugin.init({ request: null }) : undefined);
        }
        return initPromise;
    }

    function ensureZones(dnsHosts: string[]): Promise<string[]> {
        if (!zonesPromise) {
            zonesPromise = Promise.resolve(plugin.zones ? plugin.zones({ dnsHosts }) : []).catch(
                (err: Error): string[] => {
                    // Not every plugin implements zones(); those resolve the
                    // zone internally from dnsHost instead.
                    log(`zones() unavailable (${err.message}) - continuing without zone resolution`);
                    return [];
                },
            );
        }
        return zonesPromise;
    }

    async function buildChallenge(
        authz: Authorization,
        challenge: Challenge,
        keyAuthorization: string,
    ): Promise<GreenlockChallenge> {
        // Wildcard identifiers arrive from the CA as the base domain plus a flag.
        const hostname = authz.identifier.value;
        const wildcard = !!(authz as Authorization & { wildcard?: boolean }).wildcard;

        const ch: GreenlockChallenge = {
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
        get propagationDelay(): number {
            if (typeof options.propagationDelay === 'number') {
                return options.propagationDelay;
            }
            return typeof plugin.propagationDelay === 'number' ? plugin.propagationDelay : 0;
        },

        get skipChallengeTest(): boolean {
            return !!plugin.skipChallengeTest;
        },

        async challengeCreateFn(authz: Authorization, challenge: Challenge, keyAuthorization: string): Promise<void> {
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

        async challengeRemoveFn(authz: Authorization, challenge: Challenge, keyAuthorization: string): Promise<void> {
            await ensureInit();
            const k = keyOf(authz, challenge);
            const ch = pending.get(k) || (await buildChallenge(authz, challenge, keyAuthorization));
            pending.delete(k);
            log(`${challenge.type}: remove ${ch.dnsHost || ch.altname}`);
            await plugin.remove({ challenge: ch });
        },
    };
}
