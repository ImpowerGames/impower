import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {execFileSync} from 'node:child_process';

export function reviewerEnvironment(source=process.env) {
  return Object.fromEntries(Object.entries(source).filter(([name])=>!(/^(?:CLAUDE_|CLAUDECODE$|CODEX_(?!HOME$)|NODE_REPL_|CUA_|GIT_)/i.test(name))));
}

export function nativeReviewerEnvironment(step,privateDirectory,source=process.env) {
  const env=reviewerEnvironment(source);
  env.GIT_OPTIONAL_LOCKS='0';
  if(step.nativeResult!=='codex-jsonl')return env;
  const home=fs.mkdtempSync(path.join(privateDirectory,'codex-home-'));
  protectPrivatePath(home);
  const sourceHome=source.CODEX_HOME??path.join(os.homedir(),'.codex'),auth=path.join(sourceHome,'auth.json');
  if(fs.existsSync(auth)) {
    const target=path.join(home,'auth.json');fs.writeFileSync(target,fs.readFileSync(auth),{flag:'wx',mode:0o600});protectPrivatePath(target);
  } else if(!source.OPENAI_API_KEY)throw new Error('Native Codex reviewer requires available authorized authentication');
  for(const key of Object.keys(env))if(/^CODEX_|^OPENAI_(?:BASE_URL|API_BASE)$/i.test(key))delete env[key];
  env.CODEX_HOME=home;
  return env;
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
