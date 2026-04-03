interface AcmeDnsConfig {
    username?: string;
    secret?: string;
    token?: string;
    baseUrl?: string;
    propagationDelay?: number;
}

interface AcmeDnsChallengeData {
    challenge?: {
        dnsAuthorization?: string;
    };
    dnsAuthorization?: string;
}

function ensureString(value: unknown, name: string): string {
    if (typeof value !== 'string' || !value.trim()) {
        throw new Error(`acme-dns: ${name} must be configured`);
    }
    return value.trim();
}

function getDnsAuthorization(data: AcmeDnsChallengeData): string {
    const value = data.challenge?.dnsAuthorization || data.dnsAuthorization;
    if (!value) {
        throw new Error('acme-dns: dnsAuthorization is missing in challenge data');
    }
    return value;
}

class AcmeDnsChallenge {
    public propagationDelay: number;
    private readonly apiUser: string;
    private readonly apiKey: string;
    private readonly subdomain: string;
    private readonly updateUrl: string;

    constructor(config: AcmeDnsConfig = {}) {
        this.apiUser = ensureString(config.username, 'username');
        this.apiKey = ensureString(config.secret, 'secret');
        this.subdomain = ensureString(config.token, 'token (subdomain)');

        const baseUrl = (config.baseUrl || 'https://auth.acme-dns.io').replace(/\/+$/, '');
        this.updateUrl = `${baseUrl}/update`;
        this.propagationDelay = config.propagationDelay || 30_000;
    }

    init(): Promise<null> {
        return Promise.resolve(null);
    }

    shutdown(): Promise<void> {
        return Promise.resolve();
    }

    zones(): Promise<string[]> {
        return Promise.resolve([]);
    }

    private async updateTxt(txt: string): Promise<void> {
        const response = await fetch(this.updateUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Api-User': this.apiUser,
                'X-Api-Key': this.apiKey,
            },
            body: JSON.stringify({
                subdomain: this.subdomain,
                txt,
            }),
        });

        if (!response.ok) {
            const body = await response.text();
            throw new Error(`acme-dns update failed (${response.status}): ${body.slice(0, 300)}`);
        }
    }

    async set(data: AcmeDnsChallengeData): Promise<null> {
        await this.updateTxt(getDnsAuthorization(data));
        return null;
    }

    async remove(_: AcmeDnsChallengeData): Promise<null> {
        await this.updateTxt('');
        return null;
    }

    get(data: AcmeDnsChallengeData): Promise<{ dnsAuthorization: string } | null> {
        return Promise.resolve({ dnsAuthorization: getDnsAuthorization(data) });
    }
}

export function create(config: AcmeDnsConfig = {}): AcmeDnsChallenge {
    return new AcmeDnsChallenge(config);
}
