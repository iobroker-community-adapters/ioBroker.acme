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
const x509_js_1 = __importDefault(require("x509.js"));
const package_json_1 = __importDefault(require("../package.json"));
const http_01_challenge_server_1 = require("./lib/http-01-challenge-server");
const http_01_challenge_publisher_1 = require("./lib/http-01-challenge-publisher");
const greenlock_challenge_shim_1 = require("./lib/greenlock-challenge-shim");
const dns_01_ionos_1 = require("./lib/dns-01-ionos");
const dns_01_hetzner_1 = require("./lib/dns-01-hetzner");
const dns_01_dynu_1 = require("./lib/dns-01-dynu");
/**
 * DNS-01 providers implemented in this adapter because no acme-dns-01-*
 * package exists for them on npm. They follow the same plugin contract, so
 * everything downstream treats them like any other module.
 */
const localDns01Modules = {
    'acme-dns-01-ionos': dns_01_ionos_1.create,
    'acme-dns-01-hetzner': dns_01_hetzner_1.create,
    'acme-dns-01-dynu': dns_01_dynu_1.create,
};
const accountObjectId = 'account';
// Renew 7 days before expiry
const renewWindow = 60 * 60 * 24 * 7 * 1000;
class AcmeAdapter extends utils.Adapter {
    account;
    challenges;
    toShutdown;
    donePortCheck;
    certManager;
    acme = null;
    /** Greenlock plugins wrapped for acme-client, keyed by challenge type. */
    shims = {};
    stoppedAdapters;
    /**
     * Only true when http-01 tokens are delivered by our own listener, which is
     * the one case in which whatever else holds that port has to give way.
     */
    http01NeedsPort = false;
    /** Kept apart from the challenge handler so the state is cleared either way. */
    http01Publisher = null;
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
            url: null,
            key: null,
            email: null,
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
            // shutdown() is synchronous, but the state write is not, and we are
            // about to terminate - so wait for it here.
            await this.http01Publisher?.clear();
        }
        catch (err) {
            this.log.error(`Failed to withdraw published challenges: ${AcmeAdapter.getErrorMessage(err)}`);
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
            const mode = this.config.http01Mode || 'auto';
            this.log.debug(`Init http-01 challenge (delivery: ${mode})`);
            this.challenges['http-01'] = await this.initHttp01Challenge(mode);
            this.toShutdown.push(this.challenges['http-01']);
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
                case 'acme-dns-01-ionos':
                case 'acme-dns-01-hetzner':
                case 'acme-dns-01-dynu':
                    // Implemented in this repository, not on npm. None reports a
                    // propagation delay of its own, so the generic default from
                    // io-package.json applies.
                    dns01Options.log = (message) => this.log.debug(`dns-01: ${message}`);
                    break;
                case 'acme-dns-01-ednsde':
                    // eDNS' set() polls the zone's authoritative nameservers
                    // until they all serve the record, so it reports
                    // propagationDelay 0 and skipChallengeTest itself. Keep the
                    // generic default from io-package.json from overwriting
                    // that, or acme.js waits another two minutes for nothing.
                    delete dns01Props.propagationDelay;
                    // eDNS answers a name it has already published from a cache
                    // with the record's 300s TTL, so a certificate covering a
                    // domain and its wildcard waits that out once. Without
                    // somewhere to report that, the log simply goes quiet for
                    // minutes and looks like a hang.
                    dns01Options.log = (message) => this.log.debug(`dns-01: ${message}`);
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
                const localFactory = localDns01Modules[this.config.dns01Module];
                if (localFactory) {
                    // Shipped with the adapter rather than pulled from npm.
                    thisChallenge = localFactory(dns01Options);
                }
                else {
                    // Dynamic import - module name comes from config
                    const dns01Module = await import(this.config.dns01Module);
                    if (dns01Module.default) {
                        thisChallenge = dns01Module.default.create(dns01Options);
                    }
                    else {
                        thisChallenge = dns01Module.create(dns01Options);
                    }
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
    /**
     * Decide how http-01 tokens reach the CA and return the handler that does it.
     *
     * Publishing (see http-01-challenge-publisher.ts) is preferred because it
     * needs no port of its own and therefore does not have to stop whatever is
     * on port 80. Whether it works cannot be assumed, though - it takes a web
     * or admin instance with a recent enough `@iobroker/webserver`, or a
     * reverse proxy forwarding the path to one - so 'auto' asks the port
     * directly and only falls back to the old behaviour if it does not answer.
     *
     * @param mode the configured delivery mode
     */
    async initHttp01Challenge(mode) {
        const startOwnServer = () => {
            this.http01NeedsPort = true;
            // Creating it does not make it listen - that happens on the first
            // set() - so nothing is bound before we know a cert is due.
            return (0, http_01_challenge_server_1.create)({
                port: this.config.port,
                address: this.config.bind,
                log: this.log,
            });
        };
        if (mode === 'standalone') {
            this.log.debug('http-01: own challenge server requested by configuration');
            return startOwnServer();
        }
        await this.createHttp01ChallengeState();
        const publisher = (0, http_01_challenge_publisher_1.create)({
            log: this.log,
            write: challenges => this.publishHttp01Challenges(challenges),
        });
        // Held on to even when it does not end up being the handler: the probe
        // below publishes through it, and that has to be cleaned up.
        this.http01Publisher = publisher;
        if (mode === 'external') {
            this.log.info('http-01: challenges are published for an external responder - no port will be opened');
            return publisher;
        }
        const answers = await (0, http_01_challenge_publisher_1.probeHttp01Endpoint)({
            publisher,
            address: this.config.bind,
            port: this.config.port,
            log: this.log,
        });
        if (answers) {
            this.log.info(`http-01: published challenges are already served on port ${this.config.port} - no adapter has to be stopped`);
            return publisher;
        }
        // Nothing to fix if the port is simply ours - the hint about who could
        // have answered belongs where a conflicting adapter is actually found.
        this.log.info(`http-01: nothing serves published challenges on port ${this.config.port} - using an own challenge server`);
        return startOwnServer();
    }
    /**
     * The state is read by other adapters, so it has to exist even on an
     * instance that was created before this feature.
     */
    async createHttp01ChallengeState() {
        await this.setObjectNotExistsAsync('info', {
            type: 'channel',
            common: { name: 'Information' },
            native: {},
        });
        await this.setObjectNotExistsAsync(http_01_challenge_publisher_1.HTTP01_CHALLENGE_STATE, {
            type: 'state',
            common: {
                name: 'Pending HTTP-01 challenge tokens',
                type: 'string',
                role: 'json',
                read: true,
                write: false,
                def: '{}',
            },
            native: {},
        });
    }
    /**
     * @param challenges the tokens currently valid, keyed by token
     */
    async publishHttp01Challenges(challenges) {
        await this.setStateAsync(http_01_challenge_publisher_1.HTTP01_CHALLENGE_STATE, JSON.stringify(challenges), true);
    }
    async initAcme() {
        if (this.acme) {
            return;
        }
        const directoryUrl = this.config.useStaging
            ? acme.directory.letsencrypt.staging
            : acme.directory.letsencrypt.production;
        this.log.debug(`Using URL: ${directoryUrl}`);
        // Route the library's own diagnostics into the adapter log.
        acme.setLogger(message => this.log.debug(`acme-client: ${message}`));
        // ACME.js sent a packageAgent; keep identifying ourselves to the CA.
        acme.axios.defaults.headers.common['User-Agent'] = `${package_json_1.default.name}/${package_json_1.default.version}`;
        // Wrap every challenge handler so acme-client can drive it.
        for (const [type, handler] of Object.entries(this.challenges)) {
            this.shims[type] = (0, greenlock_challenge_shim_1.createChallengeShim)(handler, {
                log: message => this.log.debug(`${type}: ${message}`),
            });
        }
        // Try and load a saved account
        const accountObject = await this.getObjectAsync(accountObjectId);
        const saved = accountObject?.native;
        if (saved) {
            if (saved.full !== undefined || typeof saved.key !== 'string') {
                // Pre-migration account: ACME.js kept a JWK plus its own account
                // object, neither of which acme-client can use. Registering a
                // fresh account is cheap and happens once per installation.
                this.log.info('Saved ACME account is in the old ACME.js format - registering a new one.');
            }
            else if (saved.email && saved.email !== this.config.maintainerEmail) {
                this.log.warn('Saved account does not match maintainer email, will recreate.');
            }
            else {
                this.account = {
                    url: saved.url ?? null,
                    key: saved.key,
                    email: saved.email ?? null,
                };
                this.log.debug(`Loaded existing ACME account: ${this.account.url}`);
            }
        }
        if (!this.account.key) {
            this.log.info('Registering new ACME account...');
            const accountKey = await acme.crypto.createPrivateKey();
            this.account.key = accountKey.toString();
            this.account.email = this.config.maintainerEmail;
            this.acme = new acme.Client({
                directoryUrl,
                accountKey: this.account.key,
            });
            await this.acme.createAccount({
                termsOfServiceAgreed: true,
                contact: [`mailto:${this.config.maintainerEmail}`],
            });
            this.account.url = this.acme.getAccountUrl();
            this.log.debug(`Created account: ${this.account.url}`);
            await this.extendObjectAsync(accountObjectId, {
                native: this.account,
            });
        }
        else {
            this.acme = new acme.Client({
                directoryUrl,
                accountKey: this.account.key,
                accountUrl: this.account.url ?? undefined,
            });
        }
    }
    async stopAdaptersOnSamePort() {
        // TODO: Maybe this should be in some sort of utility so other adapters can 'grab' a port in use?
        // Stop conflicting adapters using our challenge server port only if we are going to need it and haven't already checked.
        // With published challenges nobody has to give the port up, so http01NeedsPort stays false and this is skipped entirely.
        if (this.http01NeedsPort && !this.donePortCheck) {
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
                this.log.info('This outage is avoidable: on a web/admin version whose @iobroker/webserver serves published ' +
                    'ACME challenges, nothing has to be stopped.');
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
            if (!this.acme) {
                this.log.error('ACME client not initialized');
                return;
            }
            // Replaces Keypairs.generate + export + import + CSR.csr + PEM.packBlock.
            const [serverKeyBuf, csr] = await acme.crypto.createCsr({
                commonName: domains[0],
                altNames: domains.slice(1),
            });
            const serverPem = serverKeyBuf.toString();
            // If any plugin verifies propagation itself, skip acme-client's own
            // pre-flight DNS check: it uses the system resolver and can trip
            // over negative caching.
            const skipChallengeVerification = Object.values(this.shims).some(shim => shim.skipChallengeTest);
            if (skipChallengeVerification) {
                this.log.debug('skipChallengeVerification=true (plugin verifies propagation internally)');
            }
            let certPem;
            try {
                certPem = await this.acme.auto({
                    csr,
                    email: this.config.maintainerEmail,
                    termsOfServiceAgreed: true,
                    skipChallengeVerification,
                    // Prefer dns-01 when configured: it is the only one that can
                    // validate wildcards, and needs no inbound port.
                    challengePriority: Object.keys(this.shims).sort(),
                    challengeCreateFn: (authz, challenge, keyAuthorization) => {
                        const shim = this.shims[challenge.type];
                        if (!shim) {
                            return Promise.reject(new Error(`No handler for ${challenge.type} challenge`));
                        }
                        return shim.challengeCreateFn(authz, challenge, keyAuthorization);
                    },
                    challengeRemoveFn: (authz, challenge, keyAuthorization) => {
                        const shim = this.shims[challenge.type];
                        if (!shim) {
                            return Promise.resolve();
                        }
                        return shim.challengeRemoveFn(authz, challenge, keyAuthorization);
                    },
                });
            }
            catch (err) {
                this.log.error(`Certificate request for ${collection.id} (${domains?.join(', ')}) failed: ${AcmeAdapter.getErrorMessage(err)}`);
            }
            this.log.debug('Done');
            if (certPem) {
                // auto() returns the full chain; the leaf is the first block.
                const chainParts = acme.crypto.splitPemChain(certPem);
                let collectionToSet = {
                    from: this.namespace,
                    key: serverPem,
                    cert: chainParts[0],
                    chain: chainParts,
                    domains,
                    staging: this.config.useStaging,
                    tsExpires: 0,
                };
                // Decode certificate to get expiry.
                // Kind of handy that this happens to verify certificate looks good too.
                try {
                    const crt = x509_js_1.default.parseCert(collectionToSet.cert.toString());
                    this.log.debug(`New certs notBefore ${crt.notBefore} notAfter ${crt.notAfter}`);
                    collectionToSet.tsExpires = Date.parse(crt.notAfter);
                }
                catch {
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
    module.exports = (options) => new AcmeAdapter(options);
}
else {
    // otherwise start the instance directly
    (() => new AcmeAdapter())();
}
