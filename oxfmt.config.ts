/**
 * Oxfmt Configuration for ScaleForge-v2
 * =====================================
 * Professional code formatting with:
 * - Consistent code style (matching ESLint rules)
 * - Automatic import organization
 * - JSDoc comment normalization
 * - package.json key sorting
 * - File-specific formatting overrides
 *
 * DX Benefits:
 * - One command formats entire codebase
 * - Organize imports automatically
 * - Consistent JSDoc documentation format
 * - Fewer formatting discussions in code reviews
 */

export default {
  // ====== CORE FORMATTING OPTIONS ======
  // Global settings for all files

  // Line width - matches ESLint/Prettier
  printWidth: 100,

  // Indentation
  tabWidth: 2,
  useTabs: false, // Use spaces, not tabs

  // Semicolons & quotes
  semi: true, // Require semicolons (TS convention)
  singleQuote: true, // Single quotes in JS/TS
  jsxSingleQuote: false, // Double quotes in JSX
  quoteProps: "as-needed", // Only quote object keys when necessary

  // Trailing commas - safe for ES5+
  trailingComma: "none", // No trailing commas for cleaner diffs

  // Spacing
  bracketSpacing: true, // { a: 1 } instead of {a: 1}
  bracketSameLine: false, // JSX closing > on new line

  // Arrow functions
  arrowParens: "always", // (x) => x instead of x => x (explicit, safer)

  // Line endings - Unix standard
  endOfLine: "lf",

  // Final newline - best practice
  insertFinalNewline: true,

  // HTML whitespace - CSS-sensitive
  htmlWhitespaceSensitivity: "css",

  // Vue files
  vueIndentScriptAndStyle: true,

  // Markdown formatting
  proseWrap: "preserve", // Don't rewrap markdown (respect original formatting)

  // ====== IGNORE PATTERNS ======
  // Files and directories to skip formatting

  ignorePatterns: [
    "dist/**",
    "build/**",
    "node_modules/**",
    ".husky/**",
    ".github/**",
    ".amazonq/rules/**",
    "docker/**",
    "logs/**",
    "scripts/**",
    "nginx/**",
    "docs/**",
    "coverage/**",
    ".next/**",
    ".vercel/**",
  ],

  // ====== JSDOC FORMATTING ======
  // Normalize and reformat JSDoc comments for consistency
  // Critical for maintaining documentation quality

  jsdoc: {
    // Enable JSDoc formatting
    enabled: true,

    // Capitalize first letter of descriptions
    // @param {string} email - the user email
    // becomes: @param {string} email - The user email
    capitalizeDescriptions: true,

    // Add default values to @param descriptions
    // @param {string} timeout
    // becomes: @param {string} timeout - Default is 5000
    addDefaultToDescription: true,

    // Format comment blocks
    commentLineStrategy: "singleLine", // Convert to /* comment */ when possible
    // Options: 'singleLine' | 'multiline' | 'keep'

    // Wrap description lines at print width
    lineWrappingStyle: "greedy", // Always re-wrap to fit within printWidth
    // Options: 'greedy' | 'balance'

    // Use code fences (```) instead of 4-space indentation
    preferCodeFences: true,

    // Add trailing dot to descriptions
    // @param {string} name - The user name
    // becomes: @param {string} name - The user name.
    descriptionWithDot: true,

    // Add blank line between @param and @returns
    separateReturnsFromParam: true,

    // Group different tag types with blank lines
    // Separates @param group from @returns, @throws, etc.
    separateTagGroups: true,

    // Bracket spacing in JSDoc types
    // { string } instead of {string}
    bracketSpacing: false,

    // Emit @description tag instead of inline
    descriptionTag: false,

    // Preserve indentation in @example blocks
    keepUnparsableExampleIndent: false,
  },

  // ====== IMPORT SORTING ======
  // Automatically organize imports for better maintainability

  sortImports: {
    // Enable import sorting
    enabled: true,

    // Import groups - order matters!
    groups: [
      // 1. Built-in Node.js modules (fs, path, etc.)
      "builtin",

      // 2. External packages from node_modules
      "external",

      // 3. Internal modules and subpath imports
      ["internal", "subpath"],

      // 4. Local files (parent, sibling, index)
      ["parent", "sibling", "index"],

      // 5. Style imports (CSS, SCSS, etc.)
      "style",

      // 6. Unknown/unmatched imports
      "unknown",
    ],

    // Patterns to identify internal modules
    // Imports matching these patterns are "internal"
    internalPattern: ["~/src/**", "@/**"],

    // Add blank lines between import groups
    newlinesBetween: true,

    // Sort within groups ascending (a-z)
    order: "asc",

    // Case-sensitive sorting
    ignoreCase: true,

    // Do NOT sort side-effect imports (security)
    // Side effects order matters; keep manual control
    sortSideEffects: false,

    // Don't partition imports by comments/newlines
    partitionByComment: false,
    partitionByNewline: false,
  },

  // ====== PACKAGE.JSON SORTING ======
  // Keep package.json keys in logical order

  sortPackageJson: {
    enabled: true,
    // Don't sort scripts alphabetically - maintain logical grouping
    sortScripts: false,
  },

  // ====== FILE-SPECIFIC OVERRIDES ======
  // Different formatting rules for specific file types

  overrides: [
    // TypeScript files - stricter formatting
    {
      files: ["src/**/*.ts", "src/**/*.tsx"],
      options: {
        // Ensure consistent quotes
        singleQuote: true,
        // No trailing commas - cleaner diffs
        trailingComma: "none",
      },
    },

    // React component files - optimize for JSX
    {
      files: ["src/**/*.tsx", "src/**/*.jsx"],
      options: {
        // Single line attributes when possible
        singleAttributePerLine: false,
        // Break lines more aggressively in JSX
        printWidth: 100,
      },
    },

    // Configuration files - stricter formatting
    {
      files: [
        "tsconfig.json",
        "package.json",
        ".eslintrc*",
        ".prettierrc*",
        "oxlint.config.*",
        "oxfmt.config.*",
      ],
      options: {
        // Preserve formatting for config files
        proseWrap: "preserve",
        // Use trailing commas in JSON
        trailingComma: "none",
      },
    },

    // Markdown files - preserve original formatting
    {
      files: ["**/*.md", "**/*.mdx"],
      options: {
        // Don't reformat markdown
        proseWrap: "preserve",
        // Wider line width for prose
        printWidth: 120,
      },
    },

    // SQL/database files - wider lines
    {
      files: ["src/**/*.sql", "db/**/*.sql", "migrations/**/*.sql"],
      options: {
        // SQL can handle longer lines
        printWidth: 120,
      },
    },

    // Shell scripts - preserve formatting
    {
      files: ["scripts/**/*.sh", "**/*.bash"],
      options: {
        printWidth: 120,
      },
    },
  ],

  // ====== OUTPUT CONTROL ======
  // Embedded language formatting
  embeddedLanguageFormatting: "auto", // Format CSS-in-JS, etc.

  // Object wrapping strategy
  objectWrap: "preserve", // Respect original newlines in objects
};

/**
 * FORMATTING GUIDE
 * ================
 *
 * To format your entire codebase:
 * \`\`\`bash
 * oxfmt --write src/
 * \`\`\`
 *
 * Check formatting without changes:
 * \`\`\`bash
 * oxfmt --check src/
 * \`\`\`
 *
 * Format specific file types:
 * \`\`\`bash
 * oxfmt --write src/**\/*.ts    # TypeScript files
 * oxfmt --write src/**\/*.tsx   # React files
 * \`\`\`
 *
 * FEATURES ENABLED
 * ================
 *
 * 1. **JSDoc Formatting** ✅
 *    - Normalizes documentation comments
 *    - Capitalizes descriptions
 *    - Adds default values to @param
 *    - Separates tag groups with blank lines
 *    - Converts to single-line when possible
 *
 * 2. **Import Sorting** ✅
 *    - Organizes: builtin → external → internal → local → styles
 *    - Adds blank lines between groups
 *    - Alphabetical within groups
 *    - Respects side-effect import order (security)
 *
 * 3. **Package.json Sorting** ✅
 *    - Standard key ordering
 *    - Keeps scripts in manual order
 *
 * 4. **File-Specific Overrides**
 *    - TypeScript: Consistent quotes
 *    - React: JSX optimization
 *    - Config files: Preserved formatting
 *    - Markdown: Preserved prose
 *    - SQL: Wider lines for readability
 *
 * INTEGRATION WITH OXLINT
 * =======================
 * This formatter works alongside oxlint.config.ts:
 * - oxlint: Finds and reports issues (lint)
 * - oxfmt: Fixes formatting automatically (format)
 *
 * Typical workflow:
 * 1. \`oxlint --fix src/\`     # Fix linting issues
 * 2. \`oxfmt --write src/\`    # Format code
 * 3. \`oxlint src/\`           # Verify no lint issues
 */
