// This file extends the AdapterConfig type from "@types/iobroker"
// using the actual properties present in io-package.json
// in order to provide typings for adapter.config properties

// Augment the globally declared type ioBroker.AdapterConfig
declare global {
    namespace ioBroker {
        interface AdapterConfig {
            maintainerEmail: string;
            useStaging: boolean;
            http01Active: boolean;
            port: number;
            bind: string;
            dns01Active: boolean;
            dns01Module: string;
            dns01OapiUser: string;
            dns01OapiKey: string;
            dns01OclientIp: string;
            dns01Okey: string;
            dns01Osecret: string;
            dns01Otoken: string;
            dns01Ousername: string;
            dns01OverifyPropagation: boolean;
            dns01PpropagationDelay: number;
            collections: [
                {
                    id: string;
                    commonName: string;
                    altNames: string;
                },
            ];
        }
    }
}

// this is required so the above AdapterConfig is found by TypeScript / type checking
export {};
