// `fengari` is a JavaScript-only package with no published types. It is used
// only by the conformance oracle, which runs a Lua snippet in a fresh VM and
// reads back what the snippet returned, so this covers that surface alone.

declare module "fengari" {
  // Untyped namespaces: an index signature would force every call through
  // element access under noPropertyAccessFromIndexSignature.
  export const lua: any;
  export const lauxlib: any;
  export const lualib: any;
  export function to_luastring(value: string): Uint8Array;
  export function to_jsstring(value: Uint8Array): string;
}
