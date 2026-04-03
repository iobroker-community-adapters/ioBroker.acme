"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.normalizeDnsAlias = normalizeDnsAlias;
exports.computeDnsAuthorization = computeDnsAuthorization;
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
