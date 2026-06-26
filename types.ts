export interface RouteData {
  id: string;
  driver: string;
  driverId?: string;
  driverName?: string;
  driverGroup?: string;
  routeNum: string;
  routeLocation: string;
  timeSlot: string;
  orderVolume: number;
  scanId: string;
  isSplit?: boolean;
  parentId?: string;
  isHold?: boolean;
  isDriverOff?: boolean;
  capacityStatus?: 'ok' | 'warn' | 'split-recommended';
  capacityExcess?: number;
}

export interface AgencyGroup {
  name: string;
  routes: RouteData[];
}

export const AGENCIES = ['Alain', 'Alawi', 'Kaneza', 'Parfait', 'Massi', 'Chris'];

export interface BatchInfo {
  date: string;
  batchId: string;
  totalVolume?: number;
}

export const SCAN_ID_MAP: Record<string, string> = {
  '33011': '8257', '33012': '8258', '33014': '8259', '33015': '8260', '33017': '8217', 
  '33018': '8218', '33019': '8219', '33020': '8220', '33022': '8222', '33024': '8224', 
  '33025': '8225', '33026': '8226', '33029': '8229', '33030': '8230', '33034': '8234',
  '33045': '8245', '33050': '8250', '33055': '8255',
};

export const DEFAULT_TIME_SLOTS: Record<string, string> = {
  '33011': '06:00 AM',
  '33012': '06:00 AM',
  '33014': '06:00 AM',
  '33015': '06:00 AM',
  '33017': '06:00 AM',
  '33018': '06:00 AM',
  '33019': '06:00 AM',
  '33020': '06:00 AM',
  '33022': '08:00 AM',
  '33024': '08:00 AM',
  '33025': '08:00 AM',
  '33026': '06:00 AM',
  '33029': '08:00 AM',
  '33030': '06:00 AM',
  '33034': '06:00 AM',
  '33045': '06:00 AM',
  '33050': '06:00 AM',
  '33055': '06:00 AM',
};

export const DEFAULT_SPLIT_COUNTS: Record<string, number> = {
  '33011': 2,
  '33012': 3,
  '33014': 4,
  '33015': 3,
  '33017': 3,
  '33018': 2,
  '33019': 3,
  '33020': 2,
  '33022': 4,
  '33024': 2,
  '33025': 2,
  '33026': 3,
  '33029': 3,
  '33030': 4,
  '33034': 3,
  '33045': 3,
  '33050': 3,
  '33055': 4,
};

export const ZONE_NAMES: Record<string, string> = {
  // 33011
  '33011': 'Kanata North',
  '33011-2-1': 'Kanata N',
  '33011-2-2': 'Kanata M',
  '33011-1': 'Kanata N',
  '33011-2': 'Kanata M',
  '33011-3': 'Kanata S',
  '33011-4': 'Kanata M',

  // 33012
  '33012': 'Kanata South',
  '33012-3-1': 'Stittsville',
  '33012-3-2': 'Blackstone',
  '33012-3-3': 'Kanata S',
  '33012-1': 'Stittsville',
  '33012-2': 'Blackstone',
  '33012-3': 'Kanata S',

  // 33014
  '33014': 'Barrheaven',
  '33014-3-1': 'Barrheaven E',
  '33014-3-2': 'Barrheaven M',
  '33014-3-3': 'Barrheaven W',
  '33014-4-1': 'Barrheaven E',
  '33014-4-2': 'Stonebridge',
  '33014-4-3': 'Barrheaven W',
  '33014-4-4': 'Barrheaven M',
  '33014-1': 'Barrheaven E',
  '33014-2': 'Stonebridge',
  '33014-3': 'Barrheaven W',
  '33014-4': 'Barrheaven M',
  '33014-5': 'Barrheaven M',

  // 33015
  '33015': 'Riverside South & Manotick',
  '33015-2-1': 'Old Barrheaven',
  '33015-2-2': 'Riverside South',
  '33015-3-1': 'Old Barrheaven',
  '33015-3-2': 'Riverside South',
  '33015-3-3': 'Hearts Desire',
  '33015-1': 'Old Barrheaven',
  '33015-2': 'Riverside South',
  '33015-3': 'Hearts Desire',

  // 33017
  '33017': 'Orleans West',
  '33017-2-1': 'Orleans W',
  '33017-2-2': 'Orleans N',
  '33017-3-1': 'Orleans W',
  '33017-3-2': 'Chapel Hill',
  '33017-3-3': 'Orleans N',
  '33017-1': 'Orleans W',
  '33017-2': 'Chapel Hill',
  '33017-3': 'Orleans N',
  '33017-4': 'Orleans M',

  // 33018
  '33018': 'Orleans East',
  '33018-2-1': 'Orleans E',
  '33018-2-2': 'Orleans M',
  '33018-1': 'Orleans E',
  '33018-2': 'Orleans M',

  // 33019
  '33019': 'Hull & Plateau',
  '33019-2-1': 'Hull',
  '33019-2-2': 'Plateau',
  '33019-3-1': 'Hull',
  '33019-3-2': 'Plateau',
  '33019-3-3': 'Chelsea',
  '33019-1': 'Hull',
  '33019-2': 'Plateau',
  '33019-3': 'Chelsea',
  '33019-4': 'Aylmer W',

  // 33020
  '33020': 'Aylmer',
  '33020-2-1': 'Aylmer E',
  '33020-2-2': 'Aylmer W',
  '33020-1': 'Aylmer E',
  '33020-2': 'Aylmer W',

  // 33022
  '33022-1': 'Gatineau W',
  '33022-2': 'Gatineau E',
  '33022-3': 'Gatineau M',
  '33022-4': 'Angers',

  // 33024
  '33024': 'Gloucester',
  '33024-2-1': 'Gloucester',
  '33024-2-2': 'Alta Vista',
  '33024-1': 'Gloucester',
  '33024-2': 'Alta Vista',
  '33024-3': 'Alta Vista',

  // 33025
  '33025': 'Vanier',
  '33025-2-1': 'Vanier',
  '33025-2-2': 'Rockcliffe',
  '33025-1': 'Vanier',
  '33025-2': 'Rockcliffe',

  // 33026
  '33026-1': 'Sandyhill',
  '33026-2': 'DT+CT',
  '33026-3': 'Glebe+CT',

  // 33029
  '33029-1': 'Nepean E',
  '33029-2': 'Nepean M',
  '33029-3': 'Nepean N',

  // 33030
  '33030': '',
  '33030-4-1': 'Bayshore',
  '33030-4-2': 'Nepean W',
  '33030-4-3': 'Britannia',
  '33030-4-4': 'Westboro',
  '33030-1': 'Bayshore',
  '33030-2': 'Nepean W',
  '33030-3': 'Britannia',
  '33030-4': 'Westboro',

  // 33034
  '33034-1': 'Findlay',
  '33034-2': 'Hunt Club',
  '33034-3': 'Hunt Club M',

  // 33045
  '33045-1': 'Cornwall',
  '33045-2': 'V-L-C',
  '33045-3': 'Rockland',

  // 33050
  '33050-1': 'Brookville',
  '33050-2': 'Amprior',
  '33050-3': 'Calton Place',

  // 33055
  '33055-1': 'Renfrew',
  '33055-2': 'Perth',
  '33055-3': 'R-G',
  '33055-4': 'M-M-R-E',
};

export interface DriverRegistryEntry {
  name: string;
  group: string;
  maxCapacity?: number;
}

export interface DriverRegistry {
  [id: string]: DriverRegistryEntry;
}

export const ALLOWED_TIME_SLOTS = ['06:00 AM', '07:00 AM', '08:00 AM'];

export const DRIVER_MAX_CAPACITIES: Record<string, number> = {
  '19492': 300,
  '4574':  300,
  '3261':  280,
  '13951': 300,
  '13454': 300,
  '5528':  230,
  '6725':  150,
  '12699': 250,
  '12572': 250,
  '13456': 250,
  '6074':  300,
  '5267':  200,
  '18844': 250,
  '2566':  300,
  '18843': 300,
  '16864': 200,
  '6752':  300,
  '5847':  250,
  '3978':  300,
  '4030':  220,
};

function buildInitialRegistry(): DriverRegistry {
  const base: DriverRegistry = {
    // Company / Individual
    '19492': { name: 'Fath', group: 'Company' },
    '4574': { name: 'Sijiang', group: 'Company' },
    '12699': { name: 'Shebani', group: 'Company' },
    '5528': { name: 'Ben', group: 'Company' },
    '6725': { name: 'Nabil', group: 'Company' },
    '13952': { name: 'Hamal', group: 'Company' },
    '6087': { name: 'Jama', group: 'Company' },
    '13951': { name: 'Wesam', group: 'Company' },
    '5267': { name: 'Julio', group: 'Company' },
    '2566': { name: 'Chong', group: 'Company' },
    '18843': { name: 'Saiki', group: 'Company' },
    '16864': { name: 'Pio', group: 'Company' },
    '6752': { name: 'Liban', group: 'Company' },
    '5847': { name: 'Amin Abdi', group: 'Company' },
    '4030': { name: 'Hadi', group: 'Company' },
    '13955': { name: 'Barkhad', group: 'Company' },
    '3261': { name: 'Sam', group: 'Company' },
    '3978': { name: 'Saleh', group: 'Company' },
    '2218': { name: 'Abdikader', group: 'Company' },
    '18844': { name: 'Ismail', group: 'Company' },
    '6074': { name: 'Yousouf', group: 'Company' },
    '13454': { name: 'Tajouri', group: 'Company' },
  // Alain
  '18944': { name: 'Alain Team', group: 'Alain' },
  '19015': { name: 'Alain Team', group: 'Alain' },
  '18941': { name: 'Alain Team', group: 'Alain' },
  '18942': { name: 'Alain Team', group: 'Alain' },
  '19995': { name: 'Alain Team', group: 'Alain' },
  '8230': { name: 'Alain Team', group: 'Alain' },
  '19994': { name: 'Alain Team', group: 'Alain' },
  '19016': { name: 'Alain Team', group: 'Alain' },
  '19017': { name: 'Alain Team', group: 'Alain' },
  '31703': { name: 'Alain Team', group: 'Alain' },
  '19993': { name: 'Alain Team', group: 'Alain' },
  '19997': { name: 'Alain Team', group: 'Alain' },
  '18940': { name: 'Alain Team', group: 'Alain' },
  '32108': { name: 'Alain Team', group: 'Alain' },
  '18943': { name: 'Alain Team', group: 'Alain' },
  // Ammar agency dissolved 2026-06 — Ammar (13456) & Nada (12572) are now Company drivers
  '13456': { name: 'Ammar', group: 'Company' },
  '12572': { name: 'Nada', group: 'Company' },
  // Alawi
  '15170': { name: 'Alawi Team', group: 'Alawi' },
  '15169': { name: 'Alawi Team', group: 'Alawi' },
  '13800': { name: 'Alawi Team', group: 'Alawi' },
  '15167': { name: 'Alawi Team', group: 'Alawi' },
  '15172': { name: 'Alawi Team', group: 'Alawi' },
  '15165': { name: 'Alawi Team', group: 'Alawi' },
  '16169': { name: 'Alawi Team', group: 'Alawi' },
  '15164': { name: 'Alawi Team', group: 'Alawi' },
  '15168': { name: 'Alawi Team', group: 'Alawi' },
  '15173': { name: 'Alawi Team', group: 'Alawi' },
  '15174': { name: 'Alawi Team', group: 'Alawi' },
  '15166': { name: 'Alawi Team', group: 'Alawi' },
  // Kaneza
  '20059': { name: 'Kaneza Team', group: 'Kaneza' },
  '4111': { name: 'Kaneza Team', group: 'Kaneza' },
  '7409': { name: 'Kaneza Team', group: 'Kaneza' },
  '12569': { name: 'Kaneza Team', group: 'Kaneza' },
  '2900': { name: 'Kaneza Team', group: 'Kaneza' },
  '2528': { name: 'Kaneza Team', group: 'Kaneza' },
  '2778': { name: 'Kaneza Team', group: 'Kaneza' },
  '4186': { name: 'Kaneza Team', group: 'Kaneza' },
  '12589': { name: 'Kaneza Team', group: 'Kaneza' },
  '2633': { name: 'Kaneza Team', group: 'Kaneza' },
  '20061': { name: 'Kaneza Team', group: 'Kaneza' },
  '19527': { name: 'Kaneza Team', group: 'Kaneza' },
  '18926': { name: 'Kaneza Team', group: 'Kaneza' },
  '3974': { name: 'Kaneza Team', group: 'Kaneza' },
  '7411': { name: 'Kaneza Team', group: 'Kaneza' },
  '18925': { name: 'Kaneza Team', group: 'Kaneza' },
  '19524': { name: 'Kaneza Team', group: 'Kaneza' },
  '19525': { name: 'Kaneza Team', group: 'Kaneza' },
  '18922': { name: 'Kaneza Team', group: 'Kaneza' },
  '19523': { name: 'Kaneza Team', group: 'Kaneza' },
  '19526': { name: 'Kaneza Team', group: 'Kaneza' },
  '20063': { name: 'Kaneza Team', group: 'Kaneza' },
  '12243': { name: 'Kaneza Team', group: 'Kaneza' },
  '3817': { name: 'Kaneza Team', group: 'Kaneza' },
  '20060': { name: 'Kaneza Team', group: 'Kaneza' },
  // Parfait
  '5002471': { name: 'Parfait Team', group: 'Parfait' },
  '27881': { name: 'Parfait Team', group: 'Parfait' },
  '29155': { name: 'Parfait Team', group: 'Parfait' },
  '28704': { name: 'Parfait Team', group: 'Parfait' },
  '5002460': { name: 'Parfait Team', group: 'Parfait' },
  '29804': { name: 'Parfait Team', group: 'Parfait' },
  // Massi
  '31988': { name: 'Massi Team', group: 'Massi' },
  '31990': { name: 'Massi Team', group: 'Massi' },
  '32089': { name: 'Massi Team', group: 'Massi' },
  // Chris
  '30907': { name: 'Chris Team', group: 'Chris' },
  '20255': { name: 'Chris Team', group: 'Chris' },
  '19749': { name: 'Chris Team', group: 'Chris' },
  '19893': { name: 'Chris Team', group: 'Chris' },
  '30913': { name: 'Chris Team', group: 'Chris' },
  '23613': { name: 'Chris Team', group: 'Chris' },
  };
  for (const [id, cap] of Object.entries(DRIVER_MAX_CAPACITIES)) {
    if (base[id]) base[id] = { ...base[id], maxCapacity: cap };
  }
  return base;
}

export const INITIAL_DRIVER_REGISTRY: DriverRegistry = buildInitialRegistry();

export const PLACEHOLDER_MAPPING: Record<string, string> = {
  // 33011 placeholders
  '33011-2-1': '19492',
  '33011-2-2': '4574',
  '33011-3-1': '19492', 
  '33011-3-2': '4574', 
  '33011-3-3': '13454',
  '33011-4-1': '19492', 
  '33011-4-2': '4574', 
  '33011-4-3': '13454', 
  '33011-4-4': '15169',
  
  // 33012 placeholders
  '33012-3-1': '3261',
  '33012-3-2': '13951',
  '33012-3-3': '13454',

  // 33014 placeholders
  '33014-3-1': '5528',
  '33014-3-2': '6725',
  '33014-3-3': '13952',
  '33014-4-1': '5528',
  '33014-4-2': '6725',
  '33014-4-3': '13952',
  '33014-4-4': '27862',
  '33014-5-1': '12699', '33014-5-2': '5528', '33014-5-3': '13456', '33014-5-4': '6725', '33014-5-5': '13952',
  
  // 33015 placeholders
  '33015-2-1': '12699',
  '33015-2-2': '13456',
  '33015-3-1': '12699',
  '33015-3-2': '13456',
  '33015-3-3': '18944',

  // 33017 placeholders
  '33017-2-1': '12572',
  '33017-2-2': '6074',
  '33017-3-1': '12572',
  '33017-3-2': '19749',
  '33017-3-3': '6074',
  '33017-4-1': '12572', 
  '33017-4-2': '3261', 
  '33017-4-3': '6074', 
  '33017-4-4': '13951',
  
  // 33018 placeholders
  '33018-2-1': '15165',
  '33018-2-2': '29155',

  // 33019 placeholders
  '33019-2-1': '5267',
  '33019-2-2': '18844',
  '33019-3-1': '5267',
  '33019-3-2': '18844',
  '33019-3-3': '15165',
  '33019-4-1': '5267', 
  '33019-4-2': '18844', 
  '33019-4-3': '15167', 
  '33019-4-4': '30907',
  
  // 33020 placeholders
  '33020-2-1': '15165',
  '33020-2-2': '30907',

  // 33022 placeholders
  '33022-4-1': '20059', '33022-4-2': '4111', '33022-4-3': '7409', '33022-4-4': '12569',
  
  // 33024 placeholders
  '33024-2-1': '2900',
  '33024-2-2': '2778',

  // 33025 placeholders
  '33025-2-1': '2566',
  '33025-2-2': '29155',

  // Other placeholders
  '33024-3-1': '2566', '33024-3-2': '2900', '33024-3-3': '2528',
  '33026-3-1': '2778', '33026-3-2': '18843', '33026-3-3': '16864',
  '33029-3-1': '18944', '33029-3-2': '19015', '33029-3-3': '19995',
  '33030-3-1': '6752', '33030-3-2': '5847', '33030-3-3': '28704',
  '33030-4-1': '6752', '33030-4-2': '5847', '33030-4-3': '18944', '33030-4-4': '2218',
  '33034-3-1': '3978', '33034-3-2': '4030', '33034-3-3': '13955',
  '33045-3-1': '4186', '33045-3-2': '2633', '33045-3-3': '3974',
  '33050-3-1': '19015', '33050-3-2': '30913', '33050-3-3': '15171',
  '33055-4-1': '20255', '33055-4-2': '15167', '33055-4-3': '18942', '33055-4-4': '18942',
};

export function getMechanismForDate(dateStr: string): 1 | 2 {
  let d: Date;
  if (!dateStr) {
    d = new Date();
  } else {
    const normalized = dateStr.replace(/[-.]/g, '/');
    d = new Date(normalized);
    if (isNaN(d.getTime())) {
      d = new Date();
    }
  }

  const day = d.getDay();
  const diffToMonday = day === 0 ? -6 : 1 - day;
  const mondayDate = new Date(d);
  mondayDate.setDate(d.getDate() + diffToMonday);
  mondayDate.setHours(0, 0, 0, 0);

  const baseMonday = new Date(2026, 4, 18); // May is index 4
  
  const msDiff = mondayDate.getTime() - baseMonday.getTime();
  const daysDiff = Math.round(msDiff / (1000 * 60 * 60 * 24));
  const weeksDiff = Math.round(daysDiff / 7);

  const absWeeks = Math.abs(weeksDiff);
  
  return (absWeeks % 2 === 0) ? 2 : 1;
}

export function getDefaultTimeSlot(baseRoute: string, dateStr: string): string {
  return DEFAULT_TIME_SLOTS[baseRoute] || '08:00 AM';
}

export function getOttawaTodayDateString(): string {
  const d = new Date();
  try {
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/Toronto',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    });
    const parts = formatter.formatToParts(d);
    const month = parts.find(p => p.type === 'month')?.value || '';
    const day = parts.find(p => p.type === 'day')?.value || '';
    const year = parts.find(p => p.type === 'year')?.value || '';
    return `${month}/${day}/${year}`;
  } catch (e) {
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    const year = d.getFullYear();
    return `${month}/${day}/${year}`;
  }
}

// E-Binder types and helpers

export interface EbinderDriverRow {
  driverId: string;
  driverName: string;
  maxCapacity: number | null;
  offDates: string[];
}

export interface EbinderData {
  weekDates: string[];
  drivers: EbinderDriverRow[];
  parsedAt: number;
}

export function ebinderDateMatchesBatchDate(ebDate: string, batchDate: string): boolean {
  const normalized = ebDate.replace('.', '-');
  const parts = normalized.split('-');
  const m = parseInt(parts[0]);
  const d = parseInt(parts[1]);
  const bParts = batchDate.split('/');
  return m === parseInt(bParts[0]) && d === parseInt(bParts[1]);
}

export function getOffDriverIds(ebinder: EbinderData, batchDate: string): Set<string> {
  const offSet = new Set<string>();
  for (const d of ebinder.drivers) {
    if (d.offDates.some(od => ebinderDateMatchesBatchDate(od, batchDate))) {
      offSet.add(d.driverId);
    }
  }
  return offSet;
}
