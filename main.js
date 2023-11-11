'use strict';

/*
 * Created with @iobroker/create-adapter v2.3.0
 */

// The adapter-core module gives you access to the core ioBroker functions
// you need to create an adapter
const utils = require('@iobroker/adapter-core');
const { CertificateManager } = require('@iobroker/webserver');
const pkg = require('./package.json');

const ACME = require('acme');
const Keypairs = require('@root/keypairs');
const CSR = require('@root/csr');
const PEM = require('@root/pem');
const x509 = require('x509.js');

const accountObjectId = 'account';
// Renew 7 days before expiry
const renewWindow = 60 * 60 * 24 * 7 * 1000;

class Acme extends utils.Adapter {
    /**
     * @param {Partial<utils.AdapterOptions>} [options={}]
     */
    constructor(options) {
        super({
            ...options,
            name: 'acme',
        });

        this.account = {
            full: null,
            key: null,
        };
        this.challenges = [];
        this.toShutdown = [];

        this.on('ready', this.onReady.bind(this));
        this.on('unload', this.onUnload.bind(this));
    }

    /**
     * Is called when databases are connected and adapter received configuration.
     */
    async onReady() {
        try {
            this.log.debug(`config: ${JSON.stringify(this.config)}`);

            this.certManager = new CertificateManager({ adapter: this });

            if (!this.config?.collections?.length) {
                this.terminate('No collections configured - nothing to order');
            } else {
                await this.stopAdaptersOnSamePort();

                // Setup challenges
                this.initChallenges();

                if (!Object.keys(this.challenges).length) {
                    this.log.error('Failed to initiate any challenges');
                } else {
                    // Init ACME/account, etc
                    await this.initAcme();

                    // Loop round collections and generate certs
                    for (const collection of this.config.collections) {
                        await this.generateCollection(collection);
                    }
                }
            }

            // Purge any collections we created in the past but are not configured now and have also expired.
            const collections = await this.certManager.getAllCollections();
            if (collections) {
                this.log.debug(`existingCollectionIds: ${JSON.stringify(Object.keys(collections))}`);
                for (const [collectionId, collection] of Object.entries(collections)) {
                    if (collection.from === this.namespace && collection.tsExpires < Date.now()) {
                        this.log.info(`Removing expired and de-configured collection ${collectionId}`);
                        await this.certManager.delCollection(collectionId);
                    }
                }
            } else {
                this.log.debug(`No collections found`);
            }

            await this.restoreAdaptersOnSamePort();

            this.terminate('Processing complete');
            
        } catch (error) {
            this.errorHandler(`[onReady] ${error}`);
        }
    }

    /**
     * Is called when adapter shuts down - callback has to be called under any circumstances!
     * @param {() => void} callback
     */
    onUnload(callback) {
        try {
            this.log.debug('Shutdown...');
            for (const challenge of this.toShutdown) {
                challenge.shutdown();
            }

            callback();
        } catch (error) {
            this.errorHandler(`[onUnload] ${error}`);
            callback();
        }
    }

    initChallenges() {
        try {
            if (this.config.http01Active) {
                this.log.debug('Init http-01 challenge server');
                const thisChallenge = require('./lib/http-01-challenge-server').create({
                    port: this.config.port,
                    address: this.config.bind,
                    log: this.log
                });
                this.challenges['http-01'] = thisChallenge;
                this.toShutdown.push(thisChallenge);
            }

            if (this.config.dns01Active) {
                this.log.debug('Init dns-01 challenge');

                // TODO: Is there a better way?
                // Just add all the DNS-01 options blindly for all the modules and see what sticks ;)
                const dns01Options = {};
                const dns01Props = {};
                for (const [key, value] of Object.entries(this.config)) {
                    if (key.startsWith('dns01O')) {
                        // An option...
                        dns01Options[key.slice(6)] = value;
                    } else if (key.startsWith('dns01P')) {
                        // A property to add after creation
                        dns01Props[key.slice(6)] = value;
                    }
                }

                // Add module specific options
                switch (this.config.dns01Module) {
                    case 'acme-dns-01-namecheap':
                        dns01Options['baseUrl'] = 'https://api.namecheap.com/xml.response';
                        break;
                }

                this.log.debug(`dns-01 options: ${JSON.stringify(dns01Options)}`);

                // Do this inside try... catch as module is configurable
                let thisChallenge;
                try {
                    thisChallenge = require(this.config.dns01Module).create(dns01Options);
                } catch (err) {
                    this.log.error(`Failed to load dns-01 challenge module: ${err}`);
                }

                if (thisChallenge) {
                    // Add extra properties
                    // TODO: only add where needed?
                    for (const [key, value] of Object.entries(dns01Props)) {
                        thisChallenge[key] = value;
                    }
                    this.challenges['dns-01'] = thisChallenge;
                }
            }
        } catch (error) {
            this.errorHandler(`[initChallenges] ${error}`);
        }
    }

    acmeNotify(ev, msg) {
        switch (ev) {
            case 'error':
                this.log.error(msg.message);
                break;
            case 'warning':
                this.log.warn(msg.message);
                break;
            default:
                this.log.debug(`ACME: ${ev}: ${msg}`);
        }
    }

    async initAcme() {
        try {
            if (!this.acme) {
                // Doesn't exist yet, actually do init
                const directoryUrl = this.config.useStaging ?
                    'https://acme-staging-v02.api.letsencrypt.org/directory' :
                    'https://acme-v02.api.letsencrypt.org/directory';
                this.log.debug(`Using URL: ${directoryUrl}`);

                this.acme = ACME.create({
                    maintainerEmail: this.config.maintainerEmail,
                    packageAgent: `${pkg.name}/${pkg.version}`,
                    notify: this.acmeNotify.bind(this),
                    debug: true
                });
                await this.acme.init(directoryUrl);

                // Try and load saved object
                const accountObject = await this.getObjectAsync(accountObjectId);
                if (accountObject) {
                    this.log.debug(`Loaded existing ACME account: ${JSON.stringify(accountObject)}`);

                    if (accountObject.native?.full?.contact[0] !== `mailto:${this.config.maintainerEmail}`) {
                        this.log.warn('Saved account does not match maintainer email, will recreate.');
                    } else {
                        this.account = accountObject.native;
                    }
                }

                if (!this.account.full) {
                    this.log.info('Registering new ACME account...');

                    // Register new account
                    const accountKeypair = await Keypairs.generate({ kty: 'EC', format: 'jwk' });
                    this.log.debug(`accountKeypair: ${JSON.stringify(accountKeypair)}`);
                    this.account.key = accountKeypair.private;

                    this.account.full = await this.acme.accounts.create({
                        subscriberEmail: this.config.maintainerEmail,
                        agreeToTerms: true,
                        accountKey: this.account.key
                    });
                    this.log.debug(`Created account: ${JSON.stringify(this.account)}`);

                    await this.extendObjectAsync(accountObjectId, { native: this.account });
                }
            }
        } catch (error) {
            this.errorHandler(`[initAcme] ${error}`);
        }
    }

    async stopAdaptersOnSamePort() {
        try {
            if (this.config.http01Active) {
                const result = await this.getObjectViewAsync('system', 'instance', { startkey: 'system.adapter.', endkey: 'system.adapter.\u9999' });
                const instances = result.rows.map(row => row.value);
                const adapters = instances.filter(instance =>
                    instance.common.enabled &&
                    instance.native && (
                        (instance.native.port === this.config.port) ||
                        (
                            instance.native.secure &&
                            instance.native.leEnabled &&
                            instance.native.leUpdate &&
                            instance.native.leCheckPort === this.config.port
                        )
                    )
                );

                if (adapters.length) {
                    this.stoppedAdapters = adapters.map(adapter => adapter._id);
                    for (let i = 0; i < this.stoppedAdapters.length; i++) {
                        const config = await this.getForeignObjectAsync(this.stoppedAdapters[i]);
                        config.common.enabled = false;
                        await this.setForeignObjectAsync(config._id, config);
                    }
                }
            }
        } catch (error) {
            this.errorHandler(`[stopAdaptersOnSamePort] ${error}`);
        }
    }

    async restoreAdaptersOnSamePort() {
        try {
            if (this.stoppedAdapters) {
                for (let i = 0; i < this.stoppedAdapters.length; i++) {
                    const config = await this.getForeignObjectAsync(this.stoppedAdapters[i]);
                    config.common.enabled = true;
                    await this.setForeignObjectAsync(config._id, config);
                }
                this.stoppedAdapters = null;
            }
        } catch (error) {
            this.errorHandler(`[restoreAdaptersOnSamePort] ${error}`);
        }
    }

    // TODO: this belongs in some util class or whatever
    _arraysMatch(arr1, arr2) {
        try {
            if (!Array.isArray(arr1) || !Array.isArray(arr2)) {
                // How can they be matching arrays if not even arrays?
                return false;
            }

            if (arr1 === arr2) {
                // Some dummy passed in the same objects so of course they are the same!
                return true;
            }

            if (arr1.length !== arr2.length) {
                // Cannot be the same if the length doesn't match.
                return false;
            }
            return arr1.every(key => arr2.includes(key));
        } catch (error) {
            this.errorHandler(`[_arraysMatch] ${error}`);
        }
    }

    async generateCollection(collection) {
        try {
            this.log.debug(`Collection: ${JSON.stringify(collection)}`);

            // Create domains now as will be used to test any existing collection.
            const domains = collection.commonName.split(',').map(d => d.trim()).filter(n => n);
            if (collection.altNames) {
                domains.push(...collection.altNames.replaceAll(' ', '').split(',').filter(n => n));
            }
            this.log.debug(`domains: ${JSON.stringify(domains)}`);

            // Get existing collection & see if it needs renewing
            let create = false;
            const existingCollection = await this.certManager.getCollection(collection.id);
            if (!existingCollection) {
                this.log.info(`Collection ${collection.id} does not exist - will create`);
                create = true;
            } else {
                this.log.debug(`Existing: ${collection.id}: ${JSON.stringify(existingCollection)}`);

                try {
                    // Decode certificate to check not due for renewal and parts match what is configured.
                    const crt = x509.parseCert(existingCollection.cert);
                    this.log.debug(`Existing cert: ${JSON.stringify(crt)}`);

                    if (Date.now() > Date.parse(crt.notAfter) - renewWindow) {
                        this.log.info(`Collection ${collection.id} expiring soon - will renew`);
                        create = true;
                    } else if (collection.commonName !== crt.subject.commonName) {
                        this.log.info(`Collection ${collection.id} common name does not match - will renew`);
                        create = true;
                    } else if (!this._arraysMatch(domains, crt.altNames)) {
                        this.log.info(`Collection ${collection.id} alt names do not match - will renew`);
                        create = true;
                    } else if (this.config.useStaging !== existingCollection.staging) {
                        this.log.info(`Collection ${collection.id} staging flags do not match - will renew`);
                        create = true;
                    } else {
                        this.log.debug(`Collection ${collection.id} certificate already looks good`);
                    }
                } catch (err) {
                    this.log.error(`Collection ${collection.id} exists but looks invalid (${err}) - will renew`);
                    create = true;
                }
            }

            if (create) {
                const serverKeypair = await Keypairs.generate({ kty: 'RSA', format: 'jwk' });
                const serverPem = await Keypairs.export({ jwk: serverKeypair.private });
                const serverKey = await Keypairs.import({ pem: serverPem });

                const csrDer = await CSR.csr({
                    jwk: serverKey,
                    domains,
                    encoding: 'der',
                });
                const csr = PEM.packBlock({
                    type: 'CERTIFICATE REQUEST',
                    bytes: csrDer,
                });

                let pems;
                try {
                    pems = await this.acme.certificates.create({
                        account: this.account.account,
                        accountKey: this.account.key,
                        csr,
                        domains,
                        challenges: this.challenges,
                    });
                } catch (err) {
                    this.log.error(`Certificate request for ${collection.id} (${domains}) failed: ${err}`);
                }

                this.log.debug('Done');

                if (pems) {
                    let collectionToSet = {
                        from: this.namespace,
                        key: serverPem,
                        cert: pems.cert,
                        chain: [pems.cert, pems.chain],
                        domains,
                        staging: this.config.useStaging,
                    };

                    // Decode certificate to get expiry.
                    // Kind of handy that this happens to verify certificate looks good too.
                    try {
                        const crt = x509.parseCert(collectionToSet.cert);
                        this.log.debug(`New certs notBefore ${crt.notBefore} notAfter ${crt.notAfter}`);
                        collectionToSet.tsExpires = Date.parse(crt.notAfter);
                    } catch (err) {
                        this.log.error(`Certificate returned for ${collectionToSet.id} looks invalid - not saving`);
                        collectionToSet = null;
                    }

                    if (collectionToSet) {
                        this.log.debug(`${collection.id} is ${JSON.stringify(collectionToSet)}`);
                        // Save it
                        await this.certManager.setCollection(collection.id, collectionToSet);
                        this.log.info(`Collection ${collection.id} order success`);
                    }
                }
            }
        } catch (error) {
            this.errorHandler(`[generateCollection] ${error}`);
        }
    }

    /**
     * Handles error messages for log and Sentry
     * @param {any} error Error message
     */
    errorHandler(error) {
        try {
        let errorMsg = error;
        if (error instanceof Error && error.stack != null) errorMsg = error.stack;
            // Currenlty not needed, if you want to use the Sentry this part can be activated
            // try {
            //     if (!disableSentry) {
            //         this.log.info(`[Error caught and send to Sentry, thank you collaborating!] error: ${errorMsg}`);
            //         if (this.supportsFeature && this.supportsFeature('PLUGINS')) {
            //             const sentryInstance = this.getPluginInstance('sentry');
            //             if (sentryInstance) {
            //                 sentryInstance.getSentryObject().captureException(errorMsg);
            //             }
            //         }
            //     } else {
            this.log.error(`Sentry disabled, error caught : ${errorMsg}`);
            // }
        } catch (error) {
            this.log.error(`Error in function sendSentry: ${error}`);
        }
    }

}

if (require.main !== module) {
    // Export the constructor in compact mode
    /**
     * @param {Partial<utils.AdapterOptions>} [options={}]
     */
    module.exports = (options) => new Acme(options);
} else {
    // otherwise start the instance directly
    new Acme();
}