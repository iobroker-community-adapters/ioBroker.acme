interface AcmeDnsConfig {
    username?: string;
    secret?: string;
    token?: string;
    baseUrl?: string;
    propagationDelay?: number;
}

interface AcmeDnsRegistrationResult {
    username: string;
    secret: string;
    token: string;
    fullDomain?: string;
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

function normalizeBaseUrl(baseUrl?: string): string {
    return (baseUrl || 'https://auth.acme-dns.io').replace(/\/+$/, '');
}

export async function registerAcmeDnsAccount(baseUrl?: string): Promise<AcmeDnsRegistrationResult> {
    const registerUrl = `${normalizeBaseUrl(baseUrl)}/register`;
    const response = await fetch(registerUrl, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({}),
    });

    if (!response.ok) {
        const body = await response.text();
        throw new Error(`acme-dns register failed (${response.status}): ${body.slice(0, 300)}`);
    }

    const payload: any = await response.json();
    const username = ensureString(payload?.username, 'register response username');
    const secret = ensureString(payload?.password, 'register response password');
    const token = ensureString(payload?.subdomain, 'register response subdomain');

    return {
        username,
        secret,
        token,
        fullDomain: typeof payload?.fulldomain === 'string' ? payload.fulldomain : undefined,
    };
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

        const baseUrl = normalizeBaseUrl(config.baseUrl);
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
