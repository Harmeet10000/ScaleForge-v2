To convert this article into a "Skill," we need to structure it so an AI Agent understands the **triggers** (when to use it), the **actions** (how to use the tool), and the **reasoning** (how to interpret the results).

Below is the definition of the **Node.js Performance Debugging & Flamegraph Analysis** skill.

---

## 🛠 AI Skill: Node.js Performance Profiling (via Platformatic Flame)

### 1. Skill Description

This skill enables the agent to diagnose, analyze, and provide actionable fixes for Node.js performance bottlenecks (CPU and Memory). It utilizes `@platformatic/flame` to generate LLM-friendly Markdown analysis from `.pb` (pprof) files, allowing the agent to "see" execution hotspots, call stacks, and memory churn without needing to manually interpret binary data or SVG flamegraphs.

### 2. Capabilities & Logic

* **Identify Hotspots:** Ranks functions by "Self Time" and "Total Time" to find where the event loop is blocked.
* **Memory Leak Detection:** Analyzes heap profiles to identify excessive allocations or garbage collection (GC) pressure.
* **Pattern Recognition:** Detects common performance "smells" like:
* N+1 query patterns (parallelize with `Promise.all`).
* O(n²) algorithms (recommend `Set` or `Map`).
* High JSON parsing overhead (recommend caching or streams).
* Regex overhead (recommend pre-compiling).


* **Automated Refactoring:** Provides prioritized code patches based on the rank of the bottleneck.

### 3. Tool Usage (CLI & API)

The agent should use these commands when tasked with performance optimization:

| Task | Command / Method |
| --- | --- |
| **Start Profiling** | `flame run <entry_point.js>` |
| **Generate Analysis** | `flame generate <profile.pb> --md-format=detailed` |
| **Programmatic Use** | `const { generateMarkdown } = require('@platformatic/flame')` |

### 4. Input Requirements

To use this skill effectively, the agent requires the content of the generated `.md` profile. The analysis typically includes:

1. **Summary:** Total samples, duration, and sample rate.
2. **Top Hotspots Table:** Function name, file/line number, and percentage of CPU/Heap usage.
3. **Call Hierarchy:** (In Detailed mode) The full stack trace leading to the bottleneck.

---

## 🚦 Agent Execution Workflow

### Step 1: Profiling

When a user reports "slowness" or "high CPU," the agent triggers:

> `flame run server.js`
> *Agent Note: Stop the process after a realistic workload to generate the `.md` report.*

### Step 2: Analysis (The "Ask")

Once the Markdown is available, the agent processes the hotspots.
**Example Logic:**

* **IF** `JSON.parse` is in the Top 3 Hotspots: **THEN** check if the JSON is static; suggest moving to a singleton or cache.
* **IF** `Array.prototype.includes` is high in a loop: **THEN** suggest converting the array to a `Set`.

### Step 3: Verification

After applying a fix, the agent should re-run the profile to compare "Before vs. After" metrics (e.g., 8 req/s → 1,122 req/s).

---

### 📦 Integration Example (for `config.json` or `system_prompt`)

```json
{
  "skill_name": "node_performance_analyzer",
  "tools_required": ["@platformatic/flame", "node >= 22.6.0"],
  "description": "Analyzes Node.js CPU/Heap profiles using markdown summaries to find and fix performance bottlenecks.",
  "knowledge_cutoff": "January 2026",
  "optimization_targets": ["Latency", "Throughput", "Memory Churn"]
}

```

**Would you like me to generate a specific system prompt for a "Performance Engineer" agent based on this skill?**
