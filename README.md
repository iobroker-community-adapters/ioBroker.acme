![Logo](admin/acme.png)

# ioBroker.acme

[![NPM version](https://img.shields.io/npm/v/iobroker.acme.svg)](https://www.npmjs.com/package/iobroker.acme)
[![Downloads](https://img.shields.io/npm/dm/iobroker.acme.svg)](https://www.npmjs.com/package/iobroker.acme)
![Number of Installations](https://iobroker.live/badges/acme-installed.svg)
![Current version in stable repository](https://iobroker.live/badges/acme-stable.svg)

[![NPM](https://nodei.co/npm/iobroker.acme.png?downloads=true)](https://nodei.co/npm/iobroker.acme/)

**Tests:** ![Test and Release](https://github.com/iobroker-community-adapters/ioBroker.acme/workflows/Test%20and%20Release/badge.svg)

## ACME adapter for ioBroker

This adapter generates certificates using ACME challenges.

## Usage

The adapter starts periodically at midnight and after configuration updates to generate any required certificates (new or soon to expire).

### Scope

This adapter currently targets the following scope:

- Certificate Authority: **Let's Encrypt only**
- ACME environment selection: **Staging** and **Production**
- Key handling: automatic (no manual key type selection required)

This scope is intentional to keep the adapter setup simple and robust.

Currently, orders are processed with the Let's Encrypt certificate authority and thus are free of charge.

The adapter attempts renewal starting **7 days before certificate expiry**.

Certificate details are stored in a 'certificate collection' object which includes other relevant details such as expiry date, domains to be secured and private key.
These objects are referenced by their collection ID.

Adapters which need certificates to secure their communications (e.g. [web adapter](https://www.npmjs.com/package/iobroker.web)) are able to load and utilise certificate collections.

Storage and use are handled by an interface contained with the [core ioBroker controller](https://www.npmjs.com/package/iobroker.js-controller).

### Quick setup checklist

1. Set a valid maintainer email.
2. Choose **Staging** first to validate challenge configuration.
3. Configure either HTTP-01 or DNS-01 (or both).
4. Configure at least one certificate collection.
5. Switch to **Production** only after successful staging runs.

### ACME Challenges

Two methods of challenge verification are implemented, and at least one should be enabled on the configuration page.

Note that wildcard certificate orders can only be validated using the DNS-01 challenge.

#### HTTP-01

The adapter starts its own HTTP-01 challenge server on the configured port and address.

For an HTTP-01 challenge to be successful, the challenge server's port/address **must** be publicly reachable as port 80 of the FQDN given in a collection common/alt name from the open internet.

Configure your firewall, reverse proxy, etc. accordingly.

Important:

- HTTP-01 works only if the certificate domain reaches your ioBroker host directly, or reaches a reverse proxy that forwards ACME challenge requests to ioBroker.
- If you prefer reverse-proxy routing in ioBroker, you can use [ioBroker.simple-proxy-manager](https://github.com/lubepi/ioBroker.simple-proxy-manager).

Example scenarios:

1. The IoB host on which ACME is running is behind a router, and that router has a publicly reachable IP address:

    Solution:
    - Configure ACME to run on any free port: E.g.: 8092.
    - Configure the router to forward connections to port 80 of its public address to port 8092 of the IoB host.
    - Configure the DNS name of the desired certificate common name to resolve to the public address of the router.

2. The IoB host on which ACME is running has a direct internet connection with a publicly reachable IP address:

    Solution:
    - Configure ACME adapter to listen on port 80.
    - Configure the DNS name of the desired certificate common name to resolve to the public address of the IoB host.

3. Scenario 1 & 2 are impossible because another service is running on port 80 of the publicly reachable IP address.

    Possible solutions:
    1. If the other service is an IoB adapter following port configuration naming standards, ACME can stop it before attempting to order a certificate, use port 80 for the HTTP-01 challenge server, and restart any stopped adapter when done.

        Obviously, this causes a short outage for the other adapter which may not be desirable.
        For reverse proxy setups, leave **Allow ACME to stop conflicting adapters on HTTP-01 port** disabled and forward `/.well-known/acme-challenge/` to ACME on a different local port.

    2. Set up a named virtual host HTTP proxy on port 80 of the router or publicly reachable IoB host.
        - Give the existing service a different hostname to the one a certificate is required for and configure that hostname to resolve to the same address.
        - Configure the proxy to forward requests to either the existing service or ACME adapter based on the name used.

    3. Run ACME manually only when required port access is available. **Not recommended**, but should work:
        - Disable (stop) the ACME adapter after installation.
        - Shortly before certificate order or renewal is required (renewal will occur up to 7 days before expiry) manually perform the following steps:
            - Set up any firewall/port forwarding/other maintenance required to allow ACME to run on the configured port and for that port to be accessible from the public internet.
            - Start ACME manually from the IoB Admin Instances page.
            - Wait for ACME to complete any certificate orders.
            - Stop ACME manually from the IoB Admin Instances page.
        - These steps will be required every time a certificate order/renewal is required, and as such this method is **not recommended**. ACME is designed to facilitate a fully automated process.

    4. Use a DNS-01 challenge.

#### DNS-01

Various DNS-01 challenge plugins are implemented for popular domain hosting platforms.

Available module choices in the adapter UI:

- acme-dns
- Cloudflare
- DigitalOcean
- DNSimple
- deSEC
- DuckDNS
- Gandi
- GoDaddy
- Namecheap
- Name.com
- Netcup
- Vultr

#### DNS-01 decision flow
**Follow this logic to determine the best DNS-01 challenge method for your setup:**
- Is your DNS provider listed above?
  - **Yes**: Select that provider module directly in the configuration.
  - **No**: Choose one of the following free alternatives.
    - **Keep current provider:** Use CNAME delegation (minimal changes needed).
      - Provider: **deSEC**, **DuckDNS**, or **acme-dns**
    - **Full control / New provider:** Use nameserver migration (requires changing NS records at your registrar).
      - Provider: **Cloudflare** or **deSEC**
    - Fallback:
      - If DNS-01 is not possible, use an **HTTP-01** challenge.

#### Free alternatives for unsupported providers

| Method               | Provider       | Details                               | 
| -------------------- | -------------- | ------------------------------------- | 
| **CNAME Delegation** | **deSEC**      | Recommended default for most users    |
| **CNAME Delegation** | **DuckDNS**    | Single domain per collection only     |
| **CNAME Delegation** | **acme-dns**   | Single domain per collection only; self-hostable; privilege isolation per collection possible |
| **NS Migration**     | **Cloudflare** | Full zone migration                   |
| **NS Migration**     | **deSEC**      | Full zone migration; focus on privacy |


**Important for CNAME Delegation (DNS-01 Alias):**
 - Always requires a `CNAME` record at your primary DNS provider.
 - Point `_acme-challenge.<your-domain>` to your deSEC/DuckDNS alias.
 - In the adapter's **DNS-01 Alias** field, enter only the domain (e.g. `xyz.dedyn.io`). **Do not** include `_acme-challenge.`.
 - Most DNS providers automatically append your domain to the record name. Therefore, usually only `_acme-challenge` (for the main domain) or `_acme-challenge.subdomain` needs to be entered in the "Name" or "Host" field. However, some providers expect the full FQDN (Fully Qualified Domain Name), in which case you must enter the complete record name (e.g. `_acme-challenge.example.com`).

#### Step-by-step guides for alternatives

##### **Guide: deSEC with CNAME delegation**
Use this if your domain is at a provider like Strato, Hetzner, or Route 53, and you want to keep it there.

1. Create a free account at [deSEC](https://desec.io/) and register a new domain (e.g. `my-alias.dedyn.io`).
2. Generate an API token at deSEC.
3. In your **primary DNS provider**, add a `CNAME` record:
    - **Name:** `_acme-challenge` (or `_acme-challenge.subdomain` for subdomains)
    - **Target:** `_acme-challenge.my-alias.dedyn.io`
4. In the configuration, select DNS-01 module `deSEC`, set the token, and set **DNS-01 Alias** to `my-alias.dedyn.io`.

##### **Guide: acme-dns with CNAME delegation**

Use this if you want isolated or self-hosted DNS-01 handling.

1. Choose one of these modes:
    - Manual mode: Create a free acme-dns account and set the credentials in the configuration.
    - Automatic mode: leave global credentials empty. The adapter registers acme-dns accounts per collection and stores credentials in `acme-dns collection overrides`.
2. In your **primary DNS provider**, add a `CNAME` record:
    - **Name:** `_acme-challenge` (or `_acme-challenge.subdomain` for subdomains)
    - **Target:** the acme-dns target hostname returned by the account
3. Optional: set `DNS-01 Base URL` for self-hosted acme-dns. If empty, `https://auth.acme-dns.io` is used.

Notes:
- Use only one domain per collection, as acme-dns provides only one TXT target per account. Since this adapter's underlying library (acme-client) processes authorizations in parallel, combining multiple domains in a single collection may be unreliable. For privilege isolation, use a dedicated acme-dns account per collection.
- The adapter performs a DNS CNAME precheck and warns if delegation looks missing or mismatched.
- In automatic mode, the `CNAME target (auto)` column shows the target returned by acme-dns registration.

#### References

See [acme-client](https://www.npmjs.com/package/acme-client) for implementation details of ACME account/order handling.

## Changelog

### **WORK IN PROGRESS**

- (lubepi) Migration from `acme` to `acme-client`, including hardened account/order handling (`processing`/`valid` flows) and improved challenge lifecycle handling.
- (lubepi) Added DNS-01 Alias support for delegated challenge zones.
- (lubepi) Added integrated `acme-dns` DNS-01 support in adapter configuration.
- (lubepi) Added optional per-collection `acme-dns` overrides and automatic `acme-dns` account registration when global credentials are not set.
- (lubepi) Added `acme-dns` CNAME delegation precheck with actionable warnings for missing/mismatched targets.
- (lubepi) Added HTTP-01 admin option to allow temporary stopping of conflicting adapters on the challenge port.
- (lubepi) HTTP-01 conflicting-adapter stop is disabled by default (explicit opt-in).
- (lubepi) Added `deSEC` DNS-01 provider support and updated DNS provider dependencies (including `acme-dns-01-netcup` update and `acme-dns-01-route53` removal).
- (lubepi) Expanded integration tests for DNS alias utilities and safe purge behavior for expired, de-configured collections.

### 3.0.2 (2026-03-10)

- (@GermanBluefox) Correcting configuration dialog
- (@GermanBluefox) Added tests for GUI component

### 3.0.0 (2026-03-05)

- (lubepi) BREAKING: DNS-01 credentials are encrypted now. You might have to reenter them once after upgrading the adapter.
- (copilot) Adapter requires admin >= 7.7.22 now
- (lubepi) Added support for Netcup DNS-01 challenge
- (@GermanBluefox) Optimisations on log output and error handling

### 2.0.0 (2026-02-12)

- (mcm1957) Adapter requires node.js >= 20, js-controller >= 6.0.11 and admin >= 7.6.17 now
- (mcm1957) Dependencies have been updated
- (@GermanBluefox) Adapter was migrated to TypeScript and vite

### 1.0.6 (2024-12-27)

- (mcm1957) Missing size attributes for jsonConfig have been added.
- (mcm1957) Dependencies have been updated

### 1.0.5 (2024-12-08)

- (@GermanBluefox) Corrected error with admin 7.4.3

## License

MIT License

Copyright (c) 2023-2026 iobroker-community-adapters <iobroker-community-adapters@gmx.de>  
Copyright (c) 2023 Robin Rainton <robin@rainton.com>

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
