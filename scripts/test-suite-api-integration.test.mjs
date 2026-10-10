// agent-tooling-timeout-ms: 780000
// Local17-case matrix measured447.6s; allow150s for3CI-only durable cases
// plus182.4s margin. Other checks and per-operation budgets stay unchanged.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawn,execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {test} from 'node:test';
import {createHash,randomUUID} from 'node:crypto';
import {processIdentity} from './reviewer-slots.mjs';
import {runPrivateInstaller,verifyDependencies} from './fixtures/test-suite-vitest-dependencies.mjs';
import {createReceiptDescriptor,awaitReceiptDisposition,readDurableDisposition,readReceiptDisposition} from './test-suite-receipt.mjs';
import {startExecutionService} from './reviewer-execution.mjs';
import {requestExecution} from './reviewer-execution-client.mjs';
import {validateAggregateInputs} from './test-suite-aggregate.mjs';

const scratch=()=>fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(),'vitest-integration-control-')));
const terminalSummary=result=>result.stdout.split(/\r?\n/).flatMap(line=>{
  try{const value=JSON.parse(line);return value.evidence&&typeof value.exit==='number'?[value]:[]}catch{return []}
}).at(-1);
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
  if(record.runtime)for(const name of ['runtime.json','preparation-result.json','capability-result.json','capability-output.log'])
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
  } else console.log('SKIP: real Vitest 2.1.9 integration requires its separately admitted private dependency package');
} else {
  verifyDependencies(dependencies);
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
      const sourceRoot=path.dirname(runner),hashes=[];
      fs.mkdirSync(path.join(directory,'scripts'));
      for(const name of ['test-suite.mjs','test-suite-process.mjs','test-suite-identity.mjs','suite-engine.mjs','test-suite-aggregate.mjs','test-suite-child.mjs',
        'test-suite-child-windows.cs','test-suite-child-windows.ps1','test-suite-child-linux.py',
        'test-suite-receipt.mjs','reviewer-slots.mjs','detached-launch.mjs']) {
        const bytes=fs.readFileSync(path.join(sourceRoot,name)),target=path.join(directory,'scripts',name);
        fs.writeFileSync(target,bytes,{flag:'wx'});
        hashes.push({name,sha256:createHash('sha256').update(bytes).digest('hex')});
        assert.deepEqual(fs.readFileSync(target),bytes,'Scratch runner bytes match the source under test');
      }
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
        if(service)try{await service.close();}catch(error){if(!negative&&!originalFailure)throw error;}
        // Service close drains its retained original child before returning or
        // rejecting. Independently reconcile every actual launched operation.
        const admitted=fs.readdirSync(evidence).filter(name=>/-supervision-/.test(name)).map(name=>name.split('-supervision-')[0]);
        const outcomes=[positive,successor,negative].filter(Boolean);
        for(const id of admitted)if(!outcomes.some(result=>result.id===id)) {
          try {const result=JSON.parse(read(path.join(evidence,id+'.json'),'utf8'));if(result.id===id)outcomes.push(result);}catch{}
        }
        cleanupConfirmed=admitted.length>0&&outcomes.length===admitted.length
          &&admitted.every(id=>outcomes.filter(result=>result.id===id).length===1)
          &&outcomes.every(result=>nativeDisposition(result).confirmed);
        if(cleanupConfirmed)incompleteOwnership=null;
        fs.writeFileSync(path.join(evidence,'fixture-disposition.json'),JSON.stringify({cleanupConfirmed,admitted,originalFailure:originalFailure?.message,outcomes}));
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
      for(const kind of ['globalSetup','blob']) {
        const directory=realPackage('unsupported-'+kind,{}, {'src/one.test.ts':'one'});
        const setupMarker=path.join(directory,'.git','setup-ran');
        fs.writeFileSync(path.join(directory,'global-setup.ts'),'import fs from "node:fs";export default ()=>{fs.writeFileSync('+JSON.stringify(setupMarker)+',"ran")};');
        const config={test:{include:['src/**/*.test.ts'],...(kind==='blob'?{reporters:['blob']}:{globalSetup:['./global-setup.ts']})}};
        fs.writeFileSync(path.join(directory,'vitest.config.ts'),'export default '+JSON.stringify(config)+';');
        const result=await publicRunner(directory,['run',directory,'src/one.test.ts','--wait','30']);
        assert.equal(result.close.exit,1);
        assert.match(result.stdout+result.stderr,kind==='blob'?/configured BlobReporter/:/once-per-command globalSetup/);
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
      fs.writeFileSync(path.join(directory,'src','tasks.test.ts'),'import {it} from "vitest";for(let i=0;i<100;i++)it("task"+i,async()=>{await new Promise(resolve=>setTimeout(resolve,20))});');
      const result=await publicRunner(directory,['run',directory,'src/tasks.test.ts','--wait','30']);
      assert.equal(result.close.exit,0,result.stderr);
      const owned=result.disposition.record.attempts.find(row=>row.mode==='run-direct');
      const journal=JSON.parse(fs.readFileSync(path.join(owned.directory,'attempt.json'),'utf8'));
      assert.ok(journal.progress.sequence>=50,'Real native task batches exercised frequent event delivery');
      assert.ok(journal.progressPublications<journal.progress.sequence/5,'Shared progress persistence is coalesced');
      console.log('Actual task events '+journal.progress.sequence+'; shared progress publications '+journal.progressPublications);
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
      const result=await publicRunner(directory,['start',directory,'--wait','30']);
      assert.equal(result.close.exit,0,result.stderr);
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
