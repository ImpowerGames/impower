#!/usr/bin/env node
// Checks that every grammar node name written as a string literal in source
// names a node the sparkdown grammar can produce.
//
// `SparkdownNodeName` already makes a stale name a compile error wherever the
// value being compared is typed with it: a comparison or `switch` on a typed
// node, a tree-helper lookup whose parent node or stack is typed, or a set of
// names built with `nodeNameSet`. The type system cannot see three shapes,
// and this script covers them:
//
//   - a lookup whose parent is a bare lezer `SyntaxNode` (the helpers infer
//     the name set from the parent, and a bare node infers `string`), which
//     includes the compiler's local child finders such as `findChildByName`
//   - lezer's own `getChild("...")` / `getChildren("...")`, typed as `string`
//   - a comparison on a `.name` typed `string` or `any`, an inline array
//     `.includes(node.name)`, the `case` labels of a `switch` on such a name,
//     and a `new Set([...])` of names that is not declared with the union
//
// A stale name in any of those compiles and silently never matches, which is
// how the names this script was written to catch went unnoticed. A name held
// in any other kind of constant is outside both this script and `tsc` unless
// the constant is declared with the union, so build such sets with
// `nodeNameSet([...])` and declare such arrays as `SparkdownNodeName[]`.
//
// The legal set is derived from the generated grammar the same way
// `SparkdownNodeName` is; see `legalNames` in scripts/node-names.mjs. The
// grammar is generated into two places from one YAML source, and the check
// fails when the two copies declare different rules, because that means one
// was regenerated without the other.
//
// Only files that can hold a node name are scanned: tracked TypeScript files
// that import a tree helper, `SparkdownNodeName`, `SparkdownSyntaxNodeRef`, or
// lezer's `SyntaxNode`. Files whose node names belong to another grammar are
// skipped; the list is `SKIPPED_PREFIXES` in scripts/node-names.mjs. A line
// that compares a `.name` which is not a node name can opt out with a
// `// not a node name` comment on the line the finding names.
//
// Usage:
//   node scripts/check-node-names.mjs               check; exit 1 on any finding
//   node scripts/check-node-names.mjs --list        print the files it would scan
//   node scripts/check-node-names.mjs --root=DIR    check another checkout
//   node --test scripts/check-node-names.test.mjs   test the scanner itself

import {
  GRAMMAR,
  GRAMMAR_COPY,
  OPT_OUT,
  REGENERATE,
  legalNames,
  nodeNameLiterals,
  optedOutLines,
  ruleNames,
  scannedFiles,
} from "./node-names.mjs";

function main() {
  const list = process.argv.includes("--list");

  const rules = ruleNames(GRAMMAR);
  const copyRules = ruleNames(GRAMMAR_COPY);
  if (rules.join("\n") !== copyRules.join("\n")) {
    const onlyHere = rules.filter((r) => !copyRules.includes(r));
    const onlyThere = copyRules.filter((r) => !rules.includes(r));
    console.log(
      `${GRAMMAR} and ${GRAMMAR_COPY} declare different rules` +
        ` (only in the first: ${onlyHere.join(", ") || "none"};` +
        ` only in the second: ${onlyThere.join(", ") || "none"}).` +
        ` Both are generated from definitions/yaml/sparkdown.language-grammar.yaml;` +
        ` regenerate both with \`${REGENERATE}\` and commit them together.`,
    );
    process.exitCode = 1;
    return;
  }

  const legal = legalNames();
  const files = scannedFiles();

  if (list) {
    console.log(`${files.length} file(s) scanned:`);
    for (const f of files) console.log(`  ${f.path}`);
    return;
  }

  let checked = 0;
  const findings = [];
  for (const f of files) {
    const optedOut = optedOutLines(f.source);
    for (const { line, name } of nodeNameLiterals(f.source, legal)) {
      checked += 1;
      if (legal.has(name) || optedOut.has(line)) continue;
      findings.push(`${f.path}:${line}: "${name}" is not a grammar node name`);
    }
  }

  for (const finding of findings) console.log(finding);
  console.log(
    `\n${files.length} file(s), ${checked} node-name literal(s), ${findings.length} unknown`,
  );
  if (files.length === 0 || checked === 0) {
    console.log(
      `The scan found nothing to check, so the file filter or the patterns are` +
        ` broken; a check that checks nothing must not pass.`,
    );
    process.exitCode = 1;
    return;
  }
  if (findings.length > 0) {
    console.log(
      `A name the grammar cannot produce never matches. Fix the name, or if the` +
        ` value is not a node name, append \`// ${OPT_OUT}\` to the line.`,
    );
    process.exitCode = 1;
  }
}

main();
