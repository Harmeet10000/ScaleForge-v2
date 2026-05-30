# IPC Mastery: Practical Exercises & Implementation Challenges

**Hands-on projects to reinforce your IPC knowledge.**

---

## Exercise 1: Secure File Editor with Context Isolation

**Objective**: Build a secure file editor demonstrating proper context isolation and preload script patterns.

**Requirements**:
- Preload script with context bridge
- Input validation at security boundary
- TypeScript types for exposed APIs
- Error handling

**Starter Code**:

```javascript
// main.js
const { app, BrowserWindow } = require('electron');
const path = require('path');

app.whenReady().then(() => {
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true, // ✅ CRITICAL
      enableRemoteModule: false // ✅ CRITICAL
    }
  });

  win.loadFile('index.html');
});

// preload.js
const { contextBridge, ipcRenderer } = require('electron');
const path = require('path');
const { homedir } = require('os');

// Security: Only allow paths within documents directory
const SAFE_ROOT = path.join(homedir(), 'Documents', 'project');

const validatePath = (filepath) => {
  if (typeof filepath !== 'string') throw new TypeError('Invalid path');
  const resolved = path.resolve(filepath);
  const relative = path.relative(SAFE_ROOT, resolved);
  
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error('Path access denied');
  }
  
  return resolved;
};

// Exposed API
contextBridge.exposeInMainWorld('electronAPI', {
  openFile: async (filepath) => {
    return ipcRenderer.invoke('open-file', validatePath(filepath));
  },

  saveFile: async (filepath, content) => {
    return ipcRenderer.invoke(
      'save-file',
      validatePath(filepath),
      content
    );
  },

  listFiles: async (directory) => {
    return ipcRenderer.invoke('list-files', validatePath(directory));
  },

  onFileChanged: (callback) => {
    ipcRenderer.on('file-changed', (event, fileInfo) => {
      callback(fileInfo);
    });

    return () => ipcRenderer.removeAllListeners('file-changed');
  }
});

// preload.d.ts
export interface IElectronAPI {
  openFile(filepath: string): Promise<string>;
  saveFile(filepath: string, content: string): Promise<void>;
  listFiles(directory: string): Promise<string[]>;
  onFileChanged(callback: (fileInfo: any) => void): () => void;
}

declare global {
  interface Window {
    electronAPI: IElectronAPI;
  }
}

// index.html
<!DOCTYPE html>
<html>
<head>
  <title>Secure File Editor</title>
  <style>
    body { font-family: monospace; }
    textarea { width: 100%; height: 400px; }
    button { padding: 10px 20px; margin: 5px; }
  </style>
</head>
<body>
  <h1>Secure File Editor</h1>
  <input type="text" id="filepath" placeholder="Enter file path">
  <button onclick="openFile()">Open</button>
  <button onclick="saveFile()">Save</button>
  <button onclick="listFiles()">List Files</button>
  <textarea id="editor"></textarea>

  <script>
    let currentFile = '';

    async function openFile() {
      try {
        const filepath = document.getElementById('filepath').value;
        const content = await window.electronAPI.openFile(filepath);
        document.getElementById('editor').value = content;
        currentFile = filepath;
      } catch (error) {
        alert('Error: ' + error.message);
      }
    }

    async function saveFile() {
      try {
        const content = document.getElementById('editor').value;
        await window.electronAPI.saveFile(currentFile, content);
        alert('File saved!');
      } catch (error) {
        alert('Error: ' + error.message);
      }
    }

    async function listFiles() {
      try {
        const dir = document.getElementById('filepath').value;
        const files = await window.electronAPI.listFiles(dir);
        console.log('Files:', files);
      } catch (error) {
        alert('Error: ' + error.message);
      }
    }

    // Listen for external file changes
    window.electronAPI.onFileChanged((fileInfo) => {
      if (fileInfo.path === currentFile) {
        alert(`File changed: ${fileInfo.path}`);
      }
    });
  </script>
</body>
</html>

// Implementation in main.js
const { ipcMain } = require('electron');
const fs = require('fs').promises;

ipcMain.handle('open-file', async (event, filepath) => {
  try {
    const content = await fs.readFile(filepath, 'utf-8');
    return content;
  } catch (error) {
    throw new Error(`Failed to read file: ${error.message}`);
  }
});

ipcMain.handle('save-file', async (event, filepath, content) => {
  try {
    await fs.writeFile(filepath, content, 'utf-8');
  } catch (error) {
    throw new Error(`Failed to save file: ${error.message}`);
  }
});

ipcMain.handle('list-files', async (event, directory) => {
  try {
    const files = await fs.readdir(directory);
    return files;
  } catch (error) {
    throw new Error(`Failed to list files: ${error.message}`);
  }
});
```

**Challenge Questions**:
1. How would you prevent directory traversal attacks?
2. What happens if a malicious script tries to access the full ipcRenderer?
3. How would you add file size limits?

---

## Exercise 2: CPU Task Processor with Worker Pools

**Objective**: Implement a worker pool system that processes image transformations without blocking the UI.

**Requirements**:
- Worker pool with dynamic sizing
- Task queue management
- Error recovery
- Progress reporting

**Starter Code**:

```javascript
// main-thread.js
const { Worker } = require('worker_threads');
const path = require('path');

class WorkerPool {
  constructor(workerScript, size = 4) {
    this.workerScript = workerScript;
    this.poolSize = size;
    this.workers = [];
    this.taskQueue = [];
    this.taskInProgress = new Map();
    this._initialize();
  }

  _initialize() {
    for (let i = 0; i < this.poolSize; i++) {
      this._createWorker();
    }
  }

  _createWorker() {
    const worker = new Worker(this.workerScript);
    
    worker.on('message', (result) => {
      const task = this.taskInProgress.get(worker);
      if (task) {
        task.resolve(result);
        this.taskInProgress.delete(worker);
      }

      // Process queue
      if (this.taskQueue.length > 0) {
        const nextTask = this.taskQueue.shift();
        this._assignTask(worker, nextTask);
      }
    });

    worker.on('error', (error) => {
      const task = this.taskInProgress.get(worker);
      if (task) {
        task.reject(error);
        this.taskInProgress.delete(worker);
      }

      // Replace failed worker
      const index = this.workers.indexOf(worker);
      if (index > -1) {
        this.workers.splice(index, 1);
        this._createWorker();
      }
    });

    this.workers.push(worker);
  }

  _assignTask(worker, task) {
    this.taskInProgress.set(worker, task);
    worker.postMessage(task.data);
  }

  async execute(data, onProgress) {
    return new Promise((resolve, reject) => {
      const task = { data, resolve, reject, onProgress };

      // Find idle worker
      const idleWorker = this.workers.find(
        (w) => !this.taskInProgress.has(w)
      );

      if (idleWorker) {
        this._assignTask(idleWorker, task);
      } else {
        this.taskQueue.push(task);
      }
    });
  }

  getStats() {
    return {
      totalWorkers: this.poolSize,
      activeWorkers: this.taskInProgress.size,
      queuedTasks: this.taskQueue.length
    };
  }

  async terminate() {
    this.workers.forEach((w) => w.terminate());
    this.workers = [];
  }
}

// Usage example
(async () => {
  const pool = new WorkerPool(
    path.join(__dirname, 'image-processor.js'),
    4
  );

  const images = [
    { id: 1, buffer: Buffer.alloc(1024) },
    { id: 2, buffer: Buffer.alloc(1024) },
    { id: 3, buffer: Buffer.alloc(1024) },
  ];

  const results = await Promise.all(
    images.map((img) =>
      pool.execute(
        { imageBuffer: img.buffer, width: 800, height: 600 },
        (progress) => console.log(`Image ${img.id}: ${progress}%`)
      )
    )
  );

  console.log('Results:', results);
  console.log('Stats:', pool.getStats());
  await pool.terminate();
})();

// image-processor.js (Worker)
const { workerData, parentPort } = require('worker_threads');
const sharp = require('sharp');

parentPort.on('message', async (msg) => {
  try {
    const { imageBuffer, width, height } = msg;

    const result = await sharp(imageBuffer)
      .resize(width, height)
      .blur(2)
      .toBuffer();

    parentPort.postMessage({
      success: true,
      result,
      size: result.length
    });
  } catch (error) {
    parentPort.postMessage({
      success: false,
      error: error.message
    });
  }
});
```

**Challenge Levels**:

**Level 1 (Basic)**:
- Implement basic worker pool
- Task queueing
- Error handling

**Level 2 (Intermediate)**:
- Add progress reporting
- Worker health checks
- Task timeout handling

**Level 3 (Advanced)**:
- Dynamic pool sizing (grow/shrink)
- Load balancing
- Persistence of failed tasks

---

## Exercise 3: Real-Time File Watcher with Message Ports

**Objective**: Create a file watching system using message ports for direct renderer-to-service communication.

**Requirements**:
- Message port setup
- Efficient file change streaming
- Filter and debounce events
- Cleanup handling

**Starter Code**:

```javascript
// file-watcher-service.js (Shared Process or Worker)
const { parentPort, workerData } = require('worker_threads');
const chokidar = require('chokidar');
const path = require('path');

let watchPort;
const watchers = new Map();

// Receive port from main process
parentPort.on('message', (msg) => {
  if (msg.type === 'init-port') {
    watchPort = msg.port;
    console.log('File watcher service initialized');
  }
});

// API for setting up watchers
const api = {
  watch: (projectPath) => {
    if (watchers.has(projectPath)) {
      return { success: true, alreadyWatching: true };
    }

    const watcher = chokidar.watch(projectPath, {
      ignored: /(^|[\/\\])\.|node_modules/,
      persistent: true,
      awaitWriteFinish: { stabilityThreshold: 100, pollInterval: 100 }
    });

    watcher.on('change', (filepath) => {
      if (watchPort) {
        watchPort.postMessage({
          type: 'change',
          path: filepath,
          timestamp: Date.now()
        });
      }
    });

    watcher.on('add', (filepath) => {
      if (watchPort) {
        watchPort.postMessage({
          type: 'add',
          path: filepath
        });
      }
    });

    watcher.on('unlink', (filepath) => {
      if (watchPort) {
        watchPort.postMessage({
          type: 'unlink',
          path: filepath
        });
      }
    });

    watchers.set(projectPath, watcher);
    return { success: true };
  },

  unwatch: (projectPath) => {
    const watcher = watchers.get(projectPath);
    if (watcher) {
      watcher.close();
      watchers.delete(projectPath);
      return { success: true };
    }
    return { success: false };
  }
};

// Main process setup
const { ipcMain, MessageChannelMain } = require('electron');

ipcMain.handle('setup-file-watcher', (event, projectPath) => {
  const { port1, port2 } = new MessageChannelMain();

  // Port1 stays in service, port2 goes to renderer
  port1.onmessage = (msg) => {
    const result = api[msg.data.action](msg.data.projectPath);
    port1.postMessage(result);
  };

  // Let service know about the port
  watcherWorker.postMessage({ type: 'init-port', port: port1 }, [port1]);

  return port2;
});

// Renderer usage
contextBridge.exposeInMainWorld('electronAPI', {
  setupFileWatcher: async (projectPath) => {
    return await ipcRenderer.invoke('setup-file-watcher', projectPath);
  }
});

// Application
class FileWatcher {
  constructor() {
    this.port = null;
    this.listeners = new Map();
  }

  async watch(projectPath) {
    this.port = await window.electronAPI.setupFileWatcher(projectPath);

    this.port.onmessage = (event) => {
      this._handleFileEvent(event.data);
    };

    this.port.onclose = () => {
      console.log('Watch connection closed');
    };
  }

  on(eventType, callback) {
    if (!this.listeners.has(eventType)) {
      this.listeners.set(eventType, []);
    }
    this.listeners.get(eventType).push(callback);

    return () => {
      const list = this.listeners.get(eventType);
      const index = list.indexOf(callback);
      if (index > -1) list.splice(index, 1);
    };
  }

  _handleFileEvent(event) {
    const callbacks = this.listeners.get(event.type) || [];
    callbacks.forEach((cb) => {
      try {
        cb(event);
      } catch (error) {
        console.error('Callback error:', error);
      }
    });
  }

  close() {
    if (this.port) {
      this.port.close();
    }
  }
}

// Usage
const watcher = new FileWatcher();

watcher.on('change', (event) => {
  console.log('File changed:', event.path);
});

watcher.on('add', (event) => {
  console.log('File added:', event.path);
});

watcher.on('unlink', (event) => {
  console.log('File removed:', event.path);
});

watcher.watch('/path/to/project');
```

**Challenge**: Add debouncing so multiple rapid changes fire only one event.

---

## Exercise 4: Performance Monitoring Dashboard

**Objective**: Build an IPC performance monitoring system that tracks metrics across multiple channels.

**Requirements**:
- Track message latency
- Monitor error rates
- Detect performance degradation
- Export metrics

**Implementation**:

```javascript
class IPCMetricsCollector {
  constructor() {
    this.metrics = new Map();
  }

  recordRequest(channel, duration) {
    if (!this.metrics.has(channel)) {
      this.metrics.set(channel, {
        count: 0,
        totalTime: 0,
        minTime: Infinity,
        maxTime: 0,
        errors: 0,
        times: []
      });
    }

    const m = this.metrics.get(channel);
    m.count++;
    m.totalTime += duration;
    m.minTime = Math.min(m.minTime, duration);
    m.maxTime = Math.max(m.maxTime, duration);
    m.times.push(duration);

    if (duration > 1000) {
      console.warn(`⚠️ Slow IPC: ${channel} took ${duration}ms`);
    }
  }

  recordError(channel) {
    if (!this.metrics.has(channel)) {
      this.metrics.set(channel, {
        count: 0,
        totalTime: 0,
        minTime: Infinity,
        maxTime: 0,
        errors: 0,
        times: []
      });
    }
    this.metrics.get(channel).errors++;
  }

  getStats(channel) {
    const m = this.metrics.get(channel);
    if (!m) return null;

    const sorted = m.times.sort((a, b) => a - b);
    const median = sorted[Math.floor(sorted.length / 2)];

    return {
      channel,
      count: m.count,
      avgTime: m.totalTime / m.count,
      minTime: m.minTime,
      maxTime: m.maxTime,
      median,
      errorRate: m.errors / m.count,
      p95: sorted[Math.floor(sorted.length * 0.95)]
    };
  }

  getAllStats() {
    return Array.from(this.metrics.keys()).map((ch) =>
      this.getStats(ch)
    );
  }

  reset() {
    this.metrics.clear();
  }
}

const collector = new IPCMetricsCollector();

// Wrap IPC calls
const measuredInvoke = async (channel, ...args) => {
  const start = performance.now();
  try {
    const result = await ipcRenderer.invoke(channel, ...args);
    const duration = performance.now() - start;
    collector.recordRequest(channel, duration);
    return result;
  } catch (error) {
    collector.recordError(channel);
    throw error;
  }
};

// Display dashboard
setInterval(() => {
  console.clear();
  console.log('=== IPC Performance Dashboard ===');
  collector.getAllStats().forEach((stats) => {
    console.log(`
${stats.channel}
  Requests: ${stats.count}
  Avg Time: ${stats.avgTime.toFixed(2)}ms
  P95: ${stats.p95.toFixed(2)}ms
  Errors: ${(stats.errorRate * 100).toFixed(2)}%
    `);
  });
}, 5000);
```

---

## Exercise 5: Debugging & Profiling Challenge

**Objective**: Debug and optimize a poorly written IPC system.

**The Problem Code**:

```javascript
// ❌ Badly written IPC code (multiple issues)

// Process 1
ipcMain.on('process-data', (event, data) => {
  const result = heavyComputation(data); // Blocks!
  event.reply('result', result);
});

// Process 2
for (let i = 0; i < 10000; i++) {
  ipcRenderer.send('heavy-task', largeData);
}

// Process 3
const worker = new Worker('./worker.js');
worker.postMessage(hugeObject); // Will serialize!

// Process 4
ipcRenderer.on('update', (event, data) => {
  // No error handling, will crash
  processData(data);
});
```

**Your Task**: Identify all issues and fix them.

**Expected Issues**:
1. Blocking computation on main thread
2. Too many messages overwhelming IPC
3. Serialization overhead with large objects
4. Missing error handling
5. Resource leaks

**Solution Template**:

```javascript
// ✅ Fixed version

// Use worker pool for heavy computation
const pool = new WorkerPool('./compute-worker.js', 4);

ipcMain.handle('process-data', async (event, data) => {
  return await pool.execute(data);
});

// Batch requests
const batchQueue = [];
const sendBatch = debounce(() => {
  ipcRenderer.send('batch-tasks', batchQueue);
  batchQueue.length = 0;
}, 100);

batchQueue.push(data);
sendBatch();

// Stream large data
const stream = fs.createReadStream(largeFile);
stream.on('data', (chunk) => {
  worker.postMessage(chunk);
});

// Error handling
ipcRenderer.on('update', (event, data) => {
  try {
    processData(data);
  } catch (error) {
    console.error('Update failed:', error);
  }
});
```

---

## Assessment Rubric

**Excellent (90-100)**
- ✅ All requirements met
- ✅ Proper error handling
- ✅ Security best practices
- ✅ Performance optimized
- ✅ Well-documented code

**Good (80-89)**
- ✅ Most requirements met
- ✅ Basic error handling
- ✅ Security implemented
- ⚠️ Some performance concerns

**Fair (70-79)**
- ⚠️ Core functionality works
- ⚠️ Minimal error handling
- ⚠️ Security gaps exist

**Poor (<70)**
- ❌ Major functionality missing
- ❌ No error handling
- ❌ Security vulnerabilities

---

## Self-Assessment Questions

After completing each exercise:

1. **Security**: Can a malicious script break out of the sandbox?
2. **Performance**: How does it scale with 10,000 messages/second?
3. **Reliability**: What happens if a worker crashes mid-task?
4. **Maintainability**: Can another developer understand the code?
5. **Testability**: How would you unit test this IPC code?

---

## Next Steps

1. Implement all exercises
2. Create your own IPC-based application
3. Profile and optimize for performance
4. Add comprehensive error handling
5. Write unit and integration tests
6. Document the IPC protocol thoroughly

