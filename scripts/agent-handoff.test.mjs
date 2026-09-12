import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync, spawn } from "node:child_process";
import { pathToFileURL } from "node:url";
import { runHandoff as handoff, checkReviewRound } from "./agent-handoff.mjs";
import { reserveReviewerSlot, releaseReviewerSlot, recoverReviewerSlot, processIdentity, reviewerSlotStatus } from "./reviewer-slots.mjs";

const scratch = fs.mkdtempSync(path.join(os.tmpdir(), "impower-handoff-"));
console.log(`Scratch repository: ${scratch}`);
const runHandoff = (file) => handoff(file, {slotRoot:path.join(scratch,"serial-slots")});
const worktree = path.join(scratch, "repo");
fs.mkdirSync(worktree);
const git = (...args) => execFileSync("git", args, { cwd: worktree, encoding: "utf8", env: { ...process.env, GIT_AUTHOR_NAME: "test", GIT_AUTHOR_EMAIL: "test@example.invalid", GIT_COMMITTER_NAME: "test", GIT_COMMITTER_EMAIL: "test@example.invalid" } });
git("init");
git("commit", "--allow-empty", "-m", "fixture");
const child = path.join(scratch, "child.mjs");
fs.writeFileSync(child, `import fs from "node:fs"; let p=""; for await (const chunk of process.stdin) p+=chunk; const file=/Write (.*?) with the editor tool/.exec(p)[1]; const head=/reviewed head=([a-f0-9]+)/.exec(p)[1]; fs.writeFileSync(file, JSON.stringify({head,next:process.argv[2]==="first"?"second":null,commentIds:[],summary:"complete"}));`);
const prompt = path.join(scratch, "prompt.txt");
fs.writeFileSync(prompt, "test fixture");
const config = { worktree, completedReviewRound: 0, writer: "writer-test", reviewer: "reviewer-test", maxSteps: 2, first: "first", journal: path.join(scratch, "journal.jsonl"), steps: {
  first: { role: "implement", model: "writer-test", executable: process.execPath, args: [child, "first", "--model", "writer-test"], prompt, next: ["second"] },
  second: { role: "implement", model: "writer-test", executable: process.execPath, args: [child, "second", "--model", "writer-test"], prompt, next: [null] },
}};
const file = path.join(scratch, "plan.json");
const write = () => fs.writeFileSync(file, JSON.stringify(config));
write(); await runHandoff(file);
const rows = fs.readFileSync(config.journal, "utf8").trim().split("\n").map(JSON.parse);
assert.equal(rows.at(-1).event, "finished");
assert.ok(rows.findIndex((r) => r.event === "exited") < rows.findIndex((r) => r.index === 1), "second child must launch after first exits");
await assert.rejects(runHandoff(file), /Journal exists/);
config.journal = path.join(scratch, "second.jsonl");
config.steps.first.next = [null];
write(); await assert.rejects(runHandoff(file), /Undeclared transition/);
config.journal = path.join(scratch, "third.jsonl");
config.writer = config.reviewer;
write(); await assert.rejects(runHandoff(file), /distinct/);
config.writer = "writer-test";
const lock = git("rev-parse", "--path-format=absolute", "--git-path", "agent-handoff.lock").trim();
fs.writeFileSync(lock, "active coordinator");
write(); await assert.rejects(runHandoff(file), /EEXIST/);
fs.unlinkSync(lock);
config.journal = path.join(scratch, "invalid\0journal.jsonl");
write(); await assert.rejects(runHandoff(file));
assert.equal(fs.existsSync(lock), false, "journal initialization failure must release the acquired lock");
config.journal = path.join(scratch, "recovered.jsonl");
config.steps.first.next = ["second"];
write(); await runHandoff(file);
config.journal = path.join(scratch, "review.jsonl");
config.steps.first.role = "review";
config.steps.first.round = 1;
config.steps.first.model = "reviewer-test";
config.steps.first.args = [child, "first", "--model", "reviewer-test"];
config.steps.first.next = ["second"];
write(); await assert.rejects(runHandoff(file), /posted comment IDs/);
assert.doesNotThrow(() => checkReviewRound(4, 3, false), "round 3 corrections get a narrow round 4");
assert.doesNotThrow(() => checkReviewRound(4, 4, false), "serial lenses share a round");
assert.throws(() => checkReviewRound(5, 4, false), /1..4/);
assert.throws(() => checkReviewRound(4, 4, true), /risk assessment/);
assert.throws(() => checkReviewRound(1, 3, false), /preserve/);
assert.throws(() => checkReviewRound(4, 1, false), /skip/);
config.journal = path.join(scratch, "round-four.jsonl");
config.completedReviewRound = 4;
config.finalCorrections = true;
config.steps.first.round = 4;
write(); await assert.rejects(runHandoff(file), /risk assessment/);
assert.ok(!fs.readFileSync(config.journal, "utf8").includes('"event":"launching"'), "recovery after round 4 must stop before spawning");
config.journal = path.join(scratch, "pending-fourth-lens.jsonl");
config.finalCorrections = false;
write(); await assert.rejects(runHandoff(file), /posted comment IDs/, "a pending fourth-round lens must launch before its fixture's empty report is rejected");
assert.ok(fs.readFileSync(config.journal, "utf8").includes('"event":"launching"'));
config.journal = path.join(scratch, "missing-recovery-state.jsonl");
delete config.finalCorrections;
write(); await assert.rejects(runHandoff(file), /finalCorrections/);
assert.equal(fs.existsSync(config.journal), false);
config.completedReviewRound = 0;
config.steps.first.role = "implement";
config.steps.first.model = "writer-test";
config.steps.first.args = [child, "first", "--model", "writer-test"];
config.steps.second.role = "review";
config.steps.second.model = "reviewer-test";
config.steps.second.args = [child, "second", "--model", "reviewer-test"];
for (const badRound of [undefined, "4", 5]) {
  config.journal = path.join(scratch, `invalid-round-${badRound}.jsonl`);
  config.steps.second.round = badRound;
  write(); await assert.rejects(runHandoff(file), /round must be 1..4/);
  assert.equal(fs.existsSync(config.journal), false, "invalid future review must fail before an implementation launch");
}
console.log("PASS: sequential completion, replay refusal, distinct routes, declared transitions, coordinator lock and missing-review refusal");

// Independent coordinators in distinct repositories race for one machine pool.
const pool = path.join(scratch, "machine-slots");
const release = path.join(scratch, "release-reviewers");
const reviewer = path.join(scratch, "holding-reviewer.mjs");
fs.writeFileSync(reviewer, `import fs from 'node:fs'; fs.writeFileSync(process.argv[2], 'review posted'); setTimeout(()=>process.exit(2),60000).unref(); const timer=setInterval(()=>{if(fs.existsSync(process.argv[3])){clearInterval(timer);process.exit(0)}},25);`);
const coordinator = path.join(scratch, "coordinator.mjs");
fs.writeFileSync(coordinator, `import {runHandoff} from ${JSON.stringify(pathToFileURL(path.resolve("scripts/agent-handoff.mjs")).href)}; runHandoff(process.argv[2], {slotRoot:process.argv[3],identifyProcess:process.argv[4]==='uncertain'?()=>{throw new Error('fixture registration failure')}:undefined}).catch(e=>{console.error(e.message);process.exitCode=1});`);
const launched = [];
const launch = (i) => {
  const repo = path.join(scratch, `concurrent-repo-${i}`);
  execFileSync("git", ["clone", "--quiet", worktree, repo]);
  const plan = path.join(scratch, `concurrent-${i}.json`);
  const posted = path.join(scratch, `posted-${i}`);
  fs.writeFileSync(plan, JSON.stringify({worktree:repo, writer:"writer-test", reviewer:"reviewer-test", completedReviewRound:0, maxSteps:1, first:"review", journal:path.join(scratch,`concurrent-${i}.jsonl`), steps:{review:{role:"review",round:1,model:"reviewer-test",executable:process.execPath,args:[reviewer,posted,release,"--model","reviewer-test"],prompt,next:[null]}}}));
  const proc = spawn(process.execPath, [coordinator, plan, pool, i===0?"uncertain":"recorded"], {windowsHide:true,stdio:["ignore","pipe","pipe"]});
  let output=""; proc.stdout.on("data",c=>output+=c); proc.stderr.on("data",c=>output+=c);
  const done = new Promise(resolve=>proc.once("close",code=>resolve({code,output})));
  const item={proc,done,posted}; launched.push(item); return item;
};
const bounded = (promise) => new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error("Fixture process did not exit within 60 seconds")),60000);promise.then(value=>{clearTimeout(timer);resolve(value);},error=>{clearTimeout(timer);reject(error);});});
const until = async (predicate) => { const end=Date.now()+60000; while(!predicate()){ if(Date.now()>end)throw new Error("Timed out waiting for fixture"); await new Promise(r=>setTimeout(r,25)); } };
try {
  for(let i=0;i<4;i++)launch(i);
  await until(()=>launched.every(p=>fs.existsSync(p.posted)));
  const fifth=launch(4);
  await until(()=>fs.existsSync(fifth.posted)||fifth.proc.exitCode!==null);
  assert.equal(fs.existsSync(fifth.posted),false,"a fifth reviewer must not launch while four posted reviewers are still running");
  assert.match((await bounded(fifth.done)).output,/reviewer slots.*unavailable/i);
  assert.match(fs.readFileSync(path.join(scratch,"concurrent-0.jsonl"),"utf8"),/identity-uncertain/,"a real post-spawn registration failure must retain capacity while its child runs");
  const identified=fs.readFileSync(path.join(scratch,"concurrent-1.jsonl"),"utf8").trim().split("\n").map(JSON.parse).find(row=>row.event==="identified");
  assert.ok(identified.childIdentity.start,"actual OS start identity remains in the journal after slot release");
} finally {
  fs.writeFileSync(release,"exit");
  try { await bounded(Promise.all(launched.map(p=>p.done))); }
  catch(error) { for(const item of launched)if(item.proc.exitCode===null)item.proc.kill("SIGKILL"); await bounded(Promise.all(launched.map(p=>p.done)));throw error; }
}
console.log("PASS: real concurrent coordinators reject a fifth reviewer after four reports appear and before process exit");
assert.equal(fs.readdirSync(pool).length,0,"confirmed exits release every reservation");
fs.unlinkSync(release);
const contenders=[];
try {
  for(let i=10;i<18;i++)contenders.push(launch(i));
  await until(()=>contenders.every(item=>fs.existsSync(item.posted)||item.proc.exitCode!==null));
  assert.equal(contenders.filter(item=>fs.existsSync(item.posted)).length,4,"eight racing coordinators acquire exactly four slots");
} finally {
  fs.writeFileSync(release,"exit");
  try { await bounded(Promise.all(contenders.map(item=>item.done))); }
  catch(error) {for(const item of contenders)if(item.proc.exitCode===null)item.proc.kill("SIGKILL");await bounded(Promise.all(contenders.map(item=>item.done)));throw error;}
}
assert.equal(fs.readdirSync(pool).length,0);
console.log("PASS: eight simultaneous coordinators reserve exactly four slots and release them on exit");

const slotWorker=path.join(scratch,"slot-worker.mjs");
fs.writeFileSync(slotWorker,`import fs from 'node:fs'; import {spawn} from 'node:child_process'; import {reserveReviewerSlot,releaseReviewerSlot,processIdentity} from ${JSON.stringify(pathToFileURL(path.resolve("scripts/reviewer-slots.mjs")).href)}; const slot=reserveReviewerSlot(process.argv[2]);slot.append({phase:'launching'}); const child=spawn(process.execPath,[${JSON.stringify(reviewer)},process.argv[3]+'.posted',process.argv[3]+'.release'],{stdio:'ignore',windowsHide:true,detached:true});child.once('close',()=>releaseReviewerSlot(slot)); const identity=processIdentity(child.pid);if(process.argv[4]!=='uncertain')slot.append({phase:'running',child:identity});fs.writeFileSync(process.argv[3],JSON.stringify({file:slot.file,child:identity}));`);
for(const mode of ["recorded","uncertain"]){
  const ready=path.join(scratch,`interrupted-${mode}`);
  const worker=spawn(process.execPath,[slotWorker,path.join(scratch,`pool-${mode}`),ready,mode],{stdio:"ignore",windowsHide:true});
  const done=new Promise(resolve=>worker.once("close",resolve));
  let state;
  try {
    await until(()=>fs.existsSync(ready));
    state=JSON.parse(fs.readFileSync(ready,"utf8"));
    await until(()=>fs.existsSync(ready+".posted"));
    assert.deepEqual(processIdentity(state.child.pid),state.child);
    assert.throws(()=>recoverReviewerSlot(state.file),/Coordinator still running/);
    worker.kill(); await bounded(done);
    assert.throws(()=>recoverReviewerSlot(state.file),mode==="recorded"?/Reviewer still running/:/Uncertain reviewer launch/);
  } finally {
    fs.writeFileSync(ready+".release","exit");
    if(worker.exitCode===null)worker.kill();
    await bounded(done);
    if(state)await until(()=>processIdentity(state.child.pid)===null);
  }
  if(mode==="recorded")assert.equal(recoverReviewerSlot(state.file).recovered,state.file);
  else assert.throws(()=>recoverReviewerSlot(state.file),/Uncertain reviewer launch/,"an interrupted spawn-registration gap remains occupied even after a probe says its child exited");
}
const isolated=path.join(scratch,"ownership-slots");
const owned=reserveReviewerSlot(isolated);
const original=fs.readFileSync(owned.file,"utf8");
fs.writeFileSync(owned.file,original.replace(owned.token,"different-generation"));
assert.throws(()=>releaseReviewerSlot(owned),/ownership changed/);
assert.ok(fs.existsSync(owned.file),"release cannot delete a replacement generation");
fs.writeFileSync(owned.file,original);
releaseReviewerSlot(owned);
const reused=reserveReviewerSlot(isolated);
const reusedRecord=JSON.parse(fs.readFileSync(reused.file,"utf8"));
reused.close();
reusedRecord.owner.start+="-older-process";
fs.writeFileSync(reused.file,JSON.stringify(reusedRecord)+"\n"+JSON.stringify({token:reused.token,phase:"running",child:{...reusedRecord.owner}})+"\n");
const recoveryWorker=path.join(scratch,"recover-slot.mjs");
fs.writeFileSync(recoveryWorker,`import {recoverReviewerSlot} from ${JSON.stringify(pathToFileURL(path.resolve("scripts/reviewer-slots.mjs")).href)}; try{if(recoverReviewerSlot(process.argv[2]).alreadyAbsent)process.exitCode=2;}catch(e){console.error(e.message);process.exitCode=1}`);
const recoveries=[0,1].map(()=>new Promise(resolve=>{
  const child=spawn(process.execPath,[recoveryWorker,reused.file],{stdio:"ignore",windowsHide:true});
  child.once("close",resolve);
}));
const recoveryResults=await bounded(Promise.all(recoveries));
assert.equal(recoveryResults.filter(code=>code===0).length,1,"racing recoveries remove one dead generation exactly once, using OS start identity to distinguish PID reuse");
assert.ok(recoveryResults.every(code=>[0,1,2].includes(code)));
assert.equal(recoverReviewerSlot(reused.file).alreadyAbsent,reused.file,"an already-released reservation is absence, not corruption");
const openSync=fs.openSync;
try{
  fs.openSync=(target,...args)=>{if(target===reused.file+".recovery")throw new Error("an absent slot must not create a recovery marker");return openSync(target,...args);};
  assert.equal(recoverReviewerSlot(reused.file).alreadyAbsent,reused.file);
}finally{fs.openSync=openSync;}
const neverCreated=path.join(scratch,"never-created-store","slot-0.jsonl");
assert.equal(recoverReviewerSlot(neverCreated).alreadyAbsent,neverCreated);
const replacement=reserveReviewerSlot(isolated);
assert.throws(()=>recoverReviewerSlot(replacement.file),/Coordinator still running/);
releaseReviewerSlot(replacement);
const ambiguous=reserveReviewerSlot(isolated); ambiguous.close();
fs.appendFileSync(ambiguous.file,'{"partial":');
assert.throws(()=>recoverReviewerSlot(ambiguous.file));
assert.ok(fs.existsSync(ambiguous.file),"partial records are retained");
assert.throws(()=>recoverReviewerSlot(ambiguous.file),/Uncertain slot record/);
const empty=path.join(isolated,"slot-2.jsonl");fs.writeFileSync(empty,"");
assert.throws(()=>recoverReviewerSlot(empty),/Uncertain slot record.*preserve/);
const marker=path.join(isolated,"slot-3.jsonl.recovery");
fs.writeFileSync(marker,JSON.stringify({owner:processIdentity(process.pid),token:"fixture-marker"}));
assert.throws(()=>recoverReviewerSlot(marker.slice(0,-9)),/Recovery marker already exists/);
assert.equal(reviewerSlotStatus(isolated)[3].recovery.records[0].token,"fixture-marker");
console.log("PASS: interrupted coordinator retains live children, uncertain registration fails closed, PID reuse and generation-safe release");

config.steps.second.role="implement";config.steps.second.model="writer-test";config.steps.second.args=[child,"second","--model","writer-test"];
config.steps.first.role="review";config.steps.first.round=1;config.steps.first.model="reviewer-test";config.steps.first.next=[null];
config.steps.first.args=["-e","process.exit(0)","--","--model","reviewer-test"];
config.journal=path.join(scratch,"fast-exit.jsonl");write();
await assert.rejects(handoff(file,{slotRoot:path.join(scratch,"fast-slots"),identifyProcess:(pid)=>{
  const end=Date.now()+10000;while(processIdentity(pid)!==null){if(Date.now()>end)throw new Error("fast child did not exit");Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0,10);}return null;
}}),/ENOENT/);
assert.match(fs.readFileSync(config.journal,"utf8"),/confirmed-absent/);
assert.equal(fs.readdirSync(path.join(scratch,"fast-slots")).length,0);
config.steps.first.args=["-e","setTimeout(()=>process.exit(2),60000).unref();process.stdin.resume()","--","--model","reviewer-test"];
config.journal=path.join(scratch,"journal-failure.jsonl");write();
let ownedPid;
const writeSync=fs.writeSync;
try {
  fs.writeSync=(fd,data,...args)=>{if(typeof data==="string" && data.includes('"event":"running"')){ownedPid=JSON.parse(data).pid;throw new Error("injected post-spawn journal failure");}return writeSync(fd,data,...args);};
  await assert.rejects(handoff(file,{slotRoot:path.join(scratch,"failure-slots")}),/injected post-spawn journal failure/);
} finally {fs.writeSync=writeSync;}
assert.equal(processIdentity(ownedPid),null,"a journal failure cannot leave a child awaiting its prompt");
assert.equal(fs.readdirSync(path.join(scratch,"failure-slots")).length,0,"confirmed termination releases its reservation");
assert.equal(fs.existsSync(lock),false,"confirmed child close releases the worktree lock");
console.log("PASS: confirmed-absent children, marker diagnostics, and actual post-spawn journal failure cleanup");

const failureWorker=path.join(scratch,"failure-worker.mjs");
fs.writeFileSync(failureWorker,`import fs from 'node:fs';import cp,{ChildProcess} from 'node:child_process';import {syncBuiltinESMExports} from 'node:module';import {runHandoff} from ${JSON.stringify(pathToFileURL(path.resolve("scripts/agent-handoff.mjs")).href)}; const realWrite=fs.writeSync;let failing=false;fs.writeSync=(fd,data,...args)=>{if(typeof data==='string'&&data.includes('"event":"running"')){failing=true;throw new Error('primary journal failure')}if(failing&&process.argv[4]==='combined')throw new Error('secondary storage failure');return realWrite(fd,data,...args)};if(process.argv[4]==='retained'){const spawn=cp.spawn;cp.spawn=(exe,args,options)=>spawn(exe,args,{...options,detached:true});syncBuiltinESMExports();ChildProcess.prototype.kill=function(){this.emit('error',new Error('fixture signal-delivery failure'));return false;};}runHandoff(process.argv[2],{slotRoot:process.argv[3]}).catch(error=>{console.error(error.message);process.exitCode=1});`);
for(const mode of ["combined","retained"]){
  const repo=path.join(scratch,`failure-repo-${mode}`);execFileSync("git",["clone","--quiet",worktree,repo]);
  const taskRelease=path.join(scratch,`failure-${mode}.release`);
  const taskPlan=path.join(scratch,`failure-${mode}.json`);
  const taskPool=path.join(scratch,`failure-${mode}-slots`);
  fs.writeFileSync(taskPlan,JSON.stringify({...config,worktree:repo,journal:path.join(scratch,`failure-${mode}.jsonl`),steps:{review:{...config.steps.first,args:[reviewer,path.join(scratch,`failure-${mode}.posted`),taskRelease,"--model","reviewer-test"]}},first:"review"}));
  const started=Date.now();
  const proc=spawn(process.execPath,[failureWorker,taskPlan,taskPool,mode],{windowsHide:true,stdio:["ignore","pipe","pipe"]});
  let output="";proc.stdout.on("data",chunk=>output+=chunk);proc.stderr.on("data",chunk=>output+=chunk);
  const done=new Promise(resolve=>proc.once("close",resolve));
  let record;
  try {
    assert.equal(await bounded(done),1);
    assert.match(output,/primary journal failure/);
    const slotFile=path.join(taskPool,"slot-0.jsonl");
    const rows=fs.readFileSync(slotFile,"utf8").trim().split("\n").map(JSON.parse);
    record=rows.find(row=>row.phase==="running");
    assert.ok(record.child.start,"identity must survive a failure of every later durable write");
    if(mode==="combined"){
      assert.match(output,/reservation retained at .*secondary storage failure/);
      assert.equal(processIdentity(record.child.pid),null);
      assert.equal(recoverReviewerSlot(slotFile).recovered,slotFile);
    }else{
      assert.match(output,/child exit unconfirmed/);
      assert.match(output,/fixture signal-delivery failure/);
      assert.ok(output.includes(slotFile),"retained-child diagnostics point directly to durable identity");
      assert.match(fs.readFileSync(path.join(scratch,`failure-${mode}.jsonl`),"utf8"),/fixture signal-delivery failure/);
      assert.ok(Date.now()-started<25000,"the coordinator returns after bounded cleanup while the controlled child remains alive");
      assert.deepEqual(processIdentity(record.child.pid),record.child);
      assert.ok(fs.existsSync(path.join(repo,".git","agent-handoff.lock")));
      assert.throws(()=>recoverReviewerSlot(slotFile),/Reviewer still running/);
    }
  } finally {
    fs.writeFileSync(taskRelease,"exit");
    await bounded(done);
    if(record)await until(()=>processIdentity(record.child.pid)===null);
  }
  if(mode==="retained")assert.equal(recoverReviewerSlot(path.join(taskPool,"slot-0.jsonl")).recovered,path.join(taskPool,"slot-0.jsonl"));
}
console.log("PASS: combined storage failure preserves primary diagnosis and recoverable identity; unconfirmed child detaches while ownership stays reserved");

const finishedRelease=path.join(scratch,"finished-release");
const finishedPool=path.join(scratch,"finished-slots");
config.journal=path.join(scratch,"finished-release-failure.jsonl");
config.steps.first.args=[reviewer,path.join(scratch,"finished.posted"),finishedRelease,"--model","reviewer-test"];write();
let finishedPid;
try{
  fs.writeSync=(fd,data,...args)=>{
    if(typeof data==="string"&&data.includes('"event":"running"')){finishedPid=JSON.parse(data).pid;fs.writeFileSync(finishedRelease,"exit");}
    if(typeof data==="string"&&data.includes('"phase":"exited"'))throw new Error("injected slot release failure");
    return writeSync(fd,data,...args);
  };
  await assert.rejects(handoff(file,{slotRoot:finishedPool}),/Child exit confirmed \(code 0\).*reservation retained at .*injected slot release failure.*validation has not run/);
}finally{fs.writeSync=writeSync;fs.writeFileSync(finishedRelease,"exit");}
assert.equal(processIdentity(finishedPid),null);
const finishedRows=fs.readFileSync(config.journal,"utf8").trim().split("\n").map(JSON.parse);
assert.ok(finishedRows.findIndex(row=>row.event==="exited")>=0);
assert.ok(finishedRows.findIndex(row=>row.event==="exited")<finishedRows.findIndex(row=>row.event==="blocked"));
assert.equal(finishedRows.some(row=>row.event==="completed"),false,"a bookkeeping failure cannot claim unvalidated completion");
assert.ok(fs.existsSync(path.join(finishedPool,"slot-0.jsonl")));
console.log("PASS: absent recovery creates no marker; successful child exit remains journalled when slot release blocks completion");
