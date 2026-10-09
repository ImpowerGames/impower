// Installed only in the driver's private extensions directory. Exercise the
// public VS Code API and the shipped extension's commands in the real host.
const vscode = require("vscode");
const fs = require("node:fs");
const path = require("node:path");
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const config = () => JSON.parse(fs.readFileSync(process.env.IMPOWER_DESKTOP_SCENARIO, "utf8"));
const save = (name, report) => fs.writeFileSync(path.join(config().evidence, name), JSON.stringify(report, null, 2));
async function until(read, message, timeout = 90000) {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    const value = await read();
    if (value) return value;
    await sleep(500);
  }
  throw new Error(message);
}
const diagnosticSnapshot = () => vscode.languages.getDiagnostics().flatMap(([uri, list]) => list.map(d => ({
  file: uri.fsPath, uri: uri.toString(), message: d.message,
  severity: ["error", "warning", "information", "hint"][d.severity], source: d.source ?? "",
  line: d.range.start.line + 1, character: d.range.start.character + 1,
}))).sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));

async function settledDiagnostics() {
  let previous = "", repeats = 0, diagnostics;
  await until(() => {
    diagnostics = diagnosticSnapshot();
    const next = JSON.stringify(diagnostics);
    repeats = next === previous ? repeats + 1 : 0;
    previous = next;
    return repeats >= 5;
  }, "Diagnostics did not settle");
  return diagnostics;
}

async function finalDiagnostics() {
  const report = { failed: [] };
  try { report.diagnostics = await settledDiagnostics(); }
  catch (error) { report.failed.push(error.message); }
  save("diagnostics-report.json", report);
}

async function run() {
  const spec = config();
  const report = { failed: [], version: vscode.version, workspace: vscode.workspace.workspaceFolders?.map(f => f.uri.fsPath) };
  try {
    const extension = vscode.extensions.getExtension("impowergames.sparkdown");
    if (extension) await extension.activate();
    // A browser-only extension runs in the web worker host and is absent
    // from this Node host's extensions collection. The driver identifies
    // that loaded bundle through the worker debugger's script URL/hash.
    report.extension = extension ? { path: extension.extensionPath, active: extension.isActive, version: extension.packageJSON.version } : { host: "web worker" };
    const document = await vscode.workspace.openTextDocument(vscode.Uri.file(path.resolve(spec.project, spec.file)));
    if (document.languageId !== "sparkdown") throw new Error(`Wrong language: ${document.languageId}`);
    const line = (spec.line ?? 1) - 1;
    const editor = await vscode.window.showTextDocument(document, { selection: new vscode.Range(line, 0, line, 0), preview: false });
    editor.revealRange(editor.selection, vscode.TextEditorRevealType.InCenter);
    report.document = { uri: document.uri.toString(), version: document.version, line: editor.selection.active.line + 1 };
    await until(() => vscode.commands.executeCommand("vscode.provideDocumentSemanticTokensLegend", document.uri), "Semantic token provider never registered");
    report.semanticTokens = {};
    for (const [method, command, args] of [
      ["full", "vscode.provideDocumentSemanticTokens", [document.uri]],
      ["range", "vscode.provideDocumentRangeSemanticTokens", [document.uri, new vscode.Range(line, 0, Math.min(document.lineCount - 1, line + 10), 0)]],
    ]) {
      try {
        const tokens = await vscode.commands.executeCommand(command, ...args);
        if (!tokens?.data) throw new Error(`${method} semantic token request returned no result`);
        report.semanticTokens[method] = { length: tokens.data.length };
      } catch (e) { report.failed.push(String(e.message ?? e)); }
    }
    report.diagnostics = await settledDiagnostics();
    // The initial selection can precede browser-extension activation. Make a
    // real subsequent selection after language registration, as an author does.
    editor.selection = new vscode.Selection(line, 1, line, 1);
    await sleep(100);
    await vscode.commands.executeCommand("sparkdown.previewGame");
    report.previewCommand = "sparkdown.previewGame";
  } catch (e) { report.failed.push(String(e.stack ?? e)); }
  save("host-report.json", report);
}

async function debug() {
  const report = { failed: [] };
  try {
    if (vscode.debug.activeDebugSession?.type !== "game") await vscode.commands.executeCommand("sparkdown.debugGame");
    const session = await until(() => vscode.debug.activeDebugSession, "No Sparkdown debug session");
    report.type = session.type;
    const threads = await session.customRequest("threads");
    const threadId = threads.threads?.[0]?.id;
    if (threadId == null) throw new Error("Debugger returned no thread");
    await session.customRequest("pause", { threadId });
    const stack = await until(async () => {
      const result = await session.customRequest("stackTrace", { threadId });
      return result.stackFrames?.length ? result : null;
    }, "Pause returned no stack");
    report.stack = stack.stackFrames;
    const scopes = await session.customRequest("scopes", { frameId: stack.stackFrames[0].id });
    if (!scopes.scopes?.length) throw new Error("Paused frame has no scopes");
    report.variables = [];
    for (const scope of scopes.scopes) {
      report.variables.push({ scope: scope.name, ...await session.customRequest("variables", { variablesReference: scope.variablesReference }) });
    }
    report.evaluation = await session.customRequest("evaluate", { expression: config().debug.expression, frameId: stack.stackFrames[0].id, context: "repl" });
    if (report.evaluation.result !== config().debug.result) throw new Error(`Evaluation returned ${report.evaluation.result}`);
    await session.customRequest("next", { threadId });
    const location = frames => JSON.stringify(frames.map(f => [f.source?.path, f.line, f.column]));
    report.stepped = await until(async () => {
      const next = await session.customRequest("stackTrace", { threadId });
      return next.stackFrames?.length && location(next.stackFrames) !== location(report.stack) ? next : null;
    }, "Step did not change the stack location");
    await session.customRequest("continue", { threadId });
    report.continued = true;
    await vscode.debug.stopDebugging(session);
  } catch (e) { report.failed.push(String(e.stack ?? e)); }
  save("debug-report.json", report);
}

exports.activate = context => {
  // Supply the scenario folder to the real checked-in F5 configuration. Opening
  // it at launch avoids replacing the development window and ending its session.
  context.subscriptions.push(vscode.debug.registerDebugConfigurationProvider("extensionHost", {
    resolveDebugConfiguration(_folder, configuration) {
      const spec = config();
      if (spec.mode === "f5") {
        configuration.args = [...(configuration.args ?? []), spec.project];
        save("launch-report.json", configuration);
      }
      return configuration;
    },
  }));
  context.subscriptions.push(vscode.commands.registerCommand("impower.driver.run", run));
  context.subscriptions.push(vscode.commands.registerCommand("impower.driver.debug", debug));
  context.subscriptions.push(vscode.commands.registerCommand("impower.driver.diagnostics", finalDiagnostics));
};
