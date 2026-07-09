import{G as A,g as R,T as v}from"./geminiClient-ujBPQvXN.js";import{A as w,g as O}from"./index-CvASSAPH.js";function D(m){const a=m.match(/^(.*?)\.(\d+)$/);return a?{base:a[1],segIdx:parseInt(a[2])}:{base:m,segIdx:0}}function M(m,a){const e=m.split("-").filter(t=>t!=="");if(e.length<2)return null;const r=e[0],o=e[e.length-1];for(const t of a){if(t.routeNum===m)return t.routeNum;const i=t.routeNum.split("-"),l=i[0],p=i[i.length-1];if((l===r||r.length>=2&&l.endsWith(r))&&p===o){if(e.length>=3&&i.length>=3&&e[1]!==i[1])continue;return t.routeNum}}return null}const I=m=>m.replace(/\s+/g,"").replace(/\.+$/,"");function G(m){const a=m.replace(/[\u200B-\u200D\u2060\uFEFF]/g,"").replace(/^[•\-\*\s]+/,"").trim();if(!a||/^(sum|total|tomorrow|thanks|some changes|driver id\s*$)/i.test(a))return[];let e=a.match(/^Driver\s*ID\s*(\d{3,7})\s*[:：]\s*([\d\s\-.]+?)(?:\((\d+)\s*-\s*(\d+)\))?\s*$/i);if(e){const r=e[3]!==void 0?parseInt(e[4])-parseInt(e[3])+1:null;return[{driverId:e[1],routeToken:I(e[2]),volume:r}]}if(e=a.match(/^(\d{3,7})\s*@[^(]*\(#\s*([\d\-. ]+)\)(.*)$/),e){const r=[...(e[3]||"").matchAll(/\[(\d+)\]/g)],o=r.length>0?parseInt(r[r.length-1][1]):null;return[{driverId:e[1],routeToken:I(e[2]),volume:o}]}if(e=a.match(/^([\d\s\-.]+?)\s*[:：]\s*(.+)$/),e&&/^\d/.test(e[1])){const r=I(e[1]),o=e[2],t=[];for(const i of o.matchAll(/(\d{3,7})\s*(?:\(\s*(\d+)\s*\))?/g))t.push({driverId:i[1],routeToken:r,volume:i[2]!==void 0?parseInt(i[2]):null});return t}if(e=a.match(/^(\d{4,7})\s*-\s*(33[\d\-. ]+?)\.?\s*(?:(\d+)\s*pk?ge?s?)?\s*$/i),e)return[{driverId:e[1],routeToken:I(e[2]),volume:e[3]!==void 0?parseInt(e[3]):null}];if(e=a.match(/^(\d{3,7})\s+([\d\-. ]+?)(?:\s*[#＃]\s*(\d+)|\s+(\d+)\s*件)?\s*$/),e&&e[2].includes("-")){const r=e[3]!==void 0?parseInt(e[3]):e[4]!==void 0?parseInt(e[4]):null;return[{driverId:e[1],routeToken:I(e[2]),volume:r}]}return[]}function L(m,a){const e=new Map;let r=0;for(const t of m.split(/\r?\n/))for(const i of G(t)){const{base:l,segIdx:p}=D(i.routeToken),n=M(l,a);n&&(e.has(n)||e.set(n,[]),e.get(n).push({segIdx:p,order:r++,seg:{driverId:i.driverId,volume:i.volume}}))}const o=[];for(const[t,i]of e)i.sort((l,p)=>l.segIdx-p.segIdx||l.order-p.order),o.push({routeNum:t,segments:i.map(l=>l.seg)});return o}async function U(m,a){const e=new A({apiKey:O()}),o=`
    You are parsing a delivery broker's WhatsApp reply that assigns drivers to routes.

    CURRENT ROUTE TABLE (the only valid targets — every assignment you output
    MUST use one of these exact routeNum values as its base):
    ${a.map(n=>`${n.routeNum} (current driver ${n.driverId||"none"}, ${n.orderVolume} parcels, team ${n.driverGroup})`).join(`
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
  `,t=await R(e,{contents:o,config:{responseMimeType:"application/json",temperature:0,responseSchema:{type:v.OBJECT,properties:{assignments:{type:v.ARRAY,items:{type:v.OBJECT,properties:{routeNum:{type:v.STRING,description:"Exact base routeNum from the table, e.g. '33029-3-2'"},segments:{type:v.ARRAY,items:{type:v.OBJECT,properties:{driverId:{type:v.STRING,description:"Numeric driver ID"},volume:{type:v.NUMBER,description:"Parcel count for this segment; omit if not stated"}},required:["driverId"]}}},required:["routeNum","segments"]}}},required:["assignments"]}}}),i=JSON.parse(t.text||"{}"),l=new Set(a.map(n=>n.routeNum));return(i.assignments||[]).map(n=>({routeNum:String(n.routeNum||"").trim(),segments:(Array.isArray(n.segments)?n.segments:[]).map(d=>({driverId:String(d.driverId||"").replace(/\D/g,""),volume:typeof d.volume=="number"&&d.volume>0?Math.round(d.volume):null})).filter(d=>d.driverId!=="")})).filter(n=>l.has(n.routeNum)&&n.segments.length>0)}function j(m,a,e){const r=new Map;for(const o of m){const t=a.find(l=>l.routeNum===o.routeNum),i=(t==null?void 0:t.driverGroup)||"Unassigned";for(const l of o.segments)l.driverId&&!e[l.driverId]&&!r.has(l.driverId)&&r.set(l.driverId,i)}return[...r.entries()].map(([o,t])=>({id:o,group:t}))}function C(m,a,e){const r=[];let o=[...m];for(const t of a){const i=`${t.routeNum}.`,l=o.filter(s=>s.routeNum.startsWith(i)),p=l.reduce((s,u)=>s+(Number(u.orderVolume)||0),0);l.length>0&&(o=o.filter(s=>!s.routeNum.startsWith(i)));const n=o.findIndex(s=>s.routeNum===t.routeNum);if(n===-1){r.push(`${t.routeNum}: 表格里找不到这条线，已跳过`);continue}const d=o[n],f=(Number(d.orderVolume)||0)+p,k=w.includes(d.driverGroup||""),S=t.segments.reduce((s,u)=>s+(u.volume??0),0),h=t.segments.filter(s=>s.volume===null).length;let c;if(h>0){const s=Math.max(0,f-S),u=Math.floor(s/h);let g=s-u*h;c=t.segments.map(b=>{if(b.volume!==null)return b.volume;const E=u+(g>0?1:0);return g>0&&g--,E}),h>1&&r.push(`${t.routeNum}: ${h} 段未写件数，已平分剩余量`)}else c=t.segments.map(s=>s.volume);const N=c.reduce((s,u)=>s+u,0);if(N!==f&&c.length>0){const s=f-N,u=c[c.length-1]+s;u>0?(c[c.length-1]=u,r.push(`${t.routeNum}: 反馈件数合计 ${N} ≠ 货量 ${f}，最后一段已调整为 ${u}`)):r.push(`${t.routeNum}: 反馈件数合计 ${N} 与货量 ${f} 差距过大，按反馈原样套用（总量不符，请检查）`)}const $=s=>{const u=e[s];return{name:(u==null?void 0:u.name)||`Driver ${s}`,group:(u==null?void 0:u.group)||(k?d.driverGroup:"Unassigned")}},y=$(t.segments[0].driverId),T={...d,driverId:t.segments[0].driverId,driverName:y.name,driver:y.name,driverGroup:y.group,orderVolume:c[0],isSplit:t.segments.length>1?!0:d.isSplit,capacityStatus:void 0,capacityExcess:0,isDriverOff:!1},x=t.segments.slice(1).map((s,u)=>{const g=$(s.driverId);return{...d,id:`fb-${d.id}-${u}-${Date.now()}`,routeNum:`${d.routeNum}.${u+1}`,parentId:d.id,isSplit:!0,driverId:s.driverId,driverName:g.name,driver:g.name,driverGroup:g.group,orderVolume:c[u+1],capacityStatus:void 0,capacityExcess:0,isDriverOff:!1}});o=[...o.slice(0,n),T,...x,...o.slice(n+1)]}return{routes:o,notes:r}}export{C as applyFeedbackOps,j as collectUnknownDrivers,U as parseBrokerFeedback,L as parseFeedbackTextLocal};
