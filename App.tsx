
import React, { useState, useMemo, useEffect, useRef } from 'react';
import { parseExcelFile } from './services/excelParser';
import { parseImageFile } from './services/geminiParser';
import { parseEbinderImage } from './services/ebinderParser';
import { RouteData, AgencyGroup, AGENCIES, BatchInfo, INITIAL_DRIVER_REGISTRY, DriverRegistry, PLACEHOLDER_MAPPING, ZONE_NAMES, SCAN_ID_MAP, ALLOWED_TIME_SLOTS, getDefaultTimeSlot, getOttawaTodayDateString, EbinderData, DRIVER_MAX_CAPACITIES, getOffDriverIds } from './types';
import html2canvas from 'html2canvas';

/**
 * Custom sort function for route numbers like 33011-1, 33011-1.1, 33011-4-1
 */
const compareRouteNums = (a: string, b: string) => {
  const pa = a.split(/[-.]/).map(n => parseFloat(n) || 0);
  const pb = b.split(/[-.]/).map(n => parseFloat(n) || 0);
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i++) {
    const va = pa[i] || 0;
    const vb = pb[i] || 0;
    if (va !== vb) return va - vb;
  }
  return 0;
};

const getAgencyColor = (group: string) => {
  switch (group) {
    case 'Kaneza': return 'bg-rose-100 text-rose-900 border-rose-200';
    case 'Alain': return 'bg-blue-600 text-white border-blue-700';
    case 'Massi': return 'bg-cyan-100 text-cyan-900 border-cyan-200';
    case 'Parfait': return 'bg-purple-100 text-purple-900 border-purple-200';
    case 'Alawi': return 'bg-fuchsia-100 text-fuchsia-900 border-fuchsia-200';
    case 'Ammar': return 'bg-pink-600 text-white border-pink-700';
    case 'Chris': return 'bg-emerald-100 text-emerald-900 border-emerald-200';
    case 'Company': return 'bg-slate-200 text-slate-900 border-slate-300 shadow-sm';
    default: return 'bg-gray-200 text-gray-800 border-gray-300';
  }
};

const SplitModal: React.FC<{
  route: RouteData;
  onClose: () => void;
  onConfirm: (firstVolume: number) => void
}> = ({ route, onClose, onConfirm }) => {
  const isCapacitySplit = route.capacityStatus === 'split-recommended' && (route.capacityExcess ?? 0) > 0;
  const smartDefault = Math.min(
    route.orderVolume - 1,
    Math.max(1, isCapacitySplit
      ? route.orderVolume - (route.capacityExcess ?? 0)
      : Math.floor(route.orderVolume / 2)
    )
  );
  const [splitVal, setSplitVal] = useState<number>(smartDefault);

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-6">
      <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={onClose}></div>
      <div className="bg-white rounded-[32px] shadow-2xl border border-slate-100 w-full max-w-md relative overflow-hidden animate-in fade-in zoom-in duration-200">
        <div className="p-8 border-b border-slate-50">
          <h3 className="text-xl font-black text-slate-800">Split Route</h3>
          <p className="text-slate-400 text-xs font-bold uppercase tracking-widest mt-1">Route {route.routeNum}</p>
        </div>
        <div className="p-8 space-y-6">
          {isCapacitySplit && (
            <div className="bg-orange-50 border border-orange-100 rounded-2xl px-5 py-4">
              <p className="text-[10px] font-black text-orange-600 uppercase tracking-wider mb-1">Capacity Split Recommended</p>
              <p className="text-xs text-orange-500">Driver is over capacity by <span className="font-black">{route.capacityExcess}</span> parcels. Pre-filled: driver keeps their max, broker takes the rest.</p>
            </div>
          )}

          <div className="bg-slate-50 p-6 rounded-2xl flex justify-between items-center">
            <div>
              <p className="text-[10px] font-black text-slate-400 uppercase">Original Total</p>
              <p className="text-2xl font-black text-slate-800">{route.orderVolume}</p>
            </div>
            <div className="w-12 h-12 bg-white rounded-xl flex items-center justify-center text-slate-300">
              <i className="fa-solid fa-scissors"></i>
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-[10px] font-black text-slate-400 uppercase ml-1">Volume for Part 1 (Driver)</label>
            <input
              type="number"
              value={splitVal}
              max={route.orderVolume - 1}
              min={1}
              onChange={(e) => setSplitVal(Math.min(route.orderVolume - 1, Math.max(1, parseInt(e.target.value) || 0)))}
              className="w-full bg-slate-50 border-2 border-slate-100 focus:border-orange-500 focus:outline-none rounded-2xl px-6 py-4 text-xl font-black text-orange-600 transition-all"
            />
          </div>

          <div className="grid grid-cols-2 gap-3 text-center">
            <div className="bg-blue-50 p-3 rounded-xl">
              <p className="text-[9px] font-black text-blue-400 uppercase">Part 1 (Driver)</p>
              <p className="text-xl font-black text-blue-700">{splitVal}</p>
            </div>
            <div className="bg-slate-50 p-3 rounded-xl">
              <p className="text-[9px] font-black text-slate-400 uppercase">Part 2 (Broker)</p>
              <p className="text-xl font-black text-slate-700">{route.orderVolume - splitVal}</p>
            </div>
          </div>
        </div>
        <div className="p-8 bg-slate-50 grid grid-cols-2 gap-4">
          <button onClick={onClose} className="px-6 py-4 rounded-2xl font-black text-xs text-slate-400 hover:text-slate-600 transition-all">Cancel</button>
          <button onClick={() => onConfirm(splitVal)} className="px-6 py-4 rounded-2xl bg-slate-900 text-white font-black text-xs hover:bg-slate-800 transition-all shadow-lg shadow-slate-200">Confirm Split</button>
        </div>
      </div>
    </div>
  );
};

const AvailabilityPanel: React.FC<{
  ebinderData: EbinderData;
  offDriverIds: Set<string>;
  registry: DriverRegistry;
  batchDate: string;
  onManualToggle: (driverId: string, setOff: boolean) => void;
  onClose: () => void;
}> = ({ ebinderData, offDriverIds, registry, batchDate, onManualToggle, onClose }) => {
  const companyDrivers = Object.entries(registry).filter(([, d]) => d.group === 'Company');
  const offCount = companyDrivers.filter(([id]) => offDriverIds.has(id)).length;
  const dateInEbinder = ebinderData.weekDates.some(wd => {
    const [m, d] = wd.replace('.', '-').split('-').map(Number);
    const bParts = batchDate.split('/');
    return m === parseInt(bParts[0]) && d === parseInt(bParts[1]);
  });
  const parsedAgo = Math.round((Date.now() - ebinderData.parsedAt) / 60000);

  return (
    <div className="bg-white rounded-3xl shadow-sm border border-slate-100 p-6 mb-6">
      <div className="flex justify-between items-start mb-4">
        <div>
          <h3 className="font-black text-slate-800 text-sm uppercase tracking-wider">Driver Availability</h3>
          <p className="text-[10px] text-slate-400 mt-0.5">For {batchDate} · Parsed {parsedAgo < 1 ? 'just now' : `${parsedAgo}m ago`}</p>
        </div>
        <div className="flex items-center gap-3">
          {!dateInEbinder && (
            <span className="bg-yellow-100 text-yellow-700 text-[9px] font-black px-2 py-1 rounded-lg border border-yellow-200">No data for today's date</span>
          )}
          <span className="text-[10px] font-black text-slate-500">{offCount} off · {companyDrivers.length - offCount} available</span>
          <button onClick={onClose} className="text-slate-300 hover:text-slate-500 transition-all p-1"><i className="fa-solid fa-xmark"></i></button>
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        {companyDrivers.map(([id, driver]) => {
          const isOff = offDriverIds.has(id);
          const maxCap = driver.maxCapacity ?? DRIVER_MAX_CAPACITIES[id];
          return (
            <button
              key={id}
              onClick={() => onManualToggle(id, !isOff)}
              title={`Click to toggle · Max: ${maxCap ?? 'No limit'}`}
              className={`flex flex-col items-center px-3 py-2 rounded-xl border text-left transition-all ${isOff ? 'bg-amber-50 border-amber-200 opacity-70' : 'bg-emerald-50 border-emerald-200 hover:border-emerald-400'}`}
            >
              <span className={`text-[10px] font-black ${isOff ? 'text-amber-700 line-through' : 'text-emerald-800'}`}>{driver.name}</span>
              <span className={`text-[8px] ${isOff ? 'text-amber-500' : 'text-emerald-500'}`}>{isOff ? 'OFF' : `Max: ${maxCap ?? '∞'}`}</span>
            </button>
          );
        })}
      </div>
      <p className="text-[9px] text-slate-400 mt-3">Click a driver to manually toggle. Run Auto-Assign to apply changes.</p>
    </div>
  );
};

const BookmarksView: React.FC = () => {
  const bookmarks = [
    { title: '司机取货表', desc: 'Check in, Check out, Hopper', url: 'https://dispatch_ca.uniuni.site/', icon: 'fa-truck-ramp-box' },
    { title: '排单助手', desc: '生成取货表, 修改return to office状态', url: 'https://tools.uniuni.com:8080/', icon: 'fa-chart-pie' },
    { title: '重新规划CA', desc: '分红车工具', url: 'https://tools.uniuni.com:8052/', icon: 'fa-draw-polygon' },
    { title: '查找跨区单', desc: '查找该批次下的司机号所有的Parcel ID', url: 'https://tools.uniuni.com/driver_orders.php', icon: 'fa-magnifying-glass-location' },
    { title: '排班表', desc: 'Print Out复制表格', url: 'https://docs.google.com/spreadsheets/d/1YLRC0KssOIhbQPuro9cqS1CyfjOYpLnwbuBr_0zRK2A/', icon: 'fa-table' },
    { title: '远区Bonus', desc: '19，22，45，50，55 Bonus记录', url: 'https://docs.google.com/spreadsheets/d/1BtVe8esXwSQ9NUR6V0nGxrD1YqBYxuXjv9ioCRHlmNk/edit?gid=874354702#gid=874354702', icon: 'fa-star' }
  ];
  return (
    <div className="bg-white rounded-3xl shadow-sm border border-slate-100 p-8 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-6 gap-6">
      {bookmarks.map((b, i) => (
        <a key={i} href={b.url} target="_blank" rel="noopener noreferrer" className="p-6 rounded-2xl bg-slate-50 border border-slate-100 hover:border-orange-200 hover:bg-orange-50 transition-all group">
          <i className={`fa-solid ${b.icon} text-2xl text-orange-500 mb-4 block`}></i>
          <h4 className="font-bold text-slate-800">{b.title}</h4>
          <p className="text-xs text-slate-400 mt-1">{b.desc}</p>
        </a>
      ))}
    </div>
  );
};

const PrintView: React.FC<{ routes: RouteData[], batchInfo: BatchInfo }> = ({ routes, batchInfo }) => {
  const printRef = useRef<HTMLDivElement>(null);
  const [exporting, setExporting] = useState<'none' | 'png' | 'print' | 'excel'>('none');

  const groups = useMemo(() => {
    const map: Record<string, RouteData[]> = {};
    routes.forEach(r => {
      const base = r.routeNum.split('-')[0];
      if (!map[base]) map[base] = [];
      map[base].push(r);
    });
    
    return Object.entries(map).map(([base, list]) => {
      const sorted = [...list].sort((a, b) => compareRouteNums(a.routeNum, b.routeNum));
      let currentStart = 1;
      const scanId = SCAN_ID_MAP[base] || SCAN_ID_MAP[base.split('.')[0]] || list[0]?.scanId || '';
      const rows = sorted.map(r => {
        const vol = Number(r.orderVolume) || 0;
        const start = currentStart;
        const end = start + vol - 1;
        currentStart = end + 1;
        return {
          routeNum: r.routeNum,
          driverId: r.driverId,
          driverName: r.driverName,
          range: `${start}-${end}`,
          volume: vol,
          location: r.routeLocation,
          time: r.timeSlot,
          isHold: r.isHold
        };
      });
      return { base, rows, scanId };
    }).sort((a, b) => a.base.localeCompare(b.base));
  }, [routes]);

  const captureCanvas = async () => {
    if (!printRef.current) return null;
    return await html2canvas(printRef.current, {
      scale: 3,
      backgroundColor: '#ffffff',
      logging: false,
      useCORS: true,
      windowWidth: 1600
    });
  };

  const handleExportPNG = async () => {
    setExporting('png');
    const canvas = await captureCanvas();
    if (canvas) {
      const link = document.createElement('a');
      link.download = `YOW-Dispatch-${batchInfo.batchId}.png`;
      link.href = canvas.toDataURL('image/png');
      link.click();
    }
    setExporting('none');
  };

  /**
   * Generates a "Square/Grid" layout string for Excel.
   * Groups are laid out in blocks of columns side-by-side.
   */
  const handleCopyForExcelGrid = () => {
    setExporting('excel');
    
    const GROUPS_PER_EXCEL_ROW = 3; // Number of "squares" (blocks) side-by-side
    const COLUMNS_PER_GROUP = 3; // Data columns in a block (Route-Driver, Range, Spacer/HOLD)
    const maxCols = GROUPS_PER_EXCEL_ROW * COLUMNS_PER_GROUP; // 3 * 3 = 9
    const allExcelLines: string[][] = [];
    const allExcelHolds: boolean[][] = [];

    // Header info line
    const headerRow = Array(maxCols).fill('');
    headerRow[0] = `UniUni YOW Dispatch - ${batchInfo.date} - ${batchInfo.batchId}`;
    allExcelLines.push(headerRow);
    allExcelHolds.push(Array(maxCols).fill(false));
    
    allExcelLines.push(Array(maxCols).fill(''));
    allExcelHolds.push(Array(maxCols).fill(false));

    // Iterate through groups in chunks
    for (let i = 0; i < groups.length; i += GROUPS_PER_EXCEL_ROW) {
      const rowGroups = groups.slice(i, i + GROUPS_PER_EXCEL_ROW);
      const maxRowsInChunk = Math.max(...rowGroups.map(g => g.rows.length)) + 2; // +2 for Group Title and Headers

      // Initialize buffer for this vertical chunk of squares (using fully padded, non-sparse arrays)
      const chunkBuffer: string[][] = Array.from({ length: maxRowsInChunk }, () => Array(maxCols).fill(''));
      const chunkHoldBuffer: boolean[][] = Array.from({ length: maxRowsInChunk }, () => Array(maxCols).fill(false));

      rowGroups.forEach((g, groupIdx) => {
        const baseCol = groupIdx * COLUMNS_PER_GROUP;
        
        // Line 0: Group Title
        chunkBuffer[0][baseCol] = `📍 ${g.base} (#${g.scanId})`;
        
        // Line 1: Table Headers (Added padding to header to force width in Excel)
        chunkBuffer[1][baseCol] = "Route—Driver ID             ";
        chunkBuffer[1][baseCol + 1] = "Range";
        
        // Lines 2+: Data
        g.rows.forEach((r, rowIdx) => {
          const col0 = baseCol;
          const col1 = baseCol + 1;
          const col2 = baseCol + 2;

          chunkBuffer[rowIdx + 2][col0] = `${r.routeNum}—${r.driverId}`;
          chunkBuffer[rowIdx + 2][col1] = r.range;
          
          if (r.isHold) {
            chunkBuffer[rowIdx + 2][col2] = "HOLD";
            
            // Mark hold cells
            chunkHoldBuffer[rowIdx + 2][col0] = true;
            chunkHoldBuffer[rowIdx + 2][col1] = true;
            chunkHoldBuffer[rowIdx + 2][col2] = true;
          }
        });
      });

      // Add chunk to main sheet with separator rows
      chunkBuffer.forEach((line, lineIdx) => {
        allExcelLines.push(line);
        allExcelHolds.push(chunkHoldBuffer[lineIdx]);
      });
      
      allExcelLines.push(Array(maxCols).fill(''), Array(maxCols).fill('')); // Spacer rows between horizontal chunks
      allExcelHolds.push(Array(maxCols).fill(false), Array(maxCols).fill(false));
    }

    // Convert string[][] to TSV
    const tsvContent = allExcelLines
      .map(row => row.map(cell => cell || '').join('\t'))
      .join('\n');

    // Create styled HTML table so pasting into Excel retains red text for "HOLD"
    let htmlContent = `<table style="border-collapse: collapse; font-family: Calibri, sans-serif; font-size: 11pt;">`;
    allExcelLines.forEach((row, rowIdx) => {
        htmlContent += `<tr>`;
        row.forEach((cell, colIdx) => {
            const isRed = allExcelHolds[rowIdx]?.[colIdx];
            const cleanCell = cell || '';
            const style = `font-size: 11pt; padding: 4px; border: 1px solid #E2E8F0; ${isRed ? 'color: #DC2626; font-weight: bold;' : ''}`;
            htmlContent += `<td style="${style}">${cleanCell}</td>`;
        });
        htmlContent += `</tr>`;
    });
    htmlContent += `</table>`;

    try {
        const tsvBlob = new Blob([tsvContent], { type: 'text/plain' });
        const htmlBlob = new Blob([htmlContent], { type: 'text/html' });
        const item = new ClipboardItem({
            'text/plain': tsvBlob,
            'text/html': htmlBlob
        });
        navigator.clipboard.write([item]).then(() => {
            alert('Square-grid layout copied! (If pasted into Excel, routes on hold will look bold and highlight in red)');
            setExporting('none');
        }).catch(err => {
            throw err;
        });
    } catch (e) {
        // Fallback for browsers/contexts with strict clipboard policies
        navigator.clipboard.writeText(tsvContent).then(() => {
            alert('Square-grid layout copied to clipboard! (Plain-text fallback, hold rows contain "HOLD")');
            setExporting('none');
        }).catch(err => {
            console.error('Failed to copy: ', err);
            setExporting('none');
        });
    }
  };

  const handlePrint = async () => {
     setExporting('print');
     const canvas = await captureCanvas();
     if (canvas) {
        const imgData = canvas.toDataURL('image/png');
        const printWindow = window.open('', '_blank');
        if (printWindow) {
            printWindow.document.write(`
                <html>
                    <head><title>Print Dispatch - ${batchInfo.batchId}</title></head>
                    <body style="margin:0;padding:0;display:flex;justify-content:center;background:#fff;">
                        <img src="${imgData}" style="width:100%;max-width:210mm;" onload="window.print();window.close();">
                    </body>
                </html>
            `);
            printWindow.document.close();
        }
     }
     setExporting('none');
  };

  return (
    <div className="space-y-8 pb-20">
      <div className="bg-white rounded-3xl shadow-sm border border-slate-100 p-8">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
          <div>
            <h3 className="text-xl font-black text-slate-800">Dispatch Sheet Export</h3>
            <p className="text-slate-400 text-xs font-bold uppercase tracking-widest mt-1">Side-by-side "Square" layout for easy cutting after printing</p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
             <button 
                onClick={handleExportPNG}
                disabled={exporting !== 'none'}
                className="bg-slate-100 text-slate-800 px-6 py-3 rounded-2xl text-sm font-black hover:bg-slate-200 transition-all flex items-center gap-2 disabled:opacity-50"
              >
                {exporting === 'png' ? <i className="fa-solid fa-spinner animate-spin"></i> : <i className="fa-solid fa-image"></i>}
                Save Image
              </button>
              <button 
                onClick={handleCopyForExcelGrid}
                disabled={exporting !== 'none'}
                className="bg-slate-900 text-white px-6 py-3 rounded-2xl text-sm font-black hover:bg-slate-800 transition-all shadow-lg flex items-center gap-2 disabled:opacity-50"
              >
                {exporting === 'excel' ? <i className="fa-solid fa-spinner animate-spin"></i> : <i className="fa-solid fa-table-columns"></i>}
                Copy for Excel Grid
              </button>
              <button 
                onClick={handlePrint}
                disabled={exporting !== 'none'}
                className="bg-orange-500 text-white px-8 py-3 rounded-2xl text-sm font-black hover:bg-orange-600 transition-all shadow-lg shadow-orange-100 flex items-center gap-2 disabled:opacity-50"
              >
                {exporting === 'print' ? <i className="fa-solid fa-spinner animate-spin"></i> : <i className="fa-solid fa-print"></i>}
                Print Now
              </button>
          </div>
        </div>
      </div>

      <div className="overflow-x-auto bg-slate-200 p-10 rounded-[40px] shadow-inner">
          <div ref={printRef} className="mx-auto w-[1100px] bg-white p-12 shadow-2xl rounded-lg border border-slate-100">
            <style dangerouslySetInnerHTML={{ __html: `
              .grid-print-cols { 
                  display: grid;
                  grid-template-columns: repeat(4, 1fr);
                  gap: 12px;
              }
              .group-card {
                border: 2px solid #E2E8F0;
                border-radius: 12px;
                overflow: hidden;
                background: white;
              }
              .group-header {
                background: #0F172A;
                color: white;
                padding: 6px 12px;
                font-weight: 900;
                font-size: 15px;
                display: flex;
                justify-content: space-between;
              }
            `}} />
            
            <div className="mb-10 flex justify-between items-end border-b-8 border-slate-900 pb-5">
               <div>
                  <h2 className="text-4xl font-black text-slate-900 tracking-tighter uppercase italic">UniUni Dispatch</h2>
                  <p className="text-xs font-bold text-slate-500 uppercase tracking-[0.3em] mt-2">Hub: Ottawa (YOW) — Load Sheet</p>
               </div>
               <div className="text-right">
                  <div className="flex gap-10 items-center">
                    <div>
                        <p className="text-[10px] font-black text-slate-400 uppercase">Dispatch Date</p>
                        <p className="text-xl font-black text-slate-900">{batchInfo.date}</p>
                    </div>
                    <div>
                        <p className="text-[10px] font-black text-slate-400 uppercase">Volume</p>
                        <p className="text-xl font-black text-slate-900">{routes.reduce((s, r) => s + (Number(r.orderVolume) || 0), 0)} pcs</p>
                    </div>
                  </div>
                  <p className="text-[10px] font-mono text-slate-400 mt-2">{batchInfo.batchId}</p>
               </div>
            </div>

            <div className="grid-print-cols">
              {groups.map((g, i) => (
                <div key={i} className="group-card">
                  <div className="group-header">
                    <span>{g.base}</span>
                    <span className="opacity-40 text-[10px]">#{g.scanId}</span>
                  </div>
                  <table className="w-full text-[11px] border-collapse">
                    <thead className="bg-slate-50 border-b-2 border-slate-100">
                      <tr className="text-slate-400 font-black uppercase text-[8px] tracking-wider">
                        {/* Modified: Added explicit width to ensure Route—Driver ID column is wider */}
                        <th className="px-2 py-2 text-left w-[70%]">Route—Driver ID</th>
                        <th className="px-2 py-2 text-center w-[30%]">Range</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                      {g.rows.map((row, ri) => (
                        <tr key={ri}>
                          <td className="px-2 py-2">
                             <div className="font-black text-slate-900 text-[11px] leading-tight mb-0.5">
                                {row.routeNum}—{row.driverId}
                             </div>
                             <div className="text-[9px] text-slate-400 font-bold uppercase truncate max-w-[90px]">{row.driverName}</div>
                          </td>
                          <td className="px-2 py-2 text-center">
                             <span className="inline-block px-1.5 py-0.5 rounded bg-orange-50 text-orange-600 font-mono font-black text-[10px]">
                                {row.range}
                                {row.isHold && <span className="text-red-600 font-bold ml-1 font-sans">HOLD</span>}
                             </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ))}
            </div>
            
            <div className="mt-12 border-t-2 border-slate-100 pt-5 flex justify-between text-[9px] font-bold text-slate-300 uppercase tracking-[0.4em]">
               <div>Verified for Terminal Operations — YOW_HUB_v3.0</div>
               <div className="font-mono">{new Date().toLocaleTimeString()}</div>
            </div>
          </div>
      </div>
    </div>
  );
};

const AllocationSummaryView: React.FC<{ routes: RouteData[] }> = ({ routes }) => {
  const [copiedAll, setCopiedAll] = useState(false);
  const [copiedGroup, setCopiedGroup] = useState<string | null>(null);

  const groups = useMemo(() => {
    const map: Record<string, RouteData[]> = {};
    routes.forEach(r => {
      const base = r.routeNum.split('-')[0];
      if (!map[base]) map[base] = [];
      map[base].push(r);
    });
    
    return Object.entries(map).map(([base, list]) => {
      const sorted = [...list].sort((a, b) => compareRouteNums(a.routeNum, b.routeNum));
      let currentStart = 1;
      const allocString = sorted.map(r => {
        const vol = Number(r.orderVolume) || 0;
        const start = currentStart;
        const end = start + vol - 1;
        currentStart = end + 1;
        return `${start}-${end}(${r.driverId || ''})`;
      }).join(',');
      return { base, allocString };
    }).sort((a, b) => a.base.localeCompare(b.base));
  }, [routes]);

  const copyAll = () => {
    const text = groups.map(g => g.allocString).join('\n');
    navigator.clipboard.writeText(text);
    setCopiedAll(true);
    setTimeout(() => setCopiedAll(false), 2000);
  };

  const copyGroup = (base: string, allocString: string) => {
    navigator.clipboard.writeText(allocString);
    setCopiedGroup(base);
    setTimeout(() => setCopiedGroup(null), 2000);
  };

  return (
    <div className="bg-white rounded-3xl shadow-sm border border-slate-100 p-8">
      <div className="flex justify-between items-center mb-8">
        <div>
          <h3 className="text-xl font-black text-slate-800">Excel Allocation Ranges</h3>
          <p className="text-slate-400 text-xs font-bold uppercase tracking-widest mt-1">Copy and paste into E5 or Allocation columns</p>
        </div>
        <button 
          onClick={copyAll}
          disabled={routes.length === 0}
          className={`w-52 py-4 rounded-2xl text-sm font-black transition-all shadow-lg flex items-center justify-center gap-2 shrink-0 ${routes.length === 0 ? 'bg-slate-200 text-slate-400 cursor-not-allowed shadow-none' : (copiedAll ? 'bg-emerald-500 text-white shadow-emerald-100' : 'bg-slate-900 text-white shadow-slate-200 hover:bg-slate-800')}`}
        >
          {copiedAll ? <><i className="fa-solid fa-check"></i> All Copied!</> : <><i className="fa-solid fa-copy"></i> Copy All Ranges</>}
        </button>
      </div>
      <div className="space-y-4">
        {groups.map((g, i) => (
          <div key={i} className="flex items-center gap-4">
            <div className="flex-grow bg-slate-50 border border-slate-100 px-6 py-4 rounded-2xl font-mono text-[11px] text-slate-600 break-all leading-relaxed">
                {g.allocString}
            </div>
            <button 
              onClick={() => copyGroup(g.base, g.allocString)}
              className={`w-52 py-4 rounded-2xl text-sm font-black transition-all shadow-lg flex items-center justify-center gap-2 shrink-0 ${copiedGroup === g.base ? 'bg-emerald-500 text-white shadow-emerald-100 font-extrabold' : 'bg-slate-900 text-white shadow-slate-200 hover:bg-slate-800'}`}
            >
              {copiedGroup === g.base ? (
                <>
                  <i className="fa-solid fa-check"></i>
                  {g.base} Copied!
                </>
              ) : (
                <>
                  <i className="fa-solid fa-copy text-xs"></i>
                  {g.base}
                </>
              )}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
};

const MainEditor: React.FC<{
    routes: RouteData[],
    registry: DriverRegistry,
    offDriverIds: Set<string>,
    onUpdate: (id: string, updates: Partial<RouteData>) => void,
    onAddRow: () => void,
    onDeleteRow: (id: string) => void,
    onOpenSplit: (route: RouteData) => void
}> = ({ routes, registry, offDriverIds, onUpdate, onAddRow, onDeleteRow, onOpenSplit }) => {
    const sortedRoutes = useMemo(() => [...routes].sort((a, b) => compareRouteNums(a.routeNum, b.routeNum)), [routes]);

    return (
        <div className="bg-white rounded-3xl shadow-xl border border-slate-100 overflow-hidden min-h-[400px]">
            <div className="bg-slate-50 border-b border-slate-100 px-8 py-4 flex justify-between items-center">
                <div>
                    <h3 className="text-lg font-black text-slate-800">Route Spreadsheet</h3>
                    <p className="text-slate-400 text-[10px] font-bold uppercase tracking-widest">Interactive Schedule Editor</p>
                </div>
                <button onClick={onAddRow} className="bg-slate-900 text-white px-6 py-2 rounded-xl text-xs font-black hover:bg-slate-800 transition-all flex items-center gap-2 shadow-lg shadow-slate-100">
                    <i className="fa-solid fa-plus"></i> Add New Route
                </button>
            </div>
            <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                    <thead className="bg-slate-50 border-b border-slate-100">
                        <tr className="text-slate-400 font-black uppercase text-[10px] tracking-widest">
                            <th className="px-6 py-4">Route #</th>
                            <th className="px-6 py-4">Location</th>
                            <th className="px-6 py-4">Time</th>
                            <th className="px-6 py-4">Team</th>
                            <th className="px-6 py-4">Driver ID</th>
                            <th className="px-6 py-4">Driver Name</th>
                            <th className="px-6 py-4 text-center">Volume</th>
                            <th className="px-6 py-4 text-right">Actions</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                        {sortedRoutes.map(route => {
                            const baseRoutePart = route.routeNum.split('-')[0];
                            const showHoldBtn = ['33045', '33050', '33055'].includes(baseRoutePart);
                            const isOff = route.isDriverOff || (route.driverId ? offDriverIds.has(route.driverId) : false);
                            const rowBg = route.isHold
                              ? 'bg-rose-50/40'
                              : isOff
                              ? 'bg-amber-50/60'
                              : route.capacityStatus === 'split-recommended'
                              ? 'bg-orange-50/50'
                              : route.capacityStatus === 'warn'
                              ? 'bg-yellow-50/40'
                              : '';
                            return (
                                <tr key={route.id} className={`hover:bg-slate-50/50 transition-all group ${rowBg}`}>
                                    <td className="px-6 py-4">
                                        <div className="flex items-center gap-2 flex-wrap">
                                            <input value={route.routeNum} onChange={e => onUpdate(route.id, { routeNum: e.target.value })} className={`w-32 bg-transparent border-b border-transparent focus:border-orange-400 focus:outline-none font-bold ${route.isHold ? 'text-red-600 line-through' : 'text-orange-600'}`} />
                                            {route.isHold && <span className="bg-red-100 text-red-800 text-[8px] font-black px-1.5 py-0.5 rounded border border-red-200 uppercase tracking-wider">HOLD</span>}
                                            {isOff && <span className="bg-amber-100 text-amber-800 text-[8px] font-black px-1.5 py-0.5 rounded border border-amber-200 uppercase tracking-wider">Driver Off</span>}
                                            {!isOff && route.capacityStatus === 'split-recommended' && (
                                              <span className="bg-orange-100 text-orange-700 text-[8px] font-black px-1.5 py-0.5 rounded border border-orange-200 uppercase tracking-wider" title={`Over by ${route.capacityExcess} parcels`}>Split</span>
                                            )}
                                            {!isOff && route.capacityStatus === 'warn' && (
                                              <span className="bg-yellow-100 text-yellow-700 text-[8px] font-black px-1.5 py-0.5 rounded border border-yellow-200 uppercase tracking-wider" title={`Over by ${route.capacityExcess} parcels`}>Over Cap</span>
                                            )}
                                        </div>
                                    </td>
                                    <td className="px-6 py-4">
                                        <input value={route.routeLocation || ''} onChange={e => onUpdate(route.id, { routeLocation: e.target.value })} className="w-40 bg-transparent border-b border-transparent focus:border-orange-400 focus:outline-none font-bold text-slate-800 placeholder:text-slate-300" placeholder="Location" />
                                    </td>
                                    <td className="px-6 py-4">
                                        <select
                                            value={route.timeSlot || ''}
                                            onChange={e => onUpdate(route.id, { timeSlot: e.target.value })}
                                            className="w-28 bg-transparent border-b border-transparent focus:border-orange-400 focus:outline-none font-bold text-blue-600 appearance-none cursor-pointer"
                                        >
                                            <option value="" disabled>Select Time</option>
                                            {ALLOWED_TIME_SLOTS.map(t => <option key={t} value={t}>{t}</option>)}
                                        </select>
                                    </td>
                                    <td className="px-6 py-4">
                                        <span className={`px-3 py-1 rounded-full text-[10px] font-black uppercase border transition-colors ${getAgencyColor(route.driverGroup || '')}`}>
                                            {route.driverGroup || 'Unassigned'}
                                        </span>
                                    </td>
                                    <td className="px-6 py-4">
                                        <input value={route.driverId || ''} onChange={e => {
                                            const id = e.target.value.replace(/\D/g, '');
                                            const d = registry[id];
                                            onUpdate(route.id, { driverId: id, driverName: d?.name || route.driverName || `Driver ${id}`, driverGroup: d?.group || route.driverGroup || 'Unassigned', driver: d?.name || route.driverName || `Driver ${id}` });
                                        }} className="w-20 font-mono text-xs border-b border-transparent focus:border-orange-400 focus:outline-none" placeholder="ID" />
                                    </td>
                                    <td className="px-6 py-4">
                                        <input value={route.driverName || ''} onChange={e => onUpdate(route.id, { driverName: e.target.value, driver: e.target.value })} className="w-full font-bold text-slate-800 border-b border-transparent focus:border-orange-400 focus:outline-none" placeholder="Name" />
                                    </td>
                                    <td className="px-6 py-4 text-center">
                                        <input type="number" value={route.orderVolume} onChange={e => onUpdate(route.id, { orderVolume: parseInt(e.target.value) || 0 })} className={`w-16 text-center border-b border-transparent focus:border-orange-400 focus:outline-none font-black ${route.capacityStatus === 'split-recommended' ? 'text-orange-600' : route.capacityStatus === 'warn' ? 'text-yellow-600' : ''}`} />
                                        {(route.capacityExcess ?? 0) > 0 && (
                                          <div className="text-[9px] text-orange-500 font-bold mt-0.5">+{route.capacityExcess} over</div>
                                        )}
                                    </td>
                                    <td className="px-6 py-4 text-right flex items-center justify-end gap-2">
                                        {showHoldBtn && (
                                            <button
                                                onClick={(e) => { e.stopPropagation(); onUpdate(route.id, { isHold: !route.isHold }); }}
                                                className={`p-2 transition-all shadow-sm rounded-lg ${route.isHold ? 'text-red-600 bg-red-100/50 hover:bg-red-100' : 'text-slate-300 hover:text-red-500'}`}
                                                title={route.isHold ? "Unhold Route" : "Hold Route"}
                                            >
                                                <i className="fa-solid fa-hand"></i>
                                            </button>
                                        )}
                                        <button
                                          onClick={(e) => { e.stopPropagation(); onOpenSplit(route); }}
                                          className={`p-2 transition-all shadow-sm rounded-lg ${route.capacityStatus === 'split-recommended' ? 'text-orange-500 bg-orange-50 hover:bg-orange-100 animate-pulse' : 'text-slate-300 hover:text-orange-600'}`}
                                          title={route.capacityStatus === 'split-recommended' ? `Split recommended: over by ${route.capacityExcess} parcels` : 'Split Route'}
                                        >
                                          <i className="fa-solid fa-scissors"></i>
                                        </button>
                                        <button onClick={(e) => { e.stopPropagation(); onDeleteRow(route.id); }} className="p-2 text-slate-300 hover:text-red-500 transition-all shadow-sm"><i className="fa-solid fa-trash-can"></i></button>
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>
        </div>
    );
};

const WhatsAppReports: React.FC<{ groups: AgencyGroup[], batchInfo: BatchInfo }> = ({ groups, batchInfo }) => {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
      {groups.length === 0 ? (
        <div className="col-span-full py-40 bg-white rounded-3xl border border-slate-100 border-dashed text-center">
          <p className="text-slate-400 font-bold uppercase tracking-widest text-[10px]">No assigned routes to generate reports</p>
        </div>
      ) : (
        groups.map(group => <AgencyReport key={group.name} group={group} batchInfo={batchInfo} />)
      )}
    </div>
  );
};

const AgencyReport: React.FC<{ group: AgencyGroup, batchInfo: BatchInfo }> = ({ group, batchInfo }) => {
  const [copied, setCopied] = useState(false);
  
  const generateWhatsAppMessage = () => {
    const isCompany = group.name === 'Company Drivers';
    const teamTitle = isCompany ? "Dispatch" : group.name.replace('Team ', '');
    
    const simplifyRouteNum = (route: string) => {
        const parts = route.split('-');
        if (parts.length >= 3) return `${parts[0]}-${parts[parts.length - 1]}`;
        return route;
    };

    const activeRoutes = group.routes.filter(r => !r.isHold);
    const holdRoutes = group.routes.filter(r => r.isHold).sort((a, b) => compareRouteNums(a.routeNum, b.routeNum));

    // Requirement: For brokers, attach Batch ID after the date
    const dateLine = isCompany ? batchInfo.date : `${batchInfo.date} | ${batchInfo.batchId}`;
    let message = `*${teamTitle.toUpperCase()}* | ${dateLine}\n`;
    
    const routesByAccount: Record<string, RouteData[]> = {};
    activeRoutes.forEach(r => {
        const parts = (r.routeNum || '').split('-');
        const majorId = parts[0];
        const resolvedScanId = SCAN_ID_MAP[majorId] || r.scanId;
        if (!routesByAccount[resolvedScanId]) routesByAccount[resolvedScanId] = [];
        routesByAccount[resolvedScanId].push(r);
    });
    
    const sortedScanEntries = Object.entries(routesByAccount).map(([scanId, rts]) => {
        const sortedRts = [...rts].sort((a, b) => compareRouteNums(a.routeNum, b.routeNum));
        return [scanId, sortedRts] as [string, RouteData[]];
    }).sort((a, b) => {
        const routeA = a[1][0]?.routeNum || '';
        const routeB = b[1][0]?.routeNum || '';
        return compareRouteNums(routeA, routeB);
    });

    sortedScanEntries.forEach(([scanId, routes]) => {
        message += `\n📍 *${scanId}*\n`;
        routes.forEach(r => {
            const driverInfo = isCompany ? ` - ${r.driverName}` : '';
            const volumeInfo = !isCompany ? ` [${r.orderVolume}]` : '';
            const locInfo = r.routeLocation ? ` [${r.routeLocation}]` : '';
            const timeInfo = r.timeSlot ? ` @ ${r.timeSlot}` : '';
            message += `• ${r.driverId}${driverInfo}${timeInfo} (#${simplifyRouteNum(r.routeNum)})${locInfo}${volumeInfo}\n`;
        });
    });
    
    const totalVol = activeRoutes.reduce((s, r) => s + (Number(r.orderVolume) || 0), 0);
    const volumeSummary = !isCompany ? ` / ${totalVol} items` : '';
    message += `\n*Sum:* ${activeRoutes.length} Routes${volumeSummary}`;

    // Requirement: Add closing sentence
    message += `\n\nTomorrow's routes, thanks`;

    if (holdRoutes.length > 0) {
        const listStr = holdRoutes.map(r => r.routeNum).join('，');
        message += `\nWe are holding ${listStr}`;
    }

    return message;
  };

  const copyToClipboard = () => {
    navigator.clipboard.writeText(generateWhatsAppMessage());
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="bg-white rounded-3xl shadow-sm border border-slate-100 overflow-hidden flex flex-col h-full">
      <div className={`px-8 py-4 flex justify-between items-center ${getAgencyColor(group.name.replace('Team ', '').replace(' Drivers', ''))}`}>
        <h3 className="font-black text-sm uppercase tracking-wider">{group.name}</h3>
        <button onClick={copyToClipboard} className={`px-4 py-1.5 rounded-lg text-[10px] font-black transition-all ${copied ? 'bg-emerald-600 text-white' : 'bg-white/20 hover:bg-white/30 text-white'}`}>
            {copied ? 'Copied!' : 'Copy'}
        </button>
      </div>
      <div className="p-4 bg-slate-50 flex-grow">
        <div className="text-[11px] whitespace-pre-wrap font-sans text-slate-700 leading-tight">
            {generateWhatsAppMessage()}
        </div>
      </div>
    </div>
  );
};

const App: React.FC = () => {
  const [loading, setLoading] = useState(false);
  const [hasStarted, setHasStarted] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  
  const [batchInfo, setBatchInfo] = useState<BatchInfo>(() => {
    const saved = localStorage.getItem('yow_dispatch_batch');
    return saved ? JSON.parse(saved) : { date: getOttawaTodayDateString(), batchId: 'YOW-' + Date.now(), totalVolume: 0 };
  });
  const [routes, setRoutes] = useState<RouteData[]>(() => {
    const saved = localStorage.getItem('yow_dispatch_routes');
    return saved ? JSON.parse(saved) : [];
  });
  const [view, setView] = useState<'main' | 'reports' | 'allocations' | 'print' | 'bookmarks'>('main');
  const [registry, setRegistry] = useState<DriverRegistry>(() => {
    const saved = localStorage.getItem('yow_dispatch_registry');
    if (!saved) return INITIAL_DRIVER_REGISTRY;
    try {
      const parsed = JSON.parse(saved);
      // Merge: priority to saved data, but include new defaults
      return { ...INITIAL_DRIVER_REGISTRY, ...parsed };
    } catch (e) {
      return INITIAL_DRIVER_REGISTRY;
    }
  });
  const [splittingRoute, setSplittingRoute] = useState<RouteData | null>(null);

  const [ebinderData, setEbinderData] = useState<EbinderData | null>(() => {
    const saved = localStorage.getItem('yow_dispatch_ebinder');
    try { return saved ? JSON.parse(saved) : null; } catch { return null; }
  });
  const [ebinderManualOverrides, setEbinderManualOverrides] = useState<Record<string, boolean>>({});
  const [ebinderLoading, setEbinderLoading] = useState(false);
  const [showAvailabilityPanel, setShowAvailabilityPanel] = useState(false);
  const ebinderInputRef = useRef<HTMLInputElement>(null);

  const offDriverIdsFinal = useMemo<Set<string>>(() => {
    const base = ebinderData ? getOffDriverIds(ebinderData, batchInfo.date) : new Set<string>();
    const result = new Set(base);
    for (const [id, isOff] of Object.entries(ebinderManualOverrides)) {
      if (isOff) result.add(id); else result.delete(id);
    }
    return result;
  }, [ebinderData, batchInfo.date, ebinderManualOverrides]);

  useEffect(() => {
    localStorage.setItem('yow_dispatch_routes', JSON.stringify(routes));
    if (routes.length > 0 && !hasStarted) setHasStarted(true);
  }, [routes]);

  useEffect(() => localStorage.setItem('yow_dispatch_batch', JSON.stringify(batchInfo)), [batchInfo]);
  useEffect(() => localStorage.setItem('yow_dispatch_registry', JSON.stringify(registry)), [registry]);
  useEffect(() => { if (ebinderData) localStorage.setItem('yow_dispatch_ebinder', JSON.stringify(ebinderData)); }, [ebinderData]);

  const handleEbinderUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; if (!file) return;
    setEbinderLoading(true);
    try {
      const data = await parseEbinderImage(file);
      setRegistry(prev => {
        const updated = { ...prev };
        for (const d of data.drivers) {
          if (updated[d.driverId] && d.maxCapacity !== null) {
            updated[d.driverId] = { ...updated[d.driverId], maxCapacity: d.maxCapacity };
          }
        }
        return updated;
      });
      setEbinderData(data);
      setShowAvailabilityPanel(true);
    } catch (err: any) { alert(`E-binder parse error: ${err.message}`); }
    finally { setEbinderLoading(false); e.target.value = ''; }
  };

  const handleManualToggle = (driverId: string, setOff: boolean) => {
    setEbinderManualOverrides(prev => ({ ...prev, [driverId]: setOff }));
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; if (!file) return;
    setLoading(true);
    try {
      const data = await parseExcelFile(file, registry);
      setRoutes(data.routes); 
      setBatchInfo(data.batchInfo);
      setHasStarted(true);
      setView('main');
    } catch (err: any) { alert(`Error: ${err.message}`); }
    finally { setLoading(false); e.target.value = ''; }
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; if (!file) return;
    setLoading(true);
    try {
      const data = await parseImageFile(file, registry);
      setRoutes(data.routes); 
      setBatchInfo(data.batchInfo);
      setHasStarted(true);
      setView('main');
    } catch (err: any) { alert(`Error: ${err.message}`); }
    finally { setLoading(false); e.target.value = ''; }
  };

  const handleAutoAssign = () => {
    const todayOttawa = getOttawaTodayDateString();
    setBatchInfo(prev => ({ ...prev, date: todayOttawa }));

    const activeOffIds = ebinderData ? getOffDriverIds(ebinderData, todayOttawa) : new Set<string>();
    for (const [id, isOff] of Object.entries(ebinderManualOverrides)) {
      if (isOff) activeOffIds.add(id); else activeOffIds.delete(id);
    }

    const evalCapacity = (driverId: string, volume: number, driverData: DriverRegistry[string] | undefined): Pick<RouteData, 'capacityStatus' | 'capacityExcess'> => {
      const maxCap = driverData?.maxCapacity ?? DRIVER_MAX_CAPACITIES[driverId];
      if (maxCap === undefined) return { capacityStatus: undefined, capacityExcess: 0 };
      const excess = volume - maxCap;
      const capacityExcess = Math.max(0, excess);
      let capacityStatus: RouteData['capacityStatus'];
      if (excess <= 20) capacityStatus = 'ok';
      else if (excess < 100) capacityStatus = 'warn';
      else if (maxCap >= 150) capacityStatus = 'split-recommended';
      else capacityStatus = 'warn';
      return { capacityStatus, capacityExcess };
    };

    setRoutes(prev => prev.map(route => {
        const placeholderKey = route.driverId || '';
        const realId = PLACEHOLDER_MAPPING[placeholderKey];
        const parts = placeholderKey.split('-');

        const newLocation = ZONE_NAMES[route.routeNum] ||
                            ZONE_NAMES[placeholderKey] ||
                            (parts.length >= 3 ? ZONE_NAMES[`${parts[0]}-${parts[parts.length - 1]}`] : '') ||
                            route.routeLocation;

        const baseRoute = route.routeNum?.split('-')[0] || '';
        const newTime = getDefaultTimeSlot(baseRoute, todayOttawa);

        if (realId) {
            const driverData = registry[realId];
            const isOff = activeOffIds.has(realId);
            const capResult = isOff ? { capacityStatus: undefined as RouteData['capacityStatus'], capacityExcess: 0 } : evalCapacity(realId, route.orderVolume, driverData);
            return {
                ...route,
                driverId: realId,
                driverName: driverData?.name || `Driver ${realId}`,
                driverGroup: driverData?.group || 'Unassigned',
                driver: driverData?.name || `Driver ${realId}`,
                routeLocation: newLocation,
                timeSlot: newTime,
                isDriverOff: isOff,
                ...capResult,
            };
        }
        return { ...route, routeLocation: newLocation, timeSlot: newTime };
    }));
  };

  const handleSplit = (firstVolume: number) => {
    if (!splittingRoute) return;
    const secondVolume = splittingRoute.orderVolume - firstVolume;
    const secondPart: RouteData = { ...splittingRoute, id: `split-${splittingRoute.id}-${Date.now()}`, routeNum: splittingRoute.routeNum + '.1', orderVolume: secondVolume, driverId: '', driverName: 'Unassigned', driverGroup: 'Unassigned', driver: 'Unassigned', parentId: splittingRoute.id };
    setRoutes(prev => {
      const idx = prev.findIndex(r => r.id === splittingRoute.id);
      if (idx === -1) return prev;
      const updated = [...prev];
      updated[idx] = { ...splittingRoute, orderVolume: firstVolume, isSplit: true };
      updated.splice(idx + 1, 0, secondPart);
      return updated;
    });
    setSplittingRoute(null);
  };

  const addEmptyRow = () => {
    const newRoute: RouteData = { id: 'manual-' + Date.now(), routeNum: '33011-1', driver: '', driverId: '', driverName: 'Unassigned', driverGroup: 'Unassigned', routeLocation: 'Unknown', timeSlot: '08:00 AM', orderVolume: 0, scanId: '8257' };
    setRoutes(prev => [...prev, newRoute]);
    setHasStarted(true);
    setView('main');
  };

  const onUpdateRoute = (id: string, up: Partial<RouteData>) => {
    setRoutes(prev => {
      const target = prev.find(r => r.id === id);
      if (!target) return prev;

      let finalUpdates = { ...up };
      if (up.routeNum !== undefined) {
        const val = up.routeNum.trim();
        const normVal = val.split('.')[0];
        const parts = normVal.split('-');
        const matchedLocation = ZONE_NAMES[val] ||
                                ZONE_NAMES[normVal] ||
                                (parts.length >= 3 ? ZONE_NAMES[`${parts[0]}-${parts[parts.length - 1]}`] : '') ||
                                ZONE_NAMES[parts[0]];
        if (matchedLocation) {
          finalUpdates.routeLocation = matchedLocation;
        }
        if (parts[0] && SCAN_ID_MAP[parts[0]]) {
          finalUpdates.scanId = SCAN_ID_MAP[parts[0]];
        }
      }

      // Handle time propagation for specific major groups
      if (finalUpdates.timeSlot !== undefined) {
        const parts = (target.routeNum || '').split('-');
        const majorId = parts[0];
        const syncGroups = Object.keys(SCAN_ID_MAP);

        if (syncGroups.includes(majorId)) {
          return prev.map(r => {
            if (r.id === id) return { ...r, ...finalUpdates };
            
            const rParts = (r.routeNum || '').split('-');
            // Same major group and same sub-group (e.g. 33011-4 members: 33011-4-1, 33011-4-2)
            const sameSubGroup = parts.length >= 3 && rParts.length >= 3 && parts[0] === rParts[0] && parts[1] === rParts[1];
            // OR same base route for splits (e.g. 33011-1 and 33011-1.1)
            const targetBase = (target.routeNum || '').split('.')[0];
            const rBase = (r.routeNum || '').split('.')[0];
            const sameBaseForSplit = targetBase === rBase && targetBase !== '';
            
            if (sameSubGroup || sameBaseForSplit) {
              return { ...r, timeSlot: finalUpdates.timeSlot! };
            }
            return r;
          });
        }
      }

      return prev.map(r => r.id === id ? { ...r, ...finalUpdates } : r);
    });
  };
  const onDeleteRoute = (id: string) => {
    setRoutes(prev => {
      const target = prev.find(r => r.id === id);
      if (target?.parentId) {
        return prev.map(r => r.id === target.parentId ? { ...r, orderVolume: r.orderVolume + target.orderVolume } : r).filter(r => r.id !== id);
      }
      return prev.filter(r => r.id !== id);
    });
  };

  const groupedData = useMemo(() => {
    const groups: AgencyGroup[] = [];
    const comp = routes.filter(r => r.driverGroup === 'Company');
    if (comp.length > 0) groups.push({ name: 'Company Drivers', routes: comp });
    AGENCIES.forEach(a => { const ar = routes.filter(r => r.driverGroup === a); if (ar.length > 0) groups.push({ name: `Team ${a}`, routes: ar }); });
    return groups;
  }, [routes]);

  const showLanding = !hasStarted && routes.length === 0 && !loading;

  return (
    <div className="min-h-screen bg-[#F8FAFC] font-sans">
        <header className="bg-white border-b sticky top-0 z-50 px-8 py-4 flex justify-between items-center shadow-sm">
            <div className="flex items-center gap-4">
                <div className="w-10 h-10 bg-orange-500 rounded-xl flex items-center justify-center text-white shadow-lg shadow-orange-100">
                    <i className="fa-solid fa-truck-fast"></i>
                </div>
                <h1 className="text-xl font-black text-slate-900 tracking-tight">Driver Dispatch Assistant</h1>
            </div>
            <nav className="flex bg-slate-100 p-1 rounded-2xl">
                {[
                  { id: 'main', label: 'Editor' },
                  { id: 'reports', label: 'Reports' },
                  { id: 'allocations', label: 'Allocations' },
                  { id: 'print', label: 'Print & Copy' },
                  { id: 'bookmarks', label: 'Links' }
                ].map(v => (
                    <button key={v.id} onClick={() => setView(v.id as any)} className={`px-5 py-2 rounded-xl text-xs font-black transition-all ${view === v.id ? 'bg-white text-orange-600 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}>
                        {v.label}
                    </button>
                ))}
            </nav>
        </header>

        <main className="max-w-7xl mx-auto px-8 mt-10">
            {/* Action Bar (Uploads & Stats) */}
            {!loading && (view !== 'main' || !showLanding) && (
              <>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-7 gap-6 mb-6">
                  <div onClick={() => fileInputRef.current?.click()} className="bg-white p-6 rounded-3xl shadow-sm border border-slate-100 flex items-center gap-4 cursor-pointer hover:border-orange-500 hover:shadow-lg transition-all">
                      <input type="file" ref={fileInputRef} onChange={handleFileUpload} className="hidden" accept=".xlsx,.xls" />
                      <div className="w-12 h-12 bg-orange-50 rounded-2xl flex items-center justify-center text-orange-500"><i className="fa-solid fa-file-arrow-up"></i></div>
                      <div><p className="text-[10px] font-black uppercase text-slate-400">Excel</p><h4 className="font-bold">Update Data</h4></div>
                  </div>
                  <div onClick={() => imageInputRef.current?.click()} className="bg-white p-6 rounded-3xl shadow-sm border border-slate-100 flex items-center gap-4 cursor-pointer hover:border-purple-500 hover:shadow-lg transition-all">
                      <input type="file" ref={imageInputRef} onChange={handleImageUpload} className="hidden" accept="image/*" />
                      <div className="w-12 h-12 bg-purple-50 rounded-2xl flex items-center justify-center text-purple-500"><i className="fa-solid fa-camera"></i></div>
                      <div><p className="text-[10px] font-black uppercase text-slate-400">Screenshot</p><h4 className="font-bold">Import Image</h4></div>
                  </div>
                  <div
                    onClick={() => ebinderInputRef.current?.click()}
                    className={`bg-white p-6 rounded-3xl shadow-sm border flex items-center gap-4 cursor-pointer hover:shadow-lg transition-all ${ebinderData ? 'border-emerald-200 hover:border-emerald-500' : 'border-slate-100 hover:border-emerald-500'}`}
                  >
                    <input type="file" ref={ebinderInputRef} onChange={handleEbinderUpload} className="hidden" accept="image/*" />
                    <div className={`w-12 h-12 rounded-2xl flex items-center justify-center ${ebinderLoading ? 'bg-emerald-50' : ebinderData ? 'bg-emerald-100' : 'bg-emerald-50'}`}>
                      {ebinderLoading
                        ? <i className="fa-solid fa-spinner animate-spin text-emerald-500"></i>
                        : <i className="fa-solid fa-calendar-check text-emerald-500"></i>
                      }
                    </div>
                    <div>
                      <p className="text-[10px] font-black uppercase text-slate-400">E-Binder</p>
                      <h4 className="font-bold">{ebinderLoading ? 'Parsing...' : ebinderData ? 'Availability Loaded' : 'Upload Availability'}</h4>
                      {ebinderData && offDriverIdsFinal.size > 0 && (
                        <p className="text-[9px] text-amber-600 font-bold mt-0.5">{offDriverIdsFinal.size} off today</p>
                      )}
                      {ebinderData && offDriverIdsFinal.size === 0 && (
                        <p className="text-[9px] text-emerald-600 font-bold mt-0.5">All drivers available</p>
                      )}
                    </div>
                  </div>
                  <div onClick={handleAutoAssign} className="bg-white p-6 rounded-3xl shadow-sm border border-slate-100 flex items-center gap-4 cursor-pointer hover:border-blue-500 hover:shadow-lg transition-all">
                      <div className="w-12 h-12 bg-blue-50 rounded-2xl flex items-center justify-center text-blue-500"><i className="fa-solid fa-wand-magic-sparkles"></i></div>
                      <div><p className="text-[10px] font-black uppercase text-slate-400">Smart Fix</p><h4 className="font-bold">Auto-Assign</h4></div>
                  </div>
                  <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-100 flex flex-col justify-center">
                    <p className="text-[10px] font-black uppercase text-slate-400">Total Volume</p>
                    <h4 className="text-2xl font-black text-slate-800">{routes.reduce((s, r) => s + (Number(r.orderVolume) || 0), 0)}</h4>
                  </div>
                  <div className="lg:col-span-2 bg-white text-slate-800 p-6 rounded-3xl shadow-sm flex flex-col justify-center border border-slate-100">
                    <div className="flex items-center justify-between">
                      <div>
                          <p className="text-[10px] font-black uppercase text-slate-400">Dispatch Settings</p>
                          <h4 className="text-[10px] font-mono text-orange-600 tracking-tight mt-0.5 truncate">{batchInfo.batchId}</h4>
                      </div>
                      {ebinderData && (
                        <button
                          onClick={() => setShowAvailabilityPanel(p => !p)}
                          className={`text-[9px] font-black px-3 py-1.5 rounded-lg transition-all ${showAvailabilityPanel ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'}`}
                        >
                          {showAvailabilityPanel ? 'Hide Availability' : 'View Availability'}
                        </button>
                      )}
                    </div>
                  </div>
              </div>
              {showAvailabilityPanel && ebinderData && (
                <AvailabilityPanel
                  ebinderData={ebinderData}
                  offDriverIds={offDriverIdsFinal}
                  registry={registry}
                  batchDate={batchInfo.date}
                  onManualToggle={handleManualToggle}
                  onClose={() => setShowAvailabilityPanel(false)}
                />
              )}
              </>
            )}

            {loading ? (
                <div className="py-40 text-center animate-pulse">
                  <div className="w-20 h-20 border-8 border-orange-100 border-t-orange-500 rounded-full animate-spin mx-auto mb-8"></div>
                  <h3 className="text-2xl font-black">Processing Dispatch...</h3>
                </div>
            ) : (
                <div className="animate-in fade-in duration-500">
                    {/* Prioritize Bookmarks View regardless of data presence */}
                    {view === 'bookmarks' ? (
                      <BookmarksView />
                    ) : showLanding ? (
                      /* Show the full landing page if on a data-driven view with no data */
                      <div className="py-20 text-center max-w-2xl mx-auto">
                          <div className="w-24 h-24 bg-orange-500 rounded-[32px] flex items-center justify-center text-white text-4xl mx-auto mb-10 shadow-2xl shadow-orange-200"><i className="fa-solid fa-upload"></i></div>
                          <h2 className="text-4xl font-black text-slate-900 mb-6 tracking-tight">Driver Dispatch Hub</h2>
                          <p className="text-slate-500 mb-12 text-lg">Import your daily UniUni dispatch via Excel, screenshot, or manual entry.</p>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                              <label className="bg-slate-900 text-white py-5 px-8 rounded-3xl font-black text-sm cursor-pointer hover:bg-slate-800 transition-all shadow-2xl flex items-center justify-center gap-2">
                                  <i className="fa-solid fa-file-excel"></i> Upload Excel
                                  <input type="file" onChange={handleFileUpload} className="hidden" accept=".xlsx,.xls" />
                              </label>
                              <label className="bg-purple-600 text-white py-5 px-8 rounded-3xl font-black text-sm cursor-pointer hover:bg-purple-700 transition-all shadow-2xl flex items-center justify-center gap-2">
                                  <i className="fa-solid fa-camera"></i> Upload Screenshot
                                  <input type="file" onChange={handleImageUpload} className="hidden" accept="image/*" />
                              </label>
                              <button onClick={addEmptyRow} className="md:col-span-2 bg-white border-2 border-slate-100 text-slate-900 py-5 px-8 rounded-3xl font-black text-sm hover:border-orange-500 transition-all flex items-center justify-center gap-2">
                                  <i className="fa-solid fa-pen-to-square"></i> Manual Entry
                              </button>
                          </div>
                      </div>
                    ) : (
                      /* Regular Views with Data */
                      <>
                        {view === 'main' && <MainEditor routes={routes} registry={registry} offDriverIds={offDriverIdsFinal} onUpdate={onUpdateRoute} onDeleteRow={onDeleteRoute} onAddRow={addEmptyRow} onOpenSplit={setSplittingRoute} />}
                        {view === 'reports' && <WhatsAppReports groups={groupedData} batchInfo={batchInfo} />}
                        {view === 'allocations' && <AllocationSummaryView routes={routes} />}
                        {view === 'print' && <PrintView routes={routes} batchInfo={batchInfo} />}
                      </>
                    )}
                </div>
            )}
        </main>
        {splittingRoute && <SplitModal route={splittingRoute} onClose={() => setSplittingRoute(null)} onConfirm={handleSplit} />}
    </div>
  );
};

export default App;
