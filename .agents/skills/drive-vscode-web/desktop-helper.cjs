// Installed only in the driver's private extensions directory. Never bundled
// with Sparkdown: this uses public VS Code APIs and writes one-shot evidence.
const vscode = require('vscode');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const bounded = async (promise, ms, label) => {
  let timer;
  try { return await Promise.race([promise, new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(label + ' timed out')), ms); })]); }
  finally { clearTimeout(timer); }
};

exports.activate = async context => {
  const planFile = process.env.IMPOWER_VSCODE_PROBE_PLAN;
  if (!planFile) return;
  const plan = JSON.parse(fs.readFileSync(planFile, 'utf8'));
  const save = result => fs.writeFileSync(plan.result, JSON.stringify({ runId: plan.runId, ...result }, null, 2));
  context.subscriptions.push(vscode.commands.registerCommand('impower.verification.stopTasks', async () => {
    const executions = [...vscode.tasks.taskExecutions];
    await Promise.all(executions.map(execution => new Promise((resolve, reject) => {
      const timer = setTimeout(() => { subscription.dispose(); reject(new Error('Owned task did not exit: ' + execution.task.name)); }, 10000);
      const subscription = vscode.tasks.onDidEndTask(e => {
        if (e.execution === execution) { clearTimeout(timer); subscription.dispose(); resolve(); }
      });
      execution.terminate();
    })));
    fs.writeFileSync(plan.events + '.stopped', JSON.stringify(executions.map(e => e.task.name)));
  }));
  const ext = vscode.extensions.getExtension('impowergames.sparkdown');
  // The F5 parent has only this helper installed; the development host has
  // Sparkdown. Observe the real launch and move that host to the external root.
  if (plan.scenario === 'f5' && vscode.workspace.workspaceFolders?.[0]?.uri.fsPath.toLowerCase() === plan.repoRoot.toLowerCase()) {
    context.subscriptions.push(vscode.commands.registerCommand('impower.verification.startF5', async () => {
      const started = await vscode.debug.startDebugging(vscode.workspace.workspaceFolders[0], 'Launch vscode-sparkdown');
      fs.appendFileSync(plan.events, JSON.stringify({ event: 'named-launch', name: 'Launch vscode-sparkdown', started }) + '\n');
    }));
    context.subscriptions.push(vscode.tasks.onDidStartTask(e => fs.appendFileSync(plan.events, JSON.stringify({ event: 'task-start', name: e.execution.task.name }) + '\n')));
    context.subscriptions.push(vscode.tasks.onDidEndTaskProcess(e => fs.appendFileSync(plan.events, JSON.stringify({ event: 'task-exit', name: e.execution.task.name, exitCode: e.exitCode }) + '\n')));
    fs.appendFileSync(plan.events, JSON.stringify({ event: 'parent-ready', root: vscode.workspace.workspaceFolders?.[0]?.uri.fsPath }) + '\n');
    return;
  }
  if (ext && path.resolve(ext.extensionPath).toLowerCase() !== path.resolve(plan.extensionPath).toLowerCase()) {
    save({ failed: ['Wrong Sparkdown extension path: ' + ext.extensionPath] });
    return;
  }
  if (vscode.workspace.workspaceFolders?.[0]?.uri.fsPath.toLowerCase() !== plan.project.toLowerCase()) {
    await vscode.commands.executeCommand('vscode.openFolder', vscode.Uri.file(plan.project), false);
    return;
  }
  const report = { failed: [], requests: [], version: vscode.version, workspaceRoot: vscode.workspace.workspaceFolders[0].uri.fsPath, extensionPath: ext?.extensionPath ?? plan.extensionPath, extensionVisibility: ext ? 'public API' : 'separate web worker host' };
  const snapshot = () => vscode.languages.getDiagnostics().flatMap(([uri, diagnostics]) => diagnostics.map(d => ({ file: uri.fsPath, severity: ['error', 'warning', 'info', 'hint'][d.severity], message: d.message, source: d.source ?? '', start: { line: d.range.start.line + 1, column: d.range.start.character + 1 }, end: { line: d.range.end.line + 1, column: d.range.end.character + 1 } })));
  try {
    if (ext) await bounded(ext.activate(), plan.timeoutMs, 'Sparkdown activation');
    report.loadedBuild = { extension: crypto.createHash('sha256').update(fs.readFileSync(path.join(plan.extensionPath, 'out/extension.js'))).digest('hex'), meaning: 'on-disk fingerprint at activation in a fresh development host' };
    const document = await vscode.workspace.openTextDocument(vscode.Uri.file(plan.script));
    const editor = await vscode.window.showTextDocument(document, { preview: false });
    report.document = { uri: document.uri.toString(), version: document.version, languageId: document.languageId };
    if (document.languageId !== 'sparkdown') throw new Error('Requested script is not a Sparkdown document');
    const first = document.getText().split(/\r?\n/).findIndex(line => line.includes(plan.firstText));
    if (first < 0) throw new Error('Expected initial story text is absent from the selected script');
    editor.selection = new vscode.Selection(first, 0, first, 0);
    editor.revealRange(editor.selection);
    const range = new vscode.Range(0, 0, document.lineCount - 1, document.lineAt(document.lineCount - 1).text.length);
    // Opening the document activates the separate browser extension host.
    // Wait for a real symbol reply before requesting semantic tokens there.
    const readyBy = Date.now() + plan.timeoutMs;
    let symbols;
    while (Date.now() < readyBy) {
      symbols = await bounded(vscode.commands.executeCommand('vscode.executeDocumentSymbolProvider', document.uri), plan.timeoutMs, 'Document symbols readiness');
      if (symbols?.length) break;
      await sleep(250);
    }
    for (const [method, command, args] of [
      ['textDocument/semanticTokens/full', 'vscode.provideDocumentSemanticTokens', [document.uri]],
      ['textDocument/semanticTokens/range', 'vscode.provideDocumentRangeSemanticTokens', [document.uri, range]],
      ['textDocument/documentSymbol', 'vscode.executeDocumentSymbolProvider', [document.uri]],
    ]) {
      try {
        const answer = method === 'textDocument/documentSymbol' ? symbols : await bounded(vscode.commands.executeCommand(command, ...args), plan.timeoutMs, method);
        const length = answer?.data?.length ?? (Array.isArray(answer) ? answer.length : undefined);
        if (length === undefined || length === 0) throw new Error('Provider returned no usable result');
        report.requests.push({ method, success: true, length, documentVersion: document.version });
      } catch (error) {
        report.requests.push({ method, success: false, error: error.message });
        report.failed.push(method + ': ' + error.message);
      }
    }
    // Require repeated complete snapshots after the explicit requests, rather
    // than interpreting a stable status-bar count as a successful request.
    let previous, stable = 0;
    const deadline = Date.now() + plan.timeoutMs;
    while (Date.now() < deadline && stable < 8) {
      const current = JSON.stringify(snapshot());
      stable = current === previous ? stable + 1 : 0;
      previous = current;
      await sleep(250);
    }
    report.diagnostics = snapshot();
    report.settled = stable >= 8;
    if (!report.settled) report.failed.push('Diagnostic snapshots did not settle');
    await vscode.commands.executeCommand('sparkdown.previewGame');
    report.previewCommand = 'sparkdown.previewGame';
  } catch (error) { report.failed.push(error.stack ?? error.message); }
  save(report);
};
