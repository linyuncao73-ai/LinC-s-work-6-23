import{G as O,g as T,T as u}from"./geminiClient-Q5Csk93W.js";import{A as x,g as k}from"./index-66Sy14d4.js";async function B(h,p){const f=new O({apiKey:k()}),n=`
    You are parsing a delivery broker's WhatsApp reply that assigns drivers to routes.

    CURRENT ROUTE TABLE (the only valid targets — every assignment you output
    MUST use one of these exact routeNum values as its base):
    ${p.map(r=>`${r.routeNum} (current driver ${r.driverId||"none"}, ${r.orderVolume} parcels, team ${r.driverGroup})`).join(`
`)}

    THE BROKER'S REPLY:
    ---
    ${h}
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
  `,s=await T(f,{contents:n,config:{responseMimeType:"application/json",temperature:0,responseSchema:{type:u.OBJECT,properties:{assignments:{type:u.ARRAY,items:{type:u.OBJECT,properties:{routeNum:{type:u.STRING,description:"Exact base routeNum from the table, e.g. '33029-3-2'"},segments:{type:u.ARRAY,items:{type:u.OBJECT,properties:{driverId:{type:u.STRING,description:"Numeric driver ID"},volume:{type:u.NUMBER,description:"Parcel count for this segment; omit if not stated"}},required:["driverId"]}}},required:["routeNum","segments"]}}},required:["assignments"]}}}),c=JSON.parse(s.text||"{}"),v=new Set(p.map(r=>r.routeNum));return(c.assignments||[]).map(r=>({routeNum:String(r.routeNum||"").trim(),segments:(Array.isArray(r.segments)?r.segments:[]).map(o=>({driverId:String(o.driverId||"").replace(/\D/g,""),volume:typeof o.volume=="number"&&o.volume>0?Math.round(o.volume):null})).filter(o=>o.driverId!=="")})).filter(r=>v.has(r.routeNum)&&r.segments.length>0)}function D(h,p,f){const m=[];let n=[...h];for(const s of p){const c=`${s.routeNum}.`,v=n.filter(e=>e.routeNum.startsWith(c)),y=v.reduce((e,t)=>e+(Number(t.orderVolume)||0),0);v.length>0&&(n=n.filter(e=>!e.routeNum.startsWith(c)));const r=n.findIndex(e=>e.routeNum===s.routeNum);if(r===-1){m.push(`${s.routeNum}: 表格里找不到这条线，已跳过`);continue}const o=n[r],l=(Number(o.orderVolume)||0)+y,b=x.includes(o.driverGroup||""),E=s.segments.reduce((e,t)=>e+(t.volume??0),0),d=s.segments.filter(e=>e.volume===null).length;let i;if(d>0){const e=Math.max(0,l-E),t=Math.floor(e/d);let a=e-t*d;i=s.segments.map($=>{if($.volume!==null)return $.volume;const R=t+(a>0?1:0);return a>0&&a--,R}),d>1&&m.push(`${s.routeNum}: ${d} 段未写件数，已平分剩余量`)}else i=s.segments.map(e=>e.volume);const g=i.reduce((e,t)=>e+t,0);if(g!==l&&i.length>0){const e=l-g,t=i[i.length-1]+e;t>0?(i[i.length-1]=t,m.push(`${s.routeNum}: 反馈件数合计 ${g} ≠ 货量 ${l}，最后一段已调整为 ${t}`)):m.push(`${s.routeNum}: 反馈件数合计 ${g} 与货量 ${l} 差距过大，按反馈原样套用（总量不符，请检查）`)}const I=e=>{const t=f[e];return{name:(t==null?void 0:t.name)||`Driver ${e}`,group:(t==null?void 0:t.group)||(b?o.driverGroup:"Unassigned")}},N=I(s.segments[0].driverId),S={...o,driverId:s.segments[0].driverId,driverName:N.name,driver:N.name,driverGroup:N.group,orderVolume:i[0],isSplit:s.segments.length>1?!0:o.isSplit,capacityStatus:void 0,capacityExcess:0,isDriverOff:!1},A=s.segments.slice(1).map((e,t)=>{const a=I(e.driverId);return{...o,id:`fb-${o.id}-${t}-${Date.now()}`,routeNum:`${o.routeNum}.${t+1}`,parentId:o.id,isSplit:!0,driverId:e.driverId,driverName:a.name,driver:a.name,driverGroup:a.group,orderVolume:i[t+1],capacityStatus:void 0,capacityExcess:0,isDriverOff:!1}});n=[...n.slice(0,r),S,...A,...n.slice(r+1)]}return{routes:n,notes:m}}export{D as applyFeedbackOps,B as parseBrokerFeedback};
