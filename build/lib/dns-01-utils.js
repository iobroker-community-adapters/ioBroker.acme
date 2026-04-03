"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.normalizeDnsAlias = normalizeDnsAlias;
exports.computeDnsAuthorization = computeDnsAuthorization;
exports.pickBestDnsZone = pickBestDnsZone;
exports.buildDnsChallengeData = buildDnsChallengeData;
const node_crypto_1 = __importDefault(require("node:crypto"));
/**
 * Normalize a DNS alias domain entered by the user.
 * Accepts optional leading _acme-challenge. and trailing dot.
 */
function normalizeDnsAlias(alias) {
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
function computeDnsAuthorization(keyAuthorization) {
    return node_crypto_1.default.createHash('sha256').update(keyAuthorization).digest('base64url');
}
/**
 * Pick the best DNS zone from provider-reported zones.
 * Chooses the longest matching suffix.
 */
function pickBestDnsZone(dnsHost, zones) {
    const candidates = zones
        .map(zone => zone.replace(/\.$/, '').trim())
        .filter(zone => zone && (dnsHost === zone || dnsHost.endsWith(`.${zone}`)));
    if (!candidates.length) {
        return undefined;
    }
    candidates.sort((a, b) => b.length - a.length);
    return candidates[0];
}
function deriveFallbackZone(identifierValue) {
    const labels = identifierValue.split('.').filter(Boolean);
    if (labels.length >= 2) {
        return labels.slice(-2).join('.');
    }
    return identifierValue;
}
function deriveDnsPrefix(dnsHost, dnsZone) {
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
function buildDnsChallengeData(opts) {
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
