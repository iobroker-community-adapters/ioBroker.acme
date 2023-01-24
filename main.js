'use strict';

/*
 * Created with @iobroker/create-adapter v2.3.0
 */

// The adapter-core module gives you access to the core ioBroker functions
// you need to create an adapter
const utils = require('@iobroker/adapter-core');
const pkg = require('./package.json');

const ACME = require('acme');
const Keypairs = require('@root/keypairs');
const CSR = require('@root/csr');
const PEM = require('@root/pem');

const accountObjectId = 'account';

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
            key: null
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
        this.log.debug('config: ' + JSON.stringify(this.config));

        if (!this.config?.collections?.length) {
            this.terminate('No collections configured - nothing to do');
        } else {
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
        this.terminate('Done');
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
        } catch (e) {
            callback();
        }
    }

    initChallenges() {
        if (this.config.http01Active) {
            this.log.debug('Init http-01 challenge server');
            const thisChallenge = require('./lib/http-01-challenge-server').create({
                port: this.config.http01Port,
                address: this.config.http01Bind,
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

            this.log.debug('dns-01 options: ' + JSON.stringify(dns01Options));

            // Do this inside try... catch as module is configurable
            let thisChallenge;
            try {
                thisChallenge = require(this.config.dns01Module).create(dns01Options);
            } catch (err) {
                this.log.error('Failed to load dns-01 challenge module: ' + err);
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
                this.log.debug('ACME: ' + ev + ': ' + msg);
        }
    }

    async initAcme() {
        if (!this.acme) {
            // Doesn't exist yet, actually do init
            const directoryUrl = this.config.useStaging ?
                'https://acme-staging-v02.api.letsencrypt.org/directory' :
                'https://acme-v02.api.letsencrypt.org/directory';
            this.log.debug('Using URL: ' + directoryUrl);

            this.acme = ACME.create({
                maintainerEmail: this.config.maintainerEmail,
                packageAgent: pkg.name + '/' + pkg.version,
                notify: this.acmeNotify.bind(this),
                debug: true
            });
            await this.acme.init(directoryUrl);

            // Try and load saved object
            const accountObject = await this.getObjectAsync(accountObjectId);
            if (accountObject) {
                this.log.debug('Loaded existing ACME account: ' + JSON.stringify(accountObject));

                if (accountObject.native?.full?.contact != 'mailto:' + this.config.maintainerEmail) {
                    this.log.warn('Saved account does not match maintainer email, will recreate.');
                } else {
                    this.account = accountObject.native;
                }
            }

            if (!this.account.full) {
                this.log.info('Registering new ACME account...');

                // Register new account
                const accountKeypair = await Keypairs.generate({ kty: 'EC', format: 'jwk' });
                this.log.debug('accountKeypair: ' + JSON.stringify(accountKeypair));
                this.account.key = accountKeypair.private;

                this.account.full = await this.acme.accounts.create({
                    subscriberEmail: this.config.maintainerEmail,
                    agreeToTerms: true,
                    accountKey: this.account.key
                });
                this.log.debug('Created account: ' + JSON.stringify(this.account));

                await this.extendObjectAsync(accountObjectId, { native: this.account });
            }
        }
    }

    async generateCollection(collection) {
        this.log.debug('Collection: ' + JSON.stringify(collection));

        const domains = [collection.subject];
        if (collection.altNames) {
            domains.push(...collection.altNames.split(','));
        }
        this.log.debug('domains: ' + JSON.stringify(domains));

        const serverKeypair = await Keypairs.generate({ kty: 'RSA', format: 'jwk' });
        const serverPem = await Keypairs.export({ jwk: serverKeypair.private });
        const serverKey = await Keypairs.import({ pem: serverPem });

        const csrDer = await CSR.csr({
            jwk: serverKey,
            domains: domains,
            encoding: 'der'
        });
        const csr = PEM.packBlock({
            type: 'CERTIFICATE REQUEST',
            bytes: csrDer
        });

        let pems;
        try {
            pems = await this.acme.certificates.create({
                account: this.account.account,
                accountKey: this.account.key,
                csr,
                domains: domains,
                challenges: this.challenges
            });
        } catch (err) {
            this.log.error(`Certificate request for ${domains} failed: ${err}`);
        }

        if (pems) {
            // const  fullchain = pems.cert + '\n' + pems.chain + '\n'; 

            this.log.debug('Done');
            this.log.debug('Pem:\n' + serverPem);
            this.log.debug('Cert:\n' + pems.cert);
            this.log.debug('Chain:\n' + pems.chain);

            // TODO: save it <:o)
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