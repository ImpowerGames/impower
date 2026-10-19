// agent-tooling-timeout-ms: 780000
// Prior complete21-case Windows CI measured417.6s; four added local controls
// measured about102.7s. Allow9s for the longer genuine-event stimulus, leaving
// about250s margin. One additional pure fixture-error control brings the CI
// inventory to 26 cases; this is not a measured 26-case full run. One pure
// cadence/density control adds a case without another native run. A Linux-only
// prerequisite-refusal service control adds one case on that platform, within
// the existing margin; its actual duration is retained separately.
// Other checks and per-operation budgets stay unchanged.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawn,execFileSync} from 'node:child_process';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {test} from 'node:test';
import {createHash,randomUUID} from 'node:crypto';
import {processIdentity} from './reviewer-slots.mjs';
import {runPrivateInstaller,verifyDependencies} from './fixtures/test-suite-vitest-dependencies.mjs';
import {createReceiptDescriptor,awaitReceiptDisposition,readDurableDisposition,readReceiptDisposition} from './test-suite-receipt.mjs';
import {startExecutionService} from './reviewer-execution.mjs';
import {requestExecution} from './reviewer-execution-client.mjs';
import {validateAggregateInputs} from './test-suite-aggregate.mjs';
import {machineRoot,read as readReservation,acquire,acquireWaiting,reservationState,same} from './test-suite-process.mjs';

function assertCoalescedProgress(journal,nativeProgress) {
  const started=Date.parse(journal?.startedAt),ended=Date.parse(journal?.endedAt);
  const elapsedMs=ended-started,sequence=journal?.progress?.sequence,publications=journal?.progressPublications;
  // ownedChild samples every1000ms; confirmed exit flushes the final event.
  // The whole attempt conservatively includes launch and exit reconciliation.
  const allowance=Math.ceil(elapsedMs/1000)+1;
  console.log('Task progress batching '+JSON.stringify({sequence,publications,elapsedMs,allowance}));
  assert.ok(typeof journal?.startedAt==='string'&&typeof journal?.endedAt==='string'
    &&Number.isFinite(started)&&Number.isFinite(ended)&&elapsedMs>0,'Measured attempt timestamps are ordered and finite');
  assert.ok(Number.isSafeInteger(sequence)&&sequence>=50,'Real native task batches exercised frequent event delivery');
  assert.ok(Number.isSafeInteger(publications)&&publications>0,'Shared progress publications are a positive measured count');
  assert.ok(sequence>allowance,'Genuine event density must distinguish batching from publication on every event');
  assert.ok(publications<=allowance,'Shared progress persistence respects its sampling cadence and final flush');
  assert.ok(publications<sequence,'Shared progress persistence coalesces genuine events');
  assert.equal(journal.progress.event,'finished','The terminal genuine event is retained');
  const finished=Date.parse(journal.progress.at);
  assert.ok(typeof journal.progress.at==='string'&&Number.isFinite(finished)&&finished>=started&&finished<=ended,
    'The terminal genuine event timestamp belongs to the measured attempt');
  assert.deepEqual(journal.progress,nativeProgress,'Shared progress retains the exact final native event');
  return {sequence,publications,elapsedMs,allowance};
}

const scratch=()=>fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(),'vitest-integration-control-')));
const terminalSummary=result=>result.stdout.split(/\r?\n/).flatMap(line=>{
  try{const value=JSON.parse(line);return value.evidence&&typeof value.exit==='number'?[value]:[]}catch{return []}
}).at(-1);
// A confirmed process tree is not a released reservation. Only this fixture's
// independently authenticated operation may use ordinary guarded recovery.
async function settleFixtureReservation(records,directory,root=machineRoot) {
  const file=path.join(root,'reservation.json');
  let previous;
  try {previous=readReservation(file);}catch(error){if(error.code==='ENOENT')return;throw error;}
  assert.match(previous?.token??'',/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/,'Preserve reservation whose ownership token is unavailable');
  const tokens=records.flatMap(record=>record.attempts.map(attempt=>attempt.supervision.reservationToken));
  if(!tokens.includes(previous?.token)) {
    assert.ok(['running','interrupted'].includes(reservationState(previous)),'Preserve unknown foreign reservation');
    return; // Another admitted caller already consumed this fixture's record.
  }
  const matched=records.some(record=>same(record.coordinator,previous.owner)&&record.attempts.some(attempt=>{
    const expected=attempt.supervision,actual=previous.supervision;
    return actual&&attempt.id===previous.attempt&&attempt.directory===path.join(previous.run,previous.attempt)
      &&attempt.directory===actual.directory&&expected.reservationToken===previous.token
      &&expected.launchNonce===actual.launchNonce&&expected.proofFile===actual.proofFile
      &&same(expected.launcher,actual.launcher)&&same(expected.helper,actual.helper)
      &&(expected.root===null&&actual.root===null||same(expected.root,actual.root));
  }));
  assert.ok(matched,'Preserve reservation not bound to this authenticated fixture');
  assert.equal(reservationState(previous),'interrupted','Preserve unknown/live reservation and its original proof');
  const lease=await acquireWaiting(directory,{root,waitMs:30000,supervised:true});
  try {
    const recovered=readReservation(path.join(root,'recovered-'+previous.token+'.json'));
    delete recovered.recoveredAt;
    assert.deepEqual(recovered,previous,'Ordinary recovery retains exact prior ownership evidence');
  } finally {lease.release();}
  // release() confirmed removal of this lease under the guard. A legitimate
  // foreign admission may already have appeared; never require global absence.
}
async function finishFixtureCleanup(primary,reconcile,persist) {
  let failure;
  try {await reconcile();}catch(error){failure=error;}
  try {persist(failure);}catch(error){failure??=error;}
  if(failure) {
    if(!primary)throw failure;
    primary.cleanupError=failure.message;
    console.error('Fixture cleanup remains incomplete: '+failure.message);
  }
  return !failure;
}
// Copy only inspected fixture evidence after independent disposition. Never
// retain authorization requests, executables or dependency/source trees.
function retainNativeEvidence(directory,key,disposition) {
  if(!disposition.confirmed||!disposition.record)return;
  assert.match(key,/^[a-zA-Z0-9-]+$/);
  const destination=path.join(directory,'.git','native-evidence',key);
  if(fs.existsSync(path.join(destination,'manifest.json')))return;
  fs.mkdirSync(destination,{recursive:true});
  const manifest=[];
  const copy=(source,label)=>{
    if(!fs.existsSync(source))return;
    const stat=fs.lstatSync(source);assert.equal(stat.isFile(),true,'Evidence is an ordinary authored file');
    assert.equal(stat.isSymbolicLink(),false);assert.ok(stat.size<=8*1024*1024,'Bounded fixture evidence');
    const original=fs.realpathSync.native(source),bytes=fs.readFileSync(original),target=path.join(destination,label);
    fs.writeFileSync(target,bytes,{flag:'wx'});
    manifest.push({original,copy:label,bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')});
  };
  const record=disposition.record;
  if(record.runtime)for(const name of ['runtime.json','preparation-request.json','preparation-result.json','capability-result.json','capability-output.log'])
    copy(path.join(record.runtime.directory,name),'runtime-'+name);
  for(const attempt of record.attempts??[]) {
    for(const name of ['tree-proof.json','prepared.json','attempt.json','output.log','progress.json','vitest.json','result.json','selection.json','blob.json'])
      copy(path.join(attempt.directory,name),attempt.id+'-'+name);
  }
  const root=record.runtime&&path.dirname(record.runtime.directory);
  if(root)copy(path.join(root,'aggregate-request.json'),'aggregate-request.json');
  fs.writeFileSync(path.join(destination,'manifest.json'),JSON.stringify({kind:'confirmed fixture evidence copies',manifest},null,2),{flag:'wx'});
}
const waitForAck='const fs=require("node:fs");const until=Date.now()+10000;const t=setInterval(()=>{if(fs.existsSync(process.argv[1])){clearInterval(t);process.exit(0)}else if(Date.now()>until)process.exit(2)},10)';

const admissionControls=[];
admissionControls.push(test('measured progress cadence requires genuine density and the exact terminal event',()=>{
  const progress={version:1,mode:'run-direct',file:'/private/src/tasks.test.ts',sequence:104,event:'finished',at:'2026-10-10T20:15:02.159Z'};
  // Retained Windows Vitest3.2.6 CI: genuine104/publications26 over56.966s.
  const measured={startedAt:'2026-10-10T20:14:09.631Z',endedAt:'2026-10-10T20:15:06.597Z',progress,progressPublications:26};
  assert.deepEqual(assertCoalescedProgress(measured,progress),{sequence:104,publications:26,elapsedMs:56966,allowance:58});
  const nominal={...measured,endedAt:'2026-10-10T20:14:20.631Z',progressPublications:12,
    progress:{...progress,at:'2026-10-10T20:14:20.159Z'}};
  assert.equal(assertCoalescedProgress(nominal,nominal.progress).allowance,12);
  assert.throws(()=>assertCoalescedProgress({...measured,progressPublications:104},progress),/sampling cadence/);
  assert.throws(()=>assertCoalescedProgress({...nominal,progressPublications:13},progress),/sampling cadence/);
  assert.throws(()=>assertCoalescedProgress({...measured,endedAt:'2026-10-10T20:15:52.631Z'},progress),/event density/);
  for(const sequence of [49,1.5,NaN,Infinity,undefined]) {
    assert.throws(()=>assertCoalescedProgress({...measured,progress:{...progress,sequence}},progress),/frequent event/);
  }
  for(const value of [0,-1,1.5,NaN,Infinity,undefined]) {
    assert.throws(()=>assertCoalescedProgress({...measured,progressPublications:value},progress),/positive measured count/);
  }
  for(const times of [{startedAt:'invalid'},{endedAt:undefined},{endedAt:measured.startedAt},{endedAt:'2026-10-10T20:14:08.631Z'}]) {
    assert.throws(()=>assertCoalescedProgress({...measured,...times},progress),/timestamps/);
  }
  assert.throws(()=>assertCoalescedProgress({...measured,progress:{...progress,event:'task-update'}},progress),/terminal genuine event/);
  for(const at of ['invalid',undefined,'2026-10-10T20:14:08.631Z','2026-10-10T20:15:07.597Z']) {
    const final={...progress,at};
    assert.throws(()=>assertCoalescedProgress({...measured,progress:final},final),/timestamp belongs/);
  }
  for(const final of [undefined,{...progress,sequence:103},{...progress,at:'2026-10-10T20:15:01.159Z'},
    {...progress,file:'/private/src/other.test.ts'}]) {
    assert.throws(()=>assertCoalescedProgress(measured,final),/exact final native event/);
  }
}));
admissionControls.push(test('fixture cleanup preserves primary failures across reconciliation and evidence errors',async()=>{
  for(const boundary of ['reconcile','persist']) {
    const primary=new Error('Original fixture assertion'),secondary=new Error('Reached cleanup '+boundary);
    let persisted=false;
    const reconcile=async()=>{if(boundary==='reconcile')throw secondary;};
    const persist=failure=>{persisted=true;if(boundary==='persist')throw secondary;assert.equal(failure,secondary);};
    assert.equal(await finishFixtureCleanup(primary,reconcile,persist),false);
    assert.equal(persisted,true);assert.equal(primary.message,'Original fixture assertion');
    assert.equal(primary.cleanupError,secondary.message);
    await assert.rejects(finishFixtureCleanup(null,reconcile,persist),error=>error===secondary);
  }
}));
admissionControls.push(test('private dependency log admission failure launches no installer',async()=>{
  const directory=scratch();
  fs.mkdirSync(path.join(directory,'install.stderr.log'));
  let launches=0;
  const result=await runPrivateInstaller({directory,args:[],launch(){launches++;throw new Error('Must not launch');}});
  assert.equal(launches,0);
  assert.match(result.logSetupError,/EEXIST/);
  assert.equal(result.pid,null);assert.equal(result.close,null);
}));

admissionControls.push(test('post-spawn identity/publication failures retain owned installer close',{timeout:30000},async()=>{
  for(const failure of ['identity','owner','result']) {
    const directory=scratch(),ack=path.join(directory,'observed.json');
    if(failure!=='identity')fs.mkdirSync(path.join(directory,`install-${failure}.json`));
    let child,original,close;
    try {
      const result=await runPrivateInstaller({directory,args:['-e',waitForAck,ack],timeoutMs:5000,
        launch(command,args,options) {
          child=spawn(command,args,{...options,windowsHide:true});
          close=new Promise(resolve=>child.once('close',(exit,signal)=>resolve({exit,signal})));
          original=processIdentity(child.pid);
          assert.ok(original&&original.start);
          fs.writeFileSync(path.join(directory,'fixture-identity.json'),JSON.stringify(original));
          return child;
        },identify(pid) {
          if(failure==='identity')throw new Error('Owned identity inspection refused');
          const identity=processIdentity(pid);
          if(failure==='result')fs.writeFileSync(ack,'observed');
          return identity;
        }});
      assert.ok(result.close,'Actual original child close must survive later failures');
      assert.deepEqual(result.close,await close);
      assert.equal(result.pid,original.pid);
      assert.notDeepEqual(processIdentity(original.pid),original,'Original identity is absent, regardless of PID reuse');
      if(failure==='identity')assert.match(result.identityError,/inspection refused/);
      else assert.ok(result.publicationErrors.some(row=>row.name===`install-${failure}.json`));
      assert.deepEqual(JSON.parse(fs.readFileSync(path.join(directory,'install-close.json'),'utf8')).close,result.close);
      assert.equal(result.compilerOrInstallDescendantExitClaim,false);
    } finally {
      if(child&&child.exitCode===null&&child.signalCode===null)child.kill();
      if(close)await close;
    }
  }
}));

admissionControls.push(test('private installer timeout retains actual owned close without a descendant claim',{timeout:15000},async()=>{
  const directory=scratch();
  const result=await runPrivateInstaller({directory,args:['-e','setTimeout(()=>{},10000)'],timeoutMs:100});
  assert.equal(result.timedOut,true);
  assert.ok(result.identity&&result.close);
  assert.equal(result.compilerOrInstallDescendantExitClaim,false);
  assert.notDeepEqual(processIdentity(result.pid),result.identity);
}));

// Finish every owned fixture before dependency validation can throw. Required
// admission failure must not abandon a concurrently running fixture child.
await Promise.all(admissionControls);
const dependencies=process.env.IMPOWER_TEST_VITEST_DEPENDENCIES?path.resolve(process.env.IMPOWER_TEST_VITEST_DEPENDENCIES):undefined;
const runner=fileURLToPath(new URL('./test-suite.mjs',import.meta.url));
function realPackage(name,{include=['src/**/*.test.ts'],exclude=[],coverage=false},files) {
  const directory=fs.mkdtempSync(path.join(dependencies,`case-${name}-`));
  console.log('Private real-Vitest scratch package: '+directory);
  execFileSync('git',['init','--quiet',directory],{windowsHide:true});
  fs.writeFileSync(path.join(directory,'package.json'),JSON.stringify({name:'private-api-case',private:true,type:'module',version:'1.0.0'}));
  fs.writeFileSync(path.join(directory,'.gitignore'),'node_modules/\n');
  const options={include,exclude};
  if(coverage)options.coverage={enabled:true,provider:'v8',reporter:['json'],reportsDirectory:path.join(directory,'.git','coverage')};
  fs.writeFileSync(path.join(directory,'vitest.config.ts'),'export default '+JSON.stringify({test:options})+';');
  for(const [file,marker] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(directory,file)),{recursive:true});
    fs.writeFileSync(path.join(directory,file),
      'import {it,expect} from "vitest";import fs from "node:fs";it("'+marker+'",()=>{fs.appendFileSync('+JSON.stringify(path.join(directory,'.git','markers.jsonl'))+','+JSON.stringify(marker+'\n')+');expect(1).toBe(1)});');
  }
  execFileSync('git',['-C',directory,'add','package.json','vitest.config.ts','.gitignore',...Object.keys(files)],{windowsHide:true});
  return directory;
}
let incompleteOwnership=null;
let operationSequence=0;
function copyOwnedRunner(directory) {
  const hashes=[];
  fs.mkdirSync(path.join(directory,'scripts'));
  for(const name of ['test-suite.mjs','test-suite-process.mjs','test-suite-identity.mjs','suite-engine.mjs','test-suite-aggregate.mjs','test-suite-child.mjs',
    'test-suite-child-windows.cs','test-suite-child-windows.ps1','test-suite-child-linux.py',
    'test-suite-receipt.mjs','reviewer-slots.mjs','detached-launch.mjs']) {
    const bytes=fs.readFileSync(path.join(path.dirname(runner),name)),target=path.join(directory,'scripts',name);
    fs.writeFileSync(target,bytes,{flag:'wx'});
    hashes.push({name,sha256:createHash('sha256').update(bytes).digest('hex')});
    assert.deepEqual(fs.readFileSync(target),bytes,'Scratch runner bytes match the source under test');
  }
  return hashes;
}
async function publicRunner(directory,argv,{observe=false,priorAttempts=[]}={}) {
  assert.equal(incompleteOwnership,null,'A prior incomplete child blocks all later API launches');
  if(['start','resume'].includes(argv[0]))assert.equal(process.env.CI,'true','Durable package proof is CI-only; local execution uses named public run');
  const evidence='public-run-'+(++operationSequence);
  let authored;
  if(argv[0]==='run') {
    const waitIndex=argv.indexOf('--wait'),budgetIndex=argv.indexOf('--file-timeout');
    const boundary=Math.min(...[waitIndex,budgetIndex].filter(index=>index>=0),argv.length);
    const receiptDirectory=fs.mkdtempSync(path.join(directory,'.git','supervision-'));
    const runnerRoot=path.dirname(path.dirname(runner));
    authored=createReceiptDescriptor({directory:receiptDirectory,operation:evidence,runnerRoot,
      head:execFileSync('git',['rev-parse','HEAD'],{cwd:runnerRoot,windowsHide:true,encoding:'utf8'}).trim(),
      packageRoot:directory,files:argv.slice(2,boundary),waitMs:waitIndex<0?0:Number(argv[waitIndex+1])*1000,
      fileTimeoutMs:budgetIndex<0?1800000:Number(argv[budgetIndex+1])*1000,outerTimeoutMs:120000});
    argv=[...argv,'--internal-receipt',authored.file];
  }
  const began=Date.now();
  // A node:test deadline may cancel this promise before the outer cutoff.
  // Admission is latched before spawn and stays blocked until actual close
  // AND independent owned disposition, even if the test advances meanwhile.
  incompleteOwnership='In-flight authored operation: '+evidence;
  let child;
  try {child=spawn(process.execPath,[runner,...argv],{windowsHide:true,stdio:['ignore','pipe','pipe']});}
  catch(error) {incompleteOwnership=null;throw error;} // no child was returned
  let stdout='',stderr='',launchError=null,outerCutoff=false,coordinator=null,identityError=null;
  const completion=new Promise(resolve=>{
    child.once('error',error=>{launchError=error.message;});
    child.once('close',(exit,signal)=>resolve({exit,signal}));
  });
  child.stdout.setEncoding('utf8');child.stderr.setEncoding('utf8');
  child.stdout.on('data',chunk=>{stdout+=chunk;});child.stderr.on('data',chunk=>{stderr+=chunk;});
  try {coordinator=processIdentity(child.pid);} catch(error) {identityError=error.message;}
  const observations=[];
  const observer=observe&&authored?setInterval(()=>{
    try {
      const receipt=JSON.parse(fs.readFileSync(authored.descriptor.receiptFile,'utf8'));
      if(receipt.nonce!==authored.descriptor.nonce)return;
      const current=receipt.attempts.at(-1);
      if(current?.mode!=='run-direct')return;
      const journal=JSON.parse(fs.readFileSync(path.join(current.directory,'attempt.json'),'utf8'));
      if(journal.progress)observations.push({observedAt:Date.now(),id:current.id,progress:journal.progress});
    } catch { /* Missing atomically published initial progress is not fabricated. */ }
  },200):undefined;
  const timer=setTimeout(()=>{outerCutoff=true;incompleteOwnership='Outer coordinator cutoff: owned tree unconfirmed';child.kill();},120000);
  const close=await completion;clearTimeout(timer);clearInterval(observer);
  let disposition;
  if(authored)disposition=await awaitReceiptDisposition(authored,{coordinator});
  else {
    const runRoot=path.join(directory,'.git','test-suites');
    try {
      const names=fs.readdirSync(runRoot);
      assert.equal(names.length,1,'Fresh durable fixture has exactly one authored run');
      disposition=readDurableDisposition(path.join(runRoot,names[0]),{packageRoot:directory,coordinator,priorAttempts});
    } catch(error) {disposition={confirmed:false,error:error.message};}
  }
  incompleteOwnership=disposition.confirmed?null:disposition.error;
  retainNativeEvidence(directory,evidence,disposition);
  const result={argv,close,launchError,outerCutoff,coordinator,identityError,disposition,observations,elapsedMs:Date.now()-began};
  fs.writeFileSync(path.join(directory,'.git',evidence+'.stdout.log'),stdout);
  fs.writeFileSync(path.join(directory,'.git',evidence+'.stderr.log'),stderr);
  fs.writeFileSync(path.join(directory,'.git',evidence+'.json'),JSON.stringify(result));
  fs.writeFileSync(path.join(directory,'.git','public-run.stdout.log'),stdout);
  fs.writeFileSync(path.join(directory,'.git','public-run.stderr.log'),stderr);
  fs.writeFileSync(path.join(directory,'.git','public-run-result.json'),JSON.stringify(result));
  assert.equal(outerCutoff,false,'An outer cutoff is incomplete ownership evidence, never a real-API pass');
  assert.equal(launchError,null);
  assert.equal(disposition.confirmed,true,'Independent owned disposition is required before another fixture: '+disposition.error);
  assert.equal(close.signal,null);
  return {...result,stdout,stderr,authored};
}
const markers=directory=>fs.existsSync(path.join(directory,'.git','markers.jsonl'))?fs.readFileSync(path.join(directory,'.git','markers.jsonl'),'utf8').trim().split('\n'):[];
if(!dependencies) {
  if(process.env.IMPOWER_REQUIRE_VITEST_INTEGRATION==='1') {
    test('required real API admission cannot be absent',()=>assert.fail('Required private Vitest integration admission is missing'));
  } else console.log('SKIP: real repository Vitest integration requires its separately admitted private dependency package');
} else {
  verifyDependencies(dependencies);
  const admittedVersion=JSON.parse(fs.readFileSync(path.join(dependencies,'package.json'),'utf8')).dependencies.vitest;
  if(process.env.IMPOWER_TEST_VITEST_VERSION)assert.equal(admittedVersion,process.env.IMPOWER_TEST_VITEST_VERSION,'Required CI leg must use its authored exact version');
  console.log('Admitted actual Vitest and coverage-v8 version: '+admittedVersion);
  if(process.platform==='linux'&&(process.env.CI==='true'||process.argv.includes('--preparation-refusal'))) {
    test('real Linux capability refusal confirms receipt, permits service successor and closes',{timeout:120000},async()=>{
      assert.equal(incompleteOwnership,null);incompleteOwnership='In-flight Linux preparation refusal service';
      const directory=realPackage('linux-preparation',{}, {});
      const evidence=path.join(directory,'.git','execution');fs.mkdirSync(evidence);
      const packageRoot=path.join(directory,'packages','example');fs.mkdirSync(path.join(packageRoot,'src'),{recursive:true});
      fs.writeFileSync(path.join(packageRoot,'package.json'),'{"type":"module"}');
      fs.copyFileSync(path.join(directory,'vitest.config.ts'),path.join(packageRoot,'vitest.config.ts'));
      fs.writeFileSync(path.join(packageRoot,'src','one.test.ts'),'import {it,expect} from "vitest";import fs from "node:fs";it("successor",()=>{fs.appendFileSync('+JSON.stringify(path.join(directory,'.git','markers.jsonl'))+',"successor\\n");expect(1).toBe(1)});');
      const hashes=copyOwnedRunner(directory),helper=path.join(directory,'scripts','test-suite-child-linux.py');
      const originalHelper=fs.readFileSync(helper,'utf8'),marker=path.join(evidence,'children-refusal-reached.json');
      const prefix=`import builtins\n_original_open = builtins.open\ndef _refusal_open(location, *args, **kwargs):\n    if location == f"/proc/{os.getpid()}/task/{os.getpid()}/children" and not os.path.exists(${JSON.stringify(marker)}):\n        with _original_open(${JSON.stringify(marker)}, "w") as reached:\n            json.dump(dict(path=location, process=identity(os.getpid())), reached)\n        raise FileNotFoundError(2, "Reached service children prerequisite refusal", location)\n    return _original_open(location, *args, **kwargs)\nbuiltins.open = _refusal_open\n`;
      fs.writeFileSync(helper,prefix+originalHelper);
      const sourceEvidence=(name,original,bytes)=>{
        const file=path.join(evidence,name);fs.writeFileSync(file,bytes,{flag:'wx'});fs.chmodSync(file,0o444);
        return {file,original,sha256:createHash('sha256').update(bytes).digest('hex'),length:Buffer.byteLength(bytes)};
      };
      const retainedSources=[sourceEvidence('linux-helper-original.py.txt',helper,originalHelper),
        sourceEvidence('linux-helper-injected.py.txt',helper,prefix+originalHelper)];
      const git=args=>execFileSync('git',args,{cwd:directory,windowsHide:true,encoding:'utf8',
        env:{...process.env,GIT_AUTHOR_NAME:'fixture',GIT_AUTHOR_EMAIL:'fixture@example.invalid',GIT_COMMITTER_NAME:'fixture',GIT_COMMITTER_EMAIL:'fixture@example.invalid'}}).trim();
      git(['add','.']);git(['commit','--quiet','-m','owned Linux prerequisite refusal fixture']);
      const head=git(['rev-parse','HEAD']);assert.equal(git(['status','--porcelain']),'');
      fs.writeFileSync(path.join(evidence,'source-bindings.json'),JSON.stringify({directory,head,hashes,
        injection:{file:helper,sha256:createHash('sha256').update(prefix+originalHelper).digest('hex')}}));
      const operations=['refused','successor'].map(id=>({id,kind:'vitest',package:'packages/example',files:['src/one.test.ts'],timeoutSeconds:60,waitSeconds:30}));
      const outcomes=[];let service,primary;
      const reconcile=result=>{
        const names=fs.readdirSync(evidence).filter(name=>name.startsWith(result.id+'-supervision-'));assert.equal(names.length,1);
        const file=fs.realpathSync.native(path.join(evidence,names[0],'descriptor.json')),bytes=fs.readFileSync(file);
        const authored={file,descriptor:JSON.parse(bytes),binding:{file,sha256:createHash('sha256').update(bytes).digest('hex')}};
        const disposition=readReceiptDisposition(authored,{coordinator:result.coordinator});
        retainNativeEvidence(directory,result.id,disposition);return {authored,disposition};
      };
      try {
        service=await startExecutionService({operations,root:directory,directory:evidence,head});
        const refused=await requestExecution('refused',{env:service.environment,pollMs:100});outcomes.push(refused);
        const {authored,disposition}=reconcile(refused);
        assert.equal(refused.exit,75);assert.equal(refused.notRun,true);assert.equal(refused.containmentConfirmed,true);
        assert.equal(disposition.confirmed,true,disposition.error);assert.equal(disposition.record.phase,'preparation-refused');
        const reached=JSON.parse(fs.readFileSync(marker,'utf8'));
        assert.deepEqual(disposition.record.preparation[0].process,reached.process);
        assert.equal(disposition.record.preparation[0].close.exit,1);assert.notDeepEqual(processIdentity(reached.process.pid),reached.process);
        assert.deepEqual(markers(directory),[]);assert.equal(Object.hasOwn(disposition.record,'reservationToken'),false);
        const target=authored.descriptor.receiptFile,receiptBytes=fs.readFileSync(target),record=disposition.record;
        try {
          for(const patch of [{phase:'preparing'},{reservationToken:null},{attempts:[{id:'later-launch'}]},
            {preparation:[]},{preparation:[{...record.preparation[0],phase:'launch-may-start'}]},
            {preparation:[{...record.preparation[0],process:{...reached.process,start:'wrong'}}]},
            ...[{status:'unknown'},{platform:'win32'},{launchAuthorized:true},{exitConfirmed:false},{preparationTimedOut:true},
              {preparationClose:{exit:null,signal:'SIGTERM'}},{preparationPublicationError:'failure'},
              {root:{pid:800002,start:'possible-engine'}},{engineAuthorized:true},{authorizationPhase:'may-launch'}].map(patch=>({runtime:{...record.runtime,...patch}}))]) {
            fs.writeFileSync(target,JSON.stringify({...record,...patch}));
            assert.equal(readReceiptDisposition(authored,{coordinator:refused.coordinator}).confirmed,false,'Partial/later-launch refusal must remain unknown');
          }
        } finally {fs.writeFileSync(target,receiptBytes);}
        const control=path.join(directory,'.git','receipt-sensitivity');fs.mkdirSync(control);copyOwnedRunner(control);
        const receiptModule=path.join(control,'scripts','test-suite-receipt.mjs'),receiptSource=fs.readFileSync(receiptModule,'utf8');
        const needle='if (record.phase === "preparation-refused") {';assert.ok(receiptSource.includes(needle));
        const mutant=receiptSource.replace(needle,'if (false && record.phase === "preparation-refused") {');fs.writeFileSync(receiptModule,mutant);
        retainedSources.push(sourceEvidence('receipt-source.mjs.txt',receiptModule,receiptSource),
          sourceEvidence('receipt-mutant.mjs.txt',receiptModule,mutant));
        fs.writeFileSync(path.join(evidence,'retained-source-manifest.json'),JSON.stringify(retainedSources));
        const validator=await import(pathToFileURL(receiptModule).href),red=validator.readReceiptDisposition(authored,{coordinator:refused.coordinator});
        assert.equal(red.confirmed,false);assert.match(red.error,/Preparation admission remains unresolved/);
        assert.throws(()=>assert.equal(red.confirmed,true),/false/,'SAME native receipt assertion is RED with correction removed');
        fs.writeFileSync(path.join(evidence,'receipt-sensitivity.json'),JSON.stringify({red,sourceSha256:createHash('sha256').update(receiptSource).digest('hex'),mutantSha256:createHash('sha256').update(mutant).digest('hex')}));
        console.log('RED native receipt sensitivity: safely refused capability is unresolved with correction removed');
        const successor=await requestExecution('successor',{env:service.environment,pollMs:100});outcomes.push(successor);
        assert.equal(successor.passed,true,JSON.stringify(successor));assert.equal(reconcile(successor).disposition.confirmed,true);
        assert.deepEqual(markers(directory),['successor']);await service.close();
        console.log(JSON.stringify({nativeLinuxPreparationRefusal:refused,successor,cleanClose:true}));
      } catch(error) {primary=error;throw error;} finally {
        await finishFixtureCleanup(primary,async()=>{
          if(service)await service.close();
          const admitted=fs.readdirSync(evidence).filter(name=>/-supervision-/.test(name)).map(name=>name.split('-supervision-')[0]);
          for(const id of admitted)if(!outcomes.some(result=>result.id===id)) {
            try{const result=JSON.parse(fs.readFileSync(path.join(evidence,id+'.json'),'utf8'));if(result.id===id)outcomes.push(result);}catch{}
          }
          assert.ok(admitted.every(id=>{const result=outcomes.find(row=>row.id===id);return result&&reconcile(result).disposition.confirmed;}),'Every admitted original operation must reconcile');
          incompleteOwnership=null;
        },failure=>fs.writeFileSync(path.join(evidence,'preparation-cleanup.json'),JSON.stringify({outcomes,confirmed:incompleteOwnership===null,error:failure?.message})));
      }
    });
  }
  if(process.env.CI==='true'||process.argv.includes('--preflight-refusal')) {
    test('same execution service accepts a definite version refusal then a real successor and closes cleanly',{timeout:120000},async()=>{
      assert.equal(incompleteOwnership,null);incompleteOwnership='In-flight real preflight service control';
      const directory=realPackage('version-service',{},{}),evidence=path.join(directory,'.git','execution');
      fs.mkdirSync(evidence);
      for(const name of ['refused','successor']) {
        const packageRoot=path.join(directory,'packages',name);
        fs.mkdirSync(path.join(packageRoot,'src'),{recursive:true});
        fs.writeFileSync(path.join(packageRoot,'package.json'),'{"type":"module"}');
        fs.writeFileSync(path.join(packageRoot,'vitest.config.ts'),'export default {test:{include:["src/**/*.test.ts"]}};');
        fs.writeFileSync(path.join(packageRoot,'src','one.test.ts'),'import {it,expect} from "vitest";import fs from "node:fs";it("real service",()=>{fs.appendFileSync('+JSON.stringify(path.join(directory,'.git','markers.jsonl'))+','+JSON.stringify(name+'\n')+');expect(1).toBe(1)});');
      }
      const moduleDirectory=path.join(directory,'packages','refused','node_modules','vitest');
      fs.mkdirSync(moduleDirectory,{recursive:true});
      fs.writeFileSync(path.join(moduleDirectory,'package.json'),JSON.stringify({name:'vitest',version:'0.0.0',exports:{'./package.json':'./package.json'}}));
      const hashes=copyOwnedRunner(directory);
      const git=args=>execFileSync('git',args,{cwd:directory,windowsHide:true,encoding:'utf8',
        env:{...process.env,GIT_AUTHOR_NAME:'fixture',GIT_AUTHOR_EMAIL:'fixture@example.invalid',GIT_COMMITTER_NAME:'fixture',GIT_COMMITTER_EMAIL:'fixture@example.invalid'}}).trim();
      git(['add','.']);git(['commit','--quiet','-m','owned preflight service fixture']);
      const head=git(['rev-parse','HEAD']);assert.equal(git(['status','--porcelain']),'');
      fs.writeFileSync(path.join(evidence,'source-bindings.json'),JSON.stringify({directory,head,hashes}));
      const operations=['refused','successor'].map(id=>({id,kind:'vitest',package:'packages/'+id,files:['src/one.test.ts'],timeoutSeconds:60,waitSeconds:30}));
      let service,originalFailure;const outcomes=[];
      const reconcile=result=>{
        const names=fs.readdirSync(evidence).filter(name=>name.startsWith(result.id+'-supervision-'));
        assert.equal(names.length,1);
        const file=fs.realpathSync.native(path.join(evidence,names[0],'descriptor.json')),bytes=fs.readFileSync(file);
        const authored={file,descriptor:JSON.parse(bytes),binding:{file,sha256:createHash('sha256').update(bytes).digest('hex')}};
        const disposition=readReceiptDisposition(authored,{coordinator:result.coordinator});
        retainNativeEvidence(directory,result.id,disposition);return disposition;
      };
      try {
        service=await startExecutionService({operations,root:directory,directory:evidence,head});
        const refused=await requestExecution('refused',{env:service.environment,pollMs:100});outcomes.push(refused);
        assert.equal(refused.exit,75);assert.equal(refused.notRun,true);assert.equal(refused.containmentConfirmed,true);
        const disposition=reconcile(refused);assert.equal(disposition.confirmed,true,disposition.error);
        assert.equal(disposition.record.phase,'preflight-refused');assert.deepEqual(markers(directory),[]);
        const successor=await requestExecution('successor',{env:service.environment,pollMs:100});outcomes.push(successor);
        assert.equal(successor.passed,true,JSON.stringify(successor));assert.equal(reconcile(successor).confirmed,true);
        assert.deepEqual(markers(directory),['successor']);
        await service.close();
        console.log(JSON.stringify({realServicePreflight:refused,realServiceSuccessor:successor,cleanClose:true}));
      } catch(error) {originalFailure=error;throw error;} finally {
        if(service)try {await service.close();} catch(error) {if(!originalFailure)throw error;}
        const admitted=fs.readdirSync(evidence).filter(name=>/-supervision-/.test(name)).map(name=>name.split('-supervision-')[0]);
        for(const id of admitted)if(!outcomes.some(result=>result.id===id)) {
          try {const result=JSON.parse(fs.readFileSync(path.join(evidence,id+'.json'),'utf8'));if(result.id===id)outcomes.push(result);}catch{}
        }
        const confirmed=admitted.every(id=>{const result=outcomes.find(value=>value.id===id);if(!result)return false;try{return reconcile(result).confirmed;}catch{return false;}});
        incompleteOwnership=confirmed?null:'Service preflight control has unresolved original disposition';
        fs.writeFileSync(path.join(evidence,'preflight-cleanup.json'),JSON.stringify({admitted,outcomes,confirmed,error:originalFailure?.message}));
      }
    });
    test('definite version preflight refusal authenticates no launch; partial or later launch state stays unknown',{timeout:90000},async()=>{
      const directory=realPackage('version-refusal',{}, {'src/one.test.ts':'one'});
      const moduleDirectory=path.join(directory,'node_modules','vitest');
      fs.mkdirSync(moduleDirectory,{recursive:true});
      fs.writeFileSync(path.join(moduleDirectory,'package.json'),JSON.stringify({name:'vitest',version:'0.0.0',exports:{'./package.json':'./package.json'}}));
      const result=await publicRunner(directory,['run',directory,'src/one.test.ts','--wait','30']);
      assert.equal(result.close.exit,75);assert.match(result.stderr,/2\.1\.9 or 3\.2\.6/);
      assert.deepEqual(markers(directory),[]);
      const record=result.disposition.record;
      assert.equal(record.phase,'preflight-refused');assert.deepEqual(record.preparation,[]);assert.deepEqual(record.attempts,[]);
      assert.equal(record.runtime,undefined);assert.equal(record.reservationToken,undefined);
      const target=result.authored.descriptor.receiptFile,original=fs.readFileSync(target);
      try {
        for(const patch of [{phase:'preparing'},{preparation:[{kind:'compiler',phase:'launch-may-start'}]},
          {attempts:[{id:'possibly-launched'}]},{runtime:{status:'prepared'}},{reservationToken:'later-launch'},
          ...[null,false,''].flatMap(value=>[{runtime:value},{reservationToken:value}]),
          {preflight:{launchPossible:true,reason:'not safe'}}]) {
          fs.writeFileSync(target,JSON.stringify({...record,...patch}));
          assert.equal(readReceiptDisposition(result.authored,{coordinator:result.coordinator}).confirmed,false);
        }
      } finally {fs.writeFileSync(target,original);}
      assert.equal(readReceiptDisposition(result.authored,{coordinator:result.coordinator}).confirmed,true);
      assert.equal(readReceiptDisposition(result.authored,{coordinator:{...result.coordinator,start:'wrong'}}).confirmed,false);
      assert.equal(readReceiptDisposition(result.authored,{coordinator:result.coordinator,identify:()=>result.coordinator}).confirmed,false,'Live original coordinator cannot release');
      // Same authored public route can subsequently execute the admitted real
      // version. Actual execution-service continuity is covered separately.
      const successor=realPackage('version-successor',{}, {'src/one.test.ts':'one'});
      const green=await publicRunner(successor,['run',successor,'src/one.test.ts','--wait','30']);
      assert.equal(green.close.exit,0);assert.deepEqual(markers(successor),['one']);
    });
  }
  if(process.env.CI==='true'||process.argv.includes('--progress-publication')) {
    test('permanent task-progress publication refusal remains a confirmed failed result',{timeout:90000},async()=>{
      const directory=realPackage('progress-permanent',{}, {'src/one.test.ts':'one'});
      const marker=path.join(directory,'.git','permanent-refusal-reached');
      fs.writeFileSync(path.join(directory,'vitest.config.ts'),
        'import fs from "node:fs";const rename=fs.renameSync;let reached=false;fs.renameSync=function(source,target){'+
        'if(target.endsWith("progress.json")&&JSON.parse(fs.readFileSync(source,"utf8")).event==="task-update"){'+
        'if(!reached)fs.appendFileSync('+JSON.stringify(marker)+',process.argv[2]+"\\n");reached=true;'+
        'throw Object.assign(new Error("Reached permanent progress replacement refusal"),{code:"EPERM"});}'+
        'return rename.apply(this,arguments)};export default {test:{include:["src/**/*.test.ts"]}};');
      const result=await publicRunner(directory,['run',directory,'src/one.test.ts','--wait','30']);
      assert.ok(fs.readFileSync(marker,'utf8').split('\n').includes('run-direct'));
      assert.equal(result.close.exit,1);assert.match(result.stdout+result.stderr,/Reached permanent progress replacement refusal/);
      assert.equal(result.disposition.confirmed,true);assert.equal(terminalSummary(result).status,'failed');
      assert.deepEqual(markers(directory),['one']);
    });
    test('genuine task progress survives one bounded Windows replacement refusal',{timeout:90000},async()=>{
      const directory=realPackage('progress-replacement',{}, {'src/one.test.ts':'one'});
      const marker=path.join(directory,'.git','progress-refusal-reached');
      fs.writeFileSync(path.join(directory,'vitest.config.ts'),
        'import fs from "node:fs";const rename=fs.renameSync;let refused=false;fs.renameSync=function(source,target){'+
        'if(!refused&&target.endsWith("progress.json")&&JSON.parse(fs.readFileSync(source,"utf8")).event==="task-update"){'+
        'refused=true;fs.appendFileSync('+JSON.stringify(marker)+',process.argv[2]+"\\n");'+
        'if(process.platform==="win32")throw Object.assign(new Error("Reached transient progress replacement refusal"),{code:"EPERM"});}'+
        'return rename.apply(this,arguments)};export default {test:{include:["src/**/*.test.ts"]}};');
      const result=await publicRunner(directory,['run',directory,'src/one.test.ts','--wait','30']);
      assert.ok(fs.readFileSync(marker,'utf8').split('\n').includes('run-direct'),'Actual native task-update replacement boundary reached');
      assert.equal(result.close.exit,0,result.stdout+result.stderr);
      assert.deepEqual(markers(directory),['one']);
      assert.equal(result.disposition.confirmed,true);
    });
  }
  if(process.env.CI==='true'||process.argv.includes('--cancellation')) {
    test('in-flight authored public operation blocks a second launch until independent disposition',{timeout:150000},async()=>{
      const directory=realPackage('in-flight',{}, {'src/one.test.ts':'one'});
      const first=publicRunner(directory,['run',directory,'src/one.test.ts','--wait','30']);
      const admittedSequence=operationSequence;
      let original;
      try {
        await assert.rejects(publicRunner(directory,['run',directory,'src/one.test.ts','--wait','30']),/prior incomplete child/);
        assert.equal(operationSequence,admittedSequence,'Refused successor never creates another authored descriptor or child');
      } finally {original=await first;}
      assert.equal(original.close.exit,0);assert.equal(original.disposition.confirmed,true);
      assert.equal(incompleteOwnership,null);
    });
    test('real outer cancellation confirms ancestry before successor; receipt read failure freezes the service',{timeout:180000},async()=>{
      assert.equal(incompleteOwnership,null);
      incompleteOwnership='In-flight real reviewer cancellation controls';
      const directory=realPackage('reviewer-cancellation',{},{}),evidence=path.join(directory,'.git','execution');
      fs.mkdirSync(evidence);
      const packageRoot=path.join(directory,'packages','example'),marker=path.join(evidence,'hang-entered');
      fs.mkdirSync(path.join(packageRoot,'src'),{recursive:true});
      fs.writeFileSync(path.join(packageRoot,'package.json'),'{"type":"module"}');
      fs.writeFileSync(path.join(packageRoot,'vitest.config.ts'),'export default {test:{include:["src/**/*.test.ts"],testTimeout:120000}};');
      fs.writeFileSync(path.join(packageRoot,'src','hang.test.ts'),'import {it} from "vitest";import fs from "node:fs";it("real cancellation",async()=>{fs.appendFileSync('+JSON.stringify(marker)+',"entered\\n");await new Promise(()=>{})});');
      fs.writeFileSync(path.join(packageRoot,'src','pass.test.ts'),'import {it,expect} from "vitest";it("real successor",()=>expect(1).toBe(1));');
      const hashes=copyOwnedRunner(directory);
      const git=args=>execFileSync('git',args,{cwd:directory,windowsHide:true,encoding:'utf8',
        env:{...process.env,GIT_AUTHOR_NAME:'fixture',GIT_AUTHOR_EMAIL:'fixture@example.invalid',GIT_COMMITTER_NAME:'fixture',GIT_COMMITTER_EMAIL:'fixture@example.invalid'}}).trim();
      git(['add','.']);git(['commit','--quiet','-m','owned cancellation fixture']);
      const head=git(['rev-parse','HEAD']);assert.equal(git(['status','--porcelain']),'');
      fs.writeFileSync(path.join(evidence,'source-bindings.json'),JSON.stringify({directory,head,hashes,outerTimeoutSeconds:20}));
      const operations=['hang','successor','fault','blocked'].map(id=>({id,kind:'vitest',package:'packages/example',
        files:[id==='successor'||id==='blocked'?'src/pass.test.ts':'src/hang.test.ts'],timeoutSeconds:id==='successor'||id==='blocked'?60:20,waitSeconds:30}));
      const read=fs.readFileSync;
      let service,readFaultReached=0,negative,positive,successor,authoredNegative;
      const authored=id=>{
        const names=fs.readdirSync(evidence).filter(name=>name.startsWith(id+'-supervision-'));
        assert.equal(names.length,1,'One fresh caller-authored operation descriptor');
        const file=fs.realpathSync.native(path.join(evidence,names[0],'descriptor.json')),bytes=read(file);
        return {file,descriptor:JSON.parse(bytes),binding:{file,sha256:createHash('sha256').update(bytes).digest('hex')}};
      };
      const nativeDisposition=result=>{
        const value=readReceiptDisposition(authored(result.id),{coordinator:result.coordinator});
        retainNativeEvidence(directory,result.id,value);return value;
      };
      let cleanupConfirmed=false,originalFailure;
      try {
        service=await startExecutionService({operations,root:directory,directory:evidence,head});
        positive=await requestExecution('hang',{env:service.environment,pollMs:100});
        assert.equal(positive.timedOut,true);assert.equal(positive.containmentConfirmed,true,positive.containmentError);
        assert.equal(fs.readFileSync(marker,'utf8'),'entered\n','The hanging Vitest test entered before the actual outer cutoff');
        const disposition=nativeDisposition(positive);assert.equal(disposition.confirmed,true,disposition.error);
        assert.notDeepEqual(processIdentity(positive.coordinator.pid),positive.coordinator);
        const owned=disposition.record.attempts.find(row=>row.mode==='run-direct');
        const proof=JSON.parse(read(owned.supervision.proofFile,'utf8'));
        assert.equal(proof.interrupted,true);assert.equal(proof.tree.empty,true);
        successor=await requestExecution('successor',{env:service.environment,pollMs:100});
        assert.equal(successor.passed,true,JSON.stringify(successor));
        assert.equal(nativeDisposition(successor).confirmed,true);
        // Fault injection is in the caller's receipt read only. The real
        // coordinator/helper still publish untouched independently valid proof.
        fs.readFileSync=function(file,...args) {
          const bytes=read(file,...args);
          if(typeof file==='string'&&path.basename(file)==='receipt.json'&&path.basename(path.dirname(file)).startsWith('fault-supervision-')) {
            readFaultReached++;
            const value=JSON.parse(bytes);value.nonce='caller-read-fault';
            return typeof bytes==='string'?JSON.stringify(value):Buffer.from(JSON.stringify(value));
          }
          return bytes;
        };
        try {negative=await requestExecution('fault',{env:service.environment,pollMs:100});}
        finally {fs.readFileSync=read;}
        assert.ok(readFaultReached,'The intended production receipt-read boundary was reached');
        assert.equal(negative.timedOut,true);assert.equal(negative.containmentConfirmed,false);
        assert.match(negative.containmentError,/binding or lifecycle/);
        assert.equal(fs.readFileSync(marker,'utf8'),'entered\nentered\n','Both real cancellation markers were reached');
        authoredNegative=authored('fault');
        const untouched=readReceiptDisposition(authoredNegative,{coordinator:negative.coordinator});
        assert.equal(untouched.confirmed,true,untouched.error);cleanupConfirmed=true;
        await assert.rejects(requestExecution('blocked',{env:service.environment,pollMs:100}),/binding or lifecycle/);
        await assert.rejects(service.close(),/binding or lifecycle/);
        assert.equal(fs.existsSync(path.join(evidence,'blocked.started.json')),false);
        // Missing/partial/bound-to-another-coordinator receipts cannot borrow a
        // completed real proof. Restore exact bytes before fixture completion.
        const receiptFile=authoredNegative.descriptor.receiptFile,bytes=read(receiptFile);
        for(const kind of ['missing','partial','coordinator','attempt-id','attempt-directory','borrowed-supervision']) {
          const saved=receiptFile+'.saved-'+kind;
          try {
            if(kind==='missing')fs.renameSync(receiptFile,saved);
            else if(kind==='partial')fs.writeFileSync(receiptFile,'{');
            else {const value=JSON.parse(bytes);
              if(kind==='coordinator')value.coordinator.start+='-changed';
              else if(kind==='attempt-id')value.attempts.at(-1).id=randomUUID();
              else if(kind==='attempt-directory')value.attempts.at(-1).directory=path.join(value.attempts.at(-1).directory,'foreign-attempt');
              else value.attempts.at(-1).supervision=structuredClone(value.attempts[0].supervision);
              fs.writeFileSync(receiptFile,JSON.stringify(value));}
            const refused=readReceiptDisposition(authoredNegative,{coordinator:negative.coordinator});
            assert.equal(refused.confirmed,false,kind);
            console.log(JSON.stringify({receiptNegative:kind,error:refused.error}));
          } finally {if(kind==='missing')fs.renameSync(saved,receiptFile);else fs.writeFileSync(receiptFile,bytes);}
        }
        assert.equal(readReceiptDisposition(authoredNegative,{coordinator:negative.coordinator}).confirmed,true);
        console.log(JSON.stringify({realCancellation:positive,realSuccessor:successor,receiptReadFault:negative,readFaultReached}));
      } catch(error) {originalFailure=error;throw error;} finally {
        fs.readFileSync=read;
        let admitted=[],outcomes=[];
        const completed=await finishFixtureCleanup(originalFailure,async()=>{
          if(service)try{await service.close();}catch(error){if(!negative&&!originalFailure)throw error;}
          // Service close drains its retained original child before returning or
          // rejecting. Independently reconcile every actual launched operation.
          admitted=fs.readdirSync(evidence).filter(name=>/-supervision-/.test(name)).map(name=>name.split('-supervision-')[0]);
          outcomes=[positive,successor,negative].filter(Boolean);
          for(const id of admitted)if(!outcomes.some(result=>result.id===id)) {
            try {const result=JSON.parse(read(path.join(evidence,id+'.json'),'utf8'));if(result.id===id)outcomes.push(result);}catch{}
          }
          const dispositions=outcomes.map(result=>nativeDisposition(result));
          cleanupConfirmed=admitted.length>0&&outcomes.length===admitted.length
            &&admitted.every(id=>outcomes.filter(result=>result.id===id).length===1)
            &&dispositions.every(result=>result.confirmed);
          assert.equal(cleanupConfirmed,true,'Every admitted fixture operation must have independently confirmed disposition before cleanup');
          if(cleanupConfirmed) {
            await settleFixtureReservation(dispositions.map(value=>value.record),directory);
            // Validator negatives use private stores and preserve their exact
            // input bytes; none can recover or alter the machine reservation.
            const original=dispositions.at(-1).record,attempt=original.attempts.at(-1);
            for(const kind of ['missing-supervision','foreign-attempt','unknown-proof']) {
              const root=path.join(evidence,'reservation-negative-'+kind);fs.mkdirSync(root);
              const value={version:2,owner:original.coordinator,token:attempt.supervision.reservationToken,
                run:path.dirname(attempt.directory),attempt:attempt.id,phase:'running',supervision:structuredClone(attempt.supervision)};
              if(kind==='missing-supervision')delete value.supervision;
              else if(kind==='foreign-attempt')value.attempt=randomUUID();
              else value.supervision.proofFile=path.join(root,'missing-proof.json');
              const file=path.join(root,'reservation.json'),bytes=JSON.stringify(value);fs.writeFileSync(file,bytes);
              const records=[structuredClone(original)];
              if(kind==='unknown-proof')records[0].attempts.at(-1).supervision.proofFile=value.supervision.proofFile;
              await assert.rejects(settleFixtureReservation(records,directory,root),/Preserve (reservation|unknown\/live reservation)/);
              assert.equal(fs.readFileSync(file,'utf8'),bytes,'Refused fixture cleanup preserves '+kind);
            }
            const root=path.join(evidence,'reservation-concurrent');fs.mkdirSync(root);
            const file=path.join(root,'reservation.json');
            let foreign=acquire('already admitted foreign caller',{root,census:()=>[],supervised:true});
            try {
              const bytes=fs.readFileSync(file);
              await settleFixtureReservation([original],directory,root);
              assert.deepEqual(fs.readFileSync(file),bytes,'Already admitted foreign owner is preserved');
            }finally{foreign.release();}
            const previous={version:2,owner:original.coordinator,token:attempt.supervision.reservationToken,
              run:path.dirname(attempt.directory),attempt:attempt.id,phase:'running',supervision:attempt.supervision};
            fs.writeFileSync(file,JSON.stringify(previous));
            const unlink=fs.unlinkSync;let admittedAfterRelease=false;foreign=null;
            fs.unlinkSync=function(target,...args) {
              const result=unlink(target,...args);
              if(target===path.join(root,'guard.json')&&!admittedAfterRelease&&!fs.existsSync(file)) {
                admittedAfterRelease=true;
                foreign=acquire('foreign caller after release',{root,census:()=>[],supervised:true});
              }
              return result;
            };
            try {
              await settleFixtureReservation([original],directory,root);
              assert.equal(admittedAfterRelease,true,'Foreign admission reached the original release boundary');
              assert.equal(readReservation(file).token,foreign.record.token,'Later foreign owner is preserved');
            }finally{fs.unlinkSync=unlink;if(foreign)foreign.release();}
          }
          const reservationFile=path.join(machineRoot,'reservation.json');
          let reservation=null;
          try{reservation=readReservation(reservationFile);}catch(error){if(error.code!=='ENOENT')throw error;}
          const tokens=dispositions.flatMap(result=>result.record?.attempts.map(attempt=>attempt.supervision.reservationToken)??[]);
          assert.equal(reservation!==null&&tokens.includes(reservation.token),false,
            'Completed focused cancellation must settle its machine reservation before disposable evidence cleanup');
        },cleanupError=>{
          if(cleanupError)cleanupConfirmed=false;
          fs.writeFileSync(path.join(evidence,'fixture-disposition.json'),JSON.stringify({cleanupConfirmed,cleanupError:cleanupError?.message,admitted,originalFailure:originalFailure?.message,outcomes}));
        });
        if(completed&&cleanupConfirmed)incompleteOwnership=null;
      }
    });
  }
  if(process.env.CI==='true'||process.argv.includes('--baseline')) {
    test('baseline public named-file run cannot imply success when configuration excludes a requested file',{timeout:150000},async()=>{
      const directory=realPackage('excluded',{exclude:['src/excluded/**']},{'src/included.test.ts':'included','src/excluded/omitted.test.ts':'excluded'});
      const result=await publicRunner(directory,['run',directory,'src/included.test.ts','src/excluded/omitted.test.ts','--wait','30']);
      assert.deepEqual(markers(directory),['included'],'Configured exclude remains in force');
      assert.match(result.stdout,/Test Files\s+1 passed/);
      assert.equal(result.close.exit,1,'Mixed selected plus omitted request must fail coverage');
      const summary=terminalSummary(result);assert.equal(summary.status,'incomplete');assert.equal(summary.exit,1);
      assert.equal(summary.notRun.length,1);assert.equal(summary.completed.length,1);
      const omitted=await publicRunner(directory,['run',directory,'src/excluded/omitted.test.ts','--wait','30']);
      assert.equal(omitted.close.exit,75);assert.equal(terminalSummary(omitted).status,'not-run');
      assert.equal(terminalSummary(omitted).notRun.length,1);assert.deepEqual(markers(directory),['included']);
    });
    test('baseline public substring filter cannot execute an additional overlapping file',{timeout:150000},async()=>{
      const directory=realPackage('overlap',{}, {'src/short.test.ts':'requested','src/duplicate/src/short.test.ts':'overlap'});
      const result=await publicRunner(directory,['run',directory,'src/short.test.ts','--wait','30']);
      assert.equal(result.close.exit,0);
      assert.deepEqual(markers(directory),['requested'],'Only the requested physical file may execute');
    });
  }
  if(process.env.CI==='true'||process.argv.includes('--selection')) {
    test('direct configured globalSetup and blob reporter are refused before setup or test effects',{timeout:120000},async()=>{
      for(const kind of ['globalSetup','blob','blob-name','blob-tuple']) {
        const directory=realPackage('unsupported-'+kind,{}, {'src/one.test.ts':'one'});
        const setupMarker=path.join(directory,'.git','setup-ran');
        fs.writeFileSync(path.join(directory,'global-setup.ts'),'import fs from "node:fs";export default ()=>{fs.writeFileSync('+JSON.stringify(setupMarker)+',"ran")};');
        const blob=kind.startsWith('blob');
        const config={test:{include:['src/**/*.test.ts'],...(blob?{reporters:kind==='blob-name'?'blob':kind==='blob-tuple'?[['blob',{}]]:['blob']}:{globalSetup:['./global-setup.ts']})}};
        fs.writeFileSync(path.join(directory,'vitest.config.ts'),'export default '+JSON.stringify(config)+';');
        const result=await publicRunner(directory,['run',directory,'src/one.test.ts','--wait','30']);
        assert.equal(result.close.exit,1);
        assert.match(result.stdout+result.stderr,blob?/configured BlobReporter/:/once-per-command globalSetup/);
        assert.deepEqual(markers(directory),[]);assert.equal(fs.existsSync(setupMarker),false);
      }
    });
    test('exact physical file preserves both configured project specifications',{timeout:90000},async()=>{
      const directory=realPackage('multi-project',{}, {'src/shared.test.ts':'shared','src/other.test.ts':'other'});
      fs.writeFileSync(path.join(directory,'vitest.workspace.ts'),'export default '+JSON.stringify(['alpha','beta'].map(name=>({test:{name,root:directory,include:['src/**/*.test.ts']}})))+';');
      const result=await publicRunner(directory,['run',directory,'src/shared.test.ts','--wait','30']);
      assert.equal(result.close.exit,0,result.stderr);
      assert.deepEqual(markers(directory),['shared','shared']);
      const fileAttempt=result.disposition.record.attempts.find(row=>row.mode==='run-direct');
      const selection=JSON.parse(fs.readFileSync(path.join(fileAttempt.directory,'selection.json'),'utf8'));
      assert.deepEqual(selection.specifications.map(row=>row.projectName).sort(),['alpha','beta']);
      assert.ok(selection.specifications.every(row=>row.file===fs.realpathSync.native(path.join(directory,'src/shared.test.ts'))));
    });
  }
  if(process.env.CI==='true'||process.argv.includes('--timeout')) {
    test('owned file timeout stops successors, removes prior clean coverage and keeps silent progress unchanged',{timeout:90000},async()=>{
      const directory=realPackage('owned-timeout',{}, {'src/hang.test.ts':'hang','src/later.test.ts':'later'});
      const marker=path.join(directory,'.git','entered');
      fs.writeFileSync(path.join(directory,'src','hang.test.ts'),'import {it} from "vitest";import fs from "node:fs";it("hang",async()=>{fs.writeFileSync('+JSON.stringify(marker)+',"entered");await new Promise(()=>{})});');
      const coverageDirectory=path.join(directory,'.git','coverage');fs.mkdirSync(coverageDirectory);
      const oldCoverage=path.join(coverageDirectory,'coverage-final.json');fs.writeFileSync(oldCoverage,'old-green');
      fs.writeFileSync(path.join(directory,'vitest.config.ts'),'export default '+JSON.stringify({test:{include:['src/**/*.test.ts'],testTimeout:30000,
        coverage:{enabled:true,provider:'v8',clean:true,reporter:['json'],reportsDirectory:coverageDirectory}}})+';');
      const result=await publicRunner(directory,['run',directory,'src/hang.test.ts','src/later.test.ts','--wait','30','--file-timeout','5'],{observe:true});
      assert.equal(result.close.exit,124,result.stderr);
      const summary=terminalSummary(result);assert.equal(summary.status,'timed-out');assert.equal(summary.fileTimeoutMs,5000);
      assert.equal(summary.timedOut.length,1);assert.equal(summary.timedOut[0].mode,'run-direct');assert.ok(summary.evidence);
      assert.equal(fs.existsSync(marker),true,'The intended hanging test actually entered');
      assert.deepEqual(markers(directory),[],'Neither an unfinished hang nor the successor can claim a completed marker');
      assert.equal(fs.existsSync(oldCoverage),false);
      const owned=result.disposition.record.attempts.filter(row=>row.mode==='run-direct');
      assert.equal(owned.length,1);
      const proof=JSON.parse(fs.readFileSync(owned[0].supervision.proofFile,'utf8'));
      assert.equal(proof.timedOut,true);assert.equal(proof.tree.empty,true);
      const grouped=new Map();
      for(const row of result.observations) {
        const key=row.id+':'+row.progress.sequence;
        const values=grouped.get(key)||[];values.push(row);grouped.set(key,values);
      }
      const silent=[...grouped.values()].find(rows=>rows.at(-1).observedAt-rows[0].observedAt>=1500);
      assert.ok(silent,'Observed at least1.5seconds without a genuine progress event');
      assert.ok(silent.every(row=>row.progress.at===silent[0].progress.at),'Polls never advance the event timestamp');
    });
    test('frequent genuine task progress batches shared persistence',{timeout:90000},async()=>{
      const directory=realPackage('batched-progress',{}, {'src/tasks.test.ts':'tasks'});
      // Vitest 3 throttles task delivery at100ms; Vitest 2 debounces at10ms.
      // Reach the SAME >=50 genuine-event assertion with both native runners.
      fs.writeFileSync(path.join(directory,'src','tasks.test.ts'),'import {it} from "vitest";for(let i=0;i<100;i++)it("task"+i,async()=>{await new Promise(resolve=>setTimeout(resolve,110))});');
      const result=await publicRunner(directory,['run',directory,'src/tasks.test.ts','--wait','30']);
      assert.equal(result.close.exit,0,result.stderr);
      const owned=result.disposition.record.attempts.find(row=>row.mode==='run-direct');
      const journal=JSON.parse(fs.readFileSync(path.join(owned.directory,'attempt.json'),'utf8'));
      const nativeProgress=JSON.parse(fs.readFileSync(path.join(owned.directory,'progress.json'),'utf8'));
      assertCoalescedProgress(journal,nativeProgress);
    });
  }
  if(process.env.CI==='true'||process.argv.includes('--budget-sensitivity')) {
    test('per-file budget interrupts a reached bounded test and forbids its successor',{timeout:90000},async()=>{
      const directory=realPackage('budget-sensitivity',{}, {'src/first.test.ts':'first-completed','src/successor.test.ts':'successor'});
      const entered=path.join(directory,'.git','first-entered');
      fs.writeFileSync(path.join(directory,'src','first.test.ts'),'import {it} from "vitest";import fs from "node:fs";it("bounded first",async()=>{fs.writeFileSync('+JSON.stringify(entered)+',"entered");await new Promise(resolve=>setTimeout(resolve,8000));fs.appendFileSync('+JSON.stringify(path.join(directory,'.git','markers.jsonl'))+',"first-completed\\n")});');
      fs.writeFileSync(path.join(directory,'vitest.config.ts'),'export default {test:{include:["src/**/*.test.ts"],testTimeout:30000}};');
      const result=await publicRunner(directory,['run',directory,'src/first.test.ts','src/successor.test.ts','--wait','30','--file-timeout','3']);
      assert.equal(fs.existsSync(entered),true,'The first test reached its marker');
      assert.equal(result.disposition.confirmed,true,'Actual original close and native empty-tree proof precede assertions');
      console.log('Budget sensitivity retained receipt '+path.join(directory,'.git','public-run-result.json')+'; close='+result.close.exit+'; completed='+JSON.stringify(markers(directory)));
      assert.equal(result.close.exit,124,'Per-file deadline must interrupt the bounded first test');
      assert.deepEqual(markers(directory),[],'A timed-out first test must forbid successor admission');
      const units=result.disposition.record.attempts.filter(row=>row.mode==='run-direct');assert.equal(units.length,1);
      const proof=JSON.parse(fs.readFileSync(units[0].supervision.proofFile,'utf8'));assert.equal(proof.timedOut,true);assert.equal(proof.tree.empty,true);
    });
  }
  if(process.env.CI==='true'||process.argv.includes('--reporter-lifecycle')) {
    test('configured reporter is constructed initialized finished and closed once per command',{timeout:120000},async()=>{
      for(const mixed of [false,true]) {
        const directory=realPackage('reporter-lifecycle',{exclude:['src/excluded/**']},
          {'src/one.test.ts':'requested','src/excluded/omitted.test.ts':'must-not-run'});
        const events=path.join(directory,'.git','reporter-events.jsonl'),module=path.join(directory,'reporter.mjs');
        fs.writeFileSync(module,'import fs from "node:fs";const event=value=>fs.appendFileSync('+JSON.stringify(events)+',JSON.stringify(value)+"\\n");export default class Reporter{constructor(){event("constructor")}onInit(ctx){event("init");ctx.onClose(()=>event("close"))}onFinished(){event("finished")}}');
        fs.writeFileSync(path.join(directory,'vitest.config.ts'),'export default '+JSON.stringify({test:{include:['src/**/*.test.ts'],
          exclude:['src/excluded/**'],reporters:[module]}})+';');
        const result=await publicRunner(directory,['run',directory,'src/one.test.ts',...(mixed?['src/excluded/omitted.test.ts']:[]),'--wait','30']);
        assert.equal(result.disposition.confirmed,true);assert.equal(result.close.exit,mixed?1:0,result.stderr);
        assert.deepEqual(markers(directory),['requested']);
        const lifecycle=fs.readFileSync(events,'utf8').trim().split('\n').map(row=>JSON.parse(row));
        console.log(JSON.stringify({reporterLifecycle:{mixed,lifecycle,receipt:path.join(directory,'.git','public-run-result.json')}}));
        assert.deepEqual(lifecycle,['constructor','init','finished','close'],'Selection must not construct an unfinished configured reporter');
      }
    });
  }
  if(process.env.CI==='true'||process.argv.includes('--aggregate')) {
    test('coverage provider refusal precedes tests and requires actual native merge capability',{timeout:120000},async()=>{
      for(const kind of ['custom','missing-merge']) {
        const directory=realPackage('provider-'+kind,{}, {'src/one.test.ts':'must-not-run'});
        const marker=path.join(directory,'.git','provider-reached'),module=path.join(directory,'provider.mjs');
        const native=path.join(dependencies,'node_modules','@vitest','coverage-v8','dist','index.js').replaceAll(path.sep,'/');
        fs.writeFileSync(module,'import fs from "node:fs";import native from '+JSON.stringify(native)+';export default {async getProvider(){const provider=await native.getProvider();fs.writeFileSync('+JSON.stringify(marker)+',"reached");provider.mergeReports=undefined;return provider;}};');
        fs.writeFileSync(path.join(directory,'vitest.config.ts'),'export default '+JSON.stringify({
          ...(kind==='missing-merge'?{resolve:{alias:{'@vitest/coverage-v8':module}}}:{}),
          test:{include:['src/**/*.test.ts'],coverage:{enabled:true,provider:kind==='custom'?'custom':'v8',customProviderModule:module}}})+';');
        const result=await publicRunner(directory,['run',directory,'src/one.test.ts','--wait','30']);
        assert.equal(result.close.exit,1,result.stderr);assert.equal(result.disposition.confirmed,true);
        assert.deepEqual(markers(directory),[],'Provider admission refusal executes no requested test');
        assert.equal(result.disposition.record.attempts.length,1,'No file engine or finalizer is admitted');
        assert.equal(fs.existsSync(marker),kind==='missing-merge','The missing-method case reached the actual provider wrapper');
        assert.match(result.stdout+result.stderr,kind==='custom'?/custom providers are unsupported/:/cannot finalize combined reports/);
      }
    });
    test('clean=false preserves prior coverage while an owned file timeout remains unsuccessful',{timeout:90000},async()=>{
      const directory=realPackage('coverage-clean-false',{}, {'src/hang.test.ts':'hang'});
      const marker=path.join(directory,'.git','entered'),reports=path.join(directory,'.git','coverage');fs.mkdirSync(reports);
      const previous=path.join(reports,'coverage-final.json');fs.writeFileSync(previous,'retained prior report');
      fs.writeFileSync(path.join(directory,'src','hang.test.ts'),'import {it} from "vitest";import fs from "node:fs";it("hang",async()=>{fs.writeFileSync('+JSON.stringify(marker)+',"entered");await new Promise(()=>{})});');
      fs.writeFileSync(path.join(directory,'vitest.config.ts'),'export default '+JSON.stringify({test:{include:['src/**/*.test.ts'],testTimeout:30000,
        coverage:{enabled:true,provider:'v8',clean:false,reporter:['json'],reportsDirectory:reports}}})+';');
      const result=await publicRunner(directory,['run',directory,'src/hang.test.ts','--wait','30','--file-timeout','5']);
      assert.equal(result.close.exit,124,result.stderr);assert.equal(fs.existsSync(marker),true);
      assert.equal(fs.readFileSync(previous,'utf8'),'retained prior report');
      assert.equal(result.disposition.confirmed,true);
      assert.equal(result.disposition.record.attempts.some(row=>row.mode==='merge'),false);
    });
    test('owned finalizer budget includes configured reporter completion',{timeout:90000},async()=>{
      const directory=realPackage('finalizer-timeout',{}, {'src/one.test.ts':'completed-file'});
      const marker=path.join(directory,'.git','finalizer-entered'),module=path.join(directory,'reporter.mjs');
      fs.writeFileSync(module,'import fs from "node:fs";export default class Reporter{async onFinished(){fs.writeFileSync('+JSON.stringify(marker)+',"entered");const keepAlive=setInterval(()=>{},1000);try{await new Promise(()=>{})}finally{clearInterval(keepAlive)}}}');
      fs.writeFileSync(path.join(directory,'vitest.config.ts'),'export default '+JSON.stringify({test:{include:['src/**/*.test.ts'],reporters:['default',module]}})+';');
      const result=await publicRunner(directory,['run',directory,'src/one.test.ts','--wait','30','--file-timeout','5']);
      assert.equal(result.close.exit,124,result.stderr);assert.deepEqual(markers(directory),['completed-file']);
      assert.equal(terminalSummary(result).status,'timed-out');
      assert.equal(fs.existsSync(marker),true,'Configured reporter entered only during the owned merge');
      const finalizer=result.disposition.record.attempts.at(-1);assert.equal(finalizer.mode,'merge');
      const proof=JSON.parse(fs.readFileSync(finalizer.supervision.proofFile,'utf8'));
      assert.equal(proof.timedOut,true);assert.equal(proof.tree.empty,true);
      assert.equal(result.disposition.confirmed,true);
    });
    test('public exact files preserve combined coverage thresholds and configured reporters',{timeout:120000},async()=>{
      const directory=realPackage('aggregate-coverage',{}, {'src/first.test.ts':'first','src/second.test.ts':'second'});
      fs.writeFileSync(path.join(directory,'src','value.ts'),'export function first(){return 1;}export function second(){return 2;}');
      for(const name of ['first','second']) {
        const file=path.join(directory,'src',name+'.test.ts');
        fs.writeFileSync(file,fs.readFileSync(file,'utf8').replace('import {it,expect}', 'import {'+name+'} from "./value";import {it,expect}')
          .replace('expect(1)', 'expect('+name+'())').replace('toBe(1)', 'toBe('+ (name==='first'?1:2) +')'));
      }
      const report=path.join(directory,'.git','ordinary-report.json');
      const config={test:{include:['src/**/*.test.ts'],reporters:['default','json'],outputFile:{json:report},
        coverage:{enabled:true,provider:'v8',include:['src/value.ts'],all:true,reporter:['json'],
          reportsDirectory:path.join(directory,'.git','coverage'),thresholds:{functions:100,lines:100,statements:100,branches:100}}}};
      fs.writeFileSync(path.join(directory,'vitest.config.ts'),'export default '+JSON.stringify(config)+';');
      const combined=await publicRunner(directory,['run',directory,'src/first.test.ts','src/second.test.ts','--wait','30']);
      assert.equal(combined.close.exit,0,combined.stderr);
      assert.equal(JSON.parse(fs.readFileSync(report,'utf8')).testResults.length,2,'Original configured JSON reporter receives the combined set');
      const coverageFile=path.join(directory,'.git','coverage','coverage-final.json');
      const values=()=>Object.values(JSON.parse(fs.readFileSync(coverageFile,'utf8')))[0];
      assert.deepEqual(Object.values(values().f),[1,1],'Both functions contribute to one threshold evaluation');
      // Pure validator controls consume copies of blobs from this completed
      // actual pinned merge; they do not execute Vitest once per mutation.
      const finalizer=combined.disposition.record.attempts.find(row=>row.mode==='merge');
      const nativeRequest=JSON.parse(fs.readFileSync(finalizer.file,'utf8'));
      const nativeHashes=nativeRequest.blobs.map(blob=>({file:path.join(nativeRequest.directory,blob.name),sha256:blob.sha256}));
      const validation=path.join(directory,'.git','aggregate-validation');fs.mkdirSync(validation);
      for(const kind of ['positive','missing','extra','hash','version','specification','request-hash']) {
        const attempt=path.join(validation,kind);fs.mkdirSync(attempt);
        const blobs=path.join(attempt,'blobs');fs.mkdirSync(blobs);
        const request={...structuredClone(nativeRequest),directory:blobs};
        for(const blob of request.blobs)fs.copyFileSync(path.join(nativeRequest.directory,blob.name),path.join(blobs,blob.name));
        if(kind==='missing')fs.renameSync(path.join(blobs,request.blobs[0].name),path.join(attempt,'retained-missing.json'));
        if(kind==='extra')fs.copyFileSync(path.join(blobs,request.blobs[0].name),path.join(blobs,randomUUID()+'.json'));
        if(kind==='hash')request.blobs[0].sha256='00';
        if(kind==='specification')request.blobs[0].specifications[0].projectName+='-foreign';
        if(kind==='version') {
          const artifact=path.join(blobs,request.blobs[0].name),table=JSON.parse(fs.readFileSync(artifact,'utf8'));
          table[Number(table[0][0])]='2.1.8';const bytes=JSON.stringify(table);fs.writeFileSync(artifact,bytes);
          request.blobs[0].sha256=createHash('sha256').update(bytes).digest('hex');
        }
        const requestFile=path.join(attempt,'request.json'),bytes=JSON.stringify(request);
        fs.writeFileSync(requestFile,bytes,{flag:'wx'});
        const hash=kind==='request-hash'?'00':createHash('sha256').update(bytes).digest('hex');
        if(kind==='positive')assert.equal(validateAggregateInputs(requestFile,hash,directory).expected.length,2);
        else assert.throws(()=>validateAggregateInputs(requestFile,hash,directory),
          kind==='missing'||kind==='extra'?/blob set/:kind==='version'||kind==='specification'?/version\/specification binding/:/binding changed/);
        console.log('Native blob input / pure validator sensitivity: '+kind);
      }
      for(const row of nativeHashes)assert.equal(createHash('sha256').update(fs.readFileSync(row.file)).digest('hex'),row.sha256,'Original native blob bytes retained');
      const belowThreshold=await publicRunner(directory,['run',directory,'src/first.test.ts','--wait','30']);
      assert.equal(belowThreshold.close.exit,1);
      assert.match(belowThreshold.stdout+belowThreshold.stderr,/functions \(50%\).*threshold \(100%\)/);
      assert.equal(belowThreshold.disposition.record.outcome.status,'failed');
      assert.equal(terminalSummary(belowThreshold).status,'failed');
      assert.equal(terminalSummary(belowThreshold).unitFailures[0].mode,'merge');
      assert.equal(JSON.parse(fs.readFileSync(report,'utf8')).testResults.length,1);
      assert.deepEqual(Object.values(values().f).sort(),[0,1]);
      console.log('Combined API duration '+combined.elapsedMs+' ms; threshold-failure '+belowThreshold.elapsedMs+' ms');
    });
    test('combined coverage obeys reportOnFailure and command-level clean',{timeout:120000},async()=>{
      const directory=realPackage('coverage-failure',{}, {'src/first.test.ts':'first'});
      fs.writeFileSync(path.join(directory,'src','value.ts'),'export function value(){return 1;}');
      const file=path.join(directory,'src','first.test.ts');
      fs.writeFileSync(file,fs.readFileSync(file,'utf8').replace('import {it,expect}','import {value} from "./value";import {it,expect}')
        .replace('expect(1)','expect(value())').replace('toBe(1)','toBe(2)'));
      const reportDirectory=path.join(directory,'.git','coverage'),coverageFile=path.join(reportDirectory,'coverage-final.json');
      for(const reportOnFailure of [false,true]) {
        fs.mkdirSync(reportDirectory,{recursive:true});fs.writeFileSync(coverageFile,'old-green');
        fs.writeFileSync(path.join(directory,'vitest.config.ts'),'export default '+JSON.stringify({test:{include:['src/**/*.test.ts'],
          coverage:{enabled:true,provider:'v8',include:['src/value.ts'],all:true,clean:true,reportOnFailure,reporter:['json'],reportsDirectory:reportDirectory}}})+';');
        const result=await publicRunner(directory,['run',directory,'src/first.test.ts','--wait','30']);
        assert.equal(result.close.exit,1,'A test failure remains failed with either reporting setting');
        assert.equal(fs.existsSync(coverageFile),reportOnFailure,'clean removes prior green output before tests; failure reporting is configured');
        if(reportOnFailure)assert.ok(Object.values(JSON.parse(fs.readFileSync(coverageFile,'utf8')))[0].f);
      }
    });
  }
  if(process.env.CI==='true') {
    test('durable timed-out file needs explicit retry and retains authenticated prior attempts',{timeout:150000},async()=>{
      const directory=realPackage('durable-timeout-retry',{}, {'src/timeout.test.ts':'timeout'});
      const marker=path.join(directory,'.git','retry-entries'),allow=path.join(directory,'.git','allow-completion');
      fs.writeFileSync(path.join(directory,'src','timeout.test.ts'),'import {it} from "vitest";import fs from "node:fs";it("bounded retry",async()=>{fs.appendFileSync('+JSON.stringify(marker)+',"entered\\n");if(!fs.existsSync('+JSON.stringify(allow)+'))await new Promise(()=>{})});');
      fs.writeFileSync(path.join(directory,'vitest.config.ts'),'export default '+JSON.stringify({test:{include:['src/**/*.test.ts'],testTimeout:30000}})+';');
      execFileSync('git',['-C',directory,'add','src/timeout.test.ts','vitest.config.ts'],{windowsHide:true});
      const timed=await publicRunner(directory,['start',directory,'--wait','30','--file-timeout','5']);
      assert.equal(timed.close.exit,124,timed.stderr);
      const original=timed.disposition.run,attempt=original.attempts.find(row=>row.mode==='run');
      assert.equal(attempt.status,'timed-out');assert.equal(fs.readFileSync(marker,'utf8'),'entered\n');
      const runDirectory=original.directory,proofBytes=fs.readFileSync(attempt.supervision.proofFile,'utf8');
      const noRetry=await publicRunner(directory,['resume',runDirectory,'--wait','30','--file-timeout','5'],{priorAttempts:original.attempts});
      assert.equal(noRetry.close.exit,124,'A retained timeout is terminal without explicit retry');
      assert.equal(noRetry.disposition.run.attempts.length,original.attempts.length);
      assert.equal(fs.readFileSync(marker,'utf8'),'entered\n','No implicit relaunch');
      fs.writeFileSync(allow,'allowed');
      const retried=await publicRunner(directory,['resume',runDirectory,'--retry','src/timeout.test.ts','--wait','30','--file-timeout','5'],{priorAttempts:noRetry.disposition.run.attempts});
      assert.equal(retried.close.exit,0,retried.stderr);
      assert.equal(retried.disposition.run.attempts.length,original.attempts.length+1);
      assert.equal(fs.readFileSync(marker,'utf8'),'entered\nentered\n');
      assert.equal(fs.readFileSync(attempt.supervision.proofFile,'utf8'),proofBytes,'Original timeout proof survives retry');
    });
    test('configured API preserves discovery excludes and exact per-attempt report identity',{timeout:150000},async()=>{
      const directory=realPackage('configured-api',{exclude:['src/excluded/**']},
        {'src/short.test.ts':'requested','src/duplicate/src/short.test.ts':'overlap','src/excluded/omitted.test.ts':'excluded'});
      const lifecycle=path.join(directory,'.git','discovery-reporter-events'),module=path.join(directory,'reporter.mjs');
      fs.writeFileSync(module,'import fs from "node:fs";const event=value=>fs.appendFileSync('+JSON.stringify(lifecycle)+',value+"\\n");export default class Reporter{constructor(){event("constructor")}onInit(ctx){event("init");ctx.onClose(()=>event("close"))}onFinished(){event("finished")}}');
      fs.writeFileSync(path.join(directory,'vitest.config.ts'),'export default '+JSON.stringify({test:{include:['src/**/*.test.ts'],
        exclude:['src/excluded/**'],reporters:[module]}})+';');
      execFileSync('git',['-C',directory,'add','vitest.config.ts','reporter.mjs'],{windowsHide:true});
      const result=await publicRunner(directory,['start',directory,'--wait','30']);
      assert.equal(result.close.exit,0,result.stderr);
      assert.equal(fs.existsSync(lifecycle),false,'Pure discovery creates no configured reporter; durable file units use their explicit reporters');
      assert.deepEqual(markers(directory).sort(),['overlap','requested']);
      const runRoot=path.join(directory,'.git','test-suites');
      const run=JSON.parse(fs.readFileSync(path.join(runRoot,fs.readdirSync(runRoot)[0],'run.json'),'utf8'));
      const attempts=run.attempts.filter(row=>row.mode==='run');
      assert.equal(attempts.length,2);
      for(const attempt of attempts) {
        const selection=JSON.parse(fs.readFileSync(path.join(attempt.directory,'selection.json'),'utf8'));
        const report=JSON.parse(fs.readFileSync(path.join(attempt.directory,'vitest.json'),'utf8'));
        assert.equal(selection.status,'selected');
        assert.equal(selection.specifications.length,1);
        assert.equal(selection.specifications[0].file,fs.realpathSync.native(attempt.file));
        assert.equal(selection.specifications[0].projectRoot,fs.realpathSync.native(directory));
        assert.equal(report.testResults.length,1);
        assert.equal(fs.realpathSync.native(report.testResults[0].name),fs.realpathSync.native(attempt.file));
      }
      console.log('Actual configured API duration: '+result.elapsedMs+' ms');
    });
    test('configured coverage-v8 finalization survives exact runFiles selection',{timeout:150000},async()=>{
      const directory=realPackage('coverage-api',{coverage:true},{'src/coverage.test.ts':'coverage'});
      fs.writeFileSync(path.join(directory,'src','value.ts'),'export function value(){return 1;}');
      const file=path.join(directory,'src','coverage.test.ts');
      fs.writeFileSync(file,fs.readFileSync(file,'utf8').replace('import {it,expect}', 'import {value} from "./value";import {it,expect}').replace('expect(1)','expect(value())'));
      execFileSync('git',['-C',directory,'add','src/value.ts','src/coverage.test.ts'],{windowsHide:true});
      const result=await publicRunner(directory,['start',directory,'--wait','30']);
      assert.equal(result.close.exit,0,result.stderr);
      assert.deepEqual(markers(directory),['coverage']);
      const coverage=JSON.parse(fs.readFileSync(path.join(directory,'.git','coverage','coverage-final.json'),'utf8'));
      const value=Object.entries(coverage).find(([name])=>path.basename(name)==='value.ts')?.[1];
      assert.ok(value,'Configured v8 provider must write actual production-source coverage');
      assert.ok(Object.values(value.f).some(hits=>hits>0),'The production function actually executed');
      console.log('Actual configured coverage duration: '+result.elapsedMs+' ms');
    });
  } else if(process.env.IMPOWER_REQUIRE_VITEST_INTEGRATION==='1') {
    test('required real API cases cannot be skipped',()=>assert.fail('Required configured API cases cannot be skipped outside CI'));
  } else console.log('SKIP: durable configured API/coverage cases require CI; local named-file baseline is separately explicit');
  // Multi-project, timeout/retry and authored outer-cancellation recovery are
  // separate controls; combined coverage is not their acceptance evidence.
}
