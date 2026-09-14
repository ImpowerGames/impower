// Session-local hook, explicitly installed by the owner before starting their
// writer. It records observations, never starts a model or dispatches work.
import fs from 'node:fs';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {processIdentity} from './reviewer-slots.mjs';

export function claudeAncestor(executable) {
  if(process.platform!=='win32')throw new Error('Claude automatic registration is verified on Windows only');
  const script=`$next=${process.ppid}; $seen=@{}; while($next -gt 0 -and -not $seen.ContainsKey($next)) { $seen[$next]=$true; $item=Get-CimInstance Win32_Process -Filter "ProcessId=$next"; if(-not $item){break}; [pscustomobject]@{pid=[int]$item.ProcessId;executable=$item.ExecutablePath} | ConvertTo-Json -Compress; $next=[int]$item.ParentProcessId }`;
  const rows=execFileSync('powershell.exe',['-NoProfile','-NonInteractive','-Command',script],{encoding:'utf8',windowsHide:true,timeout:10000}).trim().split(/\r?\n/).filter(Boolean).map(JSON.parse);
  const found=rows.find(row=>row.executable&&fs.realpathSync(row.executable)===fs.realpathSync(executable));
  if(!found)throw new Error('Hook is not a child of the configured native Claude executable');
  return processIdentity(found.pid);
}

export function recordClaudeHook(config,event,{env=process.env,ancestor=claudeAncestor,version=executable=>execFileSync(executable,['--version'],{encoding:'utf8',windowsHide:true,timeout:10000}).trim()}={}) {
  if(!path.isAbsolute(config.directory??'')||!path.isAbsolute(config.executable??'')||!fs.statSync(config.directory).isDirectory())throw new Error('Existing private hook directory and absolute executable required');
  const directory=fs.realpathSync(config.directory),cwd=fs.realpathSync(event.cwd);
  const rel=path.relative(cwd,directory);
  if(!rel||(!rel.startsWith(`..${path.sep}`)&&rel!=='..'&&!path.isAbsolute(rel)))throw new Error('Hook directory must be outside the writer worktree');
  const receipts=path.join(directory,'receipts.jsonl');
  if(event.hook_event_name==='SessionStart') {
    const cliVersion=version(config.executable).split(/\s/)[0];
    if(cliVersion!=='2.1.270'||!env.CLAUDE_CODE_MESSAGING_SOCKET||!env.CLAUDE_CODE_MESSAGING_TOKEN)throw new Error('Verified Claude inbox exports and CLI version required');
    const record={version:1,registrationId:randomUUID(),sessionId:event.session_id,cwd,model:event.model,cliVersion,process:ancestor(config.executable),socket:env.CLAUDE_CODE_MESSAGING_SOCKET,token:env.CLAUDE_CODE_MESSAGING_TOKEN,transcript:event.transcript_path,receipts};
    const fd=fs.openSync(path.join(directory,'registration.json'),'wx',0o600);
    try{fs.writeSync(fd,JSON.stringify(record)+'\n');fs.fsyncSync(fd);}finally{fs.closeSync(fd);}
  }
  if(!['SessionStart','UserPromptSubmit','MessageDisplay','Stop','SessionEnd'].includes(event.hook_event_name))return;
  const fields=['hook_event_name','session_id','cwd','model','prompt_id','turn_id','message_id','index','final','delta','permission_mode','effort','reason'];
  const row={eventId:randomUUID(),at:new Date().toISOString(),...Object.fromEntries(fields.filter(key=>event[key]!==undefined).map(key=>[key,event[key]]))};
  if(Buffer.byteLength(JSON.stringify(row))>1024*1024)throw new Error('Hook receipt exceeds bound');
  const fd=fs.openSync(receipts,'a',0o600);try{fs.writeSync(fd,JSON.stringify(row)+'\n');fs.fsyncSync(fd);}finally{fs.closeSync(fd);}
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  try {recordClaudeHook(JSON.parse(fs.readFileSync(process.argv[2],'utf8')),JSON.parse(fs.readFileSync(0,'utf8')));}
  catch {console.error('Claude continuation hook failed; automatic capability remains unavailable.');process.exitCode=1;}
}
