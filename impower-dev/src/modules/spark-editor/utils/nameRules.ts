export type NameCheck =
  | { status: "empty" }
  | { status: "unchanged" }
  | { status: "invalid" }
  | { status: "collision"; name: string }
  | { status: "renamed"; name: string };

export const checkName = (
  draft: string,
  current: string,
  taken: readonly string[] = [],
): NameCheck => {
  const name = draft.trim();
  if (!name) {
    return { status: "empty" };
  }
  if (name === current) {
    return { status: "unchanged" };
  }
  if (/[/\\]/.test(name)) {
    return { status: "invalid" };
  }
  const lower = name.toLowerCase();
  if (
    lower !== current.toLowerCase() &&
    taken.some((t) => t.toLowerCase() === lower)
  ) {
    return { status: "collision", name };
  }
  return { status: "renamed", name };
};

export const splitScriptPath = (path: string) => {
  const slash = path.lastIndexOf("/");
  const folder = slash >= 0 ? path.slice(0, slash) : "";
  const base = slash >= 0 ? path.slice(slash + 1) : path;
  const dot = base.lastIndexOf(".");
  const name = dot > 0 ? base.slice(0, dot) : base;
  const ext = dot > 0 ? base.slice(dot + 1) : "";
  return { folder, name, ext };
};

export const joinScriptPath = (folder: string, name: string, ext: string) => {
  const base = ext ? `${name}.${ext}` : name;
  return folder ? `${folder}/${base}` : base;
};
