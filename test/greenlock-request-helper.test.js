'use strict';

/*
 * Regression cover for the `request` helper the shim hands to challenge
 * plugins. ACME.js supplied @root/request here; acme-client has no equivalent,
 * and five of the twelve acme-dns-01-* modules do all their HTTP through it.
 * Without the helper they fail at the first call with "request is not a
 * function".
 *
 * The second block drives the REAL installed plugins, not doubles.
 */

const { expect } = require('chai');
const { createRequestHelper, createChallengeShim } = require('../build/lib/greenlock-challenge-shim');

function fakeFetch(reply = {}) {
    const calls = [];
    const fn = (url, init = {}) => {
        calls.push({ url, method: init.method, headers: init.headers, body: init.body });
        return Promise.resolve({
            status: reply.status || 200,
            headers: { forEach: cb => Object.entries(reply.headers || {}).forEach(([k, v]) => cb(v, k)) },
            text: () => Promise.resolve(reply.text === undefined ? '{"ok":true}' : reply.text),
        });
    };
    fn.calls = calls;
    return fn;
}

describe('greenlock request helper', () => {
    it('asks for JSON and parses the reply', async () => {
        const f = fakeFetch();
        const res = await createRequestHelper(f)({ url: 'https://x/y', json: true });
        expect(f.calls[0].headers.Accept).to.equal('application/json');
        expect(f.calls[0].method).to.equal('GET');
        expect(res.body).to.deep.equal({ ok: true });
        expect(res.statusCode).to.equal(200);
    });

    it('serialises an object in json as the request body and switches to POST', async () => {
        const f = fakeFetch();
        await createRequestHelper(f)({ url: 'https://x/y', json: { a: 1 } });
        expect(f.calls[0].method).to.equal('POST');
        expect(f.calls[0].body).to.equal('{"a":1}');
        expect(f.calls[0].headers['Content-Type']).to.equal('application/json');
    });

    it('serialises an object in body alongside json:true (the desec shape)', async () => {
        const f = fakeFetch();
        await createRequestHelper(f)({ method: 'POST', url: 'https://x/y', json: true, body: { b: 2 } });
        expect(f.calls[0].body).to.equal('{"b":2}');
    });

    it('passes a string body through untouched', async () => {
        const f = fakeFetch();
        await createRequestHelper(f)({ method: 'PUT', url: 'https://x/y', body: 'raw' });
        expect(f.calls[0].body).to.equal('raw');
    });

    it('returns non-2xx instead of throwing, because plugins check statusCode', async () => {
        const f = fakeFetch({ status: 422, text: '{"error":"nope"}' });
        const res = await createRequestHelper(f)({ url: 'https://x/y', json: true });
        expect(res.statusCode).to.equal(422);
        expect(res.body).to.deep.equal({ error: 'nope' });
    });

    it('survives a non-JSON body when JSON was requested', async () => {
        const f = fakeFetch({ text: 'not json' });
        const res = await createRequestHelper(f)({ url: 'https://x/y', json: true });
        expect(res.body).to.equal('not json');
    });

    it('exposes response headers', async () => {
        const f = fakeFetch({ headers: { 'retry-after': '3' } });
        const res = await createRequestHelper(f)({ url: 'https://x/y' });
        expect(res.headers['retry-after']).to.equal('3');
    });
});

describe('real acme-dns-01-* plugins that depend on opts.request', () => {
    // These five keep opts.request from init() and never touch fetch directly.
    const AFFECTED = [
        ['acme-dns-01-gandi', { token: 't' }],
        ['acme-dns-01-digitalocean', { token: 't' }],
        ['acme-dns-01-dnsimple', { token: 't' }],
        ['acme-dns-01-namedotcom', { username: 'u', token: 't' }],
    ];

    const challenge = {
        identifier: { type: 'dns', value: 'sub.example.com' },
        wildcard: false,
        altname: 'sub.example.com',
        dnsHost: '_acme-challenge.sub.example.com',
        dnsZone: 'example.com',
        dnsPrefix: '_acme-challenge.sub',
        dnsAuthorization: 'VALUE-A',
        keyAuthorization: 'tok.thumb',
        token: 'tok',
        type: 'dns-01',
    };

    for (const [name, opts] of AFFECTED) {
        it(`${name} issues HTTP through the helper instead of crashing`, async () => {
            const plugin = require(name).create(opts);
            const f = fakeFetch({ text: '[]' });
            const shim = createChallengeShim(plugin, { request: createRequestHelper(f) });

            // zones() and set() are what ACME.js drives; either making a request
            // is proof the helper arrived. A plugin-level rejection is fine --
            // the point is that it is not "request is not a function".
            let failure = null;
            try {
                await shim.challengeCreateFn(
                    { identifier: challenge.identifier, wildcard: false },
                    { type: 'dns-01', token: 'tok', url: 'u', status: 'pending' },
                    'VALUE-A',
                );
            } catch (err) {
                failure = err;
            }

            if (failure) {
                expect(failure.message).to.not.match(/is not a function/);
            }
            expect(f.calls.length, 'plugin made no HTTP call').to.be.greaterThan(0);
        });
    }
});
