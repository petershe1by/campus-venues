import {createServer} from 'node:http';
import {PGlite} from '@electric-sql/pglite';
import {createServer as createVite} from 'vite';
import {SQLStore} from '../server/store.mjs';
import {makeHandler} from '../server/http.mjs';
import {mkdir} from 'node:fs/promises';
await mkdir('.local-data',{recursive:true});
const db=new PGlite('.local-data/database');
const store=new SQLStore((q,p)=>db.query(q,p),fn=>db.transaction(tx=>fn((q,p)=>tx.query(q,p))));await store.init();
if(!process.env.ADMIN_USERNAME||!process.env.ADMIN_INITIAL_PASSWORD) {console.error('Set ADMIN_USERNAME and ADMIN_INITIAL_PASSWORD (12+ characters) in the current terminal before starting.');process.exit(1);}
const handler=makeHandler(async()=>store,process.env,{secure:false});
const server=createServer(async(req,res)=>{
  const chunks=[];for await(const c of req)chunks.push(c);const body=Buffer.concat(chunks);
  const request=new Request(`http://${req.headers.host}${req.url}`,{method:req.method,headers:req.headers,...(['GET','HEAD'].includes(req.method)?{}:{body})});
  const response=await handler(request,{ip:req.socket.remoteAddress});res.writeHead(response.status,Object.fromEntries(response.headers));res.end(Buffer.from(await response.arrayBuffer()));
});server.listen(8788,'127.0.0.1');
const vite=await createVite({server:{host:'127.0.0.1',port:5173},define:{'import.meta.env.VITE_API_ENABLED':'"true"'}});await vite.listen();vite.printUrls();
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,async()=>{await vite.close();server.close();await db.close();process.exit();});
