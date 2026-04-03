"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.create = create;
const client_route_53_1 = require("@aws-sdk/client-route-53");
function getChallenge(data) {
    const challenge = data.challenge || data;
    if (!challenge?.dnsZone || !challenge?.dnsPrefix || !challenge?.dnsAuthorization) {
        throw new Error('Route53 challenge data is missing dnsZone, dnsPrefix or dnsAuthorization');
    }
    return {
        dnsZone: challenge.dnsZone,
        dnsPrefix: challenge.dnsPrefix,
        dnsAuthorization: challenge.dnsAuthorization,
    };
}
class Route53DnsChallenge {
    propagationDelay;
    client;
    hostedZoneId;
    ttl;
    constructor(config = {}) {
        const accessKeyId = config.accessKeyId || config.key;
        const secretAccessKey = config.secretAccessKey || config.secret;
        const sessionToken = config.sessionToken || config.token;
        this.client = new client_route_53_1.Route53Client({
            region: config.region || process.env.AWS_REGION || 'us-east-1',
            credentials: accessKeyId && secretAccessKey
                ? {
                    accessKeyId,
                    secretAccessKey,
                    ...(sessionToken ? { sessionToken } : {}),
                }
                : undefined,
        });
        this.hostedZoneId = config.hostedZoneId?.replace('/hostedzone/', '');
        this.ttl = config.ttl || 60;
        this.propagationDelay = config.propagationDelay || 30_000;
    }
    init() {
        return Promise.resolve(null);
    }
    shutdown() {
        this.client.destroy();
        return Promise.resolve();
    }
    async zones() {
        const zones = [];
        let marker;
        do {
            const result = await this.client.send(new client_route_53_1.ListHostedZonesCommand({
                Marker: marker,
            }));
            for (const zone of result.HostedZones || []) {
                if (zone.Name) {
                    zones.push(zone.Name.replace(/\.$/, ''));
                }
            }
            marker = result.IsTruncated ? result.NextMarker : undefined;
        } while (marker);
        return zones;
    }
    async resolveHostedZoneId(dnsZone) {
        if (this.hostedZoneId) {
            return this.hostedZoneId;
        }
        const zoneCandidates = (await this.zones()).filter(zone => dnsZone === zone || dnsZone.endsWith(`.${zone}`));
        zoneCandidates.sort((a, b) => b.length - a.length);
        const bestZone = zoneCandidates[0];
        if (!bestZone) {
            throw new Error(`No matching Route53 hosted zone found for ${dnsZone}`);
        }
        const allZones = await this.client.send(new client_route_53_1.ListHostedZonesCommand({}));
        const hostedZone = (allZones.HostedZones || []).find(zone => zone.Name?.replace(/\.$/, '') === bestZone);
        if (!hostedZone?.Id) {
            throw new Error(`Could not resolve Route53 hosted zone ID for ${bestZone}`);
        }
        return hostedZone.Id.replace('/hostedzone/', '');
    }
    static recordName(ch) {
        return `${ch.dnsPrefix}.${ch.dnsZone}.`;
    }
    static recordValue(ch) {
        return `"${ch.dnsAuthorization}"`;
    }
    async set(data) {
        const ch = getChallenge(data);
        const hostedZoneId = await this.resolveHostedZoneId(ch.dnsZone);
        await this.client.send(new client_route_53_1.ChangeResourceRecordSetsCommand({
            HostedZoneId: hostedZoneId,
            ChangeBatch: {
                Changes: [
                    {
                        Action: 'UPSERT',
                        ResourceRecordSet: {
                            Name: Route53DnsChallenge.recordName(ch),
                            Type: 'TXT',
                            TTL: this.ttl,
                            ResourceRecords: [{ Value: Route53DnsChallenge.recordValue(ch) }],
                        },
                    },
                ],
            },
        }));
        return null;
    }
    async remove(data) {
        const ch = getChallenge(data);
        const hostedZoneId = await this.resolveHostedZoneId(ch.dnsZone);
        try {
            await this.client.send(new client_route_53_1.ChangeResourceRecordSetsCommand({
                HostedZoneId: hostedZoneId,
                ChangeBatch: {
                    Changes: [
                        {
                            Action: 'DELETE',
                            ResourceRecordSet: {
                                Name: Route53DnsChallenge.recordName(ch),
                                Type: 'TXT',
                                TTL: this.ttl,
                                ResourceRecords: [{ Value: Route53DnsChallenge.recordValue(ch) }],
                            },
                        },
                    ],
                },
            }));
        }
        catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            if (!message.includes('not found') && !message.includes('InvalidChangeBatch')) {
                throw err;
            }
        }
        return null;
    }
    async get(data) {
        const ch = getChallenge(data);
        const hostedZoneId = await this.resolveHostedZoneId(ch.dnsZone);
        const recordName = Route53DnsChallenge.recordName(ch);
        const recordValue = Route53DnsChallenge.recordValue(ch);
        const result = await this.client.send(new client_route_53_1.ListResourceRecordSetsCommand({
            HostedZoneId: hostedZoneId,
            StartRecordName: recordName,
            StartRecordType: 'TXT',
            MaxItems: 1,
        }));
        const entry = (result.ResourceRecordSets || []).find(set => set.Type === 'TXT' &&
            set.Name === recordName &&
            (set.ResourceRecords || []).some(rr => rr.Value === recordValue));
        if (!entry) {
            return null;
        }
        return { dnsAuthorization: ch.dnsAuthorization };
    }
}
function create(config) {
    return new Route53DnsChallenge(config);
}
