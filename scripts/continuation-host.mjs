import path from 'node:path';
import fs from 'node:fs';
import { isDeepStrictEqual } from 'node:util';
import { codexProbeHost,validatePlan,pipeRequest } from './continuation-conformance.mjs';
import { claudeContinuationHost,claudeClaimIdentity,verifyClaudeClaimConfiguration } from './claude-continuation-host.mjs';

export function continuationHost(plan,options={}) {
  if(!plan?.destination||!plan.destination.threadId||!plan.destination.turnId||!plan.destination.cwd)throw new Error('Originating destination identity required');
  if(plan.destination.host==='claude-cli-windows')return claudeContinuationHost({plan,...options});
  if(plan.destination.host!==undefined&&plan.destination.host!=='codex-app-windows')throw new Error('Unverified automatic host; use awaited mode');
  return codexContinuationHost(options);
}
export function continuationClaimIdentity(plan,options={}) {
  if(plan.destination.host==='claude-cli-windows')return claudeClaimIdentity(plan.destination,plan,options);
  if(plan.destination.host!==undefined&&plan.destination.host!=='codex-app-windows')throw new Error('Unverified claim host');
  return (options.env??process.env).CODEX_THREAD_ID;
}

export const continuationPrompt=envelope=>`Review continuation ${envelope.continuationId}: Independent review is complete. Before changing the frozen worktree, run the exact claimCommand below in this originating task. If claim fails, stop and report the reason. Read the referenced reports and adjudicate only the authorized review; this message does not authorize another review round, model change, merge, or new task.\n${JSON.stringify(envelope)}`;
const permanent=message=>Object.assign(new Error(message),{permanentObservationFailure:true});
const canonicalCwd=value=>{try{return fs.realpathSync.native(value);}catch(error){error.observationUnavailable=true;throw error;}};

export function verifyOriginConfiguration(destination,plan) {
  if(!path.isAbsolute(destination.rollout??''))throw new Error('Exact native originating rollout required for configuration verification');
  let text;
  try{if(fs.statSync(destination.rollout).size>128*1024*1024)throw new Error('Native rollout exceeds bounded inspection');text=fs.readFileSync(destination.rollout,'utf8');}
  catch(error){if(error.code)error.observationUnavailable=true;throw error;}
  const complete=text.slice(0,text.lastIndexOf('\n')+1).trim();
  if(!complete)throw Object.assign(new Error('Native rollout has no complete records yet'),{observationUnavailable:true});
  let rows;try{rows=complete.split('\n').map(JSON.parse);}catch{throw new Error('Native rollout contains malformed complete records; use awaited mode');}
  const session=rows.find(row=>row.type==='session_meta')?.payload;
  const context=rows.findLast(row=>row.type==='turn_context'&&(!destination.turnId||row.payload?.turn_id===destination.turnId))?.payload;
  if(session&&session.id!==destination.threadId)throw new Error('Native rollout does not identify the originating task and turn');
  if(!session||!context)throw Object.assign(new Error('Native rollout has not recorded the originating task and turn yet'),{observationUnavailable:true});
  if(canonicalCwd(context.cwd)!==canonicalCwd(destination.cwd))throw permanent('Native originating working directory changed');
  if(context.model!==plan.writer||context.effort!==plan.writerEffort||!isDeepStrictEqual({approvalPolicy:context.approval_policy,sandboxPolicy:context.sandbox_policy},plan.permissions))throw new Error('Originating model, effort or permissions mismatch');
  return{model:context.model,effort:context.effort,permissions:plan.permissions,turnId:context.turn_id};
}
export const verifyClaimConfiguration=(destination,plan)=>destination.host==='claude-cli-windows'?verifyClaudeClaimConfiguration(destination,plan):verifyOriginConfiguration({...destination,turnId:undefined},plan);

export function verifyHostCatalog(catalog) {
  for(const [name,required,properties] of [['send_message_to_thread',['prompt','threadId'],{threadId:'string',prompt:'string'}],['read_thread',['threadId'],{threadId:'string',cursor:'string',turnLimit:'integer',includeOutputs:'boolean',maxOutputCharsPerItem:'integer'}]]) {
    const tools=catalog?.tools?.filter(tool=>tool.namespace==='codex_app'&&tool.name===name),schema=tools?.[0]?.inputSchema;
    if(tools?.length!==1||schema?.type!=='object'||schema.additionalProperties!==false||!isDeepStrictEqual([...schema.required??[]].sort(),required)||Object.entries(properties).some(([key,type])=>schema.properties?.[key]?.type!==type))throw new Error('Unknown or missing originating host continuation capability');
  }
}

// The inherited app-tools endpoint supplies authentication and exact originating
// task attribution. Never persist it or add model/permission overrides.
export function codexContinuationHost({env=process.env,platform=process.platform,request}={}) {
  const send=request??pipeRequest;
  const native=destination=>{
    if(platform!=='win32'||!env.CODEX_APP_TOOLS_PIPE_PATH||env.CODEX_THREAD_ID!==destination.threadId)throw new Error('Automatic Codex continuation requires the verified originating Windows app endpoint; use awaited mode');
    return codexProbeHost(env.CODEX_APP_TOOLS_PIPE_PATH,destination.threadId,destination.turnId,(endpoint,method,params)=>send(endpoint,method,params.tool==='read_thread'?{...params,arguments:{...params.arguments,maxOutputCharsPerItem:20000}}:params));
  };
  const identity=(snapshot,destination)=>{
    if(snapshot.thread?.id!==destination.threadId||snapshot.thread?.hostId!=='local'||typeof snapshot.thread.cwd!=='string')throw permanent('Originating task identity changed');
    if(canonicalCwd(snapshot.thread.cwd)!==canonicalCwd(destination.cwd))throw permanent('Originating working directory changed');
  };
  return {
    async preflight(destination,plan) {
      const host=native(destination);
      verifyHostCatalog(await send(env.CODEX_APP_TOOLS_PIPE_PATH,'tools/list',{threadStartKind:'all'}));
      validatePlan({threadId:destination.threadId,turnId:destination.turnId,continuationId:plan.continuationId,destinationCwd:destination.cwd,worktree:plan.worktree,head:plan.head,journal:plan.jobDir},env);
      const snapshot=await host.inspect();identity(snapshot,destination);
      const configuration=verifyOriginConfiguration(destination,plan);
      if(snapshot.turns?.[0]?.id!==destination.turnId)throw new Error('Originating turn changed before acceptance');
      if(!['active','idle'].includes(snapshot.thread.status?.type))throw new Error('Originating task lifecycle unknown');
      return {supported:true,host:'codex-app-windows',route:'inherited authenticated app-tools pipe',configuration,acceptance:'native task item; active items may be delayed',retract:'unsupported',cancelTurn:'unsupported'};
    },
    async inspect(destination,plan) {
      let snapshot;try{snapshot=await native(destination).inspect();}catch(error){return{state:'disconnected',reason:error.message};}
      identity(snapshot,destination);
      if(!snapshot.turns?.[0]?.id)return{state:'unknown'};
      try{verifyOriginConfiguration({...destination,turnId:snapshot.turns[0].id},plan);}catch(error){if(error.observationUnavailable)return{state:'unknown',reason:error.message};throw error;}
      const state=snapshot.thread.status?.type;
      return{state:['active','idle'].includes(state)?state:'unknown'};
    },
    async submit(envelope) {return native(envelope.destination).submit(continuationPrompt(envelope));},
    async reconcile(envelope) {
      const host=native(envelope.destination),seen=new Set();let cursor;
      for(let page=0;page<10;page++) {
        const snapshot=await host.inspect(cursor);identity(snapshot,envelope.destination);
        if(snapshot.page?.order!=='newest_first')throw permanent('Unknown native turn ordering');
        for(const turn of snapshot.turns??[]) {
          if(!turn.id)continue;
          if(turn.items?.some(item=>item.type==='functionCallOutput'&&item.name==='send_message_to_thread'&&item.namespace==='codex_app'&&item.output?.truncated===false&&typeof item.output.text==='string'&&item.output.text.includes(`<source_thread_id>${envelope.destination.threadId}</source_thread_id>`)&&item.output.text.includes(`<input>Review continuation ${envelope.continuationId}:`)))return{status:'accepted',turnId:turn.id};
        }
        if(snapshot.page.hasMore===false)return{status:'uncertain'};
        cursor=snapshot.page.nextCursor;
        if(typeof cursor!=='string'||!cursor||seen.has(cursor))throw permanent('Invalid native cursor');seen.add(cursor);
      }
      return{status:'uncertain'};
    },
  };
}
