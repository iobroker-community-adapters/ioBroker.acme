'use strict';

const { expect } = require('chai');
const { create, unquote, findZone } = require('../build/lib/dns-01-ionos');

const TOKEN = 'pubprefix.secretpart';
const ZONES = [
    { id: 'zone-inner', name: 'sub.example.com' },
    { id: 'zone-outer', name: 'example.com' },
    { id: 'zone-other', name: 'notexample.com' },
];

/** Minimal fetch double that records calls and replays canned responses. */
function mockFetch(routes) {
    const calls = [];
    const fn = (url, init = {}) => {
        const method = init.method || 'GET';
        calls.push({ method, url, body: init.body ? JSON.parse(init.body) : undefined, headers: init.headers });
        const key = Object.keys(routes).find(k => {
            const [m, path] = k.split(' ');
            return m === method && url.includes(path);
        });
        const route = key ? routes[key] : undefined;
        if (!route) {
            return Promise.resolve({ ok: false, status: 404, statusText: 'Not Found', text: () => Promise.resolve('') });
        }
        return Promise.resolve({
            ok: route.ok !== false,
            status: route.status || 200,
            statusText: route.statusText || 'OK',
            text: () => Promise.resolve(route.body === undefined ? '' : JSON.stringify(route.body)),
        });
    };
    fn.calls = calls;
    return fn;
}

const challenge = (over = {}) => ({
    dnsHost: '_acme-challenge.sub.example.com',
    dnsAuthorization: 'TXTVALUE-A',
    identifier: { value: 'sub.example.com' },
    ...over,
});

describe('dns-01-ionos', () => {
    describe('helpers', () => {
        it('unquotes the literal quotes IONOS stores TXT content with', () => {
            expect(unquote('"abc"')).to.equal('abc');
            expect(unquote('abc')).to.equal('abc');
        });

        it('picks the longest matching zone', () => {
            expect(findZone(ZONES, '_acme-challenge.sub.example.com').id).to.equal('zone-inner');
            expect(findZone(ZONES, '_acme-challenge.other.example.com').id).to.equal('zone-outer');
        });

        it('does not match a zone that is only a string suffix', () => {
            expect(findZone([{ id: 'z', name: 'example.com' }], 'notexample.com')).to.be.undefined;
        });
    });

    describe('construction', () => {
        it('rejects a token that is not prefix.secret', () => {
            expect(() => create({ token: 'nodot' })).to.throw(/publicprefix\.secret/);
            expect(() => create({ token: '' })).to.throw(/publicprefix\.secret/);
        });

        it('accepts a well formed token', () => {
            expect(() => create({ token: TOKEN })).to.not.throw();
        });
    });

    describe('set', () => {
        it('POSTs a TXT record into the longest matching zone', async () => {
            const f = mockFetch({ 'GET /v1/zones': { body: ZONES }, 'POST /v1/zones': { status: 201 } });
            await create({ token: TOKEN, fetch: f }).set({ challenge: challenge() });

            const post = f.calls.find(c => c.method === 'POST');
            expect(post.url).to.contain('/v1/zones/zone-inner/records');
            expect(post.headers['X-API-Key']).to.equal(TOKEN);
            expect(post.body).to.deep.equal([
                {
                    name: '_acme-challenge.sub.example.com',
                    type: 'TXT',
                    content: 'TXTVALUE-A',
                    ttl: 60,
                    prio: 10,
                    disabled: false,
                },
            ]);
        });

        it('enforces the API minimum TTL of 60s', async () => {
            const f = mockFetch({ 'GET /v1/zones': { body: ZONES }, 'POST /v1/zones': { status: 201 } });
            await create({ token: TOKEN, fetch: f, ttl: 5 }).set({ challenge: challenge() });
            expect(f.calls.find(c => c.method === 'POST').body[0].ttl).to.equal(60);
        });

        it('reports the zones on the account when none matches', async () => {
            const f = mockFetch({ 'GET /v1/zones': { body: [{ id: 'x', name: 'elsewhere.org' }] } });
            try {
                await create({ token: TOKEN, fetch: f }).set({ challenge: challenge() });
                expect.fail('should have thrown');
            } catch (err) {
                expect(err.message).to.contain('No IONOS zone found');
                expect(err.message).to.contain('elsewhere.org');
            }
        });

        it('surfaces an API error with status and body', async () => {
            const f = mockFetch({
                'GET /v1/zones': { ok: false, status: 401, statusText: 'Unauthorized', body: { message: 'bad key' } },
            });
            try {
                await create({ token: TOKEN, fetch: f }).set({ challenge: challenge() });
                expect.fail('should have thrown');
            } catch (err) {
                expect(err.message).to.contain('401');
                expect(err.message).to.contain('bad key');
            }
        });
    });

    describe('remove', () => {
        const records = {
            records: [
                { id: 'rec-a', name: '_acme-challenge.sub.example.com', type: 'TXT', content: '"TXTVALUE-A"' },
                { id: 'rec-b', name: '_acme-challenge.sub.example.com', type: 'TXT', content: '"TXTVALUE-B"' },
            ],
        };

        it('deletes only the record carrying this challenge value', async () => {
            const f = mockFetch({
                'GET /v1/zones': { body: ZONES },
                'DELETE /v1/zones': { status: 200 },
            });
            // the record lookup hits GET /v1/zones/<id>?... which the router above
            // resolves to the zones route, so give it its own handler
            const routed = (url, init) => {
                if ((init?.method || 'GET') === 'GET' && url.includes('recordName=')) {
                    f.calls.push({ method: 'GET', url });
                    return Promise.resolve({ ok: true, status: 200, text: () => Promise.resolve(JSON.stringify(records)) });
                }
                return f(url, init);
            };
            await create({ token: TOKEN, fetch: routed }).remove({ challenge: challenge() });

            const deletes = f.calls.filter(c => c.method === 'DELETE');
            expect(deletes).to.have.lengthOf(1);
            expect(deletes[0].url).to.contain('/records/rec-a');
        });

        it('is a no-op when nothing matches', async () => {
            const f = mockFetch({ 'GET /v1/zones': { body: ZONES } });
            const routed = (url, init) => {
                if ((init?.method || 'GET') === 'GET' && url.includes('recordName=')) {
                    return Promise.resolve({ ok: true, status: 200, text: () => Promise.resolve('{"records":[]}') });
                }
                return f(url, init);
            };
            await create({ token: TOKEN, fetch: routed }).remove({ challenge: challenge() });
            expect(f.calls.filter(c => c.method === 'DELETE')).to.have.lengthOf(0);
        });
    });

    describe('zones', () => {
        it('returns plain zone names and caches the lookup', async () => {
            const f = mockFetch({ 'GET /v1/zones': { body: ZONES } });
            const plugin = create({ token: TOKEN, fetch: f });
            expect(await plugin.zones()).to.deep.equal(['sub.example.com', 'example.com', 'notexample.com']);
            await plugin.zones();
            expect(f.calls.filter(c => c.method === 'GET')).to.have.lengthOf(1);
        });
    });
});
