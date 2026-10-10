// Private pinned dependencies for the focused integration job; no repo install.
import fs from 'node:fs';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {processIdentity} from '../reviewer-slots.mjs';

export function verifyDependencies(directory) {
  const canonical=fs.realpathSync.native(directory);
  if(canonical!==directory)throw new Error('Private dependency directory changed');
  const result=JSON.parse(fs.readFileSync(path.join(canonical,'install-result.json'),'utf8'));
  if(result.directory!==canonical||result.timedOut||result.launchError||result.identityError||result.logError||result.logSetupError
    ||result.logCloseErrors?.length||result.publicationErrors?.length||!result.identity||!Number.isSafeInteger(result.identity.pid)
    ||typeof result.identity.start!=='string'||!result.identity.start||result.close?.exit!==0||result.close.signal)
    throw new Error('Private installation lacks admitted original identity/actual close');
  const lock=JSON.parse(fs.readFileSync(path.join(canonical,'package-lock.json'),'utf8'));
  const require=createRequire(path.join(canonical,'package.json'));
  for(const name of ['vitest','@vitest/coverage-v8']) {
    const file=require.resolve(`${name}/package.json`);
    if(!fs.realpathSync.native(file).startsWith(canonical+path.sep))throw new Error('Dependency escaped private installation');
    if(JSON.parse(fs.readFileSync(file,'utf8')).version!=='2.1.9'||lock.packages?.[`node_modules/${name}`]?.version!=='2.1.9')throw new Error(`Expected ${name}@2.1.9`);
  }
  return canonical;
}

// Fixture seam uses an ordinary owned child, never another dependency install.
export async function runPrivateInstaller({directory,command=process.execPath,args,
  identify=processIdentity,launch=spawn,timeoutMs=300000,cleanupMs=10000}) {
  const evidence={directory,pid:null,identity:null,close:null,timedOut:false,launchError:null,
    identityError:null,logSetupError:null,logCloseErrors:[],publicationErrors:[],
    compilerOrInstallDescendantExitClaim:false};
  const publish=(name)=>{
    try {fs.writeFileSync(path.join(directory,name),JSON.stringify(evidence),{flag:'wx'});return true;}
    catch(error) {evidence.publicationErrors.push({name,message:error.message});return false;}
  };
  const descriptors=[];
  const closeDescriptors=()=>{
    for(const fd of descriptors.splice(0))try {fs.closeSync(fd);} catch(error) {evidence.logCloseErrors.push(error.message);}
  };
  try {
    descriptors.push(fs.openSync(path.join(directory,'install.stdout.log'),'wx'));
    descriptors.push(fs.openSync(path.join(directory,'install.stderr.log'),'wx'));
  } catch(error) {
    evidence.logSetupError=error.message;closeDescriptors();publish('install-result.json');return evidence;
  }
  // Record possible launch before spawn. Any publication refusal starts no child.
  if(!publish('install-request.json')) {closeDescriptors();publish('install-result.json');return evidence;}
  const began=Date.now();
  let child,completion;
  try {
    child=launch(command,args,{cwd:directory,windowsHide:true,stdio:['ignore',...descriptors]});
    evidence.pid=child.pid??null;
    // Install both listeners before identity inspection or closing parent logs.
    completion=new Promise(resolve=>{
      child.once('error',error=>{evidence.launchError=error.message;});
      child.once('close',(exit,signal)=>{
        evidence.close={exit,signal};evidence.installMs=Date.now()-began;
        // Preserve observed close before any later await/publication can fail.
        publish('install-close.json');resolve(evidence.close);
      });
    });
    try {
      evidence.identity=child.pid?identify(child.pid):null;
      if(!evidence.identity||evidence.identity.pid!==child.pid||typeof evidence.identity.start!=='string'||!evidence.identity.start)throw new Error('Installer OS identity unavailable');
    } catch(error) {evidence.identityError=error.message;}
    publish('install-owner.json');
  } catch(error) {evidence.launchError=error.message;}
  finally {closeDescriptors();}
  if(child) {
    const unconfirmed=Symbol('install close boundary');
    const wait=async ms=>{
      let timer;
      try {return await Promise.race([completion,new Promise(resolve=>{timer=setTimeout(()=>resolve(unconfirmed),ms);})]);}
      finally {clearTimeout(timer);}
    };
    const stop=()=>{try {child.kill();} catch(error) {evidence.launchError??=error.message;}};
    const failedSetup=evidence.identityError||evidence.launchError||evidence.logCloseErrors.length||evidence.publicationErrors.length;
    if(failedSetup)stop();
    let close=await wait(failedSetup?cleanupMs:Math.max(0,timeoutMs-(Date.now()-began)));
    if(close===unconfirmed&&!failedSetup) {evidence.timedOut=true;stop();close=await wait(cleanupMs);}
    if(close===unconfirmed)child.unref();
  }
  evidence.installMs=Date.now()-began;
  publish('install-result.json');
  return evidence;
}

export async function prepareDependencies(parent) {
  parent=fs.realpathSync.native(parent);
  const directory=fs.mkdtempSync(path.join(parent,'vitest219-'));
  console.log('Private Vitest integration dependency directory: '+directory);
  fs.writeFileSync(path.join(directory,'package.json'),JSON.stringify({name:'impower-private-vitest219',version:'1.0.0',private:true,type:'module',
    dependencies:{vitest:'2.1.9','@vitest/coverage-v8':'2.1.9'}}),{flag:'wx'});
  const nodeDirectory=path.dirname(process.execPath);
  const npm=[path.join(nodeDirectory,'node_modules/npm/bin/npm-cli.js'),path.resolve(nodeDirectory,'../lib/node_modules/npm/bin/npm-cli.js')].find(file=>fs.existsSync(file));
  if(!npm)throw new Error('Bundled npm CLI unavailable; no installation fallback');
  const evidence=await runPrivateInstaller({directory,args:[npm,'install','--ignore-scripts','--no-audit','--no-fund']});
  if(evidence.timedOut||evidence.launchError||evidence.identityError||evidence.logSetupError||evidence.logCloseErrors.length
    ||evidence.publicationErrors.length||!evidence.close||evidence.close.exit!==0||evidence.close.signal)throw new Error('Pinned private installation failed; retained '+directory);
  verifyDependencies(directory);
  console.log('Pinned private dependency install completed: '+JSON.stringify(evidence));
  return directory;
}

if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  if(process.argv.length!==3||!path.isAbsolute(process.argv[2]))throw new Error('Usage: node scripts/fixtures/test-suite-vitest-dependencies.mjs <absolute-existing-private-parent>');
  const directory=await prepareDependencies(process.argv[2]);
  if(process.env.GITHUB_ENV)fs.appendFileSync(process.env.GITHUB_ENV,`IMPOWER_TEST_VITEST_DEPENDENCIES=${directory}\n`);
}
