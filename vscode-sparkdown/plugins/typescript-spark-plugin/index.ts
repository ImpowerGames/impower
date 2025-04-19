import * as fs from "fs";
import * as path from "path";
import * as ts from "typescript/lib/tsserverlibrary";

const DECLARATIONS = "{{DECLARATIONS}}";

let virtualFilePath: string;
let virtualFileContent: string;

export = function init(modules: { typescript: typeof ts }) {
  const ts = modules.typescript;

  return {
    create(info: ts.server.PluginCreateInfo): ts.LanguageService {
      const logger = info.project.projectService.logger;
      logger.info("typescript-spark-plugin: initializing");

      const globalDeclarations = /declare\s+global\s*\{/.test(DECLARATIONS)
        ? DECLARATIONS
        : [
            "export {};",
            "declare global {",
            DECLARATIONS.replace("export {};", ""),
            "}",
          ].join("\n");

      const projectDir = info.project.getCurrentDirectory();
      virtualFilePath = path.join(projectDir, "./.spark/runtime/index.d.ts");

      logger.info(
        `typescript-spark-plugin: reading types at ${virtualFilePath}`
      );

      // Ensure the virtual file exists
      if (!fs.existsSync(virtualFilePath)) {
        const virtualFileFolder = path.dirname(virtualFilePath);
        if (virtualFileFolder) {
          fs.mkdirSync(virtualFileFolder, { recursive: true });
        }
        fs.writeFileSync(virtualFilePath, globalDeclarations);
      }

      virtualFileContent = fs.readFileSync(virtualFilePath, "utf8");

      if (virtualFileContent !== globalDeclarations) {
        fs.writeFileSync(virtualFilePath, globalDeclarations);
      }

      const originalGetScriptFileNames =
        info.languageServiceHost.getScriptFileNames;
      info.languageServiceHost.getScriptFileNames = () => {
        const original = originalGetScriptFileNames.call(
          info.languageServiceHost
        );
        return [...original, virtualFilePath];
      };

      const originalGetScriptSnapshot =
        info.languageServiceHost.getScriptSnapshot;
      info.languageServiceHost.getScriptSnapshot = (fileName: string) => {
        if (fileName === virtualFilePath) {
          return ts.ScriptSnapshot.fromString(globalDeclarations);
        }
        return originalGetScriptSnapshot.call(
          info.languageServiceHost,
          fileName
        );
      };

      const originalGetCompilationSettings =
        info.languageServiceHost.getCompilationSettings;
      info.languageServiceHost.getCompilationSettings = () => {
        const settings = originalGetCompilationSettings.call(
          info.languageServiceHost
        );
        return {
          allowJs: true,
          checkJs: true,
          skipLibCheck: true,
          noEmit: true,
          target: ts.ScriptTarget.ESNext,
          module: ts.ModuleKind.ESNext,
          moduleResolution: ts.ModuleResolutionKind.NodeJs, // Must be NodeJs to auto-include global declarations
          typeRoots: [".spark"],
          ...settings,
        };
      };

      logger.info("typescript-spark-plugin: initialized");

      return info.languageService;
    },
  };
};
