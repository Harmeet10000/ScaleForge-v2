#!/usr/bin/env bun
/**
 * Layer boundary enforcement for ScaleForge-v2.
 *
 * Enforces the dependency rule:
 *   core/ ← infra/ ← features/ ← runtime/ ← app.ts / main.ts
 *
 * Each layer may only import from itself or layers below it.
 * Violations are printed and the script exits with code 1.
 *
 * Usage:
 *   bun run scripts/check-layers.ts
 *   bun run scripts/check-layers.ts --strict   # also flag cross-feature imports
 */

import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";

const SRC_ROOT = join(import.meta.dir, "..", "src");

// Layer order (index = rank; higher rank may import lower rank)
const LAYERS = ["core", "infra", "features", "runtime", "workers"] as const;
type Layer = (typeof LAYERS)[number];

const LAYER_RANK: Record<Layer, number> = {
  core: 0,
  features: 2,
  infra: 1,
  runtime: 3,
  workers: 3, // same rank as runtime — both are top-level entry points
};

// Files at root of src/ (app.ts, main.ts) may import anything
const ROOT_ENTRY_FILES = new Set(["app.ts", "main.ts"]);

// ---------------------------------------------------------------------------

function getLayer(relPath: string): Layer | null {
  const parts = relPath.split("/");
  if (LAYERS.includes(parts[0] as Layer)) {
    return parts[0] as Layer;
  }
  return null;
}

function resolveImportedLayer(importerRelPath: string, importPath: string): Layer | null {
  // Only check relative imports — absolute/node_module imports are not our concern
  if (!importPath.startsWith(".")) {
    return null;
  }

  const importerDir = dirname(join(SRC_ROOT, importerRelPath));
  const resolved = relative(SRC_ROOT, join(importerDir, importPath));
  return getLayer(resolved);
}

function collectFiles(dir: string, files: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      collectFiles(full, files);
    } else if (entry.endsWith(".ts") && !entry.endsWith(".d.ts")) {
      files.push(full);
    }
  }
  return files;
}

// Very simple import path extractor — handles:
//   import ... from '...'
//   import('...')
//   export ... from '...'
const IMPORT_RE = /(?:import|export)(?:[\s\S]*?)from\s+['"]([^'"]+)['"]/g;
const DYNAMIC_IMPORT_RE = /import\(['"]([^'"]+)['"]\)/g;

function extractImports(source: string): string[] {
  const paths: string[] = [];
  for (const re of [IMPORT_RE, DYNAMIC_IMPORT_RE]) {
    re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(source)) !== null) {
      paths.push(m[1]!)
    }
  }
  return paths;
}

// ---------------------------------------------------------------------------

interface Violation {
  file: string;
  importerLayer: Layer;
  importedLayer: Layer;
  importPath: string;
  line: number;
}

function findLineNumber(source: string, importPath: string): number {
  const lines = source.split("\n");
  const escaped = importPath.replaceAll(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(`['"]${escaped}['"]`);
  return (lines.findIndex((l) => re.test(l)) ?? -1) + 1;
}

const strict = process.argv.includes("--strict");
const violations: Violation[] = [];
const files = collectFiles(SRC_ROOT);

for (const file of files) {
  const relPath = relative(SRC_ROOT, file);
  const fileName = relPath.split("/").pop()!;

  // Root-level entry files are allowed to import any layer
  if (ROOT_ENTRY_FILES.has(fileName) && !relPath.includes("/")) {
    continue;
  }

  const importerLayer = getLayer(relPath);
  if (!importerLayer) {
    continue;
  } // helpers/, db/ — not yet assigned a layer rank

  const source = readFileSync(file, "utf-8");
  const imports = extractImports(source);

  for (const imp of imports) {
    const importedLayer = resolveImportedLayer(relPath, imp);
    if (!importedLayer) {
      continue;
    }

    const importerRank = LAYER_RANK[importerLayer];
    const importedRank = LAYER_RANK[importedLayer];

    if (importedRank > importerRank) {
      violations.push({
        file: relPath,
        importPath: imp,
        importedLayer,
        importerLayer,
        line: findLineNumber(source, imp),
      });
    }

    // Strict mode: flag cross-feature imports (feature A importing feature B)
    if (strict && importerLayer === "features" && importedLayer === "features") {
      // Allow imports within the same feature subtree
      const importerFeature = relPath.split("/")[1];
      const resolvedImportPath = relative(SRC_ROOT, join(dirname(join(SRC_ROOT, relPath)), imp));
      const importedFeature = resolvedImportPath.split("/")[1];
      if (importerFeature !== importedFeature) {
        violations.push({
          file: relPath,
          importPath: imp,
          importedLayer: "features",
          importerLayer: "features",
          line: findLineNumber(source, imp),
        });
      }
    }
  }
}

if (violations.length === 0) {
  console.log("✓ Layer boundaries OK");
  process.exit(0);
} else {
  console.error(`\nLayer boundary violations found (${violations.length}):\n`);
  for (const v of violations) {
    const arrow = `${v.importerLayer} → ${v.importedLayer}`;
    console.error(`  src/${v.file}:${v.line}`);
    console.error(`    [${arrow}] imports '${v.importPath}'`);
    console.error(`    Rule: ${v.importerLayer} must not import from ${v.importedLayer}\n`);
  }
  process.exit(1);
}
