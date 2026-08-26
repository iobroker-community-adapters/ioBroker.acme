"use strict";
/*
 * Publishes HTTP-01 challenge tokens through the ioBroker states DB instead of
 * serving them from an own listener.
 *
 * The alternative -- see http-01-challenge-server.ts -- is to bind the port the
 * CA will connect to, which on a single public IP is port 80 and therefore
 * usually already taken by web or admin. The adapter used to stop those for the
 * duration of the order, which costs a short outage and risks leaving them
 * stopped if anything in between throws (issue #85).
 *
 * Instead the tokens are written to a state that any long-running webserver can
 * read while serving /.well-known/acme-challenge itself. @iobroker/webserver
 * does that lookup; nothing has to be stopped, nothing needs a free port, and
 * it keeps working when the webserver runs on a different host of a multihost
 * installation -- which an HTTP proxy to a loopback port could not.
 *
 * The state is the whole contract between the two sides, so it is spelled out
 * here rather than inline: id, token charset and value shape below are what a
 * reader has to implement.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.HTTP01_TOKEN_REGEX = exports.HTTP01_CHALLENGE_PATTERN = exports.HTTP01_CHALLENGE_STATE = void 0;
exports.create = create;
exports.probeHost = probeHost;
exports.probeHttp01Endpoint = probeHttp01Endpoint;
const node_crypto_1 = require("node:crypto");
/** State holding the currently valid tokens, relative to the acme instance. */
exports.HTTP01_CHALLENGE_STATE = 'info.httpChallenges';
/**
 * What a reader reads. The instance number is not fixed, and more than one acme
 * instance may be ordering at the same time, so every match has to be consulted.
 */
exports.HTTP01_CHALLENGE_PATTERN = `acme.*.${exports.HTTP01_CHALLENGE_STATE}`;
/**
 * RFC 8555 tokens are base64url, so a reader can reject anything else before it
 * ever reaches a lookup. Let's Encrypt currently issues 43 characters; the
 * range is deliberately wider than that and still excludes '/' and '.'.
 */
exports.HTTP01_TOKEN_REGEX = /^[A-Za-z0-9_-]{16,128}$/;
/** How long a published token stays valid if nothing removes it first. */
const DEFAULT_TTL = 15 * 60 * 1000;
/** Give up on the probe request after this long. */
const DEFAULT_PROBE_TIMEOUT = 3000;
/**
 * Encapsulates publishing of HTTP-01 challenge tokens.
 * Implements the same contract as the standalone challenge server, so the
 * adapter can hand either of them to the challenge shim.
 */
class Http01ChallengePublisher {
    config;
    memdb = {};
    constructor(config) {
        this.config = config;
    }
    /**
     * Push the current map out. Expired entries are dropped on the way, so a
     * run that was killed mid-order cannot leave a token behind forever.
     */
    async flush() {
        const now = Date.now();
        for (const [token, entry] of Object.entries(this.memdb)) {
            if (entry.expires <= now) {
                delete this.memdb[token];
            }
        }
        try {
            await this.config.write({ ...this.memdb });
        }
        catch (err) {
            this.config.log.error(`Failed to publish http-01 challenges: ${err.message}`);
        }
    }
    init(opts) {
        this.config.log.debug(`init: ${JSON.stringify(opts)}`);
        // Nothing to start - the state is written on demand.
        return Promise.resolve(null);
    }
    async set(data) {
        const { token, keyAuthorization } = data.challenge;
        this.memdb[token] = {
            keyAuthorization,
            expires: Date.now() + (this.config.ttl ?? DEFAULT_TTL),
        };
        await this.flush();
        this.config.log.debug(`Published ${token} - now publishing ${Object.keys(this.memdb).length}`);
        return null;
    }
    get(data) {
        const entry = this.memdb[data.challenge.token];
        return Promise.resolve(entry ? { keyAuthorization: entry.keyAuthorization } : null);
    }
    async remove(data) {
        delete this.memdb[data.challenge.token];
        await this.flush();
        this.config.log.debug(`Withdrew ${data.challenge.token} - now publishing ${Object.keys(this.memdb).length}`);
        return null;
    }
    shutdown() {
        // Part of the challenge handler contract, which is synchronous. The
        // adapter awaits clear() before terminating; this only makes sure a
        // later get() cannot answer.
        for (const token of Object.keys(this.memdb)) {
            delete this.memdb[token];
        }
    }
    async clear() {
        this.shutdown();
        await this.flush();
    }
}
/**
 * Create a challenge handler that publishes tokens instead of serving them.
 *
 * @param config publisher configuration
 */
function create(config) {
    return new Http01ChallengePublisher(config);
}
/**
 * Turn a bind address into something that can actually be connected to.
 *
 * The configured address is what the challenge server would listen on, so it is
 * routinely a wildcard, which is not a valid destination.
 *
 * @param bind the configured listen address
 */
function probeHost(bind) {
    if (!bind || bind === '0.0.0.0') {
        return '127.0.0.1';
    }
    if (bind === '::') {
        return '[::1]';
    }
    return bind.includes(':') ? `[${bind}]` : bind;
}
/**
 * Find out whether something already serves published challenges on the port
 * the CA will use.
 *
 * A throwaway token is published and then fetched back over HTTP. Only an exact
 * echo counts, which makes this a test of the whole delivery path rather than
 * of a version number: it passes for a web or admin instance with a new enough
 * `@iobroker/webserver`, and equally for an nginx or a proxy adapter that
 * forwards /.well-known/acme-challenge to one. Anything else -- an old
 * webserver answering 404, a plain HTTPS listener, a free port -- fails and
 * leaves the caller to fall back to its own challenge server.
 *
 * @param options probe options
 */
async function probeHttp01Endpoint(options) {
    const { publisher, address, port, log } = options;
    const doFetch = options.doFetch || fetch;
    const token = (0, node_crypto_1.randomBytes)(24).toString('base64url');
    const keyAuthorization = `${token}.${(0, node_crypto_1.randomBytes)(24).toString('base64url')}`;
    const url = `http://${probeHost(address)}:${port}/.well-known/acme-challenge/${token}`;
    await publisher.set({ challenge: { token, keyAuthorization } });
    try {
        log.debug(`Probing ${url}`);
        const response = await doFetch(url, {
            redirect: 'follow',
            signal: AbortSignal.timeout(options.timeout ?? DEFAULT_PROBE_TIMEOUT),
        });
        if (!response.ok) {
            log.debug(`Probe answered ${response.status}`);
            return false;
        }
        const body = (await response.text()).trim();
        if (body !== keyAuthorization) {
            log.debug('Probe answered, but not with the published key authorization');
            return false;
        }
        return true;
    }
    catch (err) {
        log.debug(`Probe failed: ${err.message}`);
        return false;
    }
    finally {
        await publisher.remove({ challenge: { token, keyAuthorization } });
    }
}
