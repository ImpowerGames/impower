import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {checkProxyAuthTemplate} from './codex-proxy-auth.mjs';

// The native Codex route's sandbox guarantees were first observed on this
// build. Later releases are accepted; the doctor check below still requires
// complete elevated provisioning on whatever build is installed.
export const minimumCodexVersion='0.154.0';
// The full-access route depends on user-level hooks.json loading under
// --ignore-user-config with --dangerously-bypass-hook-trust, first observed here.
export const minimumFullAccessCodexVersion='0.159.0';

// A plain release version at or above the minimum. Prereleases are refused,
// since a prerelease of the minimum predates the build that was observed.
export function isSupportedCodexVersion(version,minimumVersion=minimumCodexVersion) {
  const parse=value=>/^(\d+)\.(\d+)\.(\d+)$/.exec(String(value??'').trim())?.slice(1).map(Number);
  const actual=parse(version),minimum=parse(minimumVersion);
  if(!actual)return false;
  for(let i=0;i<3;i++)if(actual[i]!==minimum[i])return actual[i]>minimum[i];
  return true;
}

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

// A native Codex step either runs in the elevated sandbox or, selected by
// `--sandbox danger-full-access`, as the user under the repository hooks.
export function codexReviewMode(step) {
  const args=step?.args??[];
  for(let index=1;index<args.length-1;index++)if(['--sandbox','-s'].includes(args[index])&&args[index+1]==='danger-full-access')return 'full-access';
  return 'sandboxed';
}

// A container has no Codex home on disk, so it receives the contents of
// auth.json as an environment secret instead. The plan names only the variable;
// its value is never echoed, not even in a parse error.
const codexAuthVariable=/^[A-Z][A-Z0-9_]{0,63}$/;
export function readCodexAuthSecret(permission,source=process.env) {
  const name=permission?.codexAuthEnv;
  if(typeof name!=='string'||!codexAuthVariable.test(name))throw new Error('step permissions.codexAuthEnv must name an upper-case environment variable');
  const value=source[name];
  if(typeof value!=='string'||!value.trim())throw new Error(`Codex authentication secret ${name} is not set in the launcher's environment`);
  if(Buffer.byteLength(value)>1024*1024)throw new Error(`Codex authentication secret ${name} exceeds 1 MiB`);
  let parsed;try{parsed=JSON.parse(value);}catch{parsed=undefined;}
  if(!parsed||typeof parsed!=='object'||Array.isArray(parsed))throw new Error(`Codex authentication secret ${name} must hold the JSON object from auth.json`);
  if(permission.codexAuthProxied!==true)return Buffer.from(value);
  // The proxy adds the real token, so the variable holds only a template, and
  // a fresh refresh time keeps Codex from trying to refresh the placeholders.
  checkProxyAuthTemplate(parsed);
  return Buffer.from(JSON.stringify({...parsed,last_refresh:new Date().toISOString()}));
}

// The secret's copy is removed once the reviewer's exit is confirmed, so it
// does not outlive the reviewer in the container.
export function discardCodexAuthCopy(step,env) {
  if(step?.permissions?.codexAuthEnv===undefined||!env?.CODEX_HOME)return;
  fs.rmSync(path.join(env.CODEX_HOME,'auth.json'),{force:true});
}

// The full-access route copies only the authentication file into its fresh home.
export function validateCodexAuthHome(permission,worktree) {
  if(!path.isAbsolute(permission?.codexHome??''))throw new Error('Existing Codex home with auth.json required as step permissions.codexHome');
  const sourceHome=fs.realpathSync.native(permission.codexHome);
  for(const root of [fs.realpathSync.native(permission.cwd),fs.realpathSync.native(worktree)])if(within(root,sourceHome)||within(sourceHome,root))throw new Error('Existing Codex credentials must be separate from review and repository roots');
  const file=path.join(sourceHome,'auth.json'),stat=fs.statSync(file);
  if(!stat.isFile()||stat.size>1024*1024||!within(sourceHome,fs.realpathSync.native(file)))throw new Error('Existing Codex authentication unavailable or outside its declared home');
  return sourceHome;
}

// The shared hook entry point of the checkout running this launcher. Run from
// the reviewed worktree, that is the reviewed head's policy, which is no less
// trusted than the launcher code the same checkout already supplies.
export const reviewerHookEntry=path.join(path.dirname(path.dirname(fileURLToPath(import.meta.url))),'.agents','hooks','pre-tool-use.mjs');

// Codex loads $CODEX_HOME/hooks.json even with --ignore-user-config, and the
// reviewer's working directory is outside any checkout, so project hooks never
// apply. A hook command that fails without exit 2 lets the tool call through,
// so every failure of the wrapper is converted to exit 2.
export function installReviewerHooks(home,{node=process.execPath,entry=reviewerHookEntry}={}) {
  if(!fs.statSync(entry,{throwIfNoEntry:false})?.isFile())throw new Error(`Repository hook entry point missing at ${entry}; reviewer not launched`);
  // Single-quoted literals: neither shell expands `$` inside them, so a path
  // holding `$name` cannot resolve to a different policy file. PowerShell also
  // ends a literal at the typographic single quotes, so those are doubled too.
  const posix=value=>"'"+value.replaceAll("'","'\"'\"'")+"'",powershell=value=>"'"+value.replace(/['‘’‚‛]/g,'$&$&')+"'";
  const hook={type:'command',timeout:10,
    command:`${posix(node)} ${posix(entry)} codex || { printf "%s\\n" "Repository hook: Node policy check failed." >&2; exit 2; }`,
    commandWindows:`$ErrorActionPreference = "Stop"; try { & ${powershell(node)} ${powershell(entry)} codex; if ($LASTEXITCODE -ne 0) { throw "Node policy check failed." } } catch { [Console]::Error.WriteLine("Repository hook: " + $_.Exception.Message); exit 2 }`};
  const file=path.join(home,'hooks.json');
  fs.writeFileSync(file,JSON.stringify({hooks:{PreToolUse:[{matcher:'^(Bash|apply_patch|Write|Edit)$',hooks:[hook]}]}},null,2),{flag:'wx'});
  return file;
}

// A secret's copy written before a later refusal is removed with the refusal.
export function nativeReviewerEnvironment(step,privateDirectory,source=process.env,options={}) {
  const secrets=[];
  try{return buildNativeReviewerEnvironment(step,privateDirectory,source,options,secrets);}
  catch(error){for(const file of secrets)fs.rmSync(file,{force:true});throw error;}
}

function buildNativeReviewerEnvironment(step,privateDirectory,source,{worktree,reportPosting},secrets) {
  const env=reviewerEnvironment(source);
  env.GIT_OPTIONAL_LOCKS='0';
  const codexReview=step.nativeResult==='codex-jsonl'||(step.model?.startsWith('gpt-')&&step.args?.[0]==='exec');
  if(!codexReview)return env;
  if(step.nativeResult==='codex-jsonl'&&codexReviewMode(step)==='full-access') {
    const secret=step.permissions?.codexAuthEnv!==undefined;
    const auth=secret?readCodexAuthSecret(step.permissions,source):fs.readFileSync(path.join(validateCodexAuthHome(step.permissions,worktree),'auth.json'));
    // The secret's home lies outside the job directory, which is retained as
    // review evidence after the reviewer exits.
    const home=fs.realpathSync.native(fs.mkdtempSync(secret?path.join(os.tmpdir(),'impower-codex-home-'):path.join(privateDirectory,'codex-home-')));
    protectPrivatePath(home);
    const fd=fs.openSync(path.join(home,'auth.json'),'wx',0o600);
    if(secret)secrets.push(path.join(home,'auth.json'));
    try{protectPrivatePath(path.join(home,'auth.json'));fs.writeFileSync(fd,auth);}finally{fs.closeSync(fd);}
    if(secret)delete env[step.permissions.codexAuthEnv];
    installReviewerHooks(home);
    for(const key of Object.keys(env))if(/^(?:CODEX_|OPENAI_)/i.test(key))delete env[key];
    env.CODEX_HOME=home;
    env.GIT_CONFIG_COUNT='1';env.GIT_CONFIG_KEY_0='safe.directory';env.GIT_CONFIG_VALUE_0=fs.realpathSync.native(worktree).replaceAll('\\','/');
  } else if(step.nativeResult==='codex-jsonl') {
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
    if(!isSupportedCodexVersion(report.codexVersion)||sandbox?.status!=='ok'||sandbox.details?.['sandbox backend']!=='elevated'||sandbox.details?.['sandbox provisioning']!=='complete')throw new Error('Existing elevated sandbox provisioning unavailable; no setup is performed');
  }
  for(const key of Object.keys(env))if(/^GH_|^GITHUB_TOKEN$/i.test(key))delete env[key];
  // A reviewer whose report the coordinator posts receives no GitHub access.
  if(reportPosting==='coordinator')return env;
  // Codex review environments receive report access in memory; never copy its
  // configuration or token to disk.
  let token;
  try{token=execFileSync('gh',['auth','token','--hostname','github.com'],{env:source,encoding:'utf8',windowsHide:true,timeout:15000,maxBuffer:16384,stdio:['ignore','pipe','pipe']}).trim();}
  catch{throw new Error('Existing GitHub authentication unavailable; reviewer not launched (a cloud container without a gh login sets the plan\'s reportPosting to "coordinator")');}
  if(!token||/[\r\n]/.test(token))throw new Error('Existing GitHub authentication invalid; reviewer not launched');
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
