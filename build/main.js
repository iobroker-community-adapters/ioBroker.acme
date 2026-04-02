"use strict";
/*
 * Created with @iobroker/create-adapter v2.3.0
 */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
// The adapter-core module gives you access to the core ioBroker functions
// you need to create an adapter
const utils = __importStar(require("@iobroker/adapter-core"));
const webserver_1 = require("@iobroker/webserver");
const acme = __importStar(require("acme-client"));
const node_crypto_1 = __importDefault(require("node:crypto"));
const x509_js_1 = __importDefault(require("x509.js"));
const http_01_challenge_server_1 = require("./lib/http-01-challenge-server");
const accountObjectId = 'account';
// Renew 7 days before expiry
const renewWindow = 60 * 60 * 24 * 7 * 1000;
class AcmeAdapter extends utils.Adapter {
    account;
    challenges;
    toShutdown;
    donePortCheck;
    certManager;
    acmeClient = null;
    stoppedAdapters;
    /**
     * Safely extract an error message from an unknown error value.
     */
    static getErrorMessage(err) {
        if (err instanceof Error) {
            return err.message;
        }
        return String(err);
    }
    constructor(options = {}) {
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
        this.on('unload', this.onUnload.bind(this));
    }
    /**
     * Is called when adapter shuts down - callback has to be called under any circumstances!
     */
    onUnload(callback) {
        try {
            this.log.debug('Cleaning up resources...');
            for (const challenge of this.toShutdown) {
                challenge.shutdown();
            }
        }
        catch {
            // ignore
        }
        finally {
            callback();
        }
    }
    /**
     * Is called when databases are connected and adapter received configuration.
     */
    async onReady() {
        // Redact sensitive fields before logging
        const safeConfig = { ...this.config };
        const sensitiveKeys = ['dns01OapiKey', 'dns01OapiPassword', 'dns01Okey', 'dns01Osecret', 'dns01Otoken'];
        for (const key of sensitiveKeys) {
            if (safeConfig[key]) {
                safeConfig[key] = '***REDACTED***';
            }
        }
        this.log.debug(`config: ${JSON.stringify(safeConfig)}`);
        acme.setLogger((message) => this.log.debug(`acme-client: ${message}`));
        this.certManager = new webserver_1.CertificateManager({ adapter: this });
        if (!this.config?.collections?.length) {
            this.terminate('No collections configured - nothing to order');
        }
        else if (!this.config.maintainerEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(this.config.maintainerEmail)) {
            this.terminate('Invalid or missing maintainer email address');
        }
        else {
            // Setup challenges
            await this.initChallenges();
            if (!Object.keys(this.challenges).length) {
                this.log.error('Failed to initiate any challenges');
            }
            else {
                try {
                    // Init ACME/account, etc
                    await this.initAcme();
                    // Loop round collections and generate certs
                    for (const collection of this.config.collections) {
                        await this.generateCollection(collection);
                    }
                }
                catch (err) {
                    this.log.error(`Failed in ACME init/generation: ${AcmeAdapter.getErrorMessage(err)}`);
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
            }
            else {
                this.log.debug(`No collections found`);
            }
        }
        catch (err) {
            this.log.error(`Failed in existing collection check/purge: ${AcmeAdapter.getErrorMessage(err)}`);
        }
        this.log.debug('Shutdown...');
        for (const challenge of this.toShutdown) {
            challenge.shutdown();
        }
        try {
            await this.restoreAdaptersOnSamePort();
        }
        catch (err) {
            this.log.error(`Failed to restore adapters on same port: ${AcmeAdapter.getErrorMessage(err)}`);
        }
        this.terminate('Processing complete');
    }
    async initChallenges() {
        if (this.config.http01Active) {
            this.log.debug('Init http-01 challenge server');
            // This does not actually cause the challenge server to start listening, so we don't need to do port check at this time.
            const thisChallenge = (0, http_01_challenge_server_1.create)({
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
            const dns01Options = {};
            const dns01Props = {};
            for (const [key, value] of Object.entries(this.config)) {
                if (key.startsWith('dns01O')) {
                    // An option...
                    dns01Options[key.slice(6)] = value;
                }
                else if (key.startsWith('dns01P')) {
                    // A property to add after creation
                    dns01Props[key.slice(6)] = value;
                }
            }
            // Add the module-specific options
            switch (this.config.dns01Module) {
                case 'acme-dns-01-namecheap':
                    dns01Options.baseUrl = 'https://api.namecheap.com/xml.response';
                    break;
                case 'acme-dns-01-netcup':
                    // Netcup's set() polls until the TXT record is visible on
                    // authoritative, public, and system resolvers — the NPM
                    // package handles propagation internally and sets its own
                    // propagationDelay to 0; don't let the generic default
                    // from io-package.json override it.
                    dns01Options.verifyPropagation = true;
                    delete dns01Props.propagationDelay;
                    break;
            }
            // Log dns-01 options with sensitive values redacted
            const safeOpts = { ...dns01Options };
            const sensitiveOptKeys = ['apiKey', 'apiPassword', 'key', 'secret', 'token'];
            for (const k of sensitiveOptKeys) {
                if (safeOpts[k]) {
                    safeOpts[k] = '***REDACTED***';
                }
            }
            this.log.debug(`dns-01 options: ${JSON.stringify(safeOpts)}`);
            // Do this inside try... catch as the module is configurable
            let thisChallenge;
            try {
                // Dynamic import - module name comes from config
                const dns01Module = await import(this.config.dns01Module);
                if (dns01Module.default) {
                    thisChallenge = dns01Module.default.create(dns01Options);
                }
                else {
                    thisChallenge = dns01Module.create(dns01Options);
                }
            }
            catch (err) {
                this.log.error(`Failed to load dns-01 challenge module '${this.config.dns01Module}': ${AcmeAdapter.getErrorMessage(err)}`);
            }
            if (thisChallenge) {
                // Add extra properties
                // TODO: only add where needed?
                for (const [key, value] of Object.entries(dns01Props)) {
                    thisChallenge[key] = value;
                }
                // The Netcup set() method polls until the TXT record is confirmed
                // on public DNS (1.1.1.1/8.8.8.8), so no additional propagation
                // delay is needed. Forcing 0 prevents acme.js from waiting an
                // extra propagationDelay ms before its Pre-Flight DNS check,
                // which could race against DNS cache expiry on 1.1.1.1.
                if (this.config.dns01Module === 'acme-dns-01-netcup') {
                    thisChallenge.propagationDelay = 0;
                    this.log.debug('dns-01: propagationDelay set to 0 for Netcup (set() handles propagation internally)');
                }
                this.challenges['dns-01'] = thisChallenge;
            }
        }
    }
    async initAcme() {
        if (!this.acmeClient) {
            // Doesn't exist yet, actually do init
            const directoryUrl = this.config.useStaging
                ? acme.directory.letsencrypt.staging
                : acme.directory.letsencrypt.production;
            this.log.debug(`Using URL: ${directoryUrl}`);
            // Try and load a saved object
            const accountObject = await this.getObjectAsync(accountObjectId);
            if (accountObject) {
                this.log.debug(`Loaded existing ACME account: ${JSON.stringify(accountObject)}`);
                // Check if the saved account matches our current config
                const native = accountObject.native;
                if (native?.maintainerEmail !== this.config.maintainerEmail) {
                    this.log.warn('Saved account does not match maintainer email, will recreate.');
                }
                else if (native?.useStaging !== this.config.useStaging) {
                    this.log.info(`Saved account was created for ${native?.useStaging ? 'staging' : 'production'} LE, but current config uses ${this.config.useStaging ? 'staging' : 'production'} — will recreate.`);
                }
                else {
                    this.account = native;
                }
            }
            let accountKeyPem;
            if (this.account.key) {
                this.log.debug('Converting existing account key to PEM...');
                try {
                    // acme-client expects PEM, convert from JWK if needed
                    accountKeyPem = node_crypto_1.default
                        .createPrivateKey({
                        key: this.account.key,
                        format: 'jwk',
                    })
                        .export({
                        type: 'pkcs8',
                        format: 'pem',
                    });
                }
                catch (err) {
                    this.log.error(`Failed to convert account key: ${AcmeAdapter.getErrorMessage(err)}`);
                    this.account = { full: null, key: null };
                }
            }
            if (!accountKeyPem) {
                this.log.info('Generating new account key...');
                accountKeyPem = await acme.crypto.createPrivateKey();
                // Store as JWK for compatibility with previous versions if they were to roll back,
                // although we are moving forward to acme-client.
                this.account.key = node_crypto_1.default.createPrivateKey(accountKeyPem).export({ format: 'jwk' });
            }
            this.acmeClient = new acme.Client({
                directoryUrl,
                accountKey: accountKeyPem,
            });
            if (!this.account.full) {
                this.log.info('Registering new ACME account...');
                this.account.full = await this.acmeClient.createAccount({
                    termsOfServiceAgreed: true,
                    contact: [`mailto:${this.config.maintainerEmail}`],
                });
                this.log.debug(`Created account: ${JSON.stringify(this.account)}`);
                await this.extendObjectAsync(accountObjectId, {
                    native: {
                        ...this.account,
                        maintainerEmail: this.config.maintainerEmail,
                        useStaging: this.config.useStaging,
                    },
                });
            }
        }
    }
    async stopAdaptersOnSamePort() {
        // TODO: Maybe this should be in some sort of utility so other adapters can 'grab' a port in use?
        // Stop conflicting adapters using our challenge server port only if we are going to need it and haven't already checked.
        if (this.config.http01Active && !this.donePortCheck) {
            // TODO: is there a better way than hardcoding this 'system.adapter.' part?
            const us = `system.adapter.${this.namespace}`;
            const host = this.host;
            const bind = this.config.bind;
            const port = this.config.port;
            this.log.debug(`Checking for adapter other than us (${us}) on our host/bind/port ${host}/${bind}/${port}...`);
            const result = await this.getObjectViewAsync('system', 'instance', {
                startkey: 'system.adapter.',
                endkey: 'system.adapter.\u9999',
            });
            const instances = result.rows.map(row => row.value);
            const adapters = instances.filter(instance => 
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
                        instance.native.leCheckPort == port)));
            if (!adapters.length) {
                this.log.debug('No adapters found on same port, nothing to stop');
            }
            else {
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
    async restoreAdaptersOnSamePort() {
        if (!this.stoppedAdapters) {
            this.log.debug('No previously shutdown adapters to restart');
        }
        else {
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
    /**
     * Compare two arrays for matching content regardless of order.
     * Correctly handles duplicates by sorting both arrays before comparison.
     */
    arraysMatch(arr1, arr2) {
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
        const sorted1 = [...arr1].sort();
        const sorted2 = [...arr2].sort();
        return sorted1.every((val, idx) => val === sorted2[idx]);
    }
    async generateCollection(collection) {
        this.log.debug(`Collection: ${JSON.stringify(collection)}`);
        // Create domains now as will be used to test any existing collection.
        const domains = collection.commonName
            .split(',')
            .map(d => d.trim())
            .filter(n => n);
        if (collection.altNames) {
            domains.push(...collection.altNames
                .replace(/\s/g, '')
                .split(',')
                .filter(n => n));
        }
        this.log.debug(`domains: ${JSON.stringify(domains)}`);
        // Get an existing collection & see if it needs renewing
        let create = false;
        const existingCollection = (await this.certManager?.getCollection(collection.id));
        if (!existingCollection) {
            this.log.info(`Collection ${collection.id} does not exist - will create`);
            create = true;
        }
        else {
            this.log.debug(`Existing: ${collection.id}: ${JSON.stringify(existingCollection)}`);
            try {
                // Decode certificate to check not due for renewal and parts match what is configured.
                const crt = x509_js_1.default.parseCert(existingCollection.cert.toString());
                this.log.debug(`Existing cert: ${JSON.stringify(crt)}`);
                if (Date.now() > Date.parse(crt.notAfter) - renewWindow) {
                    this.log.info(`Collection ${collection.id} expiring soon - will renew`);
                    create = true;
                }
                else if (collection.commonName !== crt.subject.commonName) {
                    this.log.info(`Collection ${collection.id} common name does not match - will renew`);
                    create = true;
                }
                else if (!this.arraysMatch(domains, crt.altNames)) {
                    this.log.info(`Collection ${collection.id} alt names do not match - will renew`);
                    create = true;
                }
                else if (this.config.useStaging !== existingCollection.staging) {
                    this.log.info(`Collection ${collection.id} staging flags do not match - will renew`);
                    create = true;
                }
                else {
                    this.log.debug(`Collection ${collection.id} certificate already looks good`);
                }
            }
            catch (err) {
                this.log.error(`Collection ${collection.id} exists but looks invalid (${AcmeAdapter.getErrorMessage(err)}) - will renew`);
                create = true;
            }
        }
        if (create) {
            // stopAdaptersOnSamePort can be called many times as has its own checks to prevent unnecessary action.
            await this.stopAdaptersOnSamePort();
            if (!this.acmeClient || !this.account.full || !this.account.key) {
                this.log.error('ACME client not initialized');
                return;
            }
            let cert;
            try {
                // Generate CSR
                const [serverKey, csr] = await acme.crypto.createCsr({
                    commonName: collection.commonName.split(',')[0].trim(),
                    altNames: domains,
                });
                // Create the order first to check its status.
                // This prevents 403 errors if the order is already 'valid' on the ACME server.
                this.log.debug(`Placing order for ${domains.join(', ')}...`);
                let order = await this.acmeClient.createOrder({
                    identifiers: domains.map(d => ({ type: 'dns', value: d })),
                });
                if (order.status === 'processing') {
                    this.log.info(`Order for ${domains.join(', ')} is currently processing. Waiting...`);
                    order = await this.acmeClient.waitForValidStatus(order);
                }
                if (order.status === 'valid') {
                    this.log.info(`Order for ${domains.join(', ')} is already valid. Skipping challenges and redeeming certificate...`);
                    cert = (await this.acmeClient.getCertificate(order)).toString();
                }
                else {
                    // Use auto() to handle the pending challenge/finalization flow.
                    const challengePriority = [];
                    if (this.config.http01Active) {
                        challengePriority.push('http-01');
                    }
                    if (this.config.dns01Active) {
                        challengePriority.push('dns-01');
                    }
                    cert = (await this.acmeClient.auto({
                        csr,
                        email: this.config.maintainerEmail,
                        termsOfServiceAgreed: true,
                        challengePriority,
                        challengeCreateFn: async (authz, challenge, keyAuthorization) => {
                            this.log.debug(`Satisfying challenge ${challenge.type} for ${authz.identifier.value}`);
                            const handler = this.challenges[challenge.type];
                            if (!handler) {
                                throw new Error(`No handler for challenge type ${challenge.type}`);
                            }
                            const challengeData = {
                                identifier: { ...authz.identifier },
                                token: challenge.token,
                                keyAuthorization,
                                // Maintain compatibility with older challenge handlers that expect a nested challenge object
                                challenge: {
                                    token: challenge.token,
                                    keyAuthorization,
                                },
                            };
                            if (challenge.type === 'dns-01') {
                                if (this.config.dns01Alias) {
                                    this.log.info(`Using DNS Alias: _acme-challenge.${this.config.dns01Alias} instead of ${authz.identifier.value}`);
                                    challengeData.identifier.value = this.config.dns01Alias;
                                }
                                challengeData.dnsAuthorization = node_crypto_1.default
                                    .createHash('sha256')
                                    .update(keyAuthorization)
                                    .digest('base64url');
                            }
                            await handler.set(challengeData);
                        },
                        challengeRemoveFn: async (authz, challenge, keyAuthorization) => {
                            this.log.debug(`Removing challenge ${challenge.type} for ${authz.identifier.value}`);
                            const handler = this.challenges[challenge.type];
                            if (handler) {
                                const removeData = {
                                    identifier: { ...authz.identifier },
                                    token: challenge.token,
                                    challenge: {
                                        token: challenge.token,
                                        keyAuthorization,
                                    },
                                };
                                if (challenge.type === 'dns-01' && this.config.dns01Alias) {
                                    removeData.identifier.value = this.config.dns01Alias;
                                }
                                await handler.remove(removeData);
                            }
                        },
                    })).toString();
                }
                const serverKeyPem = serverKey.toString();
                // Split bundle: first is leaf, everything is chain
                const certs = cert.match(/-----BEGIN CERTIFICATE-----[\s\S]+?-----END CERTIFICATE-----/g) || [cert];
                const leafCert = certs[0];
                const collectionToSet = {
                    from: this.namespace,
                    key: serverKeyPem,
                    cert: leafCert,
                    chain: certs,
                    domains,
                    staging: this.config.useStaging,
                    tsExpires: 0,
                };
                // Decode certificate to get expiry.
                try {
                    const crt = x509_js_1.default.parseCert(leafCert);
                    this.log.debug(`New certs notBefore ${crt.notBefore} notAfter ${crt.notAfter}`);
                    collectionToSet.tsExpires = Date.parse(crt.notAfter);
                }
                catch {
                    this.log.error(`Certificate returned for ${collection.id} looks invalid - not saving`);
                    return;
                }
                this.log.debug(`${collection.id} is ${JSON.stringify(collectionToSet)}`);
                // Save it
                await this.certManager?.setCollection(collection.id, collectionToSet);
                this.log.info(`Collection ${collection.id} order success`);
            }
            catch (err) {
                this.log.error(`Certificate request for ${collection.id} (${domains?.join(', ')}) failed: ${AcmeAdapter.getErrorMessage(err)}`);
            }
            this.log.debug('Done');
        }
    }
}
if (require.main !== module) {
    // Export the constructor in compact mode
    module.exports = (options) => new AcmeAdapter(options);
}
else {
    // otherwise start the instance directly
    (() => new AcmeAdapter())();
}
