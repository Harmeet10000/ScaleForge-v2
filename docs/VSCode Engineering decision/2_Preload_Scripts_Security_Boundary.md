# Preload Scripts as Security Boundary: Complete Learning Guide

**The critical layer between untrusted renderer code and privileged main process.**

---

## What is a Preload Script?

A preload script is JavaScript that runs **before** your web content loads, in a special context where it has access to both:
- Privileged Electron APIs (ipcRenderer, remote, etc.)
- The renderer's JavaScript context (window object)

**Problem it solves**: How do you let the renderer access privileged APIs safely?

**The security principle**: "Don't trust the renderer."

---

## Why Preload Scripts Matter

```
┌─────────────────────────────────┐
│ Malicious Web Content            │ ← Attacker can run any JS here
│ (extension, user script, etc.)   │
└────────────┬────────────────────┘
             │
             ▼
┌─────────────────────────────────┐
│ PRELOAD SCRIPT (Security Wall)   │ ← Validates all requests!
│ • Input validation               │
│ • Output sanitization            │
│ • API whitelisting               │
└────────────┬────────────────────┘
             │
             ▼
┌─────────────────────────────────┐
│ Main Process (Privileged)        │ ← Can access Node.js, file system
│ • File system access             │
│ • Shell commands                 │
│ • Network access                 │
└─────────────────────────────────┘
```

---

## The Security Principle: Defense in Depth

```javascript
// ============================================
// Three layers of security
// ============================================

// LAYER 1: Preload Script (First line of defense)
const { ipcRenderer, contextBridge } = require('electron');

// Only expose what's necessary
contextBridge.exposeInMainWorld('electronAPI', {
  readFile: async (path) => {
    // Validate in preload
    if (!isValidPath(path)) {
      throw new Error('Invalid path');
    }
    return await ipcRenderer.invoke('read-file', path);
  }
});

// LAYER 2: Main Process (Second line of defense)
const { ipcMain } = require('electron');

ipcMain.handle('read-file', async (event, path) => {
  // Validate again in main process
  if (!isAllowedPath(path)) {
    throw new Error('Access denied');
  }
  // Execute with least privilege
  return await fs.promises.readFile(path, 'utf-8');
});

// LAYER 3: Operating System (Third line of defense)
// Run main process with minimal OS permissions
// Use OS-level file permissions
```

---

## Prerequisites & Concepts

### 1. Understanding Context Isolation

```javascript
// Without context isolation (INSECURE):
// Malicious code in renderer can:
// 1. Override window.api = fake IPC
// 2. Intercept all communication
// 3. Access any Node module

// With context isolation (SECURE):
// Preload script runs in isolated context
// Only exposed APIs are available
// Cannot be modified by renderer code

// In BrowserWindow configuration
const mainWindow = new BrowserWindow({
  webPreferences: {
    contextIsolation: true, // ✅ ALWAYS ENABLE
    enableRemoteModule: false,
    preload: path.join(__dirname, 'preload.js')
  }
});
```

### 2. Understanding the Bridge

```javascript
// Preload context (has access to Electron APIs)
const { contextBridge, ipcRenderer } = require('electron');

// Create a "bridge" - a controlled interface
contextBridge.exposeInMainWorld('electronAPI', {
  // Only these methods are exposed
  // Nothing else is accessible
});

// Renderer context cannot do:
// ❌ window.ipcRenderer.send() - not accessible
// ❌ require('fs') - not available
// ❌ require('child_process') - not available

// Renderer can only do:
// ✅ window.electronAPI.readFile() - bridged method
```

### 3. The Attack Surface

```javascript
// Common attack vectors that preload protects against:

// ❌ ATTACK 1: Direct API access
// Without preload: renderer can do anything
require('child_process').exec('rm -rf /'); // DISASTER!

// ✅ PROTECTED: Preload restricts access
// Renderer can only use exposed methods

// ❌ ATTACK 2: Parameter tampering
// Without validation: 
ipcRenderer.send('read-file', '../../etc/passwd');

// ✅ PROTECTED: Preload validates
contextBridge.exposeInMainWorld('electronAPI', {
  readFile: (path) => {
    if (!path.startsWith('/safe/dir')) throw new Error('Access denied');
    return ipcRenderer.invoke('read-file', path);
  }
});

// ❌ ATTACK 3: Type confusion
ipcRenderer.send('write', { file: '/etc/hosts', content: 'malicious' });

// ✅ PROTECTED: Preload validates types
contextBridge.exposeInMainWorld('electronAPI', {
  writeFile: (file, content) => {
    if (typeof file !== 'string') throw new TypeError('Invalid type');
    if (typeof content !== 'string') throw new TypeError('Invalid type');
    return ipcRenderer.invoke('write', file, content);
  }
});
```

---

## Implementation Patterns

### Pattern 1: Minimal API Surface

```javascript
// ============================================
// Exposing only what's necessary
// ============================================

const { contextBridge, ipcRenderer } = require('electron');

// ✅ GOOD: Minimal, curated API
contextBridge.exposeInMainWorld('electronAPI', {
  // Only 3 methods exposed
  readConfig: () => ipcRenderer.invoke('read-config'),
  saveConfig: (data) => ipcRenderer.invoke('save-config', data),
  onConfigChanged: (callback) => {
    ipcRenderer.on('config-changed', (event, data) => callback(data));
  }
});

// ❌ BAD: Exposing entire namespace
contextBridge.exposeInMainWorld('ipc', ipcRenderer);
// Now renderer can call ANY IPC handler!
```

### Pattern 2: Complete Input Validation

```javascript
// ============================================
// Validating all inputs before IPC
// ============================================

const { contextBridge, ipcRenderer } = require('electron');
const path = require('path');

// Security utilities
const SAFE_DIR = '/home/user/Documents/myapp';

const validate = {
  path: (p) => {
    // Check type
    if (typeof p !== 'string') {
      throw new TypeError('Path must be a string');
    }

    // Check not empty
    if (!p || p.length === 0) {
      throw new Error('Path cannot be empty');
    }

    // Check for path traversal
    const resolved = path.resolve(p);
    const relative = path.relative(SAFE_DIR, resolved);

    if (relative.startsWith('..') || path.isAbsolute(relative)) {
      throw new Error('Access denied: path outside safe directory');
    }

    // Check length (prevent DoS)
    if (p.length > 1000) {
      throw new Error('Path too long');
    }

    return resolved;
  },

  content: (c, maxSize = 10 * 1024 * 1024) => {
    // Check type
    if (typeof c !== 'string') {
      throw new TypeError('Content must be a string');
    }

    // Check size
    if (Buffer.byteLength(c, 'utf-8') > maxSize) {
      throw new Error(`Content too large (max ${maxSize} bytes)`);
    }

    return c;
  },

  json: (obj) => {
    // Validate JSON structure
    if (typeof obj !== 'object' || obj === null) {
      throw new TypeError('Must be an object');
    }

    // Prevent prototype pollution
    if ('__proto__' in obj || 'constructor' in obj) {
      throw new Error('Invalid object structure');
    }

    return obj;
  },

  number: (n, min = 0, max = Infinity) => {
    if (typeof n !== 'number' || isNaN(n)) {
      throw new TypeError('Must be a number');
    }
    if (n < min || n > max) {
      throw new RangeError(`Must be between ${min} and ${max}`);
    }
    return n;
  }
};

// Exposed API with validation
contextBridge.exposeInMainWorld('electronAPI', {
  readFile: async (filepath) => {
    const validated = validate.path(filepath);
    return await ipcRenderer.invoke('read-file', validated);
  },

  writeFile: async (filepath, content) => {
    const validPath = validate.path(filepath);
    const validContent = validate.content(content);
    return await ipcRenderer.invoke('write-file', validPath, validContent);
  },

  saveConfig: async (config) => {
    const validated = validate.json(config);
    return await ipcRenderer.invoke('save-config', validated);
  },

  setLogLevel: async (level) => {
    const validated = validate.number(level, 0, 5);
    return await ipcRenderer.invoke('set-log-level', validated);
  }
});
```

### Pattern 3: Error Handling

```javascript
// ============================================
// Secure error handling
// ============================================

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  readFile: async (filepath) => {
    try {
      // Validate input
      if (typeof filepath !== 'string') {
        throw new TypeError('Path must be string');
      }

      // Call IPC
      const result = await ipcRenderer.invoke('read-file', filepath);
      return result;

    } catch (error) {
      // ❌ DON'T leak internal details
      // ❌ throw error;

      // ✅ Return safe error message
      console.error('Read error:', error); // Log for debugging
      throw new Error('Failed to read file'); // Generic message
    }
  },

  // Better: Return result object
  readFileWithStatus: async (filepath) => {
    try {
      if (typeof filepath !== 'string') {
        return {
          success: false,
          error: 'Invalid path type'
        };
      }

      const content = await ipcRenderer.invoke('read-file', filepath);
      return {
        success: true,
        content
      };

    } catch (error) {
      return {
        success: false,
        error: 'Could not read file' // Generic, safe message
      };
    }
  }
});
```

### Pattern 4: Secure Listener Setup

```javascript
// ============================================
// Safe event listeners
// ============================================

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  // ✅ GOOD: Return unsubscribe function
  onFileChanged: (callback) => {
    if (typeof callback !== 'function') {
      throw new TypeError('Callback must be a function');
    }

    // Wrap callback to validate data
    const wrappedCallback = (event, data) => {
      try {
        // Validate received data
        if (!data || typeof data !== 'object') {
          console.error('Invalid file change event data');
          return;
        }

        callback(data);
      } catch (error) {
        console.error('Callback error:', error);
      }
    };

    // Set up listener
    ipcRenderer.on('file-changed', wrappedCallback);

    // Return unsubscribe function
    return () => {
      ipcRenderer.removeListener('file-changed', wrappedCallback);
    };
  },

  // ✅ GOOD: Typed listeners
  onStatusUpdate: (callback) => {
    ipcRenderer.on('status-update', (event, status) => {
      // Validate status is one of allowed values
      const allowed = ['idle', 'working', 'error'];
      if (!allowed.includes(status)) {
        console.error('Invalid status:', status);
        return;
      }
      callback(status);
    });

    return () => ipcRenderer.removeAllListeners('status-update');
  }
});
```

### Pattern 5: Async/Await First

```javascript
// ============================================
// Always use async-first APIs
// ============================================

const { contextBridge, ipcRenderer } = require('electron');

// ❌ AVOID: Callback-based (harder to manage)
contextBridge.exposeInMainWorld('electronAPI', {
  readFile: (filepath, callback) => {
    ipcRenderer.send('read-file', filepath);
    ipcRenderer.once('read-file-result', (event, content) => {
      callback(content);
    });
  }
});

// ✅ PREFER: Promise-based (cleaner, better error handling)
contextBridge.exposeInMainWorld('electronAPI', {
  readFile: async (filepath) => {
    return await ipcRenderer.invoke('read-file', filepath);
  }
});

// Usage
const content = await window.electronAPI.readFile('/path/to/file');
```

---

## Real-World Secure Preload Examples

### Example 1: Complete File Manager Preload

```javascript
// ============================================
// Complete, secure file manager API
// ============================================

const { contextBridge, ipcRenderer } = require('electron');
const path = require('path');
const os = require('os');

// Configuration
const CONFIG = {
  SAFE_ROOT: path.join(os.homedir(), 'Documents', 'MyApp'),
  MAX_FILE_SIZE: 50 * 1024 * 1024, // 50MB
  ALLOWED_EXTENSIONS: ['.txt', '.json', '.md', '.js', '.ts']
};

// ============================================
// Validation Layer
// ============================================

class Validator {
  static isWithinRoot(filepath) {
    const resolved = path.resolve(filepath);
    const relative = path.relative(CONFIG.SAFE_ROOT, resolved);
    return !relative.startsWith('..');
  }

  static hasAllowedExtension(filepath) {
    const ext = path.extname(filepath).toLowerCase();
    return CONFIG.ALLOWED_EXTENSIONS.includes(ext);
  }

  static isValidFileName(name) {
    // No path separators, no null bytes
    return !/[\/\\\0]/.test(name) && name.length > 0 && name.length < 256;
  }

  static validatePath(filepath) {
    // Type check
    if (typeof filepath !== 'string') {
      throw new TypeError('Path must be string');
    }

    // Length check
    if (filepath.length === 0 || filepath.length > 1024) {
      throw new Error('Path length invalid');
    }

    // Safety checks
    if (!this.isWithinRoot(filepath)) {
      throw new Error('Path outside safe directory');
    }

    if (!this.hasAllowedExtension(filepath)) {
      throw new Error('File type not allowed');
    }

    return path.resolve(filepath);
  }

  static validateContent(content, maxSize = CONFIG.MAX_FILE_SIZE) {
    if (typeof content !== 'string') {
      throw new TypeError('Content must be string');
    }

    const byteSize = Buffer.byteLength(content, 'utf-8');
    if (byteSize > maxSize) {
      throw new Error(`File too large (${byteSize}/${maxSize} bytes)`);
    }

    return content;
  }

  static validateFileName(name) {
    if (typeof name !== 'string' || !this.isValidFileName(name)) {
      throw new Error('Invalid file name');
    }
    return name;
  }
}

// ============================================
// Error Handler
// ============================================

class SafeError extends Error {
  constructor(userMessage, internalMessage) {
    super(userMessage);
    this.name = 'SafeError';
    console.error(`[Internal] ${internalMessage}`);
  }
}

// ============================================
// API Exposure
// ============================================

contextBridge.exposeInMainWorld('electronAPI', {
  // File operations
  readFile: async (filepath) => {
    try {
      const validated = Validator.validatePath(filepath);
      return await ipcRenderer.invoke('file:read', validated);
    } catch (error) {
      throw new SafeError('Could not read file', error.message);
    }
  },

  writeFile: async (filepath, content) => {
    try {
      const validPath = Validator.validatePath(filepath);
      const validContent = Validator.validateContent(content);
      await ipcRenderer.invoke('file:write', validPath, validContent);
    } catch (error) {
      throw new SafeError('Could not write file', error.message);
    }
  },

  deleteFile: async (filepath) => {
    try {
      const validated = Validator.validatePath(filepath);
      await ipcRenderer.invoke('file:delete', validated);
    } catch (error) {
      throw new SafeError('Could not delete file', error.message);
    }
  },

  listFiles: async (directory) => {
    try {
      const validated = Validator.validatePath(directory);
      return await ipcRenderer.invoke('file:list', validated);
    } catch (error) {
      throw new SafeError('Could not list files', error.message);
    }
  },

  // Event listeners
  onFileChanged: (callback) => {
    if (typeof callback !== 'function') {
      throw new TypeError('Callback must be function');
    }

    const handler = (event, fileInfo) => {
      try {
        // Validate event data
        if (!fileInfo || typeof fileInfo !== 'object') {
          console.error('Invalid file event');
          return;
        }
        callback(fileInfo);
      } catch (error) {
        console.error('Callback error:', error);
      }
    };

    ipcRenderer.on('file:changed', handler);
    return () => ipcRenderer.removeListener('file:changed', handler);
  },

  // Status indicators
  onStatusChanged: (callback) => {
    if (typeof callback !== 'function') {
      throw new TypeError('Callback must be function');
    }

    ipcRenderer.on('status:changed', (event, status) => {
      // Validate status
      if (!status || typeof status.type !== 'string') {
        return;
      }
      callback(status);
    });

    return () => ipcRenderer.removeAllListeners('status:changed');
  }
});

// ============================================
// Export Validator for testing
// ============================================

module.exports = { Validator, SafeError };
```

### Example 2: Configuration Manager Preload

```javascript
// ============================================
// Safe configuration management
// ============================================

const { contextBridge, ipcRenderer } = require('electron');

const CONFIG_SCHEMA = {
  theme: {
    type: 'string',
    enum: ['light', 'dark'],
    default: 'light'
  },
  fontSize: {
    type: 'number',
    min: 8,
    max: 32,
    default: 14
  },
  autoSave: {
    type: 'boolean',
    default: true
  },
  plugins: {
    type: 'array',
    items: {
      type: 'object',
      properties: {
        name: { type: 'string' },
        enabled: { type: 'boolean' }
      }
    },
    default: []
  }
};

class ConfigValidator {
  static validate(config) {
    const validated = {};

    for (const [key, schema] of Object.entries(CONFIG_SCHEMA)) {
      const value = config[key];

      if (value === undefined) {
        validated[key] = schema.default;
      } else {
        validated[key] = this.validateField(key, value, schema);
      }
    }

    return validated;
  }

  static validateField(key, value, schema) {
    // Type check
    if (schema.type === 'string' && typeof value !== 'string') {
      throw new TypeError(`${key} must be string`);
    }

    if (schema.type === 'number' && typeof value !== 'number') {
      throw new TypeError(`${key} must be number`);
    }

    if (schema.type === 'boolean' && typeof value !== 'boolean') {
      throw new TypeError(`${key} must be boolean`);
    }

    // Enum check
    if (schema.enum && !schema.enum.includes(value)) {
      throw new Error(`${key} must be one of: ${schema.enum.join(', ')}`);
    }

    // Range check
    if (schema.min !== undefined && value < schema.min) {
      throw new RangeError(`${key} must be >= ${schema.min}`);
    }

    if (schema.max !== undefined && value > schema.max) {
      throw new RangeError(`${key} must be <= ${schema.max}`);
    }

    return value;
  }
}

contextBridge.exposeInMainWorld('electronAPI', {
  readConfig: async () => {
    try {
      const config = await ipcRenderer.invoke('config:read');
      return ConfigValidator.validate(config);
    } catch (error) {
      throw new Error('Could not read configuration');
    }
  },

  writeConfig: async (config) => {
    try {
      const validated = ConfigValidator.validate(config);
      await ipcRenderer.invoke('config:write', validated);
    } catch (error) {
      throw new Error('Invalid configuration: ' + error.message);
    }
  },

  onConfigChanged: (callback) => {
    ipcRenderer.on('config:changed', (event, config) => {
      try {
        const validated = ConfigValidator.validate(config);
        callback(validated);
      } catch (error) {
        console.error('Config validation failed:', error);
      }
    });

    return () => ipcRenderer.removeAllListeners('config:changed');
  }
});
```

---

## Anti-Patterns & Pitfalls

### ❌ Anti-Pattern 1: Exposing Raw ipcRenderer

```javascript
// ❌ TERRIBLE SECURITY VULNERABILITY
const { ipcRenderer, contextBridge } = require('electron');

contextBridge.exposeInMainWorld('ipc', ipcRenderer);

// Now renderer can do:
// window.ipc.send('admin:delete-all-files', '/');
// window.ipc.invoke('system:execute', 'rm -rf /');
// COMPLETE DISASTER!

// ✅ CORRECT: Only expose specific methods
contextBridge.exposeInMainWorld('electronAPI', {
  readFile: async (path) => {
    // Validate path
    // Call specific IPC handler
    return await ipcRenderer.invoke('read-file', path);
  }
});
```

### ❌ Anti-Pattern 2: Not Validating Types

```javascript
// ❌ BAD: Type confusion attack
contextBridge.exposeInMainWorld('electronAPI', {
  deleteFile: async (path) => {
    // What if someone passes an object?
    // What if it's an array?
    return await ipcRenderer.invoke('delete-file', path);
  }
});

// Attacker: window.electronAPI.deleteFile({ path: '/' });

// ✅ GOOD: Strict type validation
contextBridge.exposeInMainWorld('electronAPI', {
  deleteFile: async (path) => {
    if (typeof path !== 'string') {
      throw new TypeError('Path must be string');
    }
    if (path.length === 0) {
      throw new Error('Path cannot be empty');
    }
    return await ipcRenderer.invoke('delete-file', path);
  }
});
```

### ❌ Anti-Pattern 3: Leaking Error Details

```javascript
// ❌ BAD: Error information leak
contextBridge.exposeInMainWorld('electronAPI', {
  loadData: async () => {
    try {
      return await ipcRenderer.invoke('load-data');
    } catch (error) {
      // Attacker learns: database path, query, full stack trace
      throw error; // ← Leaks everything!
    }
  }
});

// ✅ GOOD: Generic error messages
contextBridge.exposeInMainWorld('electronAPI', {
  loadData: async () => {
    try {
      return await ipcRenderer.invoke('load-data');
    } catch (error) {
      console.error('Data load failed:', error); // Log internally
      throw new Error('Could not load data'); // Generic message
    }
  }
});
```

### ❌ Anti-Pattern 4: No Size Limits

```javascript
// ❌ BAD: DoS vulnerability
contextBridge.exposeInMainWorld('electronAPI', {
  saveFile: async (path, content) => {
    // What if content is 1GB?
    return await ipcRenderer.invoke('save-file', path, content);
  }
});

// Attacker: window.electronAPI.saveFile('/tmp/x', 'x'.repeat(1e9));

// ✅ GOOD: Enforce size limits
contextBridge.exposeInMainWorld('electronAPI', {
  saveFile: async (path, content) => {
    const MAX_SIZE = 10 * 1024 * 1024; // 10MB
    
    if (Buffer.byteLength(content) > MAX_SIZE) {
      throw new Error('File too large');
    }
    
    return await ipcRenderer.invoke('save-file', path, content);
  }
});
```

### ❌ Anti-Pattern 5: Assuming Preload Cannot be Bypassed

```javascript
// ❌ FALSE SENSE OF SECURITY
// Preload is NOT a jail! Careful implementation is needed.

// Preload validates path:
contextBridge.exposeInMainWorld('electronAPI', {
  readFile: async (path) => {
    if (!path.startsWith('/safe/')) return;
    return await ipcRenderer.invoke('read-file', path);
  }
});

// But if main process doesn't validate again...
// ipcMain.handle('read-file', async (event, path) => {
//   // What if path is '/etc/passwd'?
//   // If preload is modified or bypassed, we're vulnerable
//   return await fs.readFile(path);
// });

// ✅ DEFENSE IN DEPTH: Validate everywhere
ipcMain.handle('read-file', async (event, path) => {
  // Validate again!
  if (!isPathAllowed(path)) {
    throw new Error('Access denied');
  }
  return await fs.readFile(path);
});
```

---

## Best Practices

### 1. Security Checklist for Preload

```javascript
// Before exposing any API, verify:

const preloadSecurityChecklist = {
  // ✅ Necessary
  '[] Method is necessary for app function': true,
  
  // ✅ Type validation
  '[] All inputs have type checks': true,
  '[] All inputs have range/length checks': true,
  
  // ✅ No leaks
  '[] Error messages are generic': true,
  '[] No sensitive paths in error messages': true,
  '[] No stack traces exposed': true,
  
  // ✅ Scope
  '[] Method does not expose hidden APIs': true,
  '[] Method cannot be chained to access other APIs': true,
  
  // ✅ Cleanup
  '[] Listeners can be unsubscribed': true,
  '[] No global state pollution': true,
  
  // ✅ Validation
  '[] Preload validates input': true,
  '[] Main process validates input again': true,
  
  // ✅ Limits
  '[] Size limits enforced': true,
  '[] Rate limits enforced': true,
  '[] Timeout limits set': true
};
```

### 2. Layered Validation Pattern

```javascript
// ============================================
// Multiple validation layers for security
// ============================================

// Layer 1: Type and Format
const validateType = (value, expectedType) => {
  if (typeof value !== expectedType) {
    throw new TypeError(`Expected ${expectedType}`);
  }
};

// Layer 2: Business Logic
const validateBusiness = (value, rules) => {
  rules.forEach(rule => {
    if (!rule.check(value)) {
      throw new Error(rule.message);
    }
  });
};

// Layer 3: Security
const validateSecurity = (value, security) => {
  if (security.maxLength && value.length > security.maxLength) {
    throw new Error('Too large');
  }
  if (security.pattern && !security.pattern.test(value)) {
    throw new Error('Invalid format');
  }
};

// Usage
contextBridge.exposeInMainWorld('electronAPI', {
  saveUserName: async (name) => {
    // Layer 1
    validateType(name, 'string');

    // Layer 2
    validateBusiness(name, [
      {
        check: (n) => n.length > 0,
        message: 'Name cannot be empty'
      },
      {
        check: (n) => n.length < 100,
        message: 'Name too long'
      }
    ]);

    // Layer 3
    validateSecurity(name, {
      maxLength: 100,
      pattern: /^[a-zA-Z0-9\s-]+$/
    });

    return await ipcRenderer.invoke('save-user-name', name);
  }
});
```

---

## Summary: Key Takeaways

| Principle | Why | How |
|-----------|-----|-----|
| **Minimal Surface** | Less attack surface | Only expose what's necessary |
| **Validation First** | Catch issues early | Validate all inputs in preload |
| **Defense in Depth** | Multiple layers | Validate in preload AND main |
| **Type Safety** | Prevent confusion | Check types strictly |
| **Error Handling** | No information leaks | Generic error messages |
| **Resource Limits** | Prevent DoS | Enforce size, rate, timeout limits |
| **No Trust Renderer** | Always assume compromise | Treat all renderer input as untrusted |

