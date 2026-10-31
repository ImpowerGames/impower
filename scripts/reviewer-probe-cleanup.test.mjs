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

fs.mkdirSync(path.join(directory,'contended','.git'),{recursive:true});
const guard=path.join(reservationRoot,'guard.json');
fs.writeFileSync(guard,JSON.stringify({owner:coordinator}));
const began=Date.now();
try{
  assert.throws(()=>removeProbeCheckouts(directory,{reservationRoot}),error=>error.message.includes(`recorded guard owner PID ${coordinator.pid}, start ${coordinator.start}`));
}finally{fs.unlinkSync(guard);}
assert.ok(Date.now()-began>=4900,'existing reservation guard contention waits within its bound');
assert.ok(fs.existsSync(path.join(directory,'contended','.git')),'exhausted contention removes nothing');
removeProbeCheckouts(directory,{reservationRoot});
console.log('PASS: exhausted reservation contention names its recorded owner and preserves probes');
