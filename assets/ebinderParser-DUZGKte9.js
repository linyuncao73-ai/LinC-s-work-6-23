import{G as C,g as D,T as t}from"./geminiClient-CWc1OHtz.js";import{g as R,n as g}from"./index-DI5wDUPl.js";async function b(a){return new Promise((o,n)=>{const r=new FileReader;r.onloadend=()=>{const i=r.result.split(",")[1];o({inlineData:{data:i,mimeType:a.type}})},r.onerror=()=>n(new Error("文件读取失败，请重试")),r.readAsDataURL(a)})}async function A(a){try{const o=await createImageBitmap(a),n=document.createElement("canvas");n.width=o.width,n.height=o.height;const r=n.getContext("2d");if(!r)return null;r.drawImage(o,0,0);const i=r.getImageData(0,0,o.width,o.height);return{data:i.data,width:i.width,height:i.height}}catch{return null}}function I(a,o,n){let r=0,i=0,l=0,s=0;for(let c=-3;c<=3;c++)for(let d=-3;d<=3;d++){const y=Math.min(a.width-1,Math.max(0,Math.round(o+d))),e=(Math.min(a.height-1,Math.max(0,Math.round(n+c)))*a.width+y)*4;r+=a.data[e],i+=a.data[e+1],l+=a.data[e+2],s++}return r/=s,i/=s,l/=s,r>150&&r-i>50&&r-l>50}async function k(a){const o=new C({apiKey:R()}),n=await b(a),i=await D(o,{contents:{parts:[n,{text:`
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
  `}]},config:{responseMimeType:"application/json",temperature:0,responseSchema:{type:t.OBJECT,properties:{weekDates:{type:t.ARRAY,items:{type:t.OBJECT,properties:{date:{type:t.STRING,description:"Header text, e.g. '7-6'"},xmin:{type:t.NUMBER,description:"Left edge of the column, normalized 0-1000"},xmax:{type:t.NUMBER,description:"Right edge of the column, normalized 0-1000"}},required:["date","xmin","xmax"]},description:"Date column headers left to right with their horizontal spans"},drivers:{type:t.ARRAY,items:{type:t.OBJECT,properties:{driverId:{type:t.STRING},driverName:{type:t.STRING},maxCapacity:{type:t.NUMBER},ymin:{type:t.NUMBER,description:"Top edge of this driver's row, normalized 0-1000"},ymax:{type:t.NUMBER,description:"Bottom edge of this driver's row, normalized 0-1000"},dayColors:{type:t.ARRAY,items:{type:t.STRING,enum:["red","green"]},description:"One background-color classification per date column, in order"},offTextDates:{type:t.ARRAY,items:{type:t.STRING},description:"Column header dates whose cell contains off text, e.g. ['7-6']. Empty if none."}},required:["driverId","driverName","ymin","ymax","dayColors"]}}},required:["weekDates","drivers"]}}}),l=JSON.parse(i.text||"{}"),s=Array.isArray(l.weekDates)?l.weekDates.map(e=>typeof e=="string"?{date:e,xmin:NaN,xmax:NaN}:{date:String((e==null?void 0:e.date)||""),xmin:Number(e==null?void 0:e.xmin),xmax:Number(e==null?void 0:e.xmax)}).filter(e=>e.date!==""):[],c=s.map(e=>e.date),d=await A(a),y=e=>Number.isFinite(e.xmin)&&Number.isFinite(e.xmax)&&e.xmax>e.xmin,u=(l.drivers||[]).filter(e=>/^\d+$/.test(String(e.driverId||"").trim())).map(e=>{const f=new Set,v=d&&Number.isFinite(Number(e.ymin))&&Number.isFinite(Number(e.ymax))&&Number(e.ymax)>Number(e.ymin),N=Array.isArray(e.dayColors)?e.dayColors:[];for(let h=0;h<s.length;h++){const m=s[h];let x;if(v&&y(m)){const p=(m.xmin+m.xmax)/2/1e3*d.width,w=(Number(e.ymin)+Number(e.ymax))/2/1e3*d.height;x=I(d,p,w)}else x=String(N[h]||"").toLowerCase()==="red";if(x){const p=g(m.date);p&&f.add(`${p.m}-${p.d}`)}}if(Array.isArray(e.offTextDates))for(const h of e.offTextDates){const m=g(String(h));m&&f.add(`${m.m}-${m.d}`)}return{driverId:String(e.driverId).trim(),driverName:String(e.driverName||""),maxCapacity:typeof e.maxCapacity=="number"&&e.maxCapacity>0?e.maxCapacity:null,offDates:[...f]}});if(c.length===0)throw new Error('未能识别任何日期列（如"6-22"、"6-23"）。请确认上传的是 e-binder 班表截图，且截图包含完整列标题行。');if(u.length===0)throw new Error("未能识别任何司机行。请确认截图中 B 列有纯数字司机 ID，且图片清晰完整。");return{weekDates:c,drivers:u,parsedAt:Date.now()}}export{k as parseEbinderImage};
