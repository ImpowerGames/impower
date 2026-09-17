import fs from "node:fs";
import path from "node:path";
import { spawn, execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { reserveReviewerSlot, releaseReviewerSlot, processIdentity } from "./reviewer-slots.mjs";
import { withJob,retryBusy,git,failureDetails } from './review-job-store.mjs';
import { verifyCodexReviewResult,validateCodexReviewer,verifyReviewerExecutable } from './native-reviewer.mjs';
import {nativeReviewerEnvironment,protectPrivatePath,nativeCodexArgs} from './reviewer-security.mjs';
import { resolveReviewer, applyResolvedReviewer } from "./reviewer-defaults.mjs";
import { readSnapshot, DIGEST } from "./spec-snapshot.mjs";

const read = (file) => JSON.parse(fs.readFileSync(file, "utf8"));
const gitHead = (cwd) => git(cwd,['rev-parse','HEAD']);
const gitStatus = (cwd) => git(cwd,['status','--porcelain']);
export const configuredRoute = (value) => value.replace(/\[[^\]]+\]$/, "");
const readReviewComment = (id, cwd) => JSON.parse(execFileSync("gh", ["api", `repos/ImpowerGames/impower/issues/comments/${id}`], { cwd, encoding: "utf8", windowsHide: true }));

// A report verifies when it sits on the reviewed pull request or issue and
// carries its marker: the reviewed head SHA for a pull request, the snapshot
// digest for a spec review. GitHub serves both through the issues endpoint.
export async function verifyReviewComment(id, number, marker, cwd, { readComment = readReviewComment, wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms)), attempts = 6, notBefore, target = "PR", markerName = "head" } = {}) {
  for (let attempt = 1; attempt <= attempts; attempt++) {
    let comment;try{comment=readComment(id,cwd);}catch(error){if(attempt===attempts)throw error;}
    if (comment?.issue_url === `https://api.github.com/repos/ImpowerGames/impower/issues/${number}` && typeof comment.body==='string'&&comment.body.includes(marker) && (notBefore===undefined||Number.isFinite(Date.parse(comment.created_at))&&Date.parse(comment.created_at)>=Math.floor(Date.parse(notBefore)/1000)*1000)) return;
    if (attempt < attempts) await wait(1000);
  }
  throw new Error(notBefore===undefined?`Comment does not verify this ${target} and ${markerName}`:`Comment does not verify this ${target}/${markerName} and current reviewer launch time ${notBefore}`);
}

export function checkReviewRound(round, completedRound, finalCorrections, reviewRoundLimit = 3) {
  if (!Number.isInteger(round) || round < 1 || round > reviewRoundLimit || round < completedRound) throw new Error(`Review round must be 1..${reviewRoundLimit} and preserve the completed round count`);
  if (round > completedRound + 1) throw new Error("Review round cannot skip ahead of the recorded count");
  if (finalCorrections && completedRound >= reviewRoundLimit) throw new Error(`Final corrections after round ${reviewRoundLimit} require explicit user direction for further review; no automatic review`);
}

export function verifyNativeReviewResult(output,format='claude-json') {
  if(format==='codex-jsonl')return verifyCodexReviewResult(output);
  if(format!=='claude-json')throw new Error('Unsupported native reviewer result transport');
  if(fs.statSync(output).size>16*1024*1024)throw new Error('Native reviewer result exceeds bounded inspection');
  const text=fs.readFileSync(output,'utf8').trim();
  let result;try{result=JSON.parse(text.split('\n').at(-1));}catch{throw new Error('Missing final native reviewer JSON result');}
  if(result.type!=='result'||result.subtype!=='success'||result.is_error!==false||result.stop_reason!=='end_turn')throw new Error('Native reviewer failed or interrupted');
}

// The autonomous cap is three rounds for a pull request and two for a spec
// review; a plan may raise it only with the user's recorded authorization.
export function validateReviewRecovery(config, autonomousLimit = 3) {
  const limit=config.reviewRoundLimit??autonomousLimit;
  if(!Number.isInteger(limit)||limit<1||limit>10)throw new Error('reviewRoundLimit must be an integer from 1 through 10');
  if(limit>autonomousLimit&&(typeof config.extendedReviewAuthorization!=='string'||!config.extendedReviewAuthorization.trim()))throw new Error(`Rounds beyond ${autonomousLimit} require explicit user authorization in extendedReviewAuthorization`);
  if(limit<=autonomousLimit&&config.extendedReviewAuthorization!==undefined)throw new Error(`extendedReviewAuthorization is only valid when reviewRoundLimit exceeds ${autonomousLimit}`);
  if(!Number.isInteger(config.completedReviewRound)||config.completedReviewRound<0||config.completedReviewRound>limit)throw new Error(`Supply completedReviewRound from 0 through ${limit}, including on recovery`);
  if((config.completedReviewRound===limit&&typeof config.finalCorrections!=='boolean')||(config.finalCorrections!==undefined&&typeof config.finalCorrections!=='boolean')||(config.finalCorrections&&config.completedReviewRound<autonomousLimit))throw new Error(`Supply finalCorrections from the journal for recovery at round ${autonomousLimit} or later; round-${limit} recovery requires it`);
  if(config.completedReviewRound>0&&!/^[a-f0-9]{40}$/.test(config.reviewedHead??''))throw new Error('Supply reviewedHead from the journal when recovering a review round');
}

export function validateNativeReviewArgs(review) {
  if(!['default','acceptEdits','plan','dontAsk'].includes(review.permissions))throw new Error('Unsupported native reviewer permission mode');
  const values=new Set(['--model','-m','--effort','--permission-mode','--output-format','--allowedTools','--disallowedTools','--tools']);
  const switches=new Set(['-p','--print','--verbose','--no-session-persistence']);
  for(let i=0;i<review.args.length;i++) {
    const arg=review.args[i];
    if(switches.has(arg))continue;
    if(values.has(arg)&&typeof review.args[i+1]==='string'&&!review.args[i+1].startsWith('-')){i++;continue;}
    throw new Error(`Unsupported automatic native reviewer argument: ${arg}`);
  }
}

// Configuration is a local, caller-authored artifact. Comments and child output
// can select a declared transition but can never supply executable commands.
export async function runHandoff(configFile, { slotRoot, identifyProcess = processIdentity, automaticJob } = {}) {
  const config = read(configFile);
  if (config.continuation) throw new Error('Automatic continuation requires review-supervisor capability preflight');
  const target = config.target ?? "pr";
  if (!["pr", "issue"].includes(target)) throw new Error('Plan target must be "pr" (the default) or "issue"');
  const cwd = fs.realpathSync.native(config.worktree);
  const outside = (file) => { const relative = path.relative(cwd, path.resolve(file)); return relative.startsWith(".." + path.sep) || path.isAbsolute(relative); };
  const journal = path.resolve(config.journal);
  if (!outside(journal)) throw new Error("Journal must be outside the worktree");
  // A spec review plan reviews a frozen snapshot of an issue and its slices;
  // its reports are verified by the snapshot digest instead of a head SHA, and
  // it launches no implementation step.
  let snapshotDigest = null;
  if (target === "issue") {
    if (config.pr !== undefined) throw new Error("A spec review plan names its issue in `issue`; remove `pr`");
    if (!Number.isSafeInteger(config.issue) || config.issue < 1) throw new Error("A spec review plan needs a positive issue number");
    if (typeof config.snapshot !== "string" || !path.isAbsolute(config.snapshot)) throw new Error("A spec review plan needs an absolute snapshot path");
    if (!outside(config.snapshot)) throw new Error("Snapshot must be outside the worktree");
    const snapshot = readSnapshot(config.snapshot);
    if (snapshot.parent !== config.issue) throw new Error(`Snapshot ${config.snapshot} is of #${snapshot.parent}, not #${config.issue}`);
    snapshotDigest = snapshot.digest;
  } else if (config.issue !== undefined || config.snapshot !== undefined || config.reviewedSnapshotDigest !== undefined) throw new Error('issue, snapshot and reviewedSnapshotDigest apply only to a plan with target "issue"');
  const selection = resolveReviewer(config, cwd);
  config.reviewer = selection.reviewer;
  if (!config.writer || !config.reviewer || configuredRoute(config.writer) === configuredRoute(config.reviewer)) throw new Error("Supply distinct writer and reviewer model routes");
  if (selection.resolved) for (const [name, step] of Object.entries(config.steps)) if (step.role === "review") config.steps[name] = applyResolvedReviewer(step, selection);
  const reviewerRow = selection.resolved ? { reviewerEffort: selection.reviewerEffort, reviewerResolved: { writerEffort: config.writerEffort, ticketEffort: selection.ticketEffort, fallback: selection.fallback, index: selection.index } } : {};
  const autonomousLimit = target === "issue" ? 2 : 3;
  const reviewRoundLimit = config.reviewRoundLimit ?? autonomousLimit;
  validateReviewRecovery(config, autonomousLimit);
  if (target === "issue" && config.completedReviewRound > 0 && !DIGEST.test(config.reviewedSnapshotDigest ?? "")) throw new Error("Supply reviewedSnapshotDigest from the journal when recovering a spec review round");
  if (!Number.isInteger(config.maxSteps) || config.maxSteps < 1 || config.maxSteps > 30) throw new Error("maxSteps must be 1..30");
  if (fs.existsSync(journal)) throw new Error("Journal exists; inspect recorded process and completion before authoring a recovery plan");
  for (const step of Object.values(config.steps)) {
    if (target === "issue" && step.role === "implement") throw new Error("A spec review plan has no implementation step; ticket edits happen outside the launcher");
    if(step.nativeResult!==undefined&&!['claude-json','codex-jsonl'].includes(step.nativeResult))throw new Error('Unsupported native reviewer result transport');
    if(step.nativeResult==='codex-jsonl') {
      validateCodexReviewer(step,{reviewer:config.reviewer,worktree:cwd,jobDir:path.dirname(journal)});
      verifyReviewerExecutable({...step,transport:'native-codex-jsonl'});
    }
    if (step.role === "review" && (!Number.isInteger(step.round) || step.round < 1 || step.round > reviewRoundLimit)) throw new Error(`Review round must be 1..${reviewRoundLimit} on every review step before launch`);
    if (!["implement", "review", "adjudicate"].includes(step.role) || !path.isAbsolute(step.executable) || !Array.isArray(step.args) || !step.args.every((a) => typeof a === "string") || !path.isAbsolute(step.prompt)) throw new Error("Each role needs an absolute executable, argument array and prompt file");
    if (!step.model || step.model !== (step.role === "review" ? config.reviewer : config.writer)) throw new Error("Step model must match its caller-supplied role route");
    const explicit = step.args.findIndex((a) => a === "--model" || a === "-m");
    const agent = step.args.indexOf("--agent");
    if (explicit >= 0) {
      if (step.args[explicit + 1] !== step.model) throw new Error("Model argument does not match the declared route");
    } else if (agent >= 0 && /^reviewer-[a-z0-9-]+$/.test(step.args[agent + 1] ?? "")) {
      const definition = fs.readFileSync(path.join(cwd, ".claude", "agents", step.args[agent + 1] + ".md"), "utf8");
      if (/^model:\s*(.+)$/m.exec(definition)?.[1].trim() !== step.model) throw new Error("Agent definition does not match the declared route");
    } else throw new Error("Launch must explicitly select its model or a checked pinned agent definition");
    if (!Array.isArray(step.next) || !step.next.length || !step.next.every((name) => name === null || Object.hasOwn(config.steps, name))) throw new Error("Each step needs declared next transitions");
  }
  fs.mkdirSync(path.dirname(journal), { recursive: true });
  const lock = git(cwd,['rev-parse','--path-format=absolute','--git-path','agent-handoff.lock']);
  let owner;
  try { owner = fs.openSync(lock, "wx"); }
  catch(error) {
    if(error.code==="EEXIST")throw new Error(`EEXIST: a coordinator already owns this worktree; inspect ${lock} and await confirmed exit`);
    throw error;
  }
  let fd;
  const append = (row) => { fs.writeSync(fd, JSON.stringify({ time: new Date().toISOString(), ...row }) + "\n"); fs.fsyncSync(fd); };
  let current = config.first;
  let completedRound = config.completedReviewRound;
  let reviewedHead = config.reviewedHead ?? null;
  let reviewedSnapshotDigest = config.reviewedSnapshotDigest ?? null;
  let finalCorrections = config.finalCorrections ?? false;
  let activeChild;
  const usedReports=new Set();
  try {
    const freeze=git(cwd,['rev-parse','--path-format=absolute','--git-path','agent-review-job.json']);
    if(fs.existsSync(freeze)) {
      const claim=read(freeze);
      if(claim.jobId!==automaticJob?.jobId||fs.realpathSync.native(claim.jobDir)!==fs.realpathSync.native(automaticJob.jobDir))throw new Error('Worktree reserved by automatic review job; claim or cancel that job first');
    } else if(automaticJob)throw new Error('Automatic review ownership marker missing');
    fs.writeFileSync(owner, JSON.stringify({ pid: process.pid, processIdentity: processIdentity(process.pid), startedAt: new Date().toISOString(), journal }));
    fd = fs.openSync(journal, "wx");
    for (let index = 0; current; index++) {
      if(automaticJob)await retryBusy(()=>withJob(automaticJob.jobDir,rows=>{if(rows.some(row=>row.event==='workflow-cancelled'))throw new Error('Automatic review workflow cancelled; no further reviewer dispatch');}));
      if (index >= config.maxSteps) throw new Error("Handoff step budget reached; human review required");
      const step = config.steps[current];
      if (!step) throw new Error(`Unknown step: ${current}`);
      if (step.role === "review") checkReviewRound(step.round, completedRound, finalCorrections, reviewRoundLimit);
      const head = gitHead(cwd), status = gitStatus(cwd);
      if (status) throw new Error("Handoff requires a clean committed worktree");
      if (step.role === "review" && step.round === completedRound && (head !== reviewedHead || snapshotDigest !== reviewedSnapshotDigest)) throw new Error(target === "issue" ? "A pending lens in the same round requires the recorded reviewed head and snapshot digest; an edited ticket needs a new round" : "A pending lens in the same round requires the recorded reviewed head; corrections need a new round");
      const artifacts = fs.mkdtempSync(path.join(path.dirname(journal), `handoff-${index}-${step.role}-`));
      if(step.nativeResult==='codex-jsonl')protectPrivatePath(artifacts);
      const writable=step.nativeResult==='codex-jsonl'?fs.realpathSync.native(fs.mkdtempSync(path.join(path.dirname(journal),`completion-${index}-`))):artifacts;
      const completion = path.join(writable, "completion.json");
      const output = path.join(artifacts, "process.log");
      const prompt = fs.readFileSync(step.prompt, "utf8") + `\n\nHandoff contract: role=${step.role}, configured model=${step.model}, reviewed head=${head}${snapshotDigest ? `, reviewed snapshot=${snapshotDigest}` : ""}. Write ${completion} with the editor tool as JSON: {"head":"<actual HEAD>","next":"<declared transition or null>","commentIds":[<numeric GitHub comment IDs>],"summary":"<result>"}. Allowed next steps: ${JSON.stringify(step.next)}. Review and adjudication must post their complete report/dispositions before completion; include those IDs. Do not mark ready or merge. Do not modify repository files during review.\n`;
      const diagnostics=step.nativeResult?path.join(artifacts,'stderr.log'):output;
      const args=step.nativeResult==='codex-jsonl'?nativeCodexArgs(step,writable):step.args;
      const reportNotBefore=new Date().toISOString();
      const targetRow = target === "issue" ? { target, issue: config.issue, snapshotDigest } : { target };
      append({ event: "launching", index, step: current, role: step.role, model: step.model, ...(step.role === "review" ? reviewerRow : {}), ...targetRow, round: step.round, completedRound, reviewedHead, ...(target === "issue" ? { reviewedSnapshotDigest } : {}), finalCorrections, head, output, diagnostics, completion, args,reportNotBefore });
      const log = fs.openSync(output, "wx");
      let stderr;
      try{stderr=diagnostics===output?log:fs.openSync(diagnostics,'wx');}catch(error){fs.closeSync(log);throw error;}
      const closeLogs=()=>{try{fs.closeSync(log);}finally{if(stderr!==log)fs.closeSync(stderr);}};
      let slot;
      try { slot = step.role === "review" ? reserveReviewerSlot(slotRoot) : null; }
      catch (error) { closeLogs(); throw error; }
      if (slot) {
        slot.append({phase:"launching",head,output,completion,journal});
        append({event:"reserved",index,slot:slot.file,token:slot.token,owner:slot.owner});
      }
      let child,childError,exited,launchError;
      try {
        const env=step.role==='review'?nativeReviewerEnvironment(step,artifacts,process.env,{worktree:cwd}):process.env;
        const launch=()=>{
          child=spawn(step.executable,args,{cwd,env,shell:false,windowsHide:true,stdio:['pipe',log,stderr]});
          activeChild=child;
          exited=new Promise(resolve=>{child.on('error',error=>{childError=error.message;});child.once('close',(code,signal)=>resolve({code,signal,error:childError}));});
        };
        if(automaticJob)await retryBusy(()=>{if(child)throw new Error('Spawn completed but admission cleanup failed; preserve owned child');return withJob(automaticJob.jobDir,rows=>{if(rows.some(row=>row.event==='workflow-cancelled'))throw new Error('Automatic review workflow cancelled');launch();});});else launch();
      } catch(error){
        if(child)launchError=error;
        else {closeLogs();if(slot){try{releaseReviewerSlot(slot);}catch(releaseError){error.message+=`; reservation retained at ${slot.file}: ${releaseError.message}`;}}throw error;}
      }
      let result;
      try {
        child.stdin.on("error", () => {});
        let identityRow;
        if (slot && child.pid) {
          try {
            const childIdentity = identifyProcess(child.pid);
            slot.append({phase:childIdentity ? "running" : "exited",child:childIdentity,head,output,completion,journal});
            identityRow={event:childIdentity ? "identified" : "confirmed-absent",index,step:current,childIdentity,slot:slot.file,token:slot.token};
          }
          catch (error) { identityRow={event:"identity-uncertain",index,reason:error.message}; }
        }
        append({ event: "running", index, step: current, pid: child.pid, startedAt: new Date().toISOString(), head, output, completion });
        if(identityRow)append(identityRow);
        if(launchError)throw launchError;
        child.stdin.end(prompt);
        result = await exited;
        activeChild = null;
      } catch(error) {
        // The handle belongs to the child just spawned here. Close its input
        // and terminate that child, retaining ownership until close is observed.
        child.stdin.destroy();
        const waitForClose = (ms) => new Promise(resolve=>{
          const timer=setTimeout(()=>resolve(null),ms);
          exited.then(value=>{clearTimeout(timer);resolve(value);});
        });
        let undelivered=false;
        const terminate=(signal)=>{try{if(!child.kill(signal))undelivered=true;}catch(killError){error.message += `; owned-child termination failed: ${killError.message}`;}};
        terminate();
        let stopped=await waitForClose(5000);
        if(!stopped){terminate("SIGKILL");stopped=await waitForClose(5000);}
        if(stopped){
          activeChild=null;
          if(slot){try{releaseReviewerSlot(slot);}catch(releaseError){error.message += `; reservation retained at ${slot.file}: ${releaseError.message}`;}}
        } else {
          child.unref();
          if(undelivered)error.message += "; owned-child termination request was not delivered";
          error.message += `; child exit unconfirmed (PID ${child.pid}): preserve the worktree lock${slot ? " and reviewer reservation at " + slot.file + "; inspect any recorded OS identity in that slot" : ""}`;
        }
        if(childError)error.message += `; child process error: ${childError}`;
        throw error;
      } finally { closeLogs(); }
      try { append({ event: "exited", index, step: current, ...result }); }
      catch(error){
        error.message=`Child exit confirmed (code ${result.code}); exit journal write failed: ${error.message}; completion and report validation has not run`;
        if(slot){try{releaseReviewerSlot(slot);}catch(releaseError){error.message += `; reservation retained at ${slot.file}: ${releaseError.message}`;}}
        throw error;
      }
      if(slot){try{releaseReviewerSlot(slot);}catch(error){throw new Error(`Child exit confirmed (code ${result.code}); reservation retained at ${slot.file}: ${error.message}; completion and report validation has not run`);}}
      if (result.code !== 0) throw new Error(`Role ${current} failed; inspect ${output}`);
      if(step.nativeResult)verifyNativeReviewResult(output,step.nativeResult);
      if (step.role === "review" && (gitHead(cwd) !== head || gitStatus(cwd) !== status)) throw new Error("Review changed the frozen head or worktree");
      const done = read(completion);
      if (done.head !== gitHead(cwd) || typeof done.summary !== "string" || !done.summary.trim() || !Array.isArray(done.commentIds) || !done.commentIds.every(Number.isSafeInteger)) throw new Error("Invalid or stale completion artifact");
      if (!(step.next.includes(done.next))) throw new Error("Undeclared transition");
      if (step.role !== "implement" && !done.commentIds.length) throw new Error("Review/adjudication needs posted comment IDs");
      for (const id of done.commentIds) {
        if(automaticJob&&usedReports.has(id))throw new Error('Each automatic reviewer requires distinct report IDs');
        if (target === "issue") await verifyReviewComment(id, config.issue, snapshotDigest, cwd, { notBefore: automaticJob ? reportNotBefore : undefined, target: "issue", markerName: "snapshot digest" });
        else await verifyReviewComment(id, config.pr, done.head, cwd,{notBefore:automaticJob?reportNotBefore:undefined});
        usedReports.add(id);
      }
      if (gitStatus(cwd)) throw new Error("Role left uncommitted work");
      if (step.role === "review") {
        if (step.round > completedRound) finalCorrections = false;
        completedRound = step.round; reviewedHead = head; reviewedSnapshotDigest = snapshotDigest;
      }
      if (step.role !== "review" && completedRound === reviewRoundLimit && done.head !== reviewedHead) finalCorrections = true;
      append({ head:done.head,next:done.next,commentIds:done.commentIds,summary:done.summary,event: "completed", index, step: current, completedRound, reviewedHead, ...(target === "issue" ? { reviewedSnapshotDigest } : {}), finalCorrections });
      current = done.next;
    }
    append({ event: "finished" });
  } catch (error) {
    if (fd !== undefined) {
      try { append({ event: "blocked", ...failureDetails(error) }); }
      catch(journalError){error.message += `; blocked journal write failed: ${journalError.message}`;}
    }
    throw error;
  } finally {
    try { if (fd !== undefined) fs.closeSync(fd); }
    finally { try { fs.closeSync(owner); } finally { if (!activeChild) fs.unlinkSync(lock); } }
  }
}

if (process.argv[1] && fs.realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  runHandoff(process.argv[2]).catch((error) => { console.error(error.message); process.exitCode = 1; });
}
