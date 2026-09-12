import fs from "node:fs";
import path from "node:path";
import { spawn, execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { reserveReviewerSlot, releaseReviewerSlot, processIdentity } from "./reviewer-slots.mjs";

const read = (file) => JSON.parse(fs.readFileSync(file, "utf8"));
const gitHead = (cwd) => execFileSync("git", ["rev-parse", "HEAD"], { cwd, encoding: "utf8" }).trim();
const gitStatus = (cwd) => execFileSync("git", ["status", "--porcelain"], { cwd, encoding: "utf8" });

export function checkReviewRound(round, completedRound, finalCorrections) {
  if (!Number.isInteger(round) || round < 1 || round > 4 || round < completedRound) throw new Error("Review round must be 1..4 and preserve the completed round count");
  if (round > completedRound + 1) throw new Error("Review round cannot skip ahead of the recorded count");
  if (finalCorrections) throw new Error("Final corrections after round 4 require coordinator risk assessment; no automatic review");
}

// Configuration is a local, caller-authored artifact. Comments and child output
// can select a declared transition but can never supply executable commands.
export async function runHandoff(configFile, { slotRoot, identifyProcess = processIdentity } = {}) {
  const config = read(configFile);
  const cwd = fs.realpathSync(config.worktree);
  const journal = path.resolve(config.journal);
  const relative = path.relative(cwd, journal);
  if (!relative.startsWith(".." + path.sep) && !path.isAbsolute(relative)) throw new Error("Journal must be outside the worktree");
  if (!config.writer || !config.reviewer || config.writer === config.reviewer) throw new Error("Supply distinct writer and reviewer model routes");
  if (!Number.isInteger(config.maxSteps) || config.maxSteps < 1 || config.maxSteps > 12) throw new Error("maxSteps must be 1..12");
  if (!Number.isInteger(config.completedReviewRound) || config.completedReviewRound < 0 || config.completedReviewRound > 4) throw new Error("Supply completedReviewRound from 0 through 4, including on recovery");
  if ((config.completedReviewRound === 4 && typeof config.finalCorrections !== "boolean") || (config.finalCorrections !== undefined && typeof config.finalCorrections !== "boolean") || (config.finalCorrections && config.completedReviewRound !== 4)) throw new Error("Supply finalCorrections from the journal for round-4 recovery; true requires completedReviewRound 4");
  if (fs.existsSync(journal)) throw new Error("Journal exists; inspect recorded process and completion before authoring a recovery plan");
  for (const step of Object.values(config.steps)) {
    if (step.role === "review" && (!Number.isInteger(step.round) || step.round < 1 || step.round > 4)) throw new Error("Review round must be 1..4 on every review step before launch");
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
  let finalCorrections = config.finalCorrections ?? false;
  let activeChild;
  try {
    fs.writeFileSync(owner, JSON.stringify({ pid: process.pid, processIdentity: processIdentity(process.pid), startedAt: new Date().toISOString(), journal }));
    fd = fs.openSync(journal, "wx");
    for (let index = 0; current; index++) {
      if (index >= config.maxSteps) throw new Error("Handoff step budget reached; human review required");
      const step = config.steps[current];
      if (!step) throw new Error(`Unknown step: ${current}`);
      if (step.role === "review") checkReviewRound(step.round, completedRound, finalCorrections);
      const head = gitHead(cwd), status = gitStatus(cwd);
      if (status) throw new Error("Handoff requires a clean committed worktree");
      const artifacts = fs.mkdtempSync(path.join(path.dirname(journal), `handoff-${index}-${step.role}-`));
      const completion = path.join(artifacts, "completion.json");
      const output = path.join(artifacts, "process.log");
      const prompt = fs.readFileSync(step.prompt, "utf8") + `\n\nHandoff contract: role=${step.role}, configured model=${step.model}, reviewed head=${head}. Write ${completion} with the editor tool as JSON: {"head":"<actual HEAD>","next":"<declared transition or null>","commentIds":[<numeric GitHub comment IDs>],"summary":"<result>"}. Allowed next steps: ${JSON.stringify(step.next)}. Review and adjudication must post their complete report/dispositions before completion; include those IDs. Do not mark ready or merge. Do not modify repository files during review.\n`;
      append({ event: "launching", index, step: current, role: step.role, model: step.model, round: step.round, completedRound, head, output, completion });
      const log = fs.openSync(output, "wx");
      let slot;
      try { slot = step.role === "review" ? reserveReviewerSlot(slotRoot) : null; }
      catch (error) { fs.closeSync(log); throw error; }
      if (slot) {
        slot.append({phase:"launching",head,output,completion,journal});
        append({event:"reserved",index,slot:slot.file,token:slot.token,owner:slot.owner});
      }
      const child = spawn(step.executable, step.args, { cwd, shell: false, windowsHide: true, stdio: ["pipe", log, log] });
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
      } finally { fs.closeSync(log); }
      try { append({ event: "exited", index, step: current, ...result }); }
      catch(error){
        error.message=`Child exit confirmed (code ${result.code}); exit journal write failed: ${error.message}; completion and report validation has not run`;
        if(slot){try{releaseReviewerSlot(slot);}catch(releaseError){error.message += `; reservation retained at ${slot.file}: ${releaseError.message}`;}}
        throw error;
      }
      if(slot){try{releaseReviewerSlot(slot);}catch(error){throw new Error(`Child exit confirmed (code ${result.code}); reservation retained at ${slot.file}: ${error.message}; completion and report validation has not run`);}}
      if (result.code !== 0) throw new Error(`Role ${current} failed; inspect ${output}`);
      if (step.role === "review" && (gitHead(cwd) !== head || gitStatus(cwd) !== status)) throw new Error("Review changed the frozen head or worktree");
      const done = read(completion);
      if (done.head !== gitHead(cwd) || typeof done.summary !== "string" || !done.summary.trim() || !Array.isArray(done.commentIds) || !done.commentIds.every(Number.isSafeInteger)) throw new Error("Invalid or stale completion artifact");
      if (!(step.next.includes(done.next))) throw new Error("Undeclared transition");
      if (step.role !== "implement" && !done.commentIds.length) throw new Error("Review/adjudication needs posted comment IDs");
      for (const id of done.commentIds) {
        const comment = JSON.parse(execFileSync("gh", ["api", `repos/ImpowerGames/impower/issues/comments/${id}`], { cwd, encoding: "utf8", windowsHide: true }));
        if (comment.issue_url !== `https://api.github.com/repos/ImpowerGames/impower/issues/${config.pr}` || !comment.body.includes(done.head)) throw new Error("Comment does not verify this PR and head");
      }
      if (gitStatus(cwd)) throw new Error("Role left uncommitted work");
      if (step.role === "review") completedRound = step.round;
      if (step.role !== "review" && completedRound === 4 && done.head !== head) finalCorrections = true;
      append({ event: "completed", index, step: current, ...done, completedRound, finalCorrections });
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
