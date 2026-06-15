// Fengari-backed reference oracle for Lua pattern matching.
//
// Sparkdown compiles Lua patterns down to JS RegExp via
// `inkjs/engine/LuaPatterns.ts`. Behaviour should match upstream
// Lua/Luau bit-for-bit on ASCII inputs (where JS code units and
// Lua bytes coincide).
//
// Fengari is a full Lua 5.3 VM in JS — we use it as a *test oracle*
// only. Each helper here runs a tiny Lua snippet and packages the
// result as a JS-friendly shape so vitest tests can compare against
// it. Fengari is a devDependency; the runtime engine never imports
// it.
//
// Note on string semantics: fengari treats strings as UTF-8 byte
// arrays (Lua 5.3 semantics). For ASCII inputs — which is what
// every test in this directory uses — byte indices and JS code-unit
// indices are identical, so direct equality holds. For non-ASCII
// the two would diverge; those tests should NOT use this oracle.

import {
  lua,
  lauxlib,
  lualib,
  to_luastring,
  to_jsstring,
} from "fengari";

// Run a snippet of Lua source in a fresh VM. Returns the values
// the snippet pushed via `return`, converted to JS-friendly types.
// Throws on Lua parse / runtime errors with the Lua-side message.
function runLua(source: string): unknown[] {
  const L = lauxlib.luaL_newstate();
  lualib.luaL_openlibs(L);
  const status = lauxlib.luaL_dostring(L, to_luastring(source));
  if (status !== lua.LUA_OK) {
    const msg = lua_tostring(L, -1);
    throw new Error(`fengari runtime error: ${msg}`);
  }
  // Collect every value pushed onto the stack by the snippet's
  // top-level `return`. `lua_gettop` is 1-indexed (the bottom of
  // the stack from this chunk's perspective).
  const top = lua.lua_gettop(L);
  const results: unknown[] = [];
  for (let i = 1; i <= top; i++) {
    results.push(luaValueToJs(L, i));
  }
  return results;
}

// Convert a Lua value at stack index `idx` to a JS-friendly type.
// Tables become plain objects (string keys) / arrays (when 1..n
// integer keys are contiguous).
function luaValueToJs(L: any, idx: number): unknown {
  const t = lua.lua_type(L, idx);
  if (t === lua.LUA_TNIL) return null;
  if (t === lua.LUA_TBOOLEAN) return lua.lua_toboolean(L, idx);
  if (t === lua.LUA_TNUMBER) return lua.lua_tonumber(L, idx);
  if (t === lua.LUA_TSTRING) return lua_tostring(L, idx);
  if (t === lua.LUA_TTABLE) {
    // Detect array-shape: keys 1..n contiguous, no other keys.
    const arr: unknown[] = [];
    let i = 1;
    while (true) {
      lua.lua_rawgeti(L, idx, i);
      if (lua.lua_type(L, -1) === lua.LUA_TNIL) {
        lua.lua_pop(L, 1);
        break;
      }
      arr.push(luaValueToJs(L, -1));
      lua.lua_pop(L, 1);
      i++;
    }
    return arr;
  }
  return `<unsupported lua type ${t}>`;
}

// `lua_tostring` returns a Uint8Array; convert to JS string. Returns
// `null` if the value at `idx` isn't a string.
function lua_tostring(L: any, idx: number): string | null {
  const raw = lua.lua_tostring(L, idx);
  if (raw == null) return null;
  return to_jsstring(raw);
}

// Escape a JS string for safe inclusion as a Lua single-quoted
// string literal. Handles the escapes Lua recognises in single-quoted
// strings: `\` `'` `\n` `\r` plus control chars via `\xHH`.
function escapeLuaString(s: string): string {
  let out = "'";
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c === 0x27 /* ' */ || c === 0x5c /* \ */) {
      out += "\\" + s.charAt(i);
    } else if (c === 0x0a) {
      out += "\\n";
    } else if (c === 0x0d) {
      out += "\\r";
    } else if (c < 0x20 || c === 0x7f) {
      out += "\\" + c.toString(10);
    } else {
      out += s.charAt(i);
    }
  }
  return out + "'";
}

// ============================================================
// Public helpers — one per stdlib op we want to oracle.
// ============================================================

// `string.find(s, p [, init [, plain]])` — returns `[start, end,
// ...captures]` on match, `null` on no match.
export function fengariFind(
  s: string,
  pattern: string,
  init?: number,
  plain?: boolean,
): unknown[] | null {
  const initLit = init == null ? "1" : String(init);
  const plainLit = plain ? "true" : "false";
  const src = `return string.find(${escapeLuaString(s)}, ${escapeLuaString(pattern)}, ${initLit}, ${plainLit})`;
  const result = runLua(src);
  if (result.length === 0 || result[0] == null) return null;
  return result;
}

// `string.match(s, p [, init])` — returns the array of captures (or
// `[wholeMatch]` if the pattern has no captures), or `null` on no
// match.
export function fengariMatch(
  s: string,
  pattern: string,
  init?: number,
): unknown[] | null {
  const initLit = init == null ? "1" : String(init);
  const src = `return string.match(${escapeLuaString(s)}, ${escapeLuaString(pattern)}, ${initLit})`;
  const result = runLua(src);
  if (result.length === 0 || result[0] == null) return null;
  return result;
}

// `string.gmatch(s, p)` — iterate every match. Each yield is the
// list of captures (or `[wholeMatch]` if no captures). Returns the
// flattened sequence of all yields.
export function fengariGmatch(s: string, pattern: string): unknown[] {
  const src = `
    local results = {}
    for a, b, c, d, e, f, g, h, i in string.gmatch(${escapeLuaString(s)}, ${escapeLuaString(pattern)}) do
      results[#results+1] = a
      if b ~= nil then results[#results+1] = b end
      if c ~= nil then results[#results+1] = c end
      if d ~= nil then results[#results+1] = d end
      if e ~= nil then results[#results+1] = e end
      if f ~= nil then results[#results+1] = f end
      if g ~= nil then results[#results+1] = g end
      if h ~= nil then results[#results+1] = h end
      if i ~= nil then results[#results+1] = i end
    end
    return results
  `;
  return runLua(src)[0] as unknown[];
}

// `string.gsub(s, p, repl [, n])` — string + table replacement
// forms (no function form, since the oracle can't accept a JS
// closure as repl). Returns `[result_string, count]`.
export function fengariGsub(
  s: string,
  pattern: string,
  repl: string | Record<string, string>,
  n?: number,
): [string, number] {
  let replLit: string;
  if (typeof repl === "string") {
    replLit = escapeLuaString(repl);
  } else {
    const parts: string[] = [];
    for (const [k, v] of Object.entries(repl)) {
      parts.push(`[${escapeLuaString(k)}] = ${escapeLuaString(v)}`);
    }
    replLit = `{${parts.join(", ")}}`;
  }
  const nLit = n == null ? "nil" : String(n);
  const src = `
    local r, c = string.gsub(${escapeLuaString(s)}, ${escapeLuaString(pattern)}, ${replLit}, ${nLit})
    return r, c
  `;
  const result = runLua(src);
  return [result[0] as string, result[1] as number];
}
