#!/usr/bin/env node

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
