import { expect, it } from "vitest";
import { buildAttributeVocabulary, diagnoseRareAttributeOptions, evaluateAttributeVisibility } from "../../attributes";
import { createRasterImageDefinitions } from "../../attributes/rasterSource";
import { SparkdownCompiler } from "../../compiler/classes/SparkdownCompiler";

it("explains a missing resting choice only in visible scopes, without changing visibility", () => {
 const v=buildAttributeVocabulary([{key:"shown",name:"details"},{key:"a",parent:"shown",name:"face.happy"},{key:"hidden",name:"hat.on"},{key:"b",parent:"hidden",name:"face.sad"}]);
 const result=evaluateAttributeVisibility(v,{});
 expect(result.visible["a"]).toBe(false);
 expect(result.diagnostics.filter(d=>d.code==="missing-folder-default")).toEqual([expect.objectContaining({folder:"details",path:"shown",group:"face"})]);
 expect(evaluateAttributeVisibility(v,{face:"happy"}).diagnostics.some(d=>d.code==="missing-folder-default")).toBe(false);
 const inherited=buildAttributeVocabulary([{key:"a",name:"face.happy:default"},{key:"folder",name:"details"},{key:"b",parent:"folder",name:"face.happy"}]);
 expect(evaluateAttributeVisibility(inherited,{}).diagnostics.some(d=>d.code==="missing-folder-default")).toBe(false);
});
it("warns about corroborated close spellings rather than every one-off option",()=>{
 const v=buildAttributeVocabulary([{key:"a",name:"face.angry"},{key:"b",name:"face.angry"},{key:"c",name:"face.angyr"},{key:"d",name:"face.surprised"},{key:"e",name:"hat.on"}]);
 const diagnostics=diagnoseRareAttributeOptions([v]);
 expect(diagnostics).toEqual([expect.objectContaining({group:"face",layer:"face.angyr",path:"c"})]);
 expect(diagnostics[0]!.message).toContain("face.angry");
});
const raster=(name:string)=>({uri:"file:///project/assets/mia/"+name,type:"image" as const,name,ext:"png",src:"/"+name});
it("reports unnumbered siblings only in recognized raster folders",()=>{
 expect(createRasterImageDefinitions([raster("body.png")]).diagnostics).toEqual([]);
 expect(createRasterImageDefinitions([raster("90_body.png"),raster("face.png")]).diagnostics).toEqual([expect.objectContaining({uri:raster("face.png").uri,folder:"mia",message:expect.stringContaining("NN_face.png")})]);
});
const compile=(text:string,files:any[])=>{const uri="file:///project/main.sd";const c=new SparkdownCompiler();c.configure({files:[{uri,type:"script",name:"main",ext:"sd",version:1,languageId:"sparkdown",text},...files]});return c.compile({textDocument:{uri}}).program;};
const message=(d:any)=>typeof d.message==="string"?d.message:d.message.value;
it("routes unused artwork warnings once to the asset with unique hierarchy paths",()=>{
 const uri="file:///project/assets/mia.svg";
 const p=compile("",[{uri,type:"image",name:"mia",ext:"svg",data:'<svg><g data-name="face.happy:default"/><g data-name="face.sad:default"/></svg>'}]);
 expect(p.diagnostics?.[uri]?.filter(d=>message(d).includes("multiple defaults"))).toHaveLength(1);
 expect(p.diagnostics?.["file:///project/main.sd"]??[]).not.toEqual(expect.arrayContaining([expect.objectContaining({message:expect.objectContaining({value:expect.stringContaining("multiple defaults")})})]));
});
it("suppresses automatic raster naming warnings for explicit layered image overrides",()=>{
 const files=[raster("90_body.png"),raster("face.png")];
 expect(compile("",files).diagnostics?.[files[1]!.uri]?.some(d=>message(d).includes("NN_face.png"))).toBe(true);
 expect(compile('define mia as layered_image with\n assets = {}\nend\n',files).diagnostics?.[files[1]!.uri]?.some(d=>message(d).includes("NN_face.png"))).not.toBe(true);
});

it("keeps selection warnings at the script and links their source artwork",()=>{
 const uri="file:///project/assets/mia.svg";
 const p=compile("[[mia:face.unknown]]",[{uri,type:"image",name:"mia",ext:"svg",data:'<svg><g data-name="face.happy:default"/></svg>'}]);
 const d=p.diagnostics?.["file:///project/main.sd"]?.find(d=>message(d).includes('face.unknown'));
 expect(d?.relatedInformation).toEqual(expect.arrayContaining([expect.objectContaining({location:expect.objectContaining({uri})})]));
});

it("disambiguates duplicate layer labels in static diagnostics",()=>{
 const v=buildAttributeVocabulary([{key:"left",name:"same"},{key:"a",parent:"left",name:"face..bad"},{key:"right",name:"same"},{key:"b",parent:"right",name:"face..bad"}]);
 expect(v.diagnostics.filter(d=>d.layer==="face..bad").map(d=>d.path)).toEqual(["a","b"]);
});
