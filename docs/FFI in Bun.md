# Zig ↔ JavaScript Bindings in Bun

Bun (a JS runtime written in Zig) provides a powerful FFI/binding system for exposing native Zig code to JavaScript.  In practice, you write your function in Zig, then describe its signature in a `.bind.ts` file, and Bun’s build generates the glue. For example, consider a simple Zig function in `src/bun.js/math.zig`:

```zig
pub fn add(global: *jsc.JSGlobalObject, a: i32, b: i32) !i32 {
    return std.math.add(i32, a, b) catch {
        // On overflow, throw a JS error:
        return global.throwPretty("Integer overflow while adding", .{});
    };
}
const gen = bun.gen.math; // prepare binding generation
```

This function takes a JS “global object” and two 32-bit ints, and returns an int (or throws a JS exception on error). To expose it to JS, you write an adjacent `math.bind.ts` using Bun’s **bindgen** helper:

```ts
import { t, fn } from "bindgen";

export const add = fn({
  args: { global: t.globalObject, a: t.i32, b: t.i32.default(1) },
  ret: t.i32,
});
```

This TypeScript declaration tells Bun’s build system about the function’s argument and return types. During compilation, Bun’s **Bindgen** scans `*.bind.ts` files and emits glue code so that from JS you can call the Zig function like a normal async import. In particular, Bun generates a `bun.gen.math.jsAdd` function and helper `bun.gen.math.createAddCallback(global)`, which JS code can obtain (e.g. via `$bindgenFn("math.bind.ts", "add")`). In effect, Bun can “just-in-time” compile C-ABI bindings between JS and Zig, handling conversion of types and exceptions【1†L172-L181】【1†L198-L207】. 

The result is that JavaScript code can invoke `add(…)` as a normal function (e.g. `import { add } from "bun:math";`), with Bun transparently calling into the Zig implementation.  (Bun also supports a general FFI module – `bun:ffi` – to call any C-ABI library from JS, but for built-in Zig modules Bindgen is used for tight integration.) This approach is detailed in Bun’s documentation: Zig-defined functions annotated with `pub fn` are matched to `.bind.ts` schemas, and Bun auto-generates the low-level callbacks【1†L172-L181】【1†L198-L207】. 

# Pydantic’s Rust-based Validation in Python

Pydantic V2 offloads its data validation logic to a Rust library called **pydantic-core**, which is compiled into a Python extension via [PyO3](https://pyo3.rs). In other words, Python code calls into compiled Rust functions under the hood. The Python class `SchemaValidator` is essentially just a wrapper around this Rust core. As the docs state: 

> “`SchemaValidator` is the Python wrapper for `pydantic-core`’s Rust validation logic”【43†L300-L304】. 

In practice, you use it in Python like so:

```python
from pydantic_core import SchemaValidator, ValidationError

# Define a schema (dict form) and compile it into a SchemaValidator
schema = {
    'type': 'typed-dict',
    'fields': { 'age': { 'type': 'typed-dict-field', 'schema': { 'type': 'int', 'ge': 18 } } }
}
validator = SchemaValidator(schema)

# Validate a Python dict; this calls into Rust under the hood
result = validator.validate_python({'age': 25})
print(result)  # -> {'age': 25}

# Invalid input raises a Python ValidationError, implemented via Rust code
try:
    validator.validate_python({'age': 12})
except ValidationError as e:
    print(e)
```

This example (adapted from the `pydantic-core` repo) shows Python calling `validate_python()`. Internally, these methods dispatch to Rust code compiled in the `_pydantic_core` extension. The Rust code uses PyO3 attributes (e.g. `#[pymodule]` and `#[pyfunction]`) to expose its functions and classes to Python, but that detail is hidden from the user. In essence, when `validator.validate_python(...)` is called, a fast Rust routine is executed for type checks and conversions, and results (or errors) are returned as Python objects. The Python/Rust boundary is bridged by PyO3-generated glue code. 

Thus, Pydantic’s validation occurs in Rust (for speed) even though you write Python code. The user-facing Python API (`SchemaValidator`, `BaseModel`, etc.) simply wraps this Rust core【43†L300-L304】【40†L391-L392】. The code snippet above demonstrates usage of the Rust-implemented validator from Python. 

**Sources:** Bun’s official docs on the new Bindgen system【1†L172-L181】【1†L198-L207】; Pydantic core documentation and examples showing `SchemaValidator` (Rust-backed) use【43†L300-L304】【40†L391-L392】.