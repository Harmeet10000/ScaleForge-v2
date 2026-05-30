# Progressive Sandboxing: A Comprehensive Learning Guide

**How to safely roll out breaking security changes without disrupting users.**

---

## Table of Contents

1. [What is Progressive Sandboxing?](#what-is-progressive-sandboxing)
2. [Prerequisites & Concepts](#prerequisites--concepts)
3. [Implementation Strategy](#implementation-strategy)
4. [Code Examples](#code-examples)
5. [Real-World Applications](#real-world-applications)
6. [Anti-Patterns & Pitfalls](#anti-patterns--pitfalls)
7. [Best Practices](#best-practices)

---

## What is Progressive Sandboxing?

**Definition**: A deployment strategy where you incrementally enable security restrictions (sandboxing) across multiple versions/cohorts of users, rather than switching it on all at once.

### The Problem

In Electron apps, enabling the sandbox is a **breaking change**:
- Existing code loses access to Node.js APIs
- Many extensions/plugins will break
- Performance characteristics change
- User workflows may be disrupted

### The VS Code Solution

Instead of one major version with sandbox enabled, VS Code:

1. **Released monthly updates** with sandbox-compatible code changes (2020-2022)
2. **Added a feature flag** `window.experimental.useSandbox`
3. **Rolled out to Insiders first** for testing
4. **Gradually enabled in Stable** (Jan 2023+)
5. **Monitored crash rates** at each stage
6. **Reverted fast** if critical issues appeared

**Result**: Successful sandbox migration in Electron while shipping monthly updates!

---

## Prerequisites & Concepts

### Understanding Sandbox Restrictions

```javascript
// ❌ BLOCKED in sandbox
const fs = require('fs');           // No Node.js modules
const { exec } = require('child_process');
const Buffer = require('buffer').Buffer; // Use Uint8Array instead

// ✅ ALLOWED in sandbox
const buffer = new Uint8Array(10); // Browser-compatible
const data = JSON.stringify(obj);  // Serialization still works
const result = await somePromise;  // Async/await still works
```

### Key Concepts Before Implementation

**1. Graceful Degradation**

```javascript
// Code that works in both sandboxed and non-sandboxed
function readFileCompat(path) {
  // Try Node.js method first
  try {
    return require('fs').readFileSync(path, 'utf-8');
  } catch (e) {
    // Fall back to IPC if Node.js not available
    return window.api?.readFile?.(path);
  }
}

// Better: Feature detection
const hasNodeFS = typeof require === 'function';

class FileSystem {
  async readFile(path) {
    if (hasNodeFS) {
      return require('fs').promises.readFile(path, 'utf-8');
    } else {
      return await window.api.readFile(path);
    }
  }
}
```

**2. Feature Flag Pattern**

```javascript
// electron-main.js
const isDev = !app.isPackaged;
const useSandbox = isDev 
  ? true  // Always sandbox in development
  : store.get('window.experimental.useSandbox', false); // User setting

const mainWindow = new BrowserWindow({
  webPreferences: {
    sandbox: useSandbox,
    contextIsolation: true,
    preload: path.join(__dirname, 'preload.js')
  }
});
```

**3. Telemetry for Rollout**

```javascript
class RolloutTelemetry {
  constructor() {
    this.events = [];
    this.crashes = 0;
    this.hangs = 0;
  }

  recordCrash(stackTrace) {
    this.crashes++;
    this.events.push({
      type: 'crash',
      timestamp: Date.now(),
      stackTrace
    });
  }

  recordPerformance(metricName, duration) {
    this.events.push({
      type: 'perf',
      metric: metricName,
      duration,
      timestamp: Date.now()
    });
  }

  canContinueRollout() {
    const crashRate = this.crashes / this.events.length;
    return crashRate < 0.01; // Less than 1% crash rate
  }

  getSummary() {
    return {
      totalEvents: this.events.length,
      crashes: this.crashes,
      crashRate: this.crashes / this.events.length,
      recommendation: this.canContinueRollout() ? 'continue' : 'rollback'
    };
  }
}
```

---

## Implementation Strategy

### Phase 1: Preparation (Months 1-2)

**Goal**: Make code sandbox-compatible without enabling sandbox.

```javascript
// Step 1: Identify non-compatible code
// Use static analysis to find all Node.js usage in renderer

const esprima = require('esprima');
const fs = require('fs');

class NodeJSDetector {
  constructor() {
    this.issues = [];
    this.nodeApis = [
      'fs', 'path', 'os', 'crypto', 'child_process',
      'http', 'net', 'Buffer'
    ];
  }

  analyzeFile(filepath) {
    const code = fs.readFileSync(filepath, 'utf-8');
    const ast = esprima.parse(code);

    this._walkAST(ast, filepath);
    return this.issues;
  }

  _walkAST(node, filepath) {
    if (!node) return;

    if (node.type === 'CallExpression') {
      const callee = node.callee.name || node.callee.property?.name;
      if (this.nodeApis.includes(callee)) {
        this.issues.push({
          file: filepath,
          line: node.loc.start.line,
          api: callee,
          severity: 'error'
        });
      }
    }

    if (node.type === 'Identifier' && node.name === 'Buffer') {
      this.issues.push({
        file: filepath,
        line: node.loc.start.line,
        api: 'Buffer',
        severity: 'warning'
      });
    }

    for (const key in node) {
      if (typeof node[key] === 'object' && node[key] !== null) {
        this._walkAST(node[key], filepath);
      }
    }
  }
}

// Usage
const detector = new NodeJSDetector();
const issues = detector.analyzeFile('./renderer.js');
console.log(issues);
```

### Phase 2: Conversion (Months 3-8)

**Goal**: Convert all Node.js code to use IPC instead.

```javascript
// BEFORE: Direct Node.js usage
class OldFileManager {
  readFile(path) {
    return require('fs').readFileSync(path, 'utf-8');
  }

  writeFile(path, content) {
    require('fs').writeFileSync(path, content);
  }
}

// AFTER: IPC-based with fallback
class SandboxCompatibleFileManager {
  async readFile(path) {
    // Try IPC first (works in sandbox)
    if (window.api?.readFile) {
      return await window.api.readFile(path);
    }
    
    // Fallback to Node.js (non-sandboxed)
    return require('fs').readFileSync(path, 'utf-8');
  }

  async writeFile(path, content) {
    if (window.api?.writeFile) {
      return await window.api.writeFile(path, content);
    }
    
    return require('fs').writeFileSync(path, content);
  }
}
```

### Phase 3: Testing (Months 9-12)

**Goal**: Enable sandbox for Insiders users, monitor crashes.

```javascript
// In Electron main process
const Sentry = require('@sentry/electron');

Sentry.init({
  dsn: 'YOUR_DSN',
  environment: isDev ? 'development' : 'production',
  beforeSend(event, hint) {
    // Only send telemetry for sandboxed mode
    if (!useSandbox) return null;
    return event;
  }
});

// Track sandbox-specific errors
class SandboxCrashMonitor {
  constructor() {
    process.on('uncaughtException', (error) => {
      Sentry.captureException(error, {
        tags: {
          sandbox: useSandbox,
          version: app.getVersion()
        }
      });
    });
  }
}

// Usage
ipcMain.handle('report-error', (event, error) => {
  Sentry.captureException(new Error(error.message), {
    tags: {
      origin: 'renderer',
      sandbox: useSandbox
    }
  });
});
```

### Phase 4: Gradual Rollout (Months 13+)

**Goal**: Enable for increasing % of Stable users based on telemetry.

```javascript
// Feature flag with gradual rollout
class FeatureFlagManager {
  constructor() {
    this.userId = generateUserID();
    this.features = new Map();
  }

  // Deterministic: same user always gets same flag state
  shouldEnableSandbox() {
    const hash = this.hashUserId(this.userId);
    const rolloutPercent = this.getRolloutPercent(); // 0-100

    return hash % 100 < rolloutPercent;
  }

  getRolloutPercent() {
    // Day 1: 1% of users
    // Day 7: 5% of users
    // Day 14: 10% of users
    // etc.
    const releaseDate = new Date('2023-01-01');
    const daysSinceRelease = Math.floor(
      (Date.now() - releaseDate) / (1000 * 60 * 60 * 24)
    );

    // Exponential rollout
    return Math.min(100, Math.pow(1.5, Math.floor(daysSinceRelease / 3)));
  }

  hashUserId(userId) {
    // Deterministic hash
    let hash = 0;
    for (let i = 0; i < userId.length; i++) {
      hash = ((hash << 5) - hash) + userId.charCodeAt(i);
      hash = hash & hash; // Convert to 32bit
    }
    return Math.abs(hash);
  }
}

// Usage
const featureFlags = new FeatureFlagManager();
const useSandbox = featureFlags.shouldEnableSandbox();
```

---

## Code Examples

### Example 1: Progressive Conversion Pattern

```javascript
// ============================================
// Complete Progressive Sandboxing Example
// ============================================

// Step 1: Feature flag
const ENABLE_SANDBOX = process.env.SANDBOX_MODE === 'true';

// Step 2: Abstraction layer
class FileSystemAPI {
  constructor() {
    this.sandboxed = ENABLE_SANDBOX;
  }

  // Async-first design (works in both modes)
  async readFile(path, encoding = 'utf-8') {
    if (this.sandboxed) {
      // Use IPC in sandbox
      return await ipcRenderer.invoke('fs:read', path, encoding);
    } else {
      // Direct Node.js access in non-sandbox
      const fs = require('fs').promises;
      return await fs.readFile(path, encoding);
    }
  }

  async writeFile(path, content, encoding = 'utf-8') {
    if (this.sandboxed) {
      return await ipcRenderer.invoke('fs:write', path, content, encoding);
    } else {
      const fs = require('fs').promises;
      return await fs.writeFile(path, content, encoding);
    }
  }

  async deleteFile(path) {
    if (this.sandboxed) {
      return await ipcRenderer.invoke('fs:delete', path);
    } else {
      const fs = require('fs').promises;
      return await fs.unlink(path);
    }
  }
}

// Step 3: IPC handlers in main process
ipcMain.handle('fs:read', async (event, path, encoding) => {
  const fs = require('fs').promises;
  return await fs.readFile(path, encoding);
});

ipcMain.handle('fs:write', async (event, path, content, encoding) => {
  const fs = require('fs').promises;
  return await fs.writeFile(path, content, encoding);
});

ipcMain.handle('fs:delete', async (event, path) => {
  const fs = require('fs').promises;
  return await fs.unlink(path);
});

// Step 4: Usage (works in both modes!)
const fs = new FileSystemAPI();
const content = await fs.readFile('./config.json');
```

### Example 2: Compatibility Layer Pattern

```javascript
// ============================================
// Building APIs that work in both modes
// ============================================

// What we're trying to support
const renderProcess = {
  sandboxed: true,
  hasNodeFS: false,
  hasIPC: true
};

// Solution: Feature-detection wrapper
class CompatibleAPI {
  constructor() {
    this.capabilities = this._detectCapabilities();
  }

  _detectCapabilities() {
    return {
      hasNodeFS: typeof require === 'function',
      hasIPC: typeof window.api !== 'undefined',
      hasWorkers: typeof Worker !== 'undefined',
      asyncRequired: !typeof require === 'function'
    };
  }

  // Always async - works everywhere
  async getProjectFiles(directory) {
    const { hasNodeFS, hasIPC } = this.capabilities;

    if (hasNodeFS) {
      // Fast path: direct file system access
      const fs = require('fs').promises;
      return await fs.readdir(directory);
    } else if (hasIPC) {
      // Sandbox path: ask main process
      return await window.api.listFiles(directory);
    } else {
      throw new Error('No file system access available');
    }
  }

  // Buffer handling compatibility
  createBuffer(size) {
    const { hasNodeFS } = this.capabilities;

    if (hasNodeFS) {
      return Buffer.alloc(size);
    } else {
      return new Uint8Array(size);
    }
  }

  // Path handling
  resolvePath(path) {
    if (typeof require === 'function') {
      return require('path').resolve(path);
    } else {
      // Minimal path resolution for sandbox
      return path.split('/').filter(p => p && p !== '.').join('/');
    }
  }
}

// Usage
const api = new CompatibleAPI();
const files = await api.getProjectFiles('./src');
const buffer = api.createBuffer(1024);
```

### Example 3: Migration Tracking

```javascript
// ============================================
// Track migration progress
// ============================================

class SandboxMigrationTracker {
  constructor() {
    this.issues = [];
    this.migratedModules = new Set();
    this.nonMigrated = new Set();
  }

  // Track which modules are sandbox-compatible
  registerModule(name, sandboxCompatible) {
    if (sandboxCompatible) {
      this.migratedModules.add(name);
    } else {
      this.nonMigrated.add(name);
    }
  }

  // Report issues found
  reportIssue(module, issue, severity = 'warning') {
    this.issues.push({
      module,
      issue,
      severity,
      timestamp: Date.now()
    });
  }

  // Get migration status
  getMigrationStatus() {
    const total = this.migratedModules.size + this.nonMigrated.size;
    const percent = Math.round(
      (this.migratedModules.size / total) * 100
    );

    return {
      total,
      migrated: this.migratedModules.size,
      pending: this.nonMigrated.size,
      percentComplete: percent,
      blockers: this.issues.filter(i => i.severity === 'error')
    };
  }
}

// Usage
const tracker = new SandboxMigrationTracker();

tracker.registerModule('editor', true);    // ✅ Migrated
tracker.registerModule('extensions', true);
tracker.registerModule('native-module', false); // ❌ Pending
tracker.reportIssue(
  'native-module',
  'Uses require("native_addon")',
  'error'
);

console.log(tracker.getMigrationStatus());
// {
//   total: 3,
//   migrated: 2,
//   pending: 1,
//   percentComplete: 66,
//   blockers: [...]
// }
```

---

## Real-World Applications

### Application 1: Gradual Desktop App Modernization

```javascript
// ============================================
// Desktop App Progressive Modernization
// ============================================

class ElectronAppModernizer {
  constructor() {
    this.version = app.getVersion();
    this.phase = this._determinePhase();
  }

  _determinePhase() {
    // Version 1.0-1.5: Pre-sandbox (Node.js allowed)
    // Version 1.5-2.0: Compatibility phase (both work)
    // Version 2.0+: Sandbox mandatory
    
    const [major, minor] = this.version.split('.').map(Number);
    
    if (major < 1 || (major === 1 && minor < 5)) {
      return 'pre-sandbox';
    } else if (major === 1 || (major === 2 && minor < 0)) {
      return 'compatibility';
    } else {
      return 'sandbox-mandatory';
    }
  }

  async initialize() {
    switch (this.phase) {
      case 'pre-sandbox':
        await this._initPreSandbox();
        break;
      case 'compatibility':
        await this._initCompatibility();
        break;
      case 'sandbox-mandatory':
        await this._initSandbox();
        break;
    }
  }

  async _initPreSandbox() {
    // Old code path - full Node.js access
    const settings = require('fs').readFileSync('./config.json');
    // ... etc
  }

  async _initCompatibility() {
    // Both paths available
    const settings = await this._getSettings();
  }

  async _initSandbox() {
    // Sandbox required
    const settings = await this._getSettingsSafe();
  }

  async _getSettings() {
    try {
      // Try Node.js first
      if (this.phase === 'pre-sandbox') {
        return require('fs').readFileSync('./config.json');
      }
    } catch (e) {
      // Fall back to IPC
    }
    return await ipcRenderer.invoke('get-settings');
  }

  async _getSettingsSafe() {
    return await ipcRenderer.invoke('get-settings');
  }
}
```

### Application 2: Plugin System with Progressive Requirements

```javascript
// ============================================
// Plugin Compatibility Management
// ============================================

class PluginManager {
  constructor(sandboxMode) {
    this.sandboxMode = sandboxMode;
    this.plugins = new Map();
    this.incompatible = new Map();
  }

  loadPlugin(pluginPath, manifest) {
    const requires = manifest.requires || [];
    
    // Check compatibility
    const compatible = this._checkCompatibility(requires);

    if (compatible) {
      this.plugins.set(pluginPath, {
        manifest,
        enabled: true
      });
      return { success: true };
    } else {
      this.incompatible.set(pluginPath, {
        manifest,
        reason: 'Incompatible with sandbox mode',
        requiredAPIs: requires.filter(
          (r) => !this._hasAPI(r)
        )
      });
      return {
        success: false,
        reason: 'Sandbox incompatible'
      };
    }
  }

  _checkCompatibility(requires) {
    if (!this.sandboxMode) return true; // All compatible in non-sandbox

    // In sandbox, check if all required APIs available
    return requires.every((api) => this._hasAPI(api));
  }

  _hasAPI(api) {
    const sandboxAPIs = [
      'ipc',           // ✅ IPC works in sandbox
      'storage',       // ✅ Storage works
      'events',        // ✅ Events work
      'fs',            // ❌ Direct FS doesn't work
      'child_process', // ❌ Doesn't work
      'require'        // ❌ Node.js not available
    ];

    return sandboxAPIs.includes(api);
  }

  getCompatibilityReport() {
    return {
      compatible: this.plugins.size,
      incompatible: this.incompatible.size,
      blocked: Array.from(this.incompatible.values()).map(
        (p) => ({
          name: p.manifest.name,
          version: p.manifest.version,
          missingAPIs: p.requiredAPIs
        })
      )
    };
  }
}

// Usage
const plugins = new PluginManager(true); // Sandbox enabled

plugins.loadPlugin('./plugins/old-plugin', {
  name: 'legacy-tool',
  requires: ['fs', 'child_process'] // ❌ Won't load
});

plugins.loadPlugin('./plugins/modern-plugin', {
  name: 'modern-tool',
  requires: ['ipc', 'storage'] // ✅ Will load
});

console.log(plugins.getCompatibilityReport());
```

---

## Anti-Patterns & Pitfalls

### ❌ Anti-Pattern 1: Big Bang Migration

```javascript
// ❌ BAD: Release sandbox in one major version
// v2.0 - Sandbox REQUIRED
ipcMain.handle('app:start', () => {
  // All users must adapt immediately
  // Plugins break, extensions fail
  // User complaints flood in
  // Rollback is painful
});

// ✅ GOOD: Progressive rollout
// v1.5: Sandbox optional, added to Insiders
// v1.6-1.9: More code ported, broader testing
// v2.0: Sandbox by default, opt-out available
// v2.5: Sandbox mandatory
```

### ❌ Anti-Pattern 2: No Telemetry During Rollout

```javascript
// ❌ BAD: Enable sandbox without monitoring
ipcMain.handle('enable-sandbox', () => {
  // Is it stable? Who knows? 🤷
  enableSandboxMode();
});

// ✅ GOOD: Comprehensive monitoring
class RolloutMonitor {
  constructor() {
    this.metrics = {
      crashes: 0,
      hangs: 0,
      errors: 0,
      startupTime: [],
      userSessions: 0
    };
  }

  trackCrash(error) {
    this.metrics.crashes++;
    this.checkHealthStatus();
  }

  checkHealthStatus() {
    const crashRate = this.metrics.crashes / this.metrics.userSessions;
    
    if (crashRate > 0.05) {
      // Halt rollout
      this.reportCriticalIssue();
      this.pauseRollout();
    }
  }

  reportCriticalIssue() {
    // Alert team, create incident
    console.error('Sandbox rollout paused due to high crash rate');
  }

  pauseRollout() {
    // Stop releasing to new users
    store.set('sandbox.rollout.paused', true);
  }
}
```

### ❌ Anti-Pattern 3: Ignoring Plugin/Extension Compatibility

```javascript
// ❌ BAD: Enable sandbox without plugin support
function enableSandbox() {
  browserWindow.webPreferences.sandbox = true;
  // Plugins silently break with no warning
}

// ✅ GOOD: Graceful plugin handling
function enableSandbox() {
  browserWindow.webPreferences.sandbox = true;

  // Check all plugins
  const incompatible = this.checkPluginCompatibility();

  if (incompatible.length > 0) {
    // Warn user
    showPluginWarning(incompatible);
    
    // Provide options
    userChoice = askUser([
      'Enable sandbox (disable incompatible plugins)',
      'Stay on non-sandboxed version',
      'Learn more'
    ]);

    if (userChoice === 'disable-incompatible') {
      disablePlugins(incompatible);
    }
  }
}
```

### ❌ Anti-Pattern 4: Skipping Insiders/Beta Testing

```javascript
// ❌ BAD: Test only internally
// Release directly to all users
ipcMain.on('experimental:sandbox', () => {
  enableSandbox(); // No real-world testing!
});

// ✅ GOOD: Multi-stage rollout
const rolloutStages = {
  development: 100,        // All dev builds
  insiders: 100,          // All Insiders users (early adopters)
  stable_beta: 10,        // 10% of stable with beta flag
  stable: percentage()    // Gradually increase
};

function shouldEnableSandbox() {
  const channel = app.getVersion().includes('insider') ? 'insiders' : 'stable';
  const rolloutTarget = rolloutStages[channel];
  
  return userHashValue() % 100 < rolloutTarget;
}
```

### ❌ Anti-Pattern 5: Not Providing Rollback Path

```javascript
// ❌ BAD: No way to disable sandbox
browserWindow.webPreferences.sandbox = true; // Stuck!

// ✅ GOOD: Always provide escape hatch
function configureWebPreferences() {
  const sandboxEnabled = store.get('sandbox.enabled', false);
  
  return {
    sandbox: sandboxEnabled,
    contextIsolation: true,
    preload: getPreloadPath()
  };
}

// User can always disable
ipcMain.handle('disable-sandbox', async (event) => {
  store.set('sandbox.enabled', false);
  
  // Restart required
  dialog.showMessageBox({
    type: 'info',
    message: 'Sandbox disabled. Please restart the application.'
  });
  
  setTimeout(() => {
    app.relaunch();
    app.quit();
  }, 1000);
});
```

---

## Best Practices

### 1. Comprehensive Testing Strategy

```javascript
// ============================================
// Testing each rollout phase
// ============================================

class SandboxRolloutTest {
  // Phase 1: Unit tests
  testIPC_Module() {
    const module = require('./ipc-module');
    assert(module.readFile instanceof Function);
    assert(module.writeFile instanceof Function);
  }

  // Phase 2: Integration tests
  async testRendererToMainCommunication() {
    const ipc = setupTestIPC();
    const result = await ipc.invoke('test:echo', 'hello');
    assert(result === 'hello');
  }

  // Phase 3: E2E tests with sandbox
  async testFullAppWithSandbox() {
    const app = await launchApp({ sandbox: true });
    
    // Test all critical flows
    await app.openFile('./test.txt');
    await app.saveFile('./output.txt', 'content');
    await app.listFiles('./');
    
    assert(app.isStable());
  }

  // Phase 4: Real-world plugins
  async testPopularPlugins() {
    const plugins = await fetchPopularPlugins();
    
    for (const plugin of plugins) {
      try {
        await loadAndTest(plugin);
      } catch (e) {
        logIncompatibility(plugin, e);
      }
    }
  }

  // Phase 5: Performance regression
  async testPerformanceImpact() {
    const baseline = await measureWithoutSandbox();
    const withSandbox = await measureWithSandbox();
    
    const degradation = (withSandbox - baseline) / baseline;
    assert(degradation < 0.15); // Less than 15% slower
  }
}
```

### 2. Clear Communication Strategy

```javascript
// ============================================
// Informing users about sandbox migration
// ============================================

class UserCommunication {
  // In-app notification
  showSandboxInfo() {
    return `
      Enhanced Security Update Available
      ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
      
      Version 2.0 includes a security sandbox that limits
      what code can do. This makes the app more secure.
      
      ✅ Benefits:
      • Better protection against malicious code
      • Faster, more stable
      • Aligns with web standards
      
      ⚠️  Some old extensions may not work
      
      Your plugins status: ${this.getPluginStatus()}
      
      Enable now? [Yes] [No] [Learn more]
    `;
  }

  // Release notes
  getReleaseNotes() {
    return `
      Version 2.0 - Sandbox Security Update
      
      ## New
      - Sandbox security mode now enabled by default
      - 30% faster startup
      - Better stability
      
      ## Breaking Changes
      - Extensions requiring direct file access need update
      - Custom Node.js modules won't work (use IPC instead)
      
      ## How to Upgrade Plugins
      See migration guide: https://docs.example.com/sandbox-migration
      
      ## Need Help?
      Forum: https://forum.example.com/sandbox
      Issue: Report incompatibilities at https://github.com/...
    `;
  }

  getPluginStatus() {
    const compatible = this.countCompatiblePlugins();
    const total = this.countAllPlugins();
    return `${compatible}/${total} compatible`;
  }
}
```

### 3. Monitoring & Alerting

```javascript
// ============================================
// Real-time monitoring during rollout
// ============================================

class RolloutDashboard {
  constructor() {
    this.metrics = {
      activeUsers: new Map(),        // Version -> count
      crashes: new Map(),             // Version -> count
      avgStartupTime: new Map(),     // Version -> ms
      extensionCompatibility: new Map() // Extension -> compatible?
    };
  }

  recordUserSession(version, sandboxEnabled) {
    const key = `${version}:${sandboxEnabled ? 'sandbox' : 'legacy'}`;
    this.metrics.activeUsers.set(
      key,
      (this.metrics.activeUsers.get(key) || 0) + 1
    );
  }

  recordCrash(version, sandboxEnabled, stackTrace) {
    const key = `${version}:${sandboxEnabled ? 'sandbox' : 'legacy'}`;
    this.metrics.crashes.set(
      key,
      (this.metrics.crashes.get(key) || 0) + 1
    );

    // Alert if crash rate exceeds threshold
    this.checkCrashRate(key);
  }

  checkCrashRate(key) {
    const activeUsers = this.metrics.activeUsers.get(key) || 1;
    const crashes = this.metrics.crashes.get(key) || 0;
    const rate = crashes / activeUsers;

    if (rate > 0.05) { // 5% crash rate
      this.triggerAlert(`
        ⚠️  High crash rate in ${key}
        Rate: ${(rate * 100).toFixed(2)}%
        Crashes: ${crashes} / Users: ${activeUsers}
      `);
    }
  }

  triggerAlert(message) {
    console.error(message);
    // Send to alerting system (PagerDuty, etc)
    sendAlert(message);
  }

  getDashboard() {
    return {
      summary: `
        Sandbox Rollout Dashboard
        ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
      `,
      versions: Array.from(this.metrics.activeUsers.entries())
        .map(([k, v]) => ({
          version: k,
          users: v,
          crashes: this.metrics.crashes.get(k) || 0,
          crashRate: ((this.metrics.crashes.get(k) || 0) / v).toFixed(3)
        }))
    };
  }
}
```

---

## Summary: Key Takeaways

| Phase | Duration | Goal | Key Metrics |
|-------|----------|------|------------|
| **Preparation** | Months 1-2 | Make code compatible | % modules ported |
| **Testing** | Months 3-8 | Convert all Node.js usage | Build success rate |
| **Insiders** | Months 9-12 | Real-world validation | Crash rate < 1% |
| **Gradual Rollout** | Months 13+ | Increase user % slowly | 0.1% → 1% → 5% → ... |
| **Mandatory** | Month 24+ | Full sandbox adoption | 100% users on sandbox |

---

## When to Use Progressive Sandboxing

✅ **Use When**:
- Making breaking security changes
- Have millions of active users
- Can't guarantee backward compatibility
- Plugins/extensions are common
- Risk of data loss if things break

❌ **Skip When**:
- Small user base that can handle one-time disruption
- Can guarantee all code is compatible
- Have no external plugins
- Can tolerate a major version bump

