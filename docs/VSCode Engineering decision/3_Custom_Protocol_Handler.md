# Custom Protocol Handlers: Complete Learning Guide

**Why VS Code replaced file:// protocol with custom vscode-file:// and why you should too.**

---

## The Problem with file:// Protocol

```javascript
// Chromium treats file:// URLs differently from HTTPS
// ❌ Issues with file:// protocol:

// 1. CORS disabled - all files can be accessed
const xhr = new XMLHttpRequest();
xhr.open('GET', 'file:///etc/passwd'); // No CORS check!
xhr.onload = (e) => console.log(e.target.responseText);

// 2. No origin concept
// All file:// URLs are treated as same origin
// Attacker can set document.domain

// 3. Can access parent directories
// fetch('file://../../sensitive/file.txt');

// 4. No security headers
// Content-Security-Policy not enforced
```

### The VS Code Solution

```
Before (file:// protocol):
┌─────────────────────────────────┐
│ Load: file:///path/to/app.html  │
│ • No origin concept             │
│ • No CORS protection            │
│ • Can access any file           │
│ • No security headers           │
└─────────────────────────────────┘

After (custom vscode-file:// protocol):
┌─────────────────────────────────┐
│ Load: vscode-file://app.html    │
│ • Has explicit origin           │
│ • CORS enforced                 │
│ • Only specific paths allowed   │
│ • Security headers applied      │
└─────────────────────────────────┘
```

---

## Prerequisites & Concepts

### 1. Understanding Protocol Registration

```javascript
// Electron allows registering custom protocols
const { protocol, app } = require('electron');

// Register before app is ready
app.whenReady().then(() => {
  protocol.registerFileProtocol('myapp', (request, callback) => {
    const url = new URL(request.url);
    console.log('Request for:', url.hostname, url.pathname);
    // ... return file path or error
  });
});
```

### 2. Protocol vs Standard HTTP

```
HTTP/HTTPS Protocol:
┌─────────────────────┐
│ https://example.com │
│ • Origin: example.com
│ • CORS enforced    │
│ • Security headers │
└─────────────────────┘

Custom Protocol:
┌──────────────────────┐
│ myapp://app/index.js │
│ • Origin: myapp://   │
│ • CORS enforced      │
│ • Security headers   │
└──────────────────────┘

File Protocol (Insecure):
┌──────────────────────┐
│ file:///path/to/file │
│ • No real origin     │
│ • No CORS protection │
│ • Can access any file│
└──────────────────────┘
```

### 3. Security Model

```javascript
// file:// URLshave SECURITY ISSUES:
console.log(new URL('file:///home/user/app.js').origin); 
// Result: 'file://' (same for all files!)

// Custom protocols have PROPER origins:
console.log(new URL('myapp://app/index.js').origin);
// Result: 'myapp://app' (distinct, can enforce CORS)
```

---

## Implementation Strategy

### Strategy 1: Simple File Serving Protocol

```javascript
// ============================================
// Basic custom protocol for serving files
// ============================================

const { protocol, app, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');

// Configure what paths are allowed
const ALLOWED_PATHS = {
  'app': path.join(__dirname, 'dist'),      // App bundle
  'user-data': path.join(app.getPath('userData'), 'files'),
  'temp': path.join(app.getPath('temp'))
};

app.whenReady().then(() => {
  // Register custom protocol
  protocol.registerFileProtocol('myapp', (request, callback) => {
    try {
      const url = new URL(request.url);
      
      // Parse namespace from hostname
      const namespace = url.hostname; // 'app', 'user-data', etc
      const filepath = url.pathname;
      
      // Validate namespace
      if (!ALLOWED_PATHS[namespace]) {
        return callback({ statusCode: 404 });
      }
      
      // Resolve full path
      const fullPath = path.resolve(
        ALLOWED_PATHS[namespace],
        filepath
      );
      
      // Security: Ensure path is within allowed directory
      const allowedDir = ALLOWED_PATHS[namespace];
      const relative = path.relative(allowedDir, fullPath);
      
      if (relative.startsWith('..')) {
        return callback({ statusCode: 403 }); // Forbidden
      }
      
      // Check file exists
      if (!fs.existsSync(fullPath)) {
        return callback({ statusCode: 404 });
      }
      
      // Return file
      callback({
        path: fullPath
      });
      
    } catch (error) {
      console.error('Protocol error:', error);
      callback({ statusCode: 500 });
    }
  });

  createWindow();
});

// Usage in BrowserWindow
const mainWindow = new BrowserWindow();
mainWindow.loadURL('myapp://app/index.html');
```

### Strategy 2: HTTP-like Protocol with Headers

```javascript
// ============================================
// Custom protocol that behaves like HTTPS
// ============================================

const { protocol } = require('electron');
const fs = require('fs');
const path = require('path');
const mime = require('mime-types');

protocol.registerFileProtocol('myapp', (request, callback) => {
  try {
    const url = new URL(request.url);
    const pathname = decodeURI(url.pathname);
    
    // Map to file system
    const filePath = path.join(__dirname, 'dist', pathname);
    
    // Security checks
    const realPath = fs.realpathSync(filePath);
    const basePath = fs.realpathSync(path.join(__dirname, 'dist'));
    
    if (!realPath.startsWith(basePath)) {
      return callback({ statusCode: 403 });
    }
    
    // Get file stats
    const stats = fs.statSync(realPath);
    
    // Determine MIME type
    const mimeType = mime.lookup(realPath) || 'application/octet-stream';
    
    // Return with security headers
    callback({
      path: realPath,
      headers: {
        'Content-Type': mimeType,
        // Security headers (like HTTPS)
        'Content-Security-Policy': [
          "default-src 'self'",
          "script-src 'self' 'unsafe-inline'",
          "style-src 'self' 'unsafe-inline'",
          "img-src 'self' data:",
          "font-src 'self'",
        ].join('; '),
        'X-Content-Type-Options': 'nosniff',
        'X-Frame-Options': 'DENY',
        'X-XSS-Protection': '1; mode=block'
      }
    });
    
  } catch (error) {
    console.error('Error:', error);
    callback({ statusCode: 500 });
  }
});
```

### Strategy 3: VS Code Style Protocol

```javascript
// ============================================
// Replicating VS Code's approach
// ============================================

const { protocol, app } = require('electron');
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const VSCODE_FILE_PROTOCOL = 'vscode-file';

class VscodeFileProtocol {
  static register() {
    protocol.registerFileProtocol(VSCODE_FILE_PROTOCOL, 
      this.handler.bind(this));
  }

  static handler(request, callback) {
    try {
      const url = new URL(request.url);
      const pathname = this.decodePath(url.pathname);
      const filePath = this.resolvePath(pathname);

      // Security validation
      this.validatePath(filePath);

      // Check if exists
      if (!fs.existsSync(filePath)) {
        return callback({
          statusCode: 404,
          mimeType: 'text/plain',
          data: 'File not found'
        });
      }

      // Read file
      const buffer = fs.readFileSync(filePath);

      // Determine if should compress
      const shouldCompress = this.shouldCompress(filePath, buffer.length);

      if (shouldCompress) {
        zlib.gzip(buffer, (err, compressed) => {
          if (err) {
            return callback({
              statusCode: 500,
              mimeType: 'text/plain',
              data: 'Compression error'
            });
          }

          callback({
            data: compressed,
            mimeType: this.getMimeType(filePath),
            headers: {
              'Content-Encoding': 'gzip',
              'Cache-Control': 'public, max-age=3600'
            }
          });
        });
      } else {
        callback({
          data: buffer,
          mimeType: this.getMimeType(filePath),
          headers: {
            'Cache-Control': 'public, max-age=3600'
          }
        });
      }

    } catch (error) {
      console.error('Protocol error:', error);
      callback({
        statusCode: 403,
        mimeType: 'text/plain',
        data: 'Access denied'
      });
    }
  }

  static decodePath(pathname) {
    return decodeURIComponent(pathname.slice(1)); // Remove leading /
  }

  static resolvePath(pathname) {
    return path.resolve(__dirname, 'dist', pathname);
  }

  static validatePath(filePath) {
    const realPath = fs.realpathSync(filePath);
    const basePath = fs.realpathSync(path.join(__dirname, 'dist'));

    if (!realPath.startsWith(basePath)) {
      throw new Error('Path traversal attempt');
    }
  }

  static getMimeType(filePath) {
    const ext = path.extname(filePath).toLowerCase();
    const types = {
      '.html': 'text/html',
      '.js': 'text/javascript',
      '.css': 'text/css',
      '.json': 'application/json',
      '.png': 'image/png',
      '.jpg': 'image/jpeg',
      '.gif': 'image/gif',
      '.svg': 'image/svg+xml',
      '.woff': 'font/woff',
      '.woff2': 'font/woff2'
    };
    return types[ext] || 'application/octet-stream';
  }

  static shouldCompress(filePath, size) {
    const ext = path.extname(filePath);
    const compressibleTypes = ['.js', '.css', '.json', '.html', '.svg'];
    const minSize = 512; // Only compress if > 512 bytes

    return compressibleTypes.includes(ext) && size > minSize;
  }
}

// Register on app ready
app.whenReady().then(() => {
  VscodeFileProtocol.register();
});
```

### Strategy 4: Namespace-Based Protocol

```javascript
// ============================================
// Multiple namespaces for different purposes
// ============================================

class MultiNamespaceProtocol {
  constructor() {
    this.namespaces = {
      'app': {
        basePath: path.join(__dirname, 'dist'),
        allowListing: false,
        cacheControl: 'max-age=31536000' // 1 year for app bundle
      },
      'workspace': {
        basePath: app.getPath('userData'),
        allowListing: true,
        cacheControl: 'no-cache' // User files change frequently
      },
      'temp': {
        basePath: app.getPath('temp'),
        allowListing: false,
        cacheControl: 'no-store'
      }
    };
  }

  register() {
    protocol.registerFileProtocol('custom', (request, callback) => {
      try {
        const url = new URL(request.url);
        const namespace = url.hostname;
        const pathname = decodeURIComponent(url.pathname);

        // Validate namespace
        if (!this.namespaces[namespace]) {
          return callback({ statusCode: 404 });
        }

        const config = this.namespaces[namespace];

        // Build full path
        const fullPath = path.resolve(config.basePath, pathname);

        // Security validation
        const realPath = fs.realpathSync(fullPath);
        const realBase = fs.realpathSync(config.basePath);

        if (!realPath.startsWith(realBase)) {
          return callback({ statusCode: 403 });
        }

        // Check if is directory
        const stat = fs.statSync(realPath);
        if (stat.isDirectory()) {
          if (config.allowListing) {
            // Return directory listing
            return callback({
              mimeType: 'application/json',
              data: JSON.stringify(fs.readdirSync(realPath))
            });
          } else {
            return callback({ statusCode: 403 });
          }
        }

        // Return file
        callback({
          path: realPath,
          headers: {
            'Cache-Control': config.cacheControl
          }
        });

      } catch (error) {
        callback({ statusCode: 500 });
      }
    });
  }
}

// Usage
const proto = new MultiNamespaceProtocol();
proto.register();

// In renderer
// custom://app/index.js     → from dist/
// custom://workspace/file   → from userData/
// custom://temp/data        → from temp/
```

---

## Real-World Applications

### Application 1: Replacing file:// in Existing App

```javascript
// ============================================
// Migration from file:// to custom protocol
// ============================================

class FileProtocolMigrator {
  constructor(oldAppUsesFileProtocol) {
    this.oldApp = oldAppUsesFileProtocol;
    this.CUSTOM_PROTOCOL = 'secure-app';
  }

  migrate() {
    // Step 1: Register new protocol
    this.registerSecureProtocol();

    // Step 2: Update BrowserWindow
    this.updateWindowLoading();

    // Step 3: Update all fetch/xhr calls
    this.updateResourceLoading();

    // Step 4: Update IPC
    this.updateIPC();
  }

  registerSecureProtocol() {
    const { protocol, app } = require('electron');
    const distPath = path.join(__dirname, 'dist');

    protocol.registerFileProtocol(this.CUSTOM_PROTOCOL, 
      (request, callback) => {
        try {
          const url = new URL(request.url);
          const filePath = path.join(distPath, url.pathname);

          // Security check
          const real = fs.realpathSync(filePath);
          const realDist = fs.realpathSync(distPath);

          if (!real.startsWith(realDist)) {
            return callback({ statusCode: 403 });
          }

          callback({ path: real });
        } catch {
          callback({ statusCode: 404 });
        }
      }
    );
  }

  updateWindowLoading() {
    // BEFORE: loadFile or file://
    // mainWindow.loadFile(path.join(__dirname, 'dist', 'index.html'));

    // AFTER: custom protocol
    const mainWindow = new BrowserWindow();
    mainWindow.loadURL(`${this.CUSTOM_PROTOCOL}://app/index.html`);
  }

  updateResourceLoading() {
    // In renderer code, provide compatibility helper
    const electronAPI = {
      getAssetURL: (assetPath) => {
        return `${this.CUSTOM_PROTOCOL}://app/${assetPath}`;
      }
    };

    // Usage in HTML
    // <img src='secure-app://app/logo.png'>
    // Or in JS:
    // fetch(window.electronAPI.getAssetURL('data.json'))
  }

  updateIPC() {
    // For file serving via IPC
    const { ipcMain } = require('electron');

    ipcMain.handle('get-asset', async (event, assetPath) => {
      const filePath = path.join(__dirname, 'dist', assetPath);
      
      // Security validation
      const real = fs.realpathSync(filePath);
      const realDist = fs.realpathSync(path.join(__dirname, 'dist'));
      
      if (!real.startsWith(realDist)) {
        throw new Error('Access denied');
      }

      return await fs.promises.readFile(real);
    });
  }
}
```

### Application 2: Multi-Tenant App with Protocol Isolation

```javascript
// ============================================
// Serving multiple workspaces safely
// ============================================

class MultiWorkspaceProtocol {
  constructor() {
    this.workspaces = new Map();
  }

  registerWorkspace(workspaceId, basePath) {
    this.workspaces.set(workspaceId, {
      basePath: fs.realpathSync(basePath),
      createdAt: Date.now()
    });
  }

  setupProtocol() {
    const { protocol } = require('electron');

    protocol.registerFileProtocol('workspace', (request, callback) => {
      try {
        const url = new URL(request.url);
        const workspaceId = url.hostname;
        const filePath = decodeURIComponent(url.pathname);

        // Get workspace
        const workspace = this.workspaces.get(workspaceId);
        if (!workspace) {
          return callback({ statusCode: 404 });
        }

        // Resolve path
        const fullPath = path.resolve(workspace.basePath, filePath);
        const realPath = fs.realpathSync(fullPath);

        // Security: path must be within workspace
        if (!realPath.startsWith(workspace.basePath)) {
          return callback({ statusCode: 403 });
        }

        callback({ path: realPath });

      } catch (error) {
        callback({ statusCode: 403 });
      }
    });
  }

  createWindow(workspaceId) {
    const workspace = this.workspaces.get(workspaceId);
    if (!workspace) throw new Error('Workspace not found');

    const mainWindow = new BrowserWindow();
    mainWindow.loadURL(`workspace://${workspaceId}/index.html`);
    return mainWindow;
  }
}

// Usage
const manager = new MultiWorkspaceProtocol();
manager.setupProtocol();

manager.registerWorkspace('workspace-1', '/path/to/workspace1');
manager.registerWorkspace('workspace-2', '/path/to/workspace2');

const win1 = manager.createWindow('workspace-1');
const win2 = manager.createWindow('workspace-2');

// Win1 can only access workspace1
// Win2 can only access workspace2
// Complete isolation!
```

---

## Anti-Patterns & Pitfalls

### ❌ Anti-Pattern 1: Not Validating Paths

```javascript
// ❌ BAD: No path validation
protocol.registerFileProtocol('myapp', (request, callback) => {
  const url = new URL(request.url);
  const filePath = url.pathname;
  callback({ path: filePath }); // Could be /etc/passwd!
});

// ✅ GOOD: Always validate
protocol.registerFileProtocol('myapp', (request, callback) => {
  try {
    const url = new URL(request.url);
    const filePath = path.resolve(SAFE_DIR, url.pathname);

    // Check path is within safe directory
    const realPath = fs.realpathSync(filePath);
    const realSafe = fs.realpathSync(SAFE_DIR);

    if (!realPath.startsWith(realSafe)) {
      return callback({ statusCode: 403 });
    }

    callback({ path: realPath });
  } catch {
    callback({ statusCode: 403 });
  }
});
```

### ❌ Anti-Pattern 2: Allowing Directory Listing by Default

```javascript
// ❌ BAD: Directory traversal
protocol.registerFileProtocol('myapp', (request, callback) => {
  const url = new URL(request.url);
  const filePath = path.join(APP_DIR, url.pathname);

  const stat = fs.statSync(filePath);
  if (stat.isDirectory()) {
    // Return all files in directory
    callback({
      data: fs.readdirSync(filePath)
    });
  }
});

// ✅ GOOD: Only serve files, not directory listings
protocol.registerFileProtocol('myapp', (request, callback) => {
  // ... path validation ...

  const stat = fs.statSync(filePath);
  if (stat.isDirectory()) {
    return callback({ statusCode: 403 }); // Deny directories
  }

  callback({ path: realPath });
});
```

### ❌ Anti-Pattern 3: Not Setting Security Headers

```javascript
// ❌ BAD: No security headers
protocol.registerFileProtocol('myapp', (request, callback) => {
  callback({ path: filePath });
});

// ✅ GOOD: Include security headers
protocol.registerFileProtocol('myapp', (request, callback) => {
  callback({
    path: filePath,
    headers: {
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'DENY',
      'X-XSS-Protection': '1; mode=block',
      'Content-Security-Policy': "default-src 'self'"
    }
  });
});
```

---

## Best Practices

### Checklist for Custom Protocols

```javascript
const customProtocolChecklist = [
  '[] Protocol registered before app is ready',
  '[] All paths validated against symlinks',
  '[] Path traversal attempts blocked',
  '[] Directories return 403, not contents',
  '[] Security headers set (CSP, X-Frame-Options, etc)',
  '[] MIME types set correctly',
  '[] Error responses don\'t leak filesystem info',
  '[] Caching headers set appropriately',
  '[] Compression enabled for large files',
  '[] No hardcoded file paths in renderer',
  '[] Use protocol everywhere (not file://)',
  '[] All resources served through protocol'
];
```

