// Pure validation of authored inputs to pinned Vitest's native blob merge.
// Native blobs expose file/projectName; projectRoot/pool remain configured
// selection metadata and are not represented as stronger blob identities.
import fs from "node:fs";
import path from "node:path";
import {createHash} from "node:crypto";

const canonical=file=>fs.realpathSync.native(file);
const digest=bytes=>createHash("sha256").update(bytes).digest("hex");
const ordinary=file=>{
  const stat=fs.lstatSync(file);
  if(!stat.isFile()||stat.isSymbolicLink())throw new Error("Expected an ordinary authored artifact: "+file);
};
function blobIdentity(text) {
  const table=JSON.parse(text);
  const dereference=value=>{
    if(typeof value!=="string"||!/^(0|[1-9][0-9]*)$/.test(value)
      ||!Number.isSafeInteger(Number(value))||Number(value)>=table.length)throw new Error("Malformed native blob reference");
    return table[Number(value)];
  };
  if(!Array.isArray(table)||!Array.isArray(table[0])||table[0].length!==5)throw new Error("Malformed native blob root");
  const version=dereference(table[0][0]),files=dereference(table[0][1]);
  if(typeof version!=="string"||!Array.isArray(files))throw new Error("Malformed native blob identities");
  return {version,files:files.map(reference=>{
    const result=dereference(reference);
    const filepath=dereference(result.filepath),projectName=result.projectName==null?"":dereference(result.projectName);
    if(typeof filepath!=="string"||typeof projectName!=="string")throw new Error("Malformed native blob file identity");
    return {file:canonical(filepath),projectName};
  })};
}

export function validateAggregateInputs(file,requestHash,packageRoot) {
  ordinary(file);
  const bytes=fs.readFileSync(file);
  if(digest(bytes)!==requestHash)throw new Error("Aggregate request binding changed");
  const request=JSON.parse(bytes);
  if(request.version!==1||request.packageRoot!==canonical(packageRoot)
    ||!Array.isArray(request.blobs)||!request.blobs.length||typeof request.failed!=="boolean"
    ||canonical(request.directory)!==request.directory)throw new Error("Invalid aggregate request");
  const names=fs.readdirSync(request.directory).sort(),expected=request.blobs.map(blob=>blob.name).sort();
  if(JSON.stringify(names)!==JSON.stringify(expected)||new Set(expected).size!==expected.length)
    throw new Error("Aggregate blob set is missing, extra, or duplicated");
  for(const blob of request.blobs) {
    if(typeof blob.name!=="string"||path.basename(blob.name)!==blob.name
      ||!/^[a-f0-9-]{36}\.json$/.test(blob.name)||typeof blob.sha256!=="string")throw new Error("Invalid aggregate blob identity");
    const artifact=path.join(request.directory,blob.name);
    ordinary(artifact);
    if(canonical(artifact)!==artifact||digest(fs.readFileSync(artifact))!==blob.sha256)throw new Error("Aggregate blob binding changed");
    const {version,files}=blobIdentity(fs.readFileSync(artifact,"utf8"));
    const actual=files.sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b)));
    const selected=blob.specifications.map(spec=>({file:spec.file,projectName:spec.projectName}))
      .sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b)));
    if(version!==request.vitestVersion||JSON.stringify(actual)!==JSON.stringify(selected))
      throw new Error("Aggregate blob version/specification binding changed");
  }
  return {request,expected};
}
