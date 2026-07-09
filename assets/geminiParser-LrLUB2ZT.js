import{G as M,g as v,T as t}from"./geminiClient-ASKKQqJR.js";import{g as V,a as $,S as w,Z as S,b as B}from"./index-DU9sl-vJ.js";async function L(s){return new Promise((i,l)=>{const o=new FileReader;o.onloadend=()=>{const R=o.result.split(",")[1];i({inlineData:{data:R,mimeType:s.type}})},o.onerror=()=>l(new Error("文件读取失败，请重试")),o.readAsDataURL(s)})}const C=s=>{const i=[],l=/(\d+)-(\d+)\(([^)]+)\)/g;let o;for(;(o=l.exec(s))!==null;)i.push({start:parseInt(o[1]),end:parseInt(o[2]),ident:o[3].trim()});return i},J=async(s,i)=>{const l=new M({apiKey:V()}),o=await L(s),E=await v(l,{contents:{parts:[o,{text:`
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
  `}]},config:{responseMimeType:"application/json",temperature:0,responseSchema:{type:t.OBJECT,properties:{batchId:{type:t.STRING},date:{type:t.STRING},rows:{type:t.ARRAY,items:{type:t.OBJECT,properties:{routeNum:{type:t.STRING},totalVolume:{type:t.NUMBER},segments:{type:t.ARRAY,items:{type:t.OBJECT,properties:{start:{type:t.NUMBER,description:"Segment range start, e.g. 1"},end:{type:t.NUMBER,description:"Segment range end, e.g. 157"},subRoute:{type:t.STRING,description:"Complete text inside the parentheses, e.g. '33011-2-1'"}},required:["start","end","subRoute"]}},allocationString:{type:t.STRING,description:"Backup: the raw 预派发规则 cell text"},scanId:{type:t.STRING},timeSlot:{type:t.STRING}},required:["routeNum","totalVolume","segments"]}}},required:["rows"]}}}),d=JSON.parse(E.text||"{}"),U=d.rows||[],u=[];let I=0,m=d.date||"";return m||(m=$()),U.forEach((a,f)=>{const r=String(a.routeNum||"").trim();if(!/^33\d{3}/.test(r))return;I+=a.totalVolume||0;const y=Array.isArray(a.segments)?a.segments.filter(e=>typeof(e==null?void 0:e.start)=="number"&&typeof(e==null?void 0:e.end)=="number"&&String((e==null?void 0:e.subRoute)||"").trim()!=="").map(e=>({start:e.start,end:e.end,ident:String(e.subRoute).trim()})):[],T=y.length>0?y:C(a.allocationString||""),A=B(r),N=a.timeSlot||A;T.length>0?T.forEach((e,p)=>{const G=e.end-e.start+1;let c="",g="Unknown",O=e.ident,h="Unassigned",b="Unassigned";if(e.ident.includes("-")){c=e.ident;const n=e.ident.split("-");if(n.length>=3){const x=n[0],D=n[n.length-1];g=S[`${x}-${D}`]||"Unknown"}}else{const n=i[e.ident];h=(n==null?void 0:n.name)||`Driver ${e.ident}`,b=(n==null?void 0:n.group)||"Unassigned",c=`${r}-${p+1}`,g=S[`${r}-${p+1}`]||"Unknown"}u.push({id:`IMG-${c}-${f}-${p}`,driver:h,driverId:O,driverName:h,driverGroup:b,routeNum:c,routeLocation:g,timeSlot:N,orderVolume:G,scanId:a.scanId||w[r]||"????"})}):u.push({id:`IMG-SINGLE-${r}-${f}`,driver:"Unassigned",driverId:"",driverName:"Unassigned",driverGroup:"Unassigned",routeNum:r,routeLocation:S[r]||"Unknown",timeSlot:N,orderVolume:a.totalVolume||0,scanId:a.scanId||w[r]||"????"})}),{routes:u,batchInfo:{date:m,batchId:d.batchId||"IMG-EXTRACT-"+Date.now(),totalVolume:I}}};export{C as parseAllocationSegments,J as parseImageFile};
