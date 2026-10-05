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
import {runHandoff,recordCoordinatorReport,validatePlanShape,coordinatorReport,verifyNativeReviewResult} from './agent-handoff.mjs';
import {verifyReviewerExecutable,validateCodexReviewer} from './native-reviewer.mjs';
import {nativeReviewerEnvironment,removeSecretCodexHome,minimumCodexVersion,minimumFullAccessCodexVersion} from './reviewer-security.mjs';
import {validateReviewPlan} from './review-supervisor.mjs';
import {proxyAuthTemplate,checkProxyAuthTemplate} from './codex-proxy-auth.mjs';
import {testScratch} from './review-job-root.mjs';
import {removeScratch} from './remove-scratch.mjs';
import {removeProbeCheckouts,snapshotReviewerDirectory} from './reviewer-probe-cleanup.mjs';

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
    assert.throws(()=>validateReviewPlan(supervised,{jobRoot:scratch}),/awaited launcher/);
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
    createdHomes.add(path.join(os.tmpdir(),written[0]));
    assert.equal(fs.existsSync(path.join(os.tmpdir(),written[0])),false,'a refused launch removes the private home with its authentication copy');
    assert.deepEqual([...secretHomes()].filter(name=>!before.has(name)),[]);
    assert.throws(()=>removeSecretCodexHome(path.join(os.tmpdir(),'other-home')),/not a secret route Codex home/,'only a home this launcher created is removed');
    // The guard takes a canonical direct child of the temporary directory, so
    // a traversal through a real home, or a home elsewhere, is refused.
    const realHome=fs.mkdtempSync(path.join(os.tmpdir(),'impower-codex-home-')),sibling=fs.mkdtempSync(path.join(os.tmpdir(),'impower-sibling-'));
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
    fs.mkdirSync(path.join(dir,'clone','deep'),{recursive:true});fs.writeFileSync(path.join(dir,'clone','deep','a.js'),'a');
    fs.symlinkSync(outside,path.join(dir,'clone','link'),'junction');fs.symlinkSync(outside,path.join(dir,'top-link'),'junction');
    fs.writeFileSync(path.join(dir,'..report.md'),'report');fs.writeFileSync(path.join(dir,'notes.txt'),'n');
    const keepReport=process.platform==='win32'?path.join(dir,'..REPORT.md'):path.join(dir,'..report.md');
    const counts=removeProbeCheckouts(dir,{preserve:had,keep:[keepReport]});
    assert.deepEqual(fs.readdirSync(dir).sort(),['..report.md','adjudication.txt','other-round'],'the kept dot-prefixed report (named in another case on Windows) and the pre-existing entries remain');
    assert.equal(fs.existsSync(path.join(dir,'other-round','handoff.jsonl')),true);
    assert.deepEqual([counts.files,counts.links],[2,2]);
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
    assert.throws(()=>removeProbeCheckouts(path.join(dir,'missing')),/ENOENT/);
    const linked=path.join(scratch,'cleanup-link');fs.symlinkSync(outside,linked,'junction');
    assert.throws(()=>removeProbeCheckouts(linked),/not a directory/,'a linked reviewer directory is refused');
    assert.equal(fs.readFileSync(path.join(outside,'keep.txt'),'utf8'),'survives');
    // Later scans of the scratch folder read every entry as a file. A POSIX link unlinks; a Windows junction needs rmdir.
    try{fs.unlinkSync(linked);}catch{fs.rmdirSync(linked);}
    fs.rmSync(dir,{recursive:true});fs.rmSync(outside,{recursive:true});
    console.log('PASS: probe cleanup removes what the reviewer created except the kept report, leaves pre-existing entries, unlinks links without following them and refuses a linked directory');
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
fs.mkdirSync(path.join(reviewDir,'probe-base'));fs.writeFileSync(path.join(reviewDir,'probe-base','package.json'),'{}');fs.symlinkSync(process.env.FIXTURE_EXTERNAL,path.join(reviewDir,'probe-base','linked'),'junction');
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
    const plan={worktree:repo,journal,pr:1281,writer:'claude-opus-5',writerEffort:'high',reviewer:'gpt-test',completedReviewRound:0,maxSteps:1,first:'check',reportPosting:'coordinator',steps:{check:{role:'review',round:1,model:'gpt-test',nativeResult:'codex-jsonl',executable:process.execPath,args:fullArgs,effort:'high',permissions,prompt,next:[null]}}};
    // A partial grammar is refused before the lock, journal or a slot exists.
    const partialFile=path.join(job,'partial.json');
    fs.writeFileSync(partialFile,JSON.stringify({...plan,journal:path.join(handoff,'partial.jsonl'),steps:{check:{...plan.steps.check,args:fullArgs.filter(arg=>arg!=='--strict-config')}}}));
    await assert.rejects(runHandoff(partialFile,{jobRoot:scratch,slotRoot:slots}),/--strict-config/);
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
    try {outcome=await runHandoff(planFile,{jobRoot:scratch,slotRoot:slots});}
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

    // A host that appends an attribution footer to every comment still posts
    // the report verbatim, and a record interrupted after its first row is
    // completed by the same command without a second post.
    const footer='\n\n---\n_Generated by [Claude Code](https://claude.ai/code)_';
    const awaiting=recorded.slice(0,-2);
    const rewrite=rows=>fs.writeFileSync(journal,rows.map(row=>JSON.stringify(row)).join('\n')+'\n');
    rewrite(awaiting);
    refuses(`${line}\n\n${text}\n\n---\n_Generated by someone_\n\nmore`,101,/verbatim/);
    refuses(`${line}\n\n${text}\n\n---\nunrelated trailing text`,101,/verbatim/);
    fs.writeFileSync(readBack,`${line}\n\n${text}${footer}\n`);
    recordCoordinatorReport(journal,5704126200,readBack);
    let rows2=fs.readFileSync(journal,'utf8').trim().split('\n').map(line=>JSON.parse(line));
    assert.deepEqual(rows2.slice(-2).map(row=>row.event),['report-posted','finished']);assert.equal(rows2.at(-2).commentId,5704126200);
    const postedRow=rows2.at(-2);
    rewrite([...awaiting,postedRow]);
    assert.throws(()=>recordCoordinatorReport(journal,5704126201,readBack),/already records comment 5704126200/,'a different comment cannot complete a partial record');
    fs.writeFileSync(readBack,`${line}\n\n${text}`);
    assert.throws(()=>recordCoordinatorReport(journal,5704126200,readBack),/already records comment 5704126200/,'a different read-back cannot complete a partial record');
    fs.writeFileSync(readBack,`${line}\n\n${text}${footer}\n`);
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

    // A review that fails validation keeps its probe checkouts for diagnosis and journals no cleanup.
    {
      const journal3=path.join(handoff,'unvalidated.jsonl'),planFile3=path.join(job,'plan-unvalidated.json');
      const privateDir3=path.join(job,'reviewer-cloud-3');fs.mkdirSync(privateDir3);
      const swap=value=>value===privateDir?privateDir3:value===report?path.join(privateDir3,'report.md'):value;
      fs.writeFileSync(planFile3,JSON.stringify({...plan,journal:journal3,steps:{check:{...plan.steps.check,args:fullArgs.map(swap),permissions:{...permissions,cwd:privateDir3}}}}));
      childProcess.execFileSync=(exe,args,options)=>{if(exe==='gh')throw new Error('fixture: no gh login');if(exe===process.execPath&&args[0]==='--version')return `codex-cli ${minimumFullAccessCodexVersion}`;return originalExec(exe,args,options);};
      childProcess.spawn=(exe,args,options)=>{
        if(exe!==process.execPath||args[0]!=='exec')return originalSpawn(exe,args,options);
        return originalSpawn(exe,[stand],{...options,env:{...options.env,FIXTURE_ARGV:JSON.stringify(args),FIXTURE_SLOTS:slots,FIXTURE_EXTERNAL:external,FIXTURE_NO_TOKEN:'1'}});
      };
      syncBuiltinESMExports();
      try {await assert.rejects(runHandoff(planFile3,{jobRoot:scratch,slotRoot:slots}));}
      finally {restore();}
      const rows4=fs.readFileSync(journal3,'utf8').trim().split('\n').map(line=>JSON.parse(line));
      assert.equal(rows4.at(-1).event,'blocked');
      assert.equal(rows4.some(row=>row.event==='probe-checkouts-removed'||row.event==='probe-cleanup-failed'),false,'no cleanup runs before the report validates');
      assert.deepEqual(fs.readdirSync(privateDir3).sort(),['probe-base','probe-head','report.md'],'a review that failed validation keeps its checkouts');
      console.log('PASS: a review whose report fails validation keeps its probe checkouts and journals no cleanup');
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
      try {await assert.rejects(runHandoff(planFile2,{jobRoot:scratch,slotRoot:slots}),/EIO on the reservation row/);}
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
