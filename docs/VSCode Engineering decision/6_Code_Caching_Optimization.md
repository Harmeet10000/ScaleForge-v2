# Code Caching Optimization: Complete Learning Guide

**How VS Code optimized startup from 5s to <2s using V8 code caching.**

---

## The Startup Performance Problem

```
VS Code loads:
├── 11.5 MB of minified JavaScript
├── Needs to parse this every launch
├── V8 compiles it every time
└── Total startup time: ~5 seconds (unoptimized)

User Experience:
❌ Launch app
❌ 5+ second wait
❌ Blank window
❌ Finally shows interface
```

### The Solution: Code Caching

```
With Code Caching:
├── First launch: V8 optimizes and caches compiled code
├── Second launch: Load cached bytecode (MUCH faster)
│   ├── 11.5 MB JS → 5s parsing
│   └── Cached bytecode → <500ms loading
└── Result: 5s → 1-2s startup (10x faster!)
```

---

## Prerequisites & Concepts

### 1. Understanding V8 Compilation

```javascript
// V8's multi-tier compilation strategy

const V8CompilationTiers = {
  'Tier 0: Interpreter': {
    speed: 'Immediate execution',
    quality: 'No optimization',
    when: 'First execution'
  },

  'Tier 1: Baseline Compiler': {
    speed: 'Faster execution',
    quality: 'Some optimization',
    when: 'After warm-up'
  },

  'Tier 2: Optimizing Compiler (TurboFan)': {
    speed: 'Fastest execution',
    quality: 'Full optimization',
    when: 'Hot code paths'
  }
};

// Timeline:
// 0ms: ▓░░░░░░░░ Loading JS file
// 200ms: ░▓░░░░░░░ Parsing JS
// 400ms: ░░▓▓▓░░░░ Compiling to bytecode
// 700ms: ░░░░░▓▓▓░ Running in interpreter
// 900ms: ░░░░░░░▓░ Hot code detected
// 950ms: ░░░░░░░░▓ Optimized compilation
// 1000ms: ░░░░░░░░░ App ready!

// With code caching:
// 0ms: ▓▓▓▓▓▓▓░░ Load cached bytecode
// 250ms: ░░░░░░░▓░ Running (no recompile!)
// 300ms: ░░░░░░░░▓ App ready!
```

### 2. Code Caching Mechanism

```javascript
// Code Caching stores V8's internal compiled representation

class CodeCachingProcess {
  // FIRST RUN (generation)
  static firstRun() {
    const sourceCode = fs.readFileSync('app.js');
    
    // V8 compiles
    const script = vm.Script(sourceCode, {
      filename: 'app.js'
    });

    // Generate cache from compiled bytecode
    const cacheData = script.createCachedData();
    
    // Save to disk
    fs.writeFileSync('app.js.cache', cacheData);
    
    // Execute
    script.runInNewContext({});
  }

  // SECOND RUN+ (usage)
  static subsequentRuns() {
    const sourceCode = fs.readFileSync('app.js');
    const cacheData = fs.readFileSync('app.js.cache');
    
    // Create script WITH cached bytecode
    const script = vm.Script(sourceCode, {
      filename: 'app.js',
      cachedData: cacheData  // ← Much faster!
    });

    // V8 validates cache, runs in milliseconds
    script.runInNewContext({});
  }
}
```

### 3. Cache Invalidation

```javascript
// Cache becomes invalid if:
// • Source code changes (hash mismatch)
// • V8 version changes (can't reuse across versions)
// • Architecture changes (x64 vs arm64)

class CodeCacheValidator {
  constructor(sourceFile) {
    this.sourceFile = sourceFile;
    this.sourceHash = this.computeHash(sourceFile);
    this.v8Version = process.versions.v8;
    this.arch = process.arch;
  }

  computeHash(file) {
    const crypto = require('crypto');
    const content = fs.readFileSync(file);
    return crypto.createHash('sha256').update(content).digest('hex');
  }

  getCacheMetadata() {
    return {
      sourceHash: this.sourceHash,
      v8Version: this.v8Version,
      arch: this.arch,
      timestamp: Date.now()
    };
  }

  isCacheValid(cacheFile) {
    if (!fs.existsSync(cacheFile)) {
      return false;
    }

    const metadata = JSON.parse(
      fs.readFileSync(cacheFile + '.meta', 'utf-8')
    );

    // Cache valid if all match
    return (
      metadata.sourceHash === this.sourceHash &&
      metadata.v8Version === this.v8Version &&
      metadata.arch === this.arch
    );
  }

  generateCache(sourceFile, outputFile) {
    const { Script } = require('vm');
    const source = fs.readFileSync(sourceFile, 'utf-8');

    const script = new Script(source, { filename: sourceFile });
    const cached = script.createCachedData();

    // Save cache
    fs.writeFileSync(outputFile, cached);

    // Save metadata
    fs.writeFileSync(outputFile + '.meta', JSON.stringify(
      this.getCacheMetadata()
    ));
  }
}
```

---

## Implementation Strategy

### Strategy 1: V8 Code Caching in Electron

```javascript
// ============================================
// Enable code caching in Electron windows
// ============================================

const { app, BrowserWindow } = require('electron');
const path = require('path');

class ElectronCodeCaching {
  static initialize() {
    // Only works with sandboxed preload scripts
    app.whenReady().then(() => {
      this.setupCodeCaching();
    });
  }

  static setupCodeCaching() {
    // Create main window
    const mainWindow = new BrowserWindow({
      webPreferences: {
        sandbox: true,
        preload: path.join(__dirname, 'preload.js')
      }
    });

    // Configure Electron to cache compiled code
    mainWindow.webContents.session.on(
      'will-download',
      () => {} // Ensure session is ready
    );

    // Load URL with code caching
    // Chromium automatically caches code when:
    // 1. Page loaded from custom protocol (not file://)
    // 2. Code is > some size threshold
    mainWindow.loadURL('vscode-file://app/index.html');
  }

  static disableCodeCache() {
    // For debugging, can disable with environment variable
    if (process.env.VSCODE_DISABLE_CODE_CACHE) {
      console.log('Code caching disabled');
      // Code runs in interpreter, no caching
    }
  }
}

// Usage
ElectronCodeCaching.initialize();
```

### Strategy 2: Chromium Code Caching with Custom Protocol

```javascript
// ============================================
// Chromium handles code caching automatically
// Key: Use custom protocol instead of file://
// ============================================

const { protocol, app } = require('electron');
const fs = require('fs');
const path = require('path');

app.whenReady().then(() => {
  // Register custom protocol
  protocol.registerFileProtocol('vscode-file', (request, callback) => {
    try {
      const url = new URL(request.url);
      const filePath = path.join(__dirname, 'dist', url.pathname);

      // Validate path
      const realPath = fs.realpathSync(filePath);
      const realDist = fs.realpathSync(path.join(__dirname, 'dist'));

      if (!realPath.startsWith(realDist)) {
        return callback({ statusCode: 403 });
      }

      // Return file with proper headers
      callback({
        path: realPath,
        headers: {
          // Critical for code caching:
          'Content-Type': this.getMimeType(realPath),

          // Caching headers - Chromium uses these
          'Cache-Control': 'public, max-age=31536000', // 1 year
          'ETag': this.getETag(realPath),

          // Security headers
          'X-Content-Type-Options': 'nosniff'
        }
      });

    } catch (error) {
      callback({ statusCode: 500 });
    }
  });

  // Chromium automatically:
  // 1. Detects code (JS/WASM > threshold)
  // 2. Compiles to bytecode
  // 3. Caches in Chromium cache directory
  // 4. Loads from cache on next launch
});

getMimeType(filepath) {
  const ext = path.extname(filepath);
  return {
    '.js': 'application/javascript',
    '.wasm': 'application/wasm',
    '.html': 'text/html'
  }[ext] || 'application/octet-stream';
}

getETag(filepath) {
  // ETag helps Chromium validate cache
  const stat = fs.statSync(filepath);
  return `"${stat.mtime.getTime()}"`;
}
```

### Strategy 3: Manual Cache Management (Node.js)

```javascript
// ============================================
// For Node.js scripts, manage cache manually
// ============================================

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const crypto = require('crypto');

class NodeCodeCacheManager {
  constructor(sourceFile, cacheDir = '.cache') {
    this.sourceFile = sourceFile;
    this.cacheDir = cacheDir;
    this.cacheFile = path.join(
      cacheDir,
      path.basename(sourceFile) + '.cache'
    );

    if (!fs.existsSync(cacheDir)) {
      fs.mkdirSync(cacheDir, { recursive: true });
    }
  }

  getSourceHash() {
    const source = fs.readFileSync(this.sourceFile, 'utf-8');
    return crypto.createHash('sha256').update(source).digest('hex');
  }

  getMetadataFile() {
    return this.cacheFile + '.meta';
  }

  isCacheValid() {
    if (!fs.existsSync(this.cacheFile)) {
      return false;
    }

    try {
      const metadata = JSON.parse(
        fs.readFileSync(this.getMetadataFile(), 'utf-8')
      );

      return (
        metadata.sourceHash === this.getSourceHash() &&
        metadata.v8Version === process.versions.v8 &&
        metadata.arch === process.arch
      );

    } catch {
      return false;
    }
  }

  generateCache() {
    const source = fs.readFileSync(this.sourceFile, 'utf-8');

    // Create script without cache to compile it
    const script = new vm.Script(source, {
      filename: this.sourceFile,
      lineOffset: 0
    });

    // Create cache from compiled code
    const cachedData = script.createCachedData();

    // Save cache
    fs.writeFileSync(this.cacheFile, cachedData);

    // Save metadata
    const metadata = {
      sourceHash: this.getSourceHash(),
      v8Version: process.versions.v8,
      arch: process.arch,
      timestamp: Date.now()
    };

    fs.writeFileSync(
      this.getMetadataFile(),
      JSON.stringify(metadata, null, 2)
    );

    console.log(`Generated cache: ${this.cacheFile}`);
  }

  execute(context) {
    const source = fs.readFileSync(this.sourceFile, 'utf-8');

    let cachedData = null;
    if (this.isCacheValid()) {
      cachedData = fs.readFileSync(this.cacheFile);
    }

    // Create script with cached data (much faster!)
    const script = new vm.Script(source, {
      filename: this.sourceFile,
      cachedData: cachedData,
      lineOffset: 0
    });

    // If cache was invalid, regenerate it
    if (cachedData === null && script.sourceMapURL === null) {
      this.generateCache();
    }

    return script.runInNewContext(context);
  }
}

// Usage
const manager = new NodeCodeCacheManager('./app.js');

console.time('execution');
manager.execute({});
console.timeEnd('execution');
// First run: 200ms (compiles and generates cache)
// Second run: 5ms (loads from cache!)
```

### Strategy 4: Build-Time Cache Generation

```javascript
// ============================================
// Pre-generate caches at build time
// ============================================

const fs = require('fs');
const path = require('path');
const webpack = require('webpack');

class BuildTimeCodeCachePlugin {
  constructor(options = {}) {
    this.options = {
      cacheDir: '.build-cache',
      ...options
    };
  }

  apply(compiler) {
    compiler.hooks.done.tapPromise(
      'BuildTimeCodeCachePlugin',
      async (stats) => {
        await this.generateCachesForAssets(stats.compilation.assets);
      }
    );
  }

  async generateCachesForAssets(assets) {
    const { Script } = require('vm');
    const cacheDir = this.options.cacheDir;

    if (!fs.existsSync(cacheDir)) {
      fs.mkdirSync(cacheDir, { recursive: true });
    }

    for (const [filename, asset] of Object.entries(assets)) {
      if (!filename.endsWith('.js')) continue;

      const source = asset.source();

      try {
        // Create script to compile it
        const script = new Script(source, { filename });

        // Generate cache
        const cached = script.createCachedData();

        // Save cache alongside bundle
        const cacheFile = path.join(cacheDir, filename + '.cache');
        fs.writeFileSync(cacheFile, cached);

        console.log(`✓ Generated cache for ${filename}`);

      } catch (error) {
        console.error(`✗ Failed to cache ${filename}:`, error.message);
      }
    }
  }
}

// webpack.config.js
module.exports = {
  mode: 'production',
  entry: './src/app.js',
  output: {
    path: path.join(__dirname, 'dist'),
    filename: 'app.js'
  },
  plugins: [
    new BuildTimeCodeCachePlugin({
      cacheDir: path.join(__dirname, 'dist', '.cache')
    })
  ]
};
```

---

## Real-World Applications

### Application 1: VS Code's Actual Implementation

```javascript
// ============================================
// Simplified version of VS Code's caching
// ============================================

class VSCodeCachingStrategy {
  static async initializeAppCache() {
    // Use custom protocol for code caching
    protocol.registerFileProtocol('vscode-file', 
      this.handleFileRequest.bind(this)
    );

    // Force code caching
    // Chromium will automatically cache:
    // • app.js (main bundle)
    // • workbench.js
    // • Any script > certain size

    // Key insight: Rename bundle every release
    // Old: app.js (5MB, v1.60.0)
    // New: app-1.61.0.js (5MB, v1.61.0)
    // Prevents stale cache issues
  }

  static handleFileRequest(request, callback) {
    const url = new URL(request.url);
    const filePath = this.resolvePath(url);

    // Important: Include version in URL or ETag
    // This helps Chromium invalidate old caches
    const version = this.getAppVersion();

    callback({
      path: filePath,
      headers: {
        'Content-Type': 'application/javascript',
        'Cache-Control': 'public, max-age=31536000',
        'X-App-Version': version,
        'ETag': this.computeETag(filePath)
      }
    });
  }

  static computeETag(filepath) {
    const stat = fs.statSync(filepath);
    const mtime = stat.mtime.getTime();
    const size = stat.size;

    // ETag includes mtime and size
    // Changes when file is modified
    return `"${mtime}-${size}"`;
  }

  static getAppVersion() {
    return require('./package.json').version;
  }

  static resolvePath(url) {
    return path.join(__dirname, 'dist', url.pathname);
  }
}
```

### Application 2: Startup Performance Monitoring

```javascript
// ============================================
// Monitor and optimize startup performance
// ============================================

class StartupPerformanceMonitor {
  constructor() {
    this.marks = {};
  }

  mark(label) {
    this.marks[label] = performance.now();
    console.log(`[${label}] ${this.marks[label].toFixed(0)}ms`);
  }

  measure(label, from, to) {
    const duration = this.marks[to] - this.marks[from];
    console.log(`${label}: ${duration.toFixed(0)}ms`);
    return duration;
  }

  trackStartup() {
    // Before app starts
    this.mark('startup:start');

    app.on('ready', () => {
      this.mark('app:ready');
    });

    app.on('will-finish-launching', () => {
      this.mark('launch:start');
    });

    // In preload
    window.performance.mark('renderer:preload:start');

    // After DOM ready
    document.addEventListener('DOMContentLoaded', () => {
      window.performance.mark('renderer:dom-ready');
    });

    // After app initialized
    app.once('application-ready', () => {
      window.performance.mark('renderer:app-ready');

      this.reportMetrics();
    });
  }

  reportMetrics() {
    const marks = performance.getEntriesByType('mark');
    const measures = {};

    console.log('=== Startup Performance ===');
    marks.forEach(mark => {
      console.log(`${mark.name}: ${mark.startTime.toFixed(0)}ms`);
    });

    // Compare with/without code caching
    if (process.env.VSCODE_CODE_CACHE_VERSION) {
      console.log(
        `Code cache version: ${process.env.VSCODE_CODE_CACHE_VERSION}`
      );
    }
  }
}

// Usage
const monitor = new StartupPerformanceMonitor();
monitor.trackStartup();
```

---

## Anti-Patterns & Pitfalls

### ❌ Anti-Pattern 1: Not Invalidating Stale Caches

```javascript
// ❌ BAD: Cache never invalidates
script.runInThisContext({
  cachedData: oldCache // Could be days old!
});

// ✅ GOOD: Include version/hash checks
const metadata = {
  sourceHash: hash(source),
  v8Version: process.versions.v8,
  arch: process.arch,
  timestamp: Date.now()
};

if (!this.isMetadataValid(metadata)) {
  console.log('Cache invalidated, regenerating');
  generateNewCache();
}
```

### ❌ Anti-Pattern 2: Caching in Wrong Format

```javascript
// ❌ BAD: Storing regular Buffer
// Works on one machine, fails on another
cache.mtime = 1234567890; // x64 specific

// ✅ GOOD: Include all context
const metadata = {
  sourceHash: '...',
  v8Version: process.versions.v8, // Version-specific
  arch: process.arch,              // Architecture-specific
  nodeVersion: process.version,    // Node version-specific
  timestamp: Date.now()
};
```

### ❌ Anti-Pattern 3: Over-Caching Large Bundles

```javascript
// ❌ BAD: Cache everything blindly
// Code caching has overhead for small files
fs.readdirSync('src').forEach(file => {
  if (file.endsWith('.js')) {
    cacheScript(file); // Even tiny utility files!
  }
});

// ✅ GOOD: Only cache large/frequently-executed files
const CACHE_MIN_SIZE = 50 * 1024; // 50KB minimum

function shouldCache(filePath) {
  const stat = fs.statSync(filePath);
  return stat.size > CACHE_MIN_SIZE;
}
```

### ❌ Anti-Pattern 4: Ignoring Cache Hit Ratio

```javascript
// ❌ BAD: Assume cache always works
// Don't know if it's actually helping
new vm.Script(source, { cachedData: cache });

// ✅ GOOD: Monitor cache effectiveness
class CacheMonitor {
  hits = 0;
  misses = 0;

  executeWithCache(source, cachedData) {
    const script = new vm.Script(source, { cachedData });

    if (script.cachedData !== null) {
      this.hits++;
    } else {
      this.misses++;
    }

    return script;
  }

  getHitRatio() {
    return this.hits / (this.hits + this.misses);
  }
}
```

---

## Best Practices

### Checklist for Code Caching

```javascript
const codeCachingChecklist = [
  '[] Using custom protocol (not file://)',
  '[] ETag headers set correctly',
  '[] Cache-Control headers set',
  '[] Cache invalidation on version change',
  '[] Monitoring cache hit ratio',
  '[] Testing cache generation',
  '[] Pre-generating caches at build time',
  '[] Storing cache metadata',
  '[] Handling cache corruption gracefully',
  '[] Measuring startup improvement',
  '[] Clean cache on major version bump'
];
```

### Performance Benchmarks

```javascript
// Typical startup improvements with code caching

const improvements = {
  'Before (file:// protocol)': '~5000ms',
  'With custom protocol': '~2000ms (60% improvement)',
  'With code caching': '~800ms (84% improvement)',
  'With pre-generated caches': '~600ms (88% improvement)'
};

// On subsequent launches:
'First launch': 800,     // Generate cache
'Second+ launch': 200,   // Load from cache
'Improvement': '4x faster'
```

### Implementation Timeline

```
Week 1: Implement custom protocol
  └─ Chromium auto-caches code

Week 2: Add version tracking
  └─ Invalidate on app update

Week 3: Build-time cache generation
  └─ Pre-compute caches

Week 4: Monitoring & profiling
  └─ Measure actual impact
```

