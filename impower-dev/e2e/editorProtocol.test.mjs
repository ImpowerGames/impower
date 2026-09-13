import assert from "node:assert/strict";
import { test } from "node:test";
import { chromium } from "playwright";
import { WebSocket } from "ws";
import { once } from "node:events";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { withEditor, openEditorPage, resolveChromiumExecutablePath, seedProject, languageSurface, shotOf, waitForEditor, focusEditor } from "../../.agents/skills/drive-web-editor/driver.mjs";

function socketRequest(socket, id, method, params = {}) {
  return new Promise((resolve, reject) => {
    const cleanup = () => { clearTimeout(timer); socket.off("message", receive); socket.off("close", closed); };
    const receive = (bytes) => {
      const message = JSON.parse(bytes.toString());
      if (message.id === id) { cleanup(); resolve(message); }
    };
    const closed = () => { cleanup(); reject(new Error("Socket closed before its response")); };
    const timer = setTimeout(() => { cleanup(); reject(new Error(`No response to ${method}`)); }, 30_000);
    socket.on("message", receive);
    socket.on("close", closed);
    socket.send(JSON.stringify({ jsonrpc: "2.0", id, method, params }));
  });
}

// Start the two servers with the committed driver before running this test.
// An ephemeral browser context keeps the test out of the driver's saved project.
test("open, settle, hover, and read through both editor protocol transports", { timeout: 180_000 }, async () => {
  await withEditor(async ({ page, url }) => {
    await openEditorPage(page, url);
    assert.ok((await waitForEditor(page)).textDocument.uri);
    await focusEditor(page);
    const fixture = fs.mkdtempSync(path.join(os.tmpdir(), "impower-protocol-project-"));
    const png = await page.evaluate(() => {
      const canvas = document.createElement("canvas");
      canvas.width = 24; canvas.height = 36;
      canvas.getContext("2d").fillRect(0, 0, 24, 36);
      return canvas.toDataURL("image/png").split(",")[1];
    });
    fs.mkdirSync(path.join(fixture, "assets"));
    fs.writeFileSync(path.join(fixture, "assets", "portrait.svg"), '<svg xmlns="http://www.w3.org/2000/svg" width="80" height="120"><rect width="80" height="120" fill="red"/></svg>');
    fs.writeFileSync(path.join(fixture, "main.sd"), "ALICE:\n  Initial fixture.\n");
    fs.writeFileSync(path.join(fixture, "zz.png"), Buffer.from(png, "base64"));
    fs.mkdirSync(path.join(fixture, "bulk"));
    for (let index = 0; index < 32; index++) fs.writeFileSync(path.join(fixture, "bulk", `${index}.txt`), "Small import fixture.");
    fs.writeFileSync(path.join(fixture, "assets", "exported.svg"), '<svg xmlns="http://www.w3.org/2000/svg" xmlns:inkscape="http://www.inkscape.org/namespaces/inkscape"><rect inkscape:label="Body" width="8" height="8"/></svg>');
    const seeded = await seedProject(page, fixture);
    assert.equal(seeded.storage, "replaced", seeded.reason);
    assert.equal(seeded.files, 36);
    // Match the driver: reload immediately, before waiting for any cache work.
    await page.reload({ waitUntil: "domcontentloaded" });
    assert.ok((await waitForEditor(page)).textDocument.uri);
    assert.ok(await page.evaluate(async () => {
      const cache = await caches.open("asset-thumbnails");
      return (await cache.keys()).some(key => key.url.includes("/local/zz.png?thumb="));
    }), "the last imported raster's thumbnail must survive immediate reload");
    assert.ok(await page.evaluate(async () => {
      const data = await window.__editorProtocol.send({ jsonrpc: "2.0", id: "normalized-svg", method: "workspace/readFile", params: { file: { uri: "file://local/assets/exported.svg" } } });
      return new TextDecoder().decode(data).includes('data-name="Body"');
    }), "the import's SVG label normalization must survive seed verification");
    const result = await page.evaluate(async () => {
      const bridge = window.__editorProtocol;
      const send = (method, params = {}) => bridge.send({ jsonrpc: "2.0", id: crypto.randomUUID(), method, params });
      const project = await send("window/loadedProjectId");
      const uri = `file://${project.id}/scripts/protocol-test.sd`;
      await send("workspace/willCreateFiles", { files: [
        { uri, data: new TextEncoder().encode("[[portrait]]\nALICE:\n  Hello from the protocol test.\n").buffer },
      ] });
      const notifications = [];
      const unsubscribe = bridge.subscribe((message) => {
        if (message.method === "textDocument/didSettleDiagnostics") notifications.push(message.params);
      });
      try {
        const loaded = new Promise((resolve, reject) => {
          const stop = bridge.subscribe((message) => {
            if (message.method === "editor/didLoad" && message.params.textDocument.uri === uri) {
              clearTimeout(timer); stop(); resolve(message.params);
            }
          });
          const timer = setTimeout(() => { stop(); reject(new Error("Editor did not load the requested file")); }, 30_000);
        });
        await bridge.send({ jsonrpc: "2.0", method: "window/didOpenFileEditor", params: { pane: "logic", panel: "scripts", filename: "scripts/protocol-test.sd" } });
        await loaded;
        const editor = await send("editor/read");
        const diagnostics = await send("textDocument/diagnosticsSettled", { textDocument: { uri }, version: editor.textDocument.version });
        const hover = await send("textDocument/hover", { textDocument: { uri }, position: { line: 0, character: 4 } });
        return { project, uri, diagnostics, hover, notifications, version: editor.textDocument.version };
      } finally { unsubscribe(); }
    });
    assert.equal(result.project.id, "local");
    assert.equal(result.diagnostics.uri, result.uri);
    assert.ok(Array.isArray(result.diagnostics.diagnostics));
    assert.ok(result.diagnostics.version >= result.version);
    assert.equal(result.notifications.length, 1);
    assert.equal(result.notifications[0].uri, result.uri);
    assert.ok(result.hover?.contents, `hover must carry actual language-server contents: ${JSON.stringify(result)}`);
    assert.equal(result.hover.images[0].naturalWidth, 80);
    assert.equal(result.hover.images[0].naturalHeight, 120);
    const socket = new WebSocket(`${url.replace("http:", "ws:")}/__editor_protocol?role=client`);
    try {
      await once(socket, "open");
      assert.deepEqual((await socketRequest(socket, "socket-project", "window/loadedProjectId")).result, result.project);
      assert.equal((await socketRequest(socket, "socket-editor", "editor/read")).result?.textDocument?.uri, result.uri, "the socket must be owned by this test's editor");
      // Reload migrates root-level images into the project's assets directory.
      const fileResponse = await socketRequest(socket, "socket-file", "workspace/readFile", { file: { uri: "file://local/assets/zz.png" } });
      assert.ok(fileResponse.result, JSON.stringify(fileResponse));
      assert.deepEqual(Buffer.from(fileResponse.result.$sparkBuffer, "base64"), Buffer.from(png, "base64"));
      const missing = await socketRequest(socket, "missing-file", "workspace/readFile", { file: { uri: "file://local/does-not-exist.txt" } });
      assert.ok(missing.error?.message);
      assert.doesNotMatch(missing.error.message, /\[object Object\]/, "the real worker's failure reason must reach the socket client");
      const observer = new WebSocket(`${url.replace("http:", "ws:")}/__editor_protocol?role=client`);
      const echoed = [];
      const receive = bytes => { const message = JSON.parse(bytes.toString()); if (message.method === "test/noEffect") echoed.push(message); };
      socket.on("message", receive);
      observer.on("message", receive);
      try {
        await once(observer, "open");
        socket.send(JSON.stringify({ jsonrpc: "2.0", method: "test/noEffect", params: {} }));
        await socketRequest(socket, "sender-barrier", "window/loadedProjectId");
        await socketRequest(observer, "observer-barrier", "window/loadedProjectId");
        assert.deepEqual(echoed, [], "an injected notification must not return as an editor event");
      } finally { socket.off("message", receive); observer.close(); }
    } finally { socket.close(); }
    const hover = await languageSurface(page, "hover", { line: 1, col: 5 });
    assert.equal(hover.present, true, hover.reason);
    assert.equal(hover.naturalWidth, 80);
    assert.equal(hover.naturalHeight, 120);
    const screenshot = path.join(fixture, "hover.png");
    assert.equal((await shotOf(page, "hover", screenshot)).screenshot, screenshot);
    await page.screenshot({ path: path.join(fixture, "editor.png") });
    console.log("Protocol evidence:", fixture);
    // A waiting tab must take over without a reload once its owning tab closes.
    const replacement = await page.context().newPage();
    await openEditorPage(replacement, url);
    await replacement.waitForFunction(() => window.__editorProtocol != null);
    await page.close();
    const takeover = new WebSocket(`${url.replace("http:", "ws:")}/__editor_protocol?role=client`);
    try {
      await once(takeover, "open");
      const deadline = Date.now() + 15_000;
      let response;
      do {
        response = await socketRequest(takeover, "takeover", "window/loadedProjectId");
        if (response.result) break;
        assert.ok(["No editor connected", "Editor disconnected; request outcome may be unknown"].includes(response.error.message), response.error.message);
        await new Promise(resolve => setTimeout(resolve, 100));
      } while (Date.now() < deadline);
      assert.deepEqual(response.result, result.project);
    } finally { takeover.close(); await replacement.close(); }
  }, {
    launch: async () => {
      const browser = await chromium.launch({ headless: true, executablePath: resolveChromiumExecutablePath(chromium) });
      const context = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
      return { pages: () => context.pages(), newPage: () => context.newPage(), close: () => browser.close() };
    },
  });
});
