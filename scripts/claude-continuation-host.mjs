import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import {timingSafeEqual} from 'node:crypto';
import {isDeepStrictEqual} from 'node:util';
import {processIdentity} from './reviewer-slots.mjs';
import {sameIdentity,git} from './review-job-store.mjs';
import {continuationPrompt} from './continuation-host.mjs';
import {protectPrivatePath} from './reviewer-security.mjs';
import {claudeClaimArgv,renderClaudeClaimCommand,claimCommandDigest} from './claude-claim-proof.mjs';

export const claudeReceiptMarker=id=>`IMPOWER-CONTINUATION-${id}`;
const uuid=value=>typeof value==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
const canonical=value=>fs.realpathSync.native(value);
const samePath=(a,b)=>canonical(a)===canonical(b);
const inside=(parent,child)=>{const rel=path.relative(parent,child);return !rel||(!rel.startsWith(`..${path.sep}`)&&rel!=='..'&&!path.isAbsolute(rel));};
const privatePath=(value,worktree)=>{
  if(!path.isAbsolute(value??''))throw new Error('Absolute private Claude registration path required');
  const file=canonical(value),root=canonical(worktree);
  if(inside(root,file))throw new Error('Claude credentials and receipts must be outside the worktree');
  return file;
};
export function readClaudeRows(file,maxBytes=16*1024*1024) {
  if(fs.statSync(file).size>maxBytes)throw new Error('Claude evidence exceeds bounded inspection; delivery remains uncertain');
  const text=fs.readFileSync(file,'utf8'),complete=text.slice(0,text.lastIndexOf('\n')+1);
  return complete.trim()?complete.trim().split('\n').map((line,index)=>{try{return JSON.parse(line);}catch{throw new Error(`Invalid native JSONL evidence at ${file}, complete row ${index+1}; preserve evidence and retry after repair`);}}):[];
}
function registration(destination,plan) {
  const file=privatePath(destination.registration,plan.worktree);
  if(fs.statSync(file).size>16384)throw new Error('Invalid private Claude registration');
  let record;try{record=JSON.parse(fs.readFileSync(file,'utf8'));}catch{throw new Error('Unreadable private Claude registration');}
  if(record.version!==1||record.cliVersion!=='2.1.270'||!uuid(record.registrationId)||record.registrationId!==destination.registrationId||!uuid(record.sessionId)||record.sessionId!==destination.threadId||!samePath(record.cwd,destination.cwd)||typeof record.socket!=='string'||!record.socket||typeof record.token!=='string'||!record.token||!path.isAbsolute(record.transcript??'')||!path.isAbsolute(record.receipts??'')||!record.process)throw new Error('Claude registration does not identify the verified originating host');
  privatePath(record.receipts,plan.worktree);
  const common=canonical(git(plan.worktree,['rev-parse','--path-format=absolute','--git-common-dir']));
  if([file,canonical(record.receipts)].some(value=>inside(canonical(destination.cwd),value)||inside(common,value)))throw new Error('Claude private evidence cannot be in a writer checkout or Git administrative directory');
  return record;
}
function credentialsMatch(record,env) {
  const a=Buffer.from(record.token),b=Buffer.from(env.CLAUDE_CODE_MESSAGING_TOKEN??'');
  return record.socket===env.CLAUDE_CODE_MESSAGING_SOCKET&&a.length===b.length&&timingSafeEqual(a,b);
}
export function claudeClaimIdentity(destination,plan,{env=process.env,identify=processIdentity}={}) {
  protectPrivatePath(destination.registration,{verifyOnly:true});
  const record=registration(destination,plan);
  if(!credentialsMatch(record,env)||!sameIdentity(record.process,identify(record.process.pid)))throw new Error('Claim must run in the registered originating Claude session');
  return record.sessionId;
}

export function verifyClaudeClaimConfiguration(destination,plan,options={}) {
  claudeClaimIdentity(destination,plan,options);
  const record=registration(destination,plan);
  const rows=readClaudeRows(record.receipts).filter(row=>row.session_id===record.sessionId),env=options.env??process.env;
  const argv=(options.argv??[process.execPath,...process.argv.slice(1)]).map(value=>value.replaceAll('\\','/'));
  const expected=claudeClaimArgv(plan),digest=claimCommandDigest(renderClaudeClaimCommand(expected));
  const marker=claudeReceiptMarker(plan.continuationId);
  const display=rows.findLast(row=>row.hook_event_name==='MessageDisplay'&&row.delta?.split(/\r?\n/).some(line=>line.trim()===marker));
  const final=rows.findLast(row=>row.hook_event_name==='MessageDisplay'&&row.final===true&&row.message_id===display?.message_id&&row.turn_id===display?.turn_id&&row.prompt_id===display?.prompt_id);
  const tool=rows.findLast(row=>row.hook_event_name==='PreToolUse');
  const index=rows.indexOf(tool),later=rows.slice(index+1);
  if(tool?.tool_name!=='Bash')throw new Error('Current Claude claim proof requires native Bash admission');
  // Concurrent native hooks can record the marker after PreToolUse. Both must
  // exist at claim time; receipt order is not tool execution order.
  const ended=rows.slice(Math.min(rows.indexOf(display),index)+1).some(row=>['Stop','SessionEnd'].includes(row.hook_event_name));
  const matching=rows.filter(row=>row.hook_event_name==='PreToolUse'&&row.commandDigest===digest&&!rows.some(done=>['PostToolUse','PostToolUseFailure'].includes(done.hook_event_name)&&done.tool_use_id===row.tool_use_id));
  const latestPrompt=rows.findLast(row=>row.hook_event_name==='UserPromptSubmit');
  const arrived=readClaudeRows(record.transcript,128*1024*1024).some(row=>(row.type==='user'&&row.uuid===plan.continuationId||row.type==='attachment'&&row.attachment?.type==='queued_command')&&JSON.stringify(row).includes(marker));
  if(!isDeepStrictEqual(argv,expected)||env.IMPOWER_CLAUDE_CLAIM_ID!==plan.continuationId||env.CLAUDE_EFFORT!==plan.writerEffort||!arrived||ended||!uuid(display?.turn_id)||!uuid(display?.prompt_id)||!uuid(display?.message_id)||!final||typeof tool?.tool_use_id!=='string'||!tool.tool_use_id||tool.commandDigest!==digest||matching.length!==1||tool.prompt_id!==display.prompt_id||latestPrompt&&latestPrompt.prompt_id!==display.prompt_id||later.some(row=>['Stop','SessionEnd','UserPromptSubmit'].includes(row.hook_event_name)||['PostToolUse','PostToolUseFailure'].includes(row.hook_event_name)&&row.tool_use_id===tool.tool_use_id)||tool.effort?.level!==plan.writerEffort||!isDeepStrictEqual({permissionMode:tool.permission_mode},plan.permissions))throw new Error('Current Claude claim proof or receiving-turn configuration unavailable or changed');
  const assistant=readClaudeRows(record.transcript,128*1024*1024).findLast(row=>row.type==='assistant'&&row.message?.model&&row.message.model!=='<synthetic>');
  if(assistant?.message.model!==plan.writer)throw new Error('Current Claude claim model configuration changed');
  return{turnId:display.turn_id,model:plan.writer,effort:tool.effort.level,permissions:plan.permissions};
}

// This socket has no accepted-turn acknowledgment or verified queued-message
// retraction. The journal owner decides whether submission is allowed, once.
export function sendClaudeFrame(record,envelope,{connect=endpoint=>net.createConnection(endpoint),timeoutMs=3000}={}) {
  return new Promise((resolve,reject)=>{
    let socket,settled=false,writeInvoked=false;
    const finish=(error)=>{if(settled)return;settled=true;clearTimeout(timer);socket?.destroy();if(error&&!writeInvoked)resolve({status:'not-sent',reason:'Claude endpoint unavailable before any frame write'});else if(error)reject(new Error('Claude submission is uncertain; reconcile without resending'));else resolve({status:'written-awaiting-native-receipt'});};
    const timer=setTimeout(()=>finish(true),timeoutMs);
    try {
      socket=connect(record.socket.replace(/^uds:/,''));
      socket.once('error',()=>finish(true));socket.once('close',()=>{if(!settled)finish(true);});
      socket.once('connect',()=>{
        try {
        const marker=claudeReceiptMarker(envelope.continuationId);
        const instruction=envelope.authorizedAction==='inspect-blocked-review'
          ?`Display exactly ${marker} on its own line to acknowledge this terminal review event, then follow the guarded recovery instructions below.\n${continuationPrompt(envelope)}`
          :`Display exactly ${marker} on its own line to acknowledge this continuation, then follow the guarded instructions below. For the claim, invoke Bash with exactly this command, without additions or rewriting:\n${renderClaudeClaimCommand(envelope.claimCommand)}\n${continuationPrompt(envelope)}`;
        const content=instruction;
        const frame=JSON.stringify({type:'auth',token:record.token})+'\n'+JSON.stringify({type:'user',session_id:record.sessionId,uuid:envelope.continuationId,msg_id:envelope.continuationId,message:{content},priority:'next'})+'\n';
        writeInvoked=true;socket.write(frame,error=>finish(error));
        }catch(error){settled=true;clearTimeout(timer);socket?.destroy();reject(error);}
      });
    }catch{finish(true);}
  });
}

function configuration(record,plan,rows) {
  const start=rows.find(row=>row.hook_event_name==='SessionStart'&&row.session_id===record.sessionId);
  const stop=rows.findLast(row=>row.hook_event_name==='Stop'&&row.session_id===record.sessionId);
  if(start?.model!==plan.writer||stop?.effort?.level!==plan.writerEffort||!isDeepStrictEqual({permissionMode:stop?.permission_mode},plan.permissions))throw new Error('Claude model, effort, or permissions are unverified or changed');
  const assistant=readClaudeRows(record.transcript,128*1024*1024).findLast(row=>row.type==='assistant'&&typeof row.message?.model==='string'&&row.message.model!=='<synthetic>');
  if(assistant?.message.model!==plan.writer)throw new Error('Latest Claude response does not verify the configured writer model');
  return stop;
}

export function claudeContinuationHost({plan,env=process.env,platform=process.platform,identify=processIdentity,send=sendClaudeFrame}={}) {
  const read=destination=>{
    if(platform!=='win32'||destination.host!=='claude-cli-windows')throw new Error('Automatic Claude continuation requires the verified Windows CLI route; use awaited mode');
    return registration(destination,plan);
  };
  const evidence=record=>readClaudeRows(record.receipts).filter(row=>row.session_id===record.sessionId);
  return {
    async preflight(destination,currentPlan=plan) {
      protectPrivatePath(destination.registration,{verifyOnly:true});
      const record=read(destination);
      if(!credentialsMatch(record,env)||!sameIdentity(record.process,identify(record.process.pid)))throw new Error('Automatic review must start inside the live registered Claude task');
      const parent=canonical(path.dirname(currentPlan.jobDir));
      const common=canonical(git(currentPlan.worktree,['rev-parse','--path-format=absolute','--git-common-dir']));
      if(inside(canonical(currentPlan.worktree),parent)||inside(canonical(destination.cwd),parent)||inside(common,parent))throw new Error('Private review job directory must be outside writer/reviewed worktrees and Git administration');
      const rows=evidence(record),stop=configuration(record,currentPlan,rows);
      const display=rows.findLast(row=>row.hook_event_name==='MessageDisplay'&&row.turn_id===destination.turnId);
      const anchor=rows.findLast(row=>row.hook_event_name==='Stop'&&row.prompt_id===display?.prompt_id);
      if(display?.turn_id!==destination.turnId||!anchor||!rows.some(row=>row.hook_event_name==='UserPromptSubmit'&&row.prompt_id===anchor.prompt_id)||rows.some(row=>row.hook_event_name==='SessionEnd'))throw new Error('Claude originating turn or session lifecycle unavailable');
      if(!uuid(destination.turnId)||!stop.prompt_id)throw new Error('Native Claude turn configuration required');
      return {supported:true,host:'claude-cli-windows',version:record.cliVersion,route:'authenticated originating inbox',acceptance:'native MessageDisplay and transcript arrival',retract:'unsupported',cancelTurn:'unsupported'};
    },
    async inspect(destination,currentPlan=plan) {
      try {
      const record=read(destination);
      if(!sameIdentity(record.process,identify(record.process.pid)))return{state:'disconnected'};
      const rows=evidence(record),stop=configuration(record,currentPlan,rows);
      if(rows.some(row=>row.hook_event_name==='SessionEnd'))return{state:'disconnected'};
      // Effort changes during a new prompt have no reliable early hook receipt.
      // Keep our outbox pending until a native Stop establishes the current route.
      const transcript=readClaudeRows(record.transcript,128*1024*1024);
      const lastPrompt=rows.findLast(row=>row.hook_event_name==='UserPromptSubmit');
      if(lastPrompt&&lastPrompt.prompt_id!==stop.prompt_id)return{state:'unknown'};
      const user=transcript.findLast(row=>row.type==='user');
      if(user&&(!Number.isFinite(Date.parse(user.timestamp))||Date.parse(user.timestamp)>Date.parse(stop.at)))return{state:'unknown'};
      return{state:'idle'};
      }catch(error){return{state:'unknown',reason:error.message};}
    },
    async submit(envelope) {
      let record;
      try {
        const destination=plan.destination;record=read(destination);
        if(envelope.destination.threadId!==record.sessionId||envelope.destination.turnId!==destination.turnId||envelope.destination.cwd!==destination.cwd||!uuid(envelope.continuationId)||!sameIdentity(record.process,identify(record.process.pid)))throw new Error('Claude destination identity changed before dispatch');
      }catch(error){return{status:'not-sent',reason:error.message};}
      return send(record,envelope);
    },
    async reconcile(envelope) {
      const record=read(plan.destination);
      if(envelope.destination.threadId!==record.sessionId||envelope.destination.turnId!==plan.destination.turnId||envelope.destination.cwd!==plan.destination.cwd||!uuid(envelope.continuationId))throw new Error('Claude receipt destination mismatch');
      const marker=claudeReceiptMarker(envelope.continuationId),rows=evidence(record);
      const transcript=readClaudeRows(record.transcript,128*1024*1024);
      const arrived=transcript.some(row=>(row.type==='user'&&row.uuid===envelope.continuationId||row.type==='attachment'&&row.attachment?.type==='queued_command')&&JSON.stringify(row).includes(marker));
      if(!arrived)return{status:'uncertain'};
      const turns=new Set(rows.filter(row=>row.hook_event_name==='MessageDisplay'&&uuid(row.turn_id)&&uuid(row.message_id)&&typeof row.delta==='string'&&row.delta.split(/\r?\n/).some(line=>line.trim()===marker)&&rows.some(done=>done.hook_event_name==='MessageDisplay'&&done.final===true&&done.turn_id===row.turn_id&&done.message_id===row.message_id)).map(row=>row.turn_id));
      if(turns.size!==1)return{status:'uncertain'};
      return{status:'accepted',turnId:[...turns][0]};
    },
    async retract(){return{status:'unsupported'};},
    async cancelTurn(){return{status:'unsupported'};},
  };
}
