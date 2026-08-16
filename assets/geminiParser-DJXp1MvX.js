import{G as T,g as w,T as o}from"./geminiClient-kuHEepZl.js";import{b as E,S as N,Z as R,g as U,c as A}from"./index-DrAdzviF.js";async function G(l){return new Promise((u,c)=>{const n=new FileReader;n.onloadend=()=>{const m=n.result.split(",")[1];u({inlineData:{data:m,mimeType:l.type}})},n.onerror=()=>c(new Error("文件读取失败，请重试")),n.readAsDataURL(l)})}const v=l=>{const u=[],c=/(\d+)-(\d+)\(([^)]+)\)/g;let n;for(;(n=c.exec(l))!==null;)u.push({start:parseInt(n[1]),end:parseInt(n[2]),ident:n[3].trim()});return u},x=async(l,u)=>{const c=new T({apiKey:U()}),n=await G(l),i=await w(c,{contents:{parts:[n,{text:`
    Extract driver dispatch data from this screenshot of a UniUni dashboard ("YOW 取货表").

    1. Look for global metadata at the top:
       - "发货日期" (Dispatch Date) -> extract as date (e.g., 2026-07-03)
       - "发货批次" (Batch ID) -> extract as batchId (e.g., OSUB-202607012041)

    2. Extract the table. For each row:
       - "路线号" (Route #) -> routeNum (e.g., 33011)
       - "货量" (Volume) -> totalVolume
       - "扫单号" (Scan ID) -> scanId
       - "预派发规则" (Allocation Rules) -> parse into the segments array (see below)
       - "时间" (Time) -> timeSlot only if visible; don't guess.

    THE MOST IMPORTANT COLUMN is "预派发规则". It contains comma-separated
    segments of the form "START-END(SUB_ROUTE)". You must parse EVERY segment
    into the segments array.

    Example: the cell "1-157(33011-2-1),158-288(33011-2-2)" becomes
      segments: [
        { "start": 1,   "end": 157, "subRoute": "33011-2-1" },
        { "start": 158, "end": 288, "subRoute": "33011-2-2" }
      ]

    Rules for segments:
    - subRoute is the COMPLETE text inside the parentheses, e.g. "33011-2-1"
      or "33022-4-3". Never shorten it.
    - The cell text often WRAPS ACROSS MULTIPLE LINES — read the whole cell
      and capture every segment before moving to the next row.
    - Self-check: the number of segments must equal the "拆分份数" (split
      count) column of the same row. If they don't match, re-read the cell.

    Return a JSON object with batchId (string), date (string),
    and rows (array of route objects with routeNum, totalVolume, scanId, segments).
  `}]},config:{responseMimeType:"application/json",temperature:0,responseSchema:{type:o.OBJECT,properties:{batchId:{type:o.STRING},date:{type:o.STRING},rows:{type:o.ARRAY,items:{type:o.OBJECT,properties:{routeNum:{type:o.STRING},totalVolume:{type:o.NUMBER},segments:{type:o.ARRAY,items:{type:o.OBJECT,properties:{start:{type:o.NUMBER,description:"Segment range start, e.g. 1"},end:{type:o.NUMBER,description:"Segment range end, e.g. 157"},subRoute:{type:o.STRING,description:"Complete text inside the parentheses, e.g. '33011-2-1'"}},required:["start","end","subRoute"]}},allocationString:{type:o.STRING,description:"Backup: the raw 预派发规则 cell text"},scanId:{type:o.STRING},timeSlot:{type:o.STRING}},required:["routeNum","totalVolume","segments"]}}},required:["rows"]}}}),p=JSON.parse(i.text||"{}"),r=p.rows||[];let d=p.date||"";d||(d=A());const a=r.map(t=>{const g=Array.isArray(t.segments)?t.segments.filter(e=>typeof(e==null?void 0:e.start)=="number"&&typeof(e==null?void 0:e.end)=="number"&&String((e==null?void 0:e.subRoute)||"").trim()!=="").map(e=>({start:e.start,end:e.end,ident:String(e.subRoute).trim()})):[];return{routeNum:String(t.routeNum||"").trim(),totalVolume:Number(t.totalVolume)||0,scanId:t.scanId?String(t.scanId):void 0,timeSlot:t.timeSlot?String(t.timeSlot):void 0,segments:g.length>0?g:v(t.allocationString||"")}});return{routes:D(a,u,d,"IMG"),batchInfo:{date:d,batchId:p.batchId||"IMG-EXTRACT-"+Date.now(),totalVolume:a.filter(t=>/^33\d{3}/.test(t.routeNum)).reduce((t,g)=>t+g.totalVolume,0)}}};function D(l,u,c,n){const m=[];return l.forEach((i,p)=>{const r=i.routeNum;if(!/^33\d{3}/.test(r))return;const d=i.timeSlot||E(r);i.segments.length>0?i.segments.forEach((a,t)=>{const g=a.end-a.start+1;let e="",h="Unknown",y=a.ident,S="Unassigned",I="Unassigned";if(a.ident.includes("-")){e=a.ident;const s=a.ident.split("-");if(s.length>=3){const f=s[0],b=s[s.length-1];h=R[`${f}-${b}`]||"Unknown"}}else{const s=u[a.ident];S=(s==null?void 0:s.name)||`Driver ${a.ident}`,I=(s==null?void 0:s.group)||"Unassigned",e=`${r}-${t+1}`,h=R[`${r}-${t+1}`]||"Unknown"}m.push({id:`${n}-${e}-${p}-${t}`,driver:S,driverId:y,driverName:S,driverGroup:I,routeNum:e,routeLocation:h,timeSlot:d,orderVolume:g,scanId:i.scanId||N[r]||"????"})}):m.push({id:`${n}-SINGLE-${r}-${p}`,driver:"Unassigned",driverId:"",driverName:"Unassigned",driverGroup:"Unassigned",routeNum:r,routeLocation:R[r]||"Unknown",timeSlot:d,orderVolume:i.totalVolume||0,scanId:i.scanId||N[r]||"????"})}),m}export{D as buildRoutesFromRows,v as parseAllocationSegments,x as parseImageFile};
