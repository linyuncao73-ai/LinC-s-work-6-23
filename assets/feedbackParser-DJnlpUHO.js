import{G as A,g as R,T as v}from"./geminiClient-DDL7GEsW.js";import{A as O,g as w}from"./index-wwXjajQ2.js";function D(m){const i=m.match(/^(.*?)\.(\d+)$/);return i?{base:i[1],segIdx:parseInt(i[2])}:{base:m,segIdx:0}}function M(m,i){const e=m.split("-").filter(t=>t!=="");if(e.length<2)return null;const n=e[0],a=e[e.length-1];for(const t of i){if(t.routeNum===m)return t.routeNum;const u=t.routeNum.split("-"),d=u[0],p=u[u.length-1];if((d===n||n.length>=2&&d.endsWith(n))&&p===a){if(e.length>=3&&u.length>=3&&e[1]!==u[1])continue;return t.routeNum}}return null}const I=m=>m.replace(/\s+/g,"").replace(/\.+$/,"");function B(m){const i=m.replace(/[\u200B-\u200D\u2060\uFEFF]/g,"").replace(/^[•\-\*\s]+/,"").trim();if(!i||/^(sum|total|tomorrow|thanks|some changes|driver id\s*$)/i.test(i))return[];let e=i.match(/^Driver\s*ID\s*(\d{3,7})\s*[:：]\s*([\d\s\-.]+?)(?:\((\d+)\s*-\s*(\d+)\))?\s*$/i);if(e){const n=e[3]!==void 0?parseInt(e[4])-parseInt(e[3])+1:null;return[{driverId:e[1],routeToken:I(e[2]),volume:n}]}if(e=i.match(/^(\d{3,7})\s*@[^(]*\(#\s*([\d\-. ]+)\)(.*)$/),e){const n=[...(e[3]||"").matchAll(/\[(\d+)\]/g)],a=n.length>0?parseInt(n[n.length-1][1]):null;return[{driverId:e[1],routeToken:I(e[2]),volume:a}]}if(e=i.match(/^([\d\s\-.]+?)\s*[:：]\s*(.+)$/),e&&/^\d/.test(e[1])){const n=I(e[1]),a=e[2],t=[];for(const u of a.matchAll(/(\d{3,7})\s*(?:\(\s*(\d+)\s*\))?/g))t.push({driverId:u[1],routeToken:n,volume:u[2]!==void 0?parseInt(u[2]):null});return t}if(e=i.match(/^(\d{4,7})\s*-\s*(33[\d\-. ]+?)\.?\s*(?:(\d+)\s*pk?ge?s?)?\s*$/i),e)return[{driverId:e[1],routeToken:I(e[2]),volume:e[3]!==void 0?parseInt(e[3]):null}];if(e=i.match(/^(\d{3,7})\s+([\d\-. ]+?)(?:\s*[#＃]\s*(\d+)|\s+(\d+)\s*件)?\s*$/),e&&e[2].includes("-")){const n=e[3]!==void 0?parseInt(e[3]):e[4]!==void 0?parseInt(e[4]):null;return[{driverId:e[1],routeToken:I(e[2]),volume:n}]}return[]}function L(m,i){const e=new Map;let n=0;for(const t of m.split(/\r?\n/))for(const u of B(t)){const{base:d,segIdx:p}=D(u.routeToken),s=M(d,i);s&&(e.has(s)||e.set(s,[]),e.get(s).push({segIdx:p,order:n++,seg:{driverId:u.driverId,volume:u.volume}}))}const a=[];for(const[t,u]of e)u.sort((d,p)=>d.segIdx-p.segIdx||d.order-p.order),a.push({routeNum:t,segments:u.map(d=>d.seg)});return a}async function j(m,i){const e=new A({apiKey:w()}),a=`
    You are parsing a delivery broker's WhatsApp reply that assigns drivers to routes.

    CURRENT ROUTE TABLE (the only valid targets — every assignment you output
    MUST use one of these exact routeNum values as its base):
    ${i.map(s=>`${s.routeNum} (current driver ${s.driverId||"none"}, ${s.orderVolume} parcels, team ${s.driverGroup})`).join(`
`)}

    THE BROKER'S REPLY:
    ---
    ${m}
    ---

    Produce assignments: for each BASE route mentioned, the ordered list of
    {driverId, volume} segments the broker wants.

    HOW TO READ THE REPLY (brokers all write differently):
    - Route shorthand: "22-1" means the route in the table matching 33022-…-1
      (e.g. "33022-4-1"). "29-2" matches 33029-…-2. "33020 - 2" (with spaces)
      means 33020-…-2. Always resolve to an exact routeNum from the table.
    - SUFFIX FOLDING: entries like "29-2 #50", "29-2.1 #120", "29-2.2 #36"
      are ONE base route (33029-…-2) split into 3 ordered segments:
      [{50}, {120}, {36}]. The ".1"/".2" suffixes are cut parts, not separate
      table routes. Same for "33018-2" + "33018-2.1" etc.
    - Volume notations (all mean parcel count): "(190)", "#120", "[147]",
      "135pkges", "135 pkges", "(1 - 150)" = a range meaning 150 parcels.
    - "A(190) to B(100)": two segments — driver A keeps 190, driver B takes 100.
    - "Driver ID 19749: 33020 - 2 (1 - 150)": driver 19749, base 33020-…-2,
      volume 150.
    - "28715-33018-2. 135pkges": driver 28715 first, then route, then volume.
    - Driver + route with NO volume: volume = null (whole line, or the
      remainder of that base route).
    - A line like "• 15165 @ 06:00 AM (#33018-1) [Orleans E] [147]": driver
      15165, base route 33018-…-1, volume 147.
    - Ignore greetings, team names, dates, "Sum:" lines, and anything that
      isn't a driver-route assignment.

    Output every base route mentioned exactly once, with its segments in the
    order they appear in the reply.
  `,t=await R(e,{contents:a,config:{responseMimeType:"application/json",temperature:0,responseSchema:{type:v.OBJECT,properties:{assignments:{type:v.ARRAY,items:{type:v.OBJECT,properties:{routeNum:{type:v.STRING,description:"Exact base routeNum from the table, e.g. '33029-3-2'"},segments:{type:v.ARRAY,items:{type:v.OBJECT,properties:{driverId:{type:v.STRING,description:"Numeric driver ID"},volume:{type:v.NUMBER,description:"Parcel count for this segment; omit if not stated"}},required:["driverId"]}}},required:["routeNum","segments"]}}},required:["assignments"]}}}),u=JSON.parse(t.text||"{}"),d=new Set(i.map(s=>s.routeNum));return(u.assignments||[]).map(s=>({routeNum:String(s.routeNum||"").trim(),segments:(Array.isArray(s.segments)?s.segments:[]).map(l=>({driverId:String(l.driverId||"").replace(/\D/g,""),volume:typeof l.volume=="number"&&l.volume>0?Math.round(l.volume):null})).filter(l=>l.driverId!=="")})).filter(s=>d.has(s.routeNum)&&s.segments.length>0)}function C(m,i,e){const n=[];let a=[...m];for(const t of i){const u=`${t.routeNum}.`,d=a.filter(r=>r.routeNum.startsWith(u)),p=d.reduce((r,o)=>r+(Number(o.orderVolume)||0),0);d.length>0&&(a=a.filter(r=>!r.routeNum.startsWith(u)));const s=a.findIndex(r=>r.routeNum===t.routeNum);if(s===-1){n.push(`${t.routeNum}: 表格里找不到这条线，已跳过`);continue}const l=a[s],f=(Number(l.orderVolume)||0)+p,S=O.includes(l.driverGroup||""),k=t.segments.reduce((r,o)=>r+(o.volume??0),0),h=t.segments.filter(r=>r.volume===null).length;let c;if(h>0){const r=Math.max(0,f-k),o=Math.floor(r/h);let g=r-o*h;c=t.segments.map(b=>{if(b.volume!==null)return b.volume;const E=o+(g>0?1:0);return g>0&&g--,E}),h>1&&n.push(`${t.routeNum}: ${h} 段未写件数，已平分剩余量`)}else c=t.segments.map(r=>r.volume);const N=c.reduce((r,o)=>r+o,0);if(N!==f&&c.length>0){const r=f-N,o=c[c.length-1]+r;o>0?(c[c.length-1]=o,n.push(`${t.routeNum}: 反馈件数合计 ${N} ≠ 货量 ${f}，最后一段已调整为 ${o}`)):n.push(`${t.routeNum}: 反馈件数合计 ${N} 与货量 ${f} 差距过大，按反馈原样套用（总量不符，请检查）`)}const $=r=>{const o=e[r];return{name:(o==null?void 0:o.name)||`Driver ${r}`,group:(o==null?void 0:o.group)||(S?l.driverGroup:"Unassigned")}},y=$(t.segments[0].driverId),T={...l,driverId:t.segments[0].driverId,driverName:y.name,driver:y.name,driverGroup:y.group,orderVolume:c[0],isSplit:t.segments.length>1?!0:l.isSplit,capacityStatus:void 0,capacityExcess:0,isDriverOff:!1},x=t.segments.slice(1).map((r,o)=>{const g=$(r.driverId);return{...l,id:`fb-${l.id}-${o}-${Date.now()}`,routeNum:`${l.routeNum}.${o+1}`,parentId:l.id,isSplit:!0,driverId:r.driverId,driverName:g.name,driver:g.name,driverGroup:g.group,orderVolume:c[o+1],capacityStatus:void 0,capacityExcess:0,isDriverOff:!1}});a=[...a.slice(0,s),T,...x,...a.slice(s+1)]}return{routes:a,notes:n}}export{C as applyFeedbackOps,j as parseBrokerFeedback,L as parseFeedbackTextLocal};
