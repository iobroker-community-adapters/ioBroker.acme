'use strict';

/*
 * Cover for delivering http-01 tokens through the states DB instead of an own
 * listener on port 80 (issue #85).
 *
 * The state is a contract with a second codebase -- @iobroker/webserver reads
 * it while serving /.well-known/acme-challenge -- so the reader is reproduced
 * here exactly as that side implements it, and the probe is pointed at it. If
 * the published shape ever drifts from what a reader expects, these fail rather
 * than the next certificate renewal.
 */

const http = require('node:http');
const { expect } = require('chai');
const {
    create: createPublisher,
    probeHttp01Endpoint,
    probeHost,
    HTTP01_CHALLENGE_STATE,
    HTTP01_CHALLENGE_PATTERN,
    HTTP01_TOKEN_REGEX,
} = require('../build/lib/http-01-challenge-publisher');

const quietLog = { debug() {}, info() {}, warn() {}, error() {} };

const TOKEN = 'TOKEN-XYZ';
const KEY_AUTH = 'TOKEN-XYZ.thumbprint-of-account-key';
const challenge = { challenge: { token: TOKEN, keyAuthorization: KEY_AUTH } };

/** Collects what the adapter would have written to the state. */
function trackingPublisher(options = {}) {
    const written = { value: {}, writes: 0 };
    const publisher = createPublisher({
        log: quietLog,
        write: async challenges => {
            written.value = challenges;
            written.writes++;
        },
        ...options,
    });
    return { publisher, written };
}

/**
 * What a webserver serving the published challenges does, token validation
 * and expiry check included.
 */
function startReader(port, source) {
    const server = http.createServer((req, res) => {
        const matches = /^\/\.well-known\/acme-challenge\/(.*)$/.exec(req.url || '');
        const token = matches && matches[1];
        const entry = token && HTTP01_TOKEN_REGEX.test(token) ? source()[token] : undefined;
        if (!entry || entry.expires <= Date.now()) {
            res.writeHead(404);
            res.end();
            return;
        }
        res.writeHead(200, { 'Content-Type': 'application/octet-stream' });
        res.end(entry.keyAuthorization);
    });
    return new Promise(resolve => server.listen(port, '127.0.0.1', () => resolve(server)));
}

describe('http-01 challenge publisher', () => {
    it('names the state a reader is going to look for', () => {
        // Changing either of these breaks every webserver reading them.
        expect(HTTP01_CHALLENGE_STATE).to.equal('info.httpChallenges');
        expect(HTTP01_CHALLENGE_PATTERN).to.equal('acme.*.info.httpChallenges');
    });

    it('publishes the key authorization with an expiry in the future', async () => {
        const { publisher, written } = trackingPublisher();
        const before = Date.now();

        await publisher.set(challenge);

        expect(written.value).to.have.property(TOKEN);
        expect(written.value[TOKEN].keyAuthorization).to.equal(KEY_AUTH);
        expect(written.value[TOKEN].expires).to.be.above(before);
    });

    it('withdraws the token again on remove', async () => {
        const { publisher, written } = trackingPublisher();

        await publisher.set(challenge);
        await publisher.remove(challenge);

        expect(written.value).to.deep.equal({});
    });

    it('answers get() only for a token it published', async () => {
        const { publisher } = trackingPublisher();
        await publisher.set(challenge);

        expect(await publisher.get(challenge)).to.deep.equal({ keyAuthorization: KEY_AUTH });
        expect(await publisher.get({ challenge: { token: 'SOMETHING-ELSE' } })).to.equal(null);
    });

    it('never publishes an entry that is already expired', async () => {
        const { publisher, written } = trackingPublisher({ ttl: -1 });

        await publisher.set(challenge);

        expect(written.value).to.deep.equal({});
    });

    it('clears everything on the way out, and waits for that write', async () => {
        const { publisher, written } = trackingPublisher();
        await publisher.set(challenge);
        await publisher.set({ challenge: { token: 'TOKEN-TWO', keyAuthorization: 'TOKEN-TWO.thumb' } });

        await publisher.clear();

        expect(written.value).to.deep.equal({});
        expect(await publisher.get(challenge)).to.equal(null);
    });

    it('reports a write failure instead of throwing into the order', async () => {
        const logged = [];
        const publisher = createPublisher({
            log: { ...quietLog, error: message => logged.push(message) },
            write: async () => {
                throw new Error('states db is down');
            },
        });

        await publisher.set(challenge);

        expect(logged.join()).to.contain('states db is down');
    });
});

describe('http-01 endpoint probe', () => {
    const PORT = 18902;
    let server;

    afterEach(async () => {
        if (server) {
            await new Promise(resolve => server.close(resolve));
            server = undefined;
        }
    });

    it('passes when a reader serves what was published', async () => {
        const { publisher, written } = trackingPublisher();
        server = await startReader(PORT, () => written.value);

        const answers = await probeHttp01Endpoint({
            publisher,
            address: '0.0.0.0',
            port: PORT,
            log: quietLog,
        });

        expect(answers).to.equal(true);
    });

    it('withdraws its throwaway token again', async () => {
        const { publisher, written } = trackingPublisher();
        server = await startReader(PORT, () => written.value);

        await probeHttp01Endpoint({ publisher, address: '0.0.0.0', port: PORT, log: quietLog });

        expect(written.value).to.deep.equal({});
    });

    it('uses a token a reader will accept', async () => {
        const { publisher, written } = trackingPublisher();
        const seen = [];
        server = await startReader(PORT, () => {
            seen.push(...Object.keys(written.value));
            return written.value;
        });

        await probeHttp01Endpoint({ publisher, address: '0.0.0.0', port: PORT, log: quietLog });

        expect(seen).to.have.lengthOf(1);
        expect(seen[0]).to.match(HTTP01_TOKEN_REGEX);
    });

    it('fails when the port answers with something else', async () => {
        const { publisher } = trackingPublisher();
        // An old webserver, or any other adapter, 404s on the challenge path.
        server = await startReader(PORT, () => ({}));

        const answers = await probeHttp01Endpoint({
            publisher,
            address: '127.0.0.1',
            port: PORT,
            log: quietLog,
        });

        expect(answers).to.equal(false);
    });

    it('fails when a 200 does not carry the published key authorization', async () => {
        const { publisher } = trackingPublisher();
        server = await new Promise(resolve => {
            const s = http.createServer((req, res) => {
                res.writeHead(200);
                res.end('<html>some adapter default page</html>');
            });
            s.listen(PORT, '127.0.0.1', () => resolve(s));
        });

        const answers = await probeHttp01Endpoint({
            publisher,
            address: '127.0.0.1',
            port: PORT,
            log: quietLog,
        });

        expect(answers).to.equal(false);
    });

    it('fails when nothing listens at all', async () => {
        const { publisher, written } = trackingPublisher();

        const answers = await probeHttp01Endpoint({
            publisher,
            address: '127.0.0.1',
            port: 18999,
            log: quietLog,
            timeout: 1000,
        });

        expect(answers).to.equal(false);
        // Even on the failure path nothing may be left published.
        expect(written.value).to.deep.equal({});
    });
});

describe('probeHost', () => {
    it('turns a wildcard bind address into something connectable', () => {
        expect(probeHost('0.0.0.0')).to.equal('127.0.0.1');
        expect(probeHost('')).to.equal('127.0.0.1');
        expect(probeHost('::')).to.equal('[::1]');
    });

    it('keeps a concrete address, bracketing v6', () => {
        expect(probeHost('192.168.1.10')).to.equal('192.168.1.10');
        expect(probeHost('fd00::1')).to.equal('[fd00::1]');
    });
});
