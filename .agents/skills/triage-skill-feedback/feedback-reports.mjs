const PREFIX = '<!-- skill-feedback-reports';
const fields = ['skill', 'friction', 'edit', 'status', 'problemId', 'sessions', 'historyIncomplete'];
const problemId = /^F-[1-9]\d*$/;
const status = /^(?:open|ticketed #[1-9]\d*|applied in PR #[1-9]\d*)$/;
const record = value => value !== null && typeof value === 'object' && !Array.isArray(value)
  && [Object.prototype, null].includes(Object.getPrototypeOf(value));

function validate(problems) {
  if (!record(problems)) throw new Error('Reports problems must be an object.');
  for (const [id, row] of Object.entries(problems)) {
    if (!problemId.test(id) || !record(row) || row.problemId !== id) throw new Error(`Invalid reports problem identity: ${id}.`);
    if (Object.keys(row).length !== fields.length || fields.some(field => !Object.hasOwn(row, field))) throw new Error(`Reports problem ${id} needs exactly the full counted-row fields.`);
    if (['skill', 'friction', 'edit'].some(field => typeof row[field] !== 'string' || !row[field].trim())
      || typeof row.status !== 'string' || !status.test(row.status) || typeof row.historyIncomplete !== 'boolean') throw new Error(`Invalid reports row: ${id}.`);
    if (!Array.isArray(row.sessions) || row.sessions.some(session => typeof session !== 'string' || !session || session !== session.trim()
      || session.length > 200 || /[\r\n\u0085\u2028\u2029]/u.test(session))) throw new Error(`Invalid session reference for ${id}; use a nonempty single-line string of at most 200 characters.`);
    if (new Set(row.sessions).size !== row.sessions.length) throw new Error(`Duplicate session reference for ${id}.`);
  }
  return problems;
}

function locate(body, isFenced) {
  if (typeof body !== 'string') throw new Error('Reports body must be a string.');
  const matches = [];
  let offset = body.indexOf(PREFIX);
  while (offset !== -1) {
    if (!isFenced(body, offset)) matches.push(offset);
    offset = body.indexOf(PREFIX, offset + PREFIX.length);
  }
  if (matches.length > 1) throw new Error('Multiple live reports ledger markers; reconcile them before writing.');
  if (!matches.length) return null;
  const index = matches[0];
  const match = body.slice(index).match(/^<!-- skill-feedback-reports:v1 ([A-Za-z0-9+/]+={0,2}) -->/);
  if (!match) throw new Error('Malformed or unsupported reports ledger marker.');
  const bytes = Buffer.from(match[1], 'base64');
  if (bytes.toString('base64') !== match[1]) throw new Error('Reports ledger is not canonical base64.');
  const json = bytes.toString('utf8');
  if (!Buffer.from(json, 'utf8').equals(bytes)) throw new Error('Reports ledger is not valid UTF-8.');
  let parsed;
  try { parsed = JSON.parse(json); } catch { throw new Error('Reports ledger contains invalid JSON.'); }
  // The writer emits compact JSON; exact round-trip also rejects duplicate JSON keys.
  if (JSON.stringify(parsed) !== json) throw new Error('Reports ledger must use compact canonical JSON without duplicate keys.');
  if (!record(parsed) || parsed.version !== 1 || Object.keys(parsed).length !== 2 || !Object.hasOwn(parsed, 'problems')) throw new Error('Unsupported reports ledger envelope.');
  validate(parsed.problems);
  return { index, length: match[0].length, problems: parsed.problems };
}

// The caller supplies the same fence predicate used for the canonical table.
export function readReports(body, isFenced = () => false) {
  return locate(body, isFenced)?.problems || {};
}

export function writeReports(body, ledger = {}, isFenced = () => false) {
  validate(ledger);
  const prior = locate(body, isFenced);
  for (const [id, row] of Object.entries(prior?.problems || {})) {
    if (!Object.hasOwn(ledger, id)) throw new Error(`Reports ledger cannot remove archived problem ${id}.`);
    if (row.sessions.some(session => !ledger[id].sessions.includes(session))) throw new Error(`Reports ledger cannot remove recorded sessions for ${id}.`);
  }
  if (!prior && Object.keys(ledger).length === 0) return body;
  const marker = `<!-- skill-feedback-reports:v1 ${Buffer.from(JSON.stringify({ version: 1, problems: ledger }), 'utf8').toString('base64')} -->`;
  if (prior) return body.slice(0, prior.index) + marker + body.slice(prior.index + prior.length);
  return body + (body.endsWith('\n') ? '' : '\n') + marker + '\n';
}
