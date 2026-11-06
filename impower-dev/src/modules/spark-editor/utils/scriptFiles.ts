import { computed, signal } from "@preact/signals";
import { endingsPattern, patternEndings } from "../workspace/settings/fileEndings";

const SCRIPT_EXTENSIONS = ["sd", "luau"];

export const SCRIPT_FILES_GLOB = endingsPattern(SCRIPT_EXTENSIONS);

const scriptExtensions = signal<readonly string[]>(SCRIPT_EXTENSIONS);

export const scriptFilesGlob = computed(() => endingsPattern(scriptExtensions.value));

export const setScriptFiles = (pattern: string): void => {
  const endings = patternEndings(pattern);
  const next = endings.length > 0 ? endings : SCRIPT_EXTENSIONS;
  const current = scriptExtensions.peek();
  if (next.length !== current.length || next.some((ending, i) => ending !== current[i])) {
    scriptExtensions.value = next;
  }
};

export const isScriptExtension = (ext: string): boolean =>
  scriptExtensions.value.includes(ext.toLowerCase());

export const isScriptPath = (path: string): boolean => {
  const base = path.split("/").pop() ?? "";
  const dot = base.lastIndexOf(".");
  return dot > 0 && isScriptExtension(base.slice(dot + 1));
};
