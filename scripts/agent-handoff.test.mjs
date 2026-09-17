import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync, spawn } from "node:child_process";
import childProcess from "node:child_process";
import { syncBuiltinESMExports } from "node:module";
import { pathToFileURL } from "node:url";
import { runHandoff as handoff, checkReviewRound, verifyReviewComment } from "./agent-handoff.mjs";
import { reserveReviewerSlot, releaseReviewerSlot, recoverReviewerSlot, processIdentity, reviewerSlotStatus } from "./reviewer-slots.mjs";

const scratch = fs.mkdtempSync(path.join(os.tmpdir(), "impower-handoff-"));
console.log(`Scratch repository: ${scratch}`);
const runHandoff = (file) => handoff(file, {slotRoot:path.join(scratch,"serial-slots")});
const worktree = path.join(scratch, "repo");
fs.mkdirSync(worktree);
const git = (...args) => execFileSync("git", args, { cwd: worktree, encoding: "utf8", windowsHide: true, env: { ...process.env, GIT_AUTHOR_NAME: "test", GIT_AUTHOR_EMAIL: "test@example.invalid", GIT_COMMITTER_NAME: "test", GIT_COMMITTER_EMAIL: "test@example.invalid" } });
git("init");
git("commit", "--allow-empty", "-m", "fixture");
const child = path.join(scratch, "child.mjs");
fs.writeFileSync(child, `import fs from "node:fs"; let p=""; for await (const chunk of process.stdin) p+=chunk; const file=/Write (.*?) with the editor tool/.exec(p)[1]; const head=/reviewed head=([a-f0-9]+)/.exec(p)[1]; fs.writeFileSync(file, JSON.stringify({head,next:process.argv[2]==="first"?"second":null,commentIds:[],summary:"complete"}));`);
const prompt = path.join(scratch, "prompt.txt");
fs.writeFileSync(prompt, "test fixture");
const config = { worktree, completedReviewRound: 0, writer: "writer-test", writerEffort: "medium", reviewer: "reviewer-test", maxSteps: 2, first: "first", journal: path.join(scratch, "journal.jsonl"), steps: {
  first: { role: "implement", model: "writer-test", executable: process.execPath, args: [child, "first", "--model", "writer-test"], prompt, next: ["second"] },
  second: { role: "implement", model: "writer-test", executable: process.execPath, args: [child, "second", "--model", "writer-test"], prompt, next: [null] },
}};
const file = path.join(scratch, "plan.json");
const write = () => fs.writeFileSync(file, JSON.stringify(config));
let commentReads = 0, waits = 0;
await verifyReviewComment(1, 554, "a".repeat(40), worktree, {
  readComment: () => ++commentReads === 1 ? { issue_url: "https://api.github.com/repos/ImpowerGames/impower/issues/554", body: "pending" } : { issue_url: "https://api.github.com/repos/ImpowerGames/impower/issues/554", body: "a".repeat(40) },
  wait: async (ms) => { assert.equal(ms, 1000); waits++; },
});
assert.equal(commentReads, 2, "a transient comment mismatch must be read again");
assert.equal(waits, 1, "a transient comment mismatch waits before retrying");
await assert.rejects(verifyReviewComment(1, 554, "a".repeat(40), worktree, { readComment: () => ({ issue_url: "wrong", body: "wrong" }), wait: async () => {}, attempts: 2 }), /Comment does not verify/);
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
config.journal = path.join(scratch, "effort-qualified-same-route.jsonl");
config.writer = config.reviewer + "[medium]";
write(); await assert.rejects(runHandoff(file), /distinct/, "an effort suffix must not disguise the same configured route");
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
assert.doesNotThrow(() => checkReviewRound(3, 2, false), "round 3 remains available");
assert.doesNotThrow(() => checkReviewRound(3, 3, false), "serial lenses share a round");
assert.throws(() => checkReviewRound(4, 3, false), /1..3/, "round 4 must not launch automatically");
assert.doesNotThrow(() => checkReviewRound(4, 3, false, 4), "an explicitly authorized fourth round is available");
assert.throws(() => checkReviewRound(3, 3, true), /no automatic review/);
assert.throws(() => checkReviewRound(1, 3, false), /preserve/);
assert.throws(() => checkReviewRound(3, 1, false), /skip/);
config.journal = path.join(scratch, "final-corrections.jsonl");
config.completedReviewRound = 3;
config.reviewedHead = git("rev-parse", "HEAD").trim();
config.finalCorrections = true;
config.steps.first.round = 3;
write(); await assert.rejects(runHandoff(file), /no automatic review/);
assert.ok(!fs.readFileSync(config.journal, "utf8").includes('"event":"launching"'), "recovery after final corrections must stop before spawning");
config.journal = path.join(scratch, "missing-extended-authorization.jsonl");
config.reviewRoundLimit = 4;
config.steps.first.round = 4;
write(); await assert.rejects(runHandoff(file), /extendedReviewAuthorization/);
assert.equal(fs.existsSync(config.journal), false, "an extension without explicit authorization must fail before launch");
config.journal = path.join(scratch, "authorized-fourth-round.jsonl");
config.extendedReviewAuthorization = "User explicitly requested a fourth review round.";
write(); await assert.rejects(runHandoff(file), /posted comment IDs/, "an authorized fourth-round lens launches before its empty fixture report is rejected");
assert.ok(fs.readFileSync(config.journal, "utf8").includes('"event":"launching"'));
delete config.reviewRoundLimit;
delete config.extendedReviewAuthorization;
config.steps.first.round = 3;
config.journal = path.join(scratch, "pending-third-lens.jsonl");
config.finalCorrections = false;
write(); await assert.rejects(runHandoff(file), /posted comment IDs/, "a pending third-round lens must launch before its fixture's empty report is rejected");
assert.ok(fs.readFileSync(config.journal, "utf8").includes('"event":"launching"'));
config.journal = path.join(scratch, "changed-third-round-head.jsonl");
git("commit", "--allow-empty", "-m", "correction after review");
write(); await assert.rejects(runHandoff(file), /same round requires the recorded reviewed head/);
assert.ok(!fs.readFileSync(config.journal, "utf8").includes('"event":"launching"'));
config.journal = path.join(scratch, "missing-recovery-state.jsonl");
delete config.finalCorrections;
write(); await assert.rejects(runHandoff(file), /finalCorrections/);
assert.equal(fs.existsSync(config.journal), false);
config.finalCorrections = false;
config.journal = path.join(scratch, "missing-reviewed-head.jsonl");
delete config.reviewedHead;
write(); await assert.rejects(runHandoff(file), /Supply reviewedHead/);
assert.equal(fs.existsSync(config.journal), false);

// Finish a real third-round lens, recover its recorded state, then make a
// correction. Only the GitHub read is stubbed; children, commits and journals
// use the scratch repository and the real launcher.
const lifecycleChild = path.join(scratch, "round-lifecycle.mjs");
fs.writeFileSync(lifecycleChild, `import fs from "node:fs"; import {execFileSync} from "node:child_process"; let p=""; for await (const c of process.stdin) p+=c; const role=/role=(\\w+)/.exec(p)[1]; if(role==="implement" && process.argv[2]!=="noop")execFileSync("git",["-c","user.name=test","-c","user.email=test@example.invalid","commit","--allow-empty","-m","verified correction"],{windowsHide:true}); const head=execFileSync("git",["rev-parse","HEAD"],{encoding:"utf8",windowsHide:true}).trim(); fs.writeFileSync(/Write (.*?) with the editor tool/.exec(p)[1],JSON.stringify({head,next:role==="implement"?"review":process.argv[2]==="first-review"?"next-review":null,commentIds:role==="review"?[123]:[],summary:"fixture completed"}));`);
const lifecycle = { ...config, pr:531, first:"review", maxSteps:2, reviewedHead:git("rev-parse","HEAD").trim(), journal:path.join(scratch,"completed-third.jsonl"), steps:{
  review:{role:"review",round:3,model:"reviewer-test",executable:process.execPath,args:[lifecycleChild,"--model","reviewer-test"],prompt,next:[null]},
  implement:{role:"implement",model:"writer-test",executable:process.execPath,args:[lifecycleChild,"--model","writer-test"],prompt,next:["review"]},
}};
const originalExec = childProcess.execFileSync;
try {
  childProcess.execFileSync = (exe, args, options) => exe === "gh"
    ? JSON.stringify({issue_url:"https://api.github.com/repos/ImpowerGames/impower/issues/531",body:git("rev-parse","HEAD").trim()})
    : originalExec(exe,args,options);
  syncBuiltinESMExports();
  const freshCycle={...lifecycle,completedReviewRound:0,reviewedHead:null,finalCorrections:false,journal:path.join(scratch,"fresh-two-reviewers.jsonl"),steps:{
    review:{...lifecycle.steps.review,round:1,args:[lifecycleChild,"first-review","--model","reviewer-test"],next:["next-review"]},
    "next-review":{...lifecycle.steps.review,round:1},
  }};
  fs.writeFileSync(file,JSON.stringify(freshCycle)); await runHandoff(file);
  const freshRows=fs.readFileSync(freshCycle.journal,"utf8").trim().split("\n").map(JSON.parse);
  const freshCompleted=freshRows.filter(row=>row.event==="completed");
  assert.equal(freshCompleted.length,2,"a fresh cycle completes both same-round reviewers");
  assert.ok(freshCompleted.every(row=>row.completedRound===1 && row.reviewedHead===lifecycle.reviewedHead),"the first review records the head needed by the second");
  fs.writeFileSync(file,JSON.stringify(lifecycle)); await runHandoff(file);
  const completed=fs.readFileSync(lifecycle.journal,"utf8").trim().split("\n").map(JSON.parse).find(row=>row.event==="completed");
  assert.equal(completed.completedRound,3);
  assert.equal(completed.reviewedHead,lifecycle.reviewedHead);
  assert.equal(completed.finalCorrections,false);
  lifecycle.journal=path.join(scratch,"recovered-third.jsonl");
  lifecycle.completedReviewRound=completed.completedRound;
  lifecycle.reviewedHead=completed.reviewedHead;
  lifecycle.finalCorrections=completed.finalCorrections;
  fs.writeFileSync(file,JSON.stringify(lifecycle)); await runHandoff(file);
  lifecycle.journal=path.join(scratch,"corrected-third.jsonl"); lifecycle.first="implement";
  fs.writeFileSync(file,JSON.stringify(lifecycle));
  await assert.rejects(runHandoff(file),/no automatic review/);
  const corrected=fs.readFileSync(lifecycle.journal,"utf8").trim().split("\n").map(JSON.parse);
  assert.equal(corrected.find(row=>row.event==="completed").finalCorrections,true);
  assert.equal(corrected.filter(row=>row.event==="launching").length,1,"correction cannot trigger another third-round review");
  lifecycle.journal=path.join(scratch,"preexisting-head-drift.jsonl");
  lifecycle.steps.implement.args=[lifecycleChild,"noop","--model","writer-test"];
  fs.writeFileSync(file,JSON.stringify(lifecycle));
  await assert.rejects(runHandoff(file),/no automatic review/);
  const drifted=fs.readFileSync(lifecycle.journal,"utf8").trim().split("\n").map(JSON.parse);
  const driftCompletion=drifted.find(row=>row.event==="completed");
  assert.equal(driftCompletion.head,drifted.find(row=>row.event==="launching").head,"no-op implementation leaves its launch head unchanged");
  assert.equal(driftCompletion.finalCorrections,true,"drift before the implementation step still invalidates final-round coverage");

  const extendedLifecycle={...lifecycle,first:"review",reviewRoundLimit:4,extendedReviewAuthorization:"User explicitly requested a fourth review round.",completedReviewRound:3,reviewedHead:git("rev-parse","HEAD").trim(),finalCorrections:false,journal:path.join(scratch,"completed-fourth.jsonl"),steps:{
    review:{...lifecycle.steps.review,round:4},
    implement:{...lifecycle.steps.implement,args:[lifecycleChild,"--model","writer-test"]},
  }};
  fs.writeFileSync(file,JSON.stringify(extendedLifecycle)); await runHandoff(file);
  const extendedCompleted=fs.readFileSync(extendedLifecycle.journal,"utf8").trim().split("\n").map(JSON.parse).find(row=>row.event==="completed");
  assert.equal(extendedCompleted.completedRound,4,"an authorized fourth round records its configured limit");
  assert.equal(extendedCompleted.reviewedHead,extendedLifecycle.reviewedHead);
  assert.equal(extendedCompleted.finalCorrections,false);
  extendedLifecycle.journal=path.join(scratch,"recovered-fourth.jsonl");
  extendedLifecycle.completedReviewRound=extendedCompleted.completedRound;
  extendedLifecycle.reviewedHead=extendedCompleted.reviewedHead;
  extendedLifecycle.finalCorrections=extendedCompleted.finalCorrections;
  fs.writeFileSync(file,JSON.stringify(extendedLifecycle)); await runHandoff(file);
  extendedLifecycle.first="implement";
  extendedLifecycle.journal=path.join(scratch,"corrected-fourth.jsonl");
  fs.writeFileSync(file,JSON.stringify(extendedLifecycle));
  await assert.rejects(runHandoff(file),/no automatic review/);
  const extendedCorrected=fs.readFileSync(extendedLifecycle.journal,"utf8").trim().split("\n").map(JSON.parse);
  assert.equal(extendedCorrected.find(row=>row.event==="completed").finalCorrections,true,"a correction after the configured limit invalidates its review coverage");
  assert.equal(extendedCorrected.filter(row=>row.event==="launching").length,1,"a correction after an authorized fourth round cannot launch another review automatically");

  const raisedCap = { ...extendedLifecycle, first:"review", reviewRoundLimit:6, extendedReviewAuthorization:"User explicitly authorized six total review rounds.", completedReviewRound:5, reviewedHead:git("rev-parse","HEAD").trim(), finalCorrections:true, journal:path.join(scratch,"raised-cap-two-lenses.jsonl"), steps:{
    review:{...lifecycle.steps.review,round:6,args:[lifecycleChild,"first-review","--model","reviewer-test"],next:["next-review"]},
    "next-review":{...lifecycle.steps.review,round:6},
    implement:{...extendedLifecycle.steps.implement},
  }};
  fs.writeFileSync(file,JSON.stringify(raisedCap)); await assert.doesNotReject(runHandoff(file), "both final-round lenses must run after the user raises the cap");
  const raisedCompleted=fs.readFileSync(raisedCap.journal,"utf8").trim().split("\n").map(JSON.parse).filter(row=>row.event==="completed");
  assert.equal(raisedCompleted.length,2,"both lenses at the authorized final round must finish after the earlier cap was raised");
  assert.ok(raisedCompleted.every(row=>row.completedRound===6 && row.finalCorrections===false),"a validated later round supersedes the earlier final-correction flag");
  raisedCap.completedReviewRound=6; raisedCap.reviewedHead=raisedCompleted.at(-1).reviewedHead; raisedCap.finalCorrections=false;
  raisedCap.first="implement"; raisedCap.journal=path.join(scratch,"raised-cap-final-correction.jsonl");
  fs.writeFileSync(file,JSON.stringify(raisedCap)); await assert.rejects(runHandoff(file),/no automatic review/);
  const raisedCorrected=fs.readFileSync(raisedCap.journal,"utf8").trim().split("\n").map(JSON.parse);
  assert.equal(raisedCorrected.find(row=>row.event==="completed").finalCorrections,true);
  assert.equal(raisedCorrected.filter(row=>row.event==="launching").length,1,"actual corrections after round six still block another lens");

} finally { childProcess.execFileSync=originalExec; syncBuiltinESMExports(); }
config.completedReviewRound = 0;
delete config.finalCorrections;
delete config.reviewedHead;
config.steps.first.role = "implement";
config.steps.first.model = "writer-test";
config.steps.first.args = [child, "first", "--model", "writer-test"];
config.steps.second.role = "review";
config.steps.second.model = "reviewer-test";
config.steps.second.args = [child, "second", "--model", "reviewer-test"];
for (const badRound of [undefined, "3", 4]) {
  config.journal = path.join(scratch, `invalid-round-${badRound}.jsonl`);
  config.steps.second.round = badRound;
  write(); await assert.rejects(runHandoff(file), /round must be 1..3/);
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
  execFileSync("git", ["clone", "--quiet", worktree, repo], { windowsHide: true });
  const plan = path.join(scratch, `concurrent-${i}.json`);
  const posted = path.join(scratch, `posted-${i}`);
  fs.writeFileSync(plan, JSON.stringify({worktree:repo, writer:"writer-test", writerEffort:"medium", reviewer:"reviewer-test", completedReviewRound:0, maxSteps:1, first:"review", journal:path.join(scratch,`concurrent-${i}.jsonl`), steps:{review:{role:"review",round:1,model:"reviewer-test",executable:process.execPath,args:[reviewer,posted,release,"--model","reviewer-test"],prompt,next:[null]}}}));
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
fs.writeFileSync(failureWorker,`import fs from 'node:fs';import cp,{ChildProcess} from 'node:child_process';import {syncBuiltinESMExports} from 'node:module';import {runHandoff} from ${JSON.stringify(pathToFileURL(path.resolve("scripts/agent-handoff.mjs")).href)}; const realWrite=fs.writeSync;let failing=false;fs.writeSync=(fd,data,...args)=>{if(typeof data==='string'&&data.includes('"event":"running"')){failing=true;throw new Error('primary journal failure')}if(failing&&process.argv[4]==='combined')throw new Error('secondary storage failure');return realWrite(fd,data,...args)};if(process.argv[4]==='retained'){const spawn=cp.spawn;cp.spawn=(exe,args,options)=>/* windows-hide: caller */spawn(exe,args,{...options,detached:true});syncBuiltinESMExports();ChildProcess.prototype.kill=function(){this.emit('error',new Error('fixture signal-delivery failure'));return false;};}runHandoff(process.argv[2],{slotRoot:process.argv[3]}).catch(error=>{console.error(error.message);process.exitCode=1});`);
for(const mode of ["combined","retained"]){
  const repo=path.join(scratch,`failure-repo-${mode}`);execFileSync("git",["clone","--quiet",worktree,repo],{windowsHide:true});
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

for(const mode of ["already-exited","uncertain-exit-journal"]){
  const pool=path.join(scratch,mode+"-slots");
  config.journal=path.join(scratch,mode+".jsonl");
  config.steps.first.args=["-e","process.exit(0)","--","--model","reviewer-test"];write();
  let exitedPid;
  try{
    fs.writeSync=(fd,data,...args)=>{
      if(typeof data==="string"&&data.includes(mode==="already-exited"?'"event":"running"':'"event":"exited"'))throw new Error("injected final journal failure");
      return writeSync(fd,data,...args);
    };
    await assert.rejects(handoff(file,{slotRoot:pool,identifyProcess:(pid)=>{
      exitedPid=pid;
      const end=Date.now()+10000;
      while(processIdentity(pid)!==null){if(Date.now()>end)throw new Error("fixture child did not exit");Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0,10);}
      if(mode==="uncertain-exit-journal")throw new Error("injected identity uncertainty");
      return null;
    }}),error=>{
      assert.match(error.message,/injected final journal failure/);
      assert.doesNotMatch(error.message,/termination request was not delivered|child exit unconfirmed/);
      if(mode==="uncertain-exit-journal")assert.match(error.message,/Child exit confirmed.*validation has not run/);
      return true;
    });
  }finally{fs.writeSync=writeSync;}
  assert.equal(processIdentity(exitedPid),null);
  assert.equal(fs.readdirSync(pool).length,0,"confirmed close releases capacity even when identity and exit journal writes failed");
  assert.equal(fs.existsSync(lock),false);
}
console.log("PASS: real already-exited children have no false termination warning; uncertain registration plus exit-journal failure releases capacity");

// A spec review plan targets an issue: the reviewer reads a frozen snapshot of
// the parent Feature and its slices, and its report is verified by the snapshot
// digest in a comment on the issue rather than a head SHA on a pull request.
const { takeSnapshot, bodyDigest } = await import("./spec-snapshot.mjs");
const specIssues = {
  565: { number: 565, title: "Parent", state: "open", updated_at: "2026-09-16T01:04:43Z", type: { name: "Feature" }, body: "Slices: #566 and #570." },
  566: { number: 566, title: "Geometry", state: "open", updated_at: "2026-09-16T00:26:13Z", type: { name: "Task" }, body: "Split from #565. Geometry." },
  570: { number: 570, title: "Toggle", state: "open", updated_at: "2026-09-16T00:26:16Z", type: { name: "Task" }, body: "Split from #565. Toggle." },
};
const specSnapshot = takeSnapshot({ parent: 565, fetchIssue: (number) => structuredClone(specIssues[number]) });
const snapshotFile = path.join(scratch, "spec-snapshot.json");
fs.writeFileSync(snapshotFile, JSON.stringify(specSnapshot));
const specChild = path.join(scratch, "spec-child.mjs");
fs.writeFileSync(specChild, `import fs from "node:fs"; let p=""; for await (const c of process.stdin) p+=c; const head=/reviewed head=([a-f0-9]{40})/.exec(p)[1]; const digest=/reviewed snapshot=([a-f0-9]{64})/.exec(p); fs.writeFileSync(process.argv[2], JSON.stringify({digest:digest&&digest[1],role:/role=(\\w+)/.exec(p)[1]})); fs.writeFileSync(/Write (.*?) with the editor tool/.exec(p)[1], JSON.stringify({head,next:null,commentIds:[777],summary:"spec review posted"}));`);
const specSeen = path.join(scratch, "spec-seen.json");
const specPlan = { target: "issue", issue: 565, snapshot: snapshotFile, worktree, completedReviewRound: 0, writer: "writer-test", writerEffort: "medium", reviewer: "reviewer-test", maxSteps: 1, first: "review", journal: path.join(scratch, "spec-review.jsonl"), steps: { review: { role: "review", round: 1, model: "reviewer-test", executable: process.execPath, args: [specChild, specSeen, "--model", "reviewer-test"], prompt, next: [null] } } };
const specFile = path.join(scratch, "spec-plan.json");
const writeSpec = (plan) => fs.writeFileSync(specFile, JSON.stringify(plan));
const specRows = (plan) => fs.readFileSync(plan.journal, "utf8").trim().split("\n").map(JSON.parse);
const specHead = git("rev-parse", "HEAD").trim();
const onParent = "https://api.github.com/repos/ImpowerGames/impower/issues/565";
const specComments = { 777: { issue_url: onParent, body: "### Spec review — undirected (reviewer-test)\nRound 1, snapshot digest " + specSnapshot.digest, created_at: "2026-09-17T12:00:00Z" } };
try {
  childProcess.execFileSync = (exe, args, options) => exe === "gh" ? JSON.stringify(specComments[Number(String(args[1]).split("/").at(-1))] ?? { issue_url: "none", body: "" }) : originalExec(exe, args, options);
  syncBuiltinESMExports();
  writeSpec(specPlan); await runHandoff(specFile);
  const rows = specRows(specPlan);
  const launching = rows.find((row) => row.event === "launching");
  assert.equal(launching.target, "issue");
  assert.equal(launching.issue, 565);
  assert.equal(launching.snapshotDigest, specSnapshot.digest);
  assert.ok(rows.some((row) => row.event === "reserved"), "a spec reviewer reserves a machine-wide slot");
  assert.equal(rows.at(-1).event, "finished");
  const completed = rows.find((row) => row.event === "completed");
  assert.equal(completed.completedRound, 1);
  assert.equal(completed.reviewedHead, specHead);
  assert.equal(completed.reviewedSnapshotDigest, specSnapshot.digest);
  assert.equal(JSON.parse(fs.readFileSync(specSeen, "utf8")).digest, specSnapshot.digest, "the reviewer receives the snapshot digest in its handoff contract");
  specComments[777] = { ...specComments[777], body: "### Spec review — undirected\nReviewed head " + specHead };
  writeSpec({ ...specPlan, journal: path.join(scratch, "spec-no-digest.jsonl") });
  await assert.rejects(runHandoff(specFile), /does not verify this issue and snapshot digest/, "a report on the issue must carry the snapshot digest; the head SHA is not the marker");
  specComments[777] = { ...specComments[777], body: "digest " + specSnapshot.digest, issue_url: onParent.replace("565", "566") };
  writeSpec({ ...specPlan, journal: path.join(scratch, "spec-wrong-issue.jsonl") });
  await assert.rejects(runHandoff(specFile), /does not verify this issue/, "a report posted on a slice does not verify the parent issue");
  specComments[777] = { ...specComments[777], issue_url: onParent };
  const refused = async (plan, pattern, label) => {
    const journal = path.join(scratch, `spec-refused-${label}.jsonl`);
    writeSpec({ ...plan, journal });
    await assert.rejects(runHandoff(specFile), pattern, label);
    assert.equal(fs.existsSync(journal), false, label + " must fail before any launch");
  };
  await refused({ ...specPlan, reviewer: "writer-test", steps: { review: { ...specPlan.steps.review, model: "writer-test", args: [specChild, specSeen, "--model", "writer-test"] } } }, /distinct/, "same-route");
  await refused({ ...specPlan, reviewer: "writer-test[1m]", steps: { review: { ...specPlan.steps.review, model: "writer-test[1m]", args: [specChild, specSeen, "--model", "writer-test[1m]"] } } }, /distinct/, "same-route-suffix");
  await refused({ ...specPlan, snapshot: path.join(scratch, "absent-snapshot.json") }, /Cannot read snapshot/, "missing-snapshot");
  const tampered = JSON.parse(fs.readFileSync(snapshotFile, "utf8"));
  tampered.tickets[1].body += " edited";
  tampered.tickets[1].bodyDigest = bodyDigest(tampered.tickets[1].body);
  fs.writeFileSync(path.join(scratch, "spec-tampered.json"), JSON.stringify(tampered));
  await refused({ ...specPlan, snapshot: path.join(scratch, "spec-tampered.json") }, /does not match its digest/, "edited-snapshot");
  await refused({ ...specPlan, pr: 565 }, /names its issue in `issue`; remove `pr`/, "pr-field");
  await refused({ ...specPlan, issue: undefined }, /positive issue number/, "no-issue");
  await refused({ ...specPlan, issue: 566 }, /is of #565, not #566/, "other-issue");
  await refused({ ...specPlan, snapshot: "relative.json" }, /absolute snapshot path/, "relative-snapshot");
  const inside = path.join(worktree, "snapshot-inside.json");
  fs.copyFileSync(snapshotFile, inside);
  try { await refused({ ...specPlan, snapshot: inside }, /outside the worktree/, "snapshot-inside-worktree"); } finally { fs.unlinkSync(inside); }
  await refused({ ...specPlan, target: "spec" }, /target must be/, "bad-target");
  await refused({ ...specPlan, first: "implement", steps: { implement: { role: "implement", model: "writer-test", executable: process.execPath, args: [specChild, specSeen, "--model", "writer-test"], prompt, next: [null] } } }, /no implementation step/, "implement-step");
  await refused({ ...specPlan, reviewRoundLimit: 3 }, /Rounds beyond 2 require explicit user authorization/, "cap");
  await refused({ ...specPlan, reviewRoundLimit: 2, extendedReviewAuthorization: "not needed" }, /only valid when reviewRoundLimit exceeds 2/, "needless-authorization");
  await refused({ ...specPlan, steps: { review: { ...specPlan.steps.review, round: 3 } } }, /1..2/, "round-three");
  await refused({ ...specPlan, completedReviewRound: 1, reviewedHead: specHead }, /reviewedSnapshotDigest/, "missing-recorded-digest");
  const changedDigest = { ...specPlan, completedReviewRound: 1, reviewedHead: specHead, reviewedSnapshotDigest: "c".repeat(64), journal: path.join(scratch, "spec-changed-digest.jsonl") };
  writeSpec(changedDigest);
  await assert.rejects(runHandoff(specFile), /edited ticket needs a new round/);
  assert.ok(!fs.readFileSync(changedDigest.journal, "utf8").includes('"event":"launching"'), "a same-round lens on a different snapshot must not launch");
  const pendingLens = { ...specPlan, completedReviewRound: 1, reviewedHead: specHead, reviewedSnapshotDigest: specSnapshot.digest, journal: path.join(scratch, "spec-pending-lens.jsonl") };
  writeSpec(pendingLens); await runHandoff(specFile);
  assert.equal(specRows(pendingLens).find((row) => row.event === "completed").completedRound, 1, "a pending lens on the recorded snapshot and head completes its round");
  const editedSnapshot = takeSnapshot({ parent: 565, fetchIssue: (number) => number === 570 ? { ...specIssues[570], body: specIssues[570].body + " Location: the top bar." } : structuredClone(specIssues[number]) });
  const editedFile = path.join(scratch, "spec-snapshot-2.json");
  fs.writeFileSync(editedFile, JSON.stringify(editedSnapshot));
  specComments[777] = { ...specComments[777], body: "Round 2, snapshot digest " + editedSnapshot.digest };
  const roundTwo = { ...specPlan, snapshot: editedFile, completedReviewRound: 1, reviewedHead: specHead, reviewedSnapshotDigest: specSnapshot.digest, journal: path.join(scratch, "spec-round-two.jsonl"), steps: { review: { ...specPlan.steps.review, round: 2 } } };
  writeSpec(roundTwo); await runHandoff(specFile);
  const second = specRows(roundTwo).find((row) => row.event === "completed");
  assert.equal(second.completedRound, 2);
  assert.equal(second.reviewedSnapshotDigest, editedSnapshot.digest, "a second round records the fresh snapshot it reviewed");
  const capped = { ...roundTwo, completedReviewRound: 2, reviewedSnapshotDigest: editedSnapshot.digest, finalCorrections: true, journal: path.join(scratch, "spec-capped.jsonl") };
  writeSpec(capped);
  await assert.rejects(runHandoff(specFile), /no automatic review/);
  assert.ok(!fs.readFileSync(capped.journal, "utf8").includes('"event":"launching"'), "edits after the second round cannot launch a third automatically");
  const prShaped = { ...specPlan, target: undefined, pr: 531, journal: path.join(scratch, "spec-fields-on-pr-plan.jsonl") };
  writeSpec(prShaped);
  await assert.rejects(runHandoff(specFile), /apply only to a plan with target "issue"/, "spec fields on a plan without the target are refused rather than ignored");
  assert.equal(fs.existsSync(prShaped.journal), false);
} finally { childProcess.execFileSync = originalExec; syncBuiltinESMExports(); }
console.log("PASS: a spec review plan reserves a slot, launches the reviewer, verifies the report by the snapshot digest on the issue, refuses same routes, missing or edited snapshots, PR fields and a third round before launch, and PR plans keep their behavior");
