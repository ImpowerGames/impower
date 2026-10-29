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
import {runHandoff as actualRunHandoff,recordCoordinatorReport,validatePlanShape,coordinatorReport,verifyNativeReviewResult} from './agent-handoff.mjs';
import {verifyReviewerExecutable,validateCodexReviewer} from './native-reviewer.mjs';
import {nativeReviewerEnvironment,removeSecretCodexHome,minimumCodexVersion,minimumFullAccessCodexVersion} from './reviewer-security.mjs';
import {validateReviewPlan} from './review-supervisor.mjs';
import {proxyAuthTemplate,checkProxyAuthTemplate} from './codex-proxy-auth.mjs';
import {testScratch} from './review-job-root.mjs';
import {removeScratch} from './remove-scratch.mjs';
import * as probeCleanupModule from './reviewer-probe-cleanup.mjs';
const {removeProbeCheckouts:guardedProbeCleanup,snapshotReviewerDirectory}=probeCleanupModule;
import {acquire} from './test-suite-process.mjs';
import {readRepos} from '../.agents/repos.mjs';

const here=path.dirname(fileURLToPath(import.meta.url));
const scratch=testScratch('cloud-codex',here);
console.log(`Scratch repository: ${scratch}`);
// Each cutover position is read from its own copy of the repos file. The
// coordinator-posted route runs with the switch on: the plan names the internal
// ticket, and the journal names it as the review thread the report goes on.
const committed=readRepos();
const pinRepos=cutover=>{const file=path.join(scratch,`repos-${cutover?'on':'off'}.json`);fs.writeFileSync(file,JSON.stringify({...committed,cutover}));return readRepos(file);};
const OFF=pinRepos(false),ON=pinRepos(true);
const runHandoff=(file,options={})=>actualRunHandoff(file,{repos:ON,...options});
const cleanupReservationRoot=path.join(scratch,'cleanup-reservations');fs.mkdirSync(cleanupReservationRoot);
const removeProbeCheckouts=(directory,options={})=>guardedProbeCleanup(directory,{...options,reservationRoot:cleanupReservationRoot});
const originalExec=childProcess.execFileSync,originalSpawn=childProcess.spawn;
const restore=()=>{childProcess.execFileSync=originalExec;childProcess.spawn=originalSpawn;syncBuiltinESMExports();};
const secretName='IMPOWER_TEST_CODEX_AUTH_JSON';
const credential=`fixture-codex-credential-${randomUUID()}`;
const ghCredential=`fixture-github-credential-${randomUUID()}`;
const ambient={[secretName]:JSON.stringify({auth_mode:'chatgpt',tokens:{access_token:credential}}),GH_TOKEN:ghCredential,GITHUB_TOKEN:ghCredential};
const previous=Object.fromEntries(Object.keys(ambient).map(key=>[key,process.env[key]]));
// The secret's home goes to the machine's temp directory, which a run under
// check-agent-tooling has redirected away from os.tmpdir().
const systemTemp=process.env.IMPOWER_SYSTEM_TMPDIR||os.tmpdir();
const secretHomes=()=>new Set(fs.readdirSync(systemTemp).filter(name=>name.startsWith('impower-codex-home-')));
// The homes this check itself created, by name; the launcher removes each one
// and the final cleanup covers only an assertion failure in between, never a
// home another launcher created meanwhile.
const createdHomes=new Set();
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
    assert.throws(()=>validateReviewPlan(supervised,{jobRoot:scratch,repos:OFF}),/awaited launcher/);
    console.log('PASS: a coordinator-posted report is limited to a one-review awaited plan');
  }

  // A refusal after the secret's copy was written removes the copy.
  {
    const before=secretHomes(),written=[];
    childProcess.execFileSync=(exe,args,options)=>{if(exe==='gh'){written.push(...[...secretHomes()].filter(name=>!before.has(name)));throw new Error('fixture: no gh login');}return originalExec(exe,args,options);};
    syncBuiltinESMExports();
    try {
      const directory=fs.mkdtempSync(path.join(job,'refused-'));
      assert.throws(()=>nativeReviewerEnvironment({args:fullArgs,permissions,nativeResult:'codex-jsonl'},directory,process.env,{worktree:repo}),/GitHub authentication unavailable.*reportPosting/);
    } finally {restore();}
    assert.equal(written.length,1,'the secret route writes one private home outside the job directory before the refusal');
    createdHomes.add(path.join(systemTemp,written[0]));
    assert.equal(fs.existsSync(path.join(systemTemp,written[0])),false,'a refused launch removes the private home with its authentication copy');
    assert.deepEqual([...secretHomes()].filter(name=>!before.has(name)),[]);
    assert.throws(()=>removeSecretCodexHome(path.join(systemTemp,'other-home')),/not a secret route Codex home/,'only a home this launcher created is removed');
    // The guard takes a canonical direct child of the temporary directory, so
    // a traversal through a real home, or a home elsewhere, is refused.
    const realHome=fs.mkdtempSync(path.join(systemTemp,'impower-codex-home-')),sibling=fs.mkdtempSync(path.join(systemTemp,'impower-sibling-'));
    createdHomes.add(realHome);
    try {
      assert.throws(()=>removeSecretCodexHome(path.join(realHome,'..',path.basename(sibling))),/not a secret route Codex home/,'a traversal through a home is refused');
      assert.throws(()=>removeSecretCodexHome(path.join(realHome,'..')),/not a secret route Codex home/);
      assert.throws(()=>removeSecretCodexHome(path.join(scratch,'impower-codex-home-elsewhere')),/not a secret route Codex home/,'a home outside the temporary directory is refused');
      assert.ok(fs.existsSync(sibling),'the sibling survives every refusal');
      removeSecretCodexHome(realHome);
      assert.equal(fs.existsSync(realHome),false,'a real home is removed');
    } finally {fs.rmSync(sibling,{recursive:true,force:true});}
    console.log('PASS: a launch refused after the secret was copied removes the private home');
  }

  // The version probe is a child too: it runs without the secret variable.
  {
    let probeEnv;
    childProcess.execFileSync=(exe,args,options)=>{if(exe==='/fixture/codex'&&args[0]==='--version'){probeEnv=options.env;return `codex-cli ${minimumFullAccessCodexVersion}\n`;}return originalExec(exe,args,options);};
    syncBuiltinESMExports();
    try {
      // Windows spells PATH as Path, so the kept variable is a marker of our own.
      const sanitized={...process.env,IMPOWER_TEST_PROBE_MARKER:'kept'};delete sanitized[secretName];
      verifyReviewerExecutable({transport:'native-codex-jsonl',executable:'/fixture/codex',args:fullArgs},{platform:'linux',env:sanitized});
      assert.equal(Object.hasOwn(probeEnv,secretName),false,'the version probe does not inherit the secret');
      assert.equal(probeEnv.IMPOWER_TEST_PROBE_MARKER,'kept','the probe keeps the rest of the environment');
    } finally {restore();}
    console.log('PASS: the version probe runs without the authentication secret');
  }

  // Codex reports a recovered stream disconnect or transport fallback as
  // top-level error rows and still completes the turn; the result check keeps
  // those as warnings and still refuses a failed or interrupted turn.
  {
    const stream=[{type:'thread.started',thread_id:'fixture-thread'},{type:'turn.started'},{type:'item.completed',item:{id:'item_0',type:'error',message:'`--dangerously-bypass-hook-trust` is enabled.'}},{type:'error',message:'Reconnecting... 2/5 (stream disconnected before completion: Attack attempt detected)'},{type:'item.completed',item:{id:'item_2',type:'error',message:'Falling back from WebSockets to HTTPS transport.'}},{type:'item.completed',item:{id:'answer',type:'agent_message',text:'Report returned.'}},{type:'turn.completed',usage:{input_tokens:1,cached_input_tokens:0,output_tokens:2}}];
    const output=path.join(job,'warnings.jsonl');
    const write=rows=>fs.writeFileSync(output,rows.map(row=>JSON.stringify(row)).join('\n')+'\n');
    write(stream);
    const result=verifyNativeReviewResult(output,'codex-jsonl');
    assert.equal(result.status,'completed');
    assert.deepEqual(result.warnings,['Reconnecting... 2/5 (stream disconnected before completion: Attack attempt detected)'],'recovered errors are returned as warnings');
    write([...stream,{type:'error',message:'late'}]);assert.throws(()=>verifyNativeReviewResult(output,'codex-jsonl'),/failed, interrupted, or incomplete/,'an error after the terminal event is not a completion');
    write([...stream.slice(0,-1),{type:'turn.failed',error:{message:'failed'}}]);assert.throws(()=>verifyNativeReviewResult(output,'codex-jsonl'),/failed, interrupted, or incomplete/);
    write(stream.slice(0,-1));assert.throws(()=>verifyNativeReviewResult(output,'codex-jsonl'),/failed, interrupted, or incomplete/);
    console.log('PASS: a Codex turn that recovers from stream errors completes with warnings, and a failed or interrupted turn is still refused');
  }

  // The report token must end the report; a prompt quoting it does not count.
  {
    const file=path.join(job,'final-message.md'),token='handoff-report-fixture';
    const accepts=text=>{fs.writeFileSync(file,text);return coordinatorReport(file,head,token);};
    assert.equal(accepts(`### Review\n\nreviewed head ${head}.\n\nNo findings.\n\n${token}\n`).report,file);
    assert.equal(accepts(`### Review\n\nreviewed head ${head}.\n\n${token}\n\n\n`).report,file,'trailing blank lines after the token are fine');
    for(const incomplete of [`Prompt said: reviewed head ${head}; end with ${token}.\n\nReview interrupted before examining the diff.\n`,`reviewed head ${head}\n${token} and more\n`,`${token}\n`,''])assert.throws(()=>accepts(incomplete),/end with its report token/,`refused: ${JSON.stringify(incomplete.slice(0,40))}`);
    console.log('PASS: a final message is a report only when the launch token is its last line');
  }

  // With the proxy adding the token, the variable holds a template that can
  // authenticate nothing by itself, and a real login there is refused.
  {
    const tokenSecret=`fixture-access-${randomUUID()}`,refreshSecret=`fixture-refresh-${randomUUID()}`,signature=`fixture-signature-${randomUUID()}`;
    const jwt=part=>Buffer.from(JSON.stringify(part)).toString('base64url');
    const login={OPENAI_API_KEY:null,tokens:{id_token:`${jwt({alg:'RS256'})}.${jwt({email:'author@example.invalid','https://api.openai.com/auth':{chatgpt_plan_type:'plus',chatgpt_account_id:'fixture-account'}})}.${signature}`,access_token:tokenSecret,refresh_token:refreshSecret,account_id:'fixture-account',later_secret:'fixture-later'},last_refresh:'2020-01-01T00:00:00Z',later_field:'fixture-later'};
    const loginFile=path.join(scratch,'auth.json');fs.writeFileSync(loginFile,JSON.stringify(login));
    const cli=(...args)=>execFileSync(process.execPath,[path.join(here,'codex-proxy-auth.mjs'),...args,loginFile],{encoding:'utf8',windowsHide:true});
    const text=cli('template'),template=JSON.parse(text);
    for(const secret of [tokenSecret,refreshSecret,signature,'fixture-later'])assert.equal(text.includes(secret),false,'the template carries no token, signature or unknown field');
    assert.equal(template.tokens.account_id,'fixture-account');assert.equal(template.tokens.id_token.split('.')[1],login.tokens.id_token.split('.')[1],'the identity claims are kept');
    assert.doesNotThrow(()=>checkProxyAuthTemplate(template));
    assert.deepEqual(proxyAuthTemplate(login).tokens,template.tokens,'the CLI prints the exported template');
    assert.equal(cli('access-token'),tokenSecret,'access-token prints only the token for the proxy credential');
    const proxied={...permissions,codexAuthProxied:true};
    const validate=changes=>validateCodexReviewer({args:fullArgs,effort:'high',permissions:{...proxied,...changes}},codexPlan);
    process.env[secretName]=text;
    assert.doesNotThrow(()=>validate({}),'a template passes the proxied route');
    process.env[secretName]=JSON.stringify(login);
    assert.throws(()=>validate({}),error=>/not a template/.test(error.message)&&/tokens.access_token/.test(error.message)&&/unexpected fields later_field/.test(error.message)&&![tokenSecret,refreshSecret,signature].some(secret=>error.message.includes(secret)),'a real login is refused on the proxied route without echoing it');
    process.env[secretName]=text;
    assert.throws(()=>validate({codexAuthProxied:'yes'}),/codexAuthProxied only as true/);
    assert.throws(()=>validate({codexAuthEnv:undefined,codexHome:scratch}),/codexAuthProxied only as true/);
    const directory=fs.mkdtempSync(path.join(job,'proxied-'));
    const env=nativeReviewerEnvironment({args:fullArgs,permissions:proxied,nativeResult:'codex-jsonl'},directory,{...process.env,[secretName]:JSON.stringify({...template,last_refresh:'2020-01-01T00:00:00Z'})},{worktree:repo,reportPosting:'coordinator'});
    createdHomes.add(env.CODEX_HOME);
    const written=JSON.parse(fs.readFileSync(path.join(env.CODEX_HOME,'auth.json'),'utf8'));
    assert.deepEqual(written.tokens,template.tokens,'the private home holds the template');
    assert.ok(Date.parse(written.last_refresh)>Date.parse('2024-01-01'),'the launcher renews the refresh time so Codex does not refresh the placeholders');
    removeSecretCodexHome(env.CODEX_HOME);
    let ghEnv;
    childProcess.execFileSync=(exe,args,options)=>{if(exe==='gh'&&args[0]==='auth'){ghEnv=options.env;return `${ghCredential}\n`;}return originalExec(exe,args,options);};
    syncBuiltinESMExports();
    try {
      const posting=nativeReviewerEnvironment({args:fullArgs,permissions:proxied,nativeResult:'codex-jsonl'},fs.mkdtempSync(path.join(job,'posting-')),{...process.env,[secretName]:text},{worktree:repo});
      createdHomes.add(posting.CODEX_HOME);
      assert.equal(Object.hasOwn(ghEnv,secretName),false,'the gh helper does not inherit the secret');
      assert.equal(ghEnv.PATH??ghEnv.Path,process.env.PATH??process.env.Path,'the gh helper keeps the user\'s environment');
      assert.equal(posting.GH_TOKEN,ghCredential,'the reviewer-posted route still delegates the GitHub token');
      removeSecretCodexHome(posting.CODEX_HOME);
    } finally {restore();}
    process.env[secretName]=ambient[secretName];
    console.log('PASS: the proxied route takes a template holding no usable token, refuses a real login without echoing it, and renews its refresh time');
  }

  // The cleanup keeps what it is told to keep, unlinks links without entering
  // them, and refuses a directory that is not a real one.
  {
    const dir=fs.mkdtempSync(path.join(scratch,'cleanup-')),outside=fs.mkdtempSync(path.join(scratch,'cleanup-outside-'));
    fs.writeFileSync(path.join(outside,'keep.txt'),'survives');
    // Entries the directory held before the reviewer ran (another round's journal, a later step's prompt) are never removed.
    fs.writeFileSync(path.join(dir,'adjudication.txt'),'later prompt');fs.mkdirSync(path.join(dir,'other-round'));fs.writeFileSync(path.join(dir,'other-round','handoff.jsonl'),'j');
    const had=snapshotReviewerDirectory(dir);
    fs.mkdirSync(path.join(dir,'clone','deep'),{recursive:true});fs.mkdirSync(path.join(dir,'clone','.git'));fs.mkdirSync(path.join(dir,'reports'));fs.writeFileSync(path.join(dir,'reports','first-pass.md'),'first pass');fs.writeFileSync(path.join(dir,'clone','deep','a.js'),'a');
    fs.symlinkSync(outside,path.join(dir,'clone','link'),'junction');fs.symlinkSync(outside,path.join(dir,'top-link'),'junction');
    fs.writeFileSync(path.join(dir,'..report.md'),'report');fs.writeFileSync(path.join(dir,'notes.txt'),'n');
    const keepReport=process.platform==='win32'?path.join(dir,'..REPORT.md'):path.join(dir,'..report.md');
    const counts=removeProbeCheckouts(dir,{preserve:had,keep:[keepReport]});
    assert.deepEqual(fs.readdirSync(dir).sort(),['..report.md','adjudication.txt','notes.txt','other-round','reports'],'the kept dot-prefixed report (named in another case on Windows), the reviewer\'s other files and the pre-existing entries remain');
    assert.equal(fs.readFileSync(path.join(dir,'reports','first-pass.md'),'utf8'),'first pass','a report the reviewer wrote in a subdirectory stays');
    assert.equal(fs.existsSync(path.join(dir,'other-round','handoff.jsonl')),true);
    assert.deepEqual([counts.files,counts.links],[1,2]);
    assert.equal(fs.readFileSync(path.join(outside,'keep.txt'),'utf8'),'survives','links are not followed');
    assert.deepEqual(removeProbeCheckouts(dir,{preserve:had,keep:[keepReport]}).files,0,'a second run removes nothing');
    // A kept report that is a link (to a file, through a chain, or to a directory) refuses the whole cleanup before anything is removed.
    const linkedDir=fs.mkdtempSync(path.join(scratch,'cleanup-report-link-')),linkedHad=snapshotReviewerDirectory(linkedDir);
    fs.writeFileSync(path.join(linkedDir,'answer.md'),'the report');fs.writeFileSync(path.join(linkedDir,'junk.txt'),'j');fs.mkdirSync(path.join(linkedDir,'alias-target'));
    fs.symlinkSync(path.join(linkedDir,'alias-target'),path.join(linkedDir,'report.md'),'junction');
    assert.throws(()=>removeProbeCheckouts(linkedDir,{preserve:linkedHad,keep:[path.join(linkedDir,'report.md')]}),/not a regular file; nothing was removed/,'a report that is a directory link is refused');
    assert.deepEqual(fs.readdirSync(linkedDir).sort(),['alias-target','answer.md','junk.txt','report.md'],'a refused cleanup removes nothing');
    try{fs.unlinkSync(path.join(linkedDir,'report.md'));}catch{fs.rmdirSync(path.join(linkedDir,'report.md'));}
    try{
      fs.symlinkSync(path.join(linkedDir,'answer.md'),path.join(linkedDir,'middle.md'),'file');fs.symlinkSync(path.join(linkedDir,'middle.md'),path.join(linkedDir,'report.md'),'file');
      assert.throws(()=>removeProbeCheckouts(linkedDir,{preserve:linkedHad,keep:[path.join(linkedDir,'report.md')]}),/not a regular file/,'a report linked through a chain is refused');
      assert.equal(fs.readFileSync(path.join(linkedDir,'report.md'),'utf8'),'the report','the chain is still readable');
    } catch(error){if(error.code!=='EPERM')throw error;console.log('SKIP: a report linked through a chain of file symlinks (creating a file symlink needs a privilege this account lacks)');}
    fs.rmSync(linkedDir,{recursive:true});
    // On a Windows volume with 8.3 short names, the report named by its short alias is the same file as the long entry the directory lists.
    {
      const aliasDir=fs.mkdtempSync(path.join(scratch,'cleanup-alias-')),aliasHad=snapshotReviewerDirectory(aliasDir),longName=path.join(aliasDir,'Report long filename.md');
      fs.writeFileSync(longName,'the report');
      let short;
      if(process.platform==='win32')try{short=execFileSync('cmd',['/d','/s','/c',`for %I in ("${longName}") do @echo %~sI`],{encoding:'utf8',windowsHide:true}).trim();}catch{}
      if(short&&short.toLowerCase()!==longName.toLowerCase()&&fs.existsSync(short)){
        removeProbeCheckouts(aliasDir,{preserve:aliasHad,keep:[short]});
        assert.equal(fs.readFileSync(longName,'utf8'),'the report','a report named by its 8.3 alias is kept');
      } else console.log('SKIP: a report named by its 8.3 short alias (this volume has no short names, or this is not Windows)');
      fs.rmSync(aliasDir,{recursive:true});
    }
    assert.throws(()=>removeProbeCheckouts(path.join(dir,'missing')),/ENOENT/);
    const linked=path.join(scratch,'cleanup-link');fs.symlinkSync(outside,linked,'junction');
    assert.throws(()=>removeProbeCheckouts(linked),/not a directory/,'a linked reviewer directory is refused');
    assert.equal(fs.readFileSync(path.join(outside,'keep.txt'),'utf8'),'survives');
    // Later scans of the scratch folder read every entry as a file. A POSIX link unlinks; a Windows junction needs rmdir.
    try{fs.unlinkSync(linked);}catch{fs.rmdirSync(linked);}
    fs.rmSync(dir,{recursive:true});fs.rmSync(outside,{recursive:true});
    console.log('PASS: probe cleanup removes the directories and links the reviewer created, keeps its files and the pre-existing entries, unlinks links without following them and refuses a linked directory');
  }

  // A file under a non-ASCII directory name is removed (npm ships `snow ☃`
  // fixtures), and an entry that cannot be removed leaves the rest of the walk
  // running and names its path in the error.
  {
    const directory=fs.mkdtempSync(path.join(scratch,'cleanup-unicode-'));
    fs.mkdirSync(path.join(directory,'probe-repo','snow ☃'),{recursive:true});fs.mkdirSync(path.join(directory,'probe-repo','.git'));fs.writeFileSync(path.join(directory,'probe-repo','snow ☃','index.html'),'x');
    assert.equal(removeProbeCheckouts(directory).files,1);
    assert.deepEqual(fs.readdirSync(directory),[],'the non-ASCII directory and its file are gone');
    fs.mkdirSync(path.join(directory,'a-stuck','.git'),{recursive:true});fs.writeFileSync(path.join(directory,'a-stuck','f'),'x');fs.mkdirSync(path.join(directory,'b-later','.git'),{recursive:true});fs.writeFileSync(path.join(directory,'b-later','g'),'x');
    // Entries are moved aside before deletion, so the stuck file is named inside the aside directory.
    const unlink=fs.unlinkSync;let stuck;
    fs.unlinkSync=function(target,...args){if(path.basename(target)==='f'&&path.basename(path.dirname(path.dirname(target))).startsWith('.probe-cleanup-')){stuck=target;throw Object.assign(new Error('EBUSY: stuck'),{code:'EBUSY'});}return unlink(target,...args);};
    try{assert.throws(()=>removeProbeCheckouts(directory),error=>!!stuck&&error.message.includes(stuck));}finally{fs.unlinkSync=unlink;}
    const left=fs.readdirSync(directory);
    assert.equal(left.length,1,'the walk continues past a failed entry');assert.match(left[0],/^\.probe-cleanup-/);
    assert.deepEqual(fs.readdirSync(path.join(directory,left[0])).map(name=>fs.readdirSync(path.join(directory,left[0],name))),[['f']],'only the stuck file and its directory remain');
    fs.rmSync(directory,{recursive:true});
    // An entry discovery cannot read is reported and left in place, and a
    // healthy clone beside it is still removed.
    {
      const denied=fs.mkdtempSync(path.join(scratch,'cleanup-denied-'));
      fs.mkdirSync(path.join(denied,'a-denied'));fs.writeFileSync(path.join(denied,'a-denied','note.md'),'kept');
      fs.mkdirSync(path.join(denied,'b-clone','.git'),{recursive:true});fs.mkdirSync(path.join(denied,'b-clone','node_modules'));fs.writeFileSync(path.join(denied,'b-clone','node_modules','x.js'),'x');
      fs.writeFileSync(path.join(denied,'report.md'),'report');
      const readdir=fs.readdirSync;
      fs.readdirSync=function(target,...args){if(target===path.join(denied,'a-denied'))throw Object.assign(new Error('EACCES: denied'),{code:'EACCES'});return readdir(target,...args);};
      try{assert.throws(()=>removeProbeCheckouts(denied,{keep:[path.join(denied,'report.md')]}),error=>error.message.includes(path.join(denied,'a-denied'))&&/EACCES/.test(error.message));}finally{fs.readdirSync=readdir;}
      assert.deepEqual(fs.readdirSync(denied).sort(),['a-denied','report.md'],'the healthy clone goes and the unreadable entry stays');
      fs.rmSync(denied,{recursive:true});
    }
    console.log('PASS: probe cleanup removes files under non-ASCII names and continues past an entry it cannot remove or read, naming it');
  }

  {
    const directory=fs.mkdtempSync(path.join(scratch,'cleanup-ownership-'));
    const probe=path.join(directory,'probe'),proof=path.join(probe,'tree-proof.json'),sentinelDir=path.join(directory,'sentinel-dir'),sentinel=path.join(sentinelDir,'sentinel');
    const refill=()=>{fs.mkdirSync(path.join(probe,'.git'),{recursive:true});fs.mkdirSync(path.join(sentinelDir,'.git'),{recursive:true});fs.writeFileSync(proof,'canonical proof bytes');fs.mkdirSync(sentinelDir,{recursive:true});fs.writeFileSync(sentinel,'untouched');};
    refill();
    const file=path.join(cleanupReservationRoot,'reservation.json');
    // An unreadable entry, one naming a path inside the directory, and one
    // naming a directory that holds it each preserve everything.
    for(const bytes of ['{',JSON.stringify({run:directory,supervision:{proofFile:proof}}),JSON.stringify({run:path.dirname(scratch)})]) {
      fs.writeFileSync(file,bytes);
      const result=removeProbeCheckouts(directory);
      assert.equal(result.skipped,true);assert.equal(result.files,0);assert.equal(result.links,0);
      assert.equal(fs.readFileSync(proof,'utf8'),'canonical proof bytes');
      assert.equal(fs.readFileSync(sentinel,'utf8'),'untouched');assert.equal(fs.readFileSync(file,'utf8'),bytes);
      fs.unlinkSync(file);
    }
    // A direct run whose journal names a probe clone as its package root preserves it too.
    const directRun=fs.mkdtempSync(path.join(scratch,'cleanup-direct-run-'));
    fs.writeFileSync(path.join(directRun,'run.json'),JSON.stringify({packageRoot:path.join(probe,'packages','sparkdown')}));
    fs.writeFileSync(file,JSON.stringify({run:directRun}));
    assert.equal(removeProbeCheckouts(directory).skipped,true,'a run testing inside the directory preserves it');
    assert.equal(fs.readFileSync(proof,'utf8'),'canonical proof bytes');
    fs.unlinkSync(file);
    // So does an entry that reaches the directory only through a junction
    // outside it, and one naming a path that exists but does not resolve.
    const alias=path.join(scratch,'cleanup-probe-alias');fs.symlinkSync(probe,alias,'junction');
    const brokenAlias=path.join(scratch,'cleanup-broken-alias');fs.symlinkSync(path.join(scratch,'no-such-target'),brokenAlias,'junction');
    try{
      for(const [named,pattern] of [[alias,/overlaps this reviewer directory/],[path.join(brokenAlias,'run'),/could not be resolved/]]){
        fs.writeFileSync(file,JSON.stringify({run:named}));
        const aliased=removeProbeCheckouts(directory);
        assert.equal(aliased.skipped,true,named);assert.match(aliased.reason,pattern);
        assert.equal(fs.readFileSync(proof,'utf8'),'canonical proof bytes');
        fs.unlinkSync(file);
      }
    } finally {for(const link of [alias,brokenAlias]){try{fs.unlinkSync(link);}catch{fs.rmdirSync(link);}}}
    // Another session's run holding the reservation does not delay the
    // cleanup (#1793): the probe goes and the reservation entry is untouched.
    const foreign=acquire(path.join(scratch,'another-session-run'),{root:cleanupReservationRoot,memory:()=>65536,census:()=>[]});
    const foreignBytes=fs.readFileSync(file,'utf8');
    let result;
    try {result=removeProbeCheckouts(directory);}finally{assert.equal(fs.readFileSync(file,'utf8'),foreignBytes);foreign.release();}
    assert.equal(result.skipped,undefined,result.reason);assert.equal(result.files,2);
    assert.equal(fs.existsSync(probe),false);assert.equal(fs.existsSync(sentinelDir),false);
    assert.deepEqual(fs.readdirSync(directory),[],'the aside directory is gone too');
    refill();
    // Entries move aside under the guard, so no run is admitted between the
    // reservation check and the move; the deletion runs after the guard is
    // released, so admission meanwhile succeeds. Only the store is private;
    // identity and guard mechanics are real.
    const rename=fs.renameSync,remove=fs.unlinkSync;let moving=false,deleting=false;
    fs.renameSync=function(from,...args){
      if(from===probe){moving=true;assert.throws(()=>acquire('competing admission during the move',{root:cleanupReservationRoot,memory:()=>65536,census:()=>[],guardWaitMs:0,admitWaitMs:0}),/transaction unavailable/);}
      return rename(from,...args);
    };
    fs.unlinkSync=function(target,...args){
      if(path.basename(target)==='tree-proof.json'&&!deleting){deleting=true;const lease=acquire('admission during the deletion',{root:cleanupReservationRoot,memory:()=>65536,census:()=>[],guardWaitMs:0,admitWaitMs:0});lease.release();}
      return remove(target,...args);
    };
    try {result=removeProbeCheckouts(directory);}finally{fs.renameSync=rename;fs.unlinkSync=remove;}
    assert.equal(moving,true);assert.equal(deleting,true);assert.equal(result.files,2);assert.equal(fs.existsSync(proof),false);
    assert.equal(fs.existsSync(path.join(cleanupReservationRoot,'guard.json')),false,'Exact cleanup guard was released');
    refill();
    fs.writeFileSync(path.join(cleanupReservationRoot,'guard.json'),'abandoned-or-unknown');
    assert.throws(()=>removeProbeCheckouts(directory),/transaction unavailable/);
    assert.equal(fs.readFileSync(sentinel,'utf8'),'untouched');
    assert.equal(fs.readFileSync(path.join(cleanupReservationRoot,'guard.json'),'utf8'),'abandoned-or-unknown','Cleanup never recovers a guard');
    fs.unlinkSync(path.join(cleanupReservationRoot,'guard.json'));
    const linkedStore=path.join(scratch,'cleanup-linked-store');fs.symlinkSync(cleanupReservationRoot,linkedStore,'junction');
    assert.throws(()=>guardedProbeCleanup(directory,{reservationRoot:linkedStore}),/Ambiguous/);
    assert.equal(fs.readFileSync(sentinel,'utf8'),'untouched');
    assert.throws(()=>guardedProbeCleanup(directory,{reservationRoot:path.join(linkedStore,'missing-store')}),/Ambiguous/,'A missing child cannot hide a redirected ancestor');
    const brokenStore=path.join(scratch,'cleanup-broken-store');fs.symlinkSync(path.join(scratch,'absent-target'),brokenStore,'junction');
    assert.throws(()=>guardedProbeCleanup(directory,{reservationRoot:path.join(brokenStore,'child')}),/Ambiguous/);
    assert.equal(fs.readFileSync(sentinel,'utf8'),'untouched');
    try{fs.unlinkSync(brokenStore);}catch{fs.rmdirSync(brokenStore);}
    try{fs.unlinkSync(linkedStore);}catch{fs.rmdirSync(linkedStore);}
    const freshStore=path.join(scratch,'fresh-cleanup-store','nested');
    const fresh=guardedProbeCleanup(directory,{reservationRoot:freshStore});
    assert.equal(fresh.files,2,'A genuinely absent store is initialized before guarded deletion');
    assert.equal(fs.existsSync(sentinel),false);assert.equal(fs.existsSync(path.join(freshStore,'guard.json')),false);
    console.log(JSON.stringify({cleanupGuard: 'actual removal/preservation', elapsedMs:result.elapsedMs}));
    console.log('PASS: a reservation naming the reviewer directory, or one that cannot be read, preserves it; another session\'s reservation does not delay cleanup; entries move aside under the guard and are deleted after it');
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
const reviewDir=path.dirname(argv[argv.indexOf('--output-last-message')+1]);
fs.mkdirSync(path.join(reviewDir,'probe-head','node_modules','pkg'),{recursive:true});fs.writeFileSync(path.join(reviewDir,'probe-head','node_modules','pkg','index.js'),'x');
fs.mkdirSync(path.join(reviewDir,'probe-base','.git'),{recursive:true});fs.writeFileSync(path.join(reviewDir,'probe-base','package.json'),'{}');fs.symlinkSync(process.env.FIXTURE_EXTERNAL,path.join(reviewDir,'probe-base','linked'),'junction');
fs.writeFileSync(argv[argv.indexOf('--output-last-message')+1],'### Adversarial review — undirected (gpt-test)\\n\\nRound 1, reviewed head '+head+'.\\n\\nNo findings through this lens.\\n\\n'+(process.env.FIXTURE_NO_TOKEN?'':token+'\\n'));
fs.writeFileSync(/Write (.*?) with the editor tool/.exec(text)[1],JSON.stringify({head,next:null,commentIds:[],summary:'Report returned for the coordinator to post'}));
for(const row of [{type:'thread.started',thread_id:'fixture-thread'},{type:'turn.started'},{type:'item.completed',item:{id:'answer',type:'agent_message',text:'Report returned.'}},{type:'turn.completed',usage:{input_tokens:1,cached_input_tokens:0,output_tokens:2}}])console.log(JSON.stringify(row));
console.error('diagnostic after terminal result');
`);
    // A directory outside the reviewer's that a probe links to; cleanup must never enter it.
    // A later step's prompt kept in the reviewer directory is there before the reviewer runs and must survive.
    fs.writeFileSync(path.join(privateDir,'adjudication.txt'),'later step prompt');
    const external=path.join(scratch,'external');fs.mkdirSync(external);fs.writeFileSync(path.join(external,'keep.txt'),'survives');
    const journal=path.join(handoff,'handoff.jsonl'),planFile=path.join(job,'plan.json');
    const plan={worktree:repo,journal,pr:1281,ticket:12,writer:'claude-opus-5',writerEffort:'high',reviewer:'gpt-test',completedReviewRound:0,maxSteps:1,first:'check',reportPosting:'coordinator',steps:{check:{role:'review',round:1,model:'gpt-test',nativeResult:'codex-jsonl',executable:process.execPath,args:fullArgs,effort:'high',permissions,prompt,next:[null]}}};
    // A partial grammar is refused before the lock, journal or a slot exists.
    const partialFile=path.join(job,'partial.json');
    fs.writeFileSync(partialFile,JSON.stringify({...plan,journal:path.join(handoff,'partial.jsonl'),steps:{check:{...plan.steps.check,args:fullArgs.filter(arg=>arg!=='--strict-config')}}}));
    await assert.rejects(runHandoff(partialFile,{jobRoot:scratch,slotRoot:slots,probeCleanup:removeProbeCheckouts}),/--strict-config/);
    assert.equal(fs.existsSync(slots),false,'a refused plan reserves no slot');assert.equal(fs.existsSync(path.join(handoff,'partial.jsonl')),false);
    fs.writeFileSync(planFile,JSON.stringify(plan));
    let ghCalls=0,versionProbeSawSecret;
    childProcess.execFileSync=(exe,args,options)=>{
      if(exe==='gh'){ghCalls++;throw new Error('fixture: no gh login in the container');}
      if(exe===process.execPath&&args[0]==='--version'){versionProbeSawSecret=Object.hasOwn(options?.env??process.env,secretName);return `codex-cli ${minimumFullAccessCodexVersion}`;}
      return originalExec(exe,args,options);
    };
    childProcess.spawn=(exe,args,options)=>{
      if(exe!==process.execPath||args[0]!=='exec')return originalSpawn(exe,args,options);
      assert.equal(JSON.stringify(args).includes(credential),false,'the secret is not in argv');
      assert.equal(Object.hasOwn(options.env,secretName),false,'neither the route probe nor the reviewer inherits the secret');
      assert.equal(Object.hasOwn(process.env,secretName),false,'the launcher withholds the secret from its own environment while it runs');
      return originalSpawn(exe,[stand],{...options,env:{...options.env,FIXTURE_ARGV:JSON.stringify(args),FIXTURE_SLOTS:slots,FIXTURE_EXTERNAL:external}});
    };
    syncBuiltinESMExports();
    const beforeRun=fs.readdirSync(privateDir).sort();
    let outcome;
    try {outcome=await runHandoff(planFile,{jobRoot:scratch,slotRoot:slots,probeCleanup:removeProbeCheckouts});}
    finally {restore();}
    const rows=fs.readFileSync(journal,'utf8').trim().split('\n').map(line=>JSON.parse(line)),observed=JSON.parse(fs.readFileSync(capture,'utf8'));
    const at=event=>rows.findIndex(row=>row.event===event);
    assert.equal(ghCalls,0,'a coordinator-posted report needs no gh login');
    assert.equal(versionProbeSawSecret,false,'the version probe the launcher runs does not inherit the secret');
    assert.equal(process.env[secretName],ambient[secretName],'the launcher restores its environment after the run');
    createdHomes.add(observed.home);
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
    // The validated review's probe clones, installs and links are removed (#1451); the report stays.
    assert.ok(beforeRun.includes('adjudication.txt'));
    assert.deepEqual(fs.readdirSync(privateDir).sort(),[...beforeRun,'report.md'].sort(),'only the report and what was there before the reviewer ran remain');
    assert.equal(fs.readFileSync(path.join(external,'keep.txt'),'utf8'),'survives','a link inside a probe is unlinked, never followed');
    const removedRow=rows.find(row=>row.event==='probe-checkouts-removed');
    assert.ok(removedRow&&at('exited')<rows.indexOf(removedRow)&&rows.indexOf(removedRow)<at('completed'),'cleanup is journalled after exit and before completion');
    assert.deepEqual([removedRow.files,removedRow.links],[2,1]);
    assert.equal(at('probe-cleanup-failed'),-1);
    // On Windows, a home on another drive than the scratch folder has no relative
    // path; path.relative then returns the absolute target.
    const homeFromScratch=path.relative(scratch,observed.home);
    assert.equal(homeFromScratch.startsWith('..')||path.isAbsolute(homeFromScratch),true,'the private home lies outside the job and review directories');
    assert.equal(fs.existsSync(observed.home),false,'the private home, authentication copy included, is removed after confirmed exit');
    console.log('PASS: the launcher runs a Codex stand-in with the secret only in its private home and no GitHub access, holds its slot until confirmed exit and awaits the coordinator\'s post');

    // The coordinator posts the report verbatim on the internal ticket and
    // records the comment from its read-back, the comment as GitHub's REST API
    // returns it.
    const text=fs.readFileSync(report,'utf8'),readBack=path.join(job,'read-back.json');
    const ticketUrl=`https://api.github.com/repos/${ON.internal}/issues/12`;
    const writeBack=(body,id,issue_url=ticketUrl)=>fs.writeFileSync(readBack,JSON.stringify({id:Number(id),issue_url,body}));
    const line='Posted on behalf of the gpt-test reviewer, which has no GitHub access in this container.';
    const refuses=(body,id,pattern,issue_url)=>{writeBack(body,id,issue_url);assert.throws(()=>recordCoordinatorReport(journal,id,readBack),pattern);};
    refuses(`${line}\n\n${text}`,5704126199,new RegExp(`Comment 5704126199 is on https://api.github.com/repos/${ON.code}/issues/1281, not review thread ${ON.internal}#12`),`https://api.github.com/repos/${ON.code}/issues/1281`);
    refuses(text,101,/verbatim/);
    refuses(`${line}\n\n${text.replace('No findings','Some findings')}`,101,/verbatim/);
    refuses(`Posted by the coordinator.\n\n${text}`,101,/verbatim/);
    refuses(`${line}\n\n${text}`,'abc',/numeric ID/);
    fs.writeFileSync(report,text+'edited\n');refuses(`${line}\n\n${text}`,101,/changed since/);fs.writeFileSync(report,text);
    writeBack(`${line}\r\n\r\n${text.replaceAll('\n','\r\n')}`,5704126199);
    assert.deepEqual(fs.readFileSync(journal,'utf8').trim().split('\n').map(line=>JSON.parse(line)).find(row=>row.event==='coordinator').thread,{repo:ON.internal,number:12,issueUrl:`https://api.github.com/repos/${ON.internal}/issues/12`},'with the switch on the report goes on the internal ticket');
    execFileSync(process.execPath,[path.join(here,'agent-handoff.mjs'),'record-report',journal,'5704126199',readBack],{encoding:'utf8',windowsHide:true});
    const recorded=fs.readFileSync(journal,'utf8').trim().split('\n').map(line=>JSON.parse(line));
    assert.deepEqual(recorded.slice(-2).map(row=>row.event),['report-posted','finished']);
    assert.equal(recorded.at(-2).commentId,5704126199);assert.equal(recorded.at(-2).postedBy,'coordinator');assert.equal(recorded.at(-2).head,head);
    assert.equal(recorded.some(row=>row.event==='blocked'),false);
    assert.throws(()=>recordCoordinatorReport(journal,5704126199,readBack),/does not end awaiting/,'a recorded report cannot be recorded twice');
    console.log('PASS: the coordinator\'s verbatim post on the internal ticket is recorded with its comment ID, and a post on the public pull request or an edited, unprefixed or changed report is refused');

    // A host that appends an attribution footer to every comment still posts
    // the report verbatim, and a record interrupted after its first row is
    // completed by the same command without a second post.
    const footer='\n\n---\n_Generated by [Claude Code](https://claude.ai/code)_';
    const awaiting=recorded.slice(0,-2);
    const rewrite=rows=>fs.writeFileSync(journal,rows.map(row=>JSON.stringify(row)).join('\n')+'\n');
    rewrite(awaiting);
    refuses(`${line}\n\n${text}\n\n---\n_Generated by someone_\n\nmore`,101,/verbatim/);
    refuses(`${line}\n\n${text}\n\n---\nunrelated trailing text`,101,/verbatim/);
    writeBack(`${line}\n\n${text}${footer}\n`,5704126200);
    recordCoordinatorReport(journal,5704126200,readBack);
    let rows2=fs.readFileSync(journal,'utf8').trim().split('\n').map(line=>JSON.parse(line));
    assert.deepEqual(rows2.slice(-2).map(row=>row.event),['report-posted','finished']);assert.equal(rows2.at(-2).commentId,5704126200);
    const postedRow=rows2.at(-2);
    rewrite([...awaiting,postedRow]);
    assert.throws(()=>recordCoordinatorReport(journal,5704126201,readBack),/already records comment 5704126200/,'a different comment cannot complete a partial record');
    writeBack(`${line}\n\n${text}`,5704126200);
    assert.throws(()=>recordCoordinatorReport(journal,5704126200,readBack),/already records comment 5704126200/,'a different read-back cannot complete a partial record');
    writeBack(`${line}\n\n${text}${footer}\n`,5704126200);
    recordCoordinatorReport(journal,5704126200,readBack);
    rows2=fs.readFileSync(journal,'utf8').trim().split('\n').map(line=>JSON.parse(line));
    assert.deepEqual(rows2.slice(-3).map(row=>row.event),['report-awaiting-post','report-posted','finished'],'the retry appends only the missing finished row');
    assert.equal(rows2.filter(row=>row.event==='report-posted').length,1);
    console.log('PASS: the read-back may end with the host\'s attribution footer, and a record interrupted before finished is completed by the same command');

    // Neither credential reaches the journal, logs, argv or any job file.
    const walk=directory=>fs.readdirSync(directory,{withFileTypes:true}).flatMap(entry=>entry.isDirectory()?walk(path.join(directory,entry.name)):[path.join(directory,entry.name)]);
    const files=[...walk(scratch)];
    assert.ok(files.includes(journal)&&files.some(file=>file.endsWith('process.log'))&&files.some(file=>file.endsWith('stderr.log')));
    for(const file of files){const content=fs.readFileSync(file,'utf8');for(const secret of [credential,ghCredential])assert.equal(content.includes(secret),false,`${file} holds a credential`);}
    console.log(`PASS: neither the Codex nor the GitHub credential appears in any of ${files.length} files under the job and review directories, and the private home is gone`);

    // A usable stand-in report does not authorize deletion of unresolved native
    // ownership evidence. Only the store is injected, through the cleanup seam.
    {
      const directory=path.join(job,'reviewer-preserved'),preservedReport=path.join(directory,'report.md');fs.mkdirSync(directory);
      const preservedJournal=path.join(handoff,'preserved.jsonl'),preservedPlan=path.join(job,'preserved-plan.json');
      const swap=value=>value===privateDir?directory:value===report?preservedReport:value;
      fs.writeFileSync(preservedPlan,JSON.stringify({...plan,journal:preservedJournal,steps:{check:{...plan.steps.check,args:fullArgs.map(swap),permissions:{...permissions,cwd:directory}}}}));
      const reservation=path.join(cleanupReservationRoot,'reservation.json'),bytes='{unresolved ownership';fs.writeFileSync(reservation,bytes);
      childProcess.execFileSync=(exe,args,options)=>{if(exe==='gh')throw new Error('fixture: no gh login');if(exe===process.execPath&&args[0]==='--version')return `codex-cli ${minimumFullAccessCodexVersion}`;return originalExec(exe,args,options);};
      childProcess.spawn=(exe,args,options)=>{
        if(exe!==process.execPath||args[0]!=='exec')return originalSpawn(exe,args,options);
        return originalSpawn(exe,[stand],{...options,env:{...options.env,FIXTURE_ARGV:JSON.stringify(args),FIXTURE_SLOTS:slots,FIXTURE_EXTERNAL:external}});
      };
      syncBuiltinESMExports();
      let outcome;
      try {outcome=await runHandoff(preservedPlan,{jobRoot:scratch,slotRoot:slots,probeCleanup:removeProbeCheckouts});}
      finally{restore();}
      const rows=fs.readFileSync(preservedJournal,'utf8').trim().split('\n').map(line=>JSON.parse(line));
      const skipped=rows.find(row=>row.event==='probe-cleanup-skipped');
      assert.ok(skipped);assert.equal(skipped.files,0);assert.equal(skipped.links,0);
      assert.ok(rows.findIndex(row=>row.event==='exited')<rows.indexOf(skipped));
      assert.ok(rows.indexOf(skipped)<rows.findIndex(row=>row.event==='completed'));
      assert.equal(rows.at(-1).event,'report-awaiting-post');assert.equal(outcome.pendingReport.report,preservedReport);
      assert.equal(rows.some(row=>row.event==='probe-checkouts-removed'||row.event==='blocked'),false);
      assert.equal(fs.readFileSync(path.join(directory,'probe-head','node_modules','pkg','index.js'),'utf8'),'x');
      assert.equal(fs.readFileSync(path.join(external,'keep.txt'),'utf8'),'survives');assert.equal(fs.readFileSync(reservation,'utf8'),bytes);
      fs.unlinkSync(reservation);
      console.log('PASS: a validated launcher report survives skipped cleanup while unresolved ownership preserves original scratch');
    }

    // Each case below runs the real launcher with the stand-in in its own
    // reviewer directory; `env` adds stand-in variables and `options` the
    // launcher seams.
    const launchCase=async(name,{env={},options={}}={})=>{
      const directory=path.join(job,`reviewer-${name}`);fs.mkdirSync(directory);
      const caseReport=path.join(directory,'report.md'),caseJournal=path.join(handoff,`${name}.jsonl`),casePlan=path.join(job,`plan-${name}.json`);
      const swap=value=>value===privateDir?directory:value===report?caseReport:value;
      fs.writeFileSync(casePlan,JSON.stringify({...plan,journal:caseJournal,steps:{check:{...plan.steps.check,args:fullArgs.map(swap),permissions:{...permissions,cwd:directory}}}}));
      const planBytes=fs.readFileSync(casePlan,'utf8');
      childProcess.execFileSync=(exe,args,options)=>{if(exe==='gh')throw new Error('fixture: no gh login');if(exe===process.execPath&&args[0]==='--version')return `codex-cli ${minimumFullAccessCodexVersion}`;return originalExec(exe,args,options);};
      childProcess.spawn=(exe,args,options)=>{
        if(exe!==process.execPath||args[0]!=='exec')return originalSpawn(exe,args,options);
        return originalSpawn(exe,[stand],{...options,env:{...options.env,FIXTURE_ARGV:JSON.stringify(args),FIXTURE_SLOTS:slots,FIXTURE_EXTERNAL:external,...env}});
      };
      syncBuiltinESMExports();
      let failure=null;
      try {await runHandoff(casePlan,{jobRoot:scratch,slotRoot:slots,probeCleanup:removeProbeCheckouts,...options});}
      catch(error){failure=error;}
      finally {restore();}
      const readRows=()=>fs.readFileSync(caseJournal,'utf8').trim().split('\n').map(line=>JSON.parse(line));
      assert.equal(fs.readFileSync(casePlan,'utf8'),planBytes,'the launcher plan is kept unchanged');
      return {directory,caseReport,caseJournal,casePlan,planBytes,failure,rows:readRows(),readRows};
    };

    // A review whose report fails validation still frees its probe checkouts
    // once the reviewer has exited (#1793), keeping its report for diagnosis
    // and journalling the cleanup before the blocked row.
    {
      const {directory,failure,rows}=await launchCase('unvalidated',{env:{FIXTURE_NO_TOKEN:'1'}});
      assert.ok(failure,'the unvalidated report blocks the chain');
      assert.equal(rows.at(-1).event,'blocked');
      const removed=rows.findIndex(row=>row.event==='probe-checkouts-removed');
      assert.ok(removed>rows.findIndex(row=>row.event==='exited')&&removed<rows.length-1,'cleanup is journalled after the exit and before the blocked row');
      assert.deepEqual([rows[removed].files,rows[removed].links],[2,1]);
      assert.deepEqual(fs.readdirSync(directory).sort(),['report.md'],'only the report remains of what the reviewer created');
      assert.equal(fs.readFileSync(path.join(external,'keep.txt'),'utf8'),'survives');
      console.log('PASS: a review whose report fails validation frees its probe checkouts, keeps its report and journals the cleanup before blocking');
    }

    // Another session holding the machine test reservation does not delay the
    // cleanup of an exited reviewer (#1793).
    {
      const foreign=acquire(path.join(scratch,'another-session-run'),{root:cleanupReservationRoot,memory:()=>65536,census:()=>[]});
      let outcome;
      try {outcome=await launchCase('foreign-reservation');}
      finally {foreign.release();}
      const {directory,failure,rows}=outcome;
      assert.equal(failure,null);
      assert.equal(rows.some(row=>row.event==='probe-cleanup-skipped'),false,JSON.stringify(rows.find(row=>row.event==='probe-cleanup-skipped')));
      assert.ok(rows.some(row=>row.event==='probe-checkouts-removed'));
      assert.deepEqual(fs.readdirSync(directory).sort(),['report.md']);
      assert.equal(rows.at(-1).event,'report-awaiting-post');
      console.log('PASS: another session\'s test reservation does not keep an exited reviewer\'s probe checkouts');
    }

    // When the launcher's own cleanup could not run, the adjudicating writer's
    // journal command removes the same entries, keeping the report, the
    // journal and the plan; it refuses a journal whose reviewer has not exited.
    {
      const {directory,caseReport,caseJournal,casePlan,planBytes,rows}=await launchCase('adjudicated',{options:{probeCleanup:()=>{throw new Error('fixture: cleanup interrupted');}}});
      assert.ok(rows.some(row=>row.event==='probe-cleanup-failed'));
      assert.deepEqual(fs.readdirSync(directory).sort(),['probe-base','probe-head','report.md']);
      const launching=rows.find(row=>row.event==='launching');
      assert.equal(launching.reviewerDirectory,directory);assert.deepEqual(launching.reviewerHad,[]);
      const journalBytes=fs.readFileSync(caseJournal,'utf8'),reportBytes=fs.readFileSync(caseReport,'utf8');
      const {cleanupFromJournal}=probeCleanupModule;
      assert.equal(typeof cleanupFromJournal,'function','the adjudication command exists');
      const results=cleanupFromJournal(caseJournal,{reservationRoot:cleanupReservationRoot});
      assert.deepEqual(results.map(result=>[result.directory,result.files,result.links,result.skipped]),[[directory,2,1,undefined]]);
      assert.deepEqual(fs.readdirSync(directory).sort(),['report.md']);
      assert.equal(fs.readFileSync(caseReport,'utf8'),reportBytes,'the report is kept');
      assert.equal(fs.readFileSync(caseJournal,'utf8'),journalBytes,'the journal rows are kept unchanged');
      assert.equal(fs.readFileSync(casePlan,'utf8'),planBytes,'the launcher plan is kept unchanged');
      assert.equal(fs.readFileSync(path.join(external,'keep.txt'),'utf8'),'survives');
      const running=path.join(handoff,'still-running.jsonl');
      fs.writeFileSync(running,journalBytes.split('\n').filter(Boolean).map(line=>JSON.parse(line)).filter(row=>row.event!=='exited').map(row=>JSON.stringify(row)).join('\n')+'\n');
      assert.throws(()=>cleanupFromJournal(running,{reservationRoot:cleanupReservationRoot}),/has no exited row/);
      // A later launch into the same directory that has not exited refuses the
      // whole journal before the earlier launch's cleanup touches anything.
      const shared=path.join(job,'reviewer-shared');fs.mkdirSync(shared);
      const sharedJournal=path.join(handoff,'shared.jsonl');
      const launchRow=(index,had)=>({event:'launching',index,role:'review',reviewerDirectory:shared,reviewerHad:had,args:['--output-last-message',path.join(shared,`report-${index}.md`)]});
      fs.mkdirSync(path.join(shared,'earlier-clone','.git'),{recursive:true});fs.writeFileSync(path.join(shared,'report-0.md'),'r0');
      fs.mkdirSync(path.join(shared,'active-clone','.git'),{recursive:true});fs.writeFileSync(path.join(shared,'active-clone','work.txt'),'running');
      const writeShared=rows=>fs.writeFileSync(sharedJournal,rows.map(row=>JSON.stringify(row)).join('\n')+'\n');
      writeShared([launchRow(0,[]),{event:'exited',index:0},launchRow(1,['earlier-clone','report-0.md'])]);
      assert.throws(()=>cleanupFromJournal(sharedJournal,{reservationRoot:cleanupReservationRoot}),/launch 1 has no exited row/);
      assert.deepEqual(fs.readdirSync(shared).sort(),['active-clone','earlier-clone','report-0.md'],'nothing was removed before the refusal');
      // Once both have exited, the directory is cleaned once against the earliest snapshot.
      writeShared([launchRow(0,[]),{event:'exited',index:0},launchRow(1,['earlier-clone','report-0.md']),{event:'exited',index:1}]);
      const sharedResults=cleanupFromJournal(sharedJournal,{reservationRoot:cleanupReservationRoot});
      assert.deepEqual(sharedResults.map(result=>result.indexes),[[0,1]]);
      assert.deepEqual(fs.readdirSync(shared),['report-0.md']);
      // A reviewer the launcher stops after an error still leaves exit
      // evidence, so the journal command can remove its probes when the
      // launcher's own cleanup could not.
      {
        const realWrite=fs.writeSync;let probeDir;
        fs.writeSync=(fd,data,...rest)=>{
          if(typeof data==='string'&&data.includes('"event":"running"')){
            probeDir=path.join(job,'reviewer-stopped','probe-clone');fs.mkdirSync(path.join(probeDir,'.git'),{recursive:true});fs.writeFileSync(path.join(probeDir,'x.js'),'x');
            throw new Error('fixture: running row failed');
          }
          return realWrite(fd,data,...rest);
        };
        let stopped;
        try {stopped=await launchCase('stopped',{options:{probeCleanup:()=>{throw new Error('fixture: cleanup interrupted');}}});}
        finally {fs.writeSync=realWrite;}
        assert.match(String(stopped.failure?.message),/running row failed/);
        const exitedAt=stopped.rows.findIndex(row=>row.event==='exited'&&row.stopped===true);
        assert.ok(exitedAt>=0&&exitedAt<stopped.rows.findIndex(row=>row.event==='blocked'),'the stopped reviewer\'s exit is journalled before the blocked row');
        assert.ok(fs.existsSync(probeDir));
        assert.deepEqual(cleanupFromJournal(stopped.caseJournal,{reservationRoot:cleanupReservationRoot}).map(result=>result.files),[1]);
        assert.equal(fs.existsSync(probeDir),false);
      }
      const cli=childProcess.spawnSync(process.execPath,[path.join(here,'reviewer-probe-cleanup.mjs'),'relative.jsonl'],{encoding:'utf8',windowsHide:true});
      assert.equal(cli.status,1);assert.match(cli.stderr,/absolute path/);
      console.log('PASS: the adjudication command removes an exited reviewer\'s probe checkouts from its journal, keeping the report, journal and plan, and refuses one still running');
    }

    // A failure writing the reservation's launching row refuses before the
    // spawn and removes the authentication copy with the slot.
    {
      const homes=secretHomes();
      const journal2=path.join(handoff,'reservation-failure.jsonl'),planFile2=path.join(job,'plan-reservation-failure.json');
      const privateDir2=path.join(job,'reviewer-cloud-2');fs.mkdirSync(privateDir2);
      const swap=value=>value===privateDir?privateDir2:value===report?path.join(privateDir2,'report.md'):value;
      fs.writeFileSync(planFile2,JSON.stringify({...plan,journal:journal2,steps:{check:{...plan.steps.check,args:fullArgs.map(swap),permissions:{...permissions,cwd:privateDir2}}}}));
      const realWrite=fs.writeSync;
      childProcess.execFileSync=(exe,args,options)=>{if(exe==='gh')throw new Error('fixture: no gh login');if(exe===process.execPath&&args[0]==='--version')return `codex-cli ${minimumFullAccessCodexVersion}`;return originalExec(exe,args,options);};
      let spawned=false;
      childProcess.spawn=(exe,args,options)=>{
        if(exe!==process.execPath||args[0]!=='exec')return originalSpawn(exe,args,options);
        if(args.includes('--output-last-message'))spawned=true;
        return originalSpawn(exe,[stand],{...options,env:{...options.env,FIXTURE_ARGV:JSON.stringify(args),FIXTURE_SLOTS:slots}});
      };
      fs.writeSync=(fd,data,...rest)=>{if(typeof data==='string'&&data.includes('"phase":"launching"'))throw new Error('fixture: EIO on the reservation row');return realWrite(fd,data,...rest);};
      syncBuiltinESMExports();
      try {await assert.rejects(runHandoff(planFile2,{jobRoot:scratch,slotRoot:slots,probeCleanup:removeProbeCheckouts}),/EIO on the reservation row/);}
      finally {fs.writeSync=realWrite;restore();}
      assert.equal(spawned,false,'no reviewer was spawned');
      assert.deepEqual([...secretHomes()].filter(name=>!homes.has(name)),[],'the refused launch leaves no private home');
      assert.deepEqual(fs.readdirSync(slots),[],'the refused launch releases its slot');
      const rows3=fs.readFileSync(journal2,'utf8').trim().split('\n').map(line=>JSON.parse(line));
      assert.equal(rows3.at(-1).event,'blocked');assert.match(rows3.at(-1).reason,/EIO on the reservation row/);
      console.log('PASS: a reservation-row failure after the authentication copy was written removes the copy, releases the slot and journals the refusal');
    }
  } else console.log(`SKIP: the launcher's Codex route runs on Windows and Linux only, not ${process.platform}; the platform refusals ran`);
} finally {
  restore();
  for(const [key,value] of Object.entries(previous)){if(value===undefined)delete process.env[key];else process.env[key]=value;}
  removeScratch(scratch);
  // The private homes this check created outside the scratch folder.
  for(const home of createdHomes)if(fs.existsSync(home))removeScratch(home);
}
