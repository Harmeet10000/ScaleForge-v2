# IPC Quick Reference Card

**Ready-to-copy code snippets for common IPC patterns.**

---

## 1️⃣ Secure Preload Script Template

```javascript
// ✅ Copy & Paste Ready
const { contextBridge, ipcRenderer } = require('electron');

const validateInput = (value, type = 'string') => {
  if (typeof value !== type) {
    throw new TypeError(`Expected ${type}, got ${typeof value}`);
  }
  return value;
};

contextBridge.exposeInMainWorld('electronAPI', {
  // Pattern: methodName: (args) => ipcRenderer.invoke('channel', args)
  
  readFile: async (path) => {
    return ipcRenderer.invoke('read-file', validateInput(path, 'string'));
  },

  writeFile: async (path, content) => {
    return ipcRenderer.invoke(
      'write-file',
      validateInput(path, 'string'),
      validateInput(content, 'string')
    );
  },

  onUpdate: (callback) => {
    ipcRenderer.on('update', (event, data) => callback(data));
    return () => ipcRenderer.removeAllListeners('update');
  },

  // Pattern for errors
  deleteFile: async (path) => {
    try {
      return await ipcRenderer.invoke('delete-file', validateInput(path));
    } catch (error) {
      console.error('Delete failed:', error);
      throw new Error(`Cannot delete: ${error.message}`);
    }
  }
});
```

---

## 2️⃣ Main Process Handler Template

```javascript
// ✅ Copy & Paste Ready
const { ipcMain } = require('electron');
const fs = require('fs').promises;

ipcMain.handle('read-file', async (event, filepath) => {
  try {
    // Validate on server side too!
    if (!isPathAllowed(filepath)) {
      throw new Error('Access denied');
    }
    return await fs.readFile(filepath, 'utf-8');
  } catch (error) {
    // Always send meaningful errors
    throw new Error(`Read failed: ${error.message}`);
  }
});

ipcMain.handle('write-file', async (event, filepath, content) => {
  try {
    if (!isPathAllowed(filepath)) throw new Error('Access denied');
    if (typeof content !== 'string') throw new TypeError('Content must be string');
    await fs.writeFile(filepath, content, 'utf-8');
  } catch (error) {
    throw new Error(`Write failed: ${error.message}`);
  }
});

ipcMain.handle('delete-file', async (event, filepath) => {
  try {
    if (!isPathAllowed(filepath)) throw new Error('Access denied');
    await fs.unlink(filepath);
  } catch (error) {
    throw new Error(`Delete failed: ${error.message}`);
  }
});

const isPathAllowed = (p) => {
  // Security boundary: only allow safe paths
  return p.startsWith('/safe/directory/');
};
```

---

## 3️⃣ Request-Response (RPC) Pattern

```javascript
// Main Process
ipcMain.handle('fetch-data', async (event, id) => {
  const data = await database.query(id);
  if (!data) throw new Error('Not found');
  return data;
});

// Renderer
async function getData(id) {
  try {
    const result = await window.electronAPI.fetchData(id);
    updateUI(result);
  } catch (error) {
    showError('Failed to fetch data');
  }
}
```

---

## 4️⃣ Pub/Sub Event Pattern

```javascript
// Main Process - Broadcast to all windows
const { BrowserWindow, ipcMain } = require('electron');

ipcMain.on('file-changed', (event, fileInfo) => {
  // Broadcast to all windows except sender
  BrowserWindow.getAllWindows().forEach((win) => {
    if (win.webContents !== event.sender) {
      win.webContents.send('file-changed', fileInfo);
    }
  });
});

// Renderer - Listen for events
window.electronAPI.onFileChanged((fileInfo) => {
  console.log('File updated:', fileInfo.name);
  refreshUI();
});

// Renderer - Emit event
function saveFile(content) {
  ipcRenderer.send('file-changed', {
    name: 'main.js',
    timestamp: Date.now()
  });
}
```

---

## 5️⃣ Message Port for High Performance

```javascript
// Main Process
const { ipcMain, MessageChannelMain } = require('electron');

ipcMain.handle('get-streaming-port', (event) => {
  const { port1, port2 } = new MessageChannelMain();

  // Listen on port1
  port1.onmessage = (msg) => {
    console.log('Received:', msg.data);
    port1.postMessage({ response: 'ack' });
  };

  // Send port2 to renderer
  return port2;
});

// Renderer
async function setupStream() {
  const port = await window.electronAPI.getStreamingPort();

  port.onmessage = (event) => {
    console.log('Response:', event.data);
  };

  // Direct, high-speed communication
  port.postMessage({ action: 'start', data: bigArray });
  port.postMessage({ action: 'process' });
}
```

---

## 6️⃣ Worker Thread Pool

```javascript
// ✅ Copy & Paste Ready
const { Worker } = require('worker_threads');

class SimpleWorkerPool {
  constructor(script, size = 4) {
    this.workers = [];
    this.queue = [];
    for (let i = 0; i < size; i++) {
      this._addWorker(script);
    }
  }

  _addWorker(script) {
    const w = new Worker(script);
    w.busy = false;
    w.on('message', (result) => {
      w.busy = false;
      const { resolve } = w.current || {};
      if (resolve) resolve(result);
      this._processQueue();
    });
    w.on('error', (err) => {
      w.busy = false;
      const { reject } = w.current || {};
      if (reject) reject(err);
      this._processQueue();
    });
    this.workers.push(w);
  }

  _processQueue() {
    if (this.queue.length === 0) return;
    const free = this.workers.find(w => !w.busy);
    if (!free) return;

    const { data, resolve, reject } = this.queue.shift();
    free.busy = true;
    free.current = { resolve, reject };
    free.postMessage(data);
  }

  async execute(data) {
    return new Promise((resolve, reject) => {
      this.queue.push({ data, resolve, reject });
      this._processQueue();
    });
  }

  terminate() {
    this.workers.forEach(w => w.terminate());
  }
}

// Usage
const pool = new SimpleWorkerPool('./worker.js', 4);
const result = await pool.execute({ heavy: 'computation' });
pool.terminate();
```

---

## 7️⃣ Worker Thread Script Template

```javascript
// worker.js
const { parentPort, workerData } = require('worker_threads');

parentPort.on('message', async (msg) => {
  try {
    let result;
    
    if (msg.task === 'fibonacci') {
      result = fibonacci(msg.n);
    } else if (msg.task === 'process-image') {
      result = await processImage(msg.buffer);
    }

    parentPort.postMessage({ success: true, result });
  } catch (error) {
    parentPort.postMessage({ 
      success: false, 
      error: error.message 
    });
  }
});

function fibonacci(n) {
  if (n <= 1) return n;
  return fibonacci(n - 1) + fibonacci(n - 2);
}

async function processImage(buffer) {
  // CPU-intensive work here
  return buffer.length * 2;
}
```

---

## 8️⃣ Error Handling Pattern

```javascript
// ✅ Pattern: Always wrap in try-catch
class SafeIPC {
  static async invoke(method, ...args) {
    try {
      return await window.electronAPI[method](...args);
    } catch (error) {
      console.error(`IPC ${method} failed:`, error);
      return { error: error.message };
    }
  }

  static on(event, callback) {
    window.electronAPI[`on${event}`]((data) => {
      try {
        callback(data);
      } catch (error) {
        console.error(`Callback ${event} failed:`, error);
      }
    });
  }
}

// Usage
const result = await SafeIPC.invoke('readFile', path);
if (result.error) {
  showError(result.error);
}
```

---

## 9️⃣ Timeout Pattern

```javascript
// Add timeout to any async operation
function withTimeout(promise, ms = 5000) {
  return Promise.race([
    promise,
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error('Timeout')), ms)
    )
  ]);
}

// Usage
try {
  const data = await withTimeout(
    window.electronAPI.fetchData(),
    3000
  );
} catch (error) {
  if (error.message === 'Timeout') {
    showError('Request took too long');
  } else {
    showError(error.message);
  }
}
```

---

## 🔟 Debounce for Rapid Events

```javascript
// Don't overwhelm IPC with rapid messages
function debounce(fn, delay = 300) {
  let timeout;
  return function (...args) {
    clearTimeout(timeout);
    timeout = setTimeout(() => fn(...args), delay);
  };
}

// Usage: File watcher events
const debouncedSave = debounce((content) => {
  window.electronAPI.saveFile(currentFile, content);
}, 1000);

editor.addEventListener('input', (e) => {
  debouncedSave(e.target.value);
});
```

---

## 1️⃣1️⃣ Retry Pattern

```javascript
async function retry(fn, maxAttempts = 3, delayMs = 1000) {
  let lastError;
  
  for (let i = 0; i < maxAttempts; i++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (i < maxAttempts - 1) {
        await new Promise(r => setTimeout(r, delayMs * Math.pow(2, i)));
      }
    }
  }
  
  throw lastError;
}

// Usage
const data = await retry(
  () => window.electronAPI.fetchData(id),
  3,
  500
);
```

---

## 1️⃣2️⃣ Batch Messages

```javascript
class BatchSender {
  constructor(send, batchSize = 50, delayMs = 100) {
    this.send = send;
    this.batch = [];
    this.batchSize = batchSize;
    this.delayMs = delayMs;
  }

  add(item) {
    this.batch.push(item);
    if (this.batch.length >= this.batchSize) {
      this.flush();
    }
  }

  flush() {
    if (this.batch.length === 0) return;
    const items = this.batch.splice(0);
    this.send(items);
  }
}

// Usage
const batcher = new BatchSender(
  (items) => window.electronAPI.saveItems(items),
  50,
  200
);

// Add items and they'll batch automatically
array.forEach(item => batcher.add(item));
setTimeout(() => batcher.flush(), 5000); // Final flush
```

---

## 1️⃣3️⃣ Progress Tracking

```javascript
class ProgressTracker {
  constructor(onProgress) {
    this.onProgress = onProgress;
    this.total = 0;
    this.completed = 0;
  }

  setTotal(n) {
    this.total = n;
  }

  tick() {
    this.completed++;
    this.onProgress({
      completed: this.completed,
      total: this.total,
      percent: Math.round((this.completed / this.total) * 100)
    });
  }
}

// Usage
const tracker = new ProgressTracker((progress) => {
  updateProgressBar(progress.percent);
});

tracker.setTotal(100);
for (let i = 0; i < 100; i++) {
  processItem(items[i]);
  tracker.tick();
}
```

---

## 1️⃣4️⃣ Resource Cleanup Pattern

```javascript
class ManagedResource {
  constructor() {
    this.resources = [];
  }

  add(resource) {
    this.resources.push(resource);
    return resource;
  }

  async cleanup() {
    for (const resource of this.resources) {
      try {
        if (resource.close) await resource.close();
        if (resource.terminate) await resource.terminate();
      } catch (error) {
        console.error('Cleanup failed:', error);
      }
    }
    this.resources = [];
  }
}

// Usage
const manager = new ManagedResource();
const worker = manager.add(new Worker('./worker.js'));
const port = manager.add(await window.electronAPI.getPort());

// Later...
await manager.cleanup(); // Cleans everything
```

---

## 1️⃣5️⃣ TypeScript Types

```typescript
// types/electronAPI.ts
export interface IElectronAPI {
  readFile(path: string): Promise<string>;
  writeFile(path: string, content: string): Promise<void>;
  onFileChanged(callback: (info: FileInfo) => void): () => void;
}

export interface FileInfo {
  path: string;
  timestamp: number;
  size: number;
}

// Augment global Window interface
declare global {
  interface Window {
    electronAPI: IElectronAPI;
  }
}

// Usage
const content: string = await window.electronAPI.readFile('/path');
const unsubscribe = window.electronAPI.onFileChanged((info: FileInfo) => {
  console.log(info.path);
});
```

---

## 🆘 Common Issues & Fixes

| Issue | Cause | Fix |
|-------|-------|-----|
| "API undefined" | Preload not loaded | Check webPreferences.preload path |
| Messages not received | Wrong IPC channel name | Match channel names exactly |
| Memory leak | Not closing connections | Call `.close()` or `.terminate()` |
| Slow IPC | Too many messages | Batch, debounce, or use message ports |
| Serialization error | Non-serializable object | Convert to JSON-safe format |
| Worker crash | Unhandled error | Add try-catch in worker |
| Timeout issues | Too much work in main | Move to worker or use streams |
| Security vulnerability | Direct ipcRenderer exposure | Wrap all methods with validation |

---

## 📊 Performance Checklist

- ✅ Use async/await, never sync IPC
- ✅ Batch messages when sending many
- ✅ Use message ports for frequent communication
- ✅ Move CPU work to worker threads
- ✅ Stream large data instead of buffering
- ✅ Debounce rapid events
- ✅ Add request timeouts
- ✅ Monitor message latency
- ✅ Clean up resources (close ports, terminate workers)
- ✅ Validate all inputs at boundaries

---

## 🔒 Security Checklist

- ✅ Enable context isolation
- ✅ Never expose full ipcRenderer
- ✅ Validate inputs in preload
- ✅ Validate inputs in main process
- ✅ Use HTTPS-like custom protocols
- ✅ Implement proper error messages (no leaking internals)
- ✅ Use environment variables for secrets
- ✅ Restrict file access to safe directories
- ✅ Don't pass arbitrary commands to shell
- ✅ Review all exposed APIs regularly

