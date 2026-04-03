import crypto from 'node:crypto';

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
