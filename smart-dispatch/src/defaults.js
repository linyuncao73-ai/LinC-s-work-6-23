// ─── Scan ID map (路线号 → 扫单号) ────────────────────────────────────────────
// Verified against the 2026-06-23 取货表 — all current.
export const SCAN_ID_MAP = {
  '33011': '8257', '33012': '8258', '33014': '8259', '33015': '8260',
  '33017': '8217', '33018': '8218', '33019': '8219', '33020': '8220',
  '33022': '8222', '33024': '8224', '33025': '8225', '33026': '8226',
  '33029': '8229', '33030': '8230', '33034': '8234', '33045': '8245',
  '33050': '8250', '33055': '8255',
};

// Faithful to the canonical types.ts ZONE_NAMES (their exact labels/spelling so
// reports match existing tools), plus sub-route keys the 取货表 actually uses.
export const ZONE_NAMES = {
  '33011': 'Kanata North',  '33011-1': 'Kanata N',   '33011-2': 'Kanata M',
  '33011-3': 'Kanata S',    '33011-4': 'Kanata M',   '33011-2-1': 'Kanata N',
  '33011-2-2': 'Kanata M',  '33011-4-1': 'Kanata N', '33011-4-2': 'Kanata M',
  '33012': 'Kanata South',  '33012-1': 'Stittsville','33012-2': 'Blackstone',
  '33012-3': 'Kanata S',    '33012-3-1': 'Stittsville','33012-3-2': 'Blackstone',
  '33012-3-3': 'Kanata S',
  '33014': 'Barrheaven',    '33014-1': 'Barrheaven E','33014-2': 'Stonebridge',
  '33014-3': 'Barrheaven W','33014-4': 'Barrheaven M','33014-5': 'Barrheaven M',
  '33014-3-1': 'Barrheaven E','33014-3-2': 'Barrheaven M','33014-3-3': 'Barrheaven W',
  '33014-4-1': 'Barrheaven E','33014-4-2': 'Stonebridge','33014-4-3': 'Barrheaven W',
  '33014-4-4': 'Barrheaven M',
  '33015': 'Riverside South & Manotick','33015-1': 'Old Barrheaven','33015-2': 'Riverside South',
  '33015-3': 'Hearts Desire','33015-2-1': 'Old Barrheaven','33015-2-2': 'Riverside South',
  '33015-3-1': 'Old Barrheaven','33015-3-2': 'Riverside South','33015-3-3': 'Hearts Desire',
  '33017': 'Orleans West',  '33017-1': 'Orleans W',  '33017-2': 'Chapel Hill',
  '33017-3': 'Orleans N',   '33017-4': 'Orleans M',  '33017-2-1': 'Orleans W',
  '33017-2-2': 'Orleans N', '33017-3-1': 'Orleans W','33017-3-2': 'Chapel Hill',
  '33017-3-3': 'Orleans N',
  '33018': 'Orleans East',  '33018-1': 'Orleans E',  '33018-2': 'Orleans M',
  '33018-2-1': 'Orleans E', '33018-2-2': 'Orleans M',
  '33019': 'Hull & Plateau','33019-1': 'Hull',       '33019-2': 'Plateau',
  '33019-3': 'Chelsea',     '33019-4': 'Aylmer W',   '33019-2-1': 'Hull',
  '33019-2-2': 'Plateau',   '33019-3-1': 'Hull',     '33019-3-2': 'Plateau',
  '33019-3-3': 'Chelsea',
  '33020': 'Aylmer',        '33020-1': 'Aylmer E',   '33020-2': 'Aylmer W',
  '33020-2-1': 'Aylmer E',  '33020-2-2': 'Aylmer W',
  '33022-1': 'Gatineau W',  '33022-2': 'Gatineau E', '33022-3': 'Gatineau M',
  '33022-4': 'Angers',      '33022-4-1': 'Gatineau W','33022-4-2': 'Gatineau E',
  '33022-4-3': 'Gatineau M','33022-4-4': 'Angers',
  '33024': 'Gloucester',    '33024-1': 'Gloucester',  '33024-2': 'Alta Vista',
  '33024-3': 'Alta Vista',  '33024-2-1': 'Gloucester','33024-2-2': 'Alta Vista',
  '33025': 'Vanier',        '33025-1': 'Vanier',     '33025-2': 'Rockcliffe',
  '33025-2-1': 'Vanier',    '33025-2-2': 'Rockcliffe',
  '33026-1': 'Sandyhill',   '33026-2': 'DT+CT',      '33026-3': 'Glebe+CT',
  '33026-3-1': 'Sandyhill', '33026-3-2': 'DT+CT',    '33026-3-3': 'Glebe+CT',
  '33029-1': 'Nepean E',    '33029-2': 'Nepean M',   '33029-3': 'Nepean N',
  '33029-3-1': 'Nepean E',  '33029-3-2': 'Nepean M', '33029-3-3': 'Nepean N',
  '33030': '',              '33030-1': 'Bayshore',    '33030-2': 'Nepean W',
  '33030-3': 'Britannia',   '33030-4': 'Westboro',   '33030-4-1': 'Bayshore',
  '33030-4-2': 'Nepean W',  '33030-4-3': 'Britannia', '33030-4-4': 'Westboro',
  '33034-1': 'Findlay',     '33034-2': 'Hunt Club',  '33034-3': 'Hunt Club M',
  '33034-3-1': 'Findlay',   '33034-3-2': 'Hunt Club','33034-3-3': 'Hunt Club M',
  '33045-1': 'Cornwall',    '33045-2': 'Brookville', '33045-3': 'Rockland',
  '33045-3-1': 'Cornwall',  '33045-3-2': 'Brookville','33045-3-3': 'Rockland',
  '33050-1': 'V-L-C',       '33050-2': 'Amprior',    '33050-3': 'Calton Place',
  '33050-3-1': 'V-L-C',     '33050-3-2': 'Amprior',  '33050-3-3': 'Calton Place',
  '33055-1': 'Renfrew',     '33055-2': 'Perth',      '33055-3': 'R-G',
  '33055-4': 'M-M-R-E',     '33055-4-1': 'Renfrew',  '33055-4-2': 'Perth',
  '33055-4-3': 'R-G',       '33055-4-4': 'M-M-R-E',
};

// 取货时间段 (per route base) — from canonical DEFAULT_TIME_SLOTS.
export const DEFAULT_TIME_SLOTS = {
  '33011': '06:00 AM', '33012': '06:00 AM', '33014': '06:00 AM', '33015': '06:00 AM',
  '33017': '06:00 AM', '33018': '06:00 AM', '33019': '06:00 AM', '33020': '06:00 AM',
  '33022': '08:00 AM', '33024': '08:00 AM', '33025': '08:00 AM', '33026': '06:00 AM',
  '33029': '08:00 AM', '33030': '06:00 AM', '33034': '06:00 AM', '33045': '06:00 AM',
  '33050': '06:00 AM', '33055': '06:00 AM',
};

export const ALLOWED_TIME_SLOTS = ['06:00 AM', '07:00 AM', '08:00 AM'];

// ─── Driver registry (司机号) ──────────────────────────────────────────────────
// Company drivers are tracked individually with hard daily capacities.
// Agencies are tracked as single capacity buckets for planning; the system
// distributes overflow to them and the agency handles internal van splits.
export const DEFAULT_DRIVERS = [
  // Company / Individual drivers — IDs, capacities & priority areas from e-binder.
  // Top performers (Fath/Sijiang/Hadi/Saleh) given a bumped default capacity.
  { id: '19492', name: 'Fath',      group: 'Company', maxCapacity: 350, isAgency: false, active: true, note: 'Nepean/Orleans/Barrhaven' },
  { id: '4574',  name: 'Sijiang',   group: 'Company', maxCapacity: 350, isAgency: false, active: true, note: '' },
  { id: '3261',  name: 'Sam',       group: 'Company', maxCapacity: 280, isAgency: false, active: true, note: 'live in Barrhaven' },
  { id: '13951', name: 'Wesam',     group: 'Company', maxCapacity: 300, isAgency: false, active: true, note: 'Orleans M / live in Kanata' },
  { id: '13454', name: 'Tajouri',   group: 'Company', maxCapacity: 300, isAgency: false, active: true, note: 'Kanata S · 高单量需提醒' },
  { id: '5528',  name: 'Ben',       group: 'Company', maxCapacity: 230, isAgency: false, active: true, note: 'Barrhaven' },
  { id: '6725',  name: 'Nabil',     group: 'Company', maxCapacity: 150, isAgency: false, active: true, note: 'Barrhaven' },
  { id: '12699', name: 'Shebani',   group: 'Company', maxCapacity: 250, isAgency: false, active: true, note: 'Orleans E / old Barrhaven first' },
  { id: '6074',  name: 'Yousouf',   group: 'Company', maxCapacity: 300, isAgency: false, active: true, note: '17-3 · Orleans/House area, no Barrhaven' },
  { id: '5267',  name: 'Julio',     group: 'Company', maxCapacity: 200, isAgency: false, active: true, note: 'Hull' },
  { id: '18844', name: 'Ismail',    group: 'Company', maxCapacity: 250, isAgency: false, active: true, note: 'house区 / plateau' },
  { id: '2566',  name: 'Chong',     group: 'Company', maxCapacity: 300, isAgency: false, active: true, note: 'Vanier' },
  { id: '18843', name: 'Saiki',     group: 'Company', maxCapacity: 300, isAgency: false, active: true, note: 'SH & DT' },
  { id: '16864', name: 'Pio',       group: 'Company', maxCapacity: 200, isAgency: false, active: true, note: 'Glebe' },
  { id: '6752',  name: 'Liban',     group: 'Company', maxCapacity: 300, isAgency: false, active: true, note: 'Bayshore' },
  { id: '5847',  name: 'Amin Abdi', group: 'Company', maxCapacity: 250, isAgency: false, active: true, note: 'Nepean W' },
  { id: '3978',  name: 'Saleh',     group: 'Company', maxCapacity: 350, isAgency: false, active: true, note: 'Findlay' },
  { id: '4030',  name: 'Hadi',      group: 'Company', maxCapacity: 280, isAgency: false, active: true, note: 'Hunt Club' },
  { id: '13952', name: 'Hamal',     group: 'Company', maxCapacity: 250, isAgency: false, active: true, note: 'flexible' },
  { id: '6087',  name: 'Jama',      group: 'Company', maxCapacity: 250, isAgency: false, active: true, note: '' },
  { id: '13955', name: 'Barkhad',   group: 'Company', maxCapacity: 250, isAgency: false, active: true, note: 'Hunt Club M' },
  { id: '2218',  name: 'Abdikader', group: 'Company', maxCapacity: 250, isAgency: false, active: true, note: '' },
  { id: '26133', name: 'Mostafa',   group: 'Company', maxCapacity: 250, isAgency: false, active: false, note: "Saleh's son · backup" },
  // Ex-Ammar agency — team dissolved 2026-06; these two became company drivers.
  { id: '13456', name: 'Ammar',     group: 'Company', maxCapacity: 250, isAgency: false, active: true, note: 'Riverside South' },
  { id: '12572', name: 'Nada',      group: 'Company', maxCapacity: 250, isAgency: false, active: true, note: 'Orleans / House area, no Barrhaven' },
  // Agency teams — maxCapacity = the hard ceiling each team can take on a 爆单
  // day. Their *typical* load at ~10,000 orders is in AGENCY_SHARE (used to
  // proportionally recommend overflow before anyone hits the ceiling).
  { id: 'Kaneza',  name: 'Kaneza',  group: 'Kaneza',  maxCapacity: 4500, isAgency: true, active: true },
  { id: 'Alain',   name: 'Alain',   group: 'Alain',   maxCapacity: 2750, isAgency: true, active: true },
  { id: 'Alawi',   name: 'Alawi',   group: 'Alawi',   maxCapacity: 2500, isAgency: true, active: true },
  { id: 'Parfait', name: 'Parfait', group: 'Parfait', maxCapacity: 2000, isAgency: true, active: true },
  { id: 'Chris',   name: 'Chris',   group: 'Chris',   maxCapacity: 1500, isAgency: true, active: true },
  { id: 'Massi',   name: 'Massi',   group: 'Massi',   maxCapacity: 800,  isAgency: true, active: true },
];

// Typical agency share at ~10,000 orders — drives the proportional overflow
// recommendation (Kaneza takes the most). Separate from maxCapacity (ceiling).
export const AGENCY_SHARE = {
  Kaneza: 2500, Alain: 1500, Parfait: 1000, Alawi: 1000, Chris: 900, Massi: 500,
};

// ─── Agency member ID → team name ─────────────────────────────────────────────
// Used to recognise individual agency driver IDs when importing real dispatch
// data (e.g. a 预派发规则 cell "1-226(18944)" resolves 18944 → Alain).
export const AGENCY_MEMBERS = {
  // Alain
  '18944':'Alain','19015':'Alain','18941':'Alain','18942':'Alain','19995':'Alain',
  '8230':'Alain','19994':'Alain','19016':'Alain','19017':'Alain','31703':'Alain',
  '19993':'Alain','19997':'Alain','18940':'Alain','32108':'Alain','18943':'Alain',
  '32097':'Alain','5001743':'Alain',
  // (Ammar agency dissolved 2026-06 — 13456 & 12572 are now Company drivers)
  // Alawi
  '15170':'Alawi','15169':'Alawi','13800':'Alawi','15167':'Alawi','15172':'Alawi',
  '15165':'Alawi','16169':'Alawi','15164':'Alawi','15168':'Alawi','15173':'Alawi',
  '15174':'Alawi','15166':'Alawi','15171':'Alawi',
  // Kaneza
  '20059':'Kaneza','4111':'Kaneza','7409':'Kaneza','12569':'Kaneza','2900':'Kaneza',
  '2528':'Kaneza','2778':'Kaneza','4186':'Kaneza','12589':'Kaneza','2633':'Kaneza',
  '20061':'Kaneza','19527':'Kaneza','18926':'Kaneza','3974':'Kaneza','7411':'Kaneza',
  '18925':'Kaneza','19524':'Kaneza','19525':'Kaneza','18922':'Kaneza','19523':'Kaneza',
  '19526':'Kaneza','20063':'Kaneza','12243':'Kaneza','3817':'Kaneza','20060':'Kaneza',
  '18924':'Kaneza','3262':'Kaneza',
  // Parfait
  '5002471':'Parfait','27881':'Parfait','29155':'Parfait','28704':'Parfait',
  '5002460':'Parfait','29804':'Parfait','27862':'Parfait','28708':'Parfait',
  // Massi
  '31988':'Massi','31990':'Massi','32089':'Massi',
  // Chris
  '30907':'Chris','20255':'Chris','19749':'Chris','19893':'Chris','30913':'Chris',
  '23613':'Chris','23606':'Chris','20135':'Chris',
};

// Resolve any driver ID to a registry key: company IDs stay as-is, agency
// member IDs map to their team bucket. Returns null if unknown.
export function resolveDriverId(rawId) {
  if (!rawId) return null;
  const id = String(rawId).trim();
  if (DEFAULT_DRIVERS.some(d => d.id === id)) return id;     // known company id or team
  if (AGENCY_MEMBERS[id]) return AGENCY_MEMBERS[id];          // agency member → team
  return null;
}

export const GROUP_COLORS = {
  Company: 'bg-slate-200 text-slate-900 border-slate-300',
  Alain:   'bg-blue-600 text-white border-blue-700',
  Ammar:   'bg-pink-600 text-white border-pink-700',
  Alawi:   'bg-fuchsia-100 text-fuchsia-900 border-fuchsia-200',
  Kaneza:  'bg-rose-100 text-rose-900 border-rose-200',
  Parfait: 'bg-purple-100 text-purple-900 border-purple-200',
  Massi:   'bg-cyan-100 text-cyan-900 border-cyan-200',
  Chris:   'bg-emerald-100 text-emerald-900 border-emerald-200',
};

export function getGroupColor(group) {
  return GROUP_COLORS[group] || 'bg-gray-100 text-gray-800 border-gray-200';
}

// ─── Sample data — real routes from the 2026-06-23 取货表 ──────────────────────
// 18 main routes broken into their actual sub-routes with real package counts.
export const SAMPLE_ROUTES = [
  { routeKey: '33011-2-1', routeBase: '33011', orderVolume: 308 },
  { routeKey: '33011-2-2', routeBase: '33011', orderVolume: 261 },
  { routeKey: '33012-3-1', routeBase: '33012', orderVolume: 194 },
  { routeKey: '33012-3-2', routeBase: '33012', orderVolume: 215 },
  { routeKey: '33012-3-3', routeBase: '33012', orderVolume: 204 },
  { routeKey: '33014-3-1', routeBase: '33014', orderVolume: 232 },
  { routeKey: '33014-3-2', routeBase: '33014', orderVolume: 206 },
  { routeKey: '33014-3-3', routeBase: '33014', orderVolume: 211 },
  { routeKey: '33015-2-1', routeBase: '33015', orderVolume: 345 },
  { routeKey: '33015-2-2', routeBase: '33015', orderVolume: 264 },
  { routeKey: '33017-2-1', routeBase: '33017', orderVolume: 326 },
  { routeKey: '33017-2-2', routeBase: '33017', orderVolume: 274 },
  { routeKey: '33018-2-1', routeBase: '33018', orderVolume: 274 },
  { routeKey: '33018-2-2', routeBase: '33018', orderVolume: 268 },
  { routeKey: '33019-2-1', routeBase: '33019', orderVolume: 315 },
  { routeKey: '33019-2-2', routeBase: '33019', orderVolume: 289 },
  { routeKey: '33020-2-1', routeBase: '33020', orderVolume: 326 },
  { routeKey: '33020-2-2', routeBase: '33020', orderVolume: 356 },
  { routeKey: '33022-4-1', routeBase: '33022', orderVolume: 341 },
  { routeKey: '33022-4-2', routeBase: '33022', orderVolume: 331 },
  { routeKey: '33022-4-3', routeBase: '33022', orderVolume: 344 },
  { routeKey: '33022-4-4', routeBase: '33022', orderVolume: 205 },
  { routeKey: '33024-2-1', routeBase: '33024', orderVolume: 313 },
  { routeKey: '33024-2-2', routeBase: '33024', orderVolume: 326 },
  { routeKey: '33025-2-1', routeBase: '33025', orderVolume: 291 },
  { routeKey: '33025-2-2', routeBase: '33025', orderVolume: 105 },
  { routeKey: '33026-3-1', routeBase: '33026', orderVolume: 191 },
  { routeKey: '33026-3-2', routeBase: '33026', orderVolume: 230 },
  { routeKey: '33026-3-3', routeBase: '33026', orderVolume: 269 },
  { routeKey: '33029-3-1', routeBase: '33029', orderVolume: 241 },
  { routeKey: '33029-3-2', routeBase: '33029', orderVolume: 236 },
  { routeKey: '33029-3-3', routeBase: '33029', orderVolume: 208 },
  { routeKey: '33030-4-1', routeBase: '33030', orderVolume: 188 },
  { routeKey: '33030-4-2', routeBase: '33030', orderVolume: 170 },
  { routeKey: '33030-4-3', routeBase: '33030', orderVolume: 155 },
  { routeKey: '33030-4-4', routeBase: '33030', orderVolume: 235 },
  { routeKey: '33034-3-1', routeBase: '33034', orderVolume: 297 },
  { routeKey: '33034-3-2', routeBase: '33034', orderVolume: 220 },
  { routeKey: '33034-3-3', routeBase: '33034', orderVolume: 219 },
  { routeKey: '33045-3-1', routeBase: '33045', orderVolume: 193 },
  { routeKey: '33045-3-2', routeBase: '33045', orderVolume: 57 },
  { routeKey: '33045-3-3', routeBase: '33045', orderVolume: 198 },
  { routeKey: '33050-3-1', routeBase: '33050', orderVolume: 331 },
  { routeKey: '33050-3-2', routeBase: '33050', orderVolume: 203 },
  { routeKey: '33050-3-3', routeBase: '33050', orderVolume: 176 },
  { routeKey: '33055-4-1', routeBase: '33055', orderVolume: 33 },
  { routeKey: '33055-4-2', routeBase: '33055', orderVolume: 34 },
  { routeKey: '33055-4-3', routeBase: '33055', orderVolume: 46 },
  { routeKey: '33055-4-4', routeBase: '33055', orderVolume: 32 },
];

// ─── Default driver assignments (司机号) ───────────────────────────────────────
// Typical sub-route → driver mapping derived from the route pre-distribution
// panel. Agency members are resolved to their team bucket. Loading the sample
// pre-fills these so the board shows a realistic starting point.
export const DEFAULT_ASSIGNMENTS = {
  '33011-2-1': '19492', '33011-2-2': '4574',
  '33012-3-1': '3261',  '33012-3-2': '13951', '33012-3-3': '13454',
  '33014-3-1': '5528',  '33014-3-2': '6725',  '33014-3-3': '13952',
  '33015-2-1': '12699', '33015-2-2': '13456',
  '33017-2-1': '12572', '33017-2-2': '6074',
  '33018-2-1': 'Alawi', '33018-2-2': 'Parfait',
  '33019-2-1': '5267',  '33019-2-2': '18844',
  '33020-2-1': 'Alawi', '33020-2-2': 'Chris',
  '33022-4-1': 'Kaneza','33022-4-2': 'Kaneza','33022-4-3': 'Kaneza','33022-4-4': 'Kaneza',
  '33024-2-1': 'Kaneza','33024-2-2': 'Kaneza',
  '33025-2-1': '2566',  '33025-2-2': 'Parfait',
  '33026-3-1': 'Kaneza','33026-3-2': '18843', '33026-3-3': '16864',
  '33029-3-1': 'Alain', '33029-3-2': 'Alain', '33029-3-3': 'Alain',
  '33030-4-1': '6752',  '33030-4-2': '5847',  '33030-4-3': 'Alain', '33030-4-4': 'Parfait',
  '33034-3-1': '3978',  '33034-3-2': '4030',  '33034-3-3': '13955',
  '33045-3-1': 'Kaneza','33045-3-2': 'Alain', '33045-3-3': 'Kaneza',
  '33050-3-1': 'Kaneza','33050-3-2': 'Chris', '33050-3-3': 'Alawi',
  '33055-4-1': 'Chris', '33055-4-2': 'Alawi', '33055-4-3': 'Alain', '33055-4-4': 'Alain',
};

// ─── Default agency van per fixed line ────────────────────────────────────────
// DEFAULT_ASSIGNMENTS maps agency lines to a team bucket (for capacity planning);
// this map holds the specific default van ID each agency runs on that line, used
// to generate the WhatsApp message sent to the agency. The agency may reply with
// changes (different van / split), which are applied on top.
export const FIXED_AGENCY_VAN = {
  '33018-2-1': '15165', '33018-2-2': '29155',
  '33020-2-1': '15165', '33020-2-2': '30907',
  '33022-4-1': '20059', '33022-4-2': '4111', '33022-4-3': '7409', '33022-4-4': '12569',
  '33024-2-1': '2900',  '33024-2-2': '2778',
  '33025-2-2': '29155',
  '33026-3-1': '2778',
  '33029-3-1': '18944', '33029-3-2': '19015', '33029-3-3': '19995',
  '33030-4-3': '18944', '33030-4-4': '28704',
  '33045-3-1': '4186',  '33045-3-2': '8230',  '33045-3-3': '12589',
  '33050-3-1': '2633',  '33050-3-2': '20255', '33050-3-3': '13800',
  '33055-4-1': '20255', '33055-4-2': '15167', '33055-4-3': '18942', '33055-4-4': '18942',
};

// Agency-facing route key: "33022-4-1" → "33022-1" (drop the split-count segment).
export function agencyRouteKey(routeKey) {
  const parts = routeKey.split('-');
  if (parts.length >= 3) return `${parts[0]}-${parts[parts.length - 1]}`;
  return routeKey;
}
