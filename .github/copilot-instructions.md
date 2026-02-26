# ioBroker Adapter Development with GitHub Copilot

**Version:** 0.5.7  
**Template Source:** https://github.com/DrozmotiX/ioBroker-Copilot-Instructions

This file contains instructions and best practices for GitHub Copilot when working on ioBroker adapter development.

---

## 📑 Table of Contents

1. [Project Context](#project-context)
2. [Code Quality & Standards](#code-quality--standards)
   - [Code Style Guidelines](#code-style-guidelines)
   - [ESLint Configuration](#eslint-configuration)
3. [Testing](#testing)
   - [Unit Testing](#unit-testing)
   - [Integration Testing](#integration-testing)
   - [API Testing with Credentials](#api-testing-with-credentials)
4. [Development Best Practices](#development-best-practices)
   - [Dependency Management](#dependency-management)
   - [HTTP Client Libraries](#http-client-libraries)
   - [Error Handling](#error-handling)
5. [Admin UI Configuration](#admin-ui-configuration)
   - [JSON-Config Setup](#json-config-setup)
   - [Translation Management](#translation-management)
6. [Documentation](#documentation)
   - [README Updates](#readme-updates)
   - [Changelog Management](#changelog-management)
7. [CI/CD & GitHub Actions](#cicd--github-actions)
   - [Workflow Configuration](#workflow-configuration)
   - [Testing Integration](#testing-integration)
8. [ACME Adapter Specifics](#acme-adapter-specifics)
   - [TypeScript Support](#typescript-support)
   - [Security Best Practices](#security-best-practices)
   - [Performance Optimization](#performance-optimization)
   - [Debugging and Development](#debugging-and-development)

---

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

---

## Code Quality & Standards

### Code Style Guidelines

- Follow JavaScript/TypeScript best practices
- Use async/await for asynchronous operations
- Implement proper resource cleanup in `unload()` method
- Use semantic versioning for adapter releases
- Include proper JSDoc comments for public methods

**Timer and Resource Cleanup Example:**
```javascript
private connectionTimer?: NodeJS.Timeout;

async onReady() {
  this.connectionTimer = setInterval(() => this.checkConnection(), 30000);
}

onUnload(callback) {
  try {
    if (this.connectionTimer) {
      clearInterval(this.connectionTimer);
      this.connectionTimer = undefined;
    }
    callback();
  } catch (e) {
    callback();
  }
}
```

### ESLint Configuration

**CRITICAL:** ESLint validation must run FIRST in your CI/CD pipeline, before any other tests. This "lint-first" approach catches code quality issues early.

#### Setup
```bash
npm install --save-dev eslint @iobroker/eslint-config
```

#### Configuration (.eslintrc.json)
```json
{
  "extends": "@iobroker/eslint-config",
  "rules": {
    // Add project-specific rule overrides here if needed
  }
}
```

#### Package.json Scripts
```json
{
  "scripts": {
    "lint": "eslint --max-warnings 0 .",
    "lint:fix": "eslint . --fix"
  }
}
```

#### Best Practices
1. ✅ Run ESLint before committing — fix ALL warnings, not just errors
2. ✅ Use `lint:fix` for auto-fixable issues
3. ✅ Don't disable rules without documentation
4. ✅ Lint all relevant files (main code, tests, build scripts)
5. ✅ Keep `@iobroker/eslint-config` up to date
6. ✅ **ESLint warnings are treated as errors in CI** (`--max-warnings 0`). The `lint` script above already includes this flag — run `npm run lint` to match CI behavior locally

#### Common Issues
- **Unused variables**: Remove or prefix with underscore (`_variable`)
- **Missing semicolons**: Run `npm run lint:fix`
- **Indentation**: Use 4 spaces (ioBroker standard)
- **console.log**: Replace with `adapter.log.debug()` or remove

---

## Testing

### Unit Testing

- Use Jest as the primary testing framework
- Create tests for all adapter main functions and helper methods
- Test error handling scenarios and edge cases
- Mock external API calls and hardware dependencies
- For adapters connecting to APIs/devices not reachable by internet, provide example data files

**Example Structure:**
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

**CRITICAL:** Use the official `@iobroker/testing` framework. This is the ONLY correct way to test ioBroker adapters.

**Official Documentation:** https://github.com/ioBroker/testing

#### Framework Structure

**✅ Correct Pattern:**
```javascript
const path = require('path');
const { tests } = require('@iobroker/testing');

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
                        // Get adapter object
                        const obj = await new Promise((res, rej) => {
                            harness.objects.getObject('system.adapter.your-adapter.0', (err, o) => {
                                if (err) return rej(err);
                                res(o);
                            });
                        });
                        
                        if (!obj) return reject(new Error('Adapter object not found'));

                        // Configure adapter
                        Object.assign(obj.native, {
                            position: '52.520008,13.404954',
                            createHourly: true,
                        });

                        harness.objects.setObject(obj._id, obj);
                        
                        // Start and wait
                        await harness.startAdapterAndWait();
                        await new Promise(resolve => setTimeout(resolve, 15000));

                        // Verify states
                        const stateIds = await harness.dbConnection.getStateIDs('your-adapter.0.*');
                        
                        if (stateIds.length > 0) {
                            console.log('✅ Adapter successfully created states');
                            await harness.stopAdapter();
                            resolve(true);
                        } else {
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

#### Testing Success AND Failure Scenarios

**IMPORTANT:** For every "it works" test, implement corresponding "it fails gracefully" tests.

**Failure Scenario Example:**
```javascript
it('should NOT create daily states when daily is disabled', function () {
    return new Promise(async (resolve, reject) => {
        try {
            harness = getHarness();
            const obj = await new Promise((res, rej) => {
                harness.objects.getObject('system.adapter.your-adapter.0', (err, o) => {
                    if (err) return rej(err);
                    res(o);
                });
            });
            
            if (!obj) return reject(new Error('Adapter object not found'));

            Object.assign(obj.native, {
                createDaily: false, // Daily disabled
            });

            await new Promise((res, rej) => {
                harness.objects.setObject(obj._id, obj, (err) => {
                    if (err) return rej(err);
                    res(undefined);
                });
            });

            await harness.startAdapterAndWait();
            await new Promise((res) => setTimeout(res, 20000));

            const stateIds = await harness.dbConnection.getStateIDs('your-adapter.0.*');
            const dailyStates = stateIds.filter((key) => key.includes('daily'));
            
            if (dailyStates.length === 0) {
                console.log('✅ No daily states found as expected');
                resolve(true);
            } else {
                reject(new Error('Expected no daily states but found some'));
            }

            await harness.stopAdapter();
        } catch (error) {
            reject(error);
        }
    });
}).timeout(40000);
```

#### Key Rules

1. ✅ Use `@iobroker/testing` framework
2. ✅ Configure via `harness.objects.setObject()`
3. ✅ Start via `harness.startAdapterAndWait()`
4. ✅ Verify states via `harness.states.getState()`
5. ✅ Allow proper timeouts for async operations
6. ❌ NEVER test API URLs directly
7. ❌ NEVER bypass the harness system

#### Workflow Dependencies

Integration tests should run ONLY after lint and adapter tests pass:

```yaml
integration-tests:
  needs: [check-and-lint, adapter-tests]
  runs-on: ubuntu-22.04
```

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

### API Testing with Credentials

For adapters connecting to external APIs requiring authentication:

#### Password Encryption for Integration Tests

```javascript
async function encryptPassword(harness, password) {
    const systemConfig = await harness.objects.getObjectAsync("system.config");
    if (!systemConfig?.native?.secret) {
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

#### Demo Credentials Testing Pattern

- Use provider demo credentials when available (e.g., `demo@api-provider.com` / `demo`)
- Create separate test file: `test/integration-demo.js`
- Add npm script: `"test:integration-demo": "mocha test/integration-demo --exit"`
- Implement clear success/failure criteria

**Example Implementation:**
```javascript
it("Should connect to API with demo credentials", async () => {
    const encryptedPassword = await encryptPassword(harness, "demo_password");
    
    await harness.changeAdapterConfig("your-adapter", {
        native: {
            username: "demo@provider.com",
            password: encryptedPassword,
        }
    });

    await harness.startAdapter();
    await new Promise(resolve => setTimeout(resolve, 60000));
    
    const connectionState = await harness.states.getStateAsync("your-adapter.0.info.connection");
    
    if (connectionState?.val === true) {
        console.log("✅ SUCCESS: API connection established");
        return true;
    } else {
        throw new Error("API Test Failed: Expected API connection. Check logs for API errors.");
    }
}).timeout(120000);
```

---

## Development Best Practices

### Dependency Management

- Always use `npm` for dependency management
- Use `npm ci` for installing existing dependencies (respects package-lock.json)
- Use `npm install` only when adding or updating dependencies
- Keep dependencies minimal and focused
- Only update dependencies in separate Pull Requests

**When modifying package.json:**
1. Run `npm install` to sync package-lock.json
2. Commit both package.json and package-lock.json together

**Best Practices:**
- Prefer built-in Node.js modules when possible
- Use `@iobroker/adapter-core` for adapter base functionality
- Avoid deprecated packages
- Document specific version requirements

### HTTP Client Libraries

- **Preferred:** Use native `fetch` API (Node.js 20+ required)
- **Avoid:** `axios` unless specific features are required

**Example with fetch:**
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

**Other Recommendations:**
- **Logging:** Use adapter built-in logging (`this.log.*`)
- **Scheduling:** Use adapter built-in timers and intervals
- **File operations:** Use Node.js `fs/promises`
- **Configuration:** Use adapter config system

### Error Handling

- Always catch and log errors appropriately
- Use adapter log levels (error, warn, info, debug)
- Provide meaningful, user-friendly error messages
- Handle network failures gracefully
- Implement retry mechanisms where appropriate
- Always clean up timers, intervals, and resources in `unload()` method

**Example:**
```javascript
try {
  await this.connectToDevice();
} catch (error) {
  this.log.error(`Failed to connect to device: ${error.message}`);
  this.setState('info.connection', false, true);
  // Implement retry logic if needed
}
```

---

## Admin UI Configuration

### JSON-Config Setup

Use JSON-Config format for modern ioBroker admin interfaces.

**Example Structure:**
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

**Guidelines:**
- ✅ Use consistent naming conventions
- ✅ Provide sensible default values
- ✅ Include validation for required fields
- ✅ Add tooltips for complex options
- ✅ Ensure translations for all supported languages (minimum English and German)
- ✅ Write end-user friendly labels, avoid technical jargon

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

### Translation Management

**CRITICAL:** Translation files must stay synchronized with `admin/jsonConfig.json`. Orphaned keys or missing translations cause UI issues and PR review delays.

#### Overview
- **Location:** `admin/i18n/{lang}/translations.json` for 11 languages (de, en, es, fr, it, nl, pl, pt, ru, uk, zh-cn)
- **Source of truth:** `admin/jsonConfig.json` - all `label` and `help` properties must have translations
- **Command:** `npm run translate` - auto-generates translations but does NOT remove orphaned keys
- **Formatting:** English uses tabs, other languages use 4 spaces

#### Critical Rules
1. ✅ Keys must match exactly with jsonConfig.json
2. ✅ No orphaned keys in translation files
3. ✅ All translations must be in native language (no English fallbacks)
4. ✅ Keys must be sorted alphabetically

#### Workflow for Translation Updates

**When modifying admin/jsonConfig.json:**

1. Make your changes to labels/help texts
2. Run automatic translation: `npm run translate`
3. Create validation script (`scripts/validate-translations.js`):

```javascript
const fs = require('fs');
const path = require('path');
const jsonConfig = JSON.parse(fs.readFileSync('admin/jsonConfig.json', 'utf8'));

function extractTexts(obj, texts = new Set()) {
    if (typeof obj === 'object' && obj !== null) {
        if (obj.label) texts.add(obj.label);
        if (obj.help) texts.add(obj.help);
        for (const key in obj) {
            extractTexts(obj[key], texts);
        }
    }
    return texts;
}

const requiredTexts = extractTexts(jsonConfig);
const languages = ['de', 'en', 'es', 'fr', 'it', 'nl', 'pl', 'pt', 'ru', 'uk', 'zh-cn'];
let hasErrors = false;

languages.forEach(lang => {
    const translationPath = path.join('admin', 'i18n', lang, 'translations.json');
    const translations = JSON.parse(fs.readFileSync(translationPath, 'utf8'));
    const translationKeys = new Set(Object.keys(translations));
    
    const missing = Array.from(requiredTexts).filter(text => !translationKeys.has(text));
    const orphaned = Array.from(translationKeys).filter(key => !requiredTexts.has(key));
    
    console.log(`\n=== ${lang} ===`);
    if (missing.length > 0) {
        console.error('❌ Missing keys:', missing);
        hasErrors = true;
    }
    if (orphaned.length > 0) {
        console.error('❌ Orphaned keys (REMOVE THESE):', orphaned);
        hasErrors = true;
    }
    if (missing.length === 0 && orphaned.length === 0) {
        console.log('✅ All keys match!');
    }
});

process.exit(hasErrors ? 1 : 0);
```

4. Run validation: `node scripts/validate-translations.js`
5. Remove orphaned keys manually from all translation files
6. Add missing translations in native languages
7. Run: `npm run lint && npm run test`

#### Add Validation to package.json

```json
{
  "scripts": {
    "translate": "translate-adapter",
    "validate:translations": "node scripts/validate-translations.js",
    "pretest": "npm run lint && npm run validate:translations"
  }
}
```

#### Translation Checklist

Before committing changes to admin UI or translations:
1. ✅ Validation script shows "All keys match!" for all 11 languages
2. ✅ No orphaned keys in any translation file
3. ✅ All translations in native language
4. ✅ Keys alphabetically sorted
5. ✅ `npm run lint` passes
6. ✅ `npm run test` passes
7. ✅ Admin UI displays correctly

---

## Documentation

### README Updates

#### Required Sections
1. **Installation** - Clear npm/ioBroker admin installation steps
2. **Configuration** - Detailed configuration options with examples
3. **Usage** - Practical examples and use cases
4. **Changelog** - Version history (use "## **WORK IN PROGRESS**" for ongoing changes)
5. **License** - License information (typically MIT for ioBroker adapters)
6. **Support** - Links to issues, discussions, community support

#### Documentation Standards
- Use clear, concise language
- Include code examples for configuration
- Add screenshots for admin interface when applicable
- Maintain multilingual support (minimum English and German)
- Always reference issues in commits and PRs (e.g., "fixes #xx")

#### Mandatory README Updates for PRs

For **every PR or new feature**, always add a user-friendly entry to README.md:

- Add entries under `## **WORK IN PROGRESS**` section
- Use format: `* (author) **TYPE**: Description of user-visible change`
- Types: **NEW** (features), **FIXED** (bugs), **ENHANCED** (improvements), **TESTING** (test additions), **CI/CD** (automation)
- Focus on user impact, not technical details

**Example:**
```markdown
## **WORK IN PROGRESS**

* (DutchmanNL) **FIXED**: Adapter now properly validates login credentials (fixes #25)
* (DutchmanNL) **NEW**: Added device discovery to simplify initial setup
```

### Changelog Management

Follow the [AlCalzone release-script](https://github.com/AlCalzone/release-script) standard.

#### Format Requirements

```markdown
# Changelog

<!--
  Placeholder for the next version (at the beginning of the line):
  ## **WORK IN PROGRESS**
-->

## **WORK IN PROGRESS**

- (author) **NEW**: Added new feature X
- (author) **FIXED**: Fixed bug Y (fixes #25)

## v0.1.0 (2023-01-01)
Initial release
```

#### Workflow Process
- **During Development:** All changes go under `## **WORK IN PROGRESS**`
- **For Every PR:** Add user-facing changes to WORK IN PROGRESS section
- **Before Merge:** Version number and date added when merging to main
- **Release Process:** Release-script automatically converts placeholder to actual version

#### Change Entry Format
- Format: `- (author) **TYPE**: User-friendly description`
- Types: **NEW**, **FIXED**, **ENHANCED**
- Focus on user impact, not technical implementation
- Reference issues: "fixes #XX" or "solves #XX"

---

## CI/CD & GitHub Actions

### Workflow Configuration

#### GitHub Actions Best Practices

**Must use ioBroker official testing actions:**
- `ioBroker/testing-action-check@v1` for lint and package validation
- `ioBroker/testing-action-adapter@v1` for adapter tests
- `ioBroker/testing-action-deploy@v1` for automated releases with Trusted Publishing (OIDC)

**Configuration:**
- **Node.js versions:** Test on 20.x, 22.x, 24.x
- **Platform:** Use ubuntu-22.04
- **Automated releases:** Deploy to npm on version tags (requires NPM Trusted Publishing)
- **Monitoring:** Include Sentry release tracking for error monitoring

#### Critical: Lint-First Validation Workflow

**ALWAYS run ESLint checks BEFORE other tests.** Benefits:
- Catches code quality issues immediately
- Prevents wasting CI resources on tests that would fail due to linting errors
- Provides faster feedback to developers
- Enforces consistent code quality

**Workflow Dependency Configuration:**
```yaml
jobs:
  check-and-lint:
    # Runs ESLint and package validation
    # Uses: ioBroker/testing-action-check@v1
    
  adapter-tests:
    needs: [check-and-lint]  # Wait for linting to pass
    # Run adapter unit tests
    
  integration-tests:
    needs: [check-and-lint, adapter-tests]  # Wait for both
    # Run integration tests
```

**Key Points:**
- The `check-and-lint` job has NO dependencies - runs first
- ALL other test jobs MUST list `check-and-lint` in their `needs` array
- If linting fails, no other tests run, saving time
- Fix all ESLint errors before proceeding

### Testing Integration

#### API Testing in CI/CD

For adapters with external API dependencies:

```yaml
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

#### Testing Best Practices
- Run credential tests separately from main test suite
- Don't make credential tests required for deployment
- Provide clear failure messages for API issues
- Use appropriate timeouts for external calls (120+ seconds)

#### Package.json Integration
```json
{
  "scripts": {
    "test:integration-demo": "mocha test/integration-demo --exit"
  }
}
```

---

## ACME Adapter Specifics

### TypeScript Support

#### Type Definitions
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

#### Main Adapter with TypeScript
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

### Security Best Practices

#### DNS Provider Credential Management
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

#### Certificate Storage Security
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

#### ACME Account Key Protection
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

### Performance Optimization

#### Certificate Renewal Optimization
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

#### Concurrent Challenge Processing
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

### Debugging and Development

#### ACME Debug Logging
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

#### Challenge Server Debug Routes
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
