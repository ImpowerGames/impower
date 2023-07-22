import * as path from "path";
import * as vscode from "vscode";

interface PackageManifest {
  uri: string;
  files: { uri: string }[];
}

export class SparkPackageManager {
  private static _instance: SparkPackageManager;
  static get instance(): SparkPackageManager {
    if (!this._instance) {
      this._instance = new SparkPackageManager();
    }
    return this._instance;
  }

  async getPackages(filePattern: string): Promise<PackageManifest[]> {
    const packages: PackageManifest[] = [];
    const packageFiles = await vscode.workspace.findFiles("**/package.sd");
    await Promise.all(
      packageFiles.map(async (packageUri) => {
        const workspaceFolder: vscode.WorkspaceFolder | undefined =
          vscode.workspace.getWorkspaceFolder(packageUri);
        if (!workspaceFolder) {
          return;
        }
        const workspaceFolderPath: string = workspaceFolder.uri.path;
        let relativeSearchFolderPrefix = path.normalize(
          path.dirname(packageUri.path)
        );
        relativeSearchFolderPrefix = path.relative(
          workspaceFolderPath,
          relativeSearchFolderPrefix
        );
        const relativePattern: vscode.RelativePattern =
          new vscode.RelativePattern(
            workspaceFolderPath,
            relativeSearchFolderPrefix + "/" + filePattern
          );
        const files = await vscode.workspace.findFiles(relativePattern);
        packages.push({
          uri: packageUri.toString(),
          files: files.map((fileUri) => ({
            uri: fileUri.toString(),
          })),
        });
      })
    );
    return packages;
  }
}
