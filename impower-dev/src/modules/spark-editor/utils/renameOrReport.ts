import type { WorkspaceEditRollback } from "@impower/spark-editor-protocol/src/protocols/workspace/ApplyWorkspaceEditMessage";
import { showSnackbar } from "./snackbar";

const basename = (path: string) => path.split("/").pop() || path;

const rollbackOf = (err: unknown) =>
  (err as { rollback?: WorkspaceEditRollback } | null)?.rollback;

export async function renameOrReport<T>(
  fromPath: string,
  toPath: string,
  rename: () => Promise<T>,
): Promise<{ renamed: true; result: T } | { renamed: false }> {
  try {
    return { renamed: true, result: await rename() };
  } catch (err) {
    console.error(err);
    const reason = String((err as { message?: unknown })?.message ?? err);
    const rollback = rollbackOf(err);
    const changed = rollback ? [...rollback.failed, ...rollback.kept] : [];
    const trashed = rollback?.trashed ?? [];
    showSnackbar({
      message: rollback && !rollback.complete
        ? `Couldn't rename ${basename(fromPath)}${changed.length > 0 ? `, and these files may be left changed: ${changed.join(", ")}` : ""}.${trashed.length > 0 ? ` Copies of what was replaced are in the Trash: ${trashed.join(", ")}.` : ""}`
        : reason.includes("already exists")
          ? `Couldn't rename ${basename(fromPath)}: ${basename(toPath)} already exists.`
          : rollback
            ? `Couldn't rename ${basename(fromPath)}. Nothing was changed.`
            : `Couldn't rename ${basename(fromPath)}.`,
    });
    return { renamed: false };
  }
}
