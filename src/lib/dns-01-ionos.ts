/*
 * DNS-01 challenge handler for IONOS.
 *
 * There is no acme-dns-01-ionos package on npm, so this implements the same
 * Greenlock plugin contract the acme-dns-01-* modules use -- init/zones/set/
 * get/remove -- and is therefore driven by the same shim as everything else.
 *
 * API (https://developer.hosting.ionos.com/docs/dns), cross-checked against
 * acme.sh's dnsapi/dns_ionos.sh:
 *
 *   auth    X-API-Key: <publicprefix>.<secret>
 *   zones   GET    /v1/zones                                  -> [{id, name, type}]
 *   records GET    /v1/zones/{id}?recordName=&recordType=TXT  -> {records: [...]}
 *   create  POST   /v1/zones/{id}/records   [{name,type,content,ttl,prio,disabled}] -> 201
 *   delete  DELETE /v1/zones/{id}/records/{recordId}          -> 200
 *
 * IONOS stores TXT content with literal surrounding quotes, so values are
 * unquoted before comparison.
 */

const DEFAULT_BASE_URL = 'https://api.hosting.ionos.com/dns';
/** 60 s is the minimum the API accepts. */
const DEFAULT_TTL = 60;
const RECORD_PRIO = 10;

export interface Ionos01Options {
    /** The IONOS API key: publicprefix.secret */
    token: string;
    /** Optional progress sink */
    log?: (message: string) => void;
    /** Record TTL in seconds, minimum 60 */
    ttl?: number;
    /** Overridable for testing */
    baseUrl?: string;
    /** Overridable for testing */
    fetch?: typeof fetch;
}

interface IonosZone {
    id: string;
    name: string;
    type?: string;
}

interface IonosRecord {
    id: string;
    name: string;
    type: string;
    content: string;
    ttl?: number;
}

interface Challenge {
    dnsHost?: string;
    dnsAuthorization?: string;
    dnsZone?: string;
    identifier?: { value: string };
    [extra: string]: unknown;
}

/** IONOS returns TXT content wrapped in literal quotes; strip them for comparison. */
function unquote(value: string): string {
    return value.replace(/^"(.*)"$/s, '$1');
}

/** Longest zone that is a suffix of the host, matching on label boundaries. */
function findZone(zones: IonosZone[], host: string): IonosZone | undefined {
    return zones
        .filter(z => host === z.name || host.endsWith(`.${z.name}`))
        .sort((a, b) => b.name.length - a.name.length)[0];
}

class Ionos01Challenge {
    private readonly token: string;
    private readonly baseUrl: string;
    private readonly ttl: number;
    private readonly log: (message: string) => void;
    private readonly doFetch: typeof fetch;
    private zoneCache: IonosZone[] | null = null;

    constructor(options: Ionos01Options) {
        if (!options?.token || !options.token.includes('.')) {
            throw new Error(
                'IONOS DNS-01 needs an API key of the form "publicprefix.secret" in the DNS-01 token field',
            );
        }
        this.token = options.token;
        this.baseUrl = options.baseUrl || DEFAULT_BASE_URL;
        this.ttl = Math.max(options.ttl || DEFAULT_TTL, DEFAULT_TTL);
        this.log = options.log || ((): void => {});
        this.doFetch = options.fetch || fetch;
    }

    private async request<T>(method: string, path: string, body?: unknown): Promise<T | null> {
        const headers: Record<string, string> = {
            'X-API-Key': this.token,
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

        if (!response.ok) {
            const detail = await response.text().catch(() => '');
            throw new Error(
                `IONOS ${method} ${path} failed: ${response.status} ${response.statusText} ${detail}`.trim(),
            );
        }

        const text = await response.text();
        return text ? (JSON.parse(text) as T) : null;
    }

    private async getZones(): Promise<IonosZone[]> {
        this.zoneCache ??= (await this.request<IonosZone[]>('GET', '/v1/zones')) || [];
        return this.zoneCache;
    }

    /** Resolve the zone for a challenge, preferring what the caller already worked out. */
    private async resolveZone(challenge: Challenge): Promise<IonosZone> {
        const host = challenge.dnsHost || `_acme-challenge.${challenge.identifier?.value ?? ''}`;
        const zones = await this.getZones();

        const zone = challenge.dnsZone
            ? zones.find(z => z.name === challenge.dnsZone) || findZone(zones, host)
            : findZone(zones, host);

        if (!zone) {
            throw new Error(
                `No IONOS zone found for ${host}. Zones on this account: ${zones.map(z => z.name).join(', ') || '(none)'}`,
            );
        }
        return zone;
    }

    private async findRecords(zone: IonosZone, host: string): Promise<IonosRecord[]> {
        const query = `?recordName=${encodeURIComponent(host)}&recordType=TXT`;
        const detail = await this.request<{ records?: IonosRecord[] }>('GET', `/v1/zones/${zone.id}${query}`);
        return detail?.records || [];
    }

    /** Part of the plugin contract; nothing to prepare. */
    init(): Promise<null> {
        return Promise.resolve(null);
    }

    /** Zone names on this account, used by the caller to work out dnsZone/dnsPrefix. */
    async zones(): Promise<string[]> {
        return (await this.getZones()).map(z => z.name);
    }

    async set(data: { challenge: Challenge }): Promise<null> {
        const { challenge } = data;
        const host = challenge.dnsHost!;
        const value = challenge.dnsAuthorization!;
        const zone = await this.resolveZone(challenge);

        this.log(`adding TXT ${host} in zone ${zone.name}`);
        await this.request('POST', `/v1/zones/${zone.id}/records`, [
            {
                name: host,
                type: 'TXT',
                content: value,
                ttl: this.ttl,
                prio: RECORD_PRIO,
                disabled: false,
            },
        ]);
        return null;
    }

    async get(data: { challenge: Challenge }): Promise<{ dnsAuthorization: string } | null> {
        const { challenge } = data;
        const host = challenge.dnsHost!;
        const zone = await this.resolveZone(challenge);
        const wanted = challenge.dnsAuthorization;

        const match = (await this.findRecords(zone, host)).find(r => unquote(r.content) === wanted);
        return match ? { dnsAuthorization: unquote(match.content) } : null;
    }

    async remove(data: { challenge: Challenge }): Promise<null> {
        const { challenge } = data;
        const host = challenge.dnsHost!;
        const value = challenge.dnsAuthorization;
        const zone = await this.resolveZone(challenge);

        // A domain and its wildcard share one _acme-challenge name, so remove
        // only the record carrying this challenge's value.
        const records = (await this.findRecords(zone, host)).filter(r => unquote(r.content) === value);
        if (!records.length) {
            this.log(`no TXT ${host} with this value to remove`);
            return null;
        }

        for (const record of records) {
            this.log(`removing TXT ${host} (${record.id})`);
            await this.request('DELETE', `/v1/zones/${zone.id}/records/${record.id}`);
        }
        return null;
    }
}

/** Matches the acme-dns-01-* module convention. */
export function create(options: Ionos01Options): Ionos01Challenge {
    return new Ionos01Challenge(options);
}

export { Ionos01Challenge, unquote, findZone };
