import crypto from 'node:crypto';

interface BuildDnsChallengeDataOptions {
    identifierValue: string;
    identifierType?: string;
    wildcard?: boolean;
    token: string;
    keyAuthorization: string;
    zones?: string[];
}

interface DnsChallengeShape {
    identifier: { type: string; value: string };
    wildcard: boolean;
    token: string;
    keyAuthorization: string;
    dnsHost: string;
    dnsZone: string;
    dnsPrefix: string;
    dnsAuthorization: string;
    challenge: {
        token: string;
        keyAuthorization: string;
        identifier: { type: string; value: string };
        dnsHost: string;
        dnsZone: string;
        dnsPrefix: string;
        dnsAuthorization: string;
    };
}

/**
 * Normalize a DNS alias domain entered by the user.
 * Accepts optional leading _acme-challenge. and trailing dot.
 */
export function normalizeDnsAlias(alias?: string | null): string {
    if (!alias) {
        return '';
    }

    let normalized = alias.trim();
    normalized = normalized.replace(/^_acme-challenge\./i, '');
    normalized = normalized.replace(/\.$/, '');
    return normalized;
}

/**
 * Compute the DNS-01 TXT authorization value from keyAuthorization.
 */
export function computeDnsAuthorization(keyAuthorization: string): string {
    return crypto.createHash('sha256').update(keyAuthorization).digest('base64url');
}

/**
 * Pick the best DNS zone from provider-reported zones.
 * Chooses the longest matching suffix.
 */
export function pickBestDnsZone(dnsHost: string, zones: string[]): string | undefined {
    const candidates = zones
        .map(zone => zone.replace(/\.$/, '').trim())
        .filter(zone => zone && (dnsHost === zone || dnsHost.endsWith(`.${zone}`)));

    if (!candidates.length) {
        return undefined;
    }

    candidates.sort((a, b) => b.length - a.length);
    return candidates[0];
}

function deriveFallbackZone(identifierValue: string): string {
    const labels = identifierValue.split('.').filter(Boolean);
    if (labels.length >= 2) {
        return labels.slice(-2).join('.');
    }
    return identifierValue;
}

function deriveDnsPrefix(dnsHost: string, dnsZone: string): string {
    const suffix = `.${dnsZone}`;
    if (dnsHost === dnsZone) {
        return '_acme-challenge';
    }
    if (dnsHost.endsWith(suffix)) {
        return dnsHost.slice(0, -suffix.length);
    }
    return '_acme-challenge';
}

/**
 * Build a challenge payload compatible with acme-dns-01-* providers.
 */
export function buildDnsChallengeData(opts: BuildDnsChallengeDataOptions): DnsChallengeShape {
    const identifierValue = normalizeDnsAlias(opts.identifierValue);
    const dnsHost = `_acme-challenge.${identifierValue}`;
    const dnsZone = pickBestDnsZone(dnsHost, opts.zones || []) || deriveFallbackZone(identifierValue);
    const dnsPrefix = deriveDnsPrefix(dnsHost, dnsZone);
    const dnsAuthorization = computeDnsAuthorization(opts.keyAuthorization);

    return {
        identifier: {
            type: opts.identifierType || 'dns',
            value: identifierValue,
        },
        wildcard: !!opts.wildcard,
        token: opts.token,
        keyAuthorization: opts.keyAuthorization,
        dnsHost,
        dnsZone,
        dnsPrefix,
        dnsAuthorization,
        challenge: {
            token: opts.token,
            keyAuthorization: opts.keyAuthorization,
            identifier: {
                type: opts.identifierType || 'dns',
                value: identifierValue,
            },
            dnsHost,
            dnsZone,
            dnsPrefix,
            dnsAuthorization,
        },
    };
}
