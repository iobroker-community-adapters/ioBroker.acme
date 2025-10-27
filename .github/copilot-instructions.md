# ioBroker Adapter Development with GitHub Copilot

**Version:** 0.4.2
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
                        
                        // Get all states created by adapter
                        const stateIds = await harness.dbConnection.getStateIDs('your-adapter.0.*');
                        
                        console.log(`📊 Found ${stateIds.length} states`);

                        if (stateIds.length > 0) {
                            console.log('✅ Adapter successfully created states');
                            
                            // Show sample of created states
                            const allStates = await new Promise((res, rej) => {
                                harness.states.getStates(stateIds, (err, states) => {
                                    if (err) return rej(err);
                                    res(states || []);
                                });
                            });
                            
                            console.log('📋 Sample states created:');
                            stateIds.slice(0, 5).forEach((stateId, index) => {
                                const state = allStates[index];
                                console.log(`   ${stateId}: ${state && state.val !== undefined ? state.val : 'undefined'}`);
                            });
                            
                            await harness.stopAdapter();
                            resolve(true);
                        } else {
                            console.log('❌ No states were created by the adapter');
                            reject(new Error('Adapter did not create any states'));
                        }
                    } catch (error) {
                        reject(error);
                    }
                });
            }).timeout(40000);
        });
    }
});
```

#### Testing Both Success AND Failure Scenarios

**IMPORTANT**: For every "it works" test, implement corresponding "it doesn't work and fails" tests. This ensures proper error handling and validates that your adapter fails gracefully when expected.

```javascript
// Example: Testing successful configuration
it('should configure and start adapter with valid configuration', function () {
    return new Promise(async (resolve, reject) => {
        // ... successful configuration test as shown above
    });
}).timeout(40000);

// Example: Testing failure scenarios
it('should NOT create daily states when daily is disabled', function () {
    return new Promise(async (resolve, reject) => {
        try {
            harness = getHarness();
            
            console.log('🔍 Step 1: Fetching adapter object...');
            const obj = await new Promise((res, rej) => {
                harness.objects.getObject('system.adapter.your-adapter.0', (err, o) => {
                    if (err) return rej(err);
                    res(o);
                });
            });
            
            if (!obj) return reject(new Error('Adapter object not found'));
            console.log('✅ Step 1.5: Adapter object loaded');

            console.log('🔍 Step 2: Updating adapter config...');
            Object.assign(obj.native, {
                position: TEST_COORDINATES,
                createCurrently: false,
                createHourly: true,
                createDaily: false, // Daily disabled for this test
            });

            await new Promise((res, rej) => {
                harness.objects.setObject(obj._id, obj, (err) => {
                    if (err) return rej(err);
                    console.log('✅ Step 2.5: Adapter object updated');
                    res(undefined);
                });
            });

            console.log('🔍 Step 3: Starting adapter...');
            await harness.startAdapterAndWait();
            console.log('✅ Step 4: Adapter started');

            console.log('⏳ Step 5: Waiting 20 seconds for states...');
            await new Promise((res) => setTimeout(res, 20000));

            console.log('🔍 Step 6: Fetching state IDs...');
            const stateIds = await harness.dbConnection.getStateIDs('your-adapter.0.*');

            console.log(`📊 Step 7: Found ${stateIds.length} total states`);

            const hourlyStates = stateIds.filter((key) => key.includes('hourly'));
            if (hourlyStates.length > 0) {
                console.log(`✅ Step 8: Correctly ${hourlyStates.length} hourly weather states created`);
            } else {
                console.log('❌ Step 8: No hourly states created (test failed)');
                return reject(new Error('Expected hourly states but found none'));
            }

            // Check daily states should NOT be present
            const dailyStates = stateIds.filter((key) => key.includes('daily'));
            if (dailyStates.length === 0) {
                console.log(`✅ Step 9: No daily states found as expected`);
            } else {
                console.log(`❌ Step 9: Daily states present (${dailyStates.length}) (test failed)`);
                return reject(new Error('Expected no daily states but found some'));
            }

            await harness.stopAdapter();
            console.log('🛑 Step 10: Adapter stopped');

            resolve(true);
        } catch (error) {
            reject(error);
        }
    });
}).timeout(40000);

// Example: Testing missing required configuration  
it('should handle missing required configuration properly', function () {
    return new Promise(async (resolve, reject) => {
        try {
            harness = getHarness();
            
            console.log('🔍 Step 1: Fetching adapter object...');
            const obj = await new Promise((res, rej) => {
                harness.objects.getObject('system.adapter.your-adapter.0', (err, o) => {
                    if (err) return rej(err);
                    res(o);
                });
            });
            
            if (!obj) return reject(new Error('Adapter object not found'));

            console.log('🔍 Step 2: Removing required configuration...');
            // Remove required configuration to test failure handling
            delete obj.native.position; // This should cause failure or graceful handling

            await new Promise((res, rej) => {
                harness.objects.setObject(obj._id, obj, (err) => {
                    if (err) return rej(err);
                    res(undefined);
                });
            });

            console.log('🔍 Step 3: Starting adapter...');
            await harness.startAdapterAndWait();

            console.log('⏳ Step 4: Waiting for adapter to process...');
            await new Promise((res) => setTimeout(res, 10000));

            console.log('🔍 Step 5: Checking adapter behavior...');
            const stateIds = await harness.dbConnection.getStateIDs('your-adapter.0.*');

            // Check if adapter handled missing configuration gracefully
            if (stateIds.length === 0) {
                console.log('✅ Adapter properly handled missing configuration - no invalid states created');
                resolve(true);
            } else {
                // If states were created, check if they're in error state
                const connectionState = await new Promise((res, rej) => {
                    harness.states.getState('your-adapter.0.info.connection', (err, state) => {
                        if (err) return rej(err);
                        res(state);
                    });
                });
                
                if (!connectionState || connectionState.val === false) {
                    console.log('✅ Adapter properly failed with missing configuration');
                    resolve(true);
                } else {
                    console.log('❌ Adapter should have failed or handled missing config gracefully');
                    reject(new Error('Adapter should have handled missing configuration'));
                }
            }

            await harness.stopAdapter();
        } catch (error) {
            console.log('✅ Adapter correctly threw error with missing configuration:', error.message);
            resolve(true);
        }
    });
}).timeout(40000);
```

#### Advanced State Access Patterns

For testing adapters that create multiple states, use bulk state access methods to efficiently verify large numbers of states:

```javascript
it('should create and verify multiple states', () => new Promise(async (resolve, reject) => {
    // Configure and start adapter first...
    harness.objects.getObject('system.adapter.tagesschau.0', async (err, obj) => {
        if (err) {
            console.error('Error getting adapter object:', err);
            reject(err);
            return;
        }

        // Configure adapter as needed
        obj.native.someConfig = 'test-value';
        harness.objects.setObject(obj._id, obj);

        await harness.startAdapterAndWait();

        // Wait for adapter to create states
        setTimeout(() => {
            // Access bulk states using pattern matching
            harness.dbConnection.getStateIDs('tagesschau.0.*').then(stateIds => {
                if (stateIds && stateIds.length > 0) {
                    harness.states.getStates(stateIds, (err, allStates) => {
                        if (err) {
                            console.error('❌ Error getting states:', err);
                            reject(err); // Properly fail the test instead of just resolving
                            return;
                        }

                        // Verify states were created and have expected values
                        const expectedStates = ['tagesschau.0.info.connection', 'tagesschau.0.articles.0.title'];
                        let foundStates = 0;
                        
                        for (const stateId of expectedStates) {
                            if (allStates[stateId]) {
                                foundStates++;
                                console.log(`✅ Found expected state: ${stateId}`);
                            } else {
                                console.log(`❌ Missing expected state: ${stateId}`);
                            }
                        }

                        if (foundStates === expectedStates.length) {
                            console.log('✅ All expected states were created successfully');
                            resolve();
                        } else {
                            reject(new Error(`Only ${foundStates}/${expectedStates.length} expected states were found`));
                        }
                    });
                } else {
                    reject(new Error('No states found matching pattern tagesschau.0.*'));
                }
            }).catch(reject);
        }, 20000); // Allow more time for multiple state creation
    });
})).timeout(45000);
```

#### Key Integration Testing Rules

1. **NEVER test API URLs directly** - Let the adapter handle API calls
2. **ALWAYS use the harness** - `getHarness()` provides the testing environment  
3. **Configure via objects** - Use `harness.objects.setObject()` to set adapter configuration
4. **Start properly** - Use `harness.startAdapterAndWait()` to start the adapter
5. **Check states** - Use `harness.states.getState()` to verify results
6. **Use timeouts** - Allow time for async operations with appropriate timeouts
7. **Test real workflow** - Initialize → Configure → Start → Verify States

#### Workflow Dependencies
Integration tests should run ONLY after lint and adapter tests pass:

```yaml
integration-tests:
  needs: [check-and-lint, adapter-tests]
  runs-on: ubuntu-latest
  steps:
    - name: Run integration tests
      run: npx mocha test/integration-*.js --exit
```

#### What NOT to Do
❌ Direct API testing: `axios.get('https://api.example.com')`
❌ Mock adapters: `new MockAdapter()`  
❌ Direct internet calls in tests
❌ Bypassing the harness system

#### What TO Do
✅ Use `@iobroker/testing` framework
✅ Configure via `harness.objects.setObject()`
✅ Start via `harness.startAdapterAndWait()`
✅ Test complete adapter lifecycle
✅ Verify states via `harness.states.getState()`
✅ Allow proper timeouts for async operations

#### ACME Adapter Specific Testing

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


## API Testing with Credentials
For adapters that connect to external APIs requiring authentication, implement comprehensive credential testing:

#### Password Encryption for Integration Tests
When creating integration tests that need encrypted passwords (like those marked as `encryptedNative` in io-package.json):

1. **Read system secret**: Use `harness.objects.getObjectAsync("system.config")` to get `obj.native.secret`
2. **Apply XOR encryption**: Implement the encryption algorithm:
   ```javascript
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
   ```
3. **Store encrypted password**: Set the encrypted result in adapter config, not the plain text
4. **Result**: Adapter will properly decrypt and use credentials, enabling full API connectivity testing

#### Demo Credentials Testing Pattern
- Use provider demo credentials when available (e.g., `demo@api-provider.com` / `demo`)
- Create separate test file (e.g., `test/integration-demo.js`) for credential-based tests
- Add npm script: `"test:integration-demo": "mocha test/integration-demo --exit"`
- Implement clear success/failure criteria with recognizable log messages
- Expected success pattern: Look for specific adapter initialization messages
- Test should fail clearly with actionable error messages for debugging

#### Enhanced Test Failure Handling
```javascript
it("Should connect to API with demo credentials", async () => {
    // ... setup and encryption logic ...
    
    const connectionState = await harness.states.getStateAsync("adapter.0.info.connection");
    
    if (connectionState && connectionState.val === true) {
        console.log("✅ SUCCESS: API connection established");
        return true;
    } else {
        throw new Error("API Test Failed: Expected API connection to be established with demo credentials. " +
            "Check logs above for specific API errors (DNS resolution, 401 Unauthorized, network issues, etc.)");
    }
}).timeout(120000); // Extended timeout for API calls
```

## README Updates

### Required Sections
When updating README.md files, ensure these sections are present and well-documented:

1. **Installation** - Clear npm/ioBroker admin installation steps
2. **Configuration** - Detailed configuration options with examples
3. **Usage** - Practical examples and use cases
4. **Changelog** - Version history and changes (use "## **WORK IN PROGRESS**" section for ongoing changes following AlCalzone release-script standard)
5. **License** - License information (typically MIT for ioBroker adapters)
6. **Support** - Links to issues, discussions, and community support

### Documentation Standards
- Use clear, concise language
- Include code examples for configuration
- Add screenshots for admin interface when applicable
- Maintain multilingual support (at minimum English and German)
- When creating PRs, add entries to README under "## **WORK IN PROGRESS**" section following ioBroker release script standard
- Always reference related issues in commits and PR descriptions (e.g., "solves #xx" or "fixes #xx")

### Mandatory README Updates for PRs
For **every PR or new feature**, always add a user-friendly entry to README.md:

- Add entries under `## **WORK IN PROGRESS**` section before committing
- Use format: `* (author) **TYPE**: Description of user-visible change`
- Types: **NEW** (features), **FIXED** (bugs), **ENHANCED** (improvements), **TESTING** (test additions), **CI/CD** (automation)
- Focus on user impact, not technical implementation details
- Example: `* (DutchmanNL) **FIXED**: Adapter now properly validates login credentials instead of always showing "credentials missing"`

### Documentation Workflow Standards
- **Mandatory README updates**: Establish requirement to update README.md for every PR/feature
- **Standardized documentation**: Create consistent format and categories for changelog entries
- **Enhanced development workflow**: Integrate documentation requirements into standard development process

### Changelog Management with AlCalzone Release-Script
Follow the [AlCalzone release-script](https://github.com/AlCalzone/release-script) standard for changelog management:

#### Format Requirements
- Always use `## **WORK IN PROGRESS**` as the placeholder for new changes
- Add all PR/commit changes under this section until ready for release
- Never modify version numbers manually - only when merging to main branch
- Maintain this format in README.md or CHANGELOG.md:

```markdown
# Changelog

<!--
  Placeholder for the next version (at the beginning of the line):
  ## **WORK IN PROGRESS**
-->

## **WORK IN PROGRESS**

-   Did some changes
-   Did some more changes

## v0.1.0 (2023-01-01)
Initial release
```

#### Workflow Process
- **During Development**: All changes go under `## **WORK IN PROGRESS**`
- **For Every PR**: Add user-facing changes to the WORK IN PROGRESS section
- **Before Merge**: Version number and date are only added when merging to main
- **Release Process**: The release-script automatically converts the placeholder to the actual version

#### Change Entry Format
Use this consistent format for changelog entries:
- `- (author) **TYPE**: User-friendly description of the change`
- Types: **NEW** (features), **FIXED** (bugs), **ENHANCED** (improvements)
- Focus on user impact, not technical implementation details
- Reference related issues: "fixes #XX" or "solves #XX"

#### Example Entry
```markdown
## **WORK IN PROGRESS**

- (DutchmanNL) **FIXED**: Adapter now properly validates login credentials instead of always showing "credentials missing" (fixes #25)
- (DutchmanNL) **NEW**: Added support for device discovery to simplify initial setup
```

## Dependency Updates

### Package Management
- Always use `npm` for dependency management in ioBroker adapters
- When working on new features in a repository with an existing package-lock.json file, use `npm ci` to install dependencies. Use `npm install` only when adding or updating dependencies.
- Keep dependencies minimal and focused
- Only update dependencies to latest stable versions when necessary or in separate Pull Requests. Avoid updating dependencies when adding features that don't require these updates.
- When you modify `package.json`:
  1. Run `npm install` to update and sync `package-lock.json`.
  2. If `package-lock.json` was updated, commit both `package.json` and `package-lock.json`.

### Dependency Best Practices
- Prefer built-in Node.js modules when possible
- Use `@iobroker/adapter-core` for adapter base functionality
- Avoid deprecated packages
- Document any specific version requirements

## JSON-Config Admin Instructions

### Configuration Schema
When creating admin configuration interfaces:

- Use JSON-Config format for modern ioBroker admin interfaces
- Provide clear labels and help text for all configuration options
- Include input validation and error messages
- Group related settings logically
- Example structure:
  ```json
  {
    "type": "panel",
    "items": {
      "host": {
        "type": "text",
        "label": "Host address",
        "help": "IP address or hostname of the device"
      }
    }
  }
  ```

### Admin Interface Guidelines
- Use consistent naming conventions
- Provide sensible default values
- Include validation for required fields
- Add tooltips for complex configuration options
- Ensure translations are available for all supported languages (minimum English and German)
- Write end-user friendly labels and descriptions, avoiding technical jargon where possible

## Best Practices for Dependencies

### HTTP Client Libraries
- **Preferred:** Use native `fetch` API (Node.js 20+ required for adapters; built-in since Node.js 18)
- **Avoid:** `axios` unless specific features are required (reduces bundle size)

### Example with fetch:
```javascript
try {
  const response = await fetch('https://api.example.com/data');
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }
  const data = await response.json();
} catch (error) {
  this.log.error(`API request failed: ${error.message}`);
}
```

### Other Dependency Recommendations
- **Logging:** Use adapter built-in logging (`this.log.*`)
- **Scheduling:** Use adapter built-in timers and intervals
- **File operations:** Use Node.js `fs/promises` for async file operations
- **Configuration:** Use adapter config system rather than external config libraries

## Error Handling

### Adapter Error Patterns
- Always catch and log errors appropriately
- Use adapter log levels (error, warn, info, debug)
- Provide meaningful, user-friendly error messages that help users understand what went wrong
- Handle network failures gracefully
- Implement retry mechanisms where appropriate
- Always clean up timers, intervals, and other resources in the `unload()` method

### Example Error Handling:
```javascript
try {
  await this.connectToDevice();
} catch (error) {
  this.log.error(`Failed to connect to device: ${error.message}`);
  this.setState('info.connection', false, true);
  // Implement retry logic if needed
}
```

### Timer and Resource Cleanup:
```javascript
// In your adapter class
private connectionTimer?: NodeJS.Timeout;

async onReady() {
  this.connectionTimer = setInterval(() => {
    this.checkConnection();
  }, 30000);
}

onUnload(callback) {
  try {
    // Clean up timers and intervals
    if (this.connectionTimer) {
      clearInterval(this.connectionTimer);
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
