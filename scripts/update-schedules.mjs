import {writeFile,readFile} from 'node:fs/promises';
export const leagues = [
 ['eng.1','Premier League','England'],['esp.1','LaLiga','Spain'],['ger.1','Bundesliga','Germany'],['ita.1','Serie A','Italy'],['fra.1','Ligue 1','France'],['usa.1','MLS','United States'],['mex.1','Liga MX','Mexico'],['bra.1','Brasileirão','Brazil'],['arg.1','Liga Profesional','Argentina'],['jpn.1','J1 League','Japan'],['aus.1','A-League','Australia'],['uefa.champions','Champions League','Europe']
].map(([id,name,country])=>({id,name,country}));
const target=new URL('../data/schedule.json',import.meta.url);
let previous={matches:[]};try{previous=JSON.parse(await readFile(target,'utf8'));}catch{}
const start=new Date();start.setUTCHours(0,0,0,0);
const days=Array.from({length:8},(_,i)=>new Date(+start+i*86400000).toISOString().slice(0,10));
const matches=new Map(),failures=[];
const jobs=leagues.flatMap(l=>days.map(day=>({l,day})));
async function worker(){while(jobs.length){const {l,day}=jobs.shift();try{
 const url=`https://site.api.espn.com/apis/site/v2/sports/soccer/${l.id}/scoreboard?dates=${day.replaceAll('-','')}`;
 const r=await fetch(url,{signal:AbortSignal.timeout(25000)});if(!r.ok)throw Error(`HTTP ${r.status}`);
 const data=await r.json();if(!Array.isArray(data.events))throw Error('Missing events');
 for(const e of data.events){const c=e.competitions?.[0],home=c?.competitors?.find(t=>t.homeAway==='home'),away=c?.competitors?.find(t=>t.homeAway==='away');if(!home||!away||!Number.isFinite(Date.parse(e.date)))continue;
 const broadcasters=[...new Set((c.geoBroadcasts||[]).filter(b=>String(b.region).toLowerCase()==='us').map(b=>b.media?.shortName).filter(Boolean))];
 matches.set(e.id,{id:e.id,league:l.id,date:e.date,timeConfirmed:c.timeValid!==false,home:home.team.displayName,away:away.team.displayName,venue:c.venue?.fullName||'',status:c.status?.type?.description||'Scheduled',state:c.status?.type?.state||'pre',homeScore:home.score,awayScore:away.score,broadcasters,url:`https://www.espn.com/soccer/match/_/gameId/${e.id}`});}
 }catch(err){failures.push({league:l.id,date:day,message:err.message});}}}
await Promise.all(Array.from({length:4},worker));
if(failures.length===leagues.length*days.length)throw Error('All schedule requests failed; keeping previous snapshot.');
for(const m of previous.matches||[]){if(failures.some(f=>f.league===m.league&&m.date.startsWith(f.date))&&!matches.has(m.id))matches.set(m.id,{...m,retained:true});}
const result={updatedAt:new Date().toISOString(),from:days[0],through:days.at(-1),leagues,failures,matches:[...matches.values()].sort((a,b)=>a.date.localeCompare(b.date))};
await writeFile(target,JSON.stringify(result,null,2)+'\n');
console.log(`Saved ${result.matches.length} matches. ${failures.length} of ${leagues.length*days.length} requests failed.`);
