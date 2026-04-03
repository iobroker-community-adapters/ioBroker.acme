import {
    ChangeResourceRecordSetsCommand,
    ListHostedZonesCommand,
    ListResourceRecordSetsCommand,
    Route53Client,
} from '@aws-sdk/client-route-53';

interface Route53Config {
    key?: string;
    secret?: string;
    token?: string;
    accessKeyId?: string;
    secretAccessKey?: string;
    sessionToken?: string;
    region?: string;
    hostedZoneId?: string;
    ttl?: number;
    propagationDelay?: number;
}

interface Route53ChallengeData {
    challenge?: {
        dnsZone?: string;
        dnsPrefix?: string;
        dnsAuthorization?: string;
    };
    dnsZone?: string;
    dnsPrefix?: string;
    dnsAuthorization?: string;
}

function getChallenge(data: Route53ChallengeData): { dnsZone: string; dnsPrefix: string; dnsAuthorization: string } {
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
    public propagationDelay: number;
    private readonly client: Route53Client;
    private readonly hostedZoneId?: string;
    private readonly ttl: number;

    constructor(config: Route53Config = {}) {
        const accessKeyId = config.accessKeyId || config.key;
        const secretAccessKey = config.secretAccessKey || config.secret;
        const sessionToken = config.sessionToken || config.token;

        this.client = new Route53Client({
            region: config.region || process.env.AWS_REGION || 'us-east-1',
            credentials:
                accessKeyId && secretAccessKey
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

    init(): Promise<null> {
        return Promise.resolve(null);
    }

    shutdown(): Promise<void> {
        this.client.destroy();
        return Promise.resolve();
    }

    async zones(): Promise<string[]> {
        const zones: string[] = [];
        let marker: string | undefined;

        do {
            const result = await this.client.send(
                new ListHostedZonesCommand({
                    Marker: marker,
                }),
            );

            for (const zone of result.HostedZones || []) {
                if (zone.Name) {
                    zones.push(zone.Name.replace(/\.$/, ''));
                }
            }

            marker = result.IsTruncated ? result.NextMarker : undefined;
        } while (marker);

        return zones;
    }

    private async resolveHostedZoneId(dnsZone: string): Promise<string> {
        if (this.hostedZoneId) {
            return this.hostedZoneId;
        }

        const zoneCandidates = (await this.zones()).filter(zone => dnsZone === zone || dnsZone.endsWith(`.${zone}`));
        zoneCandidates.sort((a, b) => b.length - a.length);
        const bestZone = zoneCandidates[0];
        if (!bestZone) {
            throw new Error(`No matching Route53 hosted zone found for ${dnsZone}`);
        }

        const allZones = await this.client.send(new ListHostedZonesCommand({}));
        const hostedZone = (allZones.HostedZones || []).find(zone => zone.Name?.replace(/\.$/, '') === bestZone);
        if (!hostedZone?.Id) {
            throw new Error(`Could not resolve Route53 hosted zone ID for ${bestZone}`);
        }

        return hostedZone.Id.replace('/hostedzone/', '');
    }

    private static recordName(ch: { dnsPrefix: string; dnsZone: string }): string {
        return `${ch.dnsPrefix}.${ch.dnsZone}.`;
    }

    private static recordValue(ch: { dnsAuthorization: string }): string {
        return `"${ch.dnsAuthorization}"`;
    }

    async set(data: Route53ChallengeData): Promise<null> {
        const ch = getChallenge(data);
        const hostedZoneId = await this.resolveHostedZoneId(ch.dnsZone);

        await this.client.send(
            new ChangeResourceRecordSetsCommand({
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
            }),
        );

        return null;
    }

    async remove(data: Route53ChallengeData): Promise<null> {
        const ch = getChallenge(data);
        const hostedZoneId = await this.resolveHostedZoneId(ch.dnsZone);

        try {
            await this.client.send(
                new ChangeResourceRecordSetsCommand({
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
                }),
            );
        } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            if (!message.includes('not found') && !message.includes('InvalidChangeBatch')) {
                throw err;
            }
        }

        return null;
    }

    async get(data: Route53ChallengeData): Promise<{ dnsAuthorization: string } | null> {
        const ch = getChallenge(data);
        const hostedZoneId = await this.resolveHostedZoneId(ch.dnsZone);
        const recordName = Route53DnsChallenge.recordName(ch);
        const recordValue = Route53DnsChallenge.recordValue(ch);

        const result = await this.client.send(
            new ListResourceRecordSetsCommand({
                HostedZoneId: hostedZoneId,
                StartRecordName: recordName,
                StartRecordType: 'TXT',
                MaxItems: 1,
            }),
        );

        const entry = (result.ResourceRecordSets || []).find(
            set =>
                set.Type === 'TXT' &&
                set.Name === recordName &&
                (set.ResourceRecords || []).some(rr => rr.Value === recordValue),
        );

        if (!entry) {
            return null;
        }

        return { dnsAuthorization: ch.dnsAuthorization };
    }
}

export function create(config: Route53Config): Route53DnsChallenge {
    return new Route53DnsChallenge(config);
}
