// Module declarations for packages without type definitions
declare module 'acme' {
    const ACME: {
        create(options: {
            maintainerEmail: string;
            packageAgent: string;
            notify: (ev: string, msg: unknown) => void;
            debug?: boolean;
        }): any;
    };
    export = ACME;
}

declare module '@root/keypairs' {
    const Keypairs: {
        generate(options: { kty: string; format: string }): Promise<any>;
        export(options: { jwk: any }): Promise<string>;
        import(options: { pem: string }): Promise<any>;
    };
    export = Keypairs;
}

declare module '@root/csr' {
    const CSR: {
        csr(options: { jwk: any; domains: string[]; encoding: string }): Promise<any>;
    };
    export = CSR;
}

declare module '@root/pem' {
    const PEM: {
        packBlock(options: { type: string; bytes: any }): string;
    };
    export = PEM;
}

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
    collections: [
        {
            id: string;
            commonName: string;
            altNames: string;
        },
    ];
}

// Augment the global ioBroker namespace so this.config is properly typed
declare global {
    namespace ioBroker {
        // eslint-disable-next-line @typescript-eslint/no-empty-object-type
        interface AdapterConfig extends AcmeAdapterConfig {}
    }
}
