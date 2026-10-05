import assert from "node:assert/strict";
import { pathToFileURL } from "node:url";

const module = await import(pathToFileURL(process.argv[2]).href);
const optional_color = module.optional_color ?? module.default?.optional_color;
assert.deepEqual(optional_color(), { $type: "color", $name: "$optional", value: "" });
console.log("optional_color registers its known value property under color");
