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
The adapter starts periodically (default at midnight) and after configuration updates to generate any required certificates (new or soon to expire).

Currently, orders are processed with the Let's Encrypt certificate authority and thus are free of charge.

Certificate details are stored in a 'certificate collection' object which includes other relevant details such as expiry date, domains to be secured and private key.
These objects are referenced by their collection ID.

Adapters which need certificates to secure their communications (e.g. [web adapter](https://www.npmjs.com/package/iobroker.web)) are able to load and utilise certificate collections.

Storage and use is handled by an interface contained with the [core ioBroker controller](https://www.npmjs.com/package/iobroker.js-controller).

### ACME Challenges
Two methods of challenge verification are implemented and at least one should be enabled in the configuration page.

Note that wildcard certificate orders can only be validated using the dns-01 challenge.

* http-01: The adapter starts its own http-01 challenge server on the configured port and address.
  For http-01 challenge to be successful the challenge server's port/address must be publicly reachable from port 80 of the FQDN given in a collection common/alt names from the open internet.
  Configure your firewall accordingly.

* dns-01: Various dns-01 challenges plugins are implemented for popular domain hosting platforms.

#### References
See [AMCS.js](https://www.npmjs.com/package/acme) for more details.

## Changelog
<!--
    Placeholder for the next version (at the beginning of the line):
    ### **WORK IN PROGRESS**
-->

### **WORK IN PROGRESS**
* (raintonr) Use @iobroker/webserver (#10).
* (bluefox) Corrected detection of instances on the same port
* (bluefox) Implemented the monitoring of the collection's status 

### 0.0.2 (2023-03-01)
* (bluefox) Now all running on the same port adapters will be stopped before update.

### 0.0.1 (2023-01-29)
* (Robin Rainton) Initial release.

## License
MIT License

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
