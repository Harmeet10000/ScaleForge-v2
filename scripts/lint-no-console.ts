#!/usr/bin/env bun
/**
 * scripts/lint-no-console.ts
 *
 * Fails the build if any `console.{log,warn,error,...}` appears in src/,
 * outside the documented allowlist (scripts/, root *.config.ts, src/cli/).
 * Mirrors the `no-console: "error"` rule in oxlint.config.ts; runs in <100ms so
 * it's safe to gate on in CI without the full oxlint pass.
 */

import { Glob } from "bun"

const pattern = /console\.(log|warn|error|info|debug|trace)/

const offenders: { file: string; line: number; text: string }[] = []

const scan = async (cwd: string) => {
  const glob = new Glob("**/*.ts")
  for await (const relative of glob.scan({ cwd })) {
    const path = `${cwd}/${relative}`
    const text = await Bun.file(path).text()
    const lines = text.split("\n")
    for (let i = 0; i < lines.length; i++) {
      if (pattern.test(lines[i]!)) {
        offenders.push({ file: path, line: i + 1, text: lines[i]!.trim() })
      }
    }
  }
}

// Scan only subdirs of src/ that are NOT on the allowlist (src/cli/ is allowed).
await scan("src/app")
await scan("src/core")
await scan("src/db")
await scan("src/infra")
await scan("src/runtime")
await scan("src/workers")

if (offenders.length > 0) {
  console.error("lint:no-console — console.* is forbidden in src/ (outside the allowlist):")
  for (const o of offenders) {
    console.error(`  ${o.file}:${o.line}  ${o.text}`)
  }
  process.exit(1)
}

console.log("lint:no-console — no console.* calls found in src/")
