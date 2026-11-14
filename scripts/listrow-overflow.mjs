import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

export const SCANNED = /^(?:packages\/[^/]+\/src|impower-dev\/src)\/.*\.tsx$/;

export const ALLOWED_OVERFLOW = new Set(["self", "wrap"]);

const SELF_CLIP = /(?<![\w-])(?:fade-edge|truncate|line-clamp-\d+)(?![\w-])/;

export const selfClipClass = (text) => SELF_CLIP.test(text);

export function scannedFiles(root = ROOT) {
  return execFileSync("git", ["ls-files", "-z"], { cwd: root, encoding: "utf8", windowsHide: true })
    .split("\0")
    .filter((f) => SCANNED.test(f))
    .map((f) => ({ path: f, source: readFileSync(path.join(root, f), "utf8") }));
}

const parse = (file) => ts.createSourceFile(file.path, file.source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);

const tagName = (node) =>
  ts.isJsxElement(node) ? node.openingElement.tagName.getText() : ts.isJsxSelfClosingElement(node) ? node.tagName.getText() : undefined;

function walk(node, visit) {
  visit(node);
  ts.forEachChild(node, (child) => walk(child, visit));
}

const isStringish = (node) =>
  ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node) || ts.isTemplateHead(node) || ts.isTemplateMiddle(node) || ts.isTemplateTail(node);

function clips(node, components) {
  let found = false;
  walk(node, (n) => {
    if (found) return;
    if (isStringish(n) && selfClipClass(n.text)) found = true;
    else if (components.has(tagName(n))) found = true;
  });
  return found;
}

function componentBodies(sourceFile) {
  const bodies = [];
  walk(sourceFile, (n) => {
    if (ts.isFunctionDeclaration(n) && n.name && /^[A-Z]/.test(n.name.text) && n.body) bodies.push({ name: n.name.text, body: n.body });
    else if (ts.isVariableDeclaration(n) && ts.isIdentifier(n.name) && /^[A-Z]/.test(n.name.text) && n.initializer && (ts.isArrowFunction(n.initializer) || ts.isFunctionExpression(n.initializer))) bodies.push({ name: n.name.text, body: n.initializer.body });
  });
  return bodies;
}

export function selfClippingComponents(files) {
  const bodies = files.flatMap((f) => componentBodies(parse(f)));
  const components = new Set();
  for (let grew = true; grew; ) {
    grew = false;
    for (const { name, body } of bodies) {
      if (components.has(name) || !clips(body, components)) continue;
      components.add(name);
      grew = true;
    }
  }
  return components;
}

const attribute = (element, name) => {
  const attrs = (ts.isJsxElement(element) ? element.openingElement : element).attributes.properties;
  return attrs.find((a) => ts.isJsxAttribute(a) && a.name.getText() === name);
};

const hasSpread = (element) => (ts.isJsxElement(element) ? element.openingElement : element).attributes.properties.some(ts.isJsxSpreadAttribute);

function overflowValue(attr) {
  if (!attr) return null;
  const init = attr.initializer;
  if (!init) return undefined;
  if (ts.isStringLiteral(init)) return init.text;
  if (ts.isJsxExpression(init) && init.expression && isStringish(init.expression)) return init.expression.text;
  return undefined;
}

export function violations(file, components) {
  const sourceFile = parse(file);
  const found = [];
  walk(sourceFile, (n) => {
    if (tagName(n) !== "ListRow") return;
    const label = attribute(n, "label");
    if (!label?.initializer || !clips(label.initializer, components)) return;
    const overflow = overflowValue(attribute(n, "overflow"));
    if (overflow === undefined || ALLOWED_OVERFLOW.has(overflow)) return;
    if (overflow === null && hasSpread(n)) return;
    const { line } = sourceFile.getLineAndCharacterOfPosition(n.getStart());
    found.push({ path: file.path, line: line + 1, overflow: overflow ?? "fade (default)" });
  });
  return found;
}
