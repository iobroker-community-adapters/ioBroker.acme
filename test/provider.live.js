const fs = require('node:fs');
const path = require('node:path');
const { createRequire } = require('node:module');
const { promisify } = require('node:util');

const repoRoot = path.join(__dirname, '..');
const repoRequire = createRequire(path.join(repoRoot, 'package.json'));

function getCreateFunction(moduleExport) {
    if (moduleExport && typeof moduleExport.create === 'function') {
        return moduleExport.create.bind(moduleExport);
    }
    if (moduleExport && moduleExport.default && typeof moduleExport.default.create === 'function') {
        return moduleExport.default.create.bind(moduleExport.default);
    }
    return null;
}

function loadLiveConfig() {
    const configPath = process.env.ACME_DNS_LIVE_CONFIG;
    if (!configPath) {
        return null;
    }

    const absolutePath = path.isAbsolute(configPath) ? configPath : path.join(repoRoot, configPath);
    const raw = fs.readFileSync(absolutePath, 'utf8');
    const parsed = JSON.parse(raw);

    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        throw new Error('ACME_DNS_LIVE_CONFIG must contain a JSON object keyed by provider package name');
    }

    return parsed;
}

function buildChallengePayload(providerName, entry) {
    const challenge = entry && entry.challenge;
    if (!challenge || typeof challenge !== 'object') {
        throw new Error(`${providerName}: missing challenge object in live config`);
    }

    for (const key of ['dnsZone', 'dnsPrefix', 'dnsAuthorization']) {
        if (!challenge[key] || typeof challenge[key] !== 'string') {
            throw new Error(`${providerName}: challenge.${key} must be a non-empty string`);
        }
    }

    const dnsHost = challenge.dnsHost || `${challenge.dnsPrefix}.${challenge.dnsZone}`;

    const challengeData = {
        dnsHost,
        dnsZone: challenge.dnsZone,
        dnsPrefix: challenge.dnsPrefix,
        dnsAuthorization: challenge.dnsAuthorization,
    };

    return {
        ...challengeData,
        challenge: {
            ...challengeData,
        },
    };
}

describe('DNS provider live checks (optional)', function () {
    this.timeout(180000);

    let liveConfig;
    try {
        liveConfig = loadLiveConfig();
    } catch (err) {
        it('fails when live config is invalid', () => {
            throw err;
        });
        return;
    }

    if (!liveConfig) {
        it('skips because ACME_DNS_LIVE_CONFIG is not set', function () {
            this.skip();
        });
        return;
    }

    const providers = Object.keys(liveConfig);
    if (!providers.length) {
        it('skips because ACME_DNS_LIVE_CONFIG contains no provider entries', function () {
            this.skip();
        });
        return;
    }

    let request;
    try {
        const rootRequest = repoRequire('@root/request');
        request = promisify(rootRequest);
    } catch {
        request = undefined;
    }

    for (const providerName of providers) {
        it(`validates provider ${providerName}`, async () => {
            const entry = liveConfig[providerName] || {};
            const providerConfig = entry.config || {};

            const moduleExport = repoRequire(providerName);
            const create = getCreateFunction(moduleExport);
            if (!create) {
                throw new Error(`${providerName}: module does not expose create()`);
            }

            const handler = create(providerConfig);
            const payload = buildChallengePayload(providerName, entry);

            if (typeof handler.init === 'function') {
                await handler.init({ request });
            }

            let setCompleted = false;
            try {
                await handler.set(payload);
                setCompleted = true;

                if (typeof handler.get === 'function') {
                    await handler.get(payload);
                }
            } finally {
                if (setCompleted && typeof handler.remove === 'function') {
                    await handler.remove(payload);
                }
                if (typeof handler.shutdown === 'function') {
                    await handler.shutdown();
                }
            }
        });
    }
});
