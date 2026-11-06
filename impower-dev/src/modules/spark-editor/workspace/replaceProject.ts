import { isScriptPath } from "../utils/scriptFiles";

export type ReplaceProjectRequest = {
  readonly fileName: string;
  readonly projectName: string;
  readonly scripts: number;
  readonly assets: number;
};

export const countProjectFiles = (
  relativePaths: readonly string[],
): { scripts: number; assets: number } => {
  const authored = relativePaths.filter((path) => !path.startsWith("."));
  const scripts = authored.filter(isScriptPath).length;
  return { scripts, assets: authored.length - scripts };
};

const counted = (count: number, noun: string) =>
  `${count} ${noun}${count === 1 ? "" : "s"}`;

export const replaceProjectSummary = ({
  fileName,
  projectName,
  scripts,
  assets,
}: ReplaceProjectRequest): string =>
  `Everything in ${projectName} is replaced by the contents of ${fileName}: its ${counted(scripts, "script")} and ${counted(assets, "asset")} go, and any file the backup lacks is removed for good. The recycle bin does not keep them.`;
