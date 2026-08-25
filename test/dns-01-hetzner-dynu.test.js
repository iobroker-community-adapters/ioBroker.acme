'use strict';

const { expect } = require('chai');
const hetzner = require('../build/lib/dns-01-hetzner');
const dynu = require('../build/lib/dns-01-dynu');

const CHALLENGE = {
    dnsHost: '_acme-challenge.sub.example.com',
    dnsAuthorization: 'VALUE-A',
    identifier: { value: 'sub.example.com' },
};

/** Records every call; routes by a (method, url-fragment) predicate. */
function recorder(handler) {
    const calls = [];
    const fn = (url, init = {}) => {
        const method = init.method || 'GET';
        const body = init.body ? JSON.parse(init.body) : undefined;
        calls.push({ method, url, body, headers: init.headers });
        const res = handler(method, url, body) || {};
        return Promise.resolve({
            ok: res.ok !== false,
            status: res.status || 200,
            statusText: res.statusText || 'OK',
            headers: { get: name => (res.headers || {})[name] },
            text: () => Promise.resolve(res.body === undefined ? '' : JSON.stringify(res.body)),
        });
    };
    fn.calls = calls;
    return fn;
}

describe('dns-01-hetzner', () => {
    describe('helpers', () => {
        it('makes the record name relative to the zone', () => {
            expect(hetzner.relativeName('_acme-challenge.sub.example.com', 'example.com')).to.equal(
                '_acme-challenge.sub',
            );
        });

        it('uses @ at the zone apex', () => {
            expect(hetzner.relativeName('example.com', 'example.com')).to.equal('@');
        });

        it('walks every parent, longest first, and stops before the TLD alone', () => {
            expect(hetzner.zoneCandidates('_acme-challenge.sub.example.com')).to.deep.equal([
                '_acme-challenge.sub.example.com',
                'sub.example.com',
                'example.com',
            ]);
        });
    });

    it('requires a token', () => {
        expect(() => hetzner.create({})).to.throw(/token/);
    });

    it('finds the zone by walking up and adds a quoted TXT value', async () => {
        const f = recorder((method, url) => {
            if (method === 'GET' && url.includes('/zones?name=example.com')) {
                return { body: { zones: [{ id: 42, name: 'example.com' }] } };
            }
            if (method === 'GET' && url.includes('/zones?name=')) {
                return { body: { zones: [] } };
            }
            return { body: {} };
        });
        await hetzner.create({ token: 'tok', fetch: f }).set({ challenge: CHALLENGE });

        const post = f.calls.find(c => c.method === 'POST');
        expect(post.url).to.contain('/zones/42/rrsets/_acme-challenge.sub/TXT/actions/add_records');
        expect(post.headers.Authorization).to.equal('Bearer tok');
        // Hetzner stores TXT values quoted
        expect(post.body).to.deep.equal({ ttl: 60, records: [{ value: '"VALUE-A"' }] });
    });

    it('removes only its own value via remove_records', async () => {
        const f = recorder((method, url) => {
            if (method === 'GET' && url.includes('/zones?name=example.com')) {
                return { body: { zones: [{ id: 42, name: 'example.com' }] } };
            }
            if (method === 'GET') {
                return { body: { zones: [] } };
            }
            return { body: {} };
        });
        await hetzner.create({ token: 'tok', fetch: f }).remove({ challenge: CHALLENGE });

        const post = f.calls.find(c => c.method === 'POST');
        expect(post.url).to.contain('/actions/remove_records');
        expect(post.body).to.deep.equal({ records: [{ value: '"VALUE-A"' }] });
    });

    it('honours Retry-After on 429 and then succeeds', async () => {
        let seen = 0;
        const f = recorder((method, url) => {
            if (url.includes('/zones?name=example.com')) {
                seen++;
                if (seen === 1) {
                    return { ok: false, status: 429, headers: { 'Retry-After': '0' } };
                }
                return { body: { zones: [{ id: 7, name: 'example.com' }] } };
            }
            return { body: { zones: [] } };
        });
        await hetzner.create({ token: 'tok', fetch: f }).set({ challenge: CHALLENGE });
        expect(seen).to.equal(2);
        expect(f.calls.find(c => c.method === 'POST').url).to.contain('/zones/7/');
    });

    it('names the candidates it tried when no zone matches', async () => {
        const f = recorder(() => ({ body: { zones: [] } }));
        try {
            await hetzner.create({ token: 'tok', fetch: f }).set({ challenge: CHALLENGE });
            expect.fail('should have thrown');
        } catch (err) {
            expect(err.message).to.contain('No Hetzner Cloud zone found');
            expect(err.message).to.contain('example.com');
        }
    });
});

describe('dns-01-dynu', () => {
    const root = { id: 9, domainName: 'example.com', node: '_acme-challenge.sub' };

    it('requires a token', () => {
        expect(() => dynu.create({})).to.throw(/API key/);
    });

    it('authenticates with API-Key, not Bearer', async () => {
        const f = recorder((method, url) => (url.includes('getroot') ? { body: root } : { body: {} }));
        await dynu.create({ token: 'k', fetch: f }).set({ challenge: CHALLENGE });
        expect(f.calls[0].headers['API-Key']).to.equal('k');
        expect(f.calls[0].headers.Authorization).to.be.undefined;
    });

    it('posts the record using the node getroot reported', async () => {
        const f = recorder((method, url) => (url.includes('getroot') ? { body: root } : { body: {} }));
        await dynu.create({ token: 'k', fetch: f }).set({ challenge: CHALLENGE });

        const post = f.calls.find(c => c.method === 'POST');
        expect(post.url).to.contain('/dns/9/record');
        expect(post.body).to.deep.equal({
            domainId: 9,
            nodeName: '_acme-challenge.sub',
            recordType: 'TXT',
            textData: 'VALUE-A',
            state: true,
            ttl: 90,
        });
    });

    it('derives the node itself when getroot omits it', async () => {
        const f = recorder((method, url) =>
            url.includes('getroot') ? { body: { id: 9, domainName: 'example.com' } } : { body: {} },
        );
        await dynu.create({ token: 'k', fetch: f }).set({ challenge: CHALLENGE });
        expect(f.calls.find(c => c.method === 'POST').body.nodeName).to.equal('_acme-challenge.sub');
    });

    it('deletes only the record carrying this value', async () => {
        const records = {
            dnsRecords: [
                { id: 1, nodeName: '_acme-challenge.sub', recordType: 'TXT', textData: 'VALUE-A' },
                { id: 2, nodeName: '_acme-challenge.sub', recordType: 'TXT', textData: 'VALUE-B' },
                { id: 3, nodeName: 'www', recordType: 'TXT', textData: 'VALUE-A' },
            ],
        };
        const f = recorder((method, url) => {
            if (url.includes('getroot')) return { body: root };
            if (method === 'GET' && url.endsWith('/record')) return { body: records };
            return { body: {} };
        });
        await dynu.create({ token: 'k', fetch: f }).remove({ challenge: CHALLENGE });

        const deletes = f.calls.filter(c => c.method === 'DELETE');
        expect(deletes).to.have.lengthOf(1);
        expect(deletes[0].url).to.contain('/dns/9/record/1');
    });

    it('is a no-op when nothing matches', async () => {
        const f = recorder((method, url) => {
            if (url.includes('getroot')) return { body: root };
            if (method === 'GET' && url.endsWith('/record')) return { body: { dnsRecords: [] } };
            return { body: {} };
        });
        await dynu.create({ token: 'k', fetch: f }).remove({ challenge: CHALLENGE });
        expect(f.calls.filter(c => c.method === 'DELETE')).to.have.lengthOf(0);
    });

    it('reports a domain that is not on the account', async () => {
        const f = recorder(() => ({ body: {} }));
        try {
            await dynu.create({ token: 'k', fetch: f }).set({ challenge: CHALLENGE });
            expect.fail('should have thrown');
        } catch (err) {
            expect(err.message).to.contain('No Dynu domain found');
        }
    });
});
