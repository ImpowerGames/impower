import { describe, expect, it } from "vitest";
import { SparkdownCompiler } from "../../compiler/classes/SparkdownCompiler";

describe("asset names inherited from Object.prototype (#1762)", () => {
  it.each(["toString", "constructor", "hasOwnProperty", "__proto__", "ordinary"])("compiles a world file named %s without modifying native objects", (name) => {
    const native = name === "__proto__" ? Object.prototype : (Object.prototype as Record<string, unknown>)[name] ?? {};
    const protectedObject = native !== null && (typeof native === "object" || typeof native === "function") ? native : {};
    const descriptors = Object.getOwnPropertyDescriptors(protectedObject);
    const compiler = new SparkdownCompiler();
    const uri = "file:///project/main.sd";
    compiler.configure({ files: [
      { uri, type: "script", name: "main", ext: "sd", text: "-> START\nscene START\n  A working scene.\nend\n", version: 1, languageId: "sparkdown" },
      { uri: `file:///project/lib/${name}.js`, type: "world", name, ext: "js", text: "export default {};", src: `file:///project/lib/${name}.js` },
    ] });
    try {
      const result = compiler.compile({ textDocument: { uri } });
      expect(Object.hasOwn(result.program.context?.["world"] ?? {}, name)).toBe(true);
      expect(result.program.context?.["world"]?.[name]).toMatchObject({
        $type: "world", $name: name, name, ext: "js",
      });
      expect(Object.getOwnPropertyDescriptors(protectedObject)).toEqual(descriptors);
    } finally {
      // The broken compiler writes metadata onto the native function before
      // throwing. Keep the reproduction from contaminating later assertions.
      for (const key of Reflect.ownKeys(protectedObject)) {
        if (!Object.hasOwn(descriptors, key)) Reflect.deleteProperty(protectedObject, key);
      }
      Object.defineProperties(protectedObject, descriptors);
    }
  });
});
