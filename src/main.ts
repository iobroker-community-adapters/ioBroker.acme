/*
 * Created with @iobroker/create-adapter v2.3.0
 */

// The adapter-core module gives you access to the core ioBroker functions
// you need to create an adapter
import * as utils from '@iobroker/adapter-core';
import { CertificateManager, type CertificateCollection } from '@iobroker/webserver';
import ACME from 'acme';
import Keypairs from '@root/keypairs';
import CSR from '@root/csr';
import PEM from '@root/pem';
import x509 from 'x509.js';

import type { AdapterOptions } from '@iobroker/adapter-core';

import pkg from '../package.json';
import { create as createHttp01ChallengeServer } from './lib/http-01-challenge-server';
import type { AcmeAdapterConfig } from './types';

const accountObjectId = 'account';
// Renew 7 days before expiry
const renewWindow = 60 * 60 * 24 * 7 * 1000;

interface AcmeAccount {
    full: Record<string, any> | null;
    key: Record<string, any> | null;
}

interface ChallengeHandler {
    init: (opts: Record<string, unknown>) => Promise<null>;
    set: (data: any) => Promise<null>;
    get: (data: any) => Promise<any>;
    remove: (data: any) => Promise<null>;
    shutdown: () => void;
}

class AcmeAdapter extends utils.Adapter {
    declare config: AcmeAdapterConfig;
    private account: AcmeAccount;
    private readonly challenges: Record<string, ChallengeHandler>;
    private readonly toShutdown: ChallengeHandler[];
    private donePortCheck: boolean;
    private certManager: CertificateManager | undefined;
    private acme: {
        init: (directoryUrl: string) => Promise<void>;
        accounts: {
            create: (options: {
                subscriberEmail: string;
                agreeToTerms: boolean;
                accountKey: Record<string, any>;
            }) => Promise<Record<string, any>>;
        };
        certificates: {
            create: (options: {
                account: Record<string, any>;
                accountKey: Record<string, string | Buffer>;
                csr: string;
                domains: string[];
                challenges: Record<string, ChallengeHandler>;
            }) => Promise<{ cert: string; chain: string }>;
        };
    } | null = null;
    private stoppedAdapters: string[] | null | undefined;

    constructor(options: Partial<utils.AdapterOptions> = {}) {
        super({
            ...options,
            name: 'acme',
        });

        this.account = {
            full: null,
            key: null,
        };
        this.challenges = {};
        this.toShutdown = [];
        this.donePortCheck = false;

        this.on('ready', this.onReady.bind(this));
    }

    /**
     * Is called when databases are connected and adapter received configuration.
     */
    async onReady(): Promise<void> {
        this.log.debug(`config: ${JSON.stringify(this.config)}`);

        this.certManager = new CertificateManager({ adapter: this });

        if (!this.config?.collections?.length) {
            this.terminate('No collections configured - nothing to order');
        } else {
            // Setup challenges
            await this.initChallenges();

            if (!Object.keys(this.challenges).length) {
                this.log.error('Failed to initiate any challenges');
            } else {
                try {
                    // Init ACME/account, etc
                    await this.initAcme();

                    // Loop round collections and generate certs
                    for (const collection of this.config.collections) {
                        await this.generateCollection(collection);
                    }
                } catch (err) {
                    this.log.error(`Failed in ACME init/generation: ${err}`);
                }
            }
        }

        // Purge any collections we created in the past but are not configured now and have also expired.
        try {
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
        } catch (err) {
            this.log.error(`Failed in existing collection check/purge: ${err}`);
        }

        this.log.debug('Shutdown...');

        for (const challenge of this.toShutdown) {
            challenge.shutdown();
        }

        try {
            await this.restoreAdaptersOnSamePort();
        } catch (err) {
            this.log.error(`Failed to restore adapters on same port: ${err}`);
        }

        this.terminate('Processing complete');
    }

    async initChallenges(): Promise<void> {
        if (this.config.http01Active) {
            this.log.debug('Init http-01 challenge server');
            // This does not actually cause the challenge server to start listening, so we don't need to do port check at this time.
            const thisChallenge = createHttp01ChallengeServer({
                port: this.config.port,
                address: this.config.bind,
                log: this.log,
            });
            this.challenges['http-01'] = thisChallenge;
            this.toShutdown.push(thisChallenge);
        }

        if (this.config.dns01Active) {
            this.log.debug('Init dns-01 challenge');

            // TODO: Is there a better way?
            // Just add all the DNS-01 options blindly for all the modules and see what sticks ;)
            const dns01Options: Record<string, any> = {};
            const dns01Props: Record<string, any> = {};
            for (const [key, value] of Object.entries(this.config)) {
                if (key.startsWith('dns01O')) {
                    // An option...
                    dns01Options[key.slice(6)] = value;
                } else if (key.startsWith('dns01P')) {
                    // A property to add after creation
                    dns01Props[key.slice(6)] = value;
                }
            }

            // Add the module-specific options
            switch (this.config.dns01Module) {
                case 'acme-dns-01-namecheap':
                    dns01Options.baseUrl = 'https://api.namecheap.com/xml.response';
                    break;
            }

            this.log.debug(`dns-01 options: ${JSON.stringify(dns01Options)}`);

            // Do this inside try... catch as the module is configurable
            let thisChallenge: ChallengeHandler | undefined;
            try {
                // Dynamic import - module name comes from config
                const dns01Module = await import(this.config.dns01Module);
                if (dns01Module.default) {
                    thisChallenge = dns01Module.default.create(dns01Options);
                } else {
                    thisChallenge = dns01Module.create(dns01Options);
                }
            } catch (err) {
                this.log.error(`Failed to load dns-01 challenge module: ${err}`);
            }

            if (thisChallenge) {
                // Add extra properties
                // TODO: only add where needed?
                for (const [key, value] of Object.entries(dns01Props)) {
                    (thisChallenge as any)[key] = value;
                }
                this.challenges['dns-01'] = thisChallenge;
            }
        }
    }

    acmeNotify(ev: string, msg: unknown): void {
        const logLevel = ev === 'error' ? this.log.error : ev === 'warning' ? this.log.warn : this.log.debug;
        logLevel(`ACMENotify - ${ev}: ${JSON.stringify(msg)}`);
    }

    async initAcme(): Promise<void> {
        if (!this.acme) {
            // Doesn't exist yet, actually do init
            const directoryUrl = this.config.useStaging
                ? 'https://acme-staging-v02.api.letsencrypt.org/directory'
                : 'https://acme-v02.api.letsencrypt.org/directory';
            this.log.debug(`Using URL: ${directoryUrl}`);

            this.acme = ACME.create({
                maintainerEmail: this.config.maintainerEmail,
                packageAgent: `${pkg.name}/${pkg.version}`,
                notify: this.acmeNotify.bind(this),
                debug: true,
            });
            await this.acme!.init(directoryUrl);

            // Try and load a saved object
            const accountObject = await this.getObjectAsync(accountObjectId);
            if (accountObject) {
                this.log.debug(`Loaded existing ACME account: ${JSON.stringify(accountObject)}`);

                if (accountObject.native?.full?.contact[0] !== `mailto:${this.config.maintainerEmail}`) {
                    this.log.warn('Saved account does not match maintainer email, will recreate.');
                } else {
                    this.account = accountObject.native as AcmeAccount;
                }
            }

            if (!this.account.full) {
                this.log.info('Registering new ACME account...');

                // Register a new account
                const accountKeypair: { [name: string]: any } = await Keypairs.generate({
                    kty: 'EC',
                    format: 'jwk',
                });
                this.log.debug(`accountKeypair: ${JSON.stringify(accountKeypair)}`);
                this.account.key = accountKeypair.private;

                this.account.full = await this.acme!.accounts.create({
                    subscriberEmail: this.config.maintainerEmail,
                    agreeToTerms: true,
                    accountKey: this.account.key!,
                });
                this.log.debug(`Created account: ${JSON.stringify(this.account)}`);

                await this.extendObjectAsync(accountObjectId, {
                    native: this.account,
                });
            }
        }
    }

    async stopAdaptersOnSamePort(): Promise<void> {
        // TODO: Maybe this should be in some sort of utility so other adapters can 'grab' a port in use?
        // Stop conflicting adapters using our challenge server port only if we are going to need it and haven't already checked.
        if (this.config.http01Active && !this.donePortCheck) {
            // TODO: is there a better way than hardcoding this 'system.adapter.' part?
            const us = `system.adapter.${this.namespace}`;
            const host = this.host;
            const bind = this.config.bind;
            const port = this.config.port;
            this.log.debug(
                `Checking for adapter other than us (${us}) on our host/bind/port ${host}/${bind}/${port}...`,
            );
            const result = await this.getObjectViewAsync('system', 'instance', {
                startkey: 'system.adapter.',
                endkey: 'system.adapter.\u9999',
            });
            const instances = result.rows.map(row => row.value);
            const adapters = instances.filter(
                instance =>
                    // (this.log.debug(`id: ${instance._id}, enabled: ${instance.common.enabled}, host: ${instance.common.host}, port: ${instance.native.port}, bind: ${instance.native.bind}, `)) &&
                    instance &&
                    // Instance isn't ours
                    instance._id !== us &&
                    // Instance is enabled
                    instance.common.enabled &&
                    // Instance is on the same host as us
                    instance.common.host === host &&
                    instance.native &&
                    // Instance has a bind address
                    typeof instance.native.bind === 'string' &&
                    // Instance is on our bind address, or...
                    (instance.native.bind === bind ||
                        // We are using v4 address, and the instance is on all v4 interfaces, or...
                        (bind.includes('.') && instance.native.bind === '0.0.0.0') ||
                        // Instance is on v4 address, and we will listen on all, or...
                        (instance.native.bind.includes('.') && bind === '0.0.0.0') ||
                        // We are using v6 address, and the instance is on all v4 interfaces, or...
                        (bind.includes(':') && instance.native.bind === '::') ||
                        // Instance is on v6 address, and we will listen on all, or...
                        (instance.native.bind.includes(':') && bind === '::') ||
                        // TODO: These last two seem odd and maybe needs further investigation, but...
                        // Instance is on all v6 and we want all v4, or...
                        (instance.native.bind === '::' && bind === '0.0.0.0') ||
                        // Instance is on all v4, and we want all v6, or...
                        (instance.native.bind === '0.0.0.0' && bind === '::')) &&
                    // Port numbers are sometimes string and sometimes integer, so don't use '==='!
                    // Instance wants the same port as us, or...
                    (instance.native.port == port ||
                        // Instance is using LE still and it wants same port as us
                        (instance.native.secure &&
                            instance.native.leEnabled &&
                            instance.native.leUpdate &&
                            instance.native.leCheckPort == port)),
            );

            if (!adapters.length) {
                this.log.debug('No adapters found on same port, nothing to stop');
            } else {
                this.log.info(`Stopping adapter(s) on our host/bind/port ${host}/${bind}/${port}...`);
                this.stoppedAdapters = adapters.map(adapter => adapter._id);
                for (let i = 0; i < this.stoppedAdapters.length; i++) {
                    const config = await this.getForeignObjectAsync(this.stoppedAdapters[i]);
                    if (config) {
                        this.log.info(`Stopping ${config._id}`);
                        config.common.enabled = false;
                        await this.setForeignObjectAsync(config._id, config);
                    }
                }
            }
            this.donePortCheck = true;
        }
    }

    async restoreAdaptersOnSamePort(): Promise<void> {
        if (!this.stoppedAdapters) {
            this.log.debug('No previously shutdown adapters to restart');
        } else {
            this.log.info('Starting adapter(s) previously shutdown...');
            for (let i = 0; i < this.stoppedAdapters.length; i++) {
                const config = await this.getForeignObjectAsync(this.stoppedAdapters[i]);
                if (config) {
                    this.log.info(`Starting ${config._id}`);
                    config.common.enabled = true;
                    await this.setForeignObjectAsync(config._id, config);
                }
            }
            this.stoppedAdapters = null;
            this.donePortCheck = false;
        }
    }

    // TODO: this belongs in some util class or whatever
    _arraysMatch(arr1: unknown, arr2: unknown): boolean {
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
    }

    async generateCollection(collection: { id: string; commonName: string; altNames: string }): Promise<void> {
        this.log.debug(`Collection: ${JSON.stringify(collection)}`);

        // Create domains now as will be used to test any existing collection.
        const domains = collection.commonName
            .split(',')
            .map(d => d.trim())
            .filter(n => n);
        if (collection.altNames) {
            domains.push(
                ...collection.altNames
                    .replace(/\s/g, '')
                    .split(',')
                    .filter(n => n),
            );
        }
        this.log.debug(`domains: ${JSON.stringify(domains)}`);

        // Get an existing collection & see if it needs renewing
        let create = false;
        const existingCollection = (await this.certManager?.getCollection(collection.id)) as
            | CertificateCollection
            | null
            | undefined;
        if (!existingCollection) {
            this.log.info(`Collection ${collection.id} does not exist - will create`);
            create = true;
        } else {
            this.log.debug(`Existing: ${collection.id}: ${JSON.stringify(existingCollection)}`);

            try {
                // Decode certificate to check not due for renewal and parts match what is configured.
                const crt = x509.parseCert(existingCollection.cert.toString());
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
            // stopAdaptersOnSamePort can be called many times as has its own checks to prevent unnecessary action.
            await this.stopAdaptersOnSamePort();

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

            if (!this.acme || !this.account.full || !this.account.key) {
                this.log.error('ACME client not initialized');
                return;
            }
            let pems: { cert: string; chain: string } | undefined;
            try {
                pems = await this.acme.certificates.create({
                    account: this.account.full,
                    accountKey: this.account.key,
                    csr,
                    domains,
                    challenges: this.challenges,
                });
            } catch (err) {
                this.log.error(`Certificate request for ${collection.id} (${domains?.join(', ')}) failed: ${err}`);
            }

            this.log.debug('Done');

            if (pems) {
                let collectionToSet: CertificateCollection | null = {
                    from: this.namespace,
                    key: serverPem,
                    cert: pems.cert,
                    chain: [pems.cert, pems.chain],
                    domains,
                    staging: this.config.useStaging,
                    tsExpires: 0,
                };

                // Decode certificate to get expiry.
                // Kind of handy that this happens to verify certificate looks good too.
                try {
                    const crt = x509.parseCert(collectionToSet.cert.toString());
                    this.log.debug(`New certs notBefore ${crt.notBefore} notAfter ${crt.notAfter}`);
                    collectionToSet.tsExpires = Date.parse(crt.notAfter);
                } catch {
                    this.log.error(`Certificate returned for ${collection.id} looks invalid - not saving`);
                    collectionToSet = null;
                }

                if (collectionToSet) {
                    this.log.debug(`${collection.id} is ${JSON.stringify(collectionToSet)}`);
                    // Save it
                    await this.certManager?.setCollection(collection.id, collectionToSet);
                    this.log.info(`Collection ${collection.id} order success`);
                }
            }
        }
    }
}

if (require.main !== module) {
    // Export the constructor in compact mode
    module.exports = (options: Partial<AdapterOptions> | undefined) => new AcmeAdapter(options);
} else {
    // otherwise start the instance directly
    (() => new AcmeAdapter())();
}
