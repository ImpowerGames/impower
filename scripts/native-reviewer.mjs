import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {git} from './review-job-store.mjs';
import {validateCodexSandboxStorage,validateCodexAuthHome,readCodexAuthSecret,codexReviewMode,isSupportedCodexVersion,minimumCodexVersion,minimumFullAccessCodexVersion} from './reviewer-security.mjs';

// The sandboxed grammar needs the elevated Windows sandbox. The full-access
// grammar runs as the user under the repository hooks, which a Linux cloud
// container provides as well.
// The version probe's environment is the caller's: the launcher passes one
// without the authentication secret, which no child may inherit.
export function verifyReviewerExecutable(review,{platform=process.platform,env=process.env}={}) {
  if(review.transport!=='native-codex-jsonl')return;
  const fullAccess=codexReviewMode(review)==='full-access';
  if(platform==='linux'&&!fullAccess)throw new Error('The sandboxed native Codex reviewer is verified on Windows only, since it needs the elevated Windows sandbox; on Linux use the full-access grammar');
  if(!['win32','linux'].includes(platform))throw new Error('Automatic native Codex reviewer is verified on Windows and Linux only; use awaited mode');
  const version=execFileSync(review.executable,['--version'],{encoding:'utf8',windowsHide:true,timeout:10000,env}).trim();
  const minimum=fullAccess?minimumFullAccessCodexVersion:minimumCodexVersion;
  if(!isSupportedCodexVersion(/^codex-cli (\S+)$/.exec(version)?.[1],minimum))throw new Error(`Native Codex reviewer version is unverified (this route needs ${minimum} or later); use awaited mode`);
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
  // Codex emits top-level `error` rows for conditions it recovers from (a
  // stream reconnect, the fall back from WebSockets to HTTPS when a proxy
  // refuses the socket), then completes the turn; only `turn.failed`, or an
  // `error` after the terminal event, ends the turn without a result.
  if(starts.length!==1||typeof starts[0].thread_id!=='string'||!starts[0].thread_id||turns.length!==1||done.length!==1||rows[0]!==starts[0]||rows.at(-1)!==done[0]||rows.indexOf(turns[0])>rows.indexOf(done[0])||rows.some(row=>row.type==='turn.failed'))throw new Error('Native Codex review failed, interrupted, or incomplete');
  if(!rows.some(row=>row.type==='item.completed'&&row.item?.type==='agent_message'&&typeof row.item.text==='string'&&row.item.text.trim())||!done[0].usage||!['input_tokens','output_tokens','cached_input_tokens'].every(key=>Number.isSafeInteger(done[0].usage[key])&&done[0].usage[key]>=0))throw new Error('Native Codex review lacks a complete response');
  if(rows.some(row=>!['thread.started','turn.started','turn.completed','item.started','item.updated','item.completed','error'].includes(row.type)))throw new Error('Unknown native Codex event type');
  const warnings=rows.filter(row=>row.type==='error').map(row=>String(row.message??'').slice(0,200));
  return {threadId:starts[0].thread_id,status:'completed',warnings};
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
    if(['--json','--skip-git-repo-check','--ignore-user-config','--ignore-rules','--strict-config','--dangerously-bypass-hook-trust'].includes(flag)) {
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
  const permission=review.permissions??{};
  // Every requirement is checked before refusing, so one refusal names each
  // missing or mismatched argument and step field together.
  const missing=[];
  const need=(ok,label)=>{if(!ok)missing.push(label);};
  // The full-access grammar runs as the user under the repository hooks the
  // launcher installs; the sandbox settings have no effect there, so they are refused.
  const fullAccess=codexReviewMode(review)==='full-access';
  for(const flag of ['--ignore-user-config','--ignore-rules','--strict-config','--json','--skip-git-repo-check'])need(values.get(flag),flag);
  need(config.get('model_provider')==='openai','-c model_provider="openai"');
  for(const feature of ['multi_agent','multi_agent_v2'])need(disabled.has(feature),`--disable ${feature}`);
  const sandboxKeys=['windows.sandbox','sandbox_workspace_write.network_access','sandbox_workspace_write.writable_roots','sandbox_workspace_write.exclude_tmpdir_env_var','sandbox_workspace_write.exclude_slash_tmp'];
  if(fullAccess) {
    need(values.get('--dangerously-bypass-hook-trust'),'--dangerously-bypass-hook-trust (the launcher installs the repository hooks in the reviewer home)');
    for(const key of sandboxKeys)need(!config.has(key),`no -c ${key} (sandbox settings do not apply to danger-full-access)`);
    for(const field of ['windowsSandbox','sandboxStateHome'])need(permission[field]===undefined,`no step permissions.${field} (sandbox settings do not apply to danger-full-access)`);
    // The authentication comes from a Codex home on disk or, in a container,
    // from an environment secret holding the contents of auth.json.
    if(permission.codexAuthEnv===undefined)need(path.isAbsolute(permission.codexHome??''),'step permissions.codexHome as the absolute existing Codex home holding auth.json, or step permissions.codexAuthEnv naming the environment secret that holds its contents');
    else need(permission.codexHome===undefined,'step permissions.codexHome or step permissions.codexAuthEnv, not both');
    need(permission.codexAuthProxied===undefined||(permission.codexAuthProxied===true&&permission.codexAuthEnv!==undefined),'step permissions.codexAuthProxied only as true, with step permissions.codexAuthEnv naming the template');
  } else {
    need(!values.has('--dangerously-bypass-hook-trust'),'no --dangerously-bypass-hook-trust (the sandboxed route installs no hooks)');
    need(permission.codexAuthEnv===undefined&&permission.codexAuthProxied===undefined,'no step permissions.codexAuthEnv or codexAuthProxied (the sandboxed route copies its declared setup home)');
    need(config.get('windows.sandbox')==='elevated','-c windows.sandbox="elevated"');
    need(JSON.stringify(config.get('sandbox_workspace_write.writable_roots'))==='[]','-c sandbox_workspace_write.writable_roots=[]');
    need(config.get('sandbox_workspace_write.exclude_tmpdir_env_var')===true,'-c sandbox_workspace_write.exclude_tmpdir_env_var=true');
    need(config.get('sandbox_workspace_write.exclude_slash_tmp')===true,'-c sandbox_workspace_write.exclude_slash_tmp=true');
  }
  const effortValid=['low','medium','high','xhigh','max','ultra'].includes(review.effort);
  need(values.get('--model')===plan.reviewer,`--model ${plan.reviewer}`);
  need(effortValid,'step effort (low, medium, high, xhigh, max or ultra) on a step with an explicit reviewer');
  need(effortValid&&config.get('model_reasoning_effort')===review.effort,`-c model_reasoning_effort="${effortValid?review.effort:'<step effort>'}"`);
  const sandbox=fullAccess?'danger-full-access':'workspace-write';
  need(permission.sandbox===sandbox,`step permissions.sandbox "${sandbox}"`);
  need(permission.approvalPolicy==='never','step permissions.approvalPolicy "never"');
  need(permission.networkAccess===true,'step permissions.networkAccess true');
  need(permission.artifactWrites==='handoff-directory','step permissions.artifactWrites "handoff-directory"');
  need(values.get('--sandbox')===sandbox&&values.get('--sandbox')===permission.sandbox,`--sandbox ${sandbox}`);
  need(config.get('approval_policy')==='never'&&config.get('approval_policy')===permission.approvalPolicy,'-c approval_policy="never"');
  if(!fullAccess)need(config.get('sandbox_workspace_write.network_access')===true&&config.get('sandbox_workspace_write.network_access')===permission.networkAccess,'-c sandbox_workspace_write.network_access=true');
  need(path.isAbsolute(permission.cwd??''),'step permissions.cwd as an absolute private directory');
  need(values.has('--cd')&&values.get('--cd')===permission.cwd,'--cd <step permissions.cwd>');
  need(values.has('--output-last-message'),'--output-last-message <fresh report in step permissions.cwd>');
  if(missing.length)throw new Error(`Codex reviewer step lacks its isolated effective configuration; supply: ${missing.join('; ')}`);
  const root=fs.realpathSync.native(permission.cwd),worktree=fs.realpathSync.native(plan.worktree),job=path.join(fs.realpathSync.native(path.dirname(plan.jobDir)),path.basename(plan.jobDir));
  const common=fs.realpathSync.native(git(worktree,['rev-parse','--path-format=absolute','--git-common-dir']));
  if(contains(root,worktree)||contains(worktree,root)||contains(root,job)||contains(job,root)||contains(root,common)||contains(common,root))throw new Error('Codex reviewer writes must exclude repository and supervisor state');
  // The launcher withholds the secret from its environment and supplies it here.
  if(fullAccess&&permission.codexAuthEnv!==undefined)readCodexAuthSecret(permission,plan.secretSource??process.env);
  else if(fullAccess)validateCodexAuthHome(permission,worktree);
  else validateCodexSandboxStorage(permission,job,worktree);
  const report=values.get('--output-last-message');
  if(!path.isAbsolute(report??'')||fs.existsSync(report)||fs.realpathSync.native(path.dirname(report))!==root)throw new Error('A fresh final report inside the private reviewer directory is required');
}
