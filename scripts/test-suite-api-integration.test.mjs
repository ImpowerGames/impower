import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawn,execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {test} from 'node:test';
import {processIdentity} from './reviewer-slots.mjs';
import {runPrivateInstaller,verifyDependencies} from './fixtures/test-suite-vitest-dependencies.mjs';

const scratch=()=>fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(),'vitest-integration-control-')));
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
async function publicRunner(directory,argv) {
  assert.equal(incompleteOwnership,null,'A prior incomplete child blocks all later API launches');
  if(argv[0]==='start')assert.equal(process.env.CI,'true','Durable package proof is CI-only; local execution uses named public run');
  const began=Date.now();
  const child=spawn(process.execPath,[runner,...argv],{windowsHide:true,stdio:['ignore','pipe','pipe']});
  let stdout='',stderr='',launchError=null,outerCutoff=false;
  child.stdout.setEncoding('utf8');child.stderr.setEncoding('utf8');
  child.stdout.on('data',chunk=>{stdout+=chunk;});child.stderr.on('data',chunk=>{stderr+=chunk;});
  const completion=new Promise(resolve=>{
    child.once('error',error=>{launchError=error.message;});
    child.once('close',(exit,signal)=>resolve({exit,signal}));
  });
  const timer=setTimeout(()=>{outerCutoff=true;incompleteOwnership='Outer coordinator cutoff: owned tree unconfirmed';child.kill();},120000);
  const close=await completion;clearTimeout(timer);
  const result={argv,close,launchError,outerCutoff,elapsedMs:Date.now()-began};
  fs.writeFileSync(path.join(directory,'.git','public-run.stdout.log'),stdout);
  fs.writeFileSync(path.join(directory,'.git','public-run.stderr.log'),stderr);
  fs.writeFileSync(path.join(directory,'.git','public-run-result.json'),JSON.stringify(result));
  assert.equal(outerCutoff,false,'An outer cutoff is incomplete ownership evidence, never a real-API pass');
  assert.equal(launchError,null);
  assert.equal(close.signal,null);
  return {...result,stdout,stderr};
}
const markers=directory=>fs.existsSync(path.join(directory,'.git','markers.jsonl'))?fs.readFileSync(path.join(directory,'.git','markers.jsonl'),'utf8').trim().split('\n'):[];
if(!dependencies) {
  if(process.env.IMPOWER_REQUIRE_VITEST_INTEGRATION==='1') {
    test('required real API admission cannot be absent',()=>assert.fail('Required private Vitest integration admission is missing'));
  } else console.log('SKIP: real Vitest 2.1.9 integration requires its separately admitted private dependency package');
} else {
  verifyDependencies(dependencies);
  if(process.argv.includes('--baseline')) {
    test('baseline public named-file run cannot imply success when configuration excludes a requested file',{timeout:150000},async()=>{
      const directory=realPackage('excluded',{exclude:['src/excluded/**']},{'src/included.test.ts':'included','src/excluded/omitted.test.ts':'excluded'});
      const result=await publicRunner(directory,['run',directory,'src/included.test.ts','src/excluded/omitted.test.ts','--wait','30']);
      assert.deepEqual(markers(directory),['included'],'Configured exclude remains in force');
      assert.match(result.stdout,/Test Files\s+1 passed/);
      assert.equal(result.close.exit,1,'Mixed selected plus omitted request must fail coverage');
    });
    test('baseline public substring filter cannot execute an additional overlapping file',{timeout:150000},async()=>{
      const directory=realPackage('overlap',{}, {'src/short.test.ts':'requested','src/duplicate/src/short.test.ts':'overlap'});
      const result=await publicRunner(directory,['run',directory,'src/short.test.ts','--wait','30']);
      assert.equal(result.close.exit,0);
      assert.deepEqual(markers(directory),['requested'],'Only the requested physical file may execute');
    });
  }
  if(process.env.CI==='true') {
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
  // Direct exact/multi-project and timeout/retry proof waits for shared runner integration.
}
