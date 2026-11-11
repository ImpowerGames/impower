import { parseLayerName } from "@impower/sparkdown/src/attributes/parseLayerName";
import { matchesAttributeOption } from "@impower/sparkdown/src/attributes/resolveAttributes";
import { bytesLabel, plural } from "./fileListModel";
import type { ImageStack, StackMember, StackPicture } from "./imageStacks";

export const ALTERNATE = "@";

export const AS_IS = "";

export type VariantForm = "portrait" | "backdrop";

export type VariantSelection = Readonly<Record<string, string>>;

export interface TesterGroup {
  key: string;
  label: string;
  options: string[];
  default: string;
  switch: boolean;
}

export interface ImageVariant {
  image: string;
  attributes: string[];
}

const capital = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

const words = (text: string) => text.replace(/[-_]+/g, " ");

export const optionLabel = (option: string): string =>
  option === AS_IS ? "As is" : capital(words(option));

export const groupLabel = (group: TesterGroup): string =>
  group.key === ALTERNATE ? "Alternate" : capital(words(group.label));

export const pictureFor = (stack: ImageStack, selection: VariantSelection): StackPicture => {
  const picked = selection[ALTERNATE];
  return stack.pictures.find((picture) => (picture.alternate ?? AS_IS) === picked) ?? stack.pictures[0]!;
};

export const testerGroups = (stack: ImageStack, selection: VariantSelection): TesterGroup[] => {
  const groups: TesterGroup[] = [];
  if (stack.pictures.length > 1) {
    groups.push({
      key: ALTERNATE,
      label: "Alternate",
      options: stack.pictures.map((picture) => picture.alternate ?? AS_IS),
      default: stack.pictures[0]!.alternate ?? AS_IS,
      switch: false,
    });
  }
  for (const group of pictureFor(stack, selection).groups) {
    const resting = group.default ?? (group.switch ? "off" : AS_IS);
    const options = group.switch || group.default !== undefined ? group.options : [AS_IS, ...group.options];
    if (options.length > 1) {
      groups.push({ key: group.name, label: group.name, options, default: resting, switch: group.switch });
    }
  }
  return groups;
};

export const chosenIn = (group: TesterGroup, selection: VariantSelection): string => {
  const value = selection[group.key];
  return value !== undefined && group.options.includes(value) ? value : group.default;
};

export const isChanged = (stack: ImageStack, selection: VariantSelection): boolean =>
  testerGroups(stack, selection).some((group) => chosenIn(group, selection) !== group.default);

export const variantOf = (stack: ImageStack, selection: VariantSelection): ImageVariant => {
  const picture = pictureFor(stack, selection);
  const image =
    stack.kind === "files" && picture.alternate !== null ? `${stack.name}@${picture.alternate}` : stack.name;
  const accepting = (option: string) =>
    picture.groups.filter((group) => group.options.some((candidate) => matchesAttributeOption(option, candidate)))
      .length;
  const named = new Set(picture.groups.map((group) => group.name));
  const attributes = testerGroups(stack, selection)
    .filter((group) => group.key !== ALTERNATE)
    .flatMap((group) => {
      const value = chosenIn(group, selection);
      if (value === group.default) {
        return [];
      }
      if (group.switch) {
        return [value === "on" ? group.key : `${group.key}.off`];
      }
      const bare = accepting(value) === 1 && !named.has(value) && value !== "on" && value !== "off";
      return [bare ? value : `${group.key}.${value}`];
    });
  return { image, attributes };
};

export const referenceOf = (variant: ImageVariant, form: VariantForm): string => {
  const name = [variant.image, ...variant.attributes].join(":");
  return form === "backdrop" ? `[[show backdrop ${name}]]` : `[[${name}]]`;
};

const SHOWN_AS_BACKDROP = /\[\[\s*show\s+backdrop\b/;

export const defaultForm = ({
  kinds,
  lines,
  pixels,
}: {
  kinds: readonly string[];
  lines: readonly string[];
  pixels?: { width: number; height: number } | null;
}): VariantForm => {
  if (kinds.includes("portrait") !== kinds.includes("backdrop")) {
    return kinds.includes("portrait") ? "portrait" : "backdrop";
  }
  const backdrops = lines.filter((line) => SHOWN_AS_BACKDROP.test(line)).length;
  const portraits = lines.length - backdrops;
  if (backdrops || portraits) {
    return backdrops >= portraits ? "backdrop" : "portrait";
  }
  return pixels && pixels.height > pixels.width ? "portrait" : "backdrop";
};

const conditionsOf = (layer: string): string[] | null => {
  const parsed = parseLayerName(layer);
  if (parsed.diagnostics.length) {
    return null;
  }
  return parsed.conditions.map((condition) => [condition.group, ...condition.options].join("."));
};

export const fileRole = (stack: ImageStack, member: StackMember): string => {
  if (member.layer === undefined) {
    if (member.alternate !== null) {
      return `Alternate · ${member.alternate}`;
    }
    return stack.pictures.length > 1 ? "Alternate · plain" : "Base";
  }
  const conditions = conditionsOf(member.layer);
  const isDefault = parseLayerName(member.layer).default;
  if (stack.kind === "folder" && stack.members[0]?.path === member.path && conditions?.length === 0 && !isDefault) {
    return "Base";
  }
  return [
    member.order === undefined ? "Layer" : `Layer ${member.order}`,
    ...(conditions === null ? [member.layer] : conditions.length ? conditions : ["always shown"]),
    isDefault ? "default" : "",
    member.alternate !== null ? `on ${member.alternate}` : "",
  ]
    .filter(Boolean)
    .join(" · ");
};

export interface FileRow {
  path: string;
  name: string;
  role: string;
  size: number;
}

const leafOf = (path: string) => path.slice(path.lastIndexOf("/") + 1);

export const fileRows = (stack: ImageStack, sizes: Readonly<Record<string, number>>): FileRow[] =>
  [...stack.members]
    .sort((a, b) => leafOf(a.path).localeCompare(leafOf(b.path), undefined, { numeric: true, sensitivity: "base" }))
    .map((member) => ({
      path: member.path,
      name: leafOf(member.path),
      role: fileRole(stack, member),
      size: sizes[member.path] ?? 0,
    }));

export const filesSummary = (rows: readonly FileRow[]): string =>
  `${plural(rows.length, "file")} · ${bytesLabel(rows.reduce((sum, row) => sum + row.size, 0))}`;
