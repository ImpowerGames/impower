import type { InkDiagnostic } from "../classes/annotators/CompilationAnnotator";
import type { LowerContext, LoweringRead } from "./context";

/**
 * The lowering context as one statement's lowering sees it, recording what
 * the lowering read through it (#656; docs/engine/binary-program.md, section
 * 1, Identity). A statement inside a block's body is lowered with it when
 * statement chunks are on, and what it recorded, with the statement's
 * syntax, is the key of the statement's memo (`statementMemo.ts`): a later
 * lowering of the block serves the statement from the memo, without lowering
 * it, while every recorded read reads the same.
 *
 * Nothing about the context is listed here as an input. Every field the
 * lowering reads is recorded as it reads it, down to the value it ends at: a
 * field of the context, an entry of an array, a member of a table, a method's
 * answer for the arguments it was asked with (`globalCallableNames.has`). A
 * field added to the context is recorded the first time a lowerer reads it.
 *
 * What is not a value of the context:
 *
 * - The document. `read`, `lineNumber` and `characterNumber` answer for
 *   positions; a read of the statement's own source is its syntax, which the
 *   memo's key holds, and a read outside it is recorded relative to the
 *   statement's start, so that the statement keeps its memo when an edit
 *   above it moves it. `documentText` and `chunkFrom` are where the
 *   statement's own nodes are read from and where its offsets count from.
 * - The diagnostics a lowering reports (`diagnostics`), which are recorded
 *   and reported again by the memo, and the statement shape its own lowering
 *   writes (`statementStack`).
 * - The memo's own session (`statementMemo`).
 *
 * A lowering that writes into the context (pushes onto a shared stack or
 * buffer, sets a field and leaves it changed), or reads a value the record
 * cannot compare (a parsed object, a syntax node, a method asked about an
 * object), cannot be served from a memo: `unkeyable` says why.
 */
export interface ContextRecording {
  reads: ContextRead[];
  /** The `LoweringRead`s the lowering reported (`LowerContext.recordRead`),
   *  which the memo asks the document again. */
  loweringReads: LoweringRead[];
  /** The diagnostics the lowering pushed onto `LowerContext.diagnostics`. */
  diagnostics: InkDiagnostic[];
  /** Why the statement cannot be served from a memo, or null. */
  unkeyable: string | null;
}

type Primitive = string | number | boolean | null | undefined | bigint;

/** A read's answer: a primitive, or the kind of value a path went through. */
export type ContextValue = Primitive | { readonly kind: "object" | "function" };

/** One step of a path through the context: a property, or a call of a
 *  method with primitive arguments (`#all` stands for every entry of a map
 *  or a set, read whole). */
export type ContextStep = string | number | { readonly call: string; readonly args: readonly Primitive[] };

export type ContextRead =
  | { readonly kind: "path"; readonly path: readonly ContextStep[]; readonly value: ContextValue }
  /** The text between two offsets relative to the statement's start. */
  | { readonly kind: "text"; readonly from: number; readonly to: number; readonly value: string }
  /** The line of an offset relative to the statement's start, counted from
   *  the statement's own line. */
  | { readonly kind: "line"; readonly at: number; readonly value: number }
  /** The column of an offset relative to the statement's start. */
  | { readonly kind: "column"; readonly at: number; readonly value: number };

const OBJECT: ContextValue = Object.freeze({ kind: "object" as const });
const FUNCTION: ContextValue = Object.freeze({ kind: "function" as const });

const encode = (value: unknown): ContextValue => {
  if (value === null || (typeof value !== "object" && typeof value !== "function")) {
    return value as Primitive;
  }
  return typeof value === "function" ? FUNCTION : OBJECT;
};

const sameValue = (a: ContextValue, b: ContextValue): boolean =>
  a !== null && b !== null && typeof a === "object" && typeof b === "object"
    ? a.kind === b.kind
    : Object.is(a, b);

const isPrimitive = (value: unknown): value is Primitive =>
  value === null || (typeof value !== "object" && typeof value !== "function");

// The values whose members a recording follows: plain objects, arrays, maps
// and sets. Anything else (a parsed object, a syntax node) is no value a
// later lowering's context could be compared with.
const followable = (value: object): boolean => {
  if (Array.isArray(value) || value instanceof Map || value instanceof Set) {
    return true;
  }
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
};

const ARRAY_WRITES: ReadonlySet<string> = new Set([
  "push",
  "pop",
  "shift",
  "unshift",
  "splice",
  "sort",
  "reverse",
  "fill",
  "copyWithin",
]);
const COLLECTION_WRITES: ReadonlySet<string> = new Set(["set", "add", "delete", "clear"]);
const COLLECTION_WHOLE: ReadonlySet<string> = new Set([
  "entries",
  "keys",
  "values",
  "forEach",
]);

/** A map's or a set's entries as one string, which `#all` reads, or
 *  undefined when an entry is no primitive. */
const wholeOf = (value: unknown): string | undefined => {
  if (!(value instanceof Map || value instanceof Set)) {
    return undefined;
  }
  const entries: Primitive[][] = [];
  for (const entry of value instanceof Map ? value.entries() : value.values()) {
    const pair = (value instanceof Map ? entry : [entry]) as unknown[];
    if (!pair.every(isPrimitive)) {
      return undefined;
    }
    entries.push(pair as Primitive[]);
  }
  return JSON.stringify(entries.map((pair) => pair.map((v) => (typeof v === "bigint" ? `${v}n` : v))));
};

// The fields that are not values of the context (see `ContextRecording`).
const POSITIONS: ReadonlySet<string> = new Set(["documentText", "chunkFrom"]);

// The context each recording context stands for.
const raws = new WeakMap<object, LowerContext>();

/** The context `ctx` records reads of, or `ctx` itself when it records
 *  none. A statement of a block's body is lowered with a recording of this
 *  context, not of its owner's recording: what the statements of a body
 *  read is theirs, and no read of their owner, whose chunk holds none of
 *  their code (docs/engine/binary-program.md, section 1, Blocks and
 *  sequences). */
export const rawContext = (ctx: LowerContext): LowerContext => raws.get(ctx) ?? ctx;

/**
 * The context for lowering the statement whose node spans `[from, to)`, and
 * `finish`, which returns what the lowering recorded once it has run.
 */
export function recordLowering(
  ctx: LowerContext,
  from: number,
  to: number,
): { ctx: LowerContext; finish: () => ContextRecording } {
  const recording: ContextRecording = {
    reads: [],
    loweringReads: [],
    diagnostics: [],
    unkeyable: null,
  };
  const refuse = (why: string) => {
    recording.unkeyable ??= why;
  };
  // Each path once, with the value it first read: a later read of the same
  // path reads what the lowering itself wrote there.
  const recorded = new Set<string>();
  const record = (path: readonly ContextStep[], value: unknown) => {
    const key = JSON.stringify(path);
    if (!recorded.has(key)) {
      recorded.add(key);
      recording.reads.push({ kind: "path", path, value: encode(value) });
    }
  };
  const recordOnce = (key: string, read: ContextRead) => {
    if (!recorded.has(key)) {
      recorded.add(key);
      recording.reads.push(read);
    }
  };
  const proxies = new WeakMap<object, object>();
  // Every value the lowering read whose members it then wrote, with its
  // entries as they were first read: a write that leaves them so is none.
  const written = new Map<object, { path: string; before: string | undefined }>();

  const wrap = (value: unknown, path: readonly ContextStep[]): unknown => {
    record(path, value);
    if (value === null || typeof value !== "object") {
      if (typeof value === "function") {
        // A function the context holds: a call records its answer.
        return (...args: unknown[]) => {
          if (!args.every(isPrimitive)) {
            refuse(`${describe(path)} asked about an object`);
            return (value as (...a: unknown[]) => unknown)(...args);
          }
          const step: ContextStep = { call: "()", args: args as Primitive[] };
          const answer = (value as (...a: unknown[]) => unknown)(...args);
          return wrap(answer, [...path, step]);
        };
      }
      return value;
    }
    if (!followable(value)) {
      refuse(`${describe(path)} holds a ${value.constructor?.name ?? "value"}`);
      return value;
    }
    let proxy = proxies.get(value);
    if (!proxy) {
      proxy = follow(value, path);
      proxies.set(value, proxy);
    }
    return proxy;
  };

  const noteWrite = (target: object, path: readonly ContextStep[]) => {
    if (!written.has(target)) {
      written.set(target, { path: describe(path), before: fingerprint(target) });
    }
  };

  const follow = (target: object, path: readonly ContextStep[]): object =>
    new Proxy(target, {
      get(t, prop) {
        if (typeof prop === "symbol") {
          if (prop === Symbol.iterator && (t instanceof Map || t instanceof Set)) {
            return whole(t, path, prop);
          }
          return Reflect.get(t, prop, Array.isArray(t) ? undefined : t);
        }
        if (Array.isArray(t)) {
          if (ARRAY_WRITES.has(prop)) {
            const method = (t as any)[prop] as (...a: unknown[]) => unknown;
            return (...args: unknown[]) => {
              noteWrite(t, path);
              return method.apply(t, args);
            };
          }
          const own = /^\d+$/.test(prop) ? Number(prop) : prop;
          const value = (t as any)[prop];
          if (typeof value === "function") {
            // An array's own methods read its entries through this proxy.
            return value;
          }
          return wrap(value, [...path, own]);
        }
        if (t instanceof Map || t instanceof Set) {
          if (prop === "size") {
            return wrap(t.size, [...path, "size"]);
          }
          if (COLLECTION_WRITES.has(prop)) {
            const method = (t as any)[prop] as (...a: unknown[]) => unknown;
            return (...args: unknown[]) => {
              noteWrite(t, path);
              return method.apply(t, args);
            };
          }
          if (COLLECTION_WHOLE.has(prop)) {
            return whole(t, path, prop);
          }
          const method = (t as any)[prop];
          if (typeof method !== "function") {
            return wrap(method, [...path, prop]);
          }
          return (...args: unknown[]) => {
            if (!args.every(isPrimitive)) {
              refuse(`${describe(path)}.${prop} asked about an object`);
              return method.apply(t, args);
            }
            const answer = method.apply(t, args);
            return wrap(answer, [...path, { call: prop, args: args as Primitive[] }]);
          };
        }
        const value = (t as any)[prop];
        if (typeof value === "function") {
          // A method of a plain object (`globalCallableNames.has`), which
          // answers for its arguments.
          return (...args: unknown[]) => {
            if (!args.every(isPrimitive)) {
              refuse(`${describe(path)}.${prop} asked about an object`);
              return value.apply(t, args);
            }
            const answer = value.apply(t, args);
            return wrap(answer, [...path, { call: prop, args: args as Primitive[] }]);
          };
        }
        return wrap(value, [...path, prop]);
      },
      set(t, prop, value) {
        noteWrite(t, path);
        return Reflect.set(t, prop, value);
      },
      deleteProperty(t, prop) {
        noteWrite(t, path);
        return Reflect.deleteProperty(t, prop);
      },
      has(t, prop) {
        refuse(`${describe(path)} was asked what it holds`);
        return Reflect.has(t, prop);
      },
      ownKeys(t) {
        refuse(`${describe(path)} was enumerated`);
        return Reflect.ownKeys(t);
      },
    });

  // Reads a map or a set whole: its entries are recorded as one value.
  const whole = (t: Map<unknown, unknown> | Set<unknown>, path: readonly ContextStep[], prop: string | symbol) => {
    const all = wholeOf(t);
    if (all === undefined) {
      refuse(`${describe(path)} holds objects`);
    } else {
      record([...path, { call: "#all", args: [] }], all);
    }
    const method = (t as any)[prop] as (...a: unknown[]) => unknown;
    return (...args: unknown[]) => method.apply(t, args);
  };

  // The values a lowering's own writes may leave changed.
  const sinks = new Set<string>();

  const base = (() => {
    let line: number | undefined;
    return () => (line ??= ctx.lineNumber(from));
  })();

  const rootWrites = new Map<PropertyKey, unknown>();
  const root = new Proxy(ctx, {
    get(t, prop) {
      if (typeof prop === "symbol") {
        return Reflect.get(t, prop);
      }
      switch (prop) {
        case "read":
          return (a: number, b: number) => {
            const text = t.read(a, b);
            if (a < from || b > to) {
              recordOnce(`text:${a - from}:${b - from}`, {
                kind: "text",
                from: a - from,
                to: b - from,
                value: text,
              });
            }
            return text;
          };
        case "lineNumber":
          return (pos: number) => {
            const line = t.lineNumber(pos);
            if (pos < from || pos > to) {
              recordOnce(`line:${pos - from}`, { kind: "line", at: pos - from, value: line - base() });
            }
            return line;
          };
        case "characterNumber":
          return (pos: number) => {
            const column = t.characterNumber(pos);
            if (pos < from || pos > to) {
              recordOnce(`column:${pos - from}`, { kind: "column", at: pos - from, value: column });
            }
            return column;
          };
        case "recordRead": {
          const report = t.recordRead;
          return report
            ? (read: LoweringRead) => {
                recording.loweringReads.push(read);
                report(read);
              }
            : undefined;
        }
        case "diagnostics": {
          const diagnostics = t.diagnostics;
          if (!diagnostics) {
            return diagnostics;
          }
          sinks.add(prop);
          return new Proxy(diagnostics, {
            get(d, key) {
              if (key === "push") {
                return (...items: InkDiagnostic[]) => {
                  recording.diagnostics.push(...items);
                  return d.push(...items);
                };
              }
              refuse("the lowering read the diagnostics reported before it");
              return Reflect.get(d, key);
            },
            set(d, key, value) {
              refuse("the lowering rewrote the diagnostics reported before it");
              return Reflect.set(d, key, value);
            },
          });
        }
        case "statementStack":
        case "statementMemo":
          return Reflect.get(t, prop);
      }
      if (POSITIONS.has(prop)) {
        return Reflect.get(t, prop);
      }
      const value = Reflect.get(t, prop);
      if (typeof value === "function") {
        return (...args: unknown[]) => {
          if (!args.every(isPrimitive)) {
            refuse(`${prop} asked about an object`);
            return (value as (...a: unknown[]) => unknown).apply(t, args);
          }
          const answer = (value as (...a: unknown[]) => unknown).apply(t, args);
          return wrap(answer, [{ call: prop, args: args as Primitive[] }]);
        };
      }
      return wrap(value, [prop]);
    },
    set(t, prop, value) {
      if (!rootWrites.has(prop)) {
        rootWrites.set(prop, Reflect.get(t, prop));
      }
      return Reflect.set(t, prop, value);
    },
    deleteProperty(t, prop) {
      if (!rootWrites.has(prop)) {
        rootWrites.set(prop, Reflect.get(t, prop));
      }
      return Reflect.deleteProperty(t, prop);
    },
    has(t, prop) {
      refuse(`the context was asked whether it holds ${String(prop)}`);
      return Reflect.has(t, prop);
    },
    ownKeys(t) {
      refuse("the context was enumerated");
      return Reflect.ownKeys(t);
    },
  });

  raws.set(root, ctx);
  return {
    ctx: root,
    finish: () => {
      for (const [prop, before] of rootWrites) {
        if (!Object.is(Reflect.get(ctx, prop), before)) {
          refuse(`the lowering left the context's ${String(prop)} changed`);
        }
      }
      for (const [target, { path, before }] of written) {
        if (before === undefined || fingerprint(target) !== before) {
          refuse(`the lowering wrote into ${path}`);
        }
      }
      return recording;
    },
  };
}

/** What a value holds, as far as a write can change it, for telling whether a
 *  lowering left what it wrote into as it found it: entries that are objects
 *  count by identity. Undefined for a value that is none of those a
 *  recording follows. */
const fingerprint = (value: object): string | undefined => {
  const ids = new Map<object, number>();
  const id = (v: unknown) => {
    if (isPrimitive(v)) {
      return typeof v === "bigint" ? `${v}n` : v;
    }
    let n = ids.get(v as object);
    if (n === undefined) {
      n = identities.get(v as object) ?? nextIdentity++;
      identities.set(v as object, n);
      ids.set(v as object, n);
    }
    return `#${n}`;
  };
  if (Array.isArray(value)) {
    return JSON.stringify(value.map(id));
  }
  if (value instanceof Map) {
    return JSON.stringify([...value].map(([k, v]) => [id(k), id(v)]));
  }
  if (value instanceof Set) {
    return JSON.stringify([...value].map(id));
  }
  if (followable(value)) {
    return JSON.stringify(Object.entries(value).map(([k, v]) => [k, id(v)]));
  }
  return undefined;
};

const identities = new WeakMap<object, number>();
let nextIdentity = 0;

const describe = (path: readonly ContextStep[]): string =>
  path
    .map((step) =>
      typeof step === "object" ? `${step.call}(${step.args.map((a) => JSON.stringify(a)).join(",")})` : String(step),
    )
    .join(".");

/**
 * Whether every read of `reads` reads the same in `ctx` for the statement
 * whose node now starts at `from`. A read is asked through the context as the
 * lowering asked it, so what a read's own accessor records is recorded again:
 * the global callable names and define type names the statement consulted go
 * into the record of the statement on the statement stack, as its lowering
 * would put them there.
 */
export function readsHold(
  ctx: LowerContext,
  from: number,
  reads: readonly ContextRead[],
): boolean {
  let line: number | undefined;
  for (const read of reads) {
    switch (read.kind) {
      case "text":
        if (ctx.read(from + read.from, from + read.to) !== read.value) {
          return false;
        }
        break;
      case "line":
        line ??= ctx.lineNumber(from);
        if (ctx.lineNumber(from + read.at) - line !== read.value) {
          return false;
        }
        break;
      case "column":
        if (ctx.characterNumber(from + read.at) !== read.value) {
          return false;
        }
        break;
      case "path": {
        let value: unknown = ctx;
        let reached = true;
        for (const step of read.path) {
          if (value === null || value === undefined) {
            reached = false;
            break;
          }
          if (typeof step === "object") {
            if (step.call === "#all") {
              value = wholeOf(value);
            } else if (step.call === "()") {
              value = typeof value === "function" ? (value as (...a: unknown[]) => unknown)(...step.args) : undefined;
            } else {
              const method = (value as any)[step.call];
              value = typeof method === "function" ? method.apply(value, step.args) : undefined;
            }
          } else {
            value = (value as any)[step];
          }
        }
        if (!sameValue(encode(reached ? value : undefined), read.value)) {
          return false;
        }
        break;
      }
    }
  }
  return true;
}
