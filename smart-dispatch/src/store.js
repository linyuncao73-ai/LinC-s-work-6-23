import { DEFAULT_DRIVERS } from './defaults.js';

const DRIVERS_KEY = 'yow_dispatch_drivers_v1';
const DAY_KEY = (date) => `yow_dispatch_day_${date}`;

export function loadDrivers() {
  try {
    const raw = localStorage.getItem(DRIVERS_KEY);
    if (raw) return JSON.parse(raw);
  } catch { /* ignore */ }
  return DEFAULT_DRIVERS;
}

export function saveDrivers(drivers) {
  localStorage.setItem(DRIVERS_KEY, JSON.stringify(drivers));
}

export function loadDayData(date) {
  try {
    const raw = localStorage.getItem(DAY_KEY(date));
    if (raw) return JSON.parse(raw);
  } catch { /* ignore */ }
  return { routes: [] };
}

export function saveDayData(date, data) {
  localStorage.setItem(DAY_KEY(date), JSON.stringify(data));
}

// Copy assignments (driver assignments only) from another date
export function copyAssignmentsFrom(srcDate) {
  try {
    const raw = localStorage.getItem(DAY_KEY(srcDate));
    if (!raw) return null;
    const data = JSON.parse(raw);
    // Return just the assignment map: routeKey → driverId
    const map = {};
    (data.routes || []).forEach(r => {
      if (r.driverId) map[r.routeKey] = r.driverId;
    });
    return map;
  } catch { return null; }
}

export function listSavedDates() {
  const dates = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key && key.startsWith('yow_dispatch_day_')) {
      dates.push(key.replace('yow_dispatch_day_', ''));
    }
  }
  return dates.sort().reverse();
}
