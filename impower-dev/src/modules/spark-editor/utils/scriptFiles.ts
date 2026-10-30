const SCRIPT_EXTENSIONS = ["sd", "luau"];

export const SCRIPT_FILES_GLOB = `*.{${SCRIPT_EXTENSIONS.join(",")}}`;

export const isScriptExtension = (ext: string): boolean =>
  SCRIPT_EXTENSIONS.includes(ext);

export const isScriptPath = (path: string): boolean => {
  const base = path.split("/").pop() ?? "";
  const dot = base.lastIndexOf(".");
  return dot > 0 && isScriptExtension(base.slice(dot + 1));
};
