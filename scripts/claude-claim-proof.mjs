import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import fs from 'node:fs';
import path from 'node:path';
import {readEvents} from './review-job-store.mjs';

export const claimCommandDigest=command=>createHash('sha256').update(command).digest('hex');
const shellQuote=value=>{
  if(typeof value!=='string'||/[\0\r\n]/.test(value))throw new Error('Invalid owned Claude claim argument');
  return "'"+value.replaceAll("'","'\"'\"'")+"'";
};
export function claudeClaimArgv(plan) {
  const envelope=readEvents(plan.jobDir).findLast(row=>row.event==='continuation-pending')?.envelope;
  const args=envelope?.claimCommand;
  if(envelope?.jobId!==plan.jobId||envelope?.continuationId!==plan.continuationId||!Array.isArray(args)||args.length!==5||!args.every(value=>typeof value==='string')||![args[0],args[1],args[3]].every(path.isAbsolute)||args[2]!=='claim'||args[4]!==plan.continuationId||fs.realpathSync.native(args[1])!==fs.realpathSync.native(fileURLToPath(new URL('./review-supervisor.mjs',import.meta.url)))||fs.realpathSync.native(args[3])!==fs.realpathSync.native(plan.jobDir))throw new Error('Durable Claude claim invocation unavailable or changed');
  return args.map(value=>value.replaceAll('\\','/'));
}
// Only this owned invocation is supported; arbitrary shell commands are never parsed.
export const renderClaudeClaimCommand=argv=>`IMPOWER_CLAUDE_CLAIM_ID=${shellQuote(argv.at(-1))} ${argv.map(value=>shellQuote(value.replaceAll('\\','/'))).join(' ')}`;
