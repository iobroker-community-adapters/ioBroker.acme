declare module 'x509.js' {
    const x509: {
        parseCert(cert: string): {
            notBefore: string;
            notAfter: string;
            subject: { commonName: string };
            altNames: string[];
        };
    };
    export = x509;
}

export interface AcmeAdapterConfig {
    maintainerEmail: string;
    useStaging: boolean;
    http01Active: boolean;
    port: number;
    bind: string;
    dns01Active: boolean;
    dns01Module:
        | 'acme-dns-01-cloudflare'
        | 'acme-dns-01-digitalocean'
        | 'acme-dns-01-dnsimple'
        | 'acme-dns-01-duckdns'
        | 'acme-dns-01-godaddy'
        | 'acme-dns-01-gandi'
        | 'acme-dns-01-namecheap'
        | 'acme-dns-01-namedotcom'
        | 'acme-dns-01-route53'
        | 'acme-dns-01-vultr'
        | 'acme-dns-01-netcup';
    dns01OapiUser: string;
    dns01OapiKey: string;
    dns01OclientIp: string;
    dns01Okey: string;
    dns01Osecret: string;
    dns01Otoken: string;
    dns01Ousername: string;
    dns01OverifyPropagation: boolean;
    dns01PpropagationDelay: number;
    dns01OcustomerNumber: string;
    dns01OapiPassword: string;
    dns01Alias: string;
    collections: Array<{
        id: string;
        commonName: string;
        altNames: string;
    }>;
}

// Augment the global ioBroker namespace so this.config is properly typed
declare global {
    namespace ioBroker {
        // eslint-disable-next-line @typescript-eslint/no-empty-object-type
        interface AdapterConfig extends AcmeAdapterConfig {}
    }
}
