import { showSnackbar } from "./snackbar";

const basename = (path: string) => path.split("/").pop() || path;

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
    showSnackbar({
      message: reason.includes("already exists")
        ? `Couldn't rename ${basename(fromPath)}: ${basename(toPath)} already exists.`
        : `Couldn't rename ${basename(fromPath)}.`,
    });
    return { renamed: false };
  }
}
