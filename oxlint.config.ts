import { defineConfig } from "oxlint";

/**
 * Oxlint Configuration for ScaleForge-v2
 * =====================================
 * Comprehensive rule set focused on:
 * - Bug prevention (correctness rules as errors)
 * - Developer experience (fixable rules & auto-formatting)
 * - Code quality & maintainability (best practices)
 * - Performance optimizations
 *
 * Rules are categorized by severity:
 * - error: Catch real bugs, prevent runtime issues
 * - warn: Best practices, code quality improvements (fixable)
 *
 * DX Benefits:
 * - Most rules are auto-fixable (marked with 🛠️)
 * - Catches async/promise bugs early (floating promises)
 * - Enforces type safety patterns
 * - Reduces time spent debugging logic errors
 */

export default defineConfig({
  // Loaded plugins:
  // - typescript: Type-aware linting, async/promise safety
  // - unicorn: Best practices, code quality
  // - import: Import/export organization & organization
  // - security: Security vulnerabilities & dangerous patterns
  // - node: Node.js best practices & APIs
  // - regexp: Regular expression safety
  // - oxc: Core Oxlint rules (always included)
  plugins: ["typescript", "unicorn", "import", "node"],

  // Bun runs as a Node.js-compatible runtime with browser globals (fetch, etc.)
  env: {
    node: true, // Declares: process, console, Buffer, __dirname, __filename, etc.
  },

  // Bun provides fetch globally (like browsers / Node 18+)
  globals: {
    AbortController: "readonly",
    FormData: "readonly",
    Headers: "readonly",
    Request: "readonly",
    Response: "readonly",
    fetch: "readonly",
  },

  rules: {
    // ====== CORRECTNESS RULES (ERROR) ======
    // These catch real bugs and runtime errors - critical for production code

    // Promise & async/await issues - critical for async code safety
    // Auto-fixable: yes | Severity: error
    "typescript/no-floating-promises": ["error", { ignoreVoid: true }],
    "typescript/no-misused-promises": "error",
    "no-await-in-promise-methods": "error",
    "no-single-promise-in-promise-methods": "warn",

    // Type safety - prevent unsafe type assertions
    // Saves hours of debugging type-related issues
    "no-non-null-asserted-optional-chain": "error",
    "no-duplicate-type-constituents": "error",
    "no-meaningless-void-operator": "error",
    "no-misused-spread": "error",
    "no-wrapper-object-types": "error",
    "typescript/await-thenable": "error",

    // Variable & scope safety
    // Catches unused variables and undeclared references
    "no-unused-vars": "error",
    "no-unused-labels": "error",
    "no-undef": "error",
    "no-empty": "warn",
    "no-empty-static-block": "warn",

    // Control flow assertions
    // Prevents infinite loops and unreachable code
    "for-direction": "error",
    "no-iterator": "warn",
    "no-throw-literal": "warn",
    "no-unreachable": "error",

    // Comparison & logic safety
    // Catches subtle comparison bugs (-0, NaN, etc.)
    "double-comparisons": "error",
    "no-compare-neg-zero": "error",
    "use-isnan": "error",
    eqeqeq: "error",
    "no-unsafe-negation": "error",

    // Code correctness
    // Fixes syntax and structural issues
    "no-extra-semi": "error",
    "no-extra-boolean-cast": "error",
    "no-nonoctal-decimal-escape": "error",
    "no-debugger": "warn",
    "no-useless-escape": "error",
    "no-useless-rename": "error",
    "no-useless-fallback-in-spread": "error",
    "no-useless-spread": "error",
    "no-useless-empty-export": "error",

    // Array & object safety
    // Prevents mutating operations that create bugs
    "no-array-delete": "warn",
    "no-array-reverse": "warn",
    "no-array-sort": "warn",

    // Performance & logic
    // Removes dead code and unnecessary operations
    "no-unnecessary-await": "error",
    "only-used-in-recursion": "warn",
    "prefer-as-const": "error",
    "prefer-namespace-keyword": "error",
    "prefer-set-size": "error",
    "prefer-string-starts-ends-with": "error",
    "erasing-op": "warn",

    // ====== BEST PRACTICES & DX (WARN/AUTO-FIX) ======
    // Fixable rules that improve code quality and maintainability
    // These are warnings, not errors, allowing flexibility during development
    // Most are auto-fixable for rapid bug fixing

    // TypeScript best practices
    // Improves type safety and prevents common TypeScript pitfalls
    "no-explicit-any": "warn",
    "array-type": "warn",
    "consistent-type-imports": "warn",
    "consistent-type-definitions": "warn",
    "prefer-nullish-coalescing": "warn",
    "prefer-optional-chain": "warn",
    "no-unnecessary-type-arguments": "warn",
    "no-unnecessary-type-assertion": "warn",
    "prefer-reduce-type-parameter": "warn",
    "prefer-return-this-type": "warn",
    "promise-function-async": "warn",
    "non-nullable-type-assertion-style": "warn",
    "ban-ts-comment": "warn",
    "ban-tslint-comment": "warn",

    // Code style & consistency (auto-fixable)
    // Improves code readability and consistency
    "arrow-body-style": "warn",
    curly: "warn",
    "object-shorthand": "warn",
    "prefer-const": "warn",
    "prefer-destructuring": "warn",
    "prefer-template": "warn",
    "prefer-exponentiation-operator": "warn",
    "prefer-object-spread": "warn",
    "prefer-object-has-own": "warn",

    // Consistency & readability
    // Simplifies logic and improves code clarity
    "no-nested-ternary": "warn",
    "no-unneeded-ternary": "warn",
    "no-implicit-coercion": "warn",
    "operator-assignment": "warn",
    "no-extra-label": "warn",
    "no-eq-null": "warn",

    // Variable & naming clarity
    // Prevents scope pollution and improves variable usage
    "no-var": "warn",
    "no-shadow": "warn",
    "no-console-spaces": "warn",
    "capitalize-comments": "warn",

    // String & number optimization
    // Modern JavaScript patterns for better performance
    "prefer-string-replace-all": "warn",
    "prefer-string-slice": "warn",
    "prefer-string-trim-start-end": "warn",
    "no-zero-fractions": "warn",
    "numeric-separators-style": "warn",
    "number-literal-case": "warn",

    // Array & collection methods
    // Modern array methods for cleaner code
    "prefer-array-flat": "warn",
    "prefer-array-flat-map": "warn",
    "prefer-array-some": "warn",
    "no-length-as-slice-end": "warn",
    "prefer-at": "warn",

    // Escape sequences and patterns
    // Enforces proper escaping for readability
    "escape-case": "warn",
    "no-hex-escape": "warn",
    "no-regex-spaces": "warn",

    // Object & DOM operations
    // Helps prevent common object/DOM pitfalls
    "consistent-generic-constructors": "warn",
    "consistent-indexed-object-style": "warn",
    "no-instanceof-array": "warn",
    "no-new-wrappers": "warn",
    "no-new-buffer": "warn",

    // Function quality
    // Improves function declarations and usage
    "prefer-function-type": "warn",
    "no-useless-constructor": "warn",
    "switch-case-braces": "warn",

    // Modern JavaScript patterns
    // Encourages latest ECMAScript features
    "prefer-node-protocol": "warn",
    "prefer-number-properties": "warn",
    "require-module-specifiers": "warn",
    "require-array-join-separator": "warn",

    // Control flow clarity
    // Simplifies conditional logic
    "no-else-return": "warn",
    "no-new-statics": "warn",
    "throw-new-error": "warn",
    "preserve-caught-error": "warn",

    // Import & export consistency
    "sort-imports": "warn",
    "sort-keys": "warn",
    "no-import-type-side-effects": "warn",

    // NOTE: oxlint has `no-restricted-imports` which prevents importing specific
    // modules by *name* (e.g. ban importing 'lodash'). That is a different use case
    // from eslint-plugin-import's `no-restricted-paths`, which enforces *directory-level
    // boundaries* (e.g. "features/ must not import from runtime/") using file-path
    // patterns. oxlint does not yet have an equivalent for path-based restrictions.
    //
    // TODO(oxlint-future): When oxlint ships path-pattern-based import restriction
    // (tracked at https://github.com/oxc-project/oxc/issues — search "no-restricted-paths"),
    // replace scripts/check-layers.ts with a native oxlint rule here.
    // Until then, layer boundary enforcement is handled by `bun run check:layers`.
    "no-restricted-imports": "warn",

    // Misc cleanup & formatting
    "no-useless-computed-key": "warn",
    "no-useless-promise-resolve-reject": "warn",
    "no-typeof-undefined": "warn",
    "empty-brace-spaces": "warn",

    // ====== CODE FORMATTING & CONSISTENCY ======
    // Enforce consistent style across the codebase
    // Let Prettier handle quotes, semi-colons, and line width

    "no-console": "warn", // Promoted to "error" inside src/ via overrides below
    "no-multiple-empty-lines": "warn",
    "no-trailing-spaces": "warn",
    "eol-last": "warn",

    // ====== RESTRICTIONS (INFO) ======
    // Low-severity restrictions to prevent problematic patterns

    "no-div-regex": "warn",
    "bad-bitwise-operator": "warn",

    // ====== SECURITY RULES (ERROR) ======
    // Critical for authentication service - prevents security vulnerabilities
    // Source: security plugin

    // Dangerous patterns in crypto/auth code
    "no-hardcoded-credentials": "error",
    "no-eval": "error",
    "no-implied-eval": "error",
    "no-function-constructor-with-string-args": "error",
    "no-dynamic-require": "warn", // Consider dynamic requires carefully

    // Protected against injection attacks
    "no-unsanitized-method-override": "warn",

    // ====== NODE.JS BEST PRACTICES (WARN) ======
    // Node.js/Express specific patterns for better performance & safety
    // Source: node plugin

    // File system & system safety
    "no-sync": "warn", // Prefer async operations
    "no-path-concat": "warn", // Use path.join() instead
    "no-process-exit": "warn", // Graceful shutdown instead
    "no-deprecated-api": "warn", // Use modern Node APIs

    // Process & environment safety
    "prefer-promises-reject-errors": "warn", // Consistent error handling
    "handle-callback-err": "warn", // Check for errors in callbacks
    "no-callback-literal": "warn", // Pass Error objects, not strings

    // ====== UNICORN - CODE QUALITY & DX (WARN) ======
    // Best practices from the unicorn plugin - improves readability & performance
    // Source: unicorn plugin

    // Error handling & clarity
    "custom-error-definition": "warn",
    "error-message": "warn",
    // "no-process-exit": "warn",

    // Code clarity & idioms
    "filename-case": "warn", // Enforce consistent filename case
    "no-null": "warn", // Prefer undefined over null
    "no-useless-undefined": "warn", // Avoid redundant undefined
    "prefer-ternary": "warn", // Encourage ternary for simple conditions
    "prefer-switch": "warn", // Use switch for multiple conditions
    "prefer-top-level-await": "warn", // Top-level await in modules

    // Loop & iteration idioms
    "no-for-loop": "warn", // Prefer array methods
    "no-reduce": "warn", // Reduce can be opaque; consider alternatives
    "prefer-map-flat": "warn", // Cleaner chaining

    // ====== IMPORT PLUGIN (WARN) ======
    // Organize and validate imports for better maintainability
    // Source: import plugin

    "no-unresolved": "warn", // Catch import errors
    "no-unused-modules": "warn", // Remove dead exports
    "no-import-cycle": "warn", // Prevent circular dependencies
    "no-self-import": "warn", // Prevent self-imports
    "no-relative-packages": "warn", // Use proper package structure
    "no-absolute-path": "warn", // Avoid absolute paths in requires
    "no-mutable-exports": "warn", // Prevent mutable exports
    "consistent-default-export-name": "warn", // Match export names

    // ====== REGEXP PLUGIN (WARN) ======
    // Regular expression safety & clarity
    // Source: regexp plugin

    "no-zero-quantifier": "error", // Catches impossible regexes
    "no-empty-character-class": "error", // Empty [] matches nothing
    "no-empty-alternative": "warn", // Useless alternatives in regex
    "prefer-character-class": "warn", // Cleaner regex patterns
    "prefer-escape-replacement-dollar-char": "warn", // Safe string replacement
  },

  settings: {
    // Type-aware linting configuration
    // Enables advanced type checking capabilities
    typescript: {
      typeAware: true,
      typeCheck: true,
    },

    // Import resolution configuration
    import: {
      // Resolve modules from node_modules and source
      extensions: [".ts", ".tsx", ".js", ".jsx", ".json"],
    },
  },

  // ── Per-file overrides ────────────────────────────────────────────────────────
  // Promote `no-console` to "error" inside src/ (default is "warn" so docs/,
  // tests/, etc. still log freely). Allowlist `src/cli/`, `scripts/`, and
  // root-level `*.config.ts` because they run outside the Effect runtime.
  overrides: [
    {
      files: ["src/**/*.ts"],
      rules: {
        "no-console": "error",
      },
    },
    {
      files: ["src/cli/**/*", "scripts/**/*", "*.config.ts"],
      rules: {
        "no-console": "off",
      },
    },
  ],
});

/**
 * PLUGIN GUIDE
 * ============
 *
 * 1. **typescript** - Type-aware linting
 *    - Catches promise bugs (floating promises, misused promises)
 *    - Type safety checks and inference
 *    - Async/await pattern validation
 *    - Essential for Node.js/Express backends
 *
 * 2. **unicorn** - Code quality & best practices
 *    - Error handling patterns
 *    - Loop idioms (prefer map/filter over for)
 *    - Code clarity (filename case, error messages)
 *    - Prevents common pitfalls
 *    - Improves code consistency
 *
 * 3. **import** - Import organization
 *    - Detects circular dependencies
 *    - Validates import paths
 *    - Prevents unused exports
 *    - Enforces consistent export patterns
 *    - Critical for large codebases (prevents subtle bugs)
 *
 * 4. **security** - Security vulnerabilities ⚠️ CRITICAL FOR AUTH SERVICE
 *    - Prevents hardcoded credentials
 *    - Blocks eval() and dynamic code execution
 *    - Detects SQL injection patterns
 *    - Prevents insecure crypto usage
 *    - Must-have for authentication services
 *
 * 5. **node** - Node.js best practices
 *    - Async/await enforcement (no sync APIs in hot paths)
 *    - Proper path handling (path.join vs string concat)
 *    - Error handling in callbacks
 *    - Process management (graceful shutdown)
 *    - Deprecated API warnings
 *
 * 6. **regexp** - Regular expression safety
 *    - Detects impossible regex patterns
 *    - Validates character classes
 *    - Prevents ReDoS (Regex Denial of Service)
 *    - Improves regex readability
 *    - Important for input validation
 *
 * TO RUN AUTO-FIXES:
 * \`\`\`bash
 * oxlint --fix src/
 * \`\`\`
 *
 * TO CHECK SPECIFIC PLUGIN:
 * \`\`\`bash
 * oxlint src/ --deny security  # Show only security violations
 * \`\`\`
 */
