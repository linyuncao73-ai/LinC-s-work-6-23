import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { autoAllocate, driverUsage, generateAllocationRanges, generateAgencyMessage, agenciesWithRoutes, recommendOverflowSplit } from './allocator.js';
import { parsePaste, makeRoute } from './parser.js';
import { loadDrivers, saveDrivers, loadDayData, saveDayData } from './store.js';
import { SCAN_ID_MAP, ZONE_NAMES, DEFAULT_DRIVERS, getGroupColor, SAMPLE_ROUTES, DEFAULT_ASSIGNMENTS } from './defaults.js';

// ─── Utilities ────────────────────────────────────────────────────────────────

function today() {
  return new Date().toLocaleDateString('en-CA'); // YYYY-MM-DD in local time
}

function uid() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
}

function sortRouteKey(a, b) {
  const parse = k => k.split(/[-.]/).map(n => parseFloat(n) || 0);
  const pa = parse(a), pb = parse(b);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    if ((pa[i] || 0) !== (pb[i] || 0)) return (pa[i] || 0) - (pb[i] || 0);
  }
  return 0;
}

const STATUS_LABELS = { pending: '待分配', assigned: '已分配', 'checked-in': '已取货', 'checked-out': '已派送' };
const STATUS_COLORS = {
  pending:      'bg-slate-100 text-slate-500',
  assigned:     'bg-blue-100 text-blue-700',
  'checked-in': 'bg-amber-100 text-amber-700',
  'checked-out':'bg-emerald-100 text-emerald-700',
};

// ─── Shared components ────────────────────────────────────────────────────────

function Toast({ message, type, onClose }) {
  useEffect(() => {
    const t = setTimeout(onClose, 2800);
    return () => clearTimeout(t);
  }, [onClose]);
  return (
    <div className={`fixed top-5 right-5 z-[200] px-5 py-3 rounded-2xl text-sm font-bold shadow-xl
      ${type === 'error' ? 'bg-red-500 text-white' : 'bg-emerald-500 text-white'}`}>
      {message}
    </div>
  );
}

function Badge({ label, color }) {
  return (
    <span className={`inline-flex px-2.5 py-0.5 rounded-full text-xs font-bold border ${color}`}>
      {label}
    </span>
  );
}

function DriverBadge({ driver }) {
  if (!driver) return <span className="text-slate-300 text-xs">—</span>;
  return (
    <span className={`inline-flex px-2.5 py-0.5 rounded-full text-xs font-bold border ${getGroupColor(driver.group)}`}>
      {driver.name}
    </span>
  );
}

// Capacity bar for a driver
function CapBar({ used, max, warn }) {
  const pct = max > 0 ? Math.min(100, Math.round((used / max) * 100)) : 0;
  const barColor = pct >= 100 ? 'bg-red-500' : pct >= 85 ? 'bg-amber-400' : 'bg-emerald-400';
  return (
    <div className="flex items-center gap-2 min-w-0">
      <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden" style={{ minWidth: 60 }}>
        <div className={`h-2 rounded-full cap-bar ${barColor}`} style={{ width: `${pct}%` }} />
      </div>
      <span className={`text-xs font-bold tabular-nums ${pct >= 100 ? 'text-red-600' : 'text-slate-500'}`}>
        {used}/{max}
      </span>
    </div>
  );
}

// Confirm dialog
function Confirm({ message, onConfirm, onCancel }) {
  return (
    <div className="fixed inset-0 z-[150] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" onClick={onCancel} />
      <div className="relative bg-white rounded-3xl shadow-2xl p-8 max-w-sm w-full">
        <p className="text-slate-700 text-sm mb-6">{message}</p>
        <div className="flex gap-3 justify-end">
          <button onClick={onCancel}  className="px-5 py-2 rounded-xl text-sm font-bold text-slate-400 hover:text-slate-600">取消</button>
          <button onClick={onConfirm} className="px-5 py-2 rounded-xl bg-red-500 text-white text-sm font-bold hover:bg-red-600">确认</button>
        </div>
      </div>
    </div>
  );
}

// ─── Split modal ──────────────────────────────────────────────────────────────

function SplitModal({ route, drivers, onClose, onConfirm }) {
  const [val, setVal] = useState(Math.floor(route.orderVolume / 2));
  const remainder = route.orderVolume - val;
  const assignedDriver = drivers.find(d => d.id === route.driverId);

  return (
    <div className="fixed inset-0 z-[150] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-3xl shadow-2xl p-8 max-w-md w-full">
        <h3 className="text-lg font-black text-slate-800 mb-1">拆分路线</h3>
        <p className="text-xs text-slate-400 font-bold uppercase tracking-wider mb-6">
          {route.routeKey} · 总件数 {route.orderVolume}
        </p>

        <div className="bg-slate-50 rounded-2xl p-4 mb-5 text-sm text-slate-600">
          拆分后会生成 <span className="font-bold text-orange-600">{route.routeKey}.1</span> 作为第二段，
          两段可分配给不同司机。删除 .1 可还原合并。
        </div>

        <label className="text-xs font-bold text-slate-400 uppercase tracking-wider block mb-2">
          第一段件数（当前司机 {assignedDriver?.name || '未分配'} 保留）
        </label>
        <input
          type="number" min={1} max={route.orderVolume - 1}
          value={val}
          onChange={e => setVal(Math.min(route.orderVolume - 1, Math.max(1, parseInt(e.target.value) || 1)))}
          className="w-full px-5 py-4 text-2xl font-black text-orange-600 bg-slate-50 border-2 border-slate-100 focus:border-orange-400 focus:outline-none rounded-2xl mb-4"
          autoFocus
        />

        <div className="grid grid-cols-2 gap-3 mb-6 text-center">
          <div className="bg-blue-50 rounded-2xl p-4">
            <p className="text-xs font-black text-blue-400 uppercase mb-1">第一段</p>
            <p className="text-2xl font-black text-blue-700">{val}</p>
            <p className="text-xs text-blue-400">{route.routeKey}</p>
          </div>
          <div className="bg-slate-50 rounded-2xl p-4">
            <p className="text-xs font-black text-slate-400 uppercase mb-1">第二段 (.1)</p>
            <p className="text-2xl font-black text-slate-700">{remainder}</p>
            <p className="text-xs text-slate-400">{route.routeKey}.1</p>
          </div>
        </div>

        <div className="flex gap-3">
          <button onClick={onClose} className="flex-1 py-3 rounded-2xl text-sm font-bold text-slate-400 hover:text-slate-600">取消</button>
          <button onClick={() => onConfirm(val)} className="flex-1 py-3 rounded-2xl bg-slate-900 text-white text-sm font-bold hover:bg-slate-700">确认拆分</button>
        </div>
      </div>
    </div>
  );
}

// ─── Tab: Routes (import & manage) ────────────────────────────────────────────

function RoutesTab({ routes, onRoutesChange, drivers, toast }) {
  const [pasteText, setPasteText] = useState('');
  const [showPaste, setShowPaste] = useState(false);
  const [editing, setEditing] = useState(null);
  const [editForm, setEditForm] = useState({});
  const [deleting, setDeleting] = useState(null);

  const handleParse = () => {
    if (!pasteText.trim()) return;
    const parsed = parsePaste(pasteText);
    if (parsed.length === 0) { toast('未能解析任何路线，请检查格式', 'error'); return; }
    onRoutesChange([...routes, ...parsed]);
    setPasteText('');
    setShowPaste(false);
    toast(`已导入 ${parsed.length} 条路线`);
  };

  const loadSample = () => {
    const sample = SAMPLE_ROUTES.map(r => {
      const route = makeRoute(r.routeKey, r.routeBase, SCAN_ID_MAP[r.routeBase] || '', r.orderVolume);
      const did = DEFAULT_ASSIGNMENTS[r.routeKey];
      if (did) { route.driverId = did; route.status = 'assigned'; }
      return route;
    });
    onRoutesChange(sample);
    toast(`已加载 ${sample.length} 条样例路线（含默认司机分配）`);
  };

  const startEdit = (r) => { setEditing(r.id); setEditForm({ ...r }); };

  const saveEdit = () => {
    const vol = parseInt(editForm.orderVolume, 10);
    if (!editForm.routeKey || isNaN(vol) || vol < 1) {
      toast('路线号和件数不能为空', 'error'); return;
    }
    onRoutesChange(routes.map(r => r.id === editing ? {
      ...r,
      routeKey: editForm.routeKey,
      routeBase: editForm.routeBase || editForm.routeKey.split('-')[0],
      scanId: editForm.scanId,
      zoneName: editForm.zoneName || ZONE_NAMES[editForm.routeKey] || '',
      orderVolume: vol,
      notes: editForm.notes || '',
    } : r));
    setEditing(null);
    toast('已保存');
  };

  const addRoute = () => {
    const r = makeRoute('', '', '', 0);
    onRoutesChange([...routes, r]);
    setEditing(r.id);
    setEditForm({ ...r });
  };

  const doDelete = () => {
    const target = routes.find(r => r.id === deleting);
    const nextRoutes = routes.filter(r => r.id !== deleting);
    // If deleting a split child, also restore parent volume
    if (target?.isSplitChild && target.splitParentId) {
      const parent = routes.find(r => r.id === target.splitParentId);
      if (parent) {
        onRoutesChange(nextRoutes.map(r =>
          r.id === target.splitParentId
            ? { ...r, orderVolume: r.orderVolume + target.orderVolume }
            : r
        ));
        setDeleting(null);
        toast('已删除拆分段，父路线件数已还原');
        return;
      }
    }
    onRoutesChange(nextRoutes);
    setDeleting(null);
    toast('已删除');
  };

  const totalVol = routes.reduce((s, r) => s + r.orderVolume, 0);
  const sorted = [...routes].sort((a, b) => sortRouteKey(a.routeKey, b.routeKey));

  return (
    <div>
      {deleting && <Confirm message="确定删除这条路线？" onConfirm={doDelete} onCancel={() => setDeleting(null)} />}

      {/* Header actions */}
      <div className="flex flex-wrap gap-3 mb-5 items-center">
        <button onClick={() => setShowPaste(!showPaste)}
          className="px-5 py-2.5 rounded-xl bg-slate-800 text-white text-sm font-bold hover:bg-slate-700 shadow-lg">
          粘贴导入
        </button>
        <button onClick={addRoute}
          className="px-5 py-2.5 rounded-xl border border-slate-200 text-sm font-bold text-slate-600 hover:bg-slate-50">
          + 手动添加
        </button>
        {routes.length === 0 && (
          <button onClick={loadSample}
            className="px-5 py-2.5 rounded-xl border border-orange-200 text-orange-600 text-sm font-bold hover:bg-orange-50">
            加载样例数据（测试用）
          </button>
        )}
        {routes.length > 0 && (
          <button onClick={() => setDeleting('__all__')}
            className="px-5 py-2.5 rounded-xl border border-red-100 text-red-400 text-sm font-bold hover:bg-red-50 ml-auto">
            清空今日路线
          </button>
        )}
        {routes.length > 0 && (
          <div className="flex gap-3 items-center ml-auto">
            <span className="text-xs font-bold text-slate-400">{routes.length} 条路线</span>
            <span className="px-3 py-1 rounded-full text-xs font-bold bg-orange-100 text-orange-700 border border-orange-200">
              共 {totalVol.toLocaleString()} 件
            </span>
          </div>
        )}
      </div>

      {/* Clear all confirm */}
      {deleting === '__all__' && (
        <Confirm
          message={`确定清空今日所有 ${routes.length} 条路线？`}
          onConfirm={() => { onRoutesChange([]); setDeleting(null); toast('已清空'); }}
          onCancel={() => setDeleting(null)}
        />
      )}

      {/* Paste panel */}
      {showPaste && (
        <div className="bg-slate-800 rounded-2xl p-5 mb-5">
          <p className="text-xs font-bold text-slate-300 uppercase tracking-wider mb-3">
            粘贴取货表（从 YOW 网页复制）
          </p>
          <p className="text-xs text-slate-400 mb-3">
            支持格式：「路线号 件数 PENDING 扫码号 子路线」（Tab 分隔，从网页表格复制），
            或仅「路线号 件数」。每行一条主路线。
          </p>
          <textarea
            value={pasteText}
            onChange={e => setPasteText(e.target.value)}
            rows={6}
            placeholder={'33011\t1200\tPENDING\t8257\t33011-4-1, 33011-4-2\n33012\t800\tPENDING\t8258\t33012-3-1, 33012-3-2, 33012-3-3'}
            className="w-full px-4 py-3 rounded-xl text-xs font-mono text-slate-800 bg-white border-0 focus:outline-none resize-y mb-3"
          />
          <div className="flex gap-3">
            <button onClick={handleParse}
              className="px-5 py-2 rounded-xl bg-orange-500 text-white text-sm font-bold hover:bg-orange-600">
              解析导入
            </button>
            <button onClick={() => { setShowPaste(false); setPasteText(''); }}
              className="px-4 py-2 text-sm text-slate-400 hover:text-slate-200">
              取消
            </button>
          </div>
        </div>
      )}

      {/* Screenshot OCR placeholder */}
      <div className="border-2 border-dashed border-slate-200 rounded-2xl px-5 py-3 mb-5 flex items-center gap-3 text-slate-400 text-sm">
        <span>📷</span>
        <span>截图 OCR 解析（计划中）— 目前请使用粘贴导入或手动录入</span>
      </div>

      {/* Route table */}
      {routes.length === 0 ? (
        <div className="text-center py-20 text-slate-300">
          <p className="text-4xl mb-3">📦</p>
          <p className="font-bold text-slate-400">今日尚无路线</p>
          <p className="text-sm mt-1">使用上方按钮导入或添加路线</p>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-slate-100 overflow-hidden shadow-sm">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-100">
              <tr className="text-slate-400 font-bold uppercase text-xs tracking-wider">
                <th className="px-4 py-3 text-left">路线号</th>
                <th className="px-4 py-3 text-left">区域</th>
                <th className="px-4 py-3 text-left">扫码号</th>
                <th className="px-4 py-3 text-center w-24">件数</th>
                <th className="px-4 py-3 text-left">状态</th>
                <th className="px-4 py-3 text-left">备注</th>
                <th className="px-4 py-3 text-right">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {sorted.map(r => (
                <tr key={r.id}
                  className={`hover:bg-slate-50/50 group ${r.isSplitChild ? 'bg-orange-50/40' : ''}`}>
                  {editing === r.id ? (
                    <>
                      <td className="px-4 py-2">
                        <input value={editForm.routeKey} onChange={e => setEditForm({ ...editForm, routeKey: e.target.value })}
                          className="px-2 py-1 rounded border border-orange-300 text-sm font-mono w-32 focus:outline-none" autoFocus />
                      </td>
                      <td className="px-4 py-2">
                        <input value={editForm.zoneName} onChange={e => setEditForm({ ...editForm, zoneName: e.target.value })}
                          className="px-2 py-1 rounded border border-slate-200 text-sm w-28 focus:outline-none" />
                      </td>
                      <td className="px-4 py-2">
                        <input value={editForm.scanId} onChange={e => setEditForm({ ...editForm, scanId: e.target.value })}
                          className="px-2 py-1 rounded border border-slate-200 text-sm font-mono w-20 focus:outline-none" />
                      </td>
                      <td className="px-4 py-2 text-center">
                        <input type="number" value={editForm.orderVolume} onChange={e => setEditForm({ ...editForm, orderVolume: e.target.value })}
                          className="px-2 py-1 rounded border border-orange-300 text-sm text-center font-mono w-20 focus:outline-none" />
                      </td>
                      <td className="px-4 py-2 text-slate-400 text-xs">{STATUS_LABELS[r.status]}</td>
                      <td className="px-4 py-2">
                        <input value={editForm.notes} onChange={e => setEditForm({ ...editForm, notes: e.target.value })}
                          className="px-2 py-1 rounded border border-slate-200 text-sm w-full focus:outline-none" />
                      </td>
                      <td className="px-4 py-2 text-right">
                        <button onClick={saveEdit} className="text-emerald-500 font-bold text-xs mr-2">保存</button>
                        <button onClick={() => setEditing(null)} className="text-slate-400 text-xs">取消</button>
                      </td>
                    </>
                  ) : (
                    <>
                      <td className="px-4 py-2.5">
                        <span className={`font-mono text-sm font-bold ${r.isSplitChild ? 'text-orange-400' : 'text-orange-600'}`}>
                          {r.routeKey}
                        </span>
                        {r.isSplitChild && <span className="ml-1 text-xs text-orange-400 font-bold">拆</span>}
                      </td>
                      <td className="px-4 py-2.5 text-slate-500 text-sm">{r.zoneName || '—'}</td>
                      <td className="px-4 py-2.5">
                        <span className="bg-slate-100 px-2 py-0.5 rounded font-mono text-xs font-bold text-slate-600">
                          #{r.scanId || '—'}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-center font-mono font-bold text-slate-800">{r.orderVolume}</td>
                      <td className="px-4 py-2.5">
                        <Badge label={STATUS_LABELS[r.status]} color={STATUS_COLORS[r.status]} />
                      </td>
                      <td className="px-4 py-2.5 text-slate-400 text-xs">{r.notes}</td>
                      <td className="px-4 py-2.5 text-right opacity-0 group-hover:opacity-100 transition-opacity">
                        <button onClick={() => startEdit(r)} className="text-blue-500 font-bold text-xs mr-2">编辑</button>
                        <button onClick={() => setDeleting(r.id)} className="text-red-400 font-bold text-xs">删除</button>
                      </td>
                    </>
                  )}
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t border-slate-100 bg-slate-50">
                <td colSpan={3} className="px-4 py-2 text-xs text-slate-400">{routes.length} 条路线</td>
                <td className="px-4 py-2 text-center font-mono font-black text-slate-700">{totalVol.toLocaleString()}</td>
                <td colSpan={3} className="px-4 py-2 text-xs text-slate-400 text-right">数据自动保存到本地</td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  );
}

// ─── Tab: Dispatch (smart allocation) ─────────────────────────────────────────

function DispatchTab({ routes, drivers, onRoutesChange, date, toast }) {
  const [splitting, setSplitting] = useState(null); // route being split
  const [warnings, setWarnings] = useState([]);
  const [stats, setStats] = useState(null);
  const [offDriverIds, setOffDriverIds] = useState(new Set());

  const activeDrivers = useMemo(
    () => drivers.filter(d => d.active && !offDriverIds.has(d.id)),
    [drivers, offDriverIds]
  );

  const usage = useMemo(() => driverUsage(routes, drivers), [routes, drivers]);

  const companyDrivers = useMemo(() => activeDrivers.filter(d => !d.isAgency), [activeDrivers]);
  const agencyDrivers  = useMemo(() => activeDrivers.filter(d =>  d.isAgency), [activeDrivers]);

  const handleAutoAllocate = () => {
    if (routes.length === 0) { toast('请先导入路线', 'error'); return; }
    const result = autoAllocate(routes, activeDrivers);

    const updated = routes.map(r => {
      const did = result.assignments[r.id];
      return did ? { ...r, driverId: did, status: 'assigned' } : r;
    });
    onRoutesChange(updated);
    setWarnings(result.warnings);
    setStats(result.stats);

    const assignedCount = Object.keys(result.assignments).length;
    const warnCount = result.warnings.length;
    toast(`已分配 ${assignedCount}/${routes.length} 条路线${warnCount > 0 ? `，${warnCount} 条警告` : ''}`);
  };

  const updateDriver = (routeId, driverId) => {
    onRoutesChange(routes.map(r =>
      r.id === routeId
        ? { ...r, driverId: driverId || null, status: driverId ? 'assigned' : 'pending' }
        : r
    ));
  };

  const doSplit = (firstVolume) => {
    if (!splitting) return;
    const parent = splitting;
    const childKey = `${parent.routeKey}.1`;
    const childVol = parent.orderVolume - firstVolume;

    const child = makeRoute(childKey, parent.routeBase, parent.scanId, childVol);
    child.isSplitChild = true;
    child.splitParentId = parent.id;
    child.zoneName = parent.zoneName;
    child.driverId = null;
    child.status = 'pending';

    const updated = routes.map(r =>
      r.id === parent.id ? { ...r, orderVolume: firstVolume } : r
    );
    onRoutesChange([...updated, child]);
    setSplitting(null);
    toast(`已拆分：${parent.routeKey} (${firstVolume}件) + ${childKey} (${childVol}件)`);
  };

  const removeSplit = (child) => {
    const parent = routes.find(r => r.id === child.splitParentId);
    const filtered = routes.filter(r => r.id !== child.id);
    if (parent) {
      onRoutesChange(filtered.map(r =>
        r.id === parent.id ? { ...r, orderVolume: r.orderVolume + child.orderVolume } : r
      ));
    } else {
      onRoutesChange(filtered);
    }
    toast(`已合并 ${child.routeKey}，还原 ${child.orderVolume} 件到父路线`);
  };

  const sorted = [...routes].sort((a, b) => sortRouteKey(a.routeKey, b.routeKey));
  const totalVol = routes.reduce((s, r) => s + r.orderVolume, 0);
  const assignedVol = routes.filter(r => r.driverId).reduce((s, r) => s + r.orderVolume, 0);

  return (
    <div>
      {splitting && (
        <SplitModal
          route={splitting}
          drivers={drivers}
          onClose={() => setSplitting(null)}
          onConfirm={doSplit}
        />
      )}

      {/* Control bar */}
      <div className="flex flex-wrap gap-3 mb-5 items-center">
        <button onClick={handleAutoAllocate}
          className="px-6 py-2.5 rounded-xl bg-orange-500 text-white text-sm font-black hover:bg-orange-600 shadow-lg shadow-orange-100">
          ⚡ 智能分配
        </button>
        <div className="flex items-center gap-2 text-xs text-slate-500">
          <span className="font-bold">{routes.filter(r => r.driverId).length}/{routes.length}</span>条已分配 ·
          <span className="font-bold">{assignedVol.toLocaleString()}/{totalVol.toLocaleString()}</span>件
        </div>
        <div className="ml-auto text-xs text-slate-400">{date}</div>
      </div>

      {/* Off-toggle for drivers */}
      <div className="bg-white rounded-2xl border border-slate-100 p-4 mb-5">
        <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">今日在线司机（点击标记休息）</p>
        <div className="flex flex-wrap gap-2">
          {drivers.filter(d => !d.isAgency).map(d => {
            const off = offDriverIds.has(d.id);
            const used = usage[d.id] || 0;
            return (
              <button key={d.id}
                onClick={() => setOffDriverIds(prev => {
                  const n = new Set(prev);
                  off ? n.delete(d.id) : n.add(d.id);
                  return n;
                })}
                className={`flex flex-col items-start px-3 py-2 rounded-xl border text-xs font-bold transition-all
                  ${off ? 'bg-slate-100 text-slate-400 border-slate-200 line-through' : 'bg-slate-50 text-slate-700 border-slate-200 hover:border-orange-300'}`}
              >
                <span>{d.name}</span>
                <span className="font-normal text-slate-400">{used}/{d.maxCapacity}件</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Warnings */}
      {warnings.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 mb-5">
          <p className="text-xs font-black text-amber-700 uppercase tracking-wider mb-2">
            分配警告 ({warnings.length})
          </p>
          {warnings.map((w, i) => (
            <div key={i} className={`text-xs py-1 ${w.type === 'overflow' ? 'text-red-600' : w.type === 'needs-split' ? 'text-orange-600' : 'text-amber-600'}`}>
              {w.type === 'needs-split' && '✂️ '}
              {w.type === 'overflow' && '⚠️ '}
              {w.message}
            </div>
          ))}
        </div>
      )}

      {/* Overflow recommendation — how to spread the unassigned volume to agencies */}
      {stats && stats.unassigned > 0 && (() => {
        const split = recommendOverflowSplit(stats.unassigned, activeDrivers);
        return (
          <div className="bg-purple-50 border border-purple-200 rounded-2xl p-4 mb-5">
            <p className="text-xs font-black text-purple-700 uppercase tracking-wider mb-2">
              超出运力 {stats.unassigned.toLocaleString()} 件 — 建议按比例分给中介
            </p>
            <div className="flex flex-wrap gap-2">
              {split.map(s => (
                <span key={s.id} className={`px-3 py-1 rounded-full text-xs font-bold border ${getGroupColor(s.id)}`}>
                  {s.id} +{s.suggested.toLocaleString()} 件
                </span>
              ))}
            </div>
            <p className="text-xs text-purple-400 mt-2">比例基于平时各中介承载量（Kaneza 最多）。可在「司机管理」调每个中介运力上限。</p>
          </div>
        );
      })()}

      {/* Stats summary */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
          {[
            { label: '总件数', val: stats.totalVol.toLocaleString(), color: 'text-slate-800' },
            { label: '公司司机', val: stats.companyAssigned.toLocaleString(), color: 'text-blue-700' },
            { label: '中介', val: stats.agencyAssigned.toLocaleString(), color: 'text-purple-700' },
            { label: '未分配', val: (stats.unassigned || 0).toLocaleString(), color: stats.unassigned > 0 ? 'text-red-600 font-black' : 'text-emerald-600' },
          ].map(({ label, val, color }) => (
            <div key={label} className="bg-white rounded-2xl border border-slate-100 p-4">
              <p className="text-xs text-slate-400 font-bold uppercase tracking-wider">{label}</p>
              <p className={`text-2xl font-black mt-1 ${color}`}>{val}</p>
            </div>
          ))}
        </div>
      )}

      {/* Driver capacity bars */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-5">
        <div className="bg-white rounded-2xl border border-slate-100 p-4">
          <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">公司司机运力</p>
          <div className="space-y-2">
            {companyDrivers.map(d => {
              const used = usage[d.id] || 0;
              return (
                <div key={d.id} className="flex items-center gap-2">
                  <span className="text-xs font-bold text-slate-600 w-20 truncate">{d.name}</span>
                  <div className="flex-1"><CapBar used={used} max={d.maxCapacity} /></div>
                </div>
              );
            })}
            {companyDrivers.length === 0 && <p className="text-xs text-slate-300">无在线公司司机</p>}
          </div>
        </div>
        <div className="bg-white rounded-2xl border border-slate-100 p-4">
          <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">中介运力</p>
          <div className="space-y-2">
            {agencyDrivers.map(d => {
              const used = usage[d.id] || 0;
              return (
                <div key={d.id} className="flex items-center gap-2">
                  <span className="text-xs font-bold w-20 truncate" style={{ color: 'inherit' }}>
                    <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-bold border ${getGroupColor(d.group)}`}>{d.name}</span>
                  </span>
                  <div className="flex-1"><CapBar used={used} max={d.maxCapacity} /></div>
                </div>
              );
            })}
            {agencyDrivers.length === 0 && <p className="text-xs text-slate-300">无启用中介</p>}
          </div>
        </div>
      </div>

      {/* Route assignment table */}
      {routes.length === 0 ? (
        <div className="text-center py-16 text-slate-300">
          <p className="text-3xl mb-2">📋</p>
          <p className="text-slate-400">请先在「今日路线」标签页导入路线</p>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-slate-100 overflow-hidden shadow-sm">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-100">
              <tr className="text-slate-400 font-bold uppercase text-xs tracking-wider">
                <th className="px-4 py-3 text-left">路线号</th>
                <th className="px-4 py-3 text-left">区域</th>
                <th className="px-4 py-3 text-left">扫码号</th>
                <th className="px-4 py-3 text-center w-20">件数</th>
                <th className="px-4 py-3 text-left w-44">分配司机</th>
                <th className="px-4 py-3 text-left">状态</th>
                <th className="px-4 py-3 text-right">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {sorted.map(r => {
                const assignedDriver = drivers.find(d => d.id === r.driverId);
                const used = usage[r.driverId] || 0;
                const isOver = assignedDriver && used > assignedDriver.maxCapacity;
                return (
                  <tr key={r.id}
                    className={`hover:bg-slate-50/50 ${r.isSplitChild ? 'bg-orange-50/30' : ''} ${isOver ? 'bg-red-50/40' : ''}`}>
                    <td className="px-4 py-2.5">
                      <span className={`font-mono text-sm font-bold ${r.isSplitChild ? 'text-orange-400' : 'text-orange-600'}`}>
                        {r.routeKey}
                      </span>
                      {r.isSplitChild && <span className="ml-1 px-1.5 py-0.5 bg-orange-100 text-orange-500 text-xs rounded font-bold">拆</span>}
                    </td>
                    <td className="px-4 py-2.5 text-slate-500 text-xs">{r.zoneName || '—'}</td>
                    <td className="px-4 py-2.5">
                      <span className="bg-slate-100 px-2 py-0.5 rounded font-mono text-xs font-bold text-slate-600">
                        #{r.scanId || '—'}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-center font-mono font-bold text-slate-800">{r.orderVolume}</td>
                    <td className="px-4 py-2.5">
                      <select
                        value={r.driverId || ''}
                        onChange={e => updateDriver(r.id, e.target.value)}
                        className={`px-2 py-1 rounded-lg border text-xs font-bold focus:outline-none w-full
                          ${r.driverId
                            ? `border-transparent ${getGroupColor(assignedDriver?.group || 'Company')}`
                            : 'border-slate-200 text-slate-400 bg-white'
                          }`}
                      >
                        <option value="">未分配</option>
                        <optgroup label="公司司机">
                          {drivers.filter(d => !d.isAgency && d.active).map(d => (
                            <option key={d.id} value={d.id}>{d.name} ({d.id})</option>
                          ))}
                        </optgroup>
                        <optgroup label="中介">
                          {drivers.filter(d => d.isAgency && d.active).map(d => (
                            <option key={d.id} value={d.id}>{d.name}</option>
                          ))}
                        </optgroup>
                      </select>
                    </td>
                    <td className="px-4 py-2.5">
                      <Badge label={STATUS_LABELS[r.status]} color={STATUS_COLORS[r.status]} />
                      {isOver && <span className="ml-1 text-xs text-red-500 font-bold">超载!</span>}
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      {!r.isSplitChild && (
                        <button onClick={() => setSplitting(r)}
                          className="text-xs font-bold text-slate-400 hover:text-orange-500 mr-2">
                          拆分
                        </button>
                      )}
                      {r.isSplitChild && (
                        <button onClick={() => removeSplit(r)}
                          className="text-xs font-bold text-orange-400 hover:text-red-500 mr-2">
                          合并
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ─── Tab: Check In / Out ──────────────────────────────────────────────────────

function CheckInOutTab({ routes, onRoutesChange, drivers, toast }) {
  const updateStatus = (routeId, newStatus) => {
    onRoutesChange(routes.map(r => r.id === routeId ? { ...r, status: newStatus } : r));
  };

  const batchUpdate = (from, to) => {
    const count = routes.filter(r => r.status === from).length;
    if (count === 0) { toast(`没有状态为「${STATUS_LABELS[from]}」的路线`, 'error'); return; }
    onRoutesChange(routes.map(r => r.status === from ? { ...r, status: to } : r));
    toast(`已将 ${count} 条路线更新为「${STATUS_LABELS[to]}」`);
  };

  const sorted = [...routes].sort((a, b) => sortRouteKey(a.routeKey, b.routeKey));
  const counts = {};
  Object.keys(STATUS_LABELS).forEach(s => { counts[s] = routes.filter(r => r.status === s).length; });

  return (
    <div>
      {/* Status summary */}
      <div className="grid grid-cols-4 gap-3 mb-5">
        {Object.entries(STATUS_LABELS).map(([k, v]) => (
          <div key={k} className={`rounded-2xl p-4 border ${STATUS_COLORS[k]}`}>
            <p className="text-xs font-bold uppercase tracking-wider opacity-70">{v}</p>
            <p className="text-3xl font-black mt-1">{counts[k]}</p>
          </div>
        ))}
      </div>

      {/* Batch actions */}
      <div className="flex flex-wrap gap-3 mb-5">
        <button onClick={() => batchUpdate('assigned', 'checked-in')}
          className="px-5 py-2.5 rounded-xl bg-amber-500 text-white text-sm font-bold hover:bg-amber-600 shadow-lg">
          全部 Check In（已分配→已取货）
        </button>
        <button onClick={() => batchUpdate('checked-in', 'checked-out')}
          className="px-5 py-2.5 rounded-xl bg-emerald-500 text-white text-sm font-bold hover:bg-emerald-600 shadow-lg">
          全部 Check Out（已取货→已派送）
        </button>
      </div>

      {routes.length === 0 ? (
        <div className="text-center py-20 text-slate-300">
          <p className="text-3xl mb-2">🚚</p>
          <p className="text-slate-400">今日无路线</p>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-slate-100 overflow-hidden shadow-sm">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-100">
              <tr className="text-slate-400 font-bold uppercase text-xs tracking-wider">
                <th className="px-4 py-3 text-left">路线号</th>
                <th className="px-4 py-3 text-left">区域</th>
                <th className="px-4 py-3 text-center">件数</th>
                <th className="px-4 py-3 text-left">司机</th>
                <th className="px-4 py-3 text-left">状态</th>
                <th className="px-4 py-3 text-right">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {sorted.map(r => {
                const d = drivers.find(dr => dr.id === r.driverId);
                return (
                  <tr key={r.id} className="hover:bg-slate-50/50">
                    <td className="px-4 py-2.5 font-mono text-orange-600 font-bold text-sm">{r.routeKey}</td>
                    <td className="px-4 py-2.5 text-slate-500 text-xs">{r.zoneName || '—'}</td>
                    <td className="px-4 py-2.5 text-center font-mono font-bold">{r.orderVolume}</td>
                    <td className="px-4 py-2.5"><DriverBadge driver={d} /></td>
                    <td className="px-4 py-2.5">
                      <Badge label={STATUS_LABELS[r.status]} color={STATUS_COLORS[r.status]} />
                    </td>
                    <td className="px-4 py-2.5 text-right flex justify-end gap-2">
                      {r.status === 'assigned' && (
                        <button onClick={() => updateStatus(r.id, 'checked-in')}
                          className="px-3 py-1 rounded-lg bg-amber-100 text-amber-700 text-xs font-bold hover:bg-amber-200">
                          Check In
                        </button>
                      )}
                      {r.status === 'checked-in' && (
                        <button onClick={() => updateStatus(r.id, 'checked-out')}
                          className="px-3 py-1 rounded-lg bg-emerald-100 text-emerald-700 text-xs font-bold hover:bg-emerald-200">
                          Check Out
                        </button>
                      )}
                      {r.status === 'checked-out' && (
                        <button onClick={() => updateStatus(r.id, 'checked-in')}
                          className="px-3 py-1 rounded-lg bg-slate-100 text-slate-500 text-xs font-bold hover:bg-slate-200">
                          撤回
                        </button>
                      )}
                      {r.status === 'pending' && (
                        <span className="text-xs text-slate-300">需先分配司机</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ─── Tab: Report (WhatsApp) ────────────────────────────────────────────────────

function ReportTab({ routes, drivers, date, toast }) {
  const [copied, setCopied] = useState(null);

  const driverMap = useMemo(() => {
    const m = {};
    drivers.forEach(d => { m[d.id] = d; });
    return m;
  }, [drivers]);

  const assigned = useMemo(
    () => [...routes].filter(r => r.driverId).sort((a, b) => sortRouteKey(a.routeKey, b.routeKey)),
    [routes]
  );

  const companyRoutes = assigned.filter(r => !driverMap[r.driverId]?.isAgency);
  const agencyRoutes  = assigned.filter(r =>  driverMap[r.driverId]?.isAgency);
  const unassigned    = routes.filter(r => !r.driverId);

  function routeLine(r) {
    const d = driverMap[r.driverId];
    const zone = r.zoneName ? `(${r.zoneName})` : '';
    const scan = r.scanId ? ` #${r.scanId}` : '';
    const time = r.timeSlot ? ` ${r.timeSlot}` : '';
    const who  = d ? (d.isAgency ? d.name : `${d.name}(${d.id})`) : '未分配';
    return `${r.routeKey}${zone}${scan}${time} — ${who} — ${r.orderVolume}件`;
  }

  function summaryBlock(routesList) {
    const byDriver = {};
    routesList.forEach(r => {
      const did = r.driverId;
      if (!byDriver[did]) byDriver[did] = { driver: driverMap[did], routes: 0, vol: 0 };
      byDriver[did].routes++;
      byDriver[did].vol += r.orderVolume;
    });
    return Object.values(byDriver)
      .map(({ driver, routes, vol }) => `${driver?.name || '?'}: ${routes}条 ${vol}件`)
      .join('  |  ');
  }

  const totalVol = routes.reduce((s, r) => s + r.orderVolume, 0);
  const companyVol = companyRoutes.reduce((s, r) => s + r.orderVolume, 0);
  const agencyVol  = agencyRoutes.reduce((s, r) => s + r.orderVolume, 0);
  const dateLabel = date.replace(/-/g, '/');

  const companyReport = [
    `📦 YOW 个人司机排班表 ${dateLabel}`,
    '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
    ...companyRoutes.map(routeLine),
    '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
    `总件数: ${companyVol.toLocaleString()}件`,
    summaryBlock(companyRoutes),
  ].join('\n');

  const agencyReport = [
    `📦 YOW 中介排班表 ${dateLabel}`,
    '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
    ...agencyRoutes.map(routeLine),
    '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
    `总件数: ${agencyVol.toLocaleString()}件`,
    summaryBlock(agencyRoutes),
  ].join('\n');

  const fullReport = [
    `📦 YOW 排班表汇总 ${dateLabel}`,
    '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
    '【个人司机群】',
    ...companyRoutes.map(routeLine),
    '',
    '【中介群】',
    ...agencyRoutes.map(routeLine),
    '',
    unassigned.length > 0 ? `【待分配 ${unassigned.length} 条】\n${unassigned.map(r => r.routeKey).join(', ')}` : '',
    '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
    `总件数: ${totalVol.toLocaleString()}件`,
    `公司: ${companyVol.toLocaleString()}件  |  中介: ${agencyVol.toLocaleString()}件`,
  ].filter(l => l !== undefined && l !== null).join('\n');

  const copyText = async (text, key) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(key);
      setTimeout(() => setCopied(null), 2000);
      toast('已复制到剪贴板');
    } catch {
      toast('复制失败，请手动选中文字', 'error');
    }
  };

  const reportBlock = (title, text, key, accentColor) => (
    <div className="bg-slate-800 rounded-2xl p-5 mb-4">
      <div className="flex justify-between items-center mb-3">
        <p className={`text-xs font-black uppercase tracking-wider ${accentColor}`}>{title}</p>
        <button
          onClick={() => copyText(text, key)}
          className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all
            ${copied === key ? 'bg-emerald-500 text-white' : 'bg-white text-slate-800 hover:bg-slate-100'}`}
        >
          {copied === key ? '✓ 已复制' : '复制'}
        </button>
      </div>
      <pre className="text-slate-100 text-xs leading-relaxed font-mono whitespace-pre-wrap select-all">
        {text}
      </pre>
    </div>
  );

  if (routes.length === 0) {
    return (
      <div className="text-center py-20 text-slate-300">
        <p className="text-3xl mb-2">📋</p>
        <p className="text-slate-400">没有路线数据，请先导入并分配</p>
      </div>
    );
  }

  return (
    <div>
      {assigned.length === 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 mb-5 text-amber-700 text-sm font-bold">
          还没有已分配的路线，请先在「智能排班」标签页分配司机
        </div>
      )}

      {reportBlock('个人司机群 报表', companyReport, 'company', 'text-blue-400')}
      {reportBlock('中介群 报表', agencyReport, 'agency', 'text-purple-400')}
      {reportBlock('完整汇总报表', fullReport, 'full', 'text-orange-400')}

      {unassigned.length > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-2xl p-4">
          <p className="text-xs font-black text-red-600 uppercase tracking-wider mb-2">
            未分配路线 ({unassigned.length})
          </p>
          <div className="flex flex-wrap gap-2">
            {unassigned.map(r => (
              <span key={r.id} className="px-2 py-1 bg-red-100 text-red-700 rounded font-mono text-xs font-bold">
                {r.routeKey}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Tab: Drivers ─────────────────────────────────────────────────────────────

function DriversTab({ drivers, onDriversChange, toast }) {
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({});
  const [adding, setAdding] = useState(false);
  const [newForm, setNewForm] = useState({ id: '', name: '', group: 'Company', maxCapacity: 250, isAgency: false, active: true });

  const startEdit = (d) => { setEditing(d.id); setForm({ ...d }); };

  const saveEdit = () => {
    const cap = parseInt(form.maxCapacity, 10);
    if (!form.name.trim() || isNaN(cap) || cap < 1) {
      toast('名字和运力不能为空', 'error'); return;
    }
    onDriversChange(drivers.map(d => d.id === editing ? { ...d, ...form, maxCapacity: cap } : d));
    setEditing(null);
    toast('已保存');
  };

  const toggleActive = (id) => {
    onDriversChange(drivers.map(d => d.id === id ? { ...d, active: !d.active } : d));
  };

  const doAdd = () => {
    const cap = parseInt(newForm.maxCapacity, 10);
    if (!newForm.id.trim() || !newForm.name.trim() || isNaN(cap) || cap < 1) {
      toast('ID、名字和运力不能为空', 'error'); return;
    }
    if (drivers.some(d => d.id === newForm.id.trim())) {
      toast('该 ID 已存在', 'error'); return;
    }
    onDriversChange([...drivers, { ...newForm, id: newForm.id.trim(), maxCapacity: cap }]);
    setAdding(false);
    setNewForm({ id: '', name: '', group: 'Company', maxCapacity: 250, isAgency: false, active: true });
    toast(`司机 ${newForm.name} 已添加`);
  };

  const doDelete = (id) => {
    onDriversChange(drivers.filter(d => d.id !== id));
    toast('已删除');
  };

  const resetDefaults = () => {
    onDriversChange(DEFAULT_DRIVERS);
    toast('已重置为默认司机列表');
  };

  const company = drivers.filter(d => !d.isAgency);
  const agency  = drivers.filter(d =>  d.isAgency);

  const driverSection = (title, list) => (
    <div className="bg-white rounded-2xl border border-slate-100 overflow-hidden shadow-sm mb-5">
      <div className="bg-slate-800 text-white px-5 py-2.5 text-sm font-black flex justify-between items-center">
        <span>{title}</span>
        <span className="text-slate-400 text-xs">{list.length} 人</span>
      </div>
      <table className="w-full text-sm">
        <thead className="bg-slate-50 border-b border-slate-100">
          <tr className="text-slate-400 font-bold uppercase text-xs tracking-wider">
            <th className="px-4 py-2 text-left">ID</th>
            <th className="px-4 py-2 text-left">名字</th>
            <th className="px-4 py-2 text-left">团队</th>
            <th className="px-4 py-2 text-left">优先线路 / 备注</th>
            <th className="px-4 py-2 text-center">运力上限</th>
            <th className="px-4 py-2 text-center">状态</th>
            <th className="px-4 py-2 text-right">操作</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-50">
          {list.map(d => (
            <tr key={d.id} className={`hover:bg-slate-50/50 group ${!d.active ? 'opacity-40' : ''}`}>
              {editing === d.id ? (
                <>
                  <td className="px-4 py-2 font-mono text-xs text-slate-400">{d.id}</td>
                  <td className="px-4 py-2">
                    <input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })}
                      className="px-2 py-1 rounded border border-orange-300 text-sm w-32 focus:outline-none" autoFocus />
                  </td>
                  <td className="px-4 py-2">
                    <input value={form.group} onChange={e => setForm({ ...form, group: e.target.value })}
                      className="px-2 py-1 rounded border border-slate-200 text-sm w-24 focus:outline-none" />
                  </td>
                  <td className="px-4 py-2">
                    <input value={form.note || ''} onChange={e => setForm({ ...form, note: e.target.value })}
                      className="px-2 py-1 rounded border border-slate-200 text-sm w-44 focus:outline-none" placeholder="优先区域 / 备注" />
                  </td>
                  <td className="px-4 py-2 text-center">
                    <input type="number" value={form.maxCapacity} onChange={e => setForm({ ...form, maxCapacity: e.target.value })}
                      className="px-2 py-1 rounded border border-orange-300 text-sm w-20 text-center focus:outline-none" />
                  </td>
                  <td className="px-4 py-2 text-center">
                    <input type="checkbox" checked={form.active} onChange={e => setForm({ ...form, active: e.target.checked })} />
                  </td>
                  <td className="px-4 py-2 text-right">
                    <button onClick={saveEdit} className="text-emerald-500 font-bold text-xs mr-2">保存</button>
                    <button onClick={() => setEditing(null)} className="text-slate-400 text-xs">取消</button>
                  </td>
                </>
              ) : (
                <>
                  <td className="px-4 py-2 font-mono text-xs text-orange-600 font-bold">{d.id}</td>
                  <td className="px-4 py-2 font-bold text-slate-800">{d.name}</td>
                  <td className="px-4 py-2">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-bold border ${getGroupColor(d.group)}`}>{d.group}</span>
                  </td>
                  <td className="px-4 py-2 text-xs text-slate-500">{d.note || ''}</td>
                  <td className="px-4 py-2 text-center font-mono font-bold text-slate-700">{d.maxCapacity}</td>
                  <td className="px-4 py-2 text-center">
                    <button onClick={() => toggleActive(d.id)}
                      className={`px-2 py-0.5 rounded-full text-xs font-bold ${d.active ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-400'}`}>
                      {d.active ? '在线' : '休息'}
                    </button>
                  </td>
                  <td className="px-4 py-2 text-right opacity-0 group-hover:opacity-100 transition-opacity">
                    <button onClick={() => startEdit(d)} className="text-blue-500 font-bold text-xs mr-2">编辑</button>
                    <button onClick={() => doDelete(d.id)} className="text-red-400 font-bold text-xs">删除</button>
                  </td>
                </>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );

  return (
    <div>
      <div className="flex flex-wrap gap-3 mb-5 items-center">
        <button onClick={() => setAdding(!adding)}
          className="px-5 py-2.5 rounded-xl bg-slate-800 text-white text-sm font-bold hover:bg-slate-700 shadow-lg">
          + 添加司机
        </button>
        <button onClick={resetDefaults}
          className="px-5 py-2.5 rounded-xl border border-slate-200 text-slate-600 text-sm font-bold hover:bg-slate-50">
          重置为默认
        </button>
        <span className="text-xs text-slate-400 ml-auto">运力上限可按日期临时关闭司机（在排班标签页）</span>
      </div>

      {adding && (
        <div className="bg-orange-50 border border-orange-200 rounded-2xl p-5 mb-5">
          <p className="text-xs font-black text-orange-600 uppercase tracking-wider mb-4">添加新司机</p>
          <div className="flex flex-wrap gap-3 items-end">
            <div>
              <label className="text-xs text-slate-400 font-bold block mb-1">Driver ID</label>
              <input value={newForm.id} onChange={e => setNewForm({ ...newForm, id: e.target.value })}
                className="px-3 py-2 rounded-lg border border-slate-200 text-sm w-28 font-mono focus:outline-none focus:border-orange-400" placeholder="19492" />
            </div>
            <div>
              <label className="text-xs text-slate-400 font-bold block mb-1">名字</label>
              <input value={newForm.name} onChange={e => setNewForm({ ...newForm, name: e.target.value })}
                className="px-3 py-2 rounded-lg border border-slate-200 text-sm w-32 focus:outline-none focus:border-orange-400" placeholder="Fath" />
            </div>
            <div>
              <label className="text-xs text-slate-400 font-bold block mb-1">团队</label>
              <input value={newForm.group} onChange={e => setNewForm({ ...newForm, group: e.target.value })}
                className="px-3 py-2 rounded-lg border border-slate-200 text-sm w-24 focus:outline-none focus:border-orange-400" placeholder="Company" />
            </div>
            <div>
              <label className="text-xs text-slate-400 font-bold block mb-1">运力上限</label>
              <input type="number" value={newForm.maxCapacity} onChange={e => setNewForm({ ...newForm, maxCapacity: e.target.value })}
                className="px-3 py-2 rounded-lg border border-slate-200 text-sm w-24 text-center focus:outline-none focus:border-orange-400" />
            </div>
            <div>
              <label className="text-xs text-slate-400 font-bold block mb-1">类型</label>
              <select value={newForm.isAgency ? 'agency' : 'company'} onChange={e => setNewForm({ ...newForm, isAgency: e.target.value === 'agency' })}
                className="px-3 py-2 rounded-lg border border-slate-200 text-sm font-bold focus:outline-none">
                <option value="company">公司司机</option>
                <option value="agency">中介</option>
              </select>
            </div>
            <button onClick={doAdd} className="px-5 py-2 rounded-lg bg-emerald-500 text-white text-sm font-bold hover:bg-emerald-600">保存</button>
            <button onClick={() => setAdding(false)} className="px-4 py-2 text-sm text-slate-400">取消</button>
          </div>
        </div>
      )}

      {driverSection('公司司机', company)}
      {driverSection('中介团队', agency)}
    </div>
  );
}

// ─── Tab: Excel Allocation Ranges ─────────────────────────────────────────────

function AllocationTab({ routes, drivers, date, toast }) {
  const [copied, setCopied] = useState(null);

  const ranges = useMemo(() => generateAllocationRanges(routes, drivers), [routes, drivers]);
  const totalVol = routes.reduce((s, r) => s + r.orderVolume, 0);
  const assignedCount = routes.filter(r => r.driverId).length;

  const copyOne = async (text, base) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(base);
      setTimeout(() => setCopied(null), 1800);
      toast(`已复制 ${base} 的排单范围`);
    } catch { toast('复制失败，请手动选中', 'error'); }
  };

  const copyAll = async () => {
    const all = ranges.map(r => r.text).join('\n');
    try {
      await navigator.clipboard.writeText(all);
      setCopied('__all__');
      setTimeout(() => setCopied(null), 1800);
      toast('已复制全部排单范围');
    } catch { toast('复制失败，请手动选中', 'error'); }
  };

  if (routes.length === 0) {
    return (
      <div className="text-center py-20 text-slate-300">
        <p className="text-3xl mb-2">🧮</p>
        <p className="text-slate-400">没有路线数据，请先导入并分配司机</p>
      </div>
    );
  }

  return (
    <div>
      {/* Summary cards mirroring the existing tool */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-5">
        <div className="bg-white rounded-2xl border border-slate-100 p-4">
          <p className="text-xs text-slate-400 font-bold uppercase tracking-wider">总货量</p>
          <p className="text-2xl font-black text-slate-800 mt-1">{totalVol.toLocaleString()}</p>
        </div>
        <div className="bg-white rounded-2xl border border-slate-100 p-4">
          <p className="text-xs text-slate-400 font-bold uppercase tracking-wider">已分配 / 路线数</p>
          <p className="text-2xl font-black text-slate-800 mt-1">{assignedCount}<span className="text-slate-300 text-lg">/{routes.length}</span></p>
        </div>
        <div className="bg-white rounded-2xl border border-slate-100 p-4 flex items-center justify-between">
          <div>
            <p className="text-xs text-slate-400 font-bold uppercase tracking-wider">输出路线</p>
            <p className="text-2xl font-black text-slate-800 mt-1">{ranges.length}</p>
          </div>
          <button onClick={copyAll}
            className={`px-5 py-2.5 rounded-xl text-sm font-bold transition-all ${copied === '__all__' ? 'bg-emerald-500 text-white' : 'bg-slate-800 text-white hover:bg-slate-700'}`}>
            {copied === '__all__' ? '✓ 已复制' : '复制全部'}
          </button>
        </div>
      </div>

      <div className="bg-blue-50 border border-blue-100 rounded-2xl px-5 py-3 mb-5 text-xs text-blue-700">
        把每行粘进 final chart 的 <span className="font-bold font-mono">E5 / Allocation</span> 列。
        公司司机线显示真实司机号可直接用；<span className="font-bold">中介线显示团队名</span>（如 Kaneza），
        最终表里需替换为当天该团队的具体车号。
      </div>

      {/* Per-route range rows */}
      <div className="space-y-2.5">
        {ranges.map(r => (
          <div key={r.base} className="flex items-center gap-3">
            <div className={`flex-1 bg-white rounded-2xl border px-5 py-3.5 font-mono text-sm text-slate-700 overflow-x-auto
              ${r.hasAgency ? 'border-amber-200' : 'border-slate-100'}`}>
              {r.text}
            </div>
            <button onClick={() => copyOne(r.text, r.base)}
              className={`shrink-0 w-28 px-4 py-3.5 rounded-2xl text-sm font-bold transition-all flex items-center justify-center gap-1.5
                ${copied === r.base ? 'bg-emerald-500 text-white' : 'bg-slate-800 text-white hover:bg-slate-700'}`}>
              {copied === r.base ? '✓' : '📋'} {r.base}
            </button>
          </div>
        ))}
      </div>

      {assignedCount < routes.length && (
        <div className="mt-5 bg-amber-50 border border-amber-200 rounded-2xl p-4 text-xs text-amber-700">
          有 {routes.length - assignedCount} 条路线还没分配司机，未出现在排单范围里。请先到「智能排班」分配。
        </div>
      )}
    </div>
  );
}

// ─── Tab: Agency WhatsApp messages ────────────────────────────────────────────

function AgencyTab({ routes, drivers, date, batchId, onBatchIdChange, toast }) {
  const [copied, setCopied] = useState(null);

  const agencies = useMemo(() => agenciesWithRoutes(routes, drivers), [routes, drivers]);
  const messages = useMemo(
    () => agencies
      .map(a => generateAgencyMessage(routes, drivers, a, { batchId, date }))
      .filter(Boolean),
    [agencies, routes, drivers, batchId, date]
  );

  const copyMsg = async (text, agency) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(agency);
      setTimeout(() => setCopied(null), 1800);
      toast(`已复制 ${agency} 群消息`);
    } catch { toast('复制失败，请手动选中', 'error'); }
  };

  return (
    <div>
      <div className="flex flex-wrap items-center gap-3 mb-5">
        <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">发货批次号</label>
        <input
          value={batchId}
          onChange={e => onBatchIdChange(e.target.value)}
          placeholder="OSUB-202606240442"
          className="px-4 py-2 rounded-xl border border-slate-200 text-sm font-mono focus:outline-none focus:border-orange-400 w-64"
        />
        <span className="text-xs text-slate-400 ml-auto">{messages.length} 个中介有路线</span>
      </div>

      <div className="bg-blue-50 border border-blue-100 rounded-2xl px-5 py-3 mb-5 text-xs text-blue-700">
        每个中介一条消息，告诉他们明天的固定线、批次号和件数。复制后粘到对应中介的 WhatsApp 群。
        中介回复改动（换车号/拆单/hold）后，回「智能排班」手动调整即可。
      </div>

      {messages.length === 0 ? (
        <div className="text-center py-16 text-slate-300">
          <p className="text-3xl mb-2">💬</p>
          <p className="text-slate-400">还没有分配给中介的路线</p>
        </div>
      ) : (
        <div className="space-y-4">
          {messages.map(m => (
            <div key={m.agencyName} className="bg-slate-800 rounded-2xl p-5">
              <div className="flex justify-between items-center mb-3">
                <p className={`text-xs font-black uppercase tracking-wider ${getGroupColor(m.agencyName).includes('text-white') ? 'text-white' : 'text-slate-200'}`}>
                  <span className={`inline-flex px-2.5 py-0.5 rounded-full border ${getGroupColor(m.agencyName)}`}>{m.agencyName}</span>
                  <span className="ml-2 text-slate-400 font-normal">{m.routeCount} 条 / {m.totalVol} 件</span>
                </p>
                <button
                  onClick={() => copyMsg(m.text, m.agencyName)}
                  className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${copied === m.agencyName ? 'bg-emerald-500 text-white' : 'bg-white text-slate-800 hover:bg-slate-100'}`}>
                  {copied === m.agencyName ? '✓ 已复制' : '复制'}
                </button>
              </div>
              <pre className="text-slate-100 text-xs leading-relaxed font-mono whitespace-pre-wrap select-all">{m.text}</pre>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Main App ─────────────────────────────────────────────────────────────────

const TABS = [
  { id: 'routes',    label: '今日路线', icon: '📦' },
  { id: 'dispatch',  label: '智能排班', icon: '⚡' },
  { id: 'allocation',label: '排单范围', icon: '🧮' },
  { id: 'agency',    label: '中介群发', icon: '💬' },
  { id: 'checkinout',label: 'Check In/Out', icon: '✅' },
  { id: 'report',    label: '报表', icon: '📋' },
  { id: 'drivers',   label: '司机管理', icon: '🚚' },
];

export default function App() {
  const todayStr = today();
  const [tab, setTab]       = useState('dispatch');
  const [date, setDate]     = useState(todayStr);
  const [drivers, setDrivers] = useState(() => loadDrivers());
  const [dayData, setDayData] = useState(() => loadDayData(todayStr));
  const [toast, setToast]   = useState(null);

  useEffect(() => {
    setDayData(loadDayData(date));
  }, [date]);

  const showToast = useCallback((message, type = 'success') => {
    setToast({ message, type });
  }, []);

  const updateRoutes = useCallback((routes) => {
    const next = { ...dayData, routes };
    saveDayData(date, next);
    setDayData(next);
  }, [dayData, date]);

  const updateBatchId = useCallback((batchId) => {
    const next = { ...dayData, batchId };
    saveDayData(date, next);
    setDayData(next);
  }, [dayData, date]);

  const updateDrivers = useCallback((newDrivers) => {
    saveDrivers(newDrivers);
    setDrivers(newDrivers);
  }, []);

  const prevDay = () => {
    const d = new Date(date + 'T12:00:00');
    d.setDate(d.getDate() - 1);
    setDate(d.toLocaleDateString('en-CA'));
  };
  const nextDay = () => {
    const d = new Date(date + 'T12:00:00');
    d.setDate(d.getDate() + 1);
    setDate(d.toLocaleDateString('en-CA'));
  };

  const routes = dayData.routes || [];
  const batchId = dayData.batchId || '';

  return (
    <div className="min-h-screen bg-slate-50">
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}

      {/* Header */}
      <header className="bg-white border-b border-slate-100 sticky top-0 z-40 shadow-sm">
        <div className="max-w-6xl mx-auto px-6 py-3 flex items-center gap-4">
          {/* Logo */}
          <div className="flex items-center gap-2 shrink-0">
            <div className="w-9 h-9 bg-orange-500 rounded-xl flex items-center justify-center text-white font-black text-lg shadow-lg shadow-orange-100">
              Y
            </div>
            <div>
              <h1 className="text-base font-black text-slate-800 leading-tight">YOW Smart Dispatch</h1>
              <p className="text-xs text-slate-400">智能排班系统 · 本地运行</p>
            </div>
          </div>

          {/* Date picker */}
          <div className="flex items-center gap-2 ml-4">
            <button onClick={prevDay} className="w-7 h-7 rounded-lg border border-slate-200 text-slate-400 hover:bg-slate-50 text-xs flex items-center justify-center">◀</button>
            <input type="date" value={date} onChange={e => setDate(e.target.value)}
              className="px-3 py-1.5 rounded-xl border border-slate-200 text-sm font-bold text-slate-700 focus:outline-none focus:border-orange-400 bg-white" />
            <button onClick={nextDay} className="w-7 h-7 rounded-lg border border-slate-200 text-slate-400 hover:bg-slate-50 text-xs flex items-center justify-center">▶</button>
            {date !== todayStr && (
              <button onClick={() => setDate(todayStr)}
                className="px-3 py-1.5 rounded-xl border border-orange-200 text-orange-600 text-xs font-bold hover:bg-orange-50">
                今天
              </button>
            )}
          </div>

          {/* Route count pill */}
          {routes.length > 0 && (
            <div className="flex items-center gap-2 ml-2">
              <span className="px-3 py-1 rounded-full text-xs font-bold bg-orange-100 text-orange-700 border border-orange-200">
                {routes.length} 条 / {routes.reduce((s, r) => s + r.orderVolume, 0).toLocaleString()} 件
              </span>
            </div>
          )}

          {/* Tab nav */}
          <div className="flex bg-slate-100 p-1 rounded-xl ml-auto">
            {TABS.map(t => (
              <button key={t.id} onClick={() => setTab(t.id)}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1
                  ${tab === t.id ? 'bg-white text-orange-600 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}>
                <span>{t.icon}</span>
                <span className="hidden sm:inline">{t.label}</span>
              </button>
            ))}
          </div>
        </div>
      </header>

      {/* Main content */}
      <main className="max-w-6xl mx-auto px-6 py-8">
        {tab === 'routes'     && <RoutesTab    routes={routes} onRoutesChange={updateRoutes} drivers={drivers} toast={showToast} />}
        {tab === 'dispatch'   && <DispatchTab  routes={routes} drivers={drivers} onRoutesChange={updateRoutes} date={date} toast={showToast} />}
        {tab === 'allocation' && <AllocationTab routes={routes} drivers={drivers} date={date} toast={showToast} />}
        {tab === 'agency'     && <AgencyTab     routes={routes} drivers={drivers} date={date} batchId={batchId} onBatchIdChange={updateBatchId} toast={showToast} />}
        {tab === 'checkinout' && <CheckInOutTab routes={routes} onRoutesChange={updateRoutes} drivers={drivers} toast={showToast} />}
        {tab === 'report'     && <ReportTab    routes={routes} drivers={drivers} date={date} toast={showToast} />}
        {tab === 'drivers'    && <DriversTab   drivers={drivers} onDriversChange={updateDrivers} toast={showToast} />}
      </main>
    </div>
  );
}
