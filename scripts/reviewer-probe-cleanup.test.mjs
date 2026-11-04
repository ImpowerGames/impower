import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {testScratch} from './review-job-root.mjs';
import {removeProbeCheckouts,cleanupFromJournal} from './reviewer-probe-cleanup.mjs';

const scratch=testScratch('probe-cleanup',process.cwd());
console.log(`Scratch repository: ${scratch}`);
execFileSync('git',['init','--quiet',scratch],{windowsHide:true});
const reservationRoot=path.join(scratch,'reservations');
fs.mkdirSync(reservationRoot);
const directory=path.join(scratch,'reviewer');
if(!process.argv.includes('--settled-only')){
fs.mkdirSync(path.join(directory,'probe','.git'),{recursive:true});
fs.writeFileSync(path.join(directory,'probe','file'),'proof');
const original=fs.unlinkSync;
let refused=false;
fs.unlinkSync=target=>{
  if(path.basename(target)==='file'&&!refused){refused=true;throw Object.assign(new Error('temporary handle'),{code:'EBUSY'});}
  return original(target);
};
try{assert.doesNotThrow(()=>assert.equal(removeProbeCheckouts(directory,{reservationRoot,retryDelays:[0,0]}).files,1),'a transient EBUSY must be retried');}
finally{fs.unlinkSync=original;}
assert.equal(refused,true);
assert.deepEqual(fs.readdirSync(directory),[]);
console.log('PASS: transient removal is retried without losing removed counts');
}

fs.mkdirSync(path.join(directory,'settled','.git'),{recursive:true});
const coordinator={pid:987654,start:'coordinator'},child={pid:987655,start:'child'};
const journal=path.join(scratch,'journal.jsonl');
const rows=[
  {event:'coordinator',processIdentity:coordinator},
  {event:'launching',index:0,role:'review',reviewerDirectory:directory,reviewerHad:[]},
  {event:'running',index:0,pid:child.pid},
  {event:'identified',index:0,childIdentity:child},
  {event:'confirmed-absent',index:0,childIdentity:child,childPid:child.pid,coordinatorIdentity:coordinator,verifiedAt:new Date().toISOString(),settledBy:'settle-launch'},
  {event:'blocked',settledBy:'settle-launch'}
];
fs.writeFileSync(journal,rows.map(row=>JSON.stringify(row)).join('\n')+'\n');
assert.doesNotThrow(()=>assert.equal(cleanupFromJournal(journal,{reservationRoot,identifyProcess:()=>null}).length,1),'a settled launch with verified identities must be accepted');
assert.deepEqual(fs.readdirSync(directory),[]);
console.log('PASS: verified settled identities permit cleanup');

const writeRows=value=>fs.writeFileSync(journal,value.map(row=>JSON.stringify(row)).join('\n')+'\n');
fs.mkdirSync(path.join(directory,'protected','.git'),{recursive:true});
assert.throws(()=>cleanupFromJournal(journal,{reservationRoot,identifyProcess:pid=>pid===child.pid?child:null}),/running recorded identity/);
writeRows(rows.map(row=>row.event==='confirmed-absent'?{...row,childIdentity:null}:row));
assert.throws(()=>cleanupFromJournal(journal,{reservationRoot,identifyProcess:()=>null}),/verified settled identities/);
writeRows([...rows.slice(0,-1),{event:'execution-service',index:0,directory:path.join(scratch,'execution')},rows.at(-1)]);
assert.throws(()=>cleanupFromJournal(journal,{reservationRoot,identifyProcess:()=>null}),/execution drain/);
assert.ok(fs.existsSync(path.join(directory,'protected')));
writeRows(rows);
const external=path.join(scratch,'external');
fs.mkdirSync(external);fs.writeFileSync(path.join(external,'keep'),'external proof');
fs.symlinkSync(external,path.join(directory,'protected','outside'),process.platform==='win32'?'junction':'dir');
fs.mkdirSync(path.join(directory,'evidence'));fs.writeFileSync(path.join(directory,'evidence','proof.txt'),'named proof');
cleanupFromJournal(journal,{reservationRoot,identifyProcess:()=>null});
assert.equal(fs.readFileSync(path.join(external,'keep'),'utf8'),'external proof');
assert.equal(fs.readFileSync(path.join(directory,'evidence','proof.txt'),'utf8'),'named proof');
console.log('PASS: live, malformed and undrained launches refuse; external targets and named evidence survive');

const unicode=path.join(directory,'unicode-probe','snow ☃');
fs.mkdirSync(path.join(directory,'unicode-probe','.git'),{recursive:true});
fs.mkdirSync(unicode);fs.writeFileSync(path.join(unicode,'index.html'),'');
if(process.platform==='win32'){
  const compressed=execFileSync('compact.exe',['/c','index.html'],{cwd:unicode,encoding:'utf8',windowsHide:true});
  console.log(`Windows compression control: ${compressed.trim()}`);
  const attributes=execFileSync('powershell.exe',['-NoProfile','-NonInteractive','-Command',"(Get-Item -LiteralPath 'index.html').Attributes.ToString()"],{cwd:unicode,encoding:'utf8',windowsHide:true}).trim();
  if(!attributes.includes('Compressed'))console.log(`SKIP: compressed-attribute control unavailable (${attributes})`);
  else console.log('PASS: Windows residual fixture has the Compressed attribute');
}
const readdir=fs.readdirSync;
fs.readdirSync=(target,...args)=>path.basename(target)==='snow ☃'?[]:readdir(target,...args);
try{
  assert.throws(()=>removeProbeCheckouts(directory,{reservationRoot,retryDelays:[0,0]}),error=>/ENOTEMPTY/.test(error.message)&&/index.html/.test(error.message),'persistent residual names must be reported through the alternate directory API');
}finally{fs.readdirSync=readdir;}
assert.equal(fs.readFileSync(path.join(external,'keep'),'utf8'),'external proof');
assert.equal(removeProbeCheckouts(directory,{reservationRoot,retryDelays:[0,0]}).files,1);
console.log('PASS: persistent Unicode residual is named, preserved and recoverable');

for(const code of ['EPERM','ENOTEMPTY']){
  fs.mkdirSync(path.join(directory,'transient','.git'),{recursive:true});
  const rmdir=fs.rmdirSync;
  let attempts=0;
  fs.rmdirSync=target=>{if(path.basename(target)==='.git'&&attempts++===0)throw Object.assign(new Error('temporary directory handle'),{code});return rmdir(target);};
  try{assert.doesNotThrow(()=>removeProbeCheckouts(directory,{reservationRoot,retryDelays:[0,0]}));}
  finally{fs.rmdirSync=rmdir;}
  assert.equal(attempts,2);
}
console.log('PASS: transient EPERM and ENOTEMPTY directory removals retry within the bound');

for(const code of ['EPERM','EBUSY']){
  const probe=path.join(directory,'rename-probe');
  fs.mkdirSync(path.join(probe,'.git'),{recursive:true});
  fs.writeFileSync(path.join(probe,'proof'),'disposable');
  fs.symlinkSync(external,path.join(probe,'outside'),process.platform==='win32'?'junction':'dir');
  const rename=fs.renameSync,wait=Atomics.wait;
  let attempts=0,backoffs=0;
  fs.renameSync=(source,...args)=>{
    if(source===probe&&attempts++===0)throw Object.assign(new Error('temporary staging handle'),{code});
    return rename(source,...args);
  };
  Atomics.wait=(...args)=>{assert.equal(fs.existsSync(path.join(reservationRoot,'guard.json')),false,'staging backoff must release the reservation guard');backoffs++;return wait(...args);};
  try{assert.doesNotThrow(()=>assert.equal(removeProbeCheckouts(directory,{reservationRoot,retryDelays:[0,0]}).links,1),'transient staging rename must be retried');}
  finally{fs.renameSync=rename;Atomics.wait=wait;}
  assert.equal(attempts,2);assert.equal(backoffs,1);
  assert.equal(fs.existsSync(probe),false);
  assert.equal(fs.readFileSync(path.join(external,'keep'),'utf8'),'external proof');
}
console.log('PASS: transient staging rename retries release the guard and preserve external targets');

{
  const probe=path.join(directory,'retry-reservation'),reservation=path.join(reservationRoot,'reservation.json');
  fs.mkdirSync(path.join(probe,'.git'),{recursive:true});
  fs.writeFileSync(path.join(probe,'proof'),'reserved');
  const rename=fs.renameSync,wait=Atomics.wait;
  let attempts=0;
  fs.renameSync=(source,...args)=>{if(source===probe){attempts++;throw Object.assign(new Error('temporary staging handle'),{code:'EBUSY'});}return rename(source,...args);};
  Atomics.wait=(...args)=>{
    assert.equal(fs.existsSync(path.join(reservationRoot,'guard.json')),false);
    fs.writeFileSync(reservation,JSON.stringify({path:probe}));
    return wait(...args);
  };
  try{assert.equal(removeProbeCheckouts(directory,{reservationRoot,retryDelays:[0,0]}).skipped,true,'each retry must recheck newly admitted reservations');}
  finally{fs.renameSync=rename;Atomics.wait=wait;fs.unlinkSync(reservation);}
  assert.equal(attempts,1);
  assert.equal(fs.readFileSync(path.join(probe,'proof'),'utf8'),'reserved');
  removeProbeCheckouts(directory,{reservationRoot,retryDelays:[0,0]});
}
console.log('PASS: a reservation admitted during staging backoff preserves the pending probe');

if(!process.argv.includes('--parent-recovery-only'))for(const code of ['EPERM','EBUSY','ENOTEMPTY']){
  const outer=path.join(directory,'nested-wrapper'),inner=path.join(outer,'inner');
  fs.mkdirSync(path.join(inner,'probe','.git'),{recursive:true});
  const rmdir=fs.rmdirSync,wait=Atomics.wait;let attempts=0;
  fs.rmdirSync=target=>{if(target===inner&&attempts++===0)throw Object.assign(new Error('temporary parent handle'),{code});return rmdir(target);};
  Atomics.wait=(...args)=>{assert.equal(fs.existsSync(path.join(reservationRoot,'guard.json')),false,'parent backoff releases guard');return wait(...args);};
  try{assert.doesNotThrow(()=>removeProbeCheckouts(directory,{reservationRoot,retryDelays:[0,0]}),'transient empty-parent removal must retry');}
  finally{fs.rmdirSync=rmdir;Atomics.wait=wait;}
  assert.equal(attempts,2);assert.equal(fs.existsSync(outer),false,'retry also prunes newly empty ancestors');
}

{
  const wrapper=path.join(directory,'recovery-wrapper');
  fs.mkdirSync(path.join(wrapper,'probe','.git'),{recursive:true});
  const rmdir=fs.rmdirSync;let failure,attempts=0;
  fs.rmdirSync=target=>{if(target===wrapper){attempts++;throw Object.assign(new Error('persistent parent handle'),{code:'EBUSY'});}return rmdir(target);};
  try{assert.throws(()=>removeProbeCheckouts(directory,{reservationRoot,retryDelays:[0,0]}),error=>{failure=error.message;return /could not remove/.test(failure);});}
  finally{fs.rmdirSync=rmdir;}
  removeProbeCheckouts(directory,{reservationRoot,retryDelays:[0,0]});
  assert.equal(fs.existsSync(wrapper),false,'targetless recovery must prune the emptied parent');
  assert.equal(attempts,3);assert.ok(failure.includes(wrapper),'exhausted parent removal names the actual path');
}

{
  const wrapper=path.join(directory,'reserved-empty'),preexisting=path.join(directory,'preexisting-empty'),reservation=path.join(reservationRoot,'reservation.json');
  fs.mkdirSync(wrapper);fs.mkdirSync(preexisting);
  fs.writeFileSync(reservation,JSON.stringify({path:wrapper}));
  const preserve=new Set(['evidence','preexisting-empty']);
  try{assert.equal(removeProbeCheckouts(directory,{reservationRoot,preserve}).skipped,true,'targetless pruning must check reservations');}
  finally{fs.unlinkSync(reservation);}
  assert.ok(fs.existsSync(wrapper));
  removeProbeCheckouts(directory,{reservationRoot,preserve});
  assert.equal(fs.existsSync(wrapper),false);assert.ok(fs.existsSync(preexisting));
  fs.rmdirSync(preexisting);
}
console.log('PASS: empty parents retry with guard release, retain named residue, recover without targets and preserve reservations/prelaunch entries');

{
  const wrapper=path.join(directory,'parent-backoff'),reservation=path.join(reservationRoot,'reservation.json');
  fs.mkdirSync(path.join(wrapper,'probe','.git'),{recursive:true});
  fs.writeFileSync(path.join(wrapper,'probe','proof'),'staged proof');
  const rmdir=fs.rmdirSync,wait=Atomics.wait;
  fs.rmdirSync=target=>{if(target===wrapper)throw Object.assign(new Error('temporary parent handle'),{code:'EBUSY'});return rmdir(target);};
  Atomics.wait=(...args)=>{assert.equal(fs.existsSync(path.join(reservationRoot,'guard.json')),false);fs.writeFileSync(reservation,JSON.stringify({path:wrapper}));return wait(...args);};
  try{assert.equal(removeProbeCheckouts(directory,{reservationRoot,retryDelays:[0,0]}).skipped,true,'parent retries must recheck newly admitted reservations');}
  finally{fs.rmdirSync=rmdir;Atomics.wait=wait;fs.unlinkSync(reservation);}
  const trash=fs.readdirSync(directory).find(name=>name.startsWith('.probe-cleanup-'));
  assert.equal(fs.readFileSync(path.join(directory,trash,'0','proof'),'utf8'),'staged proof');
  assert.ok(fs.existsSync(wrapper));
  assert.equal(removeProbeCheckouts(directory,{reservationRoot,retryDelays:[0,0]}).files,1);
  assert.equal(fs.existsSync(wrapper),false);
}
console.log('PASS: parent backoff rechecks reservations and retains staged proof until supported recovery');

{
  const permanent=path.join(directory,'a-permanent-parent'),transient=path.join(directory,'b-transient-parent');
  fs.mkdirSync(permanent);fs.mkdirSync(transient);
  const rmdir=fs.rmdirSync;let permanentAttempts=0,transientAttempts=0,failure;
  fs.rmdirSync=target=>{
    if(target===permanent&&permanentAttempts++===0)throw Object.assign(new Error('permanent refusal'),{code:'EACCES'});
    if(target===transient&&transientAttempts++===0)throw Object.assign(new Error('temporary refusal'),{code:'EBUSY'});
    return rmdir(target);
  };
  try{assert.throws(()=>removeProbeCheckouts(directory,{reservationRoot,retryDelays:[0,0]}),error=>{failure=error.message;return failure.includes(permanent);});}
  finally{fs.rmdirSync=rmdir;}
  assert.equal(fs.existsSync(permanent),true,'permanent parent refusal must remain preserved when a sibling retries');
  assert.equal(permanentAttempts,1);assert.equal(transientAttempts,2);assert.equal(fs.existsSync(transient),false);
  removeProbeCheckouts(directory,{reservationRoot,retryDelays:[0,0]});
  assert.equal(fs.existsSync(permanent),false);
}
console.log('PASS: permanent parent failures are not replayed by sibling retries or left as stale diagnostics');

fs.mkdirSync(path.join(directory,'contended','.git'),{recursive:true});
const guard=path.join(reservationRoot,'guard.json');
fs.writeFileSync(guard,JSON.stringify({owner:coordinator}));
const began=Date.now();
try{
  assert.throws(()=>removeProbeCheckouts(directory,{reservationRoot}),error=>{
    assert.ok(error.message.includes(`recorded guard owner PID ${coordinator.pid}, start ${coordinator.start}`));
    assert.ok(error.message.includes(directory),'guard refusal must name the preserved reviewer directory');
    assert.ok(error.message.includes('removed 0 files and 0 links'));
    return true;
  });
}finally{fs.unlinkSync(guard);}
assert.ok(Date.now()-began>=4900,'existing reservation guard contention waits within its bound');
assert.ok(fs.existsSync(path.join(directory,'contended','.git')),'exhausted contention removes nothing');
removeProbeCheckouts(directory,{reservationRoot});
console.log('PASS: exhausted reservation contention names its recorded owner and preserves probes');

for(const [record,state] of [['{}','recorded guard owner PID unknown, start unknown'],['{','guard owner unavailable']]){
  const probe=path.join(directory,'unknown-guard');
  fs.mkdirSync(path.join(probe,'.git'),{recursive:true});
  fs.writeFileSync(path.join(probe,'proof'),'retained');
  fs.writeFileSync(guard,record);
  try{
    assert.throws(()=>removeProbeCheckouts(directory,{reservationRoot}),error=>{
      assert.ok(error.message.includes(guard));
      assert.ok(error.message.includes(state));
      assert.ok(error.message.includes(directory));
      assert.ok(error.message.includes('removed 0 files and 0 links'));
      return true;
    });
    assert.equal(fs.readFileSync(guard,'utf8'),record);
    assert.equal(fs.readFileSync(path.join(probe,'proof'),'utf8'),'retained');
  }finally{fs.unlinkSync(guard);}
  removeProbeCheckouts(directory,{reservationRoot});
}
console.log('PASS: unknown and unreadable guard owners name preserved scratch without removing guard or probe evidence');
