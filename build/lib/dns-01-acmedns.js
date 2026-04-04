"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerAcmeDnsAccount = registerAcmeDnsAccount;
exports.create = create;
function ensureString(value, name) {
    if (typeof value !== 'string' || !value.trim()) {
        throw new Error(`acme-dns: ${name} must be configured`);
    }
    return value.trim();
}
function getDnsAuthorization(data) {
    const value = data.challenge?.dnsAuthorization || data.dnsAuthorization;
    if (!value) {
        throw new Error('acme-dns: dnsAuthorization is missing in challenge data');
    }
    return value;
}
function normalizeBaseUrl(baseUrl) {
    return (baseUrl || 'https://auth.acme-dns.io').replace(/\/+$/, '');
}
async function registerAcmeDnsAccount(baseUrl) {
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
    const payload = await response.json();
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
    propagationDelay;
    apiUser;
    apiKey;
    subdomain;
    updateUrl;
    constructor(config = {}) {
        this.apiUser = ensureString(config.username, 'username');
        this.apiKey = ensureString(config.secret, 'secret');
        this.subdomain = ensureString(config.token, 'token (subdomain)');
        const baseUrl = normalizeBaseUrl(config.baseUrl);
        this.updateUrl = `${baseUrl}/update`;
        this.propagationDelay = config.propagationDelay || 30_000;
    }
    init() {
        return Promise.resolve(null);
    }
    shutdown() {
        return Promise.resolve();
    }
    zones() {
        return Promise.resolve([]);
    }
    async updateTxt(txt) {
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
    async set(data) {
        await this.updateTxt(getDnsAuthorization(data));
        return null;
    }
    async remove(_) {
        await this.updateTxt('');
        return null;
    }
    get(data) {
        return Promise.resolve({ dnsAuthorization: getDnsAuthorization(data) });
    }
}
function create(config = {}) {
    return new AcmeDnsChallenge(config);
}
