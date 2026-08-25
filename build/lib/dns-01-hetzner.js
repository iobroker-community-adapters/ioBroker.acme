"use strict";
/*
 * DNS-01 challenge handler for Hetzner.
 *
 * There is no acme-dns-01-hetzner package on npm, so this implements the same
 * Greenlock plugin contract the acme-dns-01-* modules use.
 *
 * IMPORTANT: this targets the Hetzner *Cloud* DNS API. The older DNS Console
 * API at dns.hetzner.com/api/v1 -- which most Hetzner DNS-01 guides and
 * certbot-dns-hetzner still describe -- went read-only on 2026-05-20 and the
 * host now redirects to console.hetzner.com. Implementing against it would
 * ship dead code.
 *
 * API (https://docs.hetzner.cloud/), cross-checked against acme.sh's
 * dnsapi/dns_hetznercloud.sh:
 *
 *   auth    Authorization: Bearer <token>
 *   zone    GET  /v1/zones?name=<zone>                        -> {zones:[{id,name}]}
 *   read    GET  /v1/zones/{id}/rrsets/{name}/TXT
 *   add     POST /v1/zones/{id}/rrsets/{name}/TXT/actions/add_records
 *              {"ttl":<n>,"records":[{"value":"\"<txt>\""}]}
 *   remove  POST /v1/zones/{id}/rrsets/{name}/TXT/actions/remove_records
 *              {"records":[{"value":"\"<txt>\""}]}
 *
 * The record name is relative to the zone, or "@" when it is the zone apex.
 * TXT values are stored quoted, so the quotes are part of the payload.
 *
 * add_records/remove_records operate on individual values rather than
 * replacing the whole rrset, which is exactly what a domain and its wildcard
 * need: both put a value on one _acme-challenge name.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.Hetzner01Challenge = void 0;
exports.relativeName = relativeName;
exports.zoneCandidates = zoneCandidates;
exports.create = create;
const DEFAULT_BASE_URL = 'https://api.hetzner.cloud/v1';
const DEFAULT_TTL = 60;
/** The record name relative to its zone; "@" at the apex. */
function relativeName(dnsHost, zoneName) {
    const host = dnsHost.toLowerCase();
    const zone = zoneName.toLowerCase();
    if (host === zone) {
        return '@';
    }
    return host.endsWith(`.${zone}`) ? host.slice(0, -(zone.length + 1)) : host;
}
/** Every parent of a host, longest first: a.b.c -> [a.b.c, b.c, c] */
function zoneCandidates(host) {
    const labels = host.toLowerCase().split('.').filter(Boolean);
    const out = [];
    for (let i = 0; i < labels.length - 1; i++) {
        out.push(labels.slice(i).join('.'));
    }
    return out;
}
class Hetzner01Challenge {
    token;
    baseUrl;
    ttl;
    log;
    doFetch;
    zoneByHost = new Map();
    constructor(options) {
        if (!options?.token) {
            throw new Error('Hetzner DNS-01 needs a Hetzner Cloud API token in the DNS-01 token field');
        }
        this.token = options.token;
        this.baseUrl = options.baseUrl || DEFAULT_BASE_URL;
        this.ttl = options.ttl || DEFAULT_TTL;
        this.log = options.log || (() => { });
        this.doFetch = options.fetch || fetch;
    }
    async request(method, path, body, retried = false) {
        const headers = {
            Authorization: `Bearer ${this.token}`,
            Accept: 'application/json',
        };
        if (body !== undefined) {
            headers['Content-Type'] = 'application/json';
        }
        const response = await this.doFetch(`${this.baseUrl}${path}`, {
            method,
            headers,
            body: body === undefined ? undefined : JSON.stringify(body),
        });
        // The Cloud API rate limits per project; it tells us how long to wait.
        if (response.status === 429 && !retried) {
            // Retry-After may legitimately be 0, so do not treat it as absent.
            const header = response.headers?.get?.('Retry-After');
            const parsed = header ? Number(header) : NaN;
            const after = Number.isFinite(parsed) && parsed >= 0 ? parsed : 1;
            this.log(`rate limited, retrying in ${after}s`);
            await new Promise(resolve => setTimeout(resolve, after * 1000));
            return this.request(method, path, body, true);
        }
        if (!response.ok) {
            const detail = await response.text().catch(() => '');
            throw new Error(`Hetzner ${method} ${path} failed: ${response.status} ${response.statusText} ${detail}`.trim());
        }
        const text = await response.text();
        return text ? JSON.parse(text) : null;
    }
    /** Walk up the labels until the account has a zone by that name. */
    async resolveZone(challenge) {
        const host = challenge.dnsHost || `_acme-challenge.${challenge.identifier?.value ?? ''}`;
        const cached = this.zoneByHost.get(host);
        if (cached) {
            return cached;
        }
        // Whatever the caller already worked out is worth trying first.
        const candidates = challenge.dnsZone ? [challenge.dnsZone, ...zoneCandidates(host)] : zoneCandidates(host);
        for (const candidate of candidates) {
            const result = await this.request('GET', `/zones?name=${encodeURIComponent(candidate)}`);
            const zone = result?.zones?.find(z => z.name.toLowerCase() === candidate.toLowerCase());
            if (zone) {
                this.zoneByHost.set(host, zone);
                return zone;
            }
        }
        throw new Error(`No Hetzner Cloud zone found for ${host} (tried ${candidates.join(', ')})`);
    }
    rrsetPath(zone, dnsHost, suffix = '') {
        const name = encodeURIComponent(relativeName(dnsHost, zone.name));
        return `/zones/${zone.id}/rrsets/${name}/TXT${suffix}`;
    }
    init() {
        return Promise.resolve(null);
    }
    /** Zone names covering the given hosts, for the caller's dnsZone/dnsPrefix. */
    async zones(data) {
        const found = new Set();
        for (const host of data?.dnsHosts || []) {
            try {
                found.add((await this.resolveZone({ dnsHost: host })).name);
            }
            catch {
                // A host we cannot place is reported later, by set().
            }
        }
        return [...found];
    }
    async set(data) {
        const { challenge } = data;
        const host = challenge.dnsHost;
        const zone = await this.resolveZone(challenge);
        this.log(`adding TXT ${host} in zone ${zone.name}`);
        await this.request('POST', this.rrsetPath(zone, host, '/actions/add_records'), {
            ttl: this.ttl,
            records: [{ value: `"${challenge.dnsAuthorization}"` }],
        });
        return null;
    }
    async get(data) {
        const { challenge } = data;
        const host = challenge.dnsHost;
        const zone = await this.resolveZone(challenge);
        const wanted = `"${challenge.dnsAuthorization}"`;
        const result = await this.request('GET', this.rrsetPath(zone, host));
        const hit = result?.rrset?.records?.some(r => r.value === wanted);
        return hit ? { dnsAuthorization: challenge.dnsAuthorization } : null;
    }
    async remove(data) {
        const { challenge } = data;
        const host = challenge.dnsHost;
        const zone = await this.resolveZone(challenge);
        // remove_records subtracts just this value, leaving any parallel
        // wildcard challenge on the same name intact.
        this.log(`removing TXT ${host} in zone ${zone.name}`);
        await this.request('POST', this.rrsetPath(zone, host, '/actions/remove_records'), {
            records: [{ value: `"${challenge.dnsAuthorization}"` }],
        });
        return null;
    }
}
exports.Hetzner01Challenge = Hetzner01Challenge;
/** Matches the acme-dns-01-* module convention. */
function create(options) {
    return new Hetzner01Challenge(options);
}
