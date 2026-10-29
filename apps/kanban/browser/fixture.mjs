import {createServer} from 'node:http';
import {once} from 'node:events';
import {readFile} from 'node:fs/promises';
import {randomBytes} from 'node:crypto';
import {createTestHarness} from '@embody/testing';
import {definePlugin,HookVetoError} from '@embody/core';
import {compileGenUiManifest} from '@embody/genui';
import config from '../dist/embody.config.js';
const guard=definePlugin({id:'qa-guard',version:'1.0.0',hooks:{'tracker.task.beforeUpdate':payload=>{if(payload.current.data.title==='Protected fixture'&&payload.patch.status==='done')throw new HookVetoError('Protected fixture cannot be completed.');}}});
export async function startDragFixture() {
const h=await createTestHarness({plugins:[...config.plugins,guard]});
const actor=h.asAgent('browser-test');
const project=await actor.call('tracker.project.create',{data:{name:'Drag interaction test'}});
const other=await actor.call('tracker.project.create',{data:{name:'Foreign board'}});
const create=(projectId,title)=>actor.call('tracker.task.create',{data:{projectId,title,definitionOfDone:'Saved moves are verified.'}});
const task=await create(project.id,'Draggable fixture');await create(project.id,'Protected fixture');await create(other.id,'Must stay outside scoped board');
const input={projectId:project.id,offset:0,limit:50};
const result=async(target,args)=>{try{const value=await actor.call(target,args);return {content:[{type:'text',text:JSON.stringify(value)}],structuredContent:value};}catch(error){return {isError:true,_meta:{'embody/errorCode':error.code??'UNCERTAIN_OUTCOME'},content:[{type:'text',text:error.message}]};}};
const manifest=compileGenUiManifest(config);
const names={'kanban__tracker_get_board':'tracker.getBoard','kanban__tracker_move_task':'tracker.moveTask'};
const tools=Object.entries(names).map(([name,target])=>({target,appId:'kanban',effect:target==='tracker.getBoard'?'read':'mutation',tool:{name,inputSchema:manifest.actions[target].inputSchema,_meta:{ui:{resourceUri:'ui://kanban/board@1.2.0',visibility:['model','app']}}}}));
const initial=await result('tracker.getBoard',input);
const asset=await readFile(new URL(import.meta.resolve('@embody/genui/renderer-global.js')),'utf8');
const key=randomBytes(24).toString('hex');let origin;const outcomes=[];const calls=[];
const bootstrap=`const frame=document.querySelector('iframe');const hosted=EmbodyGenUi.createGenUiAppBridge({appId:'kanban',generation:'drag-qa',currentGeneration:()=> 'drag-qa',callableTargets:['tracker.getBoard','tracker.moveTask'],tools:${JSON.stringify(tools)},callTool:async(name,input)=>{const response=await fetch('/call',{method:'POST',headers:{Authorization:'Bearer ${key}','Content-Type':'application/json'},body:JSON.stringify({name,input})});return response.json();},publishOutcome:async(outcome)=>{await fetch('/outcome',{method:'POST',headers:{Authorization:'Bearer ${key}','Content-Type':'application/json'},body:JSON.stringify(outcome)});}});hosted.bridge.oninitialized=()=>{hosted.bridge.setHostContext({theme:'light'});void hosted.bridge.sendToolResult(${JSON.stringify(initial).replace(/</g,'\\u003c')});};void hosted.bridge.connect(new EmbodyGenUi.PostMessageTransport(frame.contentWindow,frame.contentWindow));frame.src='/widget';`;
const server=createServer((req,res)=>{void(async()=>{
 res.setHeader('Cache-Control','no-store');
 if(req.url==='/renderer'){res.setHeader('Content-Type','text/javascript');return res.end(asset);}
 if(req.url==='/script'){res.setHeader('Content-Type','text/javascript');return res.end(bootstrap);}
 if(req.url==='/widget'){res.setHeader('Content-Type','text/html');return res.end(config.genui.views.board.resource.text);}
 if(req.url==='/state'){res.setHeader('Content-Type','application/json');return res.end(JSON.stringify({board:await actor.call('tracker.getBoard',input),comments:await actor.call('tracker.comment.list',{filter:{taskId:task.id}}),outcomes,calls}));}
 if(req.method==='GET'&&req.url==='/'){res.setHeader('Content-Type','text/html');return res.end('<!doctype html><html><head><title>GenUI drag QA</title><style>body{margin:0}iframe{border:0;width:100%;height:2000px}</style></head><body><iframe title="Kanban" sandbox="allow-scripts"></iframe><script src="/renderer"></script><script src="/script"></script></body></html>');}
 if(req.method!=='POST'||!['/call','/outcome'].includes(req.url)||req.headers.origin!==origin||req.headers.authorization!==`Bearer ${key}`){res.statusCode=404;return res.end();}
 const chunks=[];let size=0;for await(const chunk of req){size+=chunk.length;if(size>65536)throw Error();chunks.push(chunk);}
 const body=JSON.parse(Buffer.concat(chunks).toString());res.setHeader('Content-Type','application/json');
 if(req.url==='/outcome'){outcomes.push(body);return res.end('{}');}
 if(!(body.name in names))throw Error();calls.push(body);res.end(JSON.stringify(await result(names[body.name],body.input)));
})().catch(error=>{console.error(error.message);res.statusCode=500;res.end('Unavailable');});});
server.listen(0,'127.0.0.1');await once(server,'listening');origin=`http://127.0.0.1:${server.address().port}`;
return { url: origin, state: async () => ({ board: await actor.call('tracker.getBoard', input), comments: await actor.call('tracker.comment.list', {filter:{taskId:task.id}}), calls, outcomes }), close: async () => { server.closeAllConnections(); await new Promise(resolve=>server.close(resolve)); await h.close(); } };
}
