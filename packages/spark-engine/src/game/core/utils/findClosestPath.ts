import type { ScriptLocation } from "../types/ScriptLocation";
import { findClosestPathLocation } from "./findClosestPathLocation";

const isBindingPath = (path: string) =>
  path.includes("__binding_") &&
  path.split(".").some((seg) => seg.startsWith("__binding_"));

// The previewable entries of each entries array. A program's entries are
// resolved against again and again (every cursor move, every preview), and a
// long script has tens of thousands of them, so they are filtered once.
const previewableEntries = new WeakMap<
  [string, ScriptLocation][],
  [string, ScriptLocation][]
>();

export const findClosestPath = (
  from: { file: string; line: number },
  pathLocationEntries: [string, ScriptLocation][],
  scripts: string[],
) => {
  const { file, line } = from;
  if (file == null || line == null) {
    return null;
  }
  // Reactive-binding evaluators (`__binding_<offset>`) are synthetic ink
  // FUNCTIONS the compiler hoists for `{interpolations}` and `@event` handlers.
  // They carry debug metadata (so diagnostics can point at the binding source),
  // which also lists them here as candidate paths — but a preview DIVERTS into
  // its closest path (`ChoosePathString`), and diverting into a function runs
  // its `return` outside a call context ("Found function return statement, when
  // expected end of flow"). A UI-only screen (all its paths are bindings) would
  // otherwise jump straight into one and fail to mount. They are never a valid
  // preview target, so exclude them as candidates.
  let previewable = previewableEntries.get(pathLocationEntries);
  if (!previewable) {
    previewable = pathLocationEntries.filter(([p]) => !isBindingPath(p));
    previewableEntries.set(pathLocationEntries, previewable);
  }
  const [path] =
    findClosestPathLocation({ file, line }, previewable, scripts) || [];
  const parentPath = path?.split(".").slice(0, -1).join(".");
  if (parentPath?.endsWith(".$s")) {
    // If we are inside choice start content, begin from start of choice
    const grandParentPath = parentPath?.split(".").slice(0, -1).join(".");
    return grandParentPath + ".0";
  }
  return path ?? null;
};
