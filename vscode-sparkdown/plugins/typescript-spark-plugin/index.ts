import * as ts from "typescript/lib/tsserverlibrary";
import INLINE_DECLARATIONS from "./_declarations.text";

function init(modules: {
  typescript: typeof import("typescript/lib/tsserverlibrary");
}) {
  const ts = modules.typescript;

  function create(info: ts.server.PluginCreateInfo) {
    const project = info.project;
    project.projectService.logger.info(
      "spark typescript server plugin activated."
    );

    const virtualFileName = "/virtual/types.d.ts";
    const virtualFileContent = INLINE_DECLARATIONS;

    // Monkey-patch getScriptFileNames to include the virtual file
    const origGetScriptFileNames = project.getScriptFileNames;
    project.getScriptFileNames = () => [
      ...origGetScriptFileNames.call(project),
      virtualFileName,
    ];

    // Monkey-patch getScriptSnapshot to return content for virtual file
    const origGetScriptSnapshot = project.getScriptSnapshot;
    project.getScriptSnapshot = (fileName: string) => {
      if (fileName === virtualFileName) {
        return ts.ScriptSnapshot.fromString(virtualFileContent);
      }
      return origGetScriptSnapshot.call(project, fileName);
    };

    return info.languageService;
  }

  return { create };
}

export = init;
