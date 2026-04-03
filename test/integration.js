const path = require('path');
const crypto = require('node:crypto');
const { tests } = require('@iobroker/testing');
const { computeDnsAuthorization, normalizeDnsAlias } = require('../build/lib/dns-01-utils');

// Run integration tests - See https://github.com/ioBroker/testing for a detailed explanation and further options
tests.integration(path.join(__dirname, '..'), {
    allowedExitCodes: [11],
    defineAdditionalTests({ suite }) {
        suite('DNS alias utils', () => {
            it('normalizes dns01Alias values', () => {
                if (normalizeDnsAlias('') !== '') {
                    throw new Error('Expected empty alias to stay empty');
                }
                if (normalizeDnsAlias('  acme.example.net  ') !== 'acme.example.net') {
                    throw new Error('Expected trimmed alias domain');
                }
                if (normalizeDnsAlias('_acme-challenge.acme.example.net') !== 'acme.example.net') {
                    throw new Error('Expected alias prefix to be removed');
                }
                if (normalizeDnsAlias('acme.example.net.') !== 'acme.example.net') {
                    throw new Error('Expected trailing dot to be removed');
                }
            });

            it('computes dnsAuthorization according to RFC dns-01 hash format', () => {
                const keyAuthorization = 'token.thumbprint';
                const expected = crypto.createHash('sha256').update(keyAuthorization).digest('base64url');
                const actual = computeDnsAuthorization(keyAuthorization);
                if (actual !== expected) {
                    throw new Error('DNS authorization hash does not match expected value');
                }
            });
        });

        suite('Collection purge behavior', getHarness => {
            let harness;

            before(() => {
                harness = getHarness();
            });

            it('purges only expired collections that are no longer configured', async function () {
                this.timeout(40_000);

                const certsObject = await harness.objects.getObjectAsync('system.certificates');
                if (!certsObject) {
                    throw new Error('system.certificates object not found');
                }

                certsObject.native = certsObject.native || {};
                certsObject.native.collections = {
                    keepMe: {
                        from: 'acme.0',
                        tsExpires: Date.now() - 10_000,
                        cert: 'dummy',
                        key: 'dummy',
                        chain: [],
                        domains: ['keep.example.com'],
                        staging: true,
                    },
                    removeMe: {
                        from: 'acme.0',
                        tsExpires: Date.now() - 10_000,
                        cert: 'dummy',
                        key: 'dummy',
                        chain: [],
                        domains: ['remove.example.com'],
                        staging: true,
                    },
                    foreignCollection: {
                        from: 'web.0',
                        tsExpires: Date.now() - 10_000,
                        cert: 'dummy',
                        key: 'dummy',
                        chain: [],
                        domains: ['foreign.example.com'],
                        staging: true,
                    },
                };
                await harness.objects.setObjectAsync('system.certificates', certsObject);

                const adapterObject = await harness.objects.getObjectAsync('system.adapter.acme.0');
                if (!adapterObject) {
                    throw new Error('system.adapter.acme.0 object not found');
                }

                Object.assign(adapterObject.native, {
                    maintainerEmail: 'test@example.com',
                    http01Active: false,
                    dns01Active: false,
                    collections: [
                        {
                            id: 'keepMe',
                            commonName: 'keep.example.com',
                            altNames: '',
                        },
                    ],
                });

                await harness.objects.setObjectAsync(adapterObject._id, adapterObject);
                await harness.startAdapterAndWait();
                await new Promise(resolve => setTimeout(resolve, 3_000));

                const updated = await harness.objects.getObjectAsync('system.certificates');
                const updatedCollections = updated?.native?.collections || {};

                if (!updatedCollections.keepMe) {
                    throw new Error('Configured expired collection was incorrectly removed');
                }
                if (updatedCollections.removeMe) {
                    throw new Error('Expired de-configured collection was not removed');
                }
                if (!updatedCollections.foreignCollection) {
                    throw new Error('Collection from another adapter should not be removed');
                }
            });
        });
    },
});