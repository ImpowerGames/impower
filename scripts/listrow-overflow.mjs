import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

export const SCANNED = /^(?:packages\/[^/]+\/src|impower-dev\/src)\/.*\.tsx$/;

export const ALLOWED_OVERFLOW = new Set(["self", "wrap"]);

const SELF_CLIP = /(?<![\w-])(?:fade-edge|truncate|line-clamp-\d+)(?![\w-])/;

const CLASS_ATTRIBUTES = new Set(["class", "className"]);

const CLASS_FUNCTIONS = new Set(["cn", "clsx", "cva", "twMerge", "classNames"]);

export const selfClipClass = (text) => SELF_CLIP.test(text);

export function scannedFiles(root = ROOT) {
  return execFileSync("git", ["ls-files", "-z"], { cwd: root, encoding: "utf8", windowsHide: true })
    .split("\0")
    .filter((f) => SCANNED.test(f))
    .map((f) => ({ path: f, source: readFileSync(path.join(root, f), "utf8") }));
}

const parse = (file) =>
  ts.createSourceFile(file.path, file.source, ts.ScriptTarget.Latest, true, file.path.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);

const tagName = (node) =>
  ts.isJsxElement(node) ? node.openingElement.tagName.getText() : ts.isJsxSelfClosingElement(node) ? node.tagName.getText() : undefined;

function walk(node, visit) {
  if (visit(node) === false) return;
  ts.forEachChild(node, (child) => walk(child, visit));
}

const isStringish = (node) =>
  ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node) || ts.isTemplateHead(node) || ts.isTemplateMiddle(node) || ts.isTemplateTail(node);

const hasClipString = (node) => {
  let found = false;
  walk(node, (n) => {
    if (found) return false;
    if (isStringish(n) && selfClipClass(n.text)) found = true;
  });
  return found;
};

const isClassAttribute = (n) => ts.isJsxAttribute(n) && CLASS_ATTRIBUTES.has(n.name.getText()) && n.initializer;

const isClassCall = (n) => ts.isCallExpression(n) && ts.isIdentifier(n.expression) && CLASS_FUNCTIONS.has(n.expression.text);

function topLevelNames(sourceFile) {
  const components = new Map();
  const imports = new Map();
  const bindings = new Map();
  for (const statement of sourceFile.statements) {
    if (ts.isFunctionDeclaration(statement) && statement.name && statement.body) components.set(statement.name.text, statement.body);
    if (ts.isImportDeclaration(statement) && statement.importClause?.namedBindings && ts.isNamedImports(statement.importClause.namedBindings)) {
      for (const element of statement.importClause.namedBindings.elements) {
        imports.set(element.name.text, { specifier: statement.moduleSpecifier.text, name: (element.propertyName ?? element.name).text });
      }
    }
  }
  walk(sourceFile, (n) => {
    if (!ts.isVariableDeclaration(n) || !ts.isIdentifier(n.name) || !n.initializer) return;
    const list = bindings.get(n.name.text) ?? [];
    list.push(n.initializer);
    bindings.set(n.name.text, list);
    if (n.parent?.parent?.parent === sourceFile && (ts.isArrowFunction(n.initializer) || ts.isFunctionExpression(n.initializer))) components.set(n.name.text, n.initializer.body);
  });
  return { components, imports, bindings };
}

const moduleCandidates = (from, specifier) => {
  const base = path.posix.join(path.posix.dirname(from), specifier);
  return [base, `${base}.tsx`, `${base}.ts`, `${base}/index.tsx`, `${base}/index.ts`];
};

export function analyse(files) {
  const modules = new Map(files.map((f) => {
    const sourceFile = parse(f);
    return [f.path, { file: f, sourceFile, ...topLevelNames(sourceFile) }];
  }));
  const byName = new Map();
  for (const [file, module] of modules) {
    for (const name of module.components.keys()) {
      const list = byName.get(name) ?? [];
      list.push(`${file}#${name}`);
      byName.set(name, list);
    }
  }
  const resolve = (file, name) => {
    const module = modules.get(file);
    if (module.components.has(name)) return [`${file}#${name}`];
    const imported = module.imports.get(name);
    if (imported?.specifier.startsWith(".")) {
      const target = moduleCandidates(file, imported.specifier).find((c) => modules.has(c));
      return target && modules.get(target).components.has(imported.name) ? [`${target}#${imported.name}`] : [];
    }
    const sought = imported?.name ?? name;
    return (byName.get(sought) ?? []).filter((key) => !key.startsWith(`${file}#`));
  };
  const clipping = new Set();
  const tagClips = (file, name) => {
    const keys = resolve(file, name);
    return keys.length > 0 && keys.every((key) => clipping.has(key));
  };
  const clips = (file, node, seen = new Set()) => {
    let found = false;
    walk(node, (n) => {
      if (found) return false;
      if ((isClassAttribute(n) || isClassCall(n)) && hasClipString(n)) found = true;
      else if (tagName(n) && /^[A-Z]/.test(tagName(n)) && tagClips(file, tagName(n))) found = true;
      else if (ts.isIdentifier(n) && !seen.has(n.text) && ts.isJsxExpression(n.parent)) {
        seen.add(n.text);
        found = (modules.get(file).bindings.get(n.text) ?? []).some((init) => clips(file, init, seen));
      }
    });
    return found;
  };
  for (let grew = true; grew; ) {
    grew = false;
    for (const [file, module] of modules) {
      for (const [name, body] of module.components) {
        const key = `${file}#${name}`;
        if (clipping.has(key) || !clips(file, body)) continue;
        clipping.add(key);
        grew = true;
      }
    }
  }
  return { modules, clipping, clips };
}

export const selfClippingComponents = (files) => new Set([...analyse(files).clipping].map((key) => key.slice(key.indexOf("#") + 1)));

const attribute = (element, name) => {
  const attrs = (ts.isJsxElement(element) ? element.openingElement : element).attributes.properties;
  return attrs.find((a) => ts.isJsxAttribute(a) && a.name.getText() === name);
};

const unwrap = (node) => (node && ts.isJsxExpression(node) ? node.expression : node);

const stripParens = (node) => {
  while (node && (ts.isParenthesizedExpression(node) || ts.isAsExpression(node) || ts.isSatisfiesExpression?.(node))) node = node.expression;
  return node;
};

function overflowValues(node, bindings, seen = new Set()) {
  node = stripParens(node);
  if (!node || (ts.isIdentifier(node) && node.text === "undefined")) return ["fade"];
  if (isStringish(node)) return [node.text];
  if (ts.isConditionalExpression(node)) return [...overflowValues(node.whenTrue, bindings, seen), ...overflowValues(node.whenFalse, bindings, seen)];
  if (ts.isIdentifier(node) && !seen.has(node.text)) {
    seen.add(node.text);
    const inits = bindings.get(node.text) ?? [];
    if (inits.length) return inits.flatMap((init) => overflowValues(init, bindings, seen));
  }
  return [undefined];
}

const describe = (values) => [...new Set(values.map((v) => v ?? "not statically known"))].join(" or ");

export function violations(file, analysis) {
  const { modules, clips } = analysis;
  const module = modules.get(file.path);
  if (!module) return [];
  const found = [];
  walk(module.sourceFile, (n) => {
    if (tagName(n) !== "ListRow") return;
    const label = stripParens(unwrap(attribute(n, "label")?.initializer));
    if (!label) return;
    const overflow = stripParens(unwrap(attribute(n, "overflow")?.initializer));
    const pairs =
      overflow && ts.isConditionalExpression(overflow) && ts.isConditionalExpression(label) && overflow.condition.getText() === label.condition.getText()
        ? [[overflow.whenTrue, label.whenTrue], [overflow.whenFalse, label.whenFalse]]
        : [[overflow, label]];
    const bad = pairs.flatMap(([o, l]) => {
      if (!clips(file.path, l)) return [];
      const values = overflowValues(o, module.bindings);
      return values.every((v) => ALLOWED_OVERFLOW.has(v)) ? [] : values.filter((v) => !ALLOWED_OVERFLOW.has(v));
    });
    if (!bad.length) return;
    const { line } = module.sourceFile.getLineAndCharacterOfPosition(n.getStart());
    found.push({ path: file.path, line: line + 1, overflow: describe(bad) });
  });
  return found;
}
