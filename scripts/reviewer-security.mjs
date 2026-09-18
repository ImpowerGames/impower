import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {execFileSync} from 'node:child_process';

// The native Codex route's sandbox guarantees were observed on this build only.
export const pinnedCodexVersion='0.154.0';

export function reviewerEnvironment(source=process.env) {
  return Object.fromEntries(Object.entries(source).filter(([name])=>!(/^(?:CLAUDE_|CLAUDECODE$|CODEX_|NODE_REPL_|CUA_|GIT_)/i.test(name))));
}

const within=(parent,child)=>{const rel=path.relative(parent,child);return !rel||(!rel.startsWith(`..${path.sep}`)&&rel!=='..'&&!path.isAbsolute(rel));};
const privateInputs=['auth.json','.sandbox/setup_marker.json','.sandbox-secrets/sandbox_users.json'];
export function validateCodexSandboxStorage(permission,privateDirectory,worktree) {
  if(permission?.windowsSandbox!=='elevated'||!path.isAbsolute(permission.sandboxStateHome??''))throw new Error('Explicit elevated Windows sandbox and existing private setup home required');
  const sourceHome=fs.realpathSync.native(permission.sandboxStateHome),storage=fs.existsSync(privateDirectory)?fs.realpathSync.native(privateDirectory):path.join(fs.realpathSync.native(path.dirname(privateDirectory)),path.basename(privateDirectory)),temp=fs.realpathSync.native(os.tmpdir());
  if(within(temp,storage))throw new Error('Native Codex private home must be outside TEMP');
  for(const root of [fs.realpathSync.native(permission.cwd),storage,fs.realpathSync.native(worktree)])if(within(root,sourceHome)||within(sourceHome,root))throw new Error('Existing sandbox credentials must be separate from review and job roots');
  for(const name of privateInputs){const file=path.join(sourceHome,name),stat=fs.statSync(file);if(!stat.isFile()||stat.size>1024*1024||!within(sourceHome,fs.realpathSync.native(file)))throw new Error('Existing private sandbox state unavailable or outside its declared home');}
  return sourceHome;
}

export function nativeReviewerEnvironment(step,privateDirectory,source=process.env,{worktree}={}) {
  const env=reviewerEnvironment(source);
  env.GIT_OPTIONAL_LOCKS='0';
  if(step.nativeResult==='codex-jsonl') {
    const sourceHome=validateCodexSandboxStorage(step.permissions,privateDirectory,worktree);
    const home=fs.realpathSync.native(fs.mkdtempSync(path.join(privateDirectory,'codex-home-')));
    protectPrivatePath(home);
    for(const name of privateInputs){
      const target=path.join(home,name),directory=path.dirname(target);
      if(directory!==home){fs.mkdirSync(directory);protectPrivatePath(directory);}
      const fd=fs.openSync(target,'wx',0o600);
      try{protectPrivatePath(target);fs.writeFileSync(fd,fs.readFileSync(path.join(sourceHome,name)));}finally{fs.closeSync(fd);}
    }
    for(const key of Object.keys(env))if(/^(?:CODEX_|OPENAI_)/i.test(key))delete env[key];
    env.CODEX_HOME=home;
    env.GIT_CONFIG_COUNT='1';env.GIT_CONFIG_KEY_0='safe.directory';env.GIT_CONFIG_VALUE_0=fs.realpathSync.native(worktree).replaceAll('\\','/');
    let output;
    try{output=execFileSync(step.executable,['doctor','--json','-c','windows.sandbox="elevated"'],{cwd:fs.realpathSync.native(step.permissions.cwd),env,encoding:'utf8',windowsHide:true,timeout:60000,maxBuffer:1024*1024,stdio:['ignore','pipe','pipe']});}
    catch(error){output=error.stdout;}
    let report;try{report=JSON.parse(output);}catch{throw new Error('Native Codex sandbox provisioning could not be verified; no setup is performed');}
    const sandbox=report.checks?.['sandbox.helpers'];
    if(report.codexVersion!==pinnedCodexVersion||sandbox?.status!=='ok'||sandbox.details?.['sandbox backend']!=='elevated'||sandbox.details?.['sandbox provisioning']!=='complete')throw new Error('Existing elevated sandbox provisioning unavailable; no setup is performed');
  }
  // The sandbox account cannot read the owner's CLI credential store. Delegate
  // existing report access in memory; never copy its configuration or token to disk.
  let token;
  try{token=execFileSync('gh',['auth','token','--hostname','github.com'],{env:source,encoding:'utf8',windowsHide:true,timeout:15000,maxBuffer:16384,stdio:['ignore','pipe','pipe']}).trim();}
  catch{throw new Error('Existing GitHub authentication unavailable; reviewer not launched');}
  if(!token||/[\r\n]/.test(token))throw new Error('Existing GitHub authentication invalid; reviewer not launched');
  for(const key of Object.keys(env))if(/^GH_|^GITHUB_TOKEN$/i.test(key))delete env[key];
  env.GH_HOST='github.com';env.GH_TOKEN=token;
  env.GH_CONFIG_DIR=fs.realpathSync.native(fs.mkdtempSync(path.join(fs.realpathSync.native(step.nativeResult==='codex-jsonl'?step.permissions.cwd:privateDirectory),'gh-config-')));
  return env;
}

// Windows packaged hosts can expose logical paths that native sandbox children
// cannot resolve. Preserve the validated directory identity, using its physical path.
export function nativeCodexArgs(step,writable) {
  const root=fs.realpathSync.native(step.permissions.cwd),args=[...step.args];
  for(let index=1;index<args.length-1;index++) {
    if(['--cd','-C'].includes(args[index])) {
      if(fs.realpathSync.native(args[index+1])!==root)throw new Error('Native reviewer directory identity changed');
      args[++index]=root;
    } else if(['--output-last-message','-o'].includes(args[index])) {
      const file=args[++index];
      if(fs.existsSync(file)||fs.realpathSync.native(path.dirname(file))!==root)throw new Error('Native report directory identity changed');
      args[index]=path.join(root,path.basename(file));
    }
  }
  return [...args.slice(0,-1),'--add-dir',fs.realpathSync.native(writable),args.at(-1)];
}

// Protect before writing a bearer token. POSIX mode is not a Windows ACL.
export function protectPrivatePath(file,{verifyOnly=false}={}) {
  if(process.platform!=='win32') {
    if(!verifyOnly)fs.chmodSync(file,fs.statSync(file).isDirectory()?0o700:0o600);
    if(fs.statSync(file).mode&0o077)throw new Error('Private path has non-owner permissions');
    return;
  }
  const script=`$ErrorActionPreference='Stop'; $p=$env:IMPOWER_PRIVATE_ACL_PATH; $sid=[System.Security.Principal.WindowsIdentity]::GetCurrent().User; $directory=(Get-Item -LiteralPath $p).PSIsContainer; if($env:IMPOWER_PRIVATE_ACL_VERIFY -ne '1') { if($directory){$acl=[System.Security.AccessControl.DirectorySecurity]::new();$rule=[System.Security.AccessControl.FileSystemAccessRule]::new($sid,'FullControl','ContainerInherit,ObjectInherit','None','Allow')}else{$acl=[System.Security.AccessControl.FileSecurity]::new();$rule=[System.Security.AccessControl.FileSystemAccessRule]::new($sid,'FullControl','Allow')}; $acl.SetAccessRuleProtection($true,$false); $acl.SetOwner($sid); $acl.AddAccessRule($rule); if($directory){[System.IO.Directory]::SetAccessControl($p,$acl)}else{[System.IO.File]::SetAccessControl($p,$acl)} }; $acl=Get-Acl -LiteralPath $p; if(!$acl.AreAccessRulesProtected){throw 'Inherited ACL'}; if($acl.GetOwner([System.Security.Principal.SecurityIdentifier]).Value -ne $sid.Value){throw 'Unexpected owner'}; $rules=@($acl.GetAccessRules($true,$true,[System.Security.Principal.SecurityIdentifier])); if($rules.Count -ne 1 -or $rules[0].IdentityReference.Value -ne $sid.Value -or $rules[0].AccessControlType -ne 'Allow' -or (($rules[0].FileSystemRights -band [System.Security.AccessControl.FileSystemRights]::FullControl) -ne [System.Security.AccessControl.FileSystemRights]::FullControl)){throw 'Non-owner access'}; Write-Output 'owner-only'`;
  try {
    const env={...process.env,IMPOWER_PRIVATE_ACL_PATH:file,IMPOWER_PRIVATE_ACL_VERIFY:verifyOnly?'1':'0'};
    for(const key of Object.keys(env))if(key.toUpperCase()==='PSMODULEPATH')delete env[key];
    const result=execFileSync('powershell.exe',['-NoProfile','-NonInteractive','-Command',script],{encoding:'utf8',windowsHide:true,timeout:15000,stdio:['ignore','pipe','pipe'],env}).trim();
    if(result!=='owner-only')throw new Error('ACL verification failed');
  }catch{throw new Error('Cannot establish owner-only private storage ACL');}
}
