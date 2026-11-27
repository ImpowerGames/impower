import {
  lua,
  lauxlib,
  lualib,
  to_luastring,
  to_jsstring,
} from "fengari";

function runLua(source: string): unknown[] {
  const L = lauxlib.luaL_newstate();
  lualib.luaL_openlibs(L);
  const status = lauxlib.luaL_dostring(L, to_luastring(source));
  if (status !== lua.LUA_OK) {
    const msg = lua_tostring(L, -1);
    throw new Error(`fengari runtime error: ${msg}`);
  }
  const top = lua.lua_gettop(L);
  const results: unknown[] = [];
  for (let i = 1; i <= top; i++) {
    results.push(luaValueToJs(L, i));
  }
  return results;
}

function luaValueToJs(L: any, idx: number): unknown {
  const t = lua.lua_type(L, idx);
  if (t === lua.LUA_TNIL) return null;
  if (t === lua.LUA_TBOOLEAN) return lua.lua_toboolean(L, idx);
  if (t === lua.LUA_TNUMBER) return lua.lua_tonumber(L, idx);
  if (t === lua.LUA_TSTRING) return lua_tostring(L, idx);
  if (t === lua.LUA_TTABLE) {
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

function lua_tostring(L: any, idx: number): string | null {
  const raw = lua.lua_tostring(L, idx);
  if (raw == null) return null;
  return to_jsstring(raw);
}

function escapeLuaString(s: string): string {
  let out = "'";
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c === 0x27 || c === 0x5c) {
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
