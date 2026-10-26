import postgres from 'postgres';
export const SCHEMA = `CREATE TABLE IF NOT EXISTS campus_venues_state (id integer PRIMARY KEY CHECK (id = 1), data jsonb NOT NULL)`;
export class SQLStore {
  constructor(query,transaction) {this.query=query;this.transaction=transaction;}
  async init() {await this.query(SCHEMA); await this.query(`INSERT INTO campus_venues_state (id,data) VALUES (1,$1::jsonb) ON CONFLICT DO NOTHING`,[JSON.stringify({version:1,users:[],sessions:[],bookings:[],audit:[],attempts:[]})]);}
  async transact(fn) {
    return this.transaction(async query=>{
      const result=await query('SELECT data FROM campus_venues_state WHERE id=1 FOR UPDATE');
      const state=typeof result.rows[0].data==='string'?JSON.parse(result.rows[0].data):result.rows[0].data;
      const value=await fn(state);
      await query('UPDATE campus_venues_state SET data=$1::jsonb WHERE id=1',[JSON.stringify(state)]);
      return value;
    });
  }
}
let storePromise;
export function productionStore() {
  if(!storePromise) storePromise=(async()=>{
    if(!process.env.DATABASE_URL) {
      const {getDatabase}=await import('@netlify/database');
      const {pool}=getDatabase();
      const transaction=async fn=>{const client=await pool.connect();try{await client.query('BEGIN');const value=await fn((q,p=[])=>client.query(q,p));await client.query('COMMIT');return value;}catch(e){await client.query('ROLLBACK');throw e;}finally{client.release();}};
      const store=new SQLStore((q,p=[])=>pool.query(q,p),transaction);await store.init();return store;
    }
    const sql=postgres(process.env.DATABASE_URL,{max:2,idle_timeout:20,connect_timeout:10,prepare:false});
    const query=async(q,p=[])=>({rows:await sql.unsafe(q,p)});
    const transaction=fn=>sql.begin(async s=>fn(async(q,p=[])=>({rows:await s.unsafe(q,p)})));
    const store=new SQLStore(query,transaction);await store.init();return store;
  })().catch(e=>{storePromise=undefined;throw e;});
  return storePromise;
}
