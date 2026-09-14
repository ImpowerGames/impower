// Session-local hook, explicitly installed by the owner before starting their
// writer. It records observations, never starts a model or dispatches work.
import fs from 'node:fs';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {processIdentity} from './reviewer-slots.mjs';
import {protectPrivatePath} from './reviewer-security.mjs';
import {claimCommandDigest} from './claude-claim-proof.mjs';

export function appendClaudeReceipt(file,row) {
  const lock=file+'.lock',until=Date.now()+10000;
  for(;;){try{fs.mkdirSync(lock);break;}catch(error){if(error.code!=='EEXIST'||Date.now()>until)throw new Error('Claude receipt storage busy; retry after inspecting its lock');Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0,10);}}
  const temporary=file+'.'+randomUUID();
  try {
    let rows=[];
    if(fs.existsSync(file)) {
      if(fs.statSync(file).size>16*1024*1024)throw new Error('Claude receipt storage exceeds recovery bound');
      const text=fs.readFileSync(file,'utf8');
      try{rows=text.slice(0,text.lastIndexOf('\n')+1).trim().split('\n').filter(Boolean).map(JSON.parse);}catch{throw new Error('Claude receipt storage is corrupt; preserve and inspect receipts.jsonl');}
    }
    rows.push(row);
    const retained=new Set([rows.find(value=>value.hook_event_name==='SessionStart'),...rows.slice(-512),...rows.filter(value=>value.hook_event_name==='MessageDisplay'&&value.delta).slice(-1024)]);
    const output=[...retained].filter(Boolean).map(JSON.stringify).join('\n')+'\n';
    if(Buffer.byteLength(output)>2*1024*1024)throw new Error('Compact Claude receipt storage exceeds bound');
    const fd=fs.openSync(temporary,'wx',0o600);try{fs.writeSync(fd,output);fs.fsyncSync(fd);}finally{fs.closeSync(fd);}
    fs.renameSync(temporary,file);
  } finally {if(fs.existsSync(temporary))fs.unlinkSync(temporary);fs.rmdirSync(lock);}
}

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
    protectPrivatePath(directory);
    const cliVersion=version(config.executable).split(/\s/)[0];
    if(cliVersion!=='2.1.270'||!env.CLAUDE_CODE_MESSAGING_SOCKET||!env.CLAUDE_CODE_MESSAGING_TOKEN)throw new Error('Verified Claude inbox exports and CLI version required');
    const record={version:1,registrationId:randomUUID(),sessionId:event.session_id,cwd,model:event.model,cliVersion,process:ancestor(config.executable),socket:env.CLAUDE_CODE_MESSAGING_SOCKET,token:env.CLAUDE_CODE_MESSAGING_TOKEN,transcript:event.transcript_path,receipts};
    const registration=path.join(directory,'registration.json');
    if(fs.existsSync(registration)) {
      protectPrivatePath(registration,{verifyOnly:true});
      let previous;try{previous=JSON.parse(fs.readFileSync(registration,'utf8'));}catch{throw new Error('Existing Claude registration is unreadable');}
      if(previous.sessionId!==record.sessionId||previous.cwd!==record.cwd||previous.socket!==record.socket||previous.token!==record.token||previous.process?.pid!==record.process?.pid||previous.process?.start!==record.process?.start)throw new Error('Existing Claude registration belongs to another session generation');
    } else {
      const fd=fs.openSync(registration,'wx',0o600);
      try{protectPrivatePath(registration);fs.writeSync(fd,JSON.stringify(record)+'\n');fs.fsyncSync(fd);}finally{fs.closeSync(fd);}
    }
  }
  if(!['SessionStart','UserPromptSubmit','MessageDisplay','Stop','SessionEnd','PreToolUse','PostToolUse','PostToolUseFailure'].includes(event.hook_event_name))return;
  const toolEvent=['PreToolUse','PostToolUse','PostToolUseFailure'].includes(event.hook_event_name);
  if(toolEvent&&event.tool_name!=='Bash')return;
  const fields=['hook_event_name','session_id','cwd','model','prompt_id','turn_id','message_id','index','final','delta','permission_mode','effort','reason'];
  const row={eventId:randomUUID(),at:new Date().toISOString(),...Object.fromEntries(fields.filter(key=>event[key]!==undefined).map(key=>[key,event[key]]))};
  if(toolEvent){row.tool_use_id=event.tool_use_id;row.tool_name='Bash';if(event.hook_event_name==='PreToolUse'&&typeof event.tool_input?.command==='string')row.commandDigest=claimCommandDigest(event.tool_input.command);}
  if(event.hook_event_name==='MessageDisplay')row.delta=typeof event.delta==='string'?event.delta.split(/\r?\n/).filter(line=>/^IMPOWER-CONTINUATION-[0-9a-f-]{36}$/i.test(line.trim())).slice(0,8).join('\n'):'';
  if(event.hook_event_name==='MessageDisplay'&&event.final!==true&&!row.delta)return;
  if(Buffer.byteLength(JSON.stringify(row))>1024*1024)throw new Error('Hook receipt exceeds bound');
  appendClaudeReceipt(receipts,row);
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  try {recordClaudeHook(JSON.parse(fs.readFileSync(process.argv[2],'utf8')),JSON.parse(fs.readFileSync(0,'utf8')));}
  catch(error) {console.error(`Claude continuation hook failed (${error.code??'validation'}); inspect private configuration/receipt storage and preserve evidence.`);process.exitCode=1;}
}
