# Target Environment Tooling: Complete Learning Guide

**How to enforce architectural boundaries at build time using static analysis.**

---

## The Problem: Accidental Node.js Usage in Sandbox Code

```javascript
// ❌ This works fine in development...
// src/browser-utils.ts (supposed to run in browser/sandbox)

export function processFile(data: string) {
  // Later, someone adds this:
  const fs = require('fs');
  fs.writeFileSync('/tmp/output.txt', data);
  // ✅ Works locally with Node.js

  return data;
}

// But when sandboxing is enabled in production:
// ❌ CRASH: Cannot find module 'fs'
// ❌ User sees broken feature
// ❌ No warning during development
```

### The Solution: Target Environments

VS Code defines explicit target environments and enforces them at **build time**:

```
┌──────────────────┐
│  Target Env: web │ → No Node.js allowed
├──────────────────┤
│ Can use:         │
│ • DOM APIs       │
│ • fetch()        │
│ • localStorage   │
│ • Workers        │
│ • Web standards  │
│                  │
│ Cannot use:      │
│ • require()      │
│ • Buffer         │
│ • fs, path, os   │
└──────────────────┘

┌────────────────────────┐
│ Target Env: node       │ → Full Node.js allowed
├────────────────────────┤
│ Can use:               │
│ • Everything web has   │
│ • fs.readFile()        │
│ • child_process.exec() │
│ • require() any module │
│ • Buffer, Buffer.from()│
│ • Streams, Promises    │
└────────────────────────┘

┌─────────────────────────────────┐
│ Target Env: electron-sandbox    │ → No Node.js allowed
├─────────────────────────────────┤
│ Can use:                        │
│ • Everything web has            │
│ • Electron IPC APIs             │
│ • contextBridge (from preload)  │
│                                 │
│ Cannot use:                     │
│ • require() (except in preload) │
│ • Node.js modules               │
│ • Direct file system access     │
└─────────────────────────────────┘
```

---

## Prerequisites & Concepts

### 1. Static Analysis Basics

```javascript
// Static analysis = analyzing code WITHOUT running it
// Used to find bugs, enforce rules, optimize

// Example: Find all Node.js API calls
const esprima = require('esprima'); // AST parser

const code = `
const fs = require('fs');
const data = fs.readFileSync('./file.txt');
`;

const ast = esprima.parse(code);
// AST (Abstract Syntax Tree) represents code structure
// We can traverse it to find require() calls, Buffer usage, etc.
```

### 2. Understanding AST (Abstract Syntax Tree)

```javascript
// Code:
const x = require('fs');

// Becomes AST (tree structure):
{
  type: 'Program',
  body: [{
    type: 'VariableDeclaration',
    declarations: [{
      type: 'VariableDeclarator',
      id: { type: 'Identifier', name: 'x' },
      init: {
        type: 'CallExpression',
        callee: { 
          type: 'Identifier', 
          name: 'require'  // ← Can detect this!
        },
        arguments: [{
          type: 'Literal',
          value: 'fs'     // ← And this!
        }]
      }
    }]
  }]
}
```

### 3. ESLint & Custom Rules

```javascript
// ESLint uses AST analysis with custom rules
// VS Code created rules for each target environment

// Example ESLint custom rule:
module.exports = {
  rules: {
    'no-nodejs-in-browser': {
      create(context) {
        return {
          // Check all require() calls
          CallExpression(node) {
            if (node.callee.name === 'require') {
              const module = node.arguments[0]?.value;
              
              if (isNodeModule(module)) {
                context.report({
                  node,
                  message: `Cannot use require('${module}') in browser target`
                });
              }
            }
          }
        };
      }
    }
  }
};
```

---

## Implementation Strategy

### Strategy 1: Target Environment with ESLint

```javascript
// ============================================
// Define target environments and ESLint rules
// ============================================

// .eslintrc.json
{
  "env": {
    "browser": true,
    "node": false,
    "es2020": true
  },
  "rules": {
    "no-restricted-globals": [
      "error",
      {
        "name": "require",
        "message": "Cannot use require() in browser. Use import instead."
      },
      {
        "name": "Buffer",
        "message": "Cannot use Buffer in browser. Use Uint8Array instead."
      }
    ],
    "no-restricted-modules": [
      "error",
      "fs",
      "path",
      "os",
      "child_process",
      "http",
      "https",
      "net",
      "stream",
      "crypto"
    ]
  }
}

// Package.json with per-directory rules
{
  "eslintConfig": {
    "overrides": [
      {
        "files": ["src/**/*.ts"],
        "rules": {
          "no-restricted-globals": "off",  // Node.js allowed
          "no-restricted-modules": "off"
        }
      },
      {
        "files": ["src/browser/**/*.ts"],
        "rules": {
          "no-restricted-globals": ["error", "require", "Buffer"],
          "no-restricted-modules": ["error", "fs", "path", "os"]
        }
      }
    ]
  }
}
```

### Strategy 2: TypeScript Path Aliases for Environments

```typescript
// ============================================
// Use TypeScript paths to enforce environments
// ============================================

// tsconfig.json
{
  "compilerOptions": {
    "baseUrl": ".",
    "paths": {
      // Web/sandbox APIs
      "@common/*": ["src/common/*"],
      "@browser/*": ["src/browser/*"],
      "@sandbox/*": ["src/sandbox/*"],
      
      // Node.js APIs
      "@node/*": ["src/node/*"],
      "@main/*": ["src/main/*"],
      
      // Never use Node.js from browser code!
      "@node/*": ["src/node/*"]
    }
  }
}

// Build configuration
{
  "overrides": [
    {
      "files": ["src/browser/**/*.ts"],
      "rules": {
        // Cannot import from @node directory
        "import/no-restricted-paths": [
          "error",
          {
            "zones": [
              {
                "target": "src/browser",
                "from": "src/node",
                "message": "Cannot import Node.js modules from browser code"
              }
            ]
          }
        ]
      }
    }
  ]
}
```

### Strategy 3: Custom Build-Time Validator

```javascript
// ============================================
// Custom tool to validate target environments
// ============================================

const fs = require('fs');
const path = require('path');
const ts = require('typescript');

class TargetEnvironmentValidator {
  constructor(targetEnv) {
    this.targetEnv = targetEnv; // 'web', 'node', 'electron-sandbox'
    this.forbiddenAPIs = this.getForbiddenAPIs();
    this.errors = [];
  }

  getForbiddenAPIs() {
    const allForbidden = {
      // Modules that don't exist in browser/sandbox
      'fs': ['readFile', 'writeFile', 'readFileSync', 'writeFileSync'],
      'path': ['resolve', 'join', 'dirname'],
      'os': ['platform', 'homedir', 'tmpdir'],
      'child_process': ['exec', 'spawn', 'execSync'],
      'http': true,
      'https': true,
      'net': true,
      'stream': true,
      'buffer': ['Buffer', 'BufferFrom']
    };

    if (this.targetEnv === 'web') {
      // Web can't use any Node.js APIs
      return allForbidden;
    } else if (this.targetEnv === 'electron-sandbox') {
      // Sandbox can't use modules but preload can
      return allForbidden;
    } else {
      // Node.js target - allow everything
      return {};
    }
  }

  validateFile(filepath) {
    const source = fs.readFileSync(filepath, 'utf-8');
    const sourceFile = ts.createSourceFile(
      filepath,
      source,
      ts.ScriptTarget.Latest
    );

    this.checkNode(sourceFile, filepath);
    return this.errors;
  }

  checkNode(node, filepath) {
    // Check require() calls
    if (node.kind === ts.SyntaxKind.CallExpression) {
      const call = node;
      if (call.expression.text === 'require' && call.arguments.length > 0) {
        const moduleName = call.arguments[0].text;
        if (this.forbiddenAPIs[moduleName]) {
          this.errors.push({
            file: filepath,
            line: this.getLineNumber(call),
            message: `Cannot require('${moduleName}') in ${this.targetEnv} target`
          });
        }
      }
    }

    // Check Buffer usage
    if (node.kind === ts.SyntaxKind.Identifier) {
      if (node.text === 'Buffer' && this.forbiddenAPIs.buffer) {
        this.errors.push({
          file: filepath,
          line: this.getLineNumber(node),
          message: `Cannot use Buffer in ${this.targetEnv} target. Use Uint8Array instead.`
        });
      }
    }

    ts.forEachChild(node, (child) => this.checkNode(child, filepath));
  }

  getLineNumber(node) {
    const source = node.getSourceFile();
    return source.getLineAndCharacterOfPosition(node.getStart()).line + 1;
  }
}

// Usage
const validator = new TargetEnvironmentValidator('web');
const errors = validator.validateFile('./src/browser/utils.ts');

if (errors.length > 0) {
  console.error('Target environment violations:');
  errors.forEach(err => {
    console.error(`${err.file}:${err.line} - ${err.message}`);
  });
  process.exit(1);
}
```

### Strategy 4: VS Code Style Target Environment System

```javascript
// ============================================
// Replicating VS Code's approach
// ============================================

class TargetEnvironmentSystem {
  static ENVIRONMENTS = {
    'browser': {
      description: 'Web browser environments',
      forbidden: ['fs', 'path', 'os', 'child_process', 'Buffer'],
      allowed: ['DOM', 'fetch', 'Worker']
    },
    'node': {
      description: 'Node.js environments',
      forbidden: [],
      allowed: ['everything']
    },
    'webworker': {
      description: 'Web Worker',
      forbidden: ['DOM', 'localStorage', 'fs', 'require'],
      allowed: ['Worker API']
    },
    'electron-sandbox': {
      description: 'Electron sandboxed renderer',
      forbidden: ['require', 'Buffer', 'fs', 'path', 'child_process'],
      allowed: ['IPC', 'contextBridge (from preload)']
    },
    'electron-main': {
      description: 'Electron main process',
      forbidden: [],
      allowed: ['everything']
    }
  };

  constructor(targetEnv) {
    if (!this.constructor.ENVIRONMENTS[targetEnv]) {
      throw new Error(`Unknown target environment: ${targetEnv}`);
    }
    this.targetEnv = targetEnv;
  }

  checkImport(moduleName) {
    const forbidden = this.constructor.ENVIRONMENTS[this.targetEnv].forbidden;
    return !forbidden.includes(moduleName);
  }

  checkGlobal(globalName) {
    const forbidden = this.constructor.ENVIRONMENTS[this.targetEnv].forbidden;
    return !forbidden.includes(globalName);
  }

  generateESLintConfig() {
    const forbidden = this.constructor.ENVIRONMENTS[this.targetEnv].forbidden;

    return {
      env: {
        browser: this.targetEnv.includes('browser') || this.targetEnv.includes('electron'),
        node: this.targetEnv === 'node' || this.targetEnv === 'electron-main',
        worker: this.targetEnv === 'webworker'
      },
      rules: {
        'no-restricted-globals': ['error', ...forbidden],
        'no-restricted-modules': ['error', ...forbidden]
      }
    };
  }

  getDocumentation() {
    const env = this.constructor.ENVIRONMENTS[this.targetEnv];
    return `
Target Environment: ${this.targetEnv}
${env.description}

✅ Allowed:
${env.allowed.map(a => `  - ${a}`).join('\n')}

❌ Forbidden:
${env.forbidden.map(f => `  - ${f}`).join('\n')}
    `;
  }
}

// Usage
const validator = new TargetEnvironmentSystem('electron-sandbox');
console.log(validator.getDocumentation());
console.log(validator.generateESLintConfig());

// In build process
if (!validator.checkImport('fs')) {
  throw new Error('fs module not allowed in ' + validator.targetEnv);
}
```

---

## Real-World Applications

### Application 1: Monorepo with Multiple Targets

```javascript
// ============================================
// Managing code for different environments
// ============================================

// Project structure:
// src/
//   common/          → Works in all environments
//     utils.ts      (no Node.js, no DOM)
//     types.ts
//   browser/        → Only browser/web
//     ui.ts         (can use DOM, fetch)
//   node/           → Only Node.js
//     server.ts     (can use fs, network)
//   electron/
//     main/         → Main process (Node.js)
//     sandbox/      → Renderer (sandboxed)

// ESLint configuration (.eslintrc.json)
{
  "overrides": [
    {
      "files": ["src/common/**/*.ts"],
      "rules": {
        "no-restricted-globals": ["error", "Buffer", "require"],
        "no-restricted-modules": ["error", "fs", "path", "os"]
      }
    },
    {
      "files": ["src/browser/**/*.ts"],
      "rules": {
        "no-restricted-globals": ["error", "Buffer", "require"],
        "no-restricted-modules": ["error", "fs", "path", "os"]
      }
    },
    {
      "files": ["src/node/**/*.ts"],
      "rules": {
        "no-restricted-globals": "off",
        "no-restricted-modules": "off"
      }
    },
    {
      "files": ["src/electron/main/**/*.ts"],
      "rules": {
        "no-restricted-globals": "off",
        "no-restricted-modules": "off"
      }
    },
    {
      "files": ["src/electron/sandbox/**/*.ts"],
      "rules": {
        "no-restricted-globals": ["error", "Buffer"],
        "no-restricted-modules": ["error", "fs", "path", "os", "require"]
      }
    }
  ]
}

// TypeScript paths (tsconfig.json)
{
  "compilerOptions": {
    "paths": {
      "@common/*": ["src/common/*"],
      "@browser/*": ["src/browser/*"],
      "@node/*": ["src/node/*"],
      "@electron-main/*": ["src/electron/main/*"],
      "@electron-sandbox/*": ["src/electron/sandbox/*"]
    }
  }
}

// Usage in code
// In src/electron/sandbox/ui.ts:
import { parseData } from '@common/utils';    // ✅ OK
import { createWindow } from '@node/server';  // ❌ ERROR at lint time!
```

### Application 2: Build-Time Target Validation

```javascript
// ============================================
// Automated target environment validation
// ============================================

// build/validate-targets.js
const fs = require('fs');
const path = require('path');
const { createProgram, SyntaxKind } = require('typescript');

class BuildValidator {
  constructor() {
    this.violations = [];
  }

  validateProject() {
    // Load all TypeScript files
    const files = this.getAllTSFiles('./src');

    // Determine target for each file
    for (const file of files) {
      const target = this.determineTarget(file);
      const violations = this.validateFileForTarget(file, target);
      this.violations.push(...violations);
    }

    return this.violations;
  }

  determineTarget(filepath) {
    if (filepath.includes('/browser/')) return 'browser';
    if (filepath.includes('/node/')) return 'node';
    if (filepath.includes('/electron/sandbox/')) return 'electron-sandbox';
    if (filepath.includes('/electron/main/')) return 'electron-main';
    if (filepath.includes('/common/')) return 'common';
    return 'unknown';
  }

  validateFileForTarget(filepath, target) {
    const violations = [];
    const content = fs.readFileSync(filepath, 'utf-8');
    
    const forbiddenRules = {
      'browser': ['require', 'Buffer', 'fs', 'path', 'os'],
      'electron-sandbox': ['require', 'Buffer', 'fs', 'path', 'os'],
      'common': ['Buffer', 'require']
    };

    const forbidden = forbiddenRules[target] || [];

    for (const api of forbidden) {
      // Check for require('...')
      if (api === 'require') {
        const requireRegex = /require\s*\(\s*['"`][\w-./]+['"`]\s*\)/g;
        let match;
        while ((match = requireRegex.exec(content)) !== null) {
          violations.push({
            file: filepath,
            target,
            api: 'require',
            position: match.index,
            severity: 'error'
          });
        }
      }

      // Check for Buffer usage
      if (api === 'Buffer') {
        const bufferRegex = /\bBuffer\s*\./g;
        let match;
        while ((match = bufferRegex.exec(content)) !== null) {
          violations.push({
            file: filepath,
            target,
            api: 'Buffer',
            position: match.index,
            severity: 'error'
          });
        }
      }
    }

    return violations;
  }

  getAllTSFiles(dir) {
    const files = [];
    const entries = fs.readdirSync(dir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        files.push(...this.getAllTSFiles(fullPath));
      } else if (entry.name.endsWith('.ts') || entry.name.endsWith('.tsx')) {
        files.push(fullPath);
      }
    }

    return files;
  }

  reportViolations() {
    if (this.violations.length === 0) {
      console.log('✅ All files comply with target environment rules');
      return true;
    }

    console.error('❌ Target environment violations found:\n');
    const grouped = this.groupByFile();

    for (const [file, viols] of Object.entries(grouped)) {
      console.error(`${file}:`);
      viols.forEach(v => {
        console.error(`  ${v.target} target: ${v.api} not allowed`);
      });
    }

    return false;
  }

  groupByFile() {
    const grouped = {};
    for (const v of this.violations) {
      if (!grouped[v.file]) grouped[v.file] = [];
      grouped[v.file].push(v);
    }
    return grouped;
  }
}

// Run in build script
const validator = new BuildValidator();
const violations = validator.validateProject();
const success = validator.reportViolations();

if (!success) {
  process.exit(1);
}
```

---

## Anti-Patterns & Pitfalls

### ❌ Anti-Pattern 1: Not Defining Clear Targets

```javascript
// ❌ BAD: No clear target environments
// Developers don't know which APIs are safe
// Violations discovered only at runtime

// ✅ GOOD: Document all targets
const TARGETS = {
  'web': { allowNode: false, allowDOM: true },
  'node': { allowNode: true, allowDOM: false },
  'electron-sandbox': { allowNode: false, allowDOM: true, allowIPC: true },
  'electron-main': { allowNode: true, allowDOM: false }
};

// Every file should specify its target:
// at the top of file:
// @target web
// @target electron-sandbox
```

### ❌ Anti-Pattern 2: Skipping Validation in Development

```javascript
// ❌ BAD: Only lint in CI
// Developers discover issues after pushing

// ✅ GOOD: Lint at every stage
// Pre-commit hook
// npm run validate:targets

// Watch mode during development
// npm run watch:lint

// CI validation
// npm run validate
```

### ❌ Anti-Pattern 3: Not Using Type Guards

```javascript
// ❌ BAD: Assume environment at runtime
async function loadData() {
  const fs = require('fs'); // Might fail in browser!
  return fs.readFileSync(path);
}

// ✅ GOOD: Conditional imports and type guards
async function loadData(useFS?: boolean) {
  if (typeof require === 'function' && useFS) {
    const fs = require('fs');
    return fs.readFileSync(path);
  } else {
    return fetch(url);
  }
}

// Or better: create adapters
class FileLoader {
  constructor(backend: 'fs' | 'fetch') {
    this.backend = backend;
  }

  async load(path: string) {
    if (this.backend === 'fs') {
      return require('fs').readFileSync(path);
    } else {
      return fetch(path).then(r => r.text());
    }
  }
}
```

### ❌ Anti-Pattern 4: Conditional requires in Production Code

```javascript
// ❌ BAD: Makes code hard to analyze
let fs;
try {
  fs = require('fs'); // Only works in Node.js
} catch {
  fs = null;
}

// Linters can't track this easily
if (fs) {
  fs.readFile(path); // Is this safe?
}

// ✅ GOOD: Clear separation
// File: src/node/file-utils.ts (Node.js only)
export function readFile(path) {
  const fs = require('fs');
  return fs.readFileSync(path);
}

// File: src/browser/file-utils.ts (Browser only)
export async function readFile(path) {
  const response = await fetch(path);
  return response.text();
}
```

---

## Best Practices

### Checklist for Target Environment Tooling

```javascript
const targetEnvironmentChecklist = [
  '[] All target environments documented',
  '[] ESLint rules configured per target',
  '[] TypeScript path aliases set up',
  '[] Build validation runs before publishing',
  '[] CI fails on environment violations',
  '[] Developers see lint errors in IDE',
  '[] Error messages guide developers to solution',
  '[] Examples of correct patterns documented',
  '[] Cross-target imports prevented',
  '[] Clear separation of concerns by directory',
  '[] Pre-commit hooks validate targets'
];
```

### Key Principles

1. **Fail Early**: Catch issues at development time, not runtime
2. **Be Explicit**: Require developers to declare target
3. **Prevent Imports**: Use paths/linting to block cross-target imports
4. **Document**: Make it obvious what's allowed in each target
5. **Validate**: Run checks at every stage (dev, pre-commit, CI)

