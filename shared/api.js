// Single RPC surface. Both the Express server and the in-browser engine
// dispatch through this map, so the API is identical on both builds.
import * as store from './store.js';

const METHODS = {
  getState: store.getState,
  setup: store.setup,
  updateSettings: store.updateSettings,
  listDishes: store.listDishes,
  getDish: store.getDish,
  createDish: store.createDish,
  updateDish: store.updateDish,
  logMeal: store.logMeal,
  updateMeal: store.updateMeal,
  deleteMeal: store.deleteMeal,
  getDay: store.getDay,
  getHistory: store.getHistory,
  saveCheckin: store.saveCheckin,
  deleteCheckin: store.deleteCheckin,
  listSymptoms: store.listSymptoms,
  addSymptom: store.addSymptom,
  setSymptomArchived: store.setSymptomArchived,
  importGrocery: store.importGrocery,
  groceryStats: store.groceryStats,
  getInsights: store.getInsights,
  createBundle: store.createBundle,
  previewBundle: store.previewBundle,
  applyBundle: store.applyBundle,
  getPeers: store.getPeers,
  exportBackup: store.exportBackup,
  importBackup: store.importBackup,
  resetAll: store.resetAll,
};

export function call(db, method, args = {}) {
  const fn = METHODS[method];
  if (!fn) throw new Error(`Unknown RPC method: ${method}`);
  return fn(db, args);
}

export const METHOD_NAMES = Object.keys(METHODS);
