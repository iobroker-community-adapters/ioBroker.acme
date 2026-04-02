const path = require('path');
const { tests } = require('@iobroker/testing');

// Run integration tests - See https://github.com/ioBroker/testing for a detailed explanation and further options
tests.integration(path.join(__dirname, '..'), {
    allowedExitCodes: [11],
    defineAdditionalTests({ suite }) {
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