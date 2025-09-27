# ioBroker Adapter Development with GitHub Copilot

**Version:** 0.4.0
**Template Source:** https://github.com/DrozmotiX/ioBroker-Copilot-Instructions

This file contains instructions and best practices for GitHub Copilot when working on ioBroker adapter development.

## Project Context

You are working on an ioBroker adapter. ioBroker is an integration platform for the Internet of Things, focused on building smart home and industrial IoT solutions. Adapters are plugins that connect ioBroker to external systems, devices, or services.

**Adapter-Specific Context:**
- **Adapter Name**: iobroker.acme
- **Primary Function**: Generates certificates using ACME challenges  
- **Key Technology**: ACME (Automatic Certificate Management Environment) protocol
- **Certificate Types**: SSL/TLS certificates for secure communications
- **Challenge Methods**: HTTP-01 and DNS-01 challenge verification
- **DNS Providers**: Supports Cloudflare, DigitalOcean, DNSimple, DuckDNS, Gandi, GoDaddy, Namecheap, Name.com, Route53, Vultr
- **Dependencies**: Uses @iobroker/webserver for HTTP challenges, acme library for ACME protocol
- **Configuration**: JSON-based configuration with support for multiple certificate collections
- **Execution Mode**: Schedule-based (daily by default: "0 0 * * *")

### Certificate Management Context
When working on this adapter, understand that:
- Certificates have expiration dates and need renewal
- ACME challenges verify domain ownership before certificate issuance
- HTTP-01 challenges require the adapter to serve files on port 80
- DNS-01 challenges require API access to DNS providers for TXT record creation
- Certificate collections can include multiple domains and wildcard certificates
- Production vs. staging ACME servers are used for testing vs. real certificates
- Error handling is critical as certificate failures can break secure communications

## Testing

### Unit Testing
- Use Jest as the primary testing framework for ioBroker adapters
- Create tests for all adapter main functions and helper methods
- Test error handling scenarios and edge cases
- Mock external API calls and hardware dependencies
- For adapters connecting to APIs/devices not reachable by internet, provide example data files to allow testing of functionality without live connections
- Example test structure:
  ```javascript
  describe('AdapterName', () => {
    let adapter;
    
    beforeEach(() => {
      // Setup test adapter instance
    });
    
    test('should initialize correctly', () => {
      // Test adapter initialization
    });
  });
  ```

### Integration Testing

**IMPORTANT**: Use the official `@iobroker/testing` framework for all integration tests. This is the ONLY correct way to test ioBroker adapters.

**Official Documentation**: https://github.com/ioBroker/testing

#### Framework Structure
Integration tests MUST follow this exact pattern:

```javascript
const path = require('path');
const { tests } = require('@iobroker/testing');

// Define test coordinates or configuration
const TEST_COORDINATES = '52.520008,13.404954'; // Berlin
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

// Use tests.integration() with defineAdditionalTests
tests.integration(path.join(__dirname, '..'), {
    defineAdditionalTests({ suite }) {
        suite('Test adapter with specific configuration', (getHarness) => {
            let harness;

            before(() => {
                harness = getHarness();
            });

            it('should configure and start adapter', function () {
                return new Promise(async (resolve, reject) => {
                    try {
                        harness = getHarness();
                        
                        // Get adapter object using promisified pattern
                        const obj = await new Promise((res, rej) => {
                            harness.objects.getObject('system.adapter.your-adapter.0', (err, o) => {
                                if (err) return rej(err);
                                res(o);
                            });
                        });
                        
                        if (!obj) {
                            return reject(new Error('Adapter object not found'));
                        }

                        // Configure adapter properties
                        Object.assign(obj.native, {
                            position: TEST_COORDINATES,
                            createCurrently: true,
                            createHourly: true,
                            createDaily: true,
                            // Add other configuration as needed
                        });

                        // Set the updated configuration
                        harness.objects.setObject(obj._id, obj);

                        console.log('✅ Step 1: Configuration written, starting adapter...');
                        
                        // Start adapter and wait
                        await harness.startAdapterAndWait();
                        
                        console.log('✅ Step 2: Adapter started');

                        // Wait for adapter to process data
                        const waitMs = 15000;
                        await wait(waitMs);

                        console.log('🔍 Step 3: Checking states after adapter run...');
                        
                        // Check that states were created
                        const states = await harness.states.getKeysAsync('your-adapter.0.*');
                        expect(states.length).to.be.at.least(1);
                        
                        resolve();
                    } catch (error) {
                        console.error('❌ Integration test failed:', error);
                        reject(error);
                    }
                });
            });
        });
    }
});
```

### ACME Adapter Specific Testing

**Challenge Server Testing:**
```javascript
// Test HTTP-01 challenge server
it('should start and stop HTTP challenge server', async function() {
    const obj = await harness.objects.getObjectAsync('system.adapter.acme.0');
    obj.native.http01Active = true;
    obj.native.port = 8080;
    obj.native.bind = '0.0.0.0';
    
    await harness.objects.setObjectAsync(obj._id, obj);
    await harness.startAdapterAndWait();
    
    // Test that challenge server is accessible
    // Add actual HTTP request tests here
    
    await harness.stopAdapter();
});
```

**DNS Provider Testing:**
```javascript
// Test DNS-01 challenge configuration
it('should validate DNS provider credentials', async function() {
    const obj = await harness.objects.getObjectAsync('system.adapter.acme.0');
    obj.native.dns01Active = true;
    obj.native.dns01Module = 'cloudflare';
    obj.native.dns01Okey = 'test_api_key';
    obj.native.dns01Osecret = 'test_api_secret';
    
    await harness.objects.setObjectAsync(obj._id, obj);
    // Test credential validation logic
});
```

**Certificate Collection Testing:**
```javascript
// Test certificate collection processing
it('should process certificate collections', async function() {
    const obj = await harness.objects.getObjectAsync('system.adapter.acme.0');
    obj.native.collections = [{
        id: 'test_domain',
        commonName: 'test.example.com',
        altNames: '*.test.example.com'
    }];
    
    await harness.objects.setObjectAsync(obj._id, obj);
    // Test collection processing logic
});
```

## Common ioBroker Patterns

### Main Adapter Class Structure
Your main adapter class should follow this pattern:
```javascript
class AdapterName extends utils.Adapter {
  constructor(options = {}) {
    super({
      ...options,
      name: 'adapter-name',
    });
    this.on('ready', this.onReady.bind(this));
    this.on('stateChange', this.onStateChange.bind(this));
    this.on('unload', this.onUnload.bind(this));
  }

  async onReady() {
    // Initialize adapter
    this.setState('info.connection', false, true);
    // Main logic here
  }

  onStateChange(id, state) {
    if (!state) return;
    // Handle state changes
  }

  onUnload(callback) {
    try {
      // Clean up resources
      callback();
    } catch (e) {
      callback();
    }
  }
}
```

### State Management
Use proper state naming conventions:
```javascript
// Info states
await this.setObjectNotExistsAsync('info.connection', {
  type: 'state',
  common: {
    name: 'Connected to service',
    type: 'boolean',
    role: 'indicator.connected',
    read: true,
    write: false
  },
  native: {}
});

// Data states with proper types
await this.setObjectNotExistsAsync('data.temperature', {
  type: 'state',
  common: {
    name: 'Temperature',
    type: 'number',
    role: 'value.temperature',
    unit: '°C',
    read: true,
    write: false
  },
  native: {}
});
```

### Configuration Handling
Access configuration through `this.config`:
```javascript
async onReady() {
  // Validate configuration
  if (!this.config.apiKey) {
    this.log.error('API key not configured');
    return;
  }
  
  // Use configuration
  const interval = this.config.interval || 60000;
  this.updateInterval = setInterval(() => {
    this.updateData();
  }, interval);
}
```

### Error Handling and Logging
Use appropriate log levels:
```javascript
try {
  const result = await this.apiCall();
  this.log.debug('API call successful');
} catch (error) {
  this.log.error(`API call failed: ${error.message}`);
  this.setState('info.connection', false, true);
}
```

### Async/Await Best Practices
```javascript
// Good: Proper error handling
async fetchData() {
  try {
    const response = await this.makeRequest();
    return response.data;
  } catch (error) {
    this.log.error(`Failed to fetch data: ${error.message}`);
    throw error;
  }
}

// Good: Sequential processing when needed
async processItems(items) {
  for (const item of items) {
    try {
      await this.processItem(item);
    } catch (error) {
      this.log.warn(`Failed to process item ${item.id}: ${error.message}`);
      // Continue with next item
    }
  }
}
```

### Resource Cleanup
Always clean up resources in the unload handler:
```javascript
onUnload(callback) {
  try {
    // Clear intervals
    if (this.updateInterval) {
      clearInterval(this.updateInterval);
      this.updateInterval = undefined;
    }
    
    // Clear timeouts
    if (this.connectionTimer) {
      clearTimeout(this.connectionTimer);
      this.connectionTimer = undefined;
    }
    // Close connections, clean up resources
    callback();
  } catch (e) {
    callback();
  }
}
```

## Code Style and Standards

- Follow JavaScript/TypeScript best practices
- Use async/await for asynchronous operations
- Implement proper resource cleanup in `unload()` method
- Use semantic versioning for adapter releases
- Include proper JSDoc comments for public methods

### ACME-Specific Development Patterns

**Challenge Server Management:**
```javascript
// Start HTTP challenge server
if (this.config.http01Active && this.config.port > 0) {
    this.challengeServer = require('@iobroker/webserver')({
        port: this.config.port,
        bind: this.config.bind || '0.0.0.0'
    });
}

// Clean shutdown
unload(callback) {
    if (this.challengeServer) {
        this.challengeServer.close();
        this.challengeServer = null;
    }
    callback();
}
```

**Certificate Collection Processing:**
```javascript
// Process each certificate collection
for (const collection of this.config.collections) {
    try {
        await this.processCertificateCollection(collection);
    } catch (error) {
        this.log.error(`Failed to process collection ${collection.id}: ${error.message}`);
        // Continue with other collections
    }
}
```

**DNS Provider Integration:**
```javascript
// Dynamic DNS challenge provider loading
const dnsProvider = require(`acme-dns-01-${this.config.dns01Module}`);
const challenge = dnsProvider.create({
    apiKey: this.config.dns01Okey,
    apiSecret: this.config.dns01Osecret,
    // Provider-specific configuration
});
```

## CI/CD and Testing Integration

### GitHub Actions for API Testing
For adapters with external API dependencies, implement separate CI/CD jobs:

```yaml
# Tests API connectivity with demo credentials (runs separately)
demo-api-tests:
  if: contains(github.event.head_commit.message, '[skip ci]') == false
  
  runs-on: ubuntu-22.04
  
  steps:
    - name: Checkout code
      uses: actions/checkout@v4
      
    - name: Use Node.js 20.x
      uses: actions/setup-node@v4
      with:
        node-version: 20.x
        cache: 'npm'
        
    - name: Install dependencies
      run: npm ci
      
    - name: Run demo API tests
      run: npm run test:integration-demo
```

### CI/CD Best Practices
- Run credential tests separately from main test suite
- Use ubuntu-22.04 for consistency
- Don't make credential tests required for deployment
- Provide clear failure messages for API connectivity issues
- Use appropriate timeouts for external API calls (120+ seconds)

### Package.json Script Integration
Add dedicated script for credential testing:
```json
{
  "scripts": {
    "test:integration-demo": "mocha test/integration-demo --exit"
  }
}
```

### Practical Example: Complete API Testing Implementation
Here's a complete example based on lessons learned from the Discovergy adapter:

#### test/integration-demo.js
```javascript
const path = require("path");
const { tests } = require("@iobroker/testing");

// Helper function to encrypt password using ioBroker's encryption method
async function encryptPassword(harness, password) {
    const systemConfig = await harness.objects.getObjectAsync("system.config");
    
    if (!systemConfig || !systemConfig.native || !systemConfig.native.secret) {
        throw new Error("Could not retrieve system secret for password encryption");
    }
    
    const secret = systemConfig.native.secret;
    let result = '';
    for (let i = 0; i < password.length; ++i) {
        result += String.fromCharCode(secret[i % secret.length].charCodeAt(0) ^ password.charCodeAt(i));
    }
    
    return result;
}

// Run integration tests with demo credentials
tests.integration(path.join(__dirname, ".."), {
    defineAdditionalTests({ suite }) {
        suite("API Testing with Demo Credentials", (getHarness) => {
            let harness;
            
            before(() => {
                harness = getHarness();
            });

            it("Should connect to API and initialize with demo credentials", async () => {
                console.log("Setting up demo credentials...");
                
                if (harness.isAdapterRunning()) {
                    await harness.stopAdapter();
                }
                
                const encryptedPassword = await encryptPassword(harness, "demo_password");
                
                await harness.changeAdapterConfig("your-adapter", {
                    native: {
                        username: "demo@provider.com",
                        password: encryptedPassword,
                        // other config options
                    }
                });

                console.log("Starting adapter with demo credentials...");
                await harness.startAdapter();
                
                // Wait for API calls and initialization
                await new Promise(resolve => setTimeout(resolve, 60000));
                
                const connectionState = await harness.states.getStateAsync("your-adapter.0.info.connection");
                
                if (connectionState && connectionState.val === true) {
                    console.log("✅ SUCCESS: API connection established");
                    return true;
                } else {
                    throw new Error("API Test Failed: Expected API connection to be established with demo credentials. " +
                        "Check logs above for specific API errors (DNS resolution, 401 Unauthorized, network issues, etc.)");
                }
            }).timeout(120000);
        });
    }
});
```

## TypeScript Support

### Type Definitions
Use proper TypeScript definitions for enhanced development experience:
```typescript
// lib/adapter-config.d.ts
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
      collections: Array<{
        id: string;
        commonName: string;
        altNames: string;
      }>;
    }
  }
}

export {};
```

### Main Adapter with TypeScript
```typescript
import * as utils from '@iobroker/adapter-core';

class AcmeAdapter extends utils.Adapter {
  private challengeServer?: any;
  private renewalTimer?: NodeJS.Timeout;

  public constructor(options: Partial<utils.AdapterOptions> = {}) {
    super({
      ...options,
      name: 'acme',
    });

    this.on('ready', this.onReady.bind(this));
    this.on('unload', this.onUnload.bind(this));
  }

  private async onReady(): Promise<void> {
    // Initialize ACME adapter
    await this.initializeACME();
  }

  private onUnload(callback: () => void): void {
    try {
      if (this.challengeServer) {
        this.challengeServer.close();
        this.challengeServer = null;
      }
      if (this.renewalTimer) {
        clearTimeout(this.renewalTimer);
      }
      callback();
    } catch (e) {
      callback();
    }
  }
}
```

## Admin Configuration (JSON Config)

### ACME Adapter JSON Config Structure
The ACME adapter uses a comprehensive JSON Config for certificate management:

```json
{
  "type": "tabs",
  "items": {
    "general": {
      "type": "panel",
      "label": "General Settings",
      "items": {
        "maintainerEmail": {
          "type": "text",
          "label": "Maintainer Email",
          "help": "Email address for ACME account registration"
        },
        "useStaging": {
          "type": "checkbox", 
          "label": "Use Staging Server",
          "help": "Use Let's Encrypt staging server for testing (recommended for development)"
        }
      }
    },
    "http01": {
      "type": "panel",
      "label": "HTTP-01 Challenge",
      "items": {
        "http01Active": {
          "type": "checkbox",
          "label": "Enable HTTP-01 Challenge",
          "help": "Enable HTTP-01 challenge for domain validation"
        },
        "port": {
          "type": "number",
          "label": "Port",
          "min": 1,
          "max": 65535,
          "default": 80,
          "help": "Port for HTTP challenge server (usually 80)",
          "hidden": "!data.http01Active"
        },
        "bind": {
          "type": "text",
          "label": "Bind Address",
          "default": "0.0.0.0",
          "help": "IP address to bind the HTTP challenge server to",
          "hidden": "!data.http01Active"
        }
      }
    },
    "dns01": {
      "type": "panel",
      "label": "DNS-01 Challenge",
      "items": {
        "dns01Active": {
          "type": "checkbox",
          "label": "Enable DNS-01 Challenge",
          "help": "Enable DNS-01 challenge for domain validation (required for wildcard certificates)"
        },
        "dns01Module": {
          "type": "select",
          "label": "DNS Provider",
          "help": "Select your DNS hosting provider",
          "hidden": "!data.dns01Active",
          "options": [
            {"label": "Cloudflare", "value": "cloudflare"},
            {"label": "DigitalOcean", "value": "digitalocean"},
            {"label": "DNSimple", "value": "dnsimple"},
            {"label": "DuckDNS", "value": "duckdns"},
            {"label": "Gandi", "value": "gandi"},
            {"label": "GoDaddy", "value": "godaddy"},
            {"label": "Namecheap", "value": "namecheap"},
            {"label": "Name.com", "value": "namedotcom"},
            {"label": "Route53", "value": "route53"},
            {"label": "Vultr", "value": "vultr"}
          ]
        },
        "dns01Okey": {
          "type": "text",
          "label": "API Key",
          "help": "API key for DNS provider",
          "hidden": "!data.dns01Active"
        },
        "dns01Osecret": {
          "type": "text",
          "label": "API Secret",
          "help": "API secret for DNS provider (if required)",
          "hidden": "!data.dns01Active"
        },
        "dns01OverifyPropagation": {
          "type": "checkbox",
          "label": "Verify DNS Propagation",
          "help": "Wait for DNS records to propagate before proceeding",
          "hidden": "!data.dns01Active"
        },
        "dns01PpropagationDelay": {
          "type": "number",
          "label": "Propagation Delay (ms)",
          "min": 30000,
          "max": 600000,
          "default": 120000,
          "help": "Time to wait for DNS propagation",
          "hidden": "!data.dns01Active || !data.dns01OverifyPropagation"
        }
      }
    },
    "collections": {
      "type": "panel",
      "label": "Certificate Collections",
      "items": {
        "collections": {
          "type": "table",
          "label": "Certificate Collections",
          "help": "Define certificate collections with domains",
          "items": [
            {
              "attr": "id",
              "type": "text",
              "title": "Collection ID",
              "width": 150
            },
            {
              "attr": "commonName",
              "type": "text", 
              "title": "Common Name",
              "width": 200
            },
            {
              "attr": "altNames",
              "type": "text",
              "title": "Alternative Names (comma-separated)",
              "width": 300
            }
          ]
        }
      }
    }
  }
}
```

## Security Best Practices

### DNS Provider Credential Management
```javascript
// Secure credential handling for DNS providers
async validateDNSCredentials() {
  if (!this.config.dns01Active) return true;
  
  try {
    const provider = require(`acme-dns-01-${this.config.dns01Module}`);
    const challenge = provider.create({
      apiKey: this.decrypt(this.config.dns01Okey),
      apiSecret: this.decrypt(this.config.dns01Osecret),
    });
    
    // Test credential validity
    await challenge.zones();
    return true;
  } catch (error) {
    this.log.error(`DNS credentials validation failed: ${error.message}`);
    return false;
  }
}
```

### Certificate Storage Security
```javascript
// Secure certificate storage
async storeCertificate(collectionId, certificateData) {
  const encryptedCert = this.encrypt(certificateData.cert);
  const encryptedKey = this.encrypt(certificateData.key);
  
  await this.setStateAsync(`certificates.${collectionId}.cert`, {
    val: encryptedCert,
    ack: true
  });
  
  await this.setStateAsync(`certificates.${collectionId}.key`, {
    val: encryptedKey,
    ack: true
  });
}
```

### ACME Account Key Protection
```javascript
// Protect ACME account private key
async getOrCreateAccountKey() {
  let accountKey = await this.getStateAsync('account.privateKey');
  
  if (!accountKey || !accountKey.val) {
    // Generate new account key
    const keypair = await this.acme.forge.createPrivateKey();
    const encryptedKey = this.encrypt(keypair);
    
    await this.setStateAsync('account.privateKey', {
      val: encryptedKey,
      ack: true
    });
    
    return keypair;
  }
  
  return this.decrypt(accountKey.val);
}
```

## Performance Optimization

### Certificate Renewal Optimization
```javascript
// Efficient certificate renewal checking
async checkCertificateRenewal() {
  for (const collection of this.config.collections) {
    try {
      const certInfo = await this.getCertificateInfo(collection.id);
      
      if (!certInfo) {
        this.log.info(`No certificate found for ${collection.id}, requesting new one`);
        await this.requestCertificate(collection);
        continue;
      }
      
      const expiryDate = new Date(certInfo.validTo);
      const renewalDate = new Date(expiryDate.getTime() - (30 * 24 * 60 * 60 * 1000)); // 30 days before expiry
      
      if (Date.now() > renewalDate.getTime()) {
        this.log.info(`Certificate for ${collection.id} expires soon, renewing`);
        await this.requestCertificate(collection);
      }
    } catch (error) {
      this.log.error(`Failed to check renewal for ${collection.id}: ${error.message}`);
    }
  }
}
```

### Concurrent Challenge Processing
```javascript
// Process multiple challenges concurrently
async processChallenges(challenges) {
  const batchSize = 3; // Limit concurrent challenges
  
  for (let i = 0; i < challenges.length; i += batchSize) {
    const batch = challenges.slice(i, i + batchSize);
    
    await Promise.all(batch.map(async (challenge) => {
      try {
        await this.processChallenge(challenge);
      } catch (error) {
        this.log.error(`Challenge processing failed: ${error.message}`);
      }
    }));
    
    // Brief pause between batches to avoid overwhelming DNS providers
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
}
```

## Debugging and Development

### ACME Debug Logging
```javascript
// Enhanced debug logging for ACME operations
debugACME(operation, data = null) {
  if (this.config.debug || process.env.NODE_ENV === 'development') {
    const logData = {
      timestamp: new Date().toISOString(),
      operation,
      ...(data && { data })
    };
    
    this.log.debug(`ACME: ${JSON.stringify(logData, null, 2)}`);
  }
}

// Usage examples
async requestCertificate(collection) {
  this.debugACME('certificate_request_start', { 
    collectionId: collection.id, 
    commonName: collection.commonName 
  });
  
  try {
    const result = await this.acme.auto({
      csr: await this.generateCSR(collection),
      email: this.config.maintainerEmail,
      termsOfServiceAgreed: true
    });
    
    this.debugACME('certificate_request_success', { 
      collectionId: collection.id,
      expiryDate: result.expires
    });
    
    return result;
  } catch (error) {
    this.debugACME('certificate_request_failed', { 
      collectionId: collection.id,
      error: error.message
    });
    throw error;
  }
}
```

### Challenge Server Debug Routes
```javascript
// Add debug routes to challenge server for development
setupChallengeServer() {
  if (this.config.http01Active) {
    this.challengeServer = require('@iobroker/webserver')({
      port: this.config.port,
      bind: this.config.bind || '0.0.0.0'
    });
    
    // Debug route for development
    if (this.config.debug) {
      this.challengeServer.app.get('/debug/status', (req, res) => {
        res.json({
          active: true,
          challenges: this.activeChallenges,
          timestamp: new Date().toISOString()
        });
      });
    }
  }
}
```