"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
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
        const baseUrl = (config.baseUrl || 'https://auth.acme-dns.io').replace(/\/+$/, '');
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
