
import React, { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { parseExcelFile } from './services/excelParser';
import { RouteData, AgencyGroup, AGENCIES, REMOVED_DRIVER_IDS, BatchInfo, INITIAL_DRIVER_REGISTRY, DriverRegistry, partitionRegistry, PLACEHOLDER_MAPPING, ZONE_NAMES, SCAN_ID_MAP, ALLOWED_TIME_SLOTS, getDefaultTimeSlot, getOttawaTomorrowDateString, EbinderData, DRIVER_MAX_CAPACITIES, BROKER_MIN_CUT, getOffDriverIds } from './types';
import { getStoredApiKey, setStoredApiKey } from './services/apiKey';
import { saveSnapshot, loadSnapshot, fetchCloudUpdatedAt, saveRoster, loadRoster, savePending, loadPending, saveArchive, listArchives, loadArchive, ArchiveEntry, getTeamPasscode, setTeamPasscode, DispatchSnapshot } from './services/cloudSync';
import type { FeedbackOp } from './services/feedbackParser';
import { getHoldSuggestions } from './services/holdSuggestions';

const ApiKeyModal: React.FC<{ onClose: () => void; onSaved: (hasKey: boolean) => void }> = ({ onClose, onSaved }) => {
  const [value, setValue] = useState(getStoredApiKey());
  const [passcode, setPasscode] = useState(getTeamPasscode());
  const save = () => {
    setStoredApiKey(value);
    setTeamPasscode(passcode);
    onSaved(!!value.trim());
    onClose();
  };
  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-3xl p-8 max-w-md w-full shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 bg-amber-50 rounded-xl flex items-center justify-center text-amber-500"><i className="fa-solid fa-key"></i></div>
          <h3 className="text-lg font-black text-slate-900">Settings</h3>
        </div>
        <p className="text-[10px] font-black text-slate-400 uppercase mb-1">Gemini API Key</p>
        <p className="text-xs text-slate-500 mb-3 leading-relaxed">
          只保存在本机浏览器，不会上传。没有 key？去 <a href="https://aistudio.google.com/apikey" target="_blank" rel="noreferrer" className="text-blue-600 underline">aistudio.google.com/apikey</a> 免费创建。
        </p>
        <input
          type="password"
          value={value}
          onChange={e => setValue(e.target.value)}
          placeholder="AIza..."
          className="w-full px-4 py-3 border-2 border-slate-200 rounded-xl text-sm font-mono focus:border-amber-400 focus:outline-none mb-5"
          autoFocus
        />
        <p className="text-[10px] font-black text-slate-400 uppercase mb-1">团队口令（云同步加密）</p>
        <p className="text-xs text-slate-500 mb-3 leading-relaxed">
          设置后 ☁ 云端数据会用它加密，只有输入相同口令的人才能读取。团队所有人要填同一个口令。留空 = 不加密。
        </p>
        <input
          type="password"
          value={passcode}
          onChange={e => setPasscode(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') save(); }}
          placeholder="例如 yow2026"
          className="w-full px-4 py-3 border-2 border-slate-200 rounded-xl text-sm font-mono focus:border-amber-400 focus:outline-none mb-4"
        />
        <div className="flex gap-3">
          <button onClick={onClose} className="flex-1 py-3 rounded-xl text-xs font-black bg-slate-100 text-slate-500 hover:bg-slate-200 transition-all">Cancel</button>
          <button onClick={save} className="flex-1 py-3 rounded-xl text-xs font-black bg-amber-500 text-white hover:bg-amber-600 transition-all">Save</button>
        </div>
      </div>
    </div>
  );
};

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

// Broker team → WhatsApp group invite link, baked in so every machine gets
// the buttons without manual setup. UI/cloud edits override these; empty
// saved values fall back to the defaults.
const DEFAULT_TEAM_CONTACTS: Record<string, string> = {
  Chris: 'https://chat.whatsapp.com/D6dTisW7Y9u9uEqWb7icT8?s=cl&p=i&ilr=4',
  Kaneza: 'https://chat.whatsapp.com/DAlSnTKZxV6GLu9xCAVdla?s=cl&p=i&ilr=4',
  Alawi: 'https://chat.whatsapp.com/IcVd9F525552sweiMSHUSH?s=cl&p=i&ilr=4',
  Parfait: 'https://chat.whatsapp.com/IxDlMJQwU9GKzluNRRppNi?s=cl&p=i&ilr=4',
  // Alain: 群链接暂缺，拿到后补上或在 Drivers 页填写
};

const withDefaultContacts = (saved?: Record<string, string> | null): Record<string, string> => {
  const out = { ...DEFAULT_TEAM_CONTACTS };
  for (const [k, v] of Object.entries(saved || {})) {
    if (v && v.trim()) out[k] = v;
  }
  return out;
};

const getAgencyColor = (group: string) => {
  switch (group) {
    case 'Kaneza': return 'bg-rose-100 text-rose-900 border-rose-200';
    case 'Alain': return 'bg-blue-600 text-white border-blue-700';
    case 'Parfait': return 'bg-purple-100 text-purple-900 border-purple-200';
    case 'Alawi': return 'bg-fuchsia-100 text-fuchsia-900 border-fuchsia-200';
    case 'Chris': return 'bg-emerald-100 text-emerald-900 border-emerald-200';
    case 'Company': return 'bg-slate-200 text-slate-900 border-slate-300 shadow-sm';
    default: return 'bg-gray-200 text-gray-800 border-gray-300';
  }
};

const SplitModal: React.FC<{
  route: RouteData;
  teamDrivers: { id: string; name: string }[];
  agencyFirstDriverIds: Record<string, string>;
  driverCap?: number;
  onClose: () => void;
  onConfirm: (firstVolume: number, secondDriverId: string | null) => void;
}> = ({ route, teamDrivers, agencyFirstDriverIds, driverCap, onClose, onConfirm }) => {
  const isCapacitySplit = route.capacityStatus === 'split-recommended' && (route.capacityExcess ?? 0) > 0;
  // Broker routes split within the same team: one step, pick the driver ID directly.
  const isBrokerRoute = AGENCIES.includes(route.driverGroup || '');
  const smartDefault = Math.min(
    route.orderVolume - 1,
    Math.max(1, isCapacitySplit
      ? route.orderVolume - (route.capacityExcess ?? 0)
      : Math.floor(route.orderVolume / 2)
    )
  );
  const [splitVal, setSplitVal] = useState<number>(smartDefault);
  const [step, setStep] = useState<'volume' | 'broker'>('volume');
  const [manualId, setManualId] = useState('');

  // 实时数量提醒（不阻塞确认）：剪给中介低于 120 件中介多半不接；
  // 司机部分超过他的上限也标红。
  const part2Vol = route.orderVolume - splitVal;
  const brokerTooSmall = !isBrokerRoute && part2Vol > 0 && part2Vol < BROKER_MIN_CUT;
  const overCap = driverCap != null && splitVal > driverCap;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-6">
      <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={onClose}></div>
      <div className="bg-white rounded-[32px] shadow-2xl border border-slate-100 w-full max-w-md relative overflow-hidden">
        <div className="p-8 border-b border-slate-50">
          <h3 className="text-xl font-black text-slate-800">Split Route</h3>
          <p className="text-slate-400 text-xs font-bold uppercase tracking-widest mt-1">Route {route.routeNum} · Step {step === 'volume' ? '1/2: Volume' : '2/2: Pick Broker'}</p>
        </div>

        {step === 'volume' ? (
          <>
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
                <div className={`p-3 rounded-xl ${overCap ? 'bg-red-50 border-2 border-red-300' : 'bg-blue-50'}`}>
                  <p className={`text-[9px] font-black uppercase ${overCap ? 'text-red-400' : 'text-blue-400'}`}>Part 1 (Keeps)</p>
                  <p className={`text-xl font-black ${overCap ? 'text-red-600' : 'text-blue-700'}`}>{splitVal}</p>
                </div>
                <div className={`p-3 rounded-xl ${brokerTooSmall ? 'bg-red-50 border-2 border-red-300' : 'bg-orange-50'}`}>
                  <p className={`text-[9px] font-black uppercase ${brokerTooSmall ? 'text-red-400' : 'text-orange-400'}`}>Part 2 (Cut)</p>
                  <p className={`text-xl font-black ${brokerTooSmall ? 'text-red-600' : 'text-orange-700'}`}>{part2Vol}</p>
                </div>
              </div>
              {overCap && (
                <p className="text-xs font-bold text-red-600 -mt-3">
                  <i className="fa-solid fa-triangle-exclamation mr-1"></i>
                  超过{route.driverName ? ` ${route.driverName} 的` : '司机'}上限 {driverCap} 件
                </p>
              )}
              {brokerTooSmall && (
                <p className="text-xs font-bold text-red-600 -mt-3">
                  <i className="fa-solid fa-triangle-exclamation mr-1"></i>
                  给中介少于 {BROKER_MIN_CUT} 件，中介可能不接单
                </p>
              )}
              {isBrokerRoute && (
                <div className="space-y-2">
                  <p className="text-[10px] font-black text-slate-400 uppercase">Part 2 driver · Team {route.driverGroup} — 点司机号直接完成拆分</p>
                  <div className="grid grid-cols-3 gap-2 max-h-40 overflow-y-auto">
                    {teamDrivers.filter(d => d.id !== route.driverId).map(d => (
                      <button
                        key={d.id}
                        onClick={() => onConfirm(splitVal, d.id)}
                        className="py-2.5 px-2 rounded-xl text-xs font-black font-mono border border-slate-200 text-slate-700 hover:border-orange-400 hover:bg-orange-50 transition-all"
                      >
                        {d.id}
                      </button>
                    ))}
                  </div>
                  <div className="flex gap-2">
                    <input
                      value={manualId}
                      onChange={e => setManualId(e.target.value.replace(/\D/g, ''))}
                      onKeyDown={e => { if (e.key === 'Enter' && manualId) onConfirm(splitVal, manualId); }}
                      placeholder="或手输司机号"
                      className="flex-1 px-4 py-2.5 border-2 border-slate-100 rounded-xl text-xs font-mono focus:border-orange-400 focus:outline-none"
                    />
                    <button
                      onClick={() => onConfirm(splitVal, manualId)}
                      disabled={!manualId}
                      className="px-5 py-2.5 rounded-xl bg-slate-900 text-white text-xs font-black hover:bg-slate-800 transition-all disabled:opacity-30"
                    >
                      OK
                    </button>
                  </div>
                </div>
              )}
            </div>
            <div className="p-8 bg-slate-50 grid grid-cols-2 gap-4">
              <button onClick={onClose} className="px-6 py-4 rounded-2xl font-black text-xs text-slate-400 hover:text-slate-600 transition-all">Cancel</button>
              {isBrokerRoute ? (
                <button onClick={() => onConfirm(splitVal, null)} className="px-6 py-4 rounded-2xl font-black text-xs border border-slate-200 text-slate-500 hover:bg-slate-100 transition-all">
                  Split · Part 2 留空
                </button>
              ) : (
                <button onClick={() => setStep('broker')} className="px-6 py-4 rounded-2xl bg-slate-900 text-white font-black text-xs hover:bg-slate-800 transition-all shadow-lg shadow-slate-200">
                  Next: Pick Broker →
                </button>
              )}
            </div>
          </>
        ) : (
          <>
            <div className="p-8 space-y-4">
              <div className={`rounded-2xl px-5 py-3 flex justify-between text-sm border ${brokerTooSmall || overCap ? 'bg-red-50 border-red-200' : 'bg-orange-50 border-orange-100'}`}>
                <span className={`font-black ${overCap ? 'text-red-600' : 'text-blue-700'}`}>Part 1 (Driver): {splitVal}</span>
                <span className={`font-black ${brokerTooSmall ? 'text-red-600' : 'text-orange-700'}`}>Part 2 (Broker): {part2Vol}</span>
              </div>
              {brokerTooSmall && (
                <p className="text-xs font-bold text-red-600">
                  <i className="fa-solid fa-triangle-exclamation mr-1"></i>
                  给中介少于 {BROKER_MIN_CUT} 件，中介可能不接单 —— 可返回上一步调大 Part 2
                </p>
              )}
              <p className="text-[10px] font-black text-slate-400 uppercase">Select broker for Part 2</p>
              <div className="grid grid-cols-3 gap-3">
                {AGENCIES.map(agency => (
                  <button
                    key={agency}
                    onClick={() => onConfirm(splitVal, agencyFirstDriverIds[agency] || null)}
                    className={`py-3 px-2 rounded-2xl text-xs font-black border transition-all hover:shadow-md ${getAgencyColor(agency)}`}
                  >
                    {agency}
                  </button>
                ))}
                <button
                  onClick={() => onConfirm(splitVal, null)}
                  className="py-3 px-2 rounded-2xl text-xs font-black border border-slate-200 text-slate-500 hover:bg-slate-50 transition-all"
                >
                  Skip
                </button>
              </div>
            </div>
            <div className="p-8 bg-slate-50">
              <button onClick={() => setStep('volume')} className="w-full py-3 rounded-2xl font-black text-xs text-slate-400 hover:text-slate-600 transition-all">
                ← Back
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

const ReassignModal: React.FC<{
  route: RouteData;
  availableDrivers: { id: string; name: string }[];
  agencyFirstDriverIds: Record<string, string>;
  onClose: () => void;
  onReassign: (driverId: string) => void;
}> = ({ route, availableDrivers, agencyFirstDriverIds, onClose, onReassign }) => (
  <div className="fixed inset-0 z-[100] flex items-center justify-center p-6">
    <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={onClose}></div>
    <div className="bg-white rounded-[32px] shadow-2xl border border-slate-100 w-full max-w-sm relative overflow-hidden">
      <div className="p-6 border-b border-slate-50">
        <h3 className="text-lg font-black text-slate-800">Quick Reassign</h3>
        <p className="text-slate-400 text-xs font-bold uppercase tracking-widest mt-1">
          {route.routeNum} · {route.driverName} is off
        </p>
      </div>
      <div className="p-6 space-y-4">
        <div>
          <p className="text-[10px] font-black text-slate-400 uppercase mb-2">Available Company Drivers</p>
          <div className="space-y-1 max-h-44 overflow-y-auto">
            {availableDrivers.length === 0 && <p className="text-xs text-slate-400 px-2">No company drivers available today</p>}
            {availableDrivers.map(d => (
              <button key={d.id} onClick={() => onReassign(d.id)} className="w-full text-left px-3 py-2 rounded-xl text-xs font-bold hover:bg-slate-50 flex justify-between items-center transition-all">
                <span className="text-slate-800">{d.name}</span>
                <span className="font-mono text-slate-400">#{d.id}</span>
              </button>
            ))}
          </div>
        </div>
        <div>
          <p className="text-[10px] font-black text-slate-400 uppercase mb-2">Broker Teams</p>
          <div className="flex flex-wrap gap-2">
            {AGENCIES.map(agency => agencyFirstDriverIds[agency] ? (
              <button key={agency} onClick={() => onReassign(agencyFirstDriverIds[agency])} className={`px-3 py-1.5 rounded-xl text-xs font-black border transition-all hover:shadow-sm ${getAgencyColor(agency)}`}>
                {agency}
              </button>
            ) : null)}
          </div>
        </div>
      </div>
      <div className="p-6 bg-slate-50">
        <button onClick={onClose} className="w-full py-3 rounded-2xl font-black text-xs text-slate-400 hover:text-slate-600 transition-all">Cancel</button>
      </div>
    </div>
  </div>
);

const BatchSplitModal: React.FC<{
  overRoutes: RouteData[];
  agencyFirstDriverIds: Record<string, string>;
  onClose: () => void;
  onConfirm: (picks: Record<string, string | null>) => void;
}> = ({ overRoutes, agencyFirstDriverIds, onClose, onConfirm }) => {
  const [picks, setPicks] = useState<Record<string, string | null>>({});
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-6">
      <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={onClose}></div>
      <div className="bg-white rounded-[32px] shadow-2xl border border-slate-100 w-full max-w-xl relative flex flex-col max-h-[85vh]">
        <div className="p-7 border-b border-slate-50 flex-shrink-0">
          <h3 className="text-xl font-black text-slate-800">Batch Split · {overRoutes.length} Routes</h3>
          <p className="text-slate-400 text-xs font-bold uppercase tracking-widest mt-1">Select a broker for each route's excess volume</p>
        </div>
        <div className="overflow-y-auto flex-1 p-6 space-y-4">
          {overRoutes.map(route => {
            const driverKeeps = route.orderVolume - (route.capacityExcess ?? 0);
            const brokerTakes = route.capacityExcess ?? 0;
            const picked = picks[route.id] ?? null;
            return (
              <div key={route.id} className="bg-slate-50 rounded-2xl p-5">
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <p className="font-black text-slate-800">{route.routeNum}</p>
                    <p className="text-xs text-slate-400 mt-0.5">
                      {route.driverName} · <span className="text-blue-600 font-bold">{driverKeeps} keeps</span> + <span className="text-orange-600 font-bold">{brokerTakes} to broker</span>
                    </p>
                  </div>
                  {picked && (
                    <span className="text-[10px] font-black text-emerald-700 bg-emerald-50 px-2 py-1 rounded-lg border border-emerald-200">✓ Assigned</span>
                  )}
                </div>
                <div className="flex flex-wrap gap-2">
                  {AGENCIES.map(agency => {
                    const agId = agencyFirstDriverIds[agency];
                    const isSelected = picked === agId;
                    return agId ? (
                      <button
                        key={agency}
                        onClick={() => setPicks(p => ({ ...p, [route.id]: agId }))}
                        className={`px-3 py-1.5 rounded-xl text-xs font-black border transition-all ${isSelected ? 'ring-2 ring-orange-400 ' + getAgencyColor(agency) : getAgencyColor(agency) + ' opacity-70 hover:opacity-100'}`}
                      >
                        {agency}
                      </button>
                    ) : null;
                  })}
                  <button
                    onClick={() => setPicks(p => { const n = { ...p }; delete n[route.id]; return n; })}
                    className="px-3 py-1.5 rounded-xl text-xs font-black border border-slate-200 text-slate-400 hover:bg-slate-100 transition-all"
                  >
                    Skip
                  </button>
                </div>
              </div>
            );
          })}
        </div>
        <div className="p-6 bg-slate-50 flex-shrink-0 grid grid-cols-2 gap-4">
          <button onClick={onClose} className="py-4 rounded-2xl font-black text-xs text-slate-400 hover:text-slate-600 transition-all">Cancel</button>
          <button onClick={() => onConfirm(picks)} className="py-4 rounded-2xl bg-slate-900 text-white font-black text-xs hover:bg-slate-800 transition-all shadow-lg shadow-slate-200">
            Apply All Splits
          </button>
        </div>
      </div>
    </div>
  );
};

const AvailabilityPanel: React.FC<{
  ebinderData: EbinderData | null;
  offDriverIds: Set<string>;
  registry: DriverRegistry;
  batchDate: string;
  onManualToggle: (driverId: string, setOff: boolean) => void;
  onClose: () => void;
}> = ({ ebinderData, offDriverIds, registry, batchDate, onManualToggle, onClose }) => {
  // With e-binder data: sheet row order first, then registry-only company drivers.
  // Without: all company drivers from the registry.
  const removed = new Set(REMOVED_DRIVER_IDS);
  const ebRows = (ebinderData?.drivers || []).filter(d => !removed.has(d.driverId));
  const ebIdSet = new Set(ebRows.map(d => d.driverId));
  const companyDrivers: [string, { name: string; maxCapacity?: number; notOnSheet?: boolean }][] = [
    ...ebRows.map(d => {
      const reg = registry[d.driverId];
      return [d.driverId, {
        name: reg?.name || d.driverName,
        maxCapacity: reg?.maxCapacity ?? d.maxCapacity ?? undefined,
      }] as [string, { name: string; maxCapacity?: number; notOnSheet?: boolean }];
    }),
    ...Object.entries(registry)
      .filter(([id, d]) => d.group === 'Company' && !ebIdSet.has(id) && !removed.has(id))
      .map(([id, d]) => [id, { name: d.name, maxCapacity: d.maxCapacity, notOnSheet: !!ebinderData }] as [string, { name: string; maxCapacity?: number; notOnSheet?: boolean }]),
  ];
  const offCount = companyDrivers.filter(([id]) => offDriverIds.has(id)).length;
  const parsedAgo = ebinderData ? Math.round((Date.now() - ebinderData.parsedAt) / 60000) : null;

  return (
    <div className="bg-white rounded-3xl shadow-sm border border-slate-100 p-6 mb-6">
      <div className="flex justify-between items-start mb-4">
        <div>
          <h3 className="font-black text-slate-800 text-sm uppercase tracking-wider">Driver Availability</h3>
          <p className="text-[10px] text-slate-400 mt-0.5">For tomorrow · {batchDate}{parsedAgo !== null && ` · Parsed ${parsedAgo < 1 ? 'just now' : `${parsedAgo}m ago`}`}</p>
        </div>
        <div className="flex items-center gap-3">
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
              <span className={`text-[10px] font-black ${isOff ? 'text-amber-700 line-through' : 'text-emerald-800'}`}>{id} {driver.name}</span>
              <span className={`text-[8px] ${isOff ? 'text-amber-500' : 'text-emerald-500'}`}>{driver.notOnSheet ? 'Not on sheet' : isOff ? 'OFF' : `Max: ${maxCap ?? '∞'}`}</span>
            </button>
          );
        })}
      </div>
      <div className="flex justify-between items-center mt-3">
        <p className="text-[9px] text-slate-400">Click a driver to manually toggle. Run Auto-Assign to apply changes.</p>
        <span className={`text-[11px] font-black px-3 py-1 rounded-lg ${offCount > 0 ? 'bg-amber-100 text-amber-700' : 'bg-emerald-100 text-emerald-700'}`}>
          {offCount} off tomorrow · {companyDrivers.length - offCount} available
        </span>
      </div>
    </div>
  );
};

const HistoryModal: React.FC<{
  onClose: () => void;
  onRestore: (entry: ArchiveEntry) => void;
}> = ({ onClose, onRestore }) => {
  const [entries, setEntries] = useState<ArchiveEntry[] | null>(null);
  useEffect(() => {
    listArchives().then(setEntries).catch(() => setEntries([]));
  }, []);
  const fmtTime = (iso: string) => {
    try {
      return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Toronto', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(iso));
    } catch { return ''; }
  };
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-6">
      <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={onClose}></div>
      <div className="bg-white rounded-[32px] shadow-2xl border border-slate-100 w-full max-w-md relative flex flex-col max-h-[80vh]">
        <div className="p-7 border-b border-slate-50 flex-shrink-0">
          <h3 className="text-xl font-black text-slate-800">历史存档</h3>
          <p className="text-slate-400 text-xs font-bold uppercase tracking-widest mt-1">每次 ☁ 保存都会按排班日期自动存档一份</p>
        </div>
        <div className="flex-1 overflow-y-auto p-5 space-y-2">
          {entries === null && <p className="text-xs text-slate-400 text-center py-8"><i className="fa-solid fa-spinner animate-spin mr-2"></i>加载中…</p>}
          {entries !== null && entries.length === 0 && <p className="text-xs text-slate-400 text-center py-8">还没有存档。点 ☁↑ 保存一次即产生当天的存档。</p>}
          {entries?.map(entry => (
            <button
              key={entry.id}
              onClick={() => onRestore(entry)}
              className="w-full flex justify-between items-center px-5 py-3.5 rounded-2xl border border-slate-100 hover:border-orange-300 hover:bg-orange-50/40 transition-all text-left"
            >
              <span className="font-black text-slate-800 text-sm">{entry.dateLabel}</span>
              <span className="text-[10px] text-slate-400">保存于 {fmtTime(entry.updatedAt)}</span>
            </button>
          ))}
        </div>
        <div className="p-5 bg-slate-50 flex-shrink-0">
          <button onClick={onClose} className="w-full py-3 rounded-2xl font-black text-xs text-slate-400 hover:text-slate-600 transition-all">关闭</button>
        </div>
      </div>
    </div>
  );
};

const PasteTableModal: React.FC<{
  onClose: () => void;
  onImport: (text: string) => void;
  error: string;
  busy: boolean;
}> = ({ onClose, onImport, error, busy }) => {
  const [text, setText] = useState('');
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-6">
      <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={onClose}></div>
      <div className="bg-white rounded-[32px] shadow-2xl border border-slate-100 w-full max-w-2xl relative flex flex-col max-h-[85vh]">
        <div className="p-7 border-b border-slate-50 flex-shrink-0">
          <h3 className="text-xl font-black text-slate-800">Paste Dispatch Table</h3>
          <p className="text-slate-400 text-xs font-bold uppercase tracking-widest mt-1">
            在取货表网页上框选整个表格 → Ctrl+C 复制 → 粘贴到这里（不依赖 AI，瞬间导入）
          </p>
        </div>
        <div className="p-7 flex-1 overflow-y-auto">
          <textarea
            value={text}
            onChange={e => setText(e.target.value)}
            placeholder={"例如：\n33011  -  465  PENDING  8257  待转扫  1-253(33011-2-1),254-473(33011-2-2)  2\n33012  -  577  PENDING  8258  待转扫  1-181(33012-3-1),182-352(33012-3-2),353-580(33012-3-3)  3\n…"}
            className="w-full h-64 px-5 py-4 border-2 border-slate-100 rounded-2xl text-xs font-mono focus:border-purple-400 focus:outline-none resize-none"
            autoFocus
          />
          {error && <p className="text-xs text-red-600 font-bold mt-3">{error}</p>}
        </div>
        <div className="p-7 bg-slate-50 grid grid-cols-2 gap-4 flex-shrink-0">
          <button onClick={onClose} className="px-6 py-4 rounded-2xl font-black text-xs text-slate-400 hover:text-slate-600 transition-all">Cancel</button>
          <button
            onClick={() => onImport(text)}
            disabled={!text.trim() || busy}
            className="px-6 py-4 rounded-2xl bg-purple-600 text-white font-black text-xs hover:bg-purple-700 transition-all shadow-lg disabled:opacity-40"
          >
            导入 →
          </button>
        </div>
      </div>
    </div>
  );
};

const FeedbackModal: React.FC<{
  routes: RouteData[];
  registry: DriverRegistry;
  onClose: () => void;
  onApply: (ops: FeedbackOp[], addUnknownDrivers: boolean) => void;
}> = ({ routes, registry, onClose, onApply }) => {
  const [text, setText] = useState('');
  const [phase, setPhase] = useState<'input' | 'parsing' | 'preview'>('input');
  const [ops, setOps] = useState<FeedbackOp[]>([]);
  const [checked, setChecked] = useState<Record<number, boolean>>({});
  const [addUnknown, setAddUnknown] = useState(true);
  const [error, setError] = useState('');

  const unknownDrivers = useMemo(() => {
    const seen = new Map<string, string>();
    for (const op of ops) {
      const route = routes.find(r => r.routeNum === op.routeNum);
      for (const seg of op.segments) {
        if (seg.driverId && !registry[seg.driverId] && !seen.has(seg.driverId)) {
          seen.set(seg.driverId, route?.driverGroup || 'Unassigned');
        }
      }
    }
    return [...seen.entries()].map(([id, group]) => ({ id, group }));
  }, [ops, routes, registry]);

  const parse = async () => {
    setPhase('parsing');
    setError('');
    try {
      const { parseFeedbackTextLocal, parseBrokerFeedback } = await import('./services/feedbackParser');
      // All base routes qualify: a company-owned base can have a broker ".1"
      // cut that the reply re-assigns (e.g. "5003303 15-1.1").
      const candidates = routes
        .filter(r => !r.routeNum.includes('.'))
        .map(r => ({ routeNum: r.routeNum, orderVolume: r.orderVolume, driverId: r.driverId || '', driverGroup: r.driverGroup || '' }));
      // Rule-based parse first: instant, offline, immune to AI outages.
      let parsed = parseFeedbackTextLocal(text, candidates);
      if (parsed.length === 0) {
        parsed = await parseBrokerFeedback(text, candidates);
      }
      if (parsed.length === 0) {
        setError('没有解析出任何派工内容。请确认粘贴的是中介的回复文字，且这些路线已经分给了中介团队。');
        setPhase('input');
        return;
      }
      setOps(parsed);
      setChecked(Object.fromEntries(parsed.map((_, i) => [i, true])));
      setPhase('preview');
    } catch (err: any) {
      setError(err.message || '解析失败，请重试');
      setPhase('input');
    }
  };

  const routeByNum = (num: string) => routes.find(r => r.routeNum === num);
  const selectedCount = ops.filter((_, i) => checked[i]).length;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-6">
      <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={onClose}></div>
      <div className="bg-white rounded-[32px] shadow-2xl border border-slate-100 w-full max-w-2xl relative flex flex-col max-h-[85vh]">
        <div className="p-7 border-b border-slate-50 flex-shrink-0">
          <h3 className="text-xl font-black text-slate-800">Paste Broker Feedback</h3>
          <p className="text-slate-400 text-xs font-bold uppercase tracking-widest mt-1">
            {phase === 'preview' ? '确认改动后一键套用' : '把中介回复的文字整段粘进来，AI 自动解析成改动清单'}
          </p>
        </div>

        {phase !== 'preview' ? (
          <>
            <div className="p-7 flex-1 overflow-y-auto">
              <textarea
                value={text}
                onChange={e => setText(e.target.value)}
                placeholder={"例如：\n19994  14-1\n18944  29-1  #120\n18943  29-1.1  #67\n22-1: 20059(190) to 12588(100)\nDriver ID 19749: 33020 - 2 (1 - 150)"}
                className="w-full h-64 px-5 py-4 border-2 border-slate-100 rounded-2xl text-xs font-mono focus:border-orange-400 focus:outline-none resize-none"
                autoFocus
              />
              {error && <p className="text-xs text-red-600 font-bold mt-3">{error}</p>}
              {phase === 'parsing' && (
                <p className="text-xs text-blue-600 font-bold mt-3"><i className="fa-solid fa-spinner animate-spin mr-1"></i>正在解析（模型繁忙时会自动重试）…</p>
              )}
            </div>
            <div className="p-7 bg-slate-50 grid grid-cols-2 gap-4 flex-shrink-0">
              <button onClick={onClose} className="px-6 py-4 rounded-2xl font-black text-xs text-slate-400 hover:text-slate-600 transition-all">Cancel</button>
              <button
                onClick={parse}
                disabled={!text.trim() || phase === 'parsing'}
                className="px-6 py-4 rounded-2xl bg-slate-900 text-white font-black text-xs hover:bg-slate-800 transition-all shadow-lg disabled:opacity-40"
              >
                解析反馈 →
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="flex-1 overflow-y-auto p-7 space-y-3">
              {ops.map((op, i) => {
                const route = routeByNum(op.routeNum);
                const partRows = routes.filter(r => r.routeNum.startsWith(`${op.routeNum}.`) && /^\d+$/.test(r.routeNum.slice(op.routeNum.length + 1)));
                const partsTotal = (route?.orderVolume || 0) + partRows.reduce((s, r) => s + (Number(r.orderVolume) || 0), 0);
                const coversBase = op.segments.some(s => s.partIdx === 0);
                const hasNull = op.segments.some(s => s.volume === null);
                const givenSum = op.segments.reduce((s, seg) => s + (seg.volume ?? 0), 0);
                const mismatch = route && coversBase && !hasNull && givenSum !== partsTotal;
                return (
                  <label key={i} className={`flex items-start gap-3 p-4 rounded-2xl border cursor-pointer transition-all ${checked[i] ? 'border-orange-200 bg-orange-50/40' : 'border-slate-100 opacity-50'}`}>
                    <input
                      type="checkbox"
                      checked={!!checked[i]}
                      onChange={() => setChecked(prev => ({ ...prev, [i]: !prev[i] }))}
                      className="mt-1"
                    />
                    <div className="flex-1">
                      <div className="flex items-baseline gap-3 flex-wrap">
                        <span className="font-black text-orange-600 text-sm">{op.routeNum}</span>
                        {route?.routeLocation && <span className="text-[10px] font-bold text-slate-500">{route.routeLocation}</span>}
                        {route && <span className="text-[10px] text-slate-400">共 {partsTotal} 件{partRows.length > 0 && `（含 ${partRows.length} 个切段）`}</span>}
                        {mismatch && <span className="text-[10px] font-black text-yellow-700 bg-yellow-100 px-2 py-0.5 rounded">⚠ 件数合计 {givenSum} ≠ 货量 {partsTotal}，套用时自动补差</span>}
                      </div>
                      <div className="space-y-1.5 mt-2">
                        {op.segments.map((seg, si) => {
                          const target = seg.partIdx === 0
                            ? route
                            : partRows.find(r => r.routeNum === `${op.routeNum}.${seg.partIdx}`);
                          const oldId = target?.driverId || '';
                          const d = registry[seg.driverId];
                          const isNewDriver = !d;
                          const teamBadge = isNewDriver
                            ? 'bg-yellow-100 text-yellow-800 border-yellow-300'
                            : getAgencyColor(d.group);
                          return (
                            <div key={si} className="flex items-center gap-2 flex-wrap bg-white border border-slate-200 rounded-xl px-3 py-2">
                              <span className="text-[9px] font-black text-slate-400 uppercase w-9">{seg.partIdx === 0 ? '主段' : `.${seg.partIdx} 段`}</span>
                              {oldId && oldId !== seg.driverId && (
                                <span className="text-[10px] text-slate-400"><s>{oldId}</s> →</span>
                              )}
                              <span className="font-black text-sm text-slate-900 font-mono">{seg.driverId}</span>
                              <span className="text-xs font-bold text-slate-600">{d?.name || `Driver ${seg.driverId}`}</span>
                              <span className={`px-2 py-0.5 rounded-full text-[9px] font-black uppercase border ${teamBadge}`}>
                                {isNewDriver ? '新司机' : d.group}
                              </span>
                              <span className="text-[10px] font-bold text-slate-500 ml-auto">{seg.volume !== null ? `× ${seg.volume} 件` : '× 不变/剩余'}</span>
                            </div>
                          );
                        })}
                      </div>
                      {route && (
                        <p className="text-[10px] text-slate-400 mt-1.5">改前：{route.driverId || '未分配'}{registry[route.driverId || '']?.name ? ` ${registry[route.driverId!].name}` : ''} · 主段 {route.orderVolume} 件</p>
                      )}
                    </div>
                  </label>
                );
              })}
            </div>
            <div className="p-7 bg-slate-50 flex-shrink-0 space-y-4">
              {unknownDrivers.length > 0 && (
                <label className="flex items-start gap-3 p-3 rounded-xl bg-orange-50 border border-orange-200 cursor-pointer">
                  <input type="checkbox" checked={addUnknown} onChange={() => setAddUnknown(v => !v)} className="mt-0.5" />
                  <span className="text-xs text-orange-800">
                    <span className="font-black">发现 {unknownDrivers.length} 个名册里没有的司机号：</span>
                    {unknownDrivers.map(u => `${u.id}（${u.group}）`).join('、')}
                    <span className="block mt-1 text-orange-600">勾选 = 套用时临时加入对应中介名册（之后可在 Drivers 页上传到 Supabase 或删除）</span>
                  </span>
                </label>
              )}
              <div className="grid grid-cols-2 gap-4">
                <button onClick={() => setPhase('input')} className="px-6 py-4 rounded-2xl font-black text-xs text-slate-400 hover:text-slate-600 transition-all">← 改文字重新解析</button>
                <button
                  onClick={() => onApply(ops.filter((_, i) => checked[i]), addUnknown)}
                  disabled={selectedCount === 0}
                  className="px-6 py-4 rounded-2xl bg-emerald-600 text-white font-black text-xs hover:bg-emerald-700 transition-all shadow-lg disabled:opacity-40"
                >
                  套用 {selectedCount} 条改动 ✓
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

const DriversView: React.FC<{
  registry: DriverRegistry;
  dirty: boolean;
  onUpsert: (id: string, entry: { name: string; group: string; maxCapacity?: number }) => void;
  onDelete: (id: string) => void;
  onPush: () => void;
  onApproveTemp: (id: string) => void;
  onApproveAllTemp: () => void;
  onDeleteTemp: (id: string) => void;
  teamContacts: Record<string, string>;
  onSetContact: (team: string, link: string) => void;
}> = ({ registry, dirty, onUpsert, onDelete, onPush, onApproveTemp, onApproveAllTemp, onDeleteTemp, teamContacts, onSetContact }) => {
  const [search, setSearch] = useState('');
  const [newId, setNewId] = useState('');
  const [newName, setNewName] = useState('');
  const [newGroup, setNewGroup] = useState('Company');
  const [newMax, setNewMax] = useState('');
  const [approveId, setApproveId] = useState('');
  const [approveMsg, setApproveMsg] = useState('');
  const groupsOrder = ['Company', ...AGENCIES];

  const tempRows = useMemo(
    () => Object.entries(registry).filter(([, d]) => d.temp).sort((a, b) => a[0].localeCompare(b[0], undefined, { numeric: true })),
    [registry]
  );

  const approveByInput = () => {
    const id = approveId.replace(/\D/g, '');
    if (!id) return;
    if (registry[id]?.temp) {
      onApproveTemp(id);
      setApproveMsg(`✓ ${id} 已转为永久司机（记得点 Update 上传）`);
      setApproveId('');
    } else if (registry[id]) {
      setApproveMsg(`${id} 已经是永久司机`);
    } else {
      setApproveMsg(`临时名单里没有 ${id}`);
    }
  };

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return Object.entries(registry)
      .filter(([, d]) => !d.temp)
      .filter(([id, d]) => !q || id.includes(q) || d.name.toLowerCase().includes(q))
      .sort((a, b) => {
        const ga = groupsOrder.indexOf(a[1].group);
        const gb = groupsOrder.indexOf(b[1].group);
        if (ga !== gb) return (ga === -1 ? 99 : ga) - (gb === -1 ? 99 : gb);
        return a[0].localeCompare(b[0], undefined, { numeric: true });
      });
  }, [registry, search]);

  const addDriver = () => {
    const id = newId.replace(/\D/g, '');
    if (!id || !newName.trim()) return;
    onUpsert(id, { name: newName.trim(), group: newGroup, maxCapacity: newMax ? parseInt(newMax) : undefined });
    setNewId(''); setNewName(''); setNewMax('');
  };

  return (
    <div className="bg-white rounded-3xl shadow-xl border border-slate-100 overflow-hidden">
      <div className="bg-slate-50 border-b border-slate-100 px-8 py-4 flex flex-wrap justify-between items-center gap-4">
        <div>
          <h3 className="text-lg font-black text-slate-800">Driver Roster</h3>
          <p className="text-slate-400 text-[10px] font-bold uppercase tracking-widest">
            {Object.keys(registry).length} drivers · 改完点 Update 上传，其他电脑打开自动拉取
            {dirty && <span className="text-red-500 ml-2">● 本机有未上传的改动</span>}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="搜索 ID 或名字…"
            className="px-4 py-2 border-2 border-slate-100 rounded-xl text-xs focus:border-orange-400 focus:outline-none w-48"
          />
          <button
            onClick={onPush}
            className={`relative px-6 py-2.5 rounded-xl text-xs font-black transition-all flex items-center gap-2 shadow-lg ${dirty ? 'bg-red-500 text-white hover:bg-red-600 shadow-red-100 animate-pulse' : 'bg-blue-600 text-white hover:bg-blue-700 shadow-blue-100'}`}
            title="需要修改密码"
          >
            <i className="fa-solid fa-lock text-[10px]"></i> Update to Supabase
          </button>
        </div>
      </div>
      {tempRows.length > 0 && (
        <div className="px-8 py-5 bg-orange-50 border-b-2 border-orange-200">
          <div className="flex flex-wrap justify-between items-center gap-3 mb-3">
            <h4 className="font-black text-orange-800 text-sm">
              <i className="fa-solid fa-hourglass-half mr-2"></i>临时司机 · 待批准（{tempRows.length}）
            </h4>
            <button
              onClick={onApproveAllTemp}
              className="px-4 py-2 rounded-xl bg-orange-500 text-white text-xs font-black hover:bg-orange-600 transition-all"
            >
              全部转正 ✓
            </button>
          </div>
          <div className="flex flex-wrap gap-2 mb-3">
            {tempRows.map(([id, d]) => (
              <span key={id} className="inline-flex items-center gap-2 bg-white border border-orange-200 rounded-xl px-3 py-1.5">
                <span className="font-mono text-xs font-bold text-slate-700">{id}</span>
                <span className={`text-[9px] font-black px-1.5 py-0.5 rounded border ${getAgencyColor(d.group)}`}>{d.group}</span>
                <button onClick={() => onApproveTemp(id)} className="text-emerald-600 hover:text-emerald-800 text-xs font-black" title="转为永久司机">转正</button>
                <button onClick={() => { if (window.confirm(`删除临时司机 ${id}？`)) onDeleteTemp(id); }} className="text-slate-300 hover:text-red-500 text-xs" title="删除"><i className="fa-solid fa-xmark"></i></button>
              </span>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <input
              value={approveId}
              onChange={e => { setApproveId(e.target.value.replace(/\D/g, '')); setApproveMsg(''); }}
              onKeyDown={e => { if (e.key === 'Enter') approveByInput(); }}
              placeholder="输入司机号转为永久"
              className="w-44 px-3 py-2 border-2 border-orange-200 rounded-xl text-xs font-mono focus:border-orange-400 focus:outline-none bg-white"
            />
            <button onClick={approveByInput} disabled={!approveId} className="px-4 py-2 rounded-xl bg-slate-900 text-white text-xs font-black hover:bg-slate-800 transition-all disabled:opacity-30">转正</button>
            {approveMsg && <span className="text-xs font-bold text-orange-700">{approveMsg}</span>}
            <span className="text-[10px] text-orange-500 ml-auto">临时司机自动同步给同事；转正后记得点 Update to Supabase 上传正式名册</span>
          </div>
        </div>
      )}
      <div className="px-8 py-4 bg-emerald-50/40 border-b border-slate-100">
        <p className="text-[10px] font-black text-slate-500 uppercase mb-1">中介 WhatsApp 群组链接</p>
        <p className="text-[10px] text-slate-400 mb-3">在各中介群里点"群资料 → 邀请链接"复制后粘贴到这里；填好后 Reports 页可一键"复制并打开群聊"。记得点 Update 上传共享给同事。</p>
        <div className="flex flex-wrap gap-3">
          {AGENCIES.map(team => (
            <div key={team}>
              <p className={`text-[9px] font-black px-1.5 py-0.5 rounded border inline-block mb-1 ${getAgencyColor(team)}`}>{team}</p>
              <input
                value={teamContacts[team] || ''}
                onChange={e => onSetContact(team, e.target.value)}
                placeholder="https://chat.whatsapp.com/…"
                className="block w-56 px-3 py-2 border-2 border-slate-100 rounded-xl text-[10px] font-mono focus:border-emerald-400 focus:outline-none bg-white"
              />
            </div>
          ))}
        </div>
      </div>
      <div className="px-8 py-4 bg-orange-50/40 border-b border-slate-100 flex flex-wrap items-end gap-3">
        <div>
          <p className="text-[9px] font-black text-slate-400 uppercase mb-1">Driver ID</p>
          <input value={newId} onChange={e => setNewId(e.target.value.replace(/\D/g, ''))} placeholder="12345" className="w-24 px-3 py-2 border-2 border-slate-100 rounded-xl text-xs font-mono focus:border-orange-400 focus:outline-none bg-white" />
        </div>
        <div>
          <p className="text-[9px] font-black text-slate-400 uppercase mb-1">Name</p>
          <input value={newName} onChange={e => setNewName(e.target.value)} placeholder="名字" className="w-32 px-3 py-2 border-2 border-slate-100 rounded-xl text-xs focus:border-orange-400 focus:outline-none bg-white" />
        </div>
        <div>
          <p className="text-[9px] font-black text-slate-400 uppercase mb-1">Team</p>
          <select value={newGroup} onChange={e => setNewGroup(e.target.value)} className="px-3 py-2 border-2 border-slate-100 rounded-xl text-xs font-bold focus:border-orange-400 focus:outline-none bg-white">
            {groupsOrder.map(g => <option key={g} value={g}>{g}</option>)}
          </select>
        </div>
        <div>
          <p className="text-[9px] font-black text-slate-400 uppercase mb-1">Max</p>
          <input value={newMax} onChange={e => setNewMax(e.target.value.replace(/\D/g, ''))} placeholder="300" className="w-20 px-3 py-2 border-2 border-slate-100 rounded-xl text-xs font-mono focus:border-orange-400 focus:outline-none bg-white" />
        </div>
        <button onClick={addDriver} disabled={!newId || !newName.trim()} className="px-5 py-2.5 rounded-xl bg-slate-900 text-white text-xs font-black hover:bg-slate-800 transition-all disabled:opacity-30">
          <i className="fa-solid fa-plus mr-1"></i>Add Driver
        </button>
      </div>
      <div className="overflow-x-auto max-h-[60vh] overflow-y-auto">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 border-b border-slate-100 sticky top-0">
            <tr className="text-slate-400 font-black uppercase text-[10px] tracking-widest">
              <th className="px-8 py-3">ID</th>
              <th className="px-4 py-3">Name</th>
              <th className="px-4 py-3">Team</th>
              <th className="px-4 py-3">Max Capacity</th>
              <th className="px-8 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {rows.map(([id, d]) => (
              <tr key={id} className="hover:bg-slate-50/50">
                <td className="px-8 py-2.5 font-mono text-xs text-slate-500">{id}</td>
                <td className="px-4 py-2.5">
                  <input
                    value={d.name}
                    onChange={e => onUpsert(id, { name: e.target.value, group: d.group, maxCapacity: d.maxCapacity })}
                    className="font-bold text-slate-800 bg-transparent border-b border-transparent focus:border-orange-400 focus:outline-none w-36"
                  />
                </td>
                <td className="px-4 py-2.5">
                  <select
                    value={d.group}
                    onChange={e => onUpsert(id, { name: d.name, group: e.target.value, maxCapacity: d.maxCapacity })}
                    className={`px-2 py-1 rounded-lg text-[10px] font-black uppercase border cursor-pointer ${getAgencyColor(d.group)}`}
                  >
                    {groupsOrder.map(g => <option key={g} value={g}>{g}</option>)}
                  </select>
                </td>
                <td className="px-4 py-2.5">
                  <input
                    value={d.maxCapacity ?? DRIVER_MAX_CAPACITIES[id] ?? ''}
                    onChange={e => {
                      const v = e.target.value.replace(/\D/g, '');
                      onUpsert(id, { name: d.name, group: d.group, maxCapacity: v ? parseInt(v) : undefined });
                    }}
                    placeholder="∞"
                    className="w-16 font-mono text-xs bg-transparent border-b border-transparent focus:border-orange-400 focus:outline-none"
                  />
                </td>
                <td className="px-8 py-2.5 text-right">
                  <button
                    onClick={() => { if (window.confirm(`删除司机 ${id} ${d.name}？他将从名册和排班选项中消失。`)) onDelete(id); }}
                    className="p-2 text-slate-300 hover:text-red-500 transition-all"
                    title="Delete driver"
                  >
                    <i className="fa-solid fa-trash-can text-xs"></i>
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
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
    const html2canvas = (await import('html2canvas')).default;
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
  const [doneBases, setDoneBases] = useState<Set<string>>(new Set());

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

  // 顺序复制模式：下一条 = 第一个还没复制过的区
  const nextGroup = groups.find(g => !doneBases.has(g.base)) || null;
  const doneCount = groups.filter(g => doneBases.has(g.base)).length;

  const copyAll = () => {
    const text = groups.map(g => g.allocString).join('\n');
    navigator.clipboard.writeText(text);
    setCopiedAll(true);
    setTimeout(() => setCopiedAll(false), 2000);
  };

  const copyGroup = (base: string, allocString: string) => {
    navigator.clipboard.writeText(allocString);
    setCopiedGroup(base);
    setDoneBases(prev => new Set([...prev, base]));
    setTimeout(() => setCopiedGroup(null), 2000);
  };

  const copyNext = () => {
    if (nextGroup) copyGroup(nextGroup.base, nextGroup.allocString);
  };

  return (
    <div className="bg-white rounded-3xl shadow-sm border border-slate-100 p-8">
      <div className="flex justify-between items-center mb-8 gap-4 flex-wrap">
        <div>
          <h3 className="text-xl font-black text-slate-800">Excel Allocation Ranges</h3>
          <p className="text-slate-400 text-xs font-bold uppercase tracking-widest mt-1">Copy and paste into E5 or Allocation columns</p>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          {groups.length > 0 && (
            nextGroup ? (
              <button
                onClick={copyNext}
                title={`复制 ${nextGroup.base}，然后切到公司网页 Ctrl+V；再回来点这里复制下一条`}
                className="px-8 py-4 rounded-2xl text-sm font-black transition-all shadow-lg flex items-center justify-center gap-2 bg-orange-600 text-white shadow-orange-100 hover:bg-orange-700"
              >
                <i className="fa-solid fa-forward"></i>
                复制下一条 · {nextGroup.base}（{doneCount}/{groups.length}）
              </button>
            ) : (
              <>
                <span className="px-6 py-4 rounded-2xl text-sm font-black bg-emerald-500 text-white shadow-lg shadow-emerald-100 flex items-center gap-2">
                  <i className="fa-solid fa-check"></i>全部复制完成 {groups.length}/{groups.length}
                </span>
                <button
                  onClick={() => setDoneBases(new Set())}
                  className="px-4 py-4 rounded-2xl text-xs font-black text-slate-400 hover:text-slate-600 border border-slate-200 hover:border-slate-400 transition-all"
                >
                  重新开始
                </button>
              </>
            )
          )}
          <button
            onClick={copyAll}
            disabled={routes.length === 0}
            className={`px-6 py-4 rounded-2xl text-sm font-black transition-all shadow-lg flex items-center justify-center gap-2 shrink-0 ${routes.length === 0 ? 'bg-slate-200 text-slate-400 cursor-not-allowed shadow-none' : (copiedAll ? 'bg-emerald-500 text-white shadow-emerald-100' : 'bg-slate-900 text-white shadow-slate-200 hover:bg-slate-800')}`}
          >
            {copiedAll ? <><i className="fa-solid fa-check"></i> All Copied!</> : <><i className="fa-solid fa-copy"></i> Copy All</>}
          </button>
        </div>
      </div>
      <div className="space-y-4">
        {groups.map((g, i) => {
          const isDone = doneBases.has(g.base);
          const isNext = nextGroup?.base === g.base;
          return (
            <div key={i} className={`flex items-center gap-4 transition-all ${isDone ? 'opacity-50' : ''}`}>
              <div className={`flex-grow px-6 py-4 rounded-2xl font-mono text-[11px] break-all leading-relaxed border-2 transition-all ${
                isDone ? 'bg-emerald-50/50 border-emerald-200 text-slate-400'
                : isNext ? 'bg-orange-50/60 border-orange-400 text-slate-700 shadow-md'
                : 'bg-slate-50 border-slate-100 text-slate-600'
              }`}>
                  {g.allocString}
              </div>
              <button
                onClick={() => copyGroup(g.base, g.allocString)}
                className={`w-52 py-4 rounded-2xl text-sm font-black transition-all shadow-lg flex items-center justify-center gap-2 shrink-0 ${
                  copiedGroup === g.base ? 'bg-emerald-500 text-white shadow-emerald-100 font-extrabold'
                  : isDone ? 'bg-emerald-100 text-emerald-700 border border-emerald-200 shadow-none hover:bg-emerald-200'
                  : 'bg-slate-900 text-white shadow-slate-200 hover:bg-slate-800'
                }`}
              >
                {copiedGroup === g.base ? (
                  <>
                    <i className="fa-solid fa-check"></i>
                    {g.base} Copied!
                  </>
                ) : (
                  <>
                    <i className={`fa-solid ${isDone ? 'fa-check' : 'fa-copy'} text-xs`}></i>
                    {g.base}
                  </>
                )}
              </button>
            </div>
          );
        })}
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
    onOpenSplit: (route: RouteData) => void,
    onOpenReassign: (route: RouteData) => void,
    onOpenFeedback: () => void,
}> = ({ routes, registry, offDriverIds, onUpdate, onAddRow, onDeleteRow, onOpenSplit, onOpenReassign, onOpenFeedback }) => {
    const [teamFilter, setTeamFilter] = useState<string>('All');
    const sortedRoutes = useMemo(() => [...routes].sort((a, b) => compareRouteNums(a.routeNum, b.routeNum)), [routes]);
    const holdSuggestions = useMemo(() => getHoldSuggestions(routes), [routes]);
    const suggestedHoldIds = useMemo(() => new Set(holdSuggestions.flatMap(s => s.routeIds)), [holdSuggestions]);

    const teamCounts = useMemo(() => {
        const counts: Record<string, number> = {};
        for (const r of routes) {
            const g = r.driverGroup && r.driverGroup !== '' ? r.driverGroup : 'Unassigned';
            counts[g] = (counts[g] || 0) + 1;
        }
        return counts;
    }, [routes]);
    const filterChips = ['Company', ...AGENCIES, 'Unassigned'].filter(g => (teamCounts[g] || 0) > 0);
    const visibleRoutes = teamFilter === 'All'
        ? sortedRoutes
        : sortedRoutes.filter(r => ((r.driverGroup && r.driverGroup !== '') ? r.driverGroup : 'Unassigned') === teamFilter);

    return (
        <div className="bg-white rounded-3xl shadow-xl border border-slate-100 overflow-hidden min-h-[400px]">
            <div className="bg-slate-50 border-b border-slate-100 px-8 py-4 flex justify-between items-center">
                <div>
                    <h3 className="text-lg font-black text-slate-800">Route Spreadsheet</h3>
                    <p className="text-slate-400 text-[10px] font-bold uppercase tracking-widest">Interactive Schedule Editor</p>
                </div>
                <div className="flex items-center gap-3">
                  <button onClick={onOpenFeedback} className="bg-emerald-600 text-white px-6 py-2 rounded-xl text-xs font-black hover:bg-emerald-700 transition-all flex items-center gap-2 shadow-lg shadow-emerald-100">
                      <i className="fa-solid fa-paste"></i> Paste Broker Feedback
                  </button>
                  <button onClick={onAddRow} className="bg-slate-900 text-white px-6 py-2 rounded-xl text-xs font-black hover:bg-slate-800 transition-all flex items-center gap-2 shadow-lg shadow-slate-100">
                      <i className="fa-solid fa-plus"></i> Add New Route
                  </button>
                </div>
            </div>
            {holdSuggestions.length > 0 && (
              <div className="px-8 py-3 border-b border-amber-100 bg-amber-50/70 flex flex-wrap items-center gap-2">
                <span className="text-[11px] font-black text-amber-700 uppercase tracking-wider">
                  <i className="fa-solid fa-hand mr-1"></i>Hold 建议
                </span>
                {holdSuggestions.map(s => (
                  <button
                    key={s.label}
                    onClick={() => s.routeIds.forEach(id => onUpdate(id, { isHold: true }))}
                    className="px-3 py-1.5 rounded-xl text-[11px] font-black bg-white text-amber-800 border border-amber-300 hover:bg-amber-100 transition-all shadow-sm"
                    title={`点击将 ${s.routeNums.join(' + ')} 标记为 Hold`}
                  >
                    {s.label} · {s.volume} 件 ≤ {s.threshold} — 一键 Hold
                  </button>
                ))}
                <span className="text-[10px] text-amber-600/80 font-bold">货量低于门槛的偏远线，点击即标 HOLD（可在行内取消）</span>
              </div>
            )}
            {routes.length > 0 && (
              <div className="px-8 py-3 border-b border-slate-100 flex flex-wrap items-center gap-2">
                <button
                  onClick={() => setTeamFilter('All')}
                  className={`px-3.5 py-1.5 rounded-xl text-[11px] font-black border transition-all ${teamFilter === 'All' ? 'bg-slate-900 text-white border-slate-900' : 'bg-white text-slate-500 border-slate-200 hover:border-slate-400'}`}
                >
                  All · {routes.length}
                </button>
                {filterChips.map(g => (
                  <button
                    key={g}
                    onClick={() => setTeamFilter(teamFilter === g ? 'All' : g)}
                    className={`px-3.5 py-1.5 rounded-xl text-[11px] font-black border transition-all ${teamFilter === g ? getAgencyColor(g) + ' ring-2 ring-offset-1 ring-slate-400' : 'bg-white text-slate-500 border-slate-200 hover:border-slate-400'}`}
                  >
                    {g} · {teamCounts[g]}
                  </button>
                ))}
                {teamFilter !== 'All' && (
                  <span className="text-[10px] text-slate-400 font-bold ml-2">只显示 {teamFilter} 的 {visibleRoutes.length} 条线 — 中介反馈改号/剪切都在这里完成</span>
                )}
              </div>
            )}
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
                        {visibleRoutes.map(route => {
                            const baseRoutePart = route.routeNum.split('-')[0];
                            const showHoldBtn = ['33045', '33050', '33055'].includes(baseRoutePart);
                            const isOff = route.isDriverOff || (route.driverId ? offDriverIds.has(route.driverId) : false);
                            const rowBg = route.isHold
                              ? 'bg-rose-50/40'
                              : isOff
                              ? 'bg-red-50/80'
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
                                            {!route.isHold && suggestedHoldIds.has(route.id) && (
                                              <span className="bg-amber-100 text-amber-700 text-[8px] font-black px-1.5 py-0.5 rounded border border-amber-200 uppercase tracking-wider" title="货量低于 Hold 门槛，见表格上方建议条">可 Hold</span>
                                            )}
                                            {isOff && (
                                              <>
                                                <span className="bg-red-500 text-white text-[9px] font-black px-2 py-1 rounded-md border border-red-600 uppercase tracking-wider animate-pulse shadow-sm">Driver Off</span>
                                                <button
                                                  onClick={e => { e.stopPropagation(); onOpenReassign(route); }}
                                                  className="bg-amber-400 text-white text-[10px] font-black px-3 py-1.5 rounded-lg hover:bg-amber-500 shadow-md transition-all uppercase tracking-wider"
                                                  title="Quick Reassign"
                                                >
                                                  <i className="fa-solid fa-arrow-right-arrow-left mr-1"></i>Reassign
                                                </button>
                                              </>
                                            )}
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

const WhatsAppReports: React.FC<{ groups: AgencyGroup[], batchInfo: BatchInfo, teamContacts: Record<string, string> }> = ({ groups, batchInfo, teamContacts }) => {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
      {groups.length === 0 ? (
        <div className="col-span-full py-40 bg-white rounded-3xl border border-slate-100 border-dashed text-center">
          <p className="text-slate-400 font-bold uppercase tracking-widest text-[10px]">No assigned routes to generate reports</p>
        </div>
      ) : (
        groups.map(group => (
          <AgencyReport
            key={group.name}
            group={group}
            batchInfo={batchInfo}
            groupLink={teamContacts[group.name.replace('Team ', '')] || ''}
          />
        ))
      )}
    </div>
  );
};

const AgencyReport: React.FC<{ group: AgencyGroup, batchInfo: BatchInfo, groupLink?: string }> = ({ group, batchInfo, groupLink }) => {
  const [copied, setCopied] = useState(false);
  const [sent, setSent] = useState(false);
  
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

  const copyAndOpenGroup = async () => {
    try { await navigator.clipboard.writeText(generateWhatsAppMessage()); } catch { /* still open the group */ }
    setSent(true);
    setTimeout(() => setSent(false), 4000);
    window.open(groupLink, '_blank', 'noopener');
  };

  return (
    <div className="bg-white rounded-3xl shadow-sm border border-slate-100 overflow-hidden flex flex-col h-full">
      <div className={`px-8 py-4 flex justify-between items-center gap-2 ${getAgencyColor(group.name.replace('Team ', '').replace(' Drivers', ''))}`}>
        <h3 className="font-black text-sm uppercase tracking-wider">{group.name}</h3>
        <div className="flex items-center gap-2">
          {groupLink && (
            <button
              onClick={copyAndOpenGroup}
              title="文案已复制，群聊打开后 Ctrl+V 发送"
              className={`px-4 py-2 rounded-lg text-xs font-black transition-all shadow-md ${sent ? 'bg-emerald-800 text-white' : 'bg-emerald-600 hover:bg-emerald-700 text-white'}`}
            >
              {sent ? <><i className="fa-solid fa-check mr-1"></i>已复制 · 粘贴发送</> : <><i className="fa-brands fa-whatsapp mr-1"></i>打开群聊</>}
            </button>
          )}
          <button onClick={copyToClipboard} className={`px-4 py-2 rounded-lg text-xs font-black transition-all shadow-md ${copied ? 'bg-emerald-600 text-white' : 'bg-slate-900 hover:bg-slate-800 text-white'}`}>
              {copied ? <><i className="fa-solid fa-check mr-1"></i>Copied!</> : <><i className="fa-regular fa-copy mr-1"></i>Copy</>}
          </button>
        </div>
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
  const imageInputRef = useRef<HTMLInputElement>(null);
  
  const [batchInfo, setBatchInfo] = useState<BatchInfo>(() => {
    const saved = localStorage.getItem('yow_dispatch_batch');
    return saved ? JSON.parse(saved) : { date: getOttawaTomorrowDateString(), batchId: 'YOW-' + Date.now(), totalVolume: 0 };
  });
  const [routes, setRoutes] = useState<RouteData[]>(() => {
    const saved = localStorage.getItem('yow_dispatch_routes');
    return saved ? JSON.parse(saved) : [];
  });
  const [view, setView] = useState<'main' | 'reports' | 'allocations' | 'print' | 'bookmarks' | 'drivers'>('main');
  const [deletedDriverIds, setDeletedDriverIds] = useState<string[]>(() => {
    try { return JSON.parse(localStorage.getItem('yow_dispatch_deleted') || '[]'); } catch { return []; }
  });
  // True while this browser has roster edits not yet pushed to Supabase
  const [rosterDirty, setRosterDirty] = useState(() => localStorage.getItem('yow_roster_dirty') === '1');
  // Broker team → WhatsApp group invite link
  const [teamContacts, setTeamContacts] = useState<Record<string, string>>(() => {
    try { return withDefaultContacts(JSON.parse(localStorage.getItem('yow_team_contacts') || '{}')); }
    catch { return { ...DEFAULT_TEAM_CONTACTS }; }
  });
  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const [registry, setRegistry] = useState<DriverRegistry>(() => {
    const saved = localStorage.getItem('yow_dispatch_registry');
    let tombstones: string[] = [];
    try { tombstones = JSON.parse(localStorage.getItem('yow_dispatch_deleted') || '[]'); } catch { /* none */ }
    if (!saved) {
      const initial = { ...INITIAL_DRIVER_REGISTRY };
      for (const id of [...REMOVED_DRIVER_IDS, ...tombstones]) delete initial[id];
      return initial;
    }
    try {
      const parsed = JSON.parse(saved);
      // Merge rule: code defaults win for name/group so roster corrections
      // reach existing browsers — EXCEPT entries edited in the Drivers screen,
      // which are user-owned. maxCapacity always persists from saved.
      const merged: DriverRegistry = { ...parsed };
      for (const [id, def] of Object.entries(INITIAL_DRIVER_REGISTRY)) {
        if (parsed[id]?.edited) continue;
        merged[id] = { ...(parsed[id] || {}), ...def, maxCapacity: parsed[id]?.maxCapacity ?? (def as any).maxCapacity };
      }
      // Purge saved entries whose group no longer exists (e.g. removed broker teams)
      const validGroups = new Set(['Company', 'Unassigned', ...AGENCIES]);
      for (const id of Object.keys(merged)) {
        if (!validGroups.has(merged[id].group)) delete merged[id];
      }
      for (const id of [...REMOVED_DRIVER_IDS, ...tombstones]) delete merged[id];
      return merged;
    } catch (e) {
      return INITIAL_DRIVER_REGISTRY;
    }
  });
  const [splittingRoute, setSplittingRoute] = useState<RouteData | null>(null);

  const [ebinderData, setEbinderData] = useState<EbinderData | null>(() => {
    const saved = localStorage.getItem('yow_dispatch_ebinder');
    try {
      // Red cells now carry fixed weekly days off, which stay valid across
      // weeks — keep the data; one-time text offs simply stop matching.
      return saved ? JSON.parse(saved) : null;
    } catch { return null; }
  });
  const [ebinderManualOverrides, setEbinderManualOverrides] = useState<Record<string, boolean>>(() => {
    try {
      return JSON.parse(localStorage.getItem('yow_dispatch_overrides') || '{}');
    } catch { return {}; }
  });
  const [ebinderLoading, setEbinderLoading] = useState(false);
  const [ebinderStatus, setEbinderStatus] = useState<{ type: 'loading' | 'success' | 'error'; message: string } | null>(null);
  const [showAvailabilityPanel, setShowAvailabilityPanel] = useState(true);
  const ebinderInputRef = useRef<HTMLInputElement>(null);
  const [reassigningRoute, setReassigningRoute] = useState<RouteData | null>(null);
  const [showBatchSplitModal, setShowBatchSplitModal] = useState(false);
  const [showFeedbackModal, setShowFeedbackModal] = useState(false);
  const [showPasteTableModal, setShowPasteTableModal] = useState(false);
  const [pasteTableError, setPasteTableError] = useState('');
  const [showApiKeyModal, setShowApiKeyModal] = useState(false);
  const [hasApiKey, setHasApiKey] = useState(() => !!getStoredApiKey());
  const [cloudStatus, setCloudStatus] = useState<{ type: 'loading' | 'success' | 'error'; message: string } | null>(null);
  const importFileRef = useRef<HTMLInputElement>(null);

  // 排班目标日：始终为明天（今天排的是明天的班）
  const dispatchDate = useMemo(() => getOttawaTomorrowDateString(), []);

  const offDriverIdsFinal = useMemo<Set<string>>(() => {
    const result = ebinderData ? getOffDriverIds(ebinderData, dispatchDate) : new Set<string>();
    if (ebinderData) {
      // The e-binder sheet is the roster of record: company drivers missing
      // from it (quit, long leave) must not be scheduled.
      const rosterIds = new Set(ebinderData.drivers.map(d => d.driverId));
      for (const [id, d] of Object.entries(registry)) {
        if (d.group === 'Company' && !rosterIds.has(id)) result.add(id);
      }
    }
    for (const [id, isOff] of Object.entries(ebinderManualOverrides)) {
      if (isOff) result.add(id); else result.delete(id);
    }
    return result;
  }, [ebinderData, dispatchDate, ebinderManualOverrides, registry]);

  useEffect(() => {
    localStorage.setItem('yow_dispatch_routes', JSON.stringify(routes));
    if (routes.length > 0 && !hasStarted) setHasStarted(true);
  }, [routes]);

  useEffect(() => localStorage.setItem('yow_dispatch_batch', JSON.stringify(batchInfo)), [batchInfo]);
  useEffect(() => localStorage.setItem('yow_dispatch_registry', JSON.stringify(registry)), [registry]);
  useEffect(() => { if (ebinderData) localStorage.setItem('yow_dispatch_ebinder', JSON.stringify(ebinderData)); }, [ebinderData]);
  useEffect(() => { localStorage.setItem('yow_dispatch_overrides', JSON.stringify(ebinderManualOverrides)); }, [ebinderManualOverrides]);
  useEffect(() => { localStorage.setItem('yow_dispatch_deleted', JSON.stringify(deletedDriverIds)); }, [deletedDriverIds]);
  useEffect(() => { localStorage.setItem('yow_team_contacts', JSON.stringify(teamContacts)); }, [teamContacts]);
  useEffect(() => {
    if (ebinderStatus?.type !== 'success') return;
    const t = setTimeout(() => setEbinderStatus(null), 5000);
    return () => clearTimeout(t);
  }, [ebinderStatus]);
  useEffect(() => {
    if (cloudStatus?.type !== 'success') return;
    const t = setTimeout(() => setCloudStatus(null), 5000);
    return () => clearTimeout(t);
  }, [cloudStatus]);

  const buildSnapshot = (): DispatchSnapshot => ({
    routes,
    batchInfo,
    registry,
    ebinderData,
    ebinderManualOverrides,
    deletedDriverIds,
    savedAt: new Date().toISOString(),
  });

  const markRosterDirty = (dirty: boolean) => {
    setRosterDirty(dirty);
    try { localStorage.setItem('yow_roster_dirty', dirty ? '1' : '0'); } catch { /* non-fatal */ }
  };

  const handleUpsertDriver = (id: string, entry: { name: string; group: string; maxCapacity?: number }) => {
    setRegistry(prev => ({ ...prev, [id]: { ...entry, edited: true } }));
    setDeletedDriverIds(prev => prev.filter(x => x !== id));
    markRosterDirty(true);
  };

  const handleDeleteDriver = (id: string) => {
    setRegistry(prev => { const next = { ...prev }; delete next[id]; return next; });
    setDeletedDriverIds(prev => [...new Set([...prev, id])]);
    markRosterDirty(true);
  };

  const applyCloudRoster = (reg: DriverRegistry, deleted: string[]) => {
    const validGroups = new Set(['Company', 'Unassigned', ...AGENCIES]);
    const cleaned: DriverRegistry = {};
    for (const [id, d] of Object.entries(reg)) {
      if (validGroups.has(d.group) && !REMOVED_DRIVER_IDS.includes(id) && !deleted.includes(id)) cleaned[id] = d;
    }
    // The cloud roster only holds approved drivers — keep local temp ones
    setRegistry(prev => ({ ...cleaned, ...partitionRegistry(prev).temp }));
    setDeletedDriverIds(deleted);
  };

  // On startup, pull the shared roster (unless this browser has un-pushed
  // edits) and always merge in the shared pending (temp) drivers row.
  useEffect(() => {
    (async () => {
      if (!rosterDirty) {
        try {
          const result = await loadRoster();
          if (result) {
            applyCloudRoster(result.data.registry, result.data.deletedDriverIds || []);
            if (result.data.teamContacts) setTeamContacts(withDefaultContacts(result.data.teamContacts));
          }
        } catch { /* offline or unconfigured — keep local roster */ }
      }
      try {
        const pending = await loadPending();
        if (pending) {
          setRegistry(prev => {
            const merged = { ...prev };
            for (const [id, d] of Object.entries(pending)) {
              if (!merged[id]) merged[id] = { ...d, temp: true };
            }
            return merged;
          });
        }
      } catch { /* ignore */ }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Auto-sync the temp (pending) drivers to their own cloud row — silent,
  // debounced, no password: this is the staging area for approval.
  const lastPendingSyncRef = useRef<string | null>(null);
  useEffect(() => {
    const temp = partitionRegistry(registry).temp;
    const json = JSON.stringify(temp);
    if (lastPendingSyncRef.current === null) {
      // Skip the initial render — only push actual changes
      lastPendingSyncRef.current = json;
      return;
    }
    if (json === lastPendingSyncRef.current) return;
    lastPendingSyncRef.current = json;
    const t = setTimeout(() => { savePending(temp).catch(() => { /* offline — next change retries */ }); }, 1000);
    return () => clearTimeout(t);
  }, [registry]);

  const handleApproveTemp = (id: string) => {
    setRegistry(prev => {
      const entry = prev[id];
      if (!entry?.temp) return prev;
      return { ...prev, [id]: { ...entry, temp: undefined, edited: true } };
    });
    markRosterDirty(true);
  };

  const handleApproveAllTemp = () => {
    setRegistry(prev => {
      const next = { ...prev };
      let changed = false;
      for (const [id, d] of Object.entries(next)) {
        if (d.temp) { next[id] = { ...d, temp: undefined, edited: true }; changed = true; }
      }
      return changed ? next : prev;
    });
    markRosterDirty(true);
  };

  const handleDeleteTemp = (id: string) => {
    setRegistry(prev => { const next = { ...prev }; delete next[id]; return next; });
  };

  const handleSetTeamContact = (team: string, link: string) => {
    setTeamContacts(prev => ({ ...prev, [team]: link.trim() }));
    markRosterDirty(true);
  };

  const handleRestoreArchive = async (entry: ArchiveEntry) => {
    if (!window.confirm(`用 ${entry.dateLabel} 的存档覆盖当前表格？\n（只恢复到本机，不影响云端最新数据；确认后想固化再点 ☁↑）`)) return;
    setCloudStatus({ type: 'loading', message: `正在恢复 ${entry.dateLabel} 的存档…` });
    try {
      const snap = await loadArchive(entry.id);
      if (!snap) { setCloudStatus({ type: 'error', message: '该存档不存在或已损坏' }); return; }
      applySnapshot(snap);
      setShowHistoryModal(false);
      setCloudStatus({ type: 'success', message: `已恢复 ${entry.dateLabel} 的排班表` });
    } catch (err: any) {
      setCloudStatus({ type: 'error', message: err.message || '恢复失败，请重试' });
    }
  };

  const handleRosterPush = async () => {
    const pw = window.prompt('输入修改密码后上传名册到 Supabase：');
    if (pw === null) return;
    if (pw !== '1011') {
      setCloudStatus({ type: 'error', message: '密码不对，名册未上传。' });
      return;
    }
    setCloudStatus({ type: 'loading', message: '正在上传名册到 Supabase…' });
    try {
      const { permanent } = partitionRegistry(registry);
      await saveRoster({ registry: permanent, deletedDriverIds, teamContacts, savedAt: new Date().toISOString() });
      markRosterDirty(false);
      setCloudStatus({ type: 'success', message: `名册已更新到 Supabase（${Object.keys(permanent).length} 名司机）。其他电脑打开网页会自动拉取。` });
    } catch (err: any) {
      setCloudStatus({ type: 'error', message: err.message || '名册上传失败，请重试' });
    }
  };

  const handleApplyFeedback = async (ops: FeedbackOp[], addUnknownDrivers: boolean) => {
    const { applyFeedbackOps, collectUnknownDrivers } = await import('./services/feedbackParser');
    let effectiveRegistry = registry;
    let addedNote = '';
    if (addUnknownDrivers) {
      const unknowns = collectUnknownDrivers(ops, routes, registry);
      if (unknowns.length > 0) {
        const additions: DriverRegistry = {};
        for (const u of unknowns) {
          additions[u.id] = { name: `${u.group} Team`, group: u.group, temp: true };
        }
        effectiveRegistry = { ...registry, ...additions };
        setRegistry(effectiveRegistry);
        setDeletedDriverIds(prev => prev.filter(id => !additions[id]));
        addedNote = ` · ${unknowns.length} 个新司机号已登记为临时司机（Drivers 页可批准转正）`;
      }
    }
    const { routes: next, notes } = applyFeedbackOps(routes, ops, effectiveRegistry);
    setRoutes(next);
    setShowFeedbackModal(false);
    setCloudStatus({
      type: 'success',
      message: `已套用 ${ops.length} 条中介反馈${addedNote}${notes.length ? ' · ' + notes.join('；') : ''}`,
    });
  };

  const applySnapshot = (snap: DispatchSnapshot) => {
    if (!snap || !Array.isArray(snap.routes)) throw new Error('数据格式不对，缺少 routes');
    setRoutes(snap.routes);
    if (snap.batchInfo) setBatchInfo(snap.batchInfo);
    if (snap.registry) setRegistry(snap.registry);
    setEbinderData(snap.ebinderData ?? null);
    setEbinderManualOverrides(snap.ebinderManualOverrides || {});
    if (Array.isArray(snap.deletedDriverIds)) setDeletedDriverIds(snap.deletedDriverIds);
    if (snap.routes.length > 0) { setHasStarted(true); setView('main'); }
  };

  const formatSavedTime = (iso: string) => {
    try {
      return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Toronto', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(iso));
    } catch { return iso; }
  };

  const markCloudSeen = (iso: string) => {
    try { localStorage.setItem('yow_cloud_seen', iso); } catch { /* non-fatal */ }
  };

  const handleCloudSave = async () => {
    setCloudStatus({ type: 'loading', message: '正在保存到云端…' });
    try {
      // Don't blindly clobber a colleague's newer snapshot
      const cloudUpdatedAt = await fetchCloudUpdatedAt().catch(() => null);
      const seen = localStorage.getItem('yow_cloud_seen') || '';
      if (cloudUpdatedAt && cloudUpdatedAt > seen) {
        const ok = window.confirm(
          `云端有 ${formatSavedTime(cloudUpdatedAt)} 保存的更新数据（可能是同事保存的）。\n确定要用你当前的表格覆盖它吗？\n建议先点 ☁↓ 加载查看。`
        );
        if (!ok) { setCloudStatus(null); return; }
      }
      const savedAt = new Date().toISOString();
      const snap = buildSnapshot();
      await saveSnapshot(snap);
      markCloudSeen(cloudUpdatedAt && cloudUpdatedAt > savedAt ? cloudUpdatedAt : savedAt);
      let archiveNote = '';
      try {
        await saveArchive(snap, batchInfo.date);
      } catch {
        archiveNote = '（当日历史存档失败，下次保存会重试）';
      }
      setCloudStatus({ type: 'success', message: `已保存到云端 · ${formatSavedTime(savedAt)}${archiveNote}` });
    } catch (err: any) {
      setCloudStatus({ type: 'error', message: err.message || '保存失败，请重试' });
    }
  };

  const handleCloudLoad = async () => {
    setCloudStatus({ type: 'loading', message: '正在从云端加载…' });
    try {
      const result = await loadSnapshot();
      if (!result) {
        setCloudStatus({ type: 'error', message: '云端还没有保存过数据。先点云上传按钮保存一次。' });
        return;
      }
      if (!window.confirm(`用云端数据（${formatSavedTime(result.updatedAt)} 保存）覆盖当前表格？`)) {
        setCloudStatus(null);
        return;
      }
      applySnapshot(result.data);
      markCloudSeen(result.updatedAt);
      setCloudStatus({ type: 'success', message: `已加载云端数据（${formatSavedTime(result.updatedAt)} 保存）` });
    } catch (err: any) {
      setCloudStatus({ type: 'error', message: err.message || '加载失败，请重试' });
    }
  };

  const handleExportFile = () => {
    const snap = buildSnapshot();
    const blob = new Blob([JSON.stringify(snap, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    const d = new Date();
    a.download = `yow-dispatch-${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const handleImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; if (!file) return;
    try {
      const text = await file.text();
      const snap = JSON.parse(text);
      if (!Array.isArray(snap?.routes)) throw new Error('这不是本应用导出的数据文件（缺少 routes）');
      if (!window.confirm(`用文件数据（${snap.routes.length} 条路线）覆盖当前表格？`)) return;
      applySnapshot(snap);
      setCloudStatus({ type: 'success', message: '已从文件导入数据' });
    } catch (err: any) {
      setCloudStatus({ type: 'error', message: err.message || '文件读取失败' });
    } finally {
      e.target.value = '';
    }
  };

  const handleEbinderUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; if (!file) return;
    setEbinderLoading(true);
    setEbinderStatus({ type: 'loading', message: '正在解析文件（模型繁忙时会自动重试，最多约 30 秒）…' });
    try {
      const { parseEbinderImage } = await import('./services/ebinderParser');
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
      const offCount = getOffDriverIds(data, dispatchDate).size;
      setEbinderStatus({
        type: 'success',
        message: `成功导入 ${data.drivers.length} 条记录 · ${data.weekDates.length} 个日期列 · 明日（${dispatchDate.split('/').slice(0, 2).map(Number).join('-')}）请假 ${offCount} 人`,
      });
    } catch (err: any) {
      setEbinderStatus({ type: 'error', message: err.message || '未知错误，请重试' });
    } finally {
      setEbinderLoading(false);
      e.target.value = '';
    }
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
    } catch (err: any) { setCloudStatus({ type: 'error', message: `Excel 导入失败：${err.message || '未知错误'}` }); }
    finally { setLoading(false); e.target.value = ''; }
  };

  const handlePasteTableImport = async (text: string) => {
    setPasteTableError('');
    try {
      const { parsePastedDispatchTable } = await import('./services/textTableParser');
      const data = parsePastedDispatchTable(text, registry);
      setRoutes(data.routes);
      setBatchInfo(data.batchInfo);
      setEbinderManualOverrides({});
      setHasStarted(true);
      setView('main');
      setShowPasteTableModal(false);
      const zones = new Set(data.routes.map(r => r.routeNum.split('-')[0])).size;
      setCloudStatus({ type: 'success', message: `已导入取货表：${zones} 个大区 · ${data.routes.length} 条子路线 · 共 ${data.batchInfo.totalVolume} 件 · 手动请假标记已重置` });
    } catch (err: any) {
      setPasteTableError(err.message || '解析失败，请检查粘贴内容');
    }
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; if (!file) return;
    setLoading(true);
    try {
      const { parseImageFile } = await import('./services/geminiParser');
      const data = await parseImageFile(file, registry);
      setRoutes(data.routes);
      setBatchInfo(data.batchInfo);
      // A new day's screenshot starts a fresh availability slate: one-time
      // manual off marks reset; fixed weekly days off persist via ebinderData.
      setEbinderManualOverrides({});
      setHasStarted(true);
      setView('main');
      setCloudStatus({ type: 'success', message: `已导入截图（${data.routes.length} 条路线）· 手动请假标记已重置，固定休息日保留` });
    } catch (err: any) { setCloudStatus({ type: 'error', message: `截图导入失败：${err.message || '未知错误'}` }); }
    finally { setLoading(false); e.target.value = ''; }
  };

  const evalCapacity = useCallback((driverId: string, volume: number): Pick<RouteData, 'capacityStatus' | 'capacityExcess'> => {
    const driverData = registry[driverId];
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
  }, [registry]);

  const handleAutoAssign = () => {
    setBatchInfo(prev => ({ ...prev, date: dispatchDate }));

    const activeOffIds = offDriverIdsFinal;

    setRoutes(prev => prev.map(route => {
        const placeholderKey = route.driverId || '';
        const realId = PLACEHOLDER_MAPPING[placeholderKey];
        const parts = placeholderKey.split('-');

        const newLocation = ZONE_NAMES[route.routeNum] ||
                            ZONE_NAMES[placeholderKey] ||
                            (parts.length >= 3 ? ZONE_NAMES[`${parts[0]}-${parts[parts.length - 1]}`] : '') ||
                            route.routeLocation;

        const baseRoute = route.routeNum?.split('-')[0] || '';
        const newTime = getDefaultTimeSlot(baseRoute, dispatchDate);

        if (realId) {
            const driverData = registry[realId];
            const isOff = activeOffIds.has(realId);
            const capResult = isOff ? { capacityStatus: undefined as RouteData['capacityStatus'], capacityExcess: 0 } : evalCapacity(realId, route.orderVolume);
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

  const handleSplit = (firstVolume: number, secondDriverId: string | null) => {
    if (!splittingRoute) return;
    const secondVolume = splittingRoute.orderVolume - firstVolume;
    const isBrokerRoute = AGENCIES.includes(splittingRoute.driverGroup || '');
    // A hand-typed ID the roster doesn't know: offer to register it under the
    // same broker team so it shows up in pickers from now on.
    if (secondDriverId && !registry[secondDriverId] && isBrokerRoute) {
      const team = splittingRoute.driverGroup;
      if (window.confirm(`司机号 ${secondDriverId} 不在名册里。要登记为 ${team} 的临时司机吗？\n（拆分/改派列表里都能选到；在 Drivers 页可批准转正为永久司机）`)) {
        setRegistry(prev => ({ ...prev, [secondDriverId]: { name: `${team} Team`, group: team, temp: true } }));
        setDeletedDriverIds(prev => prev.filter(x => x !== secondDriverId));
      }
    }
    const d = secondDriverId ? registry[secondDriverId] : null;
    // A hand-typed ID unknown to the registry on a broker route stays in
    // that broker's team (brokers only assign their own drivers).
    const fallbackGroup = secondDriverId && isBrokerRoute ? splittingRoute.driverGroup : 'Unassigned';
    const secondName = d?.name || (secondDriverId ? `Driver ${secondDriverId}` : 'Unassigned');
    const secondPart: RouteData = {
      ...splittingRoute,
      id: `split-${splittingRoute.id}-${Date.now()}`,
      routeNum: splittingRoute.routeNum + '.1',
      orderVolume: secondVolume,
      driverId: secondDriverId || '',
      driverName: secondName,
      driverGroup: d?.group || fallbackGroup,
      driver: secondName,
      parentId: splittingRoute.id,
      capacityStatus: undefined,
      capacityExcess: 0,
      isDriverOff: false,
    };
    setRoutes(prev => {
      const idx = prev.findIndex(r => r.id === splittingRoute.id);
      if (idx === -1) return prev;
      const updated = [...prev];
      updated[idx] = { ...splittingRoute, orderVolume: firstVolume, isSplit: true, capacityStatus: 'ok', capacityExcess: 0 };
      updated.splice(idx + 1, 0, secondPart);
      return updated;
    });
    setSplittingRoute(null);
  };

  const handleQuickReassign = (routeId: string, driverId: string) => {
    const driverData = registry[driverId];
    setRoutes(prev => prev.map(r =>
      r.id !== routeId ? r : {
        ...r,
        driverId,
        driverName: driverData?.name || `Driver ${driverId}`,
        driverGroup: driverData?.group || 'Unassigned',
        driver: driverData?.name || `Driver ${driverId}`,
        isDriverOff: false,
        ...evalCapacity(driverId, r.orderVolume),
      }
    ));
    setReassigningRoute(null);
  };

  const handleBatchSplit = (picks: Record<string, string | null>) => {
    const splitRoutes = routes.filter(r => r.capacityStatus === 'split-recommended');
    setRoutes(prev => {
      let result = [...prev];
      for (const route of splitRoutes) {
        const idx = result.findIndex(r => r.id === route.id);
        if (idx === -1) continue;
        const firstVolume = route.orderVolume - (route.capacityExcess ?? 0);
        const secondVolume = route.capacityExcess ?? 0;
        const brokerId = picks[route.id] || null;
        const brokerData = brokerId ? registry[brokerId] : null;
        result[idx] = { ...route, orderVolume: firstVolume, isSplit: true, capacityStatus: 'ok', capacityExcess: 0 };
        const part2: RouteData = {
          id: `split-${route.id}-${Date.now()}-${idx}`,
          routeNum: `${route.routeNum}.1`,
          parentId: route.id,
          isSplit: true,
          driver: brokerData?.name || 'Unassigned',
          driverId: brokerId || '',
          driverName: brokerData?.name || 'Unassigned',
          driverGroup: brokerData?.group || 'Unassigned',
          routeLocation: route.routeLocation,
          timeSlot: route.timeSlot,
          orderVolume: secondVolume,
          scanId: route.scanId,
        };
        result.splice(idx + 1, 0, part2);
      }
      return result;
    });
    setShowBatchSplitModal(false);
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

      return prev.map(r => {
        if (r.id !== id) return r;
        const updated = { ...r, ...finalUpdates };
        if ('orderVolume' in finalUpdates && updated.driverId && !updated.isDriverOff) {
          return { ...updated, ...evalCapacity(updated.driverId, updated.orderVolume) };
        }
        return updated;
      });
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

  const availableCompanyDrivers = useMemo(() => {
    return Object.entries(registry)
      .filter(([id, d]) => d.group === 'Company' && !offDriverIdsFinal.has(id))
      .map(([id, d]) => ({ id, name: d.name }));
  }, [registry, offDriverIdsFinal]);

  const agencyFirstDriverIds = useMemo(() => {
    const map: Record<string, string> = {};
    for (const agency of AGENCIES) {
      const entry = Object.entries(registry).find(([, d]) => d.group === agency);
      if (entry) map[agency] = entry[0];
    }
    return map;
  }, [registry]);

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
                <div>
                  <h1 className="text-xl font-black text-slate-900 tracking-tight">Driver Dispatch Assistant</h1>
                  <p className="text-[9px] text-slate-400 font-mono">Build {(() => {
                    try {
                      return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Toronto', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(process.env.BUILD_TIME || 0));
                    } catch { return process.env.BUILD_TIME || 'dev'; }
                  })()}</p>
                </div>
            </div>
            <div className="flex items-center gap-3">
              <nav className="flex bg-slate-100 p-1 rounded-2xl">
                  {[
                    { id: 'main', label: 'Editor' },
                    { id: 'reports', label: 'Reports' },
                    { id: 'allocations', label: 'Allocations' },
                    { id: 'print', label: 'Print & Copy' },
                    { id: 'drivers', label: 'Drivers' },
                    { id: 'bookmarks', label: 'Links' }
                  ].map(v => (
                      <button key={v.id} onClick={() => setView(v.id as any)} className={`px-5 py-2 rounded-xl text-xs font-black transition-all ${view === v.id ? 'bg-white text-orange-600 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}>
                          {v.label}
                      </button>
                  ))}
              </nav>
              <button
                onClick={handleCloudSave}
                title="保存到云端（同事可在其他电脑加载）"
                className="w-10 h-10 rounded-xl flex items-center justify-center bg-blue-50 text-blue-500 hover:bg-blue-100 transition-all"
              >
                <i className="fa-solid fa-cloud-arrow-up text-sm"></i>
              </button>
              <button
                onClick={handleCloudLoad}
                title="从云端加载最新保存的数据"
                className="w-10 h-10 rounded-xl flex items-center justify-center bg-blue-50 text-blue-500 hover:bg-blue-100 transition-all"
              >
                <i className="fa-solid fa-cloud-arrow-down text-sm"></i>
              </button>
              <button
                onClick={() => setShowHistoryModal(true)}
                title="历史存档：翻看/恢复往日排班"
                className="w-10 h-10 rounded-xl flex items-center justify-center bg-slate-100 text-slate-500 hover:bg-slate-200 transition-all"
              >
                <i className="fa-solid fa-clock-rotate-left text-sm"></i>
              </button>
              <button
                onClick={() => setShowApiKeyModal(true)}
                title={hasApiKey ? 'API Key 已设置' : '设置 Gemini API Key'}
                className={`relative w-10 h-10 rounded-xl flex items-center justify-center transition-all ${hasApiKey ? 'bg-slate-100 text-slate-400 hover:text-slate-600' : 'bg-amber-100 text-amber-600 hover:bg-amber-200'}`}
              >
                <i className="fa-solid fa-key text-sm"></i>
                <span className={`absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-white ${hasApiKey ? 'bg-emerald-500' : 'bg-red-500'}`}></span>
              </button>
            </div>
        </header>
        {cloudStatus && (
          <div className={`fixed top-20 left-1/2 -translate-x-1/2 z-[90] px-5 py-2.5 rounded-2xl text-xs flex items-center gap-2 shadow-lg border ${
            cloudStatus.type === 'loading' ? 'bg-blue-50 text-blue-700 border-blue-100'
            : cloudStatus.type === 'success' ? 'bg-emerald-50 text-emerald-700 border-emerald-100'
            : 'bg-red-50 text-red-700 border-red-100'
          }`}>
            {cloudStatus.type === 'loading' && <i className="fa-solid fa-spinner animate-spin text-xs"></i>}
            {cloudStatus.type === 'success' && <i className="fa-solid fa-circle-check text-xs"></i>}
            {cloudStatus.type === 'error' && <i className="fa-solid fa-circle-xmark text-xs"></i>}
            <span className="font-medium">{cloudStatus.message}</span>
            {cloudStatus.type !== 'loading' && (
              <button onClick={() => setCloudStatus(null)} className="ml-2 opacity-50 hover:opacity-100 text-base leading-none">✕</button>
            )}
          </div>
        )}

        <main className="max-w-7xl mx-auto px-8 mt-10">
            {/* Action Bar (Uploads & Stats) */}
            {!loading && (view !== 'main' || !showLanding) && (
              <>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-6 mb-6">
                  <div onClick={() => { setPasteTableError(''); setShowPasteTableModal(true); }} className="bg-white p-6 rounded-3xl shadow-sm border border-purple-200 flex items-center gap-4 cursor-pointer hover:border-purple-500 hover:shadow-lg transition-all">
                      <div className="w-12 h-12 bg-purple-50 rounded-2xl flex items-center justify-center text-purple-500"><i className="fa-solid fa-paste"></i></div>
                      <div><p className="text-[10px] font-black uppercase text-slate-400">Recommended · Instant</p><h4 className="font-bold">Paste Dispatch Table</h4></div>
                  </div>
                  <div onClick={() => imageInputRef.current?.click()} className="bg-white p-6 rounded-3xl shadow-sm border border-slate-100 flex items-center gap-4 cursor-pointer hover:border-purple-500 hover:shadow-lg transition-all">
                      <input type="file" ref={imageInputRef} onChange={handleImageUpload} className="hidden" accept="image/*" />
                      <div className="w-12 h-12 bg-purple-50 rounded-2xl flex items-center justify-center text-purple-500"><i className="fa-solid fa-camera"></i></div>
                      <div><p className="text-[10px] font-black uppercase text-slate-400">Screenshot</p><h4 className="font-bold">Import Image</h4></div>
                  </div>
                  <div onClick={handleAutoAssign} className="bg-white p-6 rounded-3xl shadow-sm border border-slate-100 flex items-center gap-4 cursor-pointer hover:border-blue-500 hover:shadow-lg transition-all">
                      <div className="w-12 h-12 bg-blue-50 rounded-2xl flex items-center justify-center text-blue-500"><i className="fa-solid fa-wand-magic-sparkles"></i></div>
                      <div><p className="text-[10px] font-black uppercase text-slate-400">Smart Fix</p><h4 className="font-bold">Auto-Assign</h4></div>
                  </div>
                  {routes.some(r => r.capacityStatus === 'split-recommended') && (
                    <div onClick={() => setShowBatchSplitModal(true)} className="bg-white p-6 rounded-3xl shadow-sm border border-orange-200 flex items-center gap-4 cursor-pointer hover:border-orange-500 hover:shadow-lg transition-all">
                      <div className="w-12 h-12 bg-orange-50 rounded-2xl flex items-center justify-center text-orange-500"><i className="fa-solid fa-scissors animate-pulse"></i></div>
                      <div>
                        <p className="text-[10px] font-black uppercase text-slate-400">Capacity</p>
                        <h4 className="font-bold">Split {routes.filter(r => r.capacityStatus === 'split-recommended').length} Routes</h4>
                      </div>
                    </div>
                  )}
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
                      <div className="flex items-center gap-1.5">
                        {view === 'main' && (
                          <button
                            onClick={() => setShowAvailabilityPanel(p => !p)}
                            className={`text-[9px] font-black px-3 py-1.5 rounded-lg transition-all ${showAvailabilityPanel ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'}`}
                          >
                            {showAvailabilityPanel ? 'Hide Availability' : 'View Availability'}
                          </button>
                        )}
                        <button
                          onClick={handleExportFile}
                          title="导出数据为 JSON 文件"
                          className="text-[9px] font-black px-2.5 py-1.5 rounded-lg bg-slate-100 text-slate-500 hover:bg-slate-200 transition-all"
                        >
                          <i className="fa-solid fa-file-export"></i>
                        </button>
                        <button
                          onClick={() => importFileRef.current?.click()}
                          title="从 JSON 文件导入数据"
                          className="text-[9px] font-black px-2.5 py-1.5 rounded-lg bg-slate-100 text-slate-500 hover:bg-slate-200 transition-all"
                        >
                          <i className="fa-solid fa-file-import"></i>
                        </button>
                        <input type="file" ref={importFileRef} onChange={handleImportFile} className="hidden" accept=".json,application/json" />
                      </div>
                    </div>
                  </div>
              </div>
              {showAvailabilityPanel && view === 'main' && (
                <AvailabilityPanel
                  ebinderData={ebinderData}
                  offDriverIds={offDriverIdsFinal}
                  registry={registry}
                  batchDate={dispatchDate}
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
                    ) : view === 'drivers' ? (
                      <DriversView registry={registry} dirty={rosterDirty} onUpsert={handleUpsertDriver} onDelete={handleDeleteDriver} onPush={handleRosterPush} onApproveTemp={handleApproveTemp} onApproveAllTemp={handleApproveAllTemp} onDeleteTemp={handleDeleteTemp} teamContacts={teamContacts} onSetContact={handleSetTeamContact} />
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
                        {view === 'main' && <MainEditor routes={routes} registry={registry} offDriverIds={offDriverIdsFinal} onUpdate={onUpdateRoute} onDeleteRow={onDeleteRoute} onAddRow={addEmptyRow} onOpenSplit={setSplittingRoute} onOpenReassign={setReassigningRoute} onOpenFeedback={() => setShowFeedbackModal(true)} />}
                        {view === 'reports' && <WhatsAppReports groups={groupedData} batchInfo={batchInfo} teamContacts={teamContacts} />}
                        {view === 'allocations' && <AllocationSummaryView routes={routes} />}
                        {view === 'print' && <PrintView routes={routes} batchInfo={batchInfo} />}
                      </>
                    )}
                </div>
            )}
        </main>
        {splittingRoute && (
          <SplitModal
            route={splittingRoute}
            teamDrivers={Object.entries(registry)
              .filter(([, d]) => d.group === splittingRoute.driverGroup)
              .map(([id, d]) => ({ id, name: d.name }))}
            agencyFirstDriverIds={agencyFirstDriverIds}
            driverCap={splittingRoute.driverId ? registry[splittingRoute.driverId]?.maxCapacity : undefined}
            onClose={() => setSplittingRoute(null)}
            onConfirm={handleSplit}
          />
        )}
        {reassigningRoute && (
          <ReassignModal
            route={reassigningRoute}
            availableDrivers={availableCompanyDrivers}
            agencyFirstDriverIds={agencyFirstDriverIds}
            onClose={() => setReassigningRoute(null)}
            onReassign={(driverId) => handleQuickReassign(reassigningRoute.id, driverId)}
          />
        )}
        {showBatchSplitModal && (
          <BatchSplitModal
            overRoutes={routes.filter(r => r.capacityStatus === 'split-recommended')}
            agencyFirstDriverIds={agencyFirstDriverIds}
            onClose={() => setShowBatchSplitModal(false)}
            onConfirm={handleBatchSplit}
          />
        )}
        {showApiKeyModal && <ApiKeyModal onClose={() => setShowApiKeyModal(false)} onSaved={setHasApiKey} />}
        {showHistoryModal && <HistoryModal onClose={() => setShowHistoryModal(false)} onRestore={handleRestoreArchive} />}
        {showPasteTableModal && (
          <PasteTableModal
            onClose={() => setShowPasteTableModal(false)}
            onImport={handlePasteTableImport}
            error={pasteTableError}
            busy={false}
          />
        )}
        {showFeedbackModal && (
          <FeedbackModal
            routes={routes}
            registry={registry}
            onClose={() => setShowFeedbackModal(false)}
            onApply={handleApplyFeedback}
          />
        )}
    </div>
  );
};

export default App;
