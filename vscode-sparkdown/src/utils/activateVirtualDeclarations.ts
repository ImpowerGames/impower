import * as vscode from "vscode";

export async function activateVirtualDeclarations(
  context: vscode.ExtensionContext,
) {
  // Fetch global declarations
  const globalDeclarations = await getGlobalDeclarations(context);
  if (!globalDeclarations) {
    return;
  }

  // Run once on activation
  await updateAllWorkspacesIfNeeded(globalDeclarations);

  // Watch for workspace folders changing
  context.subscriptions.push(
    vscode.workspace.onDidChangeWorkspaceFolders(async (event) => {
      for (const folder of event.added) {
        await updateWorkspaceIfNeeded(folder, globalDeclarations);
      }
    }),
  );

  // Watch for creating .ts, .sd, or .json
  const fileWatcher =
    vscode.workspace.createFileSystemWatcher("**/*.{ts,sd,json}");
  context.subscriptions.push(fileWatcher);
  fileWatcher.onDidCreate(async (uri) => {
    const workspaceFolder = vscode.workspace.getWorkspaceFolder(uri);
    if (workspaceFolder) {
      await updateWorkspaceIfNeeded(workspaceFolder, globalDeclarations);
    }
  });

  // Watch for deleting declarations file
  const declarationsWatcher = vscode.workspace.createFileSystemWatcher(
    getUserDeclarationsLocalFilePath().join("/"),
  );
  context.subscriptions.push(declarationsWatcher);
  declarationsWatcher.onDidDelete(async (uri) => {
    const workspaceFolder = vscode.workspace.getWorkspaceFolder(uri);
    if (workspaceFolder) {
      await updateWorkspaceIfNeeded(workspaceFolder, globalDeclarations);
    }
  });
}

async function getGlobalDeclarations(context: vscode.ExtensionContext) {
  const declarationsUri = vscode.Uri.joinPath(
    context.extensionUri,
    "out",
    "data",
    "spark.d.ts",
  );
  // The runtime build works without the optional editor type bundle.
  const declarationsFile = await vscode.workspace.fs.readFile(declarationsUri).then(
    file => file,
    (error: unknown) => {
      if (
        error && typeof error === "object" && "code" in error &&
        error.code === "FileNotFound"
      ) {
        return undefined;
      }
      // The served workbench's HTTP filesystem wraps a 404 as Unknown.
      if (
        error && typeof error === "object" && "code" in error &&
        error.code === "Unknown" && "message" in error &&
        (error.message === "Not Found" ||
          error.message === "Unknown (FileSystemError): Not Found")
      ) {
        return undefined;
      }
      throw error;
    },
  );
  if (!declarationsFile) {
    return;
  }
  const declarationsFileContent = new TextDecoder().decode(declarationsFile);
  const globalDeclarations = /declare\s+global\s*\{/.test(
    declarationsFileContent,
  )
    ? declarationsFileContent
    : [
        "export {};",
        "declare global {",
        declarationsFileContent.replace("export {};", ""),
        "}",
      ].join("\n");
  return globalDeclarations;
}

async function updateAllWorkspacesIfNeeded(globalDeclarations: string) {
  if (!vscode.workspace.workspaceFolders) {
    return;
  }

  await Promise.all(
    vscode.workspace.workspaceFolders.map(async (workspaceFolder) => {
      updateWorkspaceIfNeeded(workspaceFolder, globalDeclarations);
    }),
  );
}

async function updateWorkspaceIfNeeded(
  workspaceFolder: vscode.WorkspaceFolder,
  globalDeclarations: string,
) {
  const [hasSd, hasTs, hasTsconfig] = await Promise.all([
    hasFileInFolder(workspaceFolder, "**/*.sd"),
    hasFileInFolder(workspaceFolder, "**/*.ts"),
    hasFileInFolder(workspaceFolder, "tsconfig.json"),
  ]);
  if (hasSd && (hasTs || hasTsconfig)) {
    const existingFile = await readUserDeclarationsFile(workspaceFolder);
    if (!existingFile || existingFile !== globalDeclarations) {
      await createUserDeclarationsFile(workspaceFolder, globalDeclarations);
    }
  }
}

function getUserDeclarationsLocalFilePath() {
  return [".spark", "runtime", "index.d.ts"];
}
function getUserDeclarationsWorkspaceFileUri(
  workspaceFolder: vscode.WorkspaceFolder,
) {
  return vscode.Uri.joinPath(
    workspaceFolder.uri!,
    ...getUserDeclarationsLocalFilePath(),
  );
}
async function readUserDeclarationsFile(
  workspaceFolder: vscode.WorkspaceFolder,
) {
  try {
    const uri = getUserDeclarationsWorkspaceFileUri(workspaceFolder);
    const file = await vscode.workspace.fs.readFile(uri);
    return new TextDecoder().decode(file);
  } catch {
    return null;
  }
}

async function createUserDeclarationsFile(
  workspaceFolder: vscode.WorkspaceFolder,
  globalDeclarations: string,
) {
  const uri = getUserDeclarationsWorkspaceFileUri(workspaceFolder);
  const dir = uri.with({
    path: uri.path.substring(0, uri.path.lastIndexOf("/")),
  });
  await vscode.workspace.fs.createDirectory(dir);
  await vscode.workspace.fs.writeFile(
    uri,
    Buffer.from(globalDeclarations, "utf8"),
  );
}

async function hasFileInFolder(
  folder: vscode.WorkspaceFolder,
  pattern: string,
): Promise<boolean> {
  const result = await vscode.workspace.findFiles(
    new vscode.RelativePattern(folder, pattern),
    "**/node_modules/**",
    1,
  );
  return result.length > 0;
}
