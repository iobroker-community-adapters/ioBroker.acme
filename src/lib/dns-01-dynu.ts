/*
 * DNS-01 challenge handler for Dynu.
 *
 * There is no acme-dns-01-dynu package on npm, so this implements the same
 * Greenlock plugin contract the acme-dns-01-* modules use.
 *
 * API (https://www.dynu.com/Support/API):
 *
 *   auth    API-Key: <key>
 *   root    GET    /v2/dns/getroot/{fqdn}      -> {id, domainName, node}
 *   list    GET    /v2/dns/{domainId}/record   -> {dnsRecords:[{id,nodeName,recordType,textData}]}
 *   add     POST   /v2/dns/{domainId}/record
 *              {domainId, nodeName, recordType:"TXT", textData, state:true, ttl}
 *   delete  DELETE /v2/dns/{domainId}/record/{recordId}
 *
 * Note on authentication: acme.sh's dns_dynu.sh authenticates with an OAuth2
 * client id/secret and sends "Authorization: Bearer". Dynu's own v2
 * documentation uses the API-Key header instead, and sending Bearer is a
 * known source of 401s (caddy-dns/dynu#6), so API-Key is what is used here --
 * it is also the credential the Dynu control panel hands out.
 *
 * getroot returns both the registrable domain and the node (the part in
 * front of it), so no zone walking is needed.
 */

const DEFAULT_BASE_URL = 'https://api.dynu.com/v2';
/** Dynu's own examples use 90s for challenge records. */
const DEFAULT_TTL = 90;

export interface Dynu01Options {
    /** Dynu API key from the control panel */
    token: string;
    log?: (message: string) => void;
    ttl?: number;
    baseUrl?: string;
    fetch?: typeof fetch;
}

interface DynuRoot {
    id: number | string;
    domainName: string;
    node?: string;
}

interface DynuRecord {
    id: number | string;
    nodeName?: string;
    recordType?: string;
    textData?: string;
}

interface Challenge {
    dnsHost?: string;
    dnsAuthorization?: string;
    identifier?: { value: string };
    [extra: string]: unknown;
}

class Dynu01Challenge {
    private readonly token: string;
    private readonly baseUrl: string;
    private readonly ttl: number;
    private readonly log: (message: string) => void;
    private readonly doFetch: typeof fetch;
    private readonly rootByHost = new Map<string, DynuRoot>();

    constructor(options: Dynu01Options) {
        if (!options?.token) {
            throw new Error('Dynu DNS-01 needs an API key in the DNS-01 token field');
        }
        this.token = options.token;
        this.baseUrl = options.baseUrl || DEFAULT_BASE_URL;
        this.ttl = options.ttl || DEFAULT_TTL;
        this.log = options.log || ((): void => {});
        this.doFetch = options.fetch || fetch;
    }

    private async request<T>(method: string, path: string, body?: unknown): Promise<T | null> {
        const headers: Record<string, string> = {
            'API-Key': this.token,
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
                `Dynu ${method} ${path} failed: ${response.status} ${response.statusText} ${detail}`.trim(),
            );
        }

        const text = await response.text();
        return text ? (JSON.parse(text) as T) : null;
    }

    /** Dynu resolves the registrable domain and the node for us in one call. */
    private async resolveRoot(challenge: Challenge): Promise<DynuRoot> {
        const host = challenge.dnsHost || `_acme-challenge.${challenge.identifier?.value ?? ''}`;
        const cached = this.rootByHost.get(host);
        if (cached) {
            return cached;
        }

        const root = await this.request<DynuRoot>('GET', `/dns/getroot/${encodeURIComponent(host)}`);
        if (!root?.id || !root.domainName) {
            throw new Error(`No Dynu domain found for ${host}`);
        }
        this.rootByHost.set(host, root);
        return root;
    }

    /** The node is what sits in front of the registrable domain. */
    private nodeName(root: DynuRoot, dnsHost: string): string {
        if (root.node) {
            return root.node;
        }
        const host = dnsHost.toLowerCase();
        const domain = root.domainName.toLowerCase();
        return host.endsWith(`.${domain}`) ? host.slice(0, -(domain.length + 1)) : host;
    }

    private async records(root: DynuRoot): Promise<DynuRecord[]> {
        const result = await this.request<{ dnsRecords?: DynuRecord[] }>('GET', `/dns/${root.id}/record`);
        return result?.dnsRecords || [];
    }

    init(): Promise<null> {
        return Promise.resolve(null);
    }

    /** Registrable domains covering the given hosts. */
    async zones(data?: { dnsHosts?: string[] }): Promise<string[]> {
        const found = new Set<string>();
        for (const host of data?.dnsHosts || []) {
            try {
                found.add((await this.resolveRoot({ dnsHost: host })).domainName);
            } catch {
                // A host we cannot place is reported later, by set().
            }
        }
        return [...found];
    }

    async set(data: { challenge: Challenge }): Promise<null> {
        const { challenge } = data;
        const host = challenge.dnsHost!;
        const root = await this.resolveRoot(challenge);
        const node = this.nodeName(root, host);

        this.log(`adding TXT ${host} (node ${node}) in domain ${root.domainName}`);
        await this.request('POST', `/dns/${root.id}/record`, {
            domainId: root.id,
            nodeName: node,
            recordType: 'TXT',
            textData: challenge.dnsAuthorization,
            state: true,
            ttl: this.ttl,
        });
        return null;
    }

    async get(data: { challenge: Challenge }): Promise<{ dnsAuthorization: string } | null> {
        const { challenge } = data;
        const root = await this.resolveRoot(challenge);
        const node = this.nodeName(root, challenge.dnsHost!);

        const match = (await this.records(root)).find(
            r => r.recordType === 'TXT' && r.nodeName === node && r.textData === challenge.dnsAuthorization,
        );
        return match ? { dnsAuthorization: match.textData! } : null;
    }

    async remove(data: { challenge: Challenge }): Promise<null> {
        const { challenge } = data;
        const host = challenge.dnsHost!;
        const root = await this.resolveRoot(challenge);
        const node = this.nodeName(root, host);

        // A domain and its wildcard share one _acme-challenge node, so delete
        // only the record carrying this challenge's value.
        const doomed = (await this.records(root)).filter(
            r => r.recordType === 'TXT' && r.nodeName === node && r.textData === challenge.dnsAuthorization,
        );
        if (!doomed.length) {
            this.log(`no TXT ${host} with this value to remove`);
            return null;
        }

        for (const record of doomed) {
            this.log(`removing TXT ${host} (${record.id})`);
            await this.request('DELETE', `/dns/${root.id}/record/${record.id}`);
        }
        return null;
    }
}

/** Matches the acme-dns-01-* module convention. */
export function create(options: Dynu01Options): Dynu01Challenge {
    return new Dynu01Challenge(options);
}

export { Dynu01Challenge };
