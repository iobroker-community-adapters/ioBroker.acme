'use strict';

/*
 * End-to-end cover for the http-01 path through the shim, minus the CA.
 *
 * This is the most commonly used challenge in ioBroker -- it needs no DNS API
 * -- and after the acme-client migration it runs through the same shim as the
 * DNS plugins. Nothing so far actually started the server and fetched a token
 * off it, which is exactly the gap that let "request is not a function" reach
 * main for the DNS side.
 */

const { expect } = require('chai');
const { createChallengeShim } = require('../build/lib/greenlock-challenge-shim');
const { create: createHttp01Server } = require('../build/lib/http-01-challenge-server');

const PORT = 18901;
const quietLog = { debug() {}, info() {}, warn() {}, error() {} };

const authz = { identifier: { type: 'dns', value: 'sub.example.com' }, wildcard: false };
const challenge = { type: 'http-01', token: 'TOKEN-XYZ', url: 'https://ca/chall/1', status: 'pending' };
const KEY_AUTH = 'TOKEN-XYZ.thumbprint-of-account-key';

describe('http-01 challenge server through the shim', () => {
    let server;
    let shim;

    beforeEach(() => {
        server = createHttp01Server({ log: quietLog, port: PORT, address: '127.0.0.1' });
        shim = createChallengeShim(server, {});
    });

    afterEach(() => {
        try {
            server.shutdown();
        } catch {
            // already down
        }
    });

    it('starts listening and serves the key authorization the CA will ask for', async () => {
        await shim.challengeCreateFn(authz, challenge, KEY_AUTH);

        const res = await fetch(`http://127.0.0.1:${PORT}/.well-known/acme-challenge/${challenge.token}`);
        expect(res.status).to.equal(200);
        expect(await res.text()).to.equal(KEY_AUTH);
    });

    it('serves the raw key authorization, not the dns-01 digest', async () => {
        await shim.challengeCreateFn(authz, challenge, KEY_AUTH);
        const body = await (await fetch(`http://127.0.0.1:${PORT}/.well-known/acme-challenge/${challenge.token}`)).text();
        // dns-01 hashes this; http-01 must not.
        expect(body).to.contain('.');
        expect(body).to.equal(KEY_AUTH);
    });

    it('does not serve an unknown token', async () => {
        await shim.challengeCreateFn(authz, challenge, KEY_AUTH);
        const res = await fetch(`http://127.0.0.1:${PORT}/.well-known/acme-challenge/SOMETHING-ELSE`);
        expect(res.status).to.not.equal(200);
    });

    it('stops serving the token after teardown', async () => {
        await shim.challengeCreateFn(authz, challenge, KEY_AUTH);
        await shim.challengeRemoveFn(authz, challenge, KEY_AUTH);

        const res = await fetch(`http://127.0.0.1:${PORT}/.well-known/acme-challenge/${challenge.token}`);
        expect(res.status).to.not.equal(200);
    });

    it('handles two challenges at once, as a multi-domain order does', async () => {
        const second = { ...challenge, token: 'TOKEN-TWO' };
        const secondAuth = 'TOKEN-TWO.thumbprint-of-account-key';

        await shim.challengeCreateFn(authz, challenge, KEY_AUTH);
        await shim.challengeCreateFn(
            { identifier: { type: 'dns', value: 'other.example.com' }, wildcard: false },
            second,
            secondAuth,
        );

        const base = `http://127.0.0.1:${PORT}/.well-known/acme-challenge`;
        expect(await (await fetch(`${base}/${challenge.token}`)).text()).to.equal(KEY_AUTH);
        expect(await (await fetch(`${base}/${second.token}`)).text()).to.equal(secondAuth);
    });

    it('reports no propagation delay, so acme-client validates immediately', () => {
        expect(shim.propagationDelay).to.equal(0);
        expect(shim.skipChallengeTest).to.equal(false);
    });
});
