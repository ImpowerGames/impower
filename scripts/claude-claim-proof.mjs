import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';

export const claimCommandDigest=command=>createHash('sha256').update(command).digest('hex');
const shellQuote=value=>{
  if(typeof value!=='string'||/[\0\r\n]/.test(value))throw new Error('Invalid owned Claude claim argument');
  return "'"+value.replaceAll("'","'\"'\"'")+"'";
};
export const claudeClaimArgv=plan=>[process.execPath,fileURLToPath(new URL('./review-supervisor.mjs',import.meta.url)),'claim',plan.jobDir,plan.continuationId].map(value=>value.replaceAll('\\','/'));
// Only this owned invocation is supported; arbitrary shell commands are never parsed.
export const renderClaudeClaimCommand=argv=>`IMPOWER_CLAUDE_CLAIM_ID=${shellQuote(argv.at(-1))} ${argv.map(value=>shellQuote(value.replaceAll('\\','/'))).join(' ')}`;
