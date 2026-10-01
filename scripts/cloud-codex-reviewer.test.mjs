// The Codex reviewer route for a Linux cloud container (#1281): which platform
// accepts which grammar, the authentication secret, and a coordinator-posted
// report through the real launcher with a native-CLI stand-in.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import childProcess from 'node:child_process';
import {syncBuiltinESMExports} from 'node:module';
import {fileURLToPath} from 'node:url';
import {randomUUID,createHash} from 'node:crypto';
import {runHandoff,recordCoordinatorReport,validatePlanShape} from './agent-handoff.mjs';
import {verifyReviewerExecutable,validateCodexReviewer} from './native-reviewer.mjs';
import {nativeReviewerEnvironment,minimumCodexVersion,minimumFullAccessCodexVersion} from './reviewer-security.mjs';
import {validateReviewPlan} from './review-supervisor.mjs';
import {testScratch} from './review-job-root.mjs';
import {removeScratch} from './remove-scratch.mjs';

const here=path.dirname(fileURLToPath(import.meta.url));
const scratch=testScratch('cloud-codex',here);
console.log(`Scratch repository: ${scratch}`);
const originalExec=childProcess.execFileSync,originalSpawn=childProcess.spawn;
const restore=()=>{childProcess.execFileSync=originalExec;childProcess.spawn=originalSpawn;syncBuiltinESMExports();};
const secretName='IMPOWER_TEST_CODEX_AUTH_JSON';
const credential=`fixture-codex-credential-${randomUUID()}`;
const ghCredential=`fixture-github-credential-${randomUUID()}`;
const ambient={[secretName]:JSON.stringify({auth_mode:'chatgpt',tokens:{access_token:credential}}),GH_TOKEN:ghCredential,GITHUB_TOKEN:ghCredential};
const previous=Object.fromEntries(Object.keys(ambient).map(key=>[key,process.env[key]]));
const secretHomes=()=>new Set(fs.readdirSync(os.tmpdir()).filter(name=>name.startsWith('impower-codex-home-')));
const homesBefore=secretHomes();
try {
  Object.assign(process.env,ambient);
  const repo=path.join(scratch,'repo');fs.mkdirSync(repo);
  const git=(...args)=>execFileSync('git',args,{cwd:repo,encoding:'utf8',windowsHide:true});
  git('init','--quiet');git('-c','user.name=test','-c','user.email=test@example.invalid','commit','--allow-empty','-qm','fixture');
  const head=git('rev-parse','HEAD').trim();
  const job=path.join(scratch,'pr-1281','round-1');fs.mkdirSync(job,{recursive:true});
  const privateDir=path.join(job,'reviewer-cloud-1');fs.mkdirSync(privateDir);
  // The launcher's journal and evidence live apart from the reviewer's directory.
  const handoff=path.join(job,'handoff');fs.mkdirSync(handoff);
  const report=path.join(privateDir,'report.md');
  const prompt=path.join(job,'prompt.txt');fs.writeFileSync(prompt,'Review the frozen repository and return the full report.');
  const fullArgs=['exec','--model','gpt-test','-c','model_reasoning_effort="high"','-c','approval_policy="never"','--sandbox','danger-full-access','-c','model_provider="openai"','--cd',privateDir,'--skip-git-repo-check','--ignore-user-config','--ignore-rules','--strict-config','--json','--disable','multi_agent','--disable','multi_agent_v2','--dangerously-bypass-hook-trust','--output-last-message',report,'-'];
  const sandboxArgs=['exec','--model','gpt-test','-c','model_reasoning_effort="high"','-c','approval_policy="never"','--sandbox','workspace-write','-c','windows.sandbox="elevated"','-c','sandbox_workspace_write.network_access=true','-c','model_provider="openai"','-c','sandbox_workspace_write.writable_roots=[]','-c','sandbox_workspace_write.exclude_tmpdir_env_var=true','-c','sandbox_workspace_write.exclude_slash_tmp=true','--cd',privateDir,'--skip-git-repo-check','--ignore-user-config','--ignore-rules','--strict-config','--json','--disable','multi_agent','--disable','multi_agent_v2','--output-last-message',report,'-'];
  const permissions={sandbox:'danger-full-access',approvalPolicy:'never',networkAccess:true,artifactWrites:'handoff-directory',cwd:privateDir,codexAuthEnv:secretName};
  const codexPlan={reviewer:'gpt-test',worktree:repo,jobDir:handoff};

  // The full-access grammar is accepted on Windows and Linux, the sandboxed
  // grammar on Windows only, and neither elsewhere; the version gates stay.
  {
    let version,versionCalls=0;
    childProcess.execFileSync=(exe,args,options)=>{if(exe==='/fixture/codex'&&args[0]==='--version'){versionCalls++;return `codex-cli ${version}\n`;}return originalExec(exe,args,options);};
    syncBuiltinESMExports();
    try {
      const check=(platform,args,installed)=>{version=installed;return ()=>verifyReviewerExecutable({transport:'native-codex-jsonl',executable:'/fixture/codex',args},{platform});};
      assert.doesNotThrow(check('win32',sandboxArgs,minimumCodexVersion),'Windows keeps the sandboxed grammar');
      assert.doesNotThrow(check('win32',fullArgs,minimumFullAccessCodexVersion),'Windows keeps the full-access grammar');
      assert.throws(check('win32',fullArgs,'0.158.0'),/version is unverified/,'Windows keeps the full-access version gate');
      assert.doesNotThrow(check('linux',fullArgs,minimumFullAccessCodexVersion),'Linux accepts the full-access grammar');
      assert.throws(check('linux',fullArgs,'0.158.0'),/version is unverified \(this route needs 0\.159\.0/,'Linux applies the full-access version gate');
      const before=versionCalls;
      assert.throws(check('linux',sandboxArgs,minimumCodexVersion),/Windows only.*full-access grammar/,'Linux refuses the sandboxed grammar');
      for(const args of [fullArgs,sandboxArgs])assert.throws(check('darwin',args,minimumFullAccessCodexVersion),/Windows and Linux only/);
      assert.equal(versionCalls,before,'a platform refusal runs no executable');
    } finally {restore();}
    console.log('PASS: the full-access Codex grammar is accepted on Windows and Linux, the sandboxed grammar on Windows only, with both version gates unchanged');
  }

  // The secret is named in the plan and read from the launcher's environment;
  // a refusal never echoes it, and a partial grammar lists every problem.
  {
    const validate=(changes={},args=fullArgs)=>validateCodexReviewer({args,effort:'high',permissions:{...permissions,...changes}},codexPlan);
    assert.doesNotThrow(()=>validate(),'the full-access grammar accepts an authentication secret');
    assert.throws(()=>validate({codexAuthEnv:'IMPOWER_TEST_ABSENT_SECRET'}),/IMPOWER_TEST_ABSENT_SECRET is not set/);
    assert.throws(()=>validate({codexAuthEnv:'lower_case'}),/upper-case/);
    assert.throws(()=>validate({codexHome:scratch}),/codexHome or step permissions.codexAuthEnv, not both/);
    const marker=`not-json-${randomUUID()}`;
    process.env[secretName]=marker;
    assert.throws(()=>validate(),error=>/JSON object from auth.json/.test(error.message)&&!error.message.includes(marker),'a malformed secret is refused without echoing it');
    process.env[secretName]=ambient[secretName];
    assert.throws(()=>validate({sandbox:'workspace-write'},fullArgs.filter(arg=>!['--dangerously-bypass-hook-trust','--ignore-rules'].includes(arg))),error=>{
      for(const problem of ['--ignore-rules','--dangerously-bypass-hook-trust','step permissions.sandbox "danger-full-access"'])assert.ok(error.message.includes(problem),`one refusal names ${problem}: ${error.message}`);
      return true;
    });
    assert.throws(()=>validateCodexReviewer({args:sandboxArgs,effort:'high',permissions:{...permissions,sandbox:'workspace-write',windowsSandbox:'elevated',sandboxStateHome:scratch}},codexPlan),/no step permissions.codexAuthEnv/,'the sandboxed grammar takes no secret');
    console.log('PASS: the authentication secret is validated without echoing it, and a partial grammar is refused with every problem listed');
  }

  // A coordinator-posted report holds exactly one native Codex review, and the
  // supervised route, which verifies reviewer-posted reports, refuses it.
  {
    const step={role:'review',round:1,model:'gpt-test',nativeResult:'codex-jsonl',executable:process.execPath,args:fullArgs,effort:'high',permissions,prompt,next:[null]};
    const shape=(changes={},steps={check:step})=>({pr:1281,first:Object.keys(steps)[0],maxSteps:1,reportPosting:'coordinator',steps,...changes});
    assert.doesNotThrow(()=>validatePlanShape(shape()));
    assert.throws(()=>validatePlanShape(shape({reportPosting:'reviewer'})),/reportPosting must be "coordinator"/);
    assert.throws(()=>validatePlanShape(shape({maxSteps:2})),/one native Codex review/);
    assert.throws(()=>validatePlanShape(shape({},{check:{...step,next:['check']}})),/one native Codex review/);
    assert.throws(()=>validatePlanShape(shape({},{check:{...step,nativeResult:'claude-json'}})),/one native Codex review/);
    assert.throws(()=>validatePlanShape(shape({},{check:{...step,reportPosting:'coordinator'}})),/Move reportPosting from step check/);
    const supervised={worktree:repo,jobDir:job,head,base:head,pr:1281,writer:'claude-opus-5',writerEffort:'high',permissions:{permissionMode:'dontAsk'},reviewer:'gpt-test',round:1,completedReviewRound:0,destination:{threadId:'origin',turnId:'turn',cwd:repo},reportPosting:'coordinator',reviews:[{id:'cloud',transport:'native-codex-jsonl',executable:process.execPath,prompt,effort:'high',permissions,args:fullArgs}]};
    assert.throws(()=>validateReviewPlan(supervised,{jobRoot:scratch}),/awaited launcher/);
    console.log('PASS: a coordinator-posted report is limited to a one-review awaited plan');
  }

  // A refusal after the secret's copy was written removes the copy.
  {
    const before=secretHomes();
    childProcess.execFileSync=(exe,args,options)=>{if(exe==='gh')throw new Error('fixture: no gh login');return originalExec(exe,args,options);};
    syncBuiltinESMExports();
    try {
      const directory=fs.mkdtempSync(path.join(job,'refused-'));
      assert.throws(()=>nativeReviewerEnvironment({args:fullArgs,permissions,nativeResult:'codex-jsonl'},directory,process.env,{worktree:repo}),/GitHub authentication unavailable.*reportPosting/);
    } finally {restore();}
    const created=[...secretHomes()].filter(name=>!before.has(name));
    assert.equal(created.length,1,'the secret route writes one private home outside the job directory');
    assert.equal(fs.existsSync(path.join(os.tmpdir(),created[0],'auth.json')),false,'a refused launch leaves no authentication copy');
    console.log('PASS: a launch refused after the secret was copied removes the copy');
  }

  // The real launcher, with a stand-in for the Codex CLI: the reviewer gets
  // the secret only in its private home and no GitHub access, its slot is held
  // while it runs, and the journal awaits the coordinator's post.
  if(['win32','linux'].includes(process.platform)) {
    const slots=path.join(scratch,'slots'),capture=path.join(scratch,'capture.json'),stand=path.join(scratch,'codex-stand-in.mjs');
    fs.writeFileSync(stand,`import fs from 'node:fs';import path from 'node:path';import {createHash} from 'node:crypto';
let text='';for await(const chunk of process.stdin)text+=chunk;
if(text.startsWith('Reviewer route probe')){console.log('OK');process.exit(0);}
const argv=JSON.parse(process.env.FIXTURE_ARGV),slots=process.env.FIXTURE_SLOTS,home=process.env.CODEX_HOME,auth=path.join(home,'auth.json');
const start=text.indexOf('handoff-report-'),token=text.slice(start,text.indexOf(String.fromCharCode(96),start)),head=/reviewed head=([a-f0-9]+)/.exec(text)[1];
const reservations=fs.readdirSync(slots).filter(name=>name.endsWith('.jsonl')).map(name=>fs.readFileSync(path.join(slots,name),'utf8').trim().split('\\n').map(line=>JSON.parse(line).phase));
fs.writeFileSync(${JSON.stringify(capture)},JSON.stringify({argv,home,reservations,authSha256:createHash('sha256').update(fs.readFileSync(auth)).digest('hex'),authMode:process.platform==='win32'?null:(fs.statSync(auth).mode&0o777),homeFiles:fs.readdirSync(home).sort(),secretVisible:Object.hasOwn(process.env,${JSON.stringify(secretName)}),github:Object.keys(process.env).filter(key=>/^GH_|^GITHUB_TOKEN$/i.test(key))}));
fs.writeFileSync(argv[argv.indexOf('--output-last-message')+1],'### Adversarial review — undirected (gpt-test)\\n\\nRound 1, reviewed head '+head+'.\\n\\nNo findings through this lens.\\n\\n'+token+'\\n');
fs.writeFileSync(/Write (.*?) with the editor tool/.exec(text)[1],JSON.stringify({head,next:null,commentIds:[],summary:'Report returned for the coordinator to post'}));
for(const row of [{type:'thread.started',thread_id:'fixture-thread'},{type:'turn.started'},{type:'item.completed',item:{id:'answer',type:'agent_message',text:'Report returned.'}},{type:'turn.completed',usage:{input_tokens:1,cached_input_tokens:0,output_tokens:2}}])console.log(JSON.stringify(row));
console.error('diagnostic after terminal result');
`);
    const journal=path.join(handoff,'handoff.jsonl'),planFile=path.join(job,'plan.json');
    const plan={worktree:repo,journal,pr:1281,writer:'claude-opus-5',writerEffort:'high',reviewer:'gpt-test',completedReviewRound:0,maxSteps:1,first:'check',reportPosting:'coordinator',steps:{check:{role:'review',round:1,model:'gpt-test',nativeResult:'codex-jsonl',executable:process.execPath,args:fullArgs,effort:'high',permissions,prompt,next:[null]}}};
    // A partial grammar is refused before the lock, journal or a slot exists.
    const partialFile=path.join(job,'partial.json');
    fs.writeFileSync(partialFile,JSON.stringify({...plan,journal:path.join(handoff,'partial.jsonl'),steps:{check:{...plan.steps.check,args:fullArgs.filter(arg=>arg!=='--strict-config')}}}));
    await assert.rejects(runHandoff(partialFile,{jobRoot:scratch,slotRoot:slots}),/--strict-config/);
    assert.equal(fs.existsSync(slots),false,'a refused plan reserves no slot');assert.equal(fs.existsSync(path.join(handoff,'partial.jsonl')),false);
    fs.writeFileSync(planFile,JSON.stringify(plan));
    let ghCalls=0;
    childProcess.execFileSync=(exe,args,options)=>{
      if(exe==='gh'){ghCalls++;throw new Error('fixture: no gh login in the container');}
      if(exe===process.execPath&&args[0]==='--version')return `codex-cli ${minimumFullAccessCodexVersion}`;
      return originalExec(exe,args,options);
    };
    childProcess.spawn=(exe,args,options)=>{
      if(exe!==process.execPath||args[0]!=='exec')return originalSpawn(exe,args,options);
      assert.equal(JSON.stringify(args).includes(credential),false,'the secret is not in argv');
      return originalSpawn(exe,[stand],{...options,env:{...options.env,FIXTURE_ARGV:JSON.stringify(args),FIXTURE_SLOTS:slots}});
    };
    syncBuiltinESMExports();
    let outcome;
    try {outcome=await runHandoff(planFile,{jobRoot:scratch,slotRoot:slots});}
    finally {restore();}
    const rows=fs.readFileSync(journal,'utf8').trim().split('\n').map(line=>JSON.parse(line)),observed=JSON.parse(fs.readFileSync(capture,'utf8'));
    const at=event=>rows.findIndex(row=>row.event===event);
    assert.equal(ghCalls,0,'a coordinator-posted report needs no gh login');
    assert.deepEqual(observed.github,[],'the reviewer receives no GitHub credential');
    assert.equal(observed.secretVisible,false,'the reviewer environment does not carry the secret variable');
    assert.deepEqual(observed.homeFiles,['auth.json','hooks.json'],'the private home holds the authentication copy and the repository hooks');
    assert.equal(observed.authSha256,createHash('sha256').update(ambient[secretName]).digest('hex'),'the private home holds the secret verbatim');
    if(process.platform!=='win32')assert.equal(observed.authMode,0o600,'the authentication copy is owner-only');
    assert.deepEqual(observed.reservations,[['reserved','launching','running']],'the reviewer runs while its slot is held');
    assert.deepEqual(fs.readdirSync(slots),[],'the slot is released after confirmed exit');
    assert.ok(at('reserved')<at('running')&&at('running')<at('exited')&&at('exited')<at('completed'),'reservation, launch, confirmed exit and completion are journalled in order');
    assert.equal(at('blocked'),-1);
    assert.equal(rows.at(-1).event,'report-awaiting-post');assert.equal(rows.at(-1).report,report);assert.equal(outcome.pendingReport.reportSha256,rows.at(-1).reportSha256);
    assert.equal(rows.find(row=>row.event==='launching').reportPosting,'coordinator');
    assert.equal(path.relative(scratch,observed.home).startsWith('..'),true,'the private home lies outside the job and review directories');
    assert.equal(fs.existsSync(path.join(observed.home,'auth.json')),false,'the authentication copy is removed after confirmed exit');
    console.log('PASS: the launcher runs a Codex stand-in with the secret only in its private home and no GitHub access, holds its slot until confirmed exit and awaits the coordinator\'s post');

    // The coordinator posts the report verbatim and records the comment.
    const text=fs.readFileSync(report,'utf8'),readBack=path.join(job,'read-back.md');
    const line='Posted on behalf of the gpt-test reviewer, which has no GitHub access in this container.';
    const refuses=(body,id,pattern)=>{fs.writeFileSync(readBack,body);assert.throws(()=>recordCoordinatorReport(journal,id,readBack),pattern);};
    refuses(text,101,/verbatim/);
    refuses(`${line}\n\n${text.replace('No findings','Some findings')}`,101,/verbatim/);
    refuses(`Posted by the coordinator.\n\n${text}`,101,/verbatim/);
    refuses(`${line}\n\n${text}`,'abc',/numeric ID/);
    fs.writeFileSync(report,text+'edited\n');refuses(`${line}\n\n${text}`,101,/changed since/);fs.writeFileSync(report,text);
    fs.writeFileSync(readBack,`${line}\r\n\r\n${text.replaceAll('\n','\r\n')}`);
    execFileSync(process.execPath,[path.join(here,'agent-handoff.mjs'),'record-report',journal,'5704126199',readBack],{encoding:'utf8',windowsHide:true});
    const recorded=fs.readFileSync(journal,'utf8').trim().split('\n').map(line=>JSON.parse(line));
    assert.deepEqual(recorded.slice(-2).map(row=>row.event),['report-posted','finished']);
    assert.equal(recorded.at(-2).commentId,5704126199);assert.equal(recorded.at(-2).postedBy,'coordinator');assert.equal(recorded.at(-2).head,head);
    assert.equal(recorded.some(row=>row.event==='blocked'),false);
    assert.throws(()=>recordCoordinatorReport(journal,5704126199,readBack),/does not end awaiting/,'a recorded report cannot be recorded twice');
    console.log('PASS: the coordinator\'s verbatim post is recorded with its comment ID, and an edited, unprefixed or changed report is refused');

    // Neither credential reaches the journal, logs, argv or any job file.
    const walk=directory=>fs.readdirSync(directory,{withFileTypes:true}).flatMap(entry=>entry.isDirectory()?walk(path.join(directory,entry.name)):[path.join(directory,entry.name)]);
    const files=[...walk(scratch),...walk(observed.home)];
    assert.ok(files.includes(journal)&&files.some(file=>file.endsWith('process.log'))&&files.some(file=>file.endsWith('stderr.log')));
    for(const file of files){const content=fs.readFileSync(file,'utf8');for(const secret of [credential,ghCredential])assert.equal(content.includes(secret),false,`${file} holds a credential`);}
    console.log(`PASS: neither the Codex nor the GitHub credential appears in any of ${files.length} files under the job, review and private home directories`);
  } else console.log(`SKIP: the launcher's Codex route runs on Windows and Linux only, not ${process.platform}; the platform refusals ran`);
} finally {
  restore();
  for(const [key,value] of Object.entries(previous)){if(value===undefined)delete process.env[key];else process.env[key]=value;}
  removeScratch(scratch);
  // The private homes this check created outside the scratch folder.
  for(const name of secretHomes())if(!homesBefore.has(name))removeScratch(path.join(os.tmpdir(),name));
}
