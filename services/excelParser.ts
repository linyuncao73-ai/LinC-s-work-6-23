import * as XLSX from 'xlsx';
import { RouteData, BatchInfo, SCAN_ID_MAP, ZONE_NAMES, DriverRegistry, getDefaultTimeSlot, getOttawaTodayDateString } from '../types';

/**
 * According to screenshot:
 * A: Split Count (Zones), B: Route #, C: Volume, D: Time, E: Driver Allocation, F: Scan ID
 */
const identifySummaryColumns = (jsonData: any[][]) => {
  const colIdx = { 
    splitCount: 0,
    route: 1,
    totalVol: 2,
    time: 3,
    allocation: 4,
    scanId: 5
  };

  for (let i = 0; i < Math.min(jsonData.length, 10); i++) {
    const row = jsonData[i];
    if (!row) continue;
    row.forEach((cell, idx) => {
      const s = String(cell || '').trim();
      if (s.includes('路线号') || s.includes('Route')) colIdx.route = idx;
      if (s.includes('单量') || s.includes('Volume')) colIdx.totalVol = idx;
      if (s.includes('分配') || s.includes('Allocation')) colIdx.allocation = idx;
      if (s.includes('扫描号') || s.includes('Scan')) colIdx.scanId = idx;
      if (s.includes('拆分') || s.includes('Split')) colIdx.splitCount = idx;
      if (s.includes('时间') || s.includes('Time')) colIdx.time = idx;
    });
  }

  return colIdx;
};

const parseAllocation = (str: string) => {
  const segments: { start: number, end: number, ident: string }[] = [];
  // Updated regex to capture anything inside parentheses as 'ident'
  const regex = /(\d+)-(\d+)\(([^)]+)\)/g;
  let match;
  while ((match = regex.exec(str)) !== null) {
    segments.push({
      start: parseInt(match[1]),
      end: parseInt(match[2]),
      ident: match[3].trim()
    });
  }
  return segments;
};

export const parseExcelFile = async (file: File, registry: DriverRegistry): Promise<{ routes: RouteData[], batchInfo: BatchInfo }> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: 'array' });
        const targetSheetName = workbook.SheetNames.find(name => name.includes('司机') || name.includes('Dispatch')) || workbook.SheetNames[0];
        const targetSheet = workbook.Sheets[targetSheetName];
        
        // We use { raw: false } to let XLSX handle formatting (like times) as strings
        const jsonData: any[][] = XLSX.utils.sheet_to_json(targetSheet, { header: 1, defval: '', raw: false });
        
        if (!jsonData || jsonData.length === 0) throw new Error("Empty content");

        // Force the date to be the current Ottawa date in MM/DD/YYYY format
        const date = getOttawaTodayDateString();
        
        let batchId = 'OSUB-' + new Date().toISOString().slice(0, 10).replace(/-/g, '');
        let expectedTotalVolume = 0;

        jsonData.slice(0, 15).forEach(row => {
          row.forEach((cell, idx) => {
            const s = String(cell || '').toLowerCase();
            // Removed date extraction from file to strictly enforce "next date of today" requirement
            if (s.includes('osub')) {
               const val = String(row[idx + 1] || row[idx] || '').trim();
               if (val.includes('OSUB')) batchId = val.match(/OSUB-\d+/)?.[0] || val;
            }
          });
        });

        const colIdx = identifySummaryColumns(jsonData);
        const routes: RouteData[] = [];

        for (let i = 0; i < jsonData.length; i++) {
          const row = jsonData[i];
          if (!row) continue;
          
          const rawRouteNum = String(row[colIdx.route] || '').trim();
          if (!/^33\d{3}/.test(rawRouteNum)) continue;

          const baseRouteKey = rawRouteNum.split('-')[0];
          const rowTotalVol = parseInt(String(row[colIdx.totalVol] || '0').replace(/[^\d]/g, '')) || 0;
          const allocStr = String(row[colIdx.allocation] || '').trim();
          const scanId = String(row[colIdx.scanId] || SCAN_ID_MAP[baseRouteKey] || '????');
          
          // Use getDefaultTimeSlot as the fallback for timeSlot
          let timeSlot = String(row[colIdx.time] || '').trim();
          if (!timeSlot) {
            timeSlot = getDefaultTimeSlot(baseRouteKey, date);
          }
          
          const segments = parseAllocation(allocStr);

          // If it's a base route (e.g. 33011) and contains segments in parentheses
          if (segments.length > 0) {
            expectedTotalVolume += rowTotalVol;
            
            segments.forEach((seg) => {
              const volume = seg.end - seg.start + 1;
              let driverId = '';
              let driverName = 'Unassigned';
              let driverGroup = 'Unassigned';
              let finalRouteNum = '';
              let location = 'Unknown';

              // Check if ident is a placeholder like 33011-4-1
              if (seg.ident.includes('-')) {
                // Placeholder format: baseRoute-total-index
                finalRouteNum = seg.ident;
                driverId = seg.ident; // Keep as ID for now
                
                const parts = seg.ident.split('-');
                if (parts.length >= 3) {
                  const base = parts[0];
                  const idx = parts[parts.length - 1];
                  location = ZONE_NAMES[`${base}-${idx}`] || 'Unknown';
                }
              } else {
                // Standard Driver ID format
                driverId = seg.ident;
                const driverEntry = registry[driverId];
                driverName = driverEntry?.name || `Driver ${driverId}`;
                driverGroup = driverEntry?.group || 'Unassigned';
                // Find index for standard routes (this assumes order in the allocation string)
                const segIdx = segments.indexOf(seg) + 1;
                finalRouteNum = `${rawRouteNum}-${segIdx}`;
                location = ZONE_NAMES[`${rawRouteNum}-${segIdx}`] || 'Unknown';
              }

              routes.push({
                id: `R-${finalRouteNum}-${i}-${driverId}`,
                driver: driverName,
                driverId: driverId,
                driverName: driverName,
                driverGroup: driverGroup,
                routeNum: finalRouteNum,
                routeLocation: location,
                timeSlot: timeSlot,
                orderVolume: volume,
                scanId: scanId
              });
            });
          } else if (rawRouteNum.length > 0) {
            // Row has route number but no standard allocation segments (single driver or simple row)
            expectedTotalVolume += rowTotalVol;
            
            const driverIdMatch = allocStr.match(/\b\d{4,6}\b/);
            const driverId = driverIdMatch ? driverIdMatch[0] : '';
            const driverEntry = registry[driverId];

            const parts = rawRouteNum.split('-');
            const zoneKey = parts.length > 1 ? `${parts[0]}-${parts[parts.length-1]}` : rawRouteNum;
            const location = ZONE_NAMES[rawRouteNum] || ZONE_NAMES[zoneKey] || 'Unknown';

            routes.push({
              id: `R-DETAIL-${rawRouteNum}-${i}`,
              driver: driverEntry?.name || (driverId ? `Driver ${driverId}` : 'Unassigned'),
              driverId: driverId,
              driverName: driverEntry?.name || (driverId ? `Driver ${driverId}` : 'Unassigned'),
              driverGroup: driverEntry?.group || 'Unassigned',
              routeNum: rawRouteNum,
              routeLocation: location,
              timeSlot: timeSlot,
              orderVolume: rowTotalVol,
              scanId: scanId
            });
          }
        }

        if (routes.length === 0) throw new Error("No valid 33XXX data found");
        
        resolve({ 
          routes, 
          batchInfo: { date, batchId, totalVolume: expectedTotalVolume } 
        });
      } catch (err: any) { reject(err); }
    };
    reader.readAsArrayBuffer(file);
  });
};