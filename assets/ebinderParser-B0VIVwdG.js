import{G as R,g as b,T as t}from"./geminiClient-ASKKQqJR.js";import{g as T,n as v}from"./index-DU9sl-vJ.js";async function A(r){return new Promise((o,i)=>{const a=new FileReader;a.onloadend=()=>{const n=a.result.split(",")[1];o({inlineData:{data:n,mimeType:r.type}})},a.onerror=()=>i(new Error("文件读取失败，请重试")),a.readAsDataURL(r)})}async function I(r){try{const o=await createImageBitmap(r),i=document.createElement("canvas");i.width=o.width,i.height=o.height;const a=i.getContext("2d");if(!a)return null;a.drawImage(o,0,0);const n=a.getImageData(0,0,o.width,o.height);return{data:n.data,width:n.width,height:n.height}}catch{return null}}function S(r,o,i){let a=0,n=0,d=0,l=0;for(let y=-3;y<=3;y++)for(let m=-3;m<=3;m++){const f=Math.min(r.width-1,Math.max(0,Math.round(o+m))),p=(Math.min(r.height-1,Math.max(0,Math.round(i+y)))*r.width+f)*4;a+=r.data[p],n+=r.data[p+1],d+=r.data[p+2],l++}return a/=l,n/=l,d/=l,a>150&&a-n>50&&a-d>50}async function O(r){const o=new R({apiKey:T()}),i=await A(r),n=await b(o,{contents:{parts:[i,{text:`
    You are analyzing a weekly driver scheduling spreadsheet called "e-binder".

    Business context: a RED (or pink) BACKGROUND on a date cell is the driver's
    FIXED weekly day off — the company wipes all text from the sheet every week,
    but the red backgrounds stay. So a red cell usually has NO text at all, and
    it always means the driver does not work that day. Text markers like
    "7.6 off" are additional one-time leave notes.

    The spreadsheet structure:
    - Column B: Driver ID (numeric only, e.g. 19492, 4574, 3261)
    - Column C: Driver name (e.g. Fath, Sijiang, Sam)
    - Column D: Notes or preferred routes (ignore)
    - Column E: MAX parcel capacity (numeric, e.g. 300, 250, 200, 150). Use null if empty or "N/A".
    - Remaining columns: date headers like "7-6", "7-7", "7-8", "7-9", "7-10", "7-11", "7-12"

    COORDINATES: all coordinates are normalized to 0-1000 relative to the full
    image (x: left edge = 0, right edge = 1000; y: top = 0, bottom = 1000).

    Your task:
    1. Find all date column headers, left to right. For each output:
       - date: the header text (e.g. "7-6")
       - weekday: the weekday shown under/above the date for that column
         ("Monday" … "Sunday" — the sheet has a weekday header row)
       - xmin / xmax: the horizontal span of that column (normalized 0-1000)
    2. For each driver row where Column B has a numeric ID, extract:
       - driverId (Column B, numbers only as string)
       - driverName (Column C)
       - maxCapacity (Column E as number, or null)
       - ymin / ymax: the vertical span of that driver's own row (normalized
         0-1000) — measure the row band of the cell containing the driver ID.
       - dayColors: walk that driver's date cells LEFT TO RIGHT and classify the
         BACKGROUND COLOR of every single cell. Output exactly ONE entry per
         date column, in the same order:
           "red"   — the cell background is red or pink (with or without text)
           "green" — anything else (green, empty, white, or a text note)
       - offTextDates: dates whose cell contains off text such as "off", "OFF",
         "of" (typo), "休", "7.6 off", "0706 off" (4-digit MMDD). Convert each to
         the column header date (e.g. "7.6 off" -> "7-6"). Empty array if none.
         Route notes like "Route 1.1" are NOT off text — ignore them.

    CRITICAL:
    - ymin/ymax must be accurate: they are used to locate each driver's row.
      Adjacent rows must not overlap.
    - Skip any row that doesn't have a numeric driver ID in Column B (headers, totals, empty rows).
    - Keep drivers in the SAME order as the rows appear in the spreadsheet (top to bottom).
  `}]},config:{responseMimeType:"application/json",temperature:0,responseSchema:{type:t.OBJECT,properties:{weekDates:{type:t.ARRAY,items:{type:t.OBJECT,properties:{date:{type:t.STRING,description:"Header text, e.g. '7-6'"},weekday:{type:t.STRING,enum:["Monday","Tuesday","Wednesday","Thursday","Friday","Saturday","Sunday"],description:"Weekday header of this column"},xmin:{type:t.NUMBER,description:"Left edge of the column, normalized 0-1000"},xmax:{type:t.NUMBER,description:"Right edge of the column, normalized 0-1000"}},required:["date","weekday","xmin","xmax"]},description:"Date column headers left to right with their horizontal spans"},drivers:{type:t.ARRAY,items:{type:t.OBJECT,properties:{driverId:{type:t.STRING},driverName:{type:t.STRING},maxCapacity:{type:t.NUMBER},ymin:{type:t.NUMBER,description:"Top edge of this driver's row, normalized 0-1000"},ymax:{type:t.NUMBER,description:"Bottom edge of this driver's row, normalized 0-1000"},dayColors:{type:t.ARRAY,items:{type:t.STRING,enum:["red","green"]},description:"One background-color classification per date column, in order"},offTextDates:{type:t.ARRAY,items:{type:t.STRING},description:"Column header dates whose cell contains off text, e.g. ['7-6']. Empty if none."}},required:["driverId","driverName","ymin","ymax","dayColors"]}}},required:["weekDates","drivers"]}}}),d=JSON.parse(n.text||"{}"),l={sunday:0,monday:1,tuesday:2,wednesday:3,thursday:4,friday:5,saturday:6},y=e=>{const c=v(e);if(!c)return null;const x=new Date().getFullYear(),g=new Date(x,c.m-1,c.d);return isNaN(g.getTime())?null:g.getDay()},m=Array.isArray(d.weekDates)?d.weekDates.map(e=>typeof e=="string"?{date:e,weekday:y(e),xmin:NaN,xmax:NaN}:{date:String((e==null?void 0:e.date)||""),weekday:l[String((e==null?void 0:e.weekday)||"").toLowerCase()]??y(String((e==null?void 0:e.date)||"")),xmin:Number(e==null?void 0:e.xmin),xmax:Number(e==null?void 0:e.xmax)}).filter(e=>e.date!==""):[],f=m.map(e=>e.date),u=await I(r),p=e=>Number.isFinite(e.xmin)&&Number.isFinite(e.xmax)&&e.xmax>e.xmin,N=(d.drivers||[]).filter(e=>/^\d+$/.test(String(e.driverId||"").trim())).map(e=>{const c=new Set,x=new Set,g=u&&Number.isFinite(Number(e.ymin))&&Number.isFinite(Number(e.ymax))&&Number(e.ymax)>Number(e.ymin),D=Array.isArray(e.dayColors)?e.dayColors:[];for(let h=0;h<m.length;h++){const s=m[h];let w;if(g&&p(s)){const C=(s.xmin+s.xmax)/2/1e3*u.width,k=(Number(e.ymin)+Number(e.ymax))/2/1e3*u.height;w=S(u,C,k)}else w=String(D[h]||"").toLowerCase()==="red";w&&s.weekday!==null&&x.add(s.weekday)}if(Array.isArray(e.offTextDates))for(const h of e.offTextDates){const s=v(String(h));s&&c.add(`${s.m}-${s.d}`)}return{driverId:String(e.driverId).trim(),driverName:String(e.driverName||""),maxCapacity:typeof e.maxCapacity=="number"&&e.maxCapacity>0?e.maxCapacity:null,offDates:[...c],fixedOffWeekdays:[...x]}});if(f.length===0)throw new Error('未能识别任何日期列（如"6-22"、"6-23"）。请确认上传的是 e-binder 班表截图，且截图包含完整列标题行。');if(N.length===0)throw new Error("未能识别任何司机行。请确认截图中 B 列有纯数字司机 ID，且图片清晰完整。");return{weekDates:f,drivers:N,parsedAt:Date.now()}}export{O as parseEbinderImage};
