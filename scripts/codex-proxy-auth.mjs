// A Codex ChatGPT login for a cloud container whose network proxy adds the
// access token to requests for chatgpt.com. The container receives only a
// template: the auth.json shape with the account ID, the identity token's
// claims without its signature, and placeholders in place of every token.
// Run it where `codex login` wrote auth.json:
//   node scripts/codex-proxy-auth.mjs template [auth.json]      (for the environment variable)
//   node scripts/codex-proxy-auth.mjs access-token [auth.json]  (for the proxy's Bearer credential)
// It imports nothing from the repository, so it also runs as a lone copy.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

export const proxyTokenPlaceholder='proxy-injected';
const unsigned='unsigned';
const topFields=['OPENAI_API_KEY','auth_mode','tokens','last_refresh'];
const tokenFields=['id_token','access_token','refresh_token','account_id'];

const loginTokens=auth=>{
  const tokens=auth?.tokens;
  if(!tokens||typeof tokens!=='object'||typeof tokens.access_token!=='string'||typeof tokens.id_token!=='string'||tokens.id_token.split('.').length!==3)throw new Error('auth.json holds no ChatGPT login (tokens.id_token and tokens.access_token); run codex login first');
  return tokens;
};

// Only the fields Codex reads for a ChatGPT login are kept, so a field a later
// release adds cannot carry a credential into the container unnoticed.
export function proxyAuthTemplate(auth) {
  const tokens=loginTokens(auth);
  const [header,payload]=tokens.id_token.split('.');
  return {
    OPENAI_API_KEY:null,
    ...(typeof auth.auth_mode==='string'?{auth_mode:auth.auth_mode}:{}),
    tokens:{id_token:`${header}.${payload}.${unsigned}`,access_token:proxyTokenPlaceholder,refresh_token:proxyTokenPlaceholder,...(typeof tokens.account_id==='string'?{account_id:tokens.account_id}:{})},
    last_refresh:new Date().toISOString(),
  };
}

// The launcher accepts a template only when it can authenticate nothing by
// itself. Messages name fields, never values.
export function checkProxyAuthTemplate(template) {
  const problems=[];
  if(!template||typeof template!=='object'||Array.isArray(template))throw new Error('Codex proxy authentication template must be a JSON object');
  const extra=Object.keys(template).filter(key=>!topFields.includes(key));
  if(extra.length)problems.push(`unexpected fields ${extra.join(', ')}`);
  if(template.OPENAI_API_KEY!==undefined&&template.OPENAI_API_KEY!==null)problems.push('OPENAI_API_KEY must be null');
  if(template.auth_mode!==undefined&&typeof template.auth_mode!=='string')problems.push('auth_mode must be a string');
  const tokens=template.tokens;
  if(!tokens||typeof tokens!=='object'||Array.isArray(tokens))problems.push('tokens must be an object');
  else {
    const extraTokens=Object.keys(tokens).filter(key=>!tokenFields.includes(key));
    if(extraTokens.length)problems.push(`unexpected tokens fields ${extraTokens.join(', ')}`);
    for(const key of ['access_token','refresh_token'])if(tokens[key]!==proxyTokenPlaceholder)problems.push(`tokens.${key} must be the placeholder "${proxyTokenPlaceholder}"`);
    const parts=typeof tokens.id_token==='string'?tokens.id_token.split('.'):[];
    if(parts.length!==3||parts[2]!==unsigned||!parts[0]||!parts[1])problems.push(`tokens.id_token must be the identity token's header and claims with the signature replaced by "${unsigned}"`);
    if(tokens.account_id!==undefined&&typeof tokens.account_id!=='string')problems.push('tokens.account_id must be a string');
  }
  if(problems.length)throw new Error(`Codex proxy authentication template is not a template (create it with node scripts/codex-proxy-auth.mjs template): ${problems.join('; ')}`);
}

if(process.argv[1]&&fs.realpathSync(process.argv[1])===fileURLToPath(import.meta.url)) {
  try {
    const [command,file=path.join(process.env.CODEX_HOME||path.join(os.homedir(),'.codex'),'auth.json')]=process.argv.slice(2);
    if(!['template','access-token'].includes(command)||process.argv.length>4)throw new Error('Usage: node scripts/codex-proxy-auth.mjs template|access-token [auth.json]');
    const auth=JSON.parse(fs.readFileSync(file,'utf8'));
    process.stdout.write(command==='template'?JSON.stringify(proxyAuthTemplate(auth)):loginTokens(auth).access_token);
    if(process.stdout.isTTY)process.stdout.write('\n');
  } catch(error){console.error(error.message);process.exitCode=1;}
}
