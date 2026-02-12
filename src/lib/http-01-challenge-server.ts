// Based on https://www.npmjs.com/package/acme-http-01-standalone

import { createServer, type Server, type IncomingMessage, type ServerResponse } from 'node:http';

interface ChallengeServerConfig {
    log: ioBroker.Log;
    port: number;
    address: string;
}

interface ChallengeData {
    challenge: {
        token: string;
        keyAuthorization: string;
    };
}

interface ChallengeServer {
    init: (opts: Record<string, unknown>) => Promise<null>;
    set: (data: ChallengeData) => Promise<null>;
    get: (data: ChallengeData) => Promise<{ keyAuthorization: string } | null>;
    remove: (data: ChallengeData) => Promise<null>;
    shutdown: () => void;
}

// Yes, yes, no-one likes globals :P
const _memdb: Record<string, { keyAuthorization: string }> = {};
let _challengeServer: Server | null = null;
let _config: ChallengeServerConfig | null = null;

function _getChallengeKey(data: ChallengeData): string {
    return data.challenge.token;
}

function _createChallengeServer(): void {
    _challengeServer = createServer();
    _challengeServer.on('request', (req: IncomingMessage, res: ServerResponse) => {
        let response = '';
        _config!.log.debug(`challengeServer request: ${req.url}`);
        const regexp = /^\/.well-known\/acme-challenge\/(.*)/;
        const matches = req.url?.match(regexp);
        if (!matches || !Array.isArray(matches) || matches.length !== 2) {
            res.statusCode = 400;
            _config!.log.warn("Challenge server request doesn't look like ACME challenge");
        } else {
            const token = matches[1];
            _config!.log.debug(`Got challenge for ${token}`);
            const tokenChallenge = _memdb[token];
            if (!tokenChallenge) {
                res.statusCode = 404;
                _config!.log.warn(`Challenge server request token not in DB: ${token}`);
            } else {
                res.statusCode = 200;
                response = tokenChallenge.keyAuthorization;
            }
        }
        _config!.log.debug(`Challenge server status & response: ${res.statusCode} ${response}`);
        res.end(response);
    });
}

const _init = (opts: Record<string, unknown>): Promise<null> => {
    _config!.log.debug(`init: ${JSON.stringify(opts)}`);
    return new Promise((resolve, reject) => {
        if (_challengeServer) {
            _config!.log.warn('Server already running!');
            resolve(null);
        } else {
            _createChallengeServer();
            _challengeServer!.listen(_config!.port, _config!.address, (err?: Error) => {
                if (err) {
                    _config!.log.error(err as unknown as string);
                    reject(err);
                } else {
                    _config!.log.info(`challengeServer listening on ${_config!.address} port ${_config!.port}`);
                    resolve(null);
                }
            });
        }
    });
};

const _set = (data: ChallengeData): Promise<null> => {
    _config!.log.debug(`_set: ${JSON.stringify(data)}`);
    // Should set up challenge server:
    // body: challenge.keyAuthorization
    return Promise.resolve().then(function () {
        const key = _getChallengeKey(data);
        _memdb[key] = data.challenge;
        _config!.log.debug(`Added ${key} - DB now contains: ${Object.keys(_memdb).length}`);
        return null;
    });
};

const _get = (data: ChallengeData): Promise<{ keyAuthorization: string } | null> => {
    _config!.log.debug(`get:${JSON.stringify(data)}`);
    return Promise.resolve().then(function () {
        const key = _getChallengeKey(data);
        if (_memdb[key]) {
            return { keyAuthorization: _memdb[key].keyAuthorization };
        }
        return null;
    });
};

const _remove = (data: ChallengeData): Promise<null> => {
    _config!.log.debug(`remove: ${JSON.stringify(data)}`);
    return Promise.resolve().then(() => {
        delete _memdb[_getChallengeKey(data)];
        _config!.log.debug(`DB now contains: ${Object.keys(_memdb).length}`);
        return null;
    });
};

const _shutdown = (): void => {
    if (!_challengeServer) {
        _config!.log.warn('Shutdown called but nothing to do');
    } else {
        _config!.log.info('Shutting down challengeServer');
        _challengeServer.close();
        // Technically, one should free up _memdb here too
    }
};

export function create(config: ChallengeServerConfig): ChallengeServer {
    _config = config;
    return {
        init: _init,
        set: _set,
        get: _get,
        remove: _remove,
        shutdown: _shutdown,
    };
}
