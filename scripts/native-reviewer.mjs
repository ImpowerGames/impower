import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {git} from './review-job-store.mjs';
import {validateCodexSandboxStorage} from './reviewer-security.mjs';

export function verifyReviewerExecutable(review) {
  if(review.transport!=='native-codex-jsonl')return;
  if(process.platform!=='win32')throw new Error('Automatic native Codex reviewer is verified on Windows only; use awaited mode');
  const version=execFileSync(review.executable,['--version'],{encoding:'utf8',windowsHide:true,timeout:10000}).trim();
  if(version!=='codex-cli 0.154.0-alpha.6.2')throw new Error('Native Codex reviewer version is unverified; use awaited mode');
}

export const nativeResultType=transport=>{
  if(transport==='native-claude-json')return 'claude-json';
  if(transport==='native-codex-jsonl')return 'codex-jsonl';
  throw new Error('Unsupported native reviewer result transport');
};

export function verifyCodexReviewResult(output) {
  if(fs.statSync(output).size>16*1024*1024)throw new Error('Native reviewer result exceeds bounded inspection');
  const text=fs.readFileSync(output,'utf8');
  if(!text.endsWith('\n'))throw new Error('Incomplete native Codex event stream');
  let rows;try{rows=text.trim().split('\n').map(JSON.parse);}catch{throw new Error('Invalid native Codex JSONL stream');}
  const starts=rows.filter(row=>row.type==='thread.started'),turns=rows.filter(row=>row.type==='turn.started'),done=rows.filter(row=>row.type==='turn.completed');
  if(starts.length!==1||typeof starts[0].thread_id!=='string'||!starts[0].thread_id||turns.length!==1||done.length!==1||rows[0]!==starts[0]||rows.at(-1)!==done[0]||rows.indexOf(turns[0])>rows.indexOf(done[0])||rows.some(row=>['error','turn.failed'].includes(row.type)))throw new Error('Native Codex review failed, interrupted, or incomplete');
  if(!rows.some(row=>row.type==='item.completed'&&row.item?.type==='agent_message'&&typeof row.item.text==='string'&&row.item.text.trim())||!done[0].usage||!['input_tokens','output_tokens','cached_input_tokens'].every(key=>Number.isSafeInteger(done[0].usage[key])&&done[0].usage[key]>=0))throw new Error('Native Codex review lacks a complete response');
  if(rows.some(row=>!['thread.started','turn.started','turn.completed','item.started','item.updated','item.completed'].includes(row.type)))throw new Error('Unknown native Codex event type');
  return {threadId:starts[0].thread_id,status:'completed'};
}

const contains=(parent,child)=>{const rel=path.relative(parent,child);return rel===''||(!rel.startsWith(`..${path.sep}`)&&rel!=='..'&&!path.isAbsolute(rel));};

// A deliberately small exec argument grammar. Profiles, opaque config overrides,
// alternate providers, resume/fork, and extra writable roots require new evidence.
export function validateCodexReviewer(review,plan) {
  const args=review.args,values=new Map(),config=new Map(),disabled=new Set();
  if(args[0]!=='exec'||args.at(-1)!=='-')throw new Error('Native Codex review requires exec with its prompt on stdin');
  const aliases={'-m':'--model','-C':'--cd','-s':'--sandbox','-o':'--output-last-message','--config':'-c'};
  for(let index=1;index<args.length-1;index++) {
    const flag=aliases[args[index]]??args[index];
    if(flag==='--disable') {
      const feature=args[++index];
      if(!['multi_agent','multi_agent_v2'].includes(feature)||disabled.has(feature))throw new Error('Unsupported or duplicate Codex feature override');
      disabled.add(feature);continue;
    }
    if(['--json','--skip-git-repo-check','--ignore-user-config','--ignore-rules','--strict-config'].includes(flag)) {
      if(values.has(flag))throw new Error('Duplicate Codex reviewer flag');values.set(flag,true);continue;
    }
    if(!['--model','--cd','--sandbox','--output-last-message','-c'].includes(flag)||index+1>=args.length-1)throw new Error('Unsupported or ambiguous Codex reviewer argument');
    const value=args[++index];
    if(flag==='-c') {
      const match=/^(model_reasoning_effort|approval_policy|model_provider|windows\.sandbox|sandbox_workspace_write\.(?:network_access|writable_roots|exclude_tmpdir_env_var|exclude_slash_tmp))=(.+)$/.exec(value);
      if(!match||config.has(match[1]))throw new Error('Unsupported or duplicate Codex reviewer configuration');
      let parsed;try{parsed=JSON.parse(match[2]);}catch{throw new Error('Codex reviewer config values must be explicit JSON/TOML literals');}
      config.set(match[1],parsed);
    } else {if(values.has(flag))throw new Error('Duplicate Codex reviewer flag');values.set(flag,value);}
  }
  const permission=review.permissions;
  if(config.get('windows.sandbox')!=='elevated')throw new Error('Explicit elevated Windows sandbox backend required');
  if(!values.get('--ignore-user-config')||!values.get('--ignore-rules')||!values.get('--strict-config')||config.get('model_provider')!=='openai'||JSON.stringify(config.get('sandbox_workspace_write.writable_roots'))!=='[]'||config.get('sandbox_workspace_write.exclude_tmpdir_env_var')!==true||config.get('sandbox_workspace_write.exclude_slash_tmp')!==true)throw new Error('Codex reviewer requires isolated effective configuration and explicit writable roots');
  if(disabled.size!==2)throw new Error('Codex reviewer must disable both native multi-agent features');
  if(values.get('--model')!==plan.reviewer||config.get('model_reasoning_effort')!==review.effort||!['low','medium','high','xhigh','max','ultra'].includes(review.effort))throw new Error('Codex reviewer model/effort mismatch');
  if(permission?.sandbox!=='workspace-write'||permission.approvalPolicy!=='never'||permission.networkAccess!==true||permission.artifactWrites!=='handoff-directory'||values.get('--sandbox')!==permission.sandbox||config.get('approval_policy')!==permission.approvalPolicy||config.get('sandbox_workspace_write.network_access')!==permission.networkAccess)throw new Error('Explicit Codex private-artifact and posting permissions required');
  if(!values.get('--json')||!values.get('--skip-git-repo-check')||!path.isAbsolute(permission.cwd??'')||values.get('--cd')!==permission.cwd)throw new Error('Codex reviewer private working directory required');
  const root=fs.realpathSync.native(permission.cwd),worktree=fs.realpathSync.native(plan.worktree),job=path.join(fs.realpathSync.native(path.dirname(plan.jobDir)),path.basename(plan.jobDir));
  const common=fs.realpathSync.native(git(worktree,['rev-parse','--path-format=absolute','--git-common-dir']));
  if(contains(root,worktree)||contains(worktree,root)||contains(root,job)||contains(job,root)||contains(root,common)||contains(common,root))throw new Error('Codex reviewer writes must exclude repository and supervisor state');
  validateCodexSandboxStorage(permission,job,worktree);
  const report=values.get('--output-last-message');
  if(!path.isAbsolute(report??'')||fs.existsSync(report)||fs.realpathSync.native(path.dirname(report))!==root)throw new Error('A fresh final report inside the private reviewer directory is required');
}
