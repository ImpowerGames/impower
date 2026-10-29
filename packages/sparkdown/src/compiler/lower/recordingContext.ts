import type { InkDiagnostic } from "../classes/annotators/CompilationAnnotator";
import type { LowerContext, LoweringRead } from "./context";

export interface ContextRecording {
  reads: ContextRead[];
  loweringReads: LoweringRead[];
  diagnostics: InkDiagnostic[];
  unkeyable: string | null;
}

type Primitive = string | number | boolean | null | undefined | bigint;

export type ContextValue = Primitive | { readonly kind: "object" | "function" };

export type ContextStep =
  | string
  | number
  | { readonly call: string; readonly args: readonly Primitive[]; readonly at?: true };

const offsetMethods = new WeakSet<object>();

export const takesOffset = <F extends (...args: never[]) => unknown>(method: F): F => {
  offsetMethods.add(method);
  return method;
};

export type ContextRead =
  | { readonly kind: "path"; readonly path: readonly ContextStep[]; readonly value: ContextValue }
  | { readonly kind: "text"; readonly from: number; readonly to: number; readonly value: string }
  | { readonly kind: "line"; readonly at: number; readonly value: number }
  | { readonly kind: "column"; readonly at: number; readonly value: number };

const OBJECT: ContextValue = Object.freeze({ kind: "object" as const });
const FUNCTION: ContextValue = Object.freeze({ kind: "function" as const });

const encode = (value: unknown): ContextValue => {
  if (value === null || (typeof value !== "object" && typeof value !== "function")) {
    return value as Primitive;
  }
  return typeof value === "function" ? FUNCTION : OBJECT;
};

const placed = (value: unknown, from: number): unknown => {
  if (typeof value !== "string") {
    return value;
  }
  // value-level: a string a lowering read from the context
  const name = /^(\w*__)\$(\d+)(\w*)$/.exec(value);
  return name ? `${name[1]}$~${Number(name[2]) - from}${name[3]}` : value;
};

const sameValue = (a: ContextValue, b: ContextValue): boolean =>
  a !== null && b !== null && typeof a === "object" && typeof b === "object"
    ? a.kind === b.kind
    : Object.is(a, b);

const isPrimitive = (value: unknown): value is Primitive =>
  value === null || (typeof value !== "object" && typeof value !== "function");

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

const POSITIONS: ReadonlySet<string> = new Set(["documentText", "chunkFrom"]);

const raws = new WeakMap<object, LowerContext>();

export const rawContext = (ctx: LowerContext): LowerContext => raws.get(ctx) ?? ctx;

const targets = new WeakMap<object, object>();

const unwrap = <T>(value: T): T =>
  value !== null && typeof value === "object"
    ? ((targets.get(value as object) as T | undefined) ?? value)
    : value;

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
  const callStep = (method: unknown, call: string, args: readonly Primitive[]): ContextStep => {
    const at = args[args.length - 1];
    return typeof method === "function" && offsetMethods.has(method) && typeof at === "number"
      ? { call, args: [...args.slice(0, -1), at - from], at: true }
      : { call, args };
  };
  const recorded = new Set<string>();
  const record = (path: readonly ContextStep[], value: unknown) => {
    const key = JSON.stringify(path);
    if (!recorded.has(key)) {
      recorded.add(key);
      recording.reads.push({ kind: "path", path, value: encode(placed(value, from)) });
    }
  };
  const lengths = new Map<object, number>();
  const recordOnce = (key: string, read: ContextRead) => {
    if (!recorded.has(key)) {
      recorded.add(key);
      recording.reads.push(read);
    }
  };
  const proxies = new WeakMap<object, object>();
  const own = new WeakSet<object>();
  const owned = <T>(value: T): T => {
    const raw = unwrap(value);
    if (raw === value && raw !== null && typeof raw === "object") {
      own.add(raw as object);
    }
    return raw;
  };
  let finished = false;
  const written = new Map<object, { path: string; before: string | undefined }>();

  const wrap = (value: unknown, path: readonly ContextStep[]): unknown => {
    if (finished || (value !== null && typeof value === "object" && own.has(value))) {
      return value;
    }
    record(path, value);
    if (value === null || typeof value !== "object") {
      if (typeof value === "function") {
        return (...args: unknown[]) => {
          if (!args.every(isPrimitive)) {
            refuse(`${describe(path)} asked about an object`);
            return (value as (...a: unknown[]) => unknown)(...args);
          }
          const step = callStep(value, "()", args as Primitive[]);
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
      targets.set(proxy, value);
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
        if (finished) {
          const value = Reflect.get(t, prop);
          return typeof value === "function"
            ? (...args: unknown[]) => (value as (...a: unknown[]) => unknown).apply(t, args.map(unwrap))
            : value;
        }
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
              if (!finished) {
                noteWrite(t, path);
                if (!lengths.has(t)) {
                  lengths.set(t, t.length);
                }
              }
              return method.apply(t, args.map(owned));
            };
          }
          if (prop === "length" && lengths.has(t)) {
            record([...path, "length"], lengths.get(t));
            return t.length;
          }
          // value-level: a property name of an array of the context, read as its index
          const own = /^\d+$/.test(prop) ? Number(prop) : prop;
          const value = (t as any)[prop];
          if (typeof value === "function") {
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
              if (!finished) {
                noteWrite(t, path);
              }
              return method.apply(t, args.map(owned));
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
              return method.apply(t, args.map(unwrap));
            }
            const answer = method.apply(t, args);
            return wrap(answer, [...path, callStep(method, prop, args as Primitive[])]);
          };
        }
        const value = (t as any)[prop];
        if (typeof value === "function") {
          return (...args: unknown[]) => {
            if (!args.every(isPrimitive)) {
              refuse(`${describe(path)}.${prop} asked about an object`);
              return value.apply(t, args.map(unwrap));
            }
            const answer = value.apply(t, args);
            return wrap(answer, [...path, callStep(value, prop, args as Primitive[])]);
          };
        }
        return wrap(value, [...path, prop]);
      },
      set(t, prop, value) {
        if (!finished) {
          noteWrite(t, path);
        }
        return Reflect.set(t, prop, owned(value));
      },
      deleteProperty(t, prop) {
        if (!finished) {
          noteWrite(t, path);
        }
        return Reflect.deleteProperty(t, prop);
      },
      has(t, prop) {
        if (!finished) refuse(`${describe(path)} was asked what it holds`);
        return Reflect.has(t, prop);
      },
      ownKeys(t) {
        if (!finished) refuse(`${describe(path)} was enumerated`);
        return Reflect.ownKeys(t);
      },
    });

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

  const sinks = new Set<string>();

  const base = (() => {
    let line: number | undefined;
    return () => (line ??= ctx.lineNumber(from));
  })();

  const rootWrites = new Map<PropertyKey, unknown>();
  const root = new Proxy(ctx, {
    get(t, prop) {
      if (finished || typeof prop === "symbol") {
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
          return wrap(answer, [callStep(value, prop, args as Primitive[])]);
        };
      }
      return wrap(value, [prop]);
    },
    set(t, prop, value) {
      if (!finished && !rootWrites.has(prop)) {
        rootWrites.set(prop, Reflect.get(t, prop));
      }
      return Reflect.set(t, prop, owned(value));
    },
    deleteProperty(t, prop) {
      if (!finished && !rootWrites.has(prop)) {
        rootWrites.set(prop, Reflect.get(t, prop));
      }
      return Reflect.deleteProperty(t, prop);
    },
    has(t, prop) {
      if (!finished) refuse(`the context was asked whether it holds ${String(prop)}`);
      return Reflect.has(t, prop);
    },
    ownKeys(t) {
      if (!finished) refuse("the context was enumerated");
      return Reflect.ownKeys(t);
    },
  });

  raws.set(root, ctx);
  return {
    ctx: root,
    finish: () => {
      finished = true;
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
            } else {
              const args = step.at
                ? [...step.args.slice(0, -1), (step.args[step.args.length - 1] as number) + from]
                : step.args;
              if (step.call === "()") {
                value = typeof value === "function" ? (value as (...a: unknown[]) => unknown)(...args) : undefined;
              } else {
                const method = (value as any)[step.call];
                value = typeof method === "function" ? method.apply(value, args) : undefined;
              }
            }
          } else {
            value = (value as any)[step];
          }
        }
        if (!sameValue(encode(placed(reached ? value : undefined, from)), read.value)) {
          return false;
        }
        break;
      }
    }
  }
  return true;
}
