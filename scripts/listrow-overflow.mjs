import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

export const SCANNED = /^(?:packages\/[^/]+\/src|impower-dev\/src)\/.*\.tsx$/;

export const LISTROW = "packages/impower-ui/src/components/list-row/ListRow.tsx#ListRow";

export const ALLOWED_OVERFLOW = new Set(["self", "wrap"]);

const SELF_CLIP = /(?<![\w-])(?:fade-edge|truncate|line-clamp-\d+)(?![\w-])/;

const CLASS_ATTRIBUTES = new Set(["class", "className"]);

const CLASS_FUNCTIONS = new Set(["cn", "clsx", "cva", "twMerge", "classNames"]);

const OPTIONS = {
  target: ts.ScriptTarget.ESNext,
  module: ts.ModuleKind.ESNext,
  moduleResolution: ts.ModuleResolutionKind.Bundler,
  customConditions: ["development"],
  jsx: ts.JsxEmit.ReactJSX,
  jsxImportSource: "preact",
  allowImportingTsExtensions: true,
  resolveJsonModule: true,
  skipLibCheck: true,
  noEmit: true,
  strict: true,
};

export const selfClipClass = (text) => SELF_CLIP.test(text);

export function scannedFiles(root = ROOT) {
  return execFileSync("git", ["ls-files", "-z"], { cwd: root, encoding: "utf8", windowsHide: true })
    .split("\0")
    .filter((f) => SCANNED.test(f))
    .map((f) => ({ path: f, source: readFileSync(path.join(root, f), "utf8") }));
}

function walk(node, visit) {
  if (visit(node) === false) return;
  ts.forEachChild(node, (child) => walk(child, visit));
}

const isStringish = (node) =>
  ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node) || ts.isTemplateHead(node) || ts.isTemplateMiddle(node) || ts.isTemplateTail(node);

const isClassAttribute = (n) => ts.isJsxAttribute(n) && CLASS_ATTRIBUTES.has(n.name.getText()) && n.initializer;

const isClassCall = (n) => ts.isCallExpression(n) && ts.isIdentifier(n.expression) && CLASS_FUNCTIONS.has(n.expression.text);

const opening = (n) => (ts.isJsxElement(n) ? n.openingElement : ts.isJsxSelfClosingElement(n) ? n : undefined);

const stripParens = (node) => {
  while (node && (ts.isParenthesizedExpression(node) || ts.isAsExpression(node) || ts.isNonNullExpression(node) || (ts.isSatisfiesExpression && ts.isSatisfiesExpression(node)))) node = node.expression;
  return node;
};

const unwrap = (node) => (node && ts.isJsxExpression(node) ? node.expression : node);

const YES = 2;
const UNKNOWN = 1;
const NO = 0;

const PRIMITIVE =
  ts.TypeFlags.StringLike | ts.TypeFlags.NumberLike | ts.TypeFlags.BooleanLike | ts.TypeFlags.BigIntLike | ts.TypeFlags.Null | ts.TypeFlags.Undefined | ts.TypeFlags.Void | ts.TypeFlags.Never;

const primitiveType = (type) => (type.isUnion() ? type.types.every(primitiveType) : (type.flags & PRIMITIVE) !== 0);

function componentDeclarations(sourceFile) {
  const found = [];
  for (const statement of sourceFile.statements) {
    if (ts.isFunctionDeclaration(statement) && statement.name && statement.body) found.push({ name: statement.name.text, decl: statement, body: statement.body });
    if (ts.isVariableStatement(statement)) {
      for (const d of statement.declarationList.declarations) {
        if (ts.isIdentifier(d.name) && d.initializer && (ts.isArrowFunction(d.initializer) || ts.isFunctionExpression(d.initializer))) found.push({ name: d.name.text, decl: d, body: d.initializer.body });
      }
    }
  }
  return found;
}

export function analyse(files, root = ROOT) {
  const virtual = new Map(files.map((f) => [path.resolve(root, f.path), f.source]));
  const host = ts.createCompilerHost(OPTIONS, true);
  const baseGetSourceFile = host.getSourceFile.bind(host);
  const baseFileExists = host.fileExists.bind(host);
  const baseReadFile = host.readFile.bind(host);
  const virtualDirectories = new Set([...virtual.keys()].flatMap((f) => {
    const dirs = [];
    for (let d = path.dirname(f); d !== path.dirname(d); d = path.dirname(d)) dirs.push(d);
    return dirs;
  }));
  const baseDirectoryExists = host.directoryExists?.bind(host);
  host.directoryExists = (d) => virtualDirectories.has(path.resolve(d)) || (baseDirectoryExists ? baseDirectoryExists(d) : true);
  host.fileExists = (f) => virtual.has(path.resolve(f)) || baseFileExists(f);
  host.readFile = (f) => virtual.get(path.resolve(f)) ?? baseReadFile(f);
  host.getSourceFile = (f, language, onError, fresh) => {
    const source = virtual.get(path.resolve(f));
    return source === undefined ? baseGetSourceFile(f, language, onError, fresh) : ts.createSourceFile(f, source, language, true);
  };
  const program = ts.createProgram([...virtual.keys()], OPTIONS, host);
  const checker = program.getTypeChecker();
  const relative = (fileName) => path.relative(root, path.resolve(fileName)).split(path.sep).join("/");

  const components = new Map();
  for (const f of files) {
    const sourceFile = program.getSourceFile(path.resolve(root, f.path));
    for (const c of componentDeclarations(sourceFile)) components.set(`${f.path}#${c.name}`, c);
  }
  const keyOfDeclaration = new Map([...components].map(([key, c]) => [c.decl, key]));

  const resolveTag = (tag, depth = 0) => {
    let symbol = checker.getSymbolAtLocation(tag);
    if (symbol && symbol.flags & ts.SymbolFlags.Alias) symbol = checker.getAliasedSymbol(symbol);
    const only = symbol?.declarations?.length === 1 ? symbol.declarations[0] : undefined;
    if (depth < 8 && only && ts.isVariableDeclaration(only) && only.initializer && !keyOfDeclaration.has(only)) {
      const init = stripParens(only.initializer);
      if (ts.isIdentifier(init) || ts.isPropertyAccessExpression(init)) return resolveTag(init, depth + 1);
    }
    if (symbol && symbol.flags & ts.SymbolFlags.Alias) symbol = checker.getAliasedSymbol(symbol);
    for (const decl of symbol?.declarations ?? []) {
      const key = keyOfDeclaration.get(decl);
      if (key) return key;
    }
    const decl = symbol?.declarations?.[0];
    if (decl && (ts.isFunctionDeclaration(decl) || ts.isVariableDeclaration(decl)) && decl.name && ts.isIdentifier(decl.name)) {
      const key = `${relative(decl.getSourceFile().fileName)}#${decl.name.text}`;
      if (components.has(key) || key === LISTROW) return key;
    }
    return undefined;
  };

  const intrinsic = (tag) => ts.isIdentifier(tag) && /^[a-z]/.test(tag.text);

  const valueReference = (n) =>
    (ts.isIdentifier(n) || ts.isPropertyAccessExpression(n)) &&
    !(ts.isJsxAttribute(n.parent) && n.parent.name === n) &&
    !(ts.isCallExpression(n.parent) && n.parent.expression === n) &&
    !(ts.isPropertyAccessExpression(n.parent) && n.parent.name === n);

  const constantInitializer = (n) => {
    let symbol = checker.getSymbolAtLocation(ts.isPropertyAccessExpression(n) ? n.name : n);
    if (symbol && symbol.flags & ts.SymbolFlags.Alias) symbol = checker.getAliasedSymbol(symbol);
    const decl = symbol?.declarations?.length === 1 ? symbol.declarations[0] : undefined;
    if (decl && ts.isVariableDeclaration(decl) && decl.initializer && ts.getCombinedNodeFlags(decl) & ts.NodeFlags.Const) return decl.initializer;
    if (decl && ts.isPropertyAssignment(decl)) return decl.initializer;
    return undefined;
  };

  const classClips = (node, seen = new Set()) => {
    let found = false;
    walk(node, (n) => {
      if (found) return false;
      if (isStringish(n) && selfClipClass(n.text)) found = true;
      else if (valueReference(n) && !seen.has(n)) {
        seen.add(n);
        const init = constantInitializer(n);
        if (init && !seen.has(init)) {
          seen.add(init);
          found = classClips(init, seen);
        } else {
          const type = checker.getTypeAtLocation(n);
          found = (type.isUnion() ? type.types : [type]).some((t) => t.isStringLiteral() && selfClipClass(t.value));
        }
        return false;
      }
    });
    return found;
  };

  const clipping = new Set();
  const bodyClips = (body) => {
    let found = false;
    walk(body, (n) => {
      if (found) return false;
      if ((isClassAttribute(n) || isClassCall(n)) && classClips(n)) found = true;
      const o = opening(n);
      if (o && !intrinsic(o.tagName) && clipping.has(resolveTag(o.tagName))) found = true;
    });
    return found;
  };
  for (let grew = true; grew; ) {
    grew = false;
    for (const [key, c] of components) {
      if (clipping.has(key) || !bodyClips(c.body)) continue;
      clipping.add(key);
      grew = true;
    }
  }

  const localInitializer = (identifier) => {
    const symbol = ts.isShorthandPropertyAssignment(identifier.parent) ? checker.getShorthandAssignmentValueSymbol(identifier.parent) : checker.getSymbolAtLocation(identifier);
    const decl = symbol?.declarations?.length === 1 ? symbol.declarations[0] : undefined;
    return decl && ts.isVariableDeclaration(decl) && decl.initializer && ts.getCombinedNodeFlags(decl) & ts.NodeFlags.Const ? decl.initializer : undefined;
  };

  const byType = (node) => (primitiveType(checker.getTypeAtLocation(node)) ? NO : UNKNOWN);

  const classifyJsx = (node, seen) => {
    let result = NO;
    walk(node, (n) => {
      if (result === YES) return false;
      if ((isClassAttribute(n) || isClassCall(n)) && classClips(n)) {
        result = YES;
        return false;
      }
      const o = opening(n);
      if (o && n === o && !intrinsic(o.tagName)) {
        const key = resolveTag(o.tagName);
        result = Math.max(result, key === undefined ? UNKNOWN : clipping.has(key) ? YES : NO);
      }
      if (ts.isJsxExpression(n) && n.expression && (ts.isJsxElement(n.parent) || ts.isJsxFragment(n.parent))) {
        result = Math.max(result, classify(n.expression, seen));
        return false;
      }
      if (ts.isJsxAttribute(n) && n.initializer && ts.isJsxExpression(n.initializer) && n.initializer.expression) {
        const inner = stripParens(n.initializer.expression);
        if (inner && (ts.isJsxElement(inner) || ts.isJsxSelfClosingElement(inner) || ts.isJsxFragment(inner))) result = Math.max(result, classifyJsx(inner, seen));
        return isClassAttribute(n) ? undefined : false;
      }
    });
    return result;
  };

  const classify = (node, seen = new Set()) => {
    node = stripParens(node);
    if (!node) return NO;
    if (isStringish(node) || ts.isTemplateExpression(node) || ts.isNumericLiteral(node)) return NO;
    if ([ts.SyntaxKind.NullKeyword, ts.SyntaxKind.TrueKeyword, ts.SyntaxKind.FalseKeyword].includes(node.kind) || (ts.isIdentifier(node) && node.text === "undefined")) return NO;
    if (ts.isJsxElement(node) || ts.isJsxSelfClosingElement(node) || ts.isJsxFragment(node)) return classifyJsx(node, seen);
    if (ts.isConditionalExpression(node)) return Math.max(classify(node.whenTrue, seen), classify(node.whenFalse, seen));
    if (ts.isBinaryExpression(node) && [ts.SyntaxKind.AmpersandAmpersandToken, ts.SyntaxKind.BarBarToken, ts.SyntaxKind.QuestionQuestionToken].includes(node.operatorToken.kind)) {
      return Math.max(classify(node.left, seen), classify(node.right, seen));
    }
    if (ts.isIdentifier(node) && !seen.has(node)) {
      seen.add(node);
      const init = localInitializer(node);
      if (init) return classify(init, seen);
    }
    return byType(node);
  };

  const overflowValues = (node, type, seen = new Set()) => {
    node = stripParens(node);
    if (node && ts.isConditionalExpression(node)) return [...overflowValues(node.whenTrue, undefined, seen), ...overflowValues(node.whenFalse, undefined, seen)];
    if (node && isStringish(node)) return [node.text];
    if (node && ts.isIdentifier(node) && node.text === "undefined") return ["fade"];
    if (node && ts.isIdentifier(node) && !seen.has(node)) {
      seen.add(node);
      const init = localInitializer(node);
      if (init) return overflowValues(init, undefined, seen);
    }
    if (!node && !type) return ["fade"];
    const t = type ?? checker.getTypeAtLocation(node);
    const parts = t.isUnion() ? t.types : [t];
    return parts.map((p) => (p.isStringLiteral() ? p.value : p.flags & (ts.TypeFlags.Undefined | ts.TypeFlags.Void) ? "fade" : undefined));
  };

  const props = (o) => {
    const found = new Map();
    for (const a of o.attributes.properties) {
      if (ts.isJsxAttribute(a)) {
        const name = a.name.getText();
        if (name === "label" || name === "overflow") found.set(name, { node: unwrap(a.initializer) });
        continue;
      }
      const object = stripParens(a.expression);
      const spreadType = checker.getTypeAtLocation(a.expression);
      if (spreadType.flags & (ts.TypeFlags.Any | ts.TypeFlags.Unknown)) {
        found.set("label", { type: spreadType });
        found.set("overflow", { type: spreadType });
        continue;
      }
      for (const name of ["label", "overflow"]) {
        const property = spreadType.getProperty(name);
        if (!property) continue;
        let node;
        if (ts.isObjectLiteralExpression(object)) {
          const p = object.properties.find((q) => q.name && ts.isIdentifier(q.name) && q.name.text === name);
          node = p && (ts.isPropertyAssignment(p) ? p.initializer : ts.isShorthandPropertyAssignment(p) ? p.name : undefined);
        } else if (ts.isIdentifier(object)) {
          const init = stripParens(localInitializer(object));
          const p = init && ts.isObjectLiteralExpression(init) ? init.properties.find((q) => q.name && ts.isIdentifier(q.name) && q.name.text === name) : undefined;
          node = p && (ts.isPropertyAssignment(p) ? p.initializer : ts.isShorthandPropertyAssignment(p) ? p.name : undefined);
        }
        found.set(name, node ? { node } : { type: checker.getTypeOfSymbolAtLocation(property, a.expression) });
      }
    }
    return found;
  };

  return { files, program, checker, root, clipping, resolveTag, classify, overflowValues, props, intrinsic };
}

const describe = (values) => [...new Set(values.map((v) => v ?? "not statically known"))].join(" or ");

export function violations(file, analysis) {
  const { program, root, resolveTag, classify, overflowValues, props, intrinsic, checker } = analysis;
  const sourceFile = program.getSourceFile(path.resolve(root, file.path));
  const found = [];
  const report = (n, reason) => {
    const { line } = sourceFile.getLineAndCharacterOfPosition(n.getStart());
    found.push({ path: file.path, line: line + 1, ...reason });
  };
  walk(sourceFile, (n) => {
    const o = opening(n);
    if (!o || o !== n || intrinsic(o.tagName)) return;
    const key = resolveTag(o.tagName);
    const given = props(o);
    if (key === undefined) {
      if (!given.has("label")) return;
      const ov = given.get("overflow");
      const values = ov ? overflowValues(ov.node, ov.type) : ["fade"];
      if (!values.every((v) => ALLOWED_OVERFLOW.has(v))) report(o, { overflow: describe(values.filter((v) => !ALLOWED_OVERFLOW.has(v))), reason: "component" });
      return;
    }
    if (key !== LISTROW || !given.has("label")) return;
    const label = given.get("label");
    const overflow = given.get("overflow");
    const labelNode = stripParens(label.node);
    const overflowNode = stripParens(overflow?.node);
    const pairs =
      overflowNode && labelNode && ts.isConditionalExpression(overflowNode) && ts.isConditionalExpression(labelNode) && overflowNode.condition.getText() === labelNode.condition.getText()
        ? [[{ node: overflowNode.whenTrue }, { node: labelNode.whenTrue }], [{ node: overflowNode.whenFalse }, { node: labelNode.whenFalse }]]
        : [[overflow, label]];
    const bad = pairs.flatMap(([ov, lb]) => {
      const clip = lb.node ? classify(lb.node) : primitiveType(lb.type) ? NO : UNKNOWN;
      if (clip === NO) return [];
      const values = ov ? overflowValues(ov.node, ov.type) : ["fade"];
      return values.every((v) => ALLOWED_OVERFLOW.has(v)) ? [] : values.filter((v) => !ALLOWED_OVERFLOW.has(v)).map((v) => ({ v, clip }));
    });
    if (!bad.length) return;
    report(o, { overflow: describe(bad.map((b) => b.v)), reason: bad.some((b) => b.clip === YES) ? "clips" : "label" });
  });
  return found;
}
