import { createHash } from 'node:crypto';
import { readReports, writeReports } from './feedback-reports.mjs';

const ARCHIVE = '<!-- skill-feedback-archive:v1 ';
const digest = text => createHash('sha256').update(text, 'utf8').digest('hex');
const encode = value => Buffer.from(JSON.stringify(value), 'utf8').toString('base64');
const inline = ledger => `<!-- skill-feedback-reports:v1 ${encode({ version: 1, problems: ledger })} -->`;
const validHash = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
const validId = value => Number.isSafeInteger(value) && value > 0;
const normalize = body => body.replace(/\r\n/g, '\n');

function locate(body, isFenced) {
  const offsets = [...body.matchAll(/<!-- skill-feedback-reports/g)].map(match => match.index).filter(offset => !isFenced(body, offset));
  if (offsets.length > 1) throw new Error('Multiple live reports manifests; reconcile before writing.');
  if (!offsets.length) return null;
  const index = offsets[0];
  const match = body.slice(index).match(/^<!-- skill-feedback-reports:v([123]) ([A-Za-z0-9+/]+={0,2}) -->/);
  if (!match) throw new Error('Malformed or unsupported reports manifest.');
  if (match[1] === '1') return { index, length: match[0].length, legacy: readReports(match[0]) };
  const bytes = Buffer.from(match[2], 'base64');
  const json = bytes.toString('utf8');
  let manifest;
  try { manifest = JSON.parse(json); } catch { throw new Error('Invalid reports manifest JSON.'); }
  if (match[1] === '3') {
    if (bytes.toString('base64') !== match[2] || JSON.stringify(manifest) !== json || !manifest || manifest.version !== 3
      || Object.keys(manifest).sort().join(',') !== 'hash,id,version' || !validId(manifest.id) || !validHash(manifest.hash)) throw new Error('Invalid reports index pointer.');
    return { index, length: match[0].length, pointer: manifest };
  }
  if (bytes.toString('base64') !== match[2] || !Buffer.from(json, 'utf8').equals(bytes) || JSON.stringify(manifest) !== json
    || !manifest || manifest.version !== 2 || Object.keys(manifest).sort().join(',') !== 'chunks,hash,version' || !validHash(manifest.hash)
    || !Array.isArray(manifest.chunks) || !manifest.chunks.length
    || manifest.chunks.some(chunk => !chunk || Object.keys(chunk).sort().join(',') !== 'hash,id' || !validId(chunk.id) || !validHash(chunk.hash))) throw new Error('Invalid reports manifest fields or encoding.');
  if (new Set(manifest.chunks.map(chunk => chunk.id)).size !== manifest.chunks.length) throw new Error('Reports manifest repeats a comment ID.');
  return { index, length: match[0].length, manifest };
}

function chunkBody(payload, part) {
  const fence = '`'.repeat(Math.max(3, ...[...payload.matchAll(/`+/g)].map(match => match[0].length + 1)));
  return `${ARCHIVE}${digest(`${part}\n${payload}`)} -->\n\nReports archive chunk ${part + 1}. Full problem records and session references are retained here.\n\n${fence}json\n${payload}\n${fence}`;
}

function chunkPayload(comment, hash, part) {
  if (typeof comment.body !== 'string') throw new Error(`Reports archive comment #${comment.id} has no body.`);
  const body = normalize(comment.body);
  const match = body.match(/\n(`{3,})json\n([\s\S]*)\n\1$/);
  const payload = match?.[2];
  if (payload === undefined || digest(`${part}\n${payload}`) !== hash || chunkBody(payload, part) !== body) throw new Error(`Reports archive comment #${comment.id} failed its hash or exact body check; preserve the inbox and inspect that comment.`);
  return payload;
}

// comments must be the complete paginated list from this same inbox.
export function inspectReportsArchive(body, comments, isFenced = () => false) {
  const prior = locate(body, isFenced);
  if (prior?.pointer) {
    const matches = comments.filter(comment => comment.id === prior.pointer.id);
    if (matches.length !== 1) throw new Error(`Reports index comment #${prior.pointer.id} is missing or ambiguous in this inbox.`);
    const indexText = typeof matches[0].body === 'string' ? normalize(matches[0].body) : '';
    const match = indexText.match(/^<!-- skill-feedback-archive-index:v1 [a-f0-9]{64} -->\n\nReports archive index\. Referenced comments hold full problem records\.\n\n```json\n([\s\S]*)\n```$/);
    if (!match || digest(match[1]) !== prior.pointer.hash || indexBody(match[1]) !== indexText) throw new Error(`Reports index comment #${prior.pointer.id} failed its hash or exact body check.`);
    prior.manifest = locate(`<!-- skill-feedback-reports:v2 ${Buffer.from(match[1], 'utf8').toString('base64')} -->`, () => false).manifest;
  }
  const chunks = prior?.manifest?.chunks || [];
  const current = new Set([prior?.pointer?.id, ...chunks.map(chunk => chunk.id)]);
  const metadata = { index: prior?.pointer?.id ?? null, chunks: chunks.map(chunk => chunk.id), superseded: comments.filter(comment => typeof comment.body === 'string' && /^(?:<!-- skill-feedback-archive:v1 |<!-- skill-feedback-archive-index:v1 )/.test(comment.body) && !current.has(comment.id)).map(comment => comment.id) };
  if (!prior?.manifest) return { ...metadata, problems: prior?.legacy || {} };
  const text = chunks.map((chunk, part) => {
    const matches = comments.filter(comment => comment.id === chunk.id);
    if (matches.length !== 1) throw new Error(`Reports archive comment #${chunk.id} is missing or ambiguous in this inbox.`);
    return chunkPayload(matches[0], chunk.hash, part);
  }).join('');
  if (digest(text) !== prior.manifest.hash) throw new Error('Reports archive complete-ledger hash mismatch.');
  // Reuse the inline format validator, including duplicate JSON key checks.
  return { ...metadata, problems: readReports(`<!-- skill-feedback-reports:v1 ${Buffer.from(text, 'utf8').toString('base64')} -->`) };
}

export function hydrateReports(body, comments, isFenced = () => false) {
  return inspectReportsArchive(body, comments, isFenced).problems;
}

function replace(body, prior, marker) {
  if (prior) return body.slice(0, prior.index) + marker + body.slice(prior.index + prior.length);
  return body + (body.endsWith('\n') ? '' : '\n') + marker + '\n';
}

const indexBody = json => `<!-- skill-feedback-archive-index:v1 ${digest(json)} -->\n\nReports archive index. Referenced comments hold full problem records.\n\n\`\`\`json\n${json}\n\`\`\``;

export function prepareReports(ledger) {
  writeReports('', ledger);
  const text = JSON.stringify({ version: 1, problems: ledger });
  const points = Array.from(text);
  const chunks = [];
  for (let index = 0; index < points.length; index += 8000) {
    const payload = points.slice(index, index + 8000).join('');
    const part = chunks.length;
    chunks.push({ hash: digest(`${part}\n${payload}`), body: chunkBody(payload, part) });
  }
  const manifest = { version: 2, hash: digest(text), chunks: chunks.map(chunk => ({ id: Number.MAX_SAFE_INTEGER, hash: chunk.hash })) };
  if (chunks.some(chunk => Buffer.byteLength(chunk.body) > 50000) || Buffer.byteLength(indexBody(JSON.stringify(manifest))) > 50000) throw new Error('Reports archive exceeds the supported comment budget; preserve the ledger and split the inbox before applying.');
  return { text, chunks };
}

// api.comments() lists this inbox; api.postComment(body) posts only to this inbox.
// Returns a body for the caller to persist; never writes the body or deletes comments.
export async function persistReports(body, ledger, api, isFenced = () => false) {
  const prior = locate(body, isFenced);
  let comments = await api.comments();
  const old = hydrateReports(body, comments, isFenced);
  writeReports(inline(old), ledger); // Validate and enforce append-only IDs/sessions before posting.
  if (!prior && Object.keys(ledger).length === 0) return body;
  const { text, chunks } = prepareReports(ledger);
  const references = [];
  for (const chunk of chunks) {
    const marker = `${ARCHIVE}${chunk.hash} -->`;
    let matches = comments.filter(comment => typeof comment.body === 'string' && comment.body.startsWith(marker));
    if (matches.length > 1) throw new Error(`Multiple reports archive comments carry ${chunk.hash}: ${matches.map(comment => '#' + comment.id).join(', ')}. Inspect them before retrying.`);
    let comment = matches[0];
    if (comment && normalize(comment.body) !== chunk.body) throw new Error(`Reports archive marker collision at comment #${comment.id}; inspect it and retry the original unedited plan.`);
    if (!comment) {
      comment = await api.postComment(chunk.body);
      if (!validId(comment?.id)) throw new Error('Archive comment creation did not return a valid ID.');
    }
    comments = await api.comments();
    matches = comments.filter(item => typeof item.body === 'string' && item.body.startsWith(marker));
    if (matches.length !== 1 || matches[0].id !== comment.id || normalize(matches[0].body) !== chunk.body) throw new Error(`Reports archive comment #${comment.id} did not read back exactly and uniquely; preserve the inbox and retry the original plan.`);
    references.push({ id: comment.id, hash: chunk.hash });
  }
  const json = JSON.stringify({ version: 2, hash: digest(text), chunks: references });
  const indexText = indexBody(json);
  const indexMarker = `<!-- skill-feedback-archive-index:v1 ${digest(json)} -->`;
  let indices = comments.filter(comment => typeof comment.body === 'string' && comment.body.startsWith(indexMarker));
  if (indices.length > 1 || (indices[0] && normalize(indices[0].body) !== indexText)) throw new Error(`Reports archive index collision: ${indices.map(comment => '#' + comment.id).join(', ')}; inspect and retry the original plan.`);
  const indexComment = indices[0] || await api.postComment(indexText);
  if (!validId(indexComment?.id)) throw new Error('Reports index creation did not return a valid ID.');
  comments = await api.comments();
  indices = comments.filter(comment => typeof comment.body === 'string' && comment.body.startsWith(indexMarker));
  if (indices.length !== 1 || indices[0].id !== indexComment.id || normalize(indices[0].body) !== indexText) throw new Error(`Reports index comment #${indexComment.id} did not read back exactly and uniquely.`);
  const marker = `<!-- skill-feedback-reports:v3 ${encode({ version: 3, id: indexComment.id, hash: digest(json) })} -->`;
  const result = replace(body, prior, marker);
  hydrateReports(result, comments, isFenced);
  return result;
}
