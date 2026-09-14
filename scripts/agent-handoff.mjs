import fs from "node:fs";
import path from "node:path";
import { spawn, execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { reserveReviewerSlot, releaseReviewerSlot, processIdentity } from "./reviewer-slots.mjs";
import { withJob,retryBusy } from './review-job-store.mjs';
import { verifyCodexReviewResult,validateCodexReviewer,verifyReviewerExecutable } from './native-reviewer.mjs';

const read = (file) => JSON.parse(fs.readFileSync(file, "utf8"));
const gitHead = (cwd) => execFileSync("git", ["rev-parse", "HEAD"], { cwd, encoding: "utf8" }).trim();
const gitStatus = (cwd) => execFileSync("git", ["status", "--porcelain"], { cwd, encoding: "utf8" });
const configuredRoute = (value) => value.replace(/\[[^\]]+\]$/, "");
const readReviewComment = (id, cwd) => JSON.parse(execFileSync("gh", ["api", `repos/ImpowerGames/impower/issues/comments/${id}`], { cwd, encoding: "utf8", windowsHide: true }));

export async function verifyReviewComment(id, pr, head, cwd, { readComment = readReviewComment, wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms)), attempts = 6 } = {}) {
  for (let attempt = 1; attempt <= attempts; attempt++) {
    const comment = readComment(id, cwd);
    if (comment.issue_url === `https://api.github.com/repos/ImpowerGames/impower/issues/${pr}` && comment.body.includes(head)) return;
    if (attempt < attempts) await wait(1000);
  }
  throw new Error("Comment does not verify this PR and head");
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

// Configuration is a local, caller-authored artifact. Comments and child output
// can select a declared transition but can never supply executable commands.
export async function runHandoff(configFile, { slotRoot, identifyProcess = processIdentity, automaticJob } = {}) {
  const config = read(configFile);
  if (config.continuation) throw new Error('Automatic continuation requires review-supervisor capability preflight');
  const cwd = fs.realpathSync(config.worktree);
  const journal = path.resolve(config.journal);
  const relative = path.relative(cwd, journal);
  if (!relative.startsWith(".." + path.sep) && !path.isAbsolute(relative)) throw new Error("Journal must be outside the worktree");
  if (!config.writer || !config.reviewer || configuredRoute(config.writer) === configuredRoute(config.reviewer)) throw new Error("Supply distinct writer and reviewer model routes");
  const reviewRoundLimit = config.reviewRoundLimit ?? 3;
  if (!Number.isInteger(reviewRoundLimit) || reviewRoundLimit < 1 || reviewRoundLimit > 10) throw new Error("reviewRoundLimit must be an integer from 1 through 10");
  if (reviewRoundLimit > 3 && (typeof config.extendedReviewAuthorization !== "string" || !config.extendedReviewAuthorization.trim())) throw new Error("Rounds beyond 3 require explicit user authorization in extendedReviewAuthorization");
  if (reviewRoundLimit <= 3 && config.extendedReviewAuthorization !== undefined) throw new Error("extendedReviewAuthorization is only valid when reviewRoundLimit exceeds 3");
  if (!Number.isInteger(config.maxSteps) || config.maxSteps < 1 || config.maxSteps > 30) throw new Error("maxSteps must be 1..30");
  if (!Number.isInteger(config.completedReviewRound) || config.completedReviewRound < 0 || config.completedReviewRound > reviewRoundLimit) throw new Error(`Supply completedReviewRound from 0 through ${reviewRoundLimit}, including on recovery`);
  if ((config.completedReviewRound === reviewRoundLimit && typeof config.finalCorrections !== "boolean") || (config.finalCorrections !== undefined && typeof config.finalCorrections !== "boolean") || (config.finalCorrections && config.completedReviewRound < 3)) throw new Error(`Supply finalCorrections from the journal for recovery at round 3 or later; round-${reviewRoundLimit} recovery requires it`);
  if (config.completedReviewRound > 0 && !/^[a-f0-9]{40}$/.test(config.reviewedHead ?? "")) throw new Error("Supply reviewedHead from the journal when recovering a review round");
  if (fs.existsSync(journal)) throw new Error("Journal exists; inspect recorded process and completion before authoring a recovery plan");
  for (const step of Object.values(config.steps)) {
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
  const lock = execFileSync("git", ["rev-parse", "--path-format=absolute", "--git-path", "agent-handoff.lock"], { cwd, encoding: "utf8" }).trim();
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
  let finalCorrections = config.finalCorrections ?? false;
  let activeChild;
  try {
    const freeze=execFileSync('git',['rev-parse','--path-format=absolute','--git-path','agent-review-job.json'],{cwd,encoding:'utf8'}).trim();
    if(fs.existsSync(freeze)) {
      const claim=read(freeze);
      if(claim.jobId!==automaticJob?.jobId||fs.realpathSync(claim.jobDir)!==fs.realpathSync(automaticJob.jobDir))throw new Error('Worktree reserved by automatic review job; claim or cancel that job first');
    } else if(automaticJob)throw new Error('Automatic review ownership marker missing');
    fs.writeFileSync(owner, JSON.stringify({ pid: process.pid, processIdentity: processIdentity(process.pid), startedAt: new Date().toISOString(), journal }));
    fd = fs.openSync(journal, "wx");
    for (let index = 0; current; index++) {
      if(automaticJob&&fs.readFileSync(path.join(automaticJob.jobDir,'events.jsonl'),'utf8').trim().split('\n').map(JSON.parse).some(row=>row.event==='workflow-cancelled'))throw new Error('Automatic review workflow cancelled; no further reviewer dispatch');
      if (index >= config.maxSteps) throw new Error("Handoff step budget reached; human review required");
      const step = config.steps[current];
      if (!step) throw new Error(`Unknown step: ${current}`);
      if (step.role === "review") checkReviewRound(step.round, completedRound, finalCorrections, reviewRoundLimit);
      const head = gitHead(cwd), status = gitStatus(cwd);
      if (status) throw new Error("Handoff requires a clean committed worktree");
      if (step.role === "review" && step.round === completedRound && head !== reviewedHead) throw new Error("A pending lens in the same round requires the recorded reviewed head; corrections need a new round");
      const artifacts = fs.mkdtempSync(path.join(path.dirname(journal), `handoff-${index}-${step.role}-`));
      const completion = path.join(artifacts, "completion.json");
      const output = path.join(artifacts, "process.log");
      const prompt = fs.readFileSync(step.prompt, "utf8") + `\n\nHandoff contract: role=${step.role}, configured model=${step.model}, reviewed head=${head}. Write ${completion} with the editor tool as JSON: {"head":"<actual HEAD>","next":"<declared transition or null>","commentIds":[<numeric GitHub comment IDs>],"summary":"<result>"}. Allowed next steps: ${JSON.stringify(step.next)}. Review and adjudication must post their complete report/dispositions before completion; include those IDs. Do not mark ready or merge. Do not modify repository files during review.\n`;
      append({ event: "launching", index, step: current, role: step.role, model: step.model, round: step.round, completedRound, reviewedHead, finalCorrections, head, output, completion });
      const log = fs.openSync(output, "wx");
      // Keep native JSONL stdout separate from CLI diagnostics. The only added
      // writable root is this invocation's fresh completion/report directory.
      let diagnostics=log;
      try {if(step.nativeResult==='codex-jsonl')diagnostics=fs.openSync(path.join(artifacts,'stderr.log'),'wx');}
      catch(error){fs.closeSync(log);throw error;}
      const closeLogs=()=>{fs.closeSync(log);if(diagnostics!==log)fs.closeSync(diagnostics);};
      let slot;
      try { slot = step.role === "review" ? reserveReviewerSlot(slotRoot) : null; }
      catch (error) { closeLogs(); throw error; }
      if (slot) {
        slot.append({phase:"launching",head,output,completion,journal});
        append({event:"reserved",index,slot:slot.file,token:slot.token,owner:slot.owner});
      }
      let child;
      try {
        const args=step.nativeResult==='codex-jsonl'?[...step.args.slice(0,-1),'--add-dir',artifacts,step.args.at(-1)]:step.args;
        const launch=()=>spawn(step.executable, args, { cwd, shell: false, windowsHide: true, stdio: ["pipe", log, diagnostics] });
        child=automaticJob?await retryBusy(()=>withJob(automaticJob.jobDir,rows=>{if(rows.some(row=>row.event==='workflow-cancelled'))throw new Error('Automatic review workflow cancelled');return launch();})):launch();
      } catch(error){closeLogs();if(slot)releaseReviewerSlot(slot);throw error;}
      activeChild = child;
      let childError;
      const exited = new Promise((resolve) => { child.on("error", (e) => {childError=e.message;}); child.once("close", (code, signal) => resolve({ code, signal, error:childError })); });
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
        await verifyReviewComment(id, config.pr, done.head, cwd);
      }
      if (gitStatus(cwd)) throw new Error("Role left uncommitted work");
      if (step.role === "review") {
        if (step.round > completedRound) finalCorrections = false;
        completedRound = step.round; reviewedHead = head;
      }
      if (step.role !== "review" && completedRound === reviewRoundLimit && done.head !== reviewedHead) finalCorrections = true;
      append({ event: "completed", index, step: current, ...done, completedRound, reviewedHead, finalCorrections });
      current = done.next;
    }
    append({ event: "finished" });
  } catch (error) {
    if (fd !== undefined) {
      try { append({ event: "blocked", reason: error.message }); }
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
