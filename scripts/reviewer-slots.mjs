import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";

export const machineSlotRoot = process.platform === "win32"
  ? path.join(process.env.ProgramData || "C:\\ProgramData", "Impower", "reviewer-slots")
  : "/var/tmp/impower-reviewer-slots";

// null means confirmed absent; failures to inspect are unknown, never absence.
export function processIdentity(pid) {
  if (!Number.isSafeInteger(pid) || pid < 1) throw new Error("Invalid process ID");
  if (process.platform === "linux") {
    let stat;
    try {
      stat = fs.readFileSync(`/proc/${pid}/stat`, "utf8");
    } catch (e) { if (e.code === "ENOENT") return null; throw e; }
    const fields=stat.slice(stat.lastIndexOf(")") + 2).split(" ");
    if(fields[0]==="Z")return null;
    const boot=fs.readFileSync("/proc/sys/kernel/random/boot_id", "utf8").trim();
    if(!boot || !/^\d+$/.test(fields[19]??""))throw new Error("Process start identity unavailable");
    return { pid, start: boot + ":" + fields[19] };
  }
  if (process.platform === "win32") {
    const script = `$ErrorActionPreference='Stop'; try{$p=Get-Process -Id ${pid} -ErrorAction Stop; $p.StartTime.ToUniversalTime().Ticks.ToString()}catch{if($_.FullyQualifiedErrorId -like 'NoProcessFoundForGivenId*'){'absent'}else{throw}}`;
    const value = execFileSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", script], {encoding:"utf8",windowsHide:true}).trim();
    if (value === "absent") return null;
    if (!/^\d+$/.test(value)) throw new Error("Process start identity unavailable");
    return {pid, start:value};
  }
  throw new Error("Reviewer slots require Windows or Linux process identity support");
}
const same = (a,b) => a && b && a.pid === b.pid && a.start === b.start;
const validIdentity = (value) => value && Number.isSafeInteger(value.pid) && value.pid>0 && typeof value.start==="string" && value.start.length>0;
const snapshot = (file) => {
  let rows;
  try { rows = fs.readFileSync(file,"utf8").trim().split("\n").map(JSON.parse); }
  catch(error) { if(error.code==="ENOENT")return null;throw new Error(`Uncertain slot record at ${file}; preserve it: ${error.message}`); }
  if (!rows.length || !rows[0].token || !validIdentity(rows[0].owner) || rows.some(row=>row.token!==rows[0].token)) throw new Error("Uncertain slot record; preserve it");
  return {initial:rows[0], last:rows.at(-1)};
};

export function reserveReviewerSlot(root = machineSlotRoot) {
  fs.mkdirSync(root,{recursive:true});
  const owner = processIdentity(process.pid);
  if (!owner) throw new Error("Coordinator process identity unavailable");
  for(let index=0;index<4;index++) {
    const file=path.join(root,`slot-${index}.jsonl`);
    if(fs.existsSync(file+".recovery"))continue;
    let fd;
    try { fd=fs.openSync(file,"wx",0o644); }
    catch(e){if(e.code==="EEXIST")continue;throw e;}
    const token=randomUUID();
    const append=(row)=>{fs.writeSync(fd,JSON.stringify({token,...row})+"\n");fs.fsyncSync(fd);};
    try{append({phase:"reserved",owner,startedAt:new Date().toISOString()});}
    catch(e){fs.closeSync(fd);throw e;}
    return {file,token,owner,append,close:()=>fs.closeSync(fd)};
  }
  throw new Error(`All four machine-wide reviewer slots are unavailable (occupied or recovery-blocked); await confirmed exit or inspect status in ${root}`);
}

export function releaseReviewerSlot(slot) {
  // Only the process holding the child exit event can call this path.
  const record=snapshot(slot.file);
  if(!record)throw new Error(`Owned slot record is missing at ${slot.file}; ownership cannot be verified`);
  if(record.initial.token!==slot.token || !same(record.initial.owner,processIdentity(process.pid)))throw new Error("Slot ownership changed; preserve the reservation");
  slot.append({phase:"exited"});
  slot.close();
  fs.unlinkSync(slot.file);
}

export function recoverReviewerSlot(file) {
  const recovery=file+".recovery";
  let lock;
  try { lock=fs.openSync(recovery,"wx"); }
  catch(error) {
    if(error.code==="EEXIST")throw new Error(`Recovery marker already exists at ${recovery}; inspect its owner and preserve uncertain ownership`);
    if(error.code==="ENOENT" && snapshot(file)===null)return {alreadyAbsent:file};
    throw error;
  }
  try{
    fs.writeSync(lock,JSON.stringify({token:randomUUID(),owner:processIdentity(process.pid),startedAt:new Date().toISOString(),slot:file})+"\n");
    fs.fsyncSync(lock);
    const record=snapshot(file);
    if(!record)return {alreadyAbsent:file};
    if(same(record.initial.owner,processIdentity(record.initial.owner.pid)))throw new Error("Coordinator still running; await it");
    if(record.last.phase!=="exited") {
      if(record.last.phase!=="running" || !validIdentity(record.last.child))throw new Error("Uncertain reviewer launch; preserve the occupied slot");
      if(same(record.last.child,processIdentity(record.last.child.pid)))throw new Error("Reviewer still running; await confirmed exit");
    }
    if(snapshot(file)?.initial.token!==record.initial.token)throw new Error("Slot generation changed; preserve it");
    fs.unlinkSync(file);
    return {recovered:file,token:record.initial.token};
  }finally{fs.closeSync(lock);fs.unlinkSync(recovery);}
}

export function reviewerSlotStatus(root = machineSlotRoot) {
  return Array.from({length:4},(_,index)=>{
    const file=path.join(root,`slot-${index}.jsonl`);
    const inspect=(target)=>{
      try { return {records:fs.readFileSync(target,"utf8").trim().split("\n").map(JSON.parse)}; }
      catch(error) { return error.code==="ENOENT" ? null : {error:error.message}; }
    };
    return {index,file,reservation:inspect(file),recovery:inspect(file+".recovery")};
  });
}

if(process.argv[1] && fs.realpathSync(process.argv[1])===fileURLToPath(import.meta.url)) {
  try{
    if(process.argv[2]==="status")console.log(JSON.stringify(reviewerSlotStatus(),null,2));
    else {
      if(process.argv[2]!=="recover" || !/^[0-3]$/.test(process.argv[3]??""))throw new Error("Usage: node scripts/reviewer-slots.mjs status | recover <slot 0..3>");
      console.log(JSON.stringify(recoverReviewerSlot(path.join(machineSlotRoot,`slot-${process.argv[3]}.jsonl`))));
    }
  }catch(e){console.error(e.message);process.exitCode=1;}
}
