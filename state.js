// =====================================================================
// state.js — estado global de la aplicación + storage seguro
// =====================================================================

// Storage con fallback en memoria si localStorage falla (incógnito, sandbox)
export const Storage = {
  _mem: {},
  get(key) {
    try {
      const v = localStorage.getItem(key);
      return v ? JSON.parse(v) : null;
    } catch (e) {
      return this._mem[key] || null;
    }
  },
  set(key, val) {
    try { localStorage.setItem(key, JSON.stringify(val)); }
    catch (e) { this._mem[key] = val; }
  },
  remove(key) {
    try { localStorage.removeItem(key); }
    catch (e) { delete this._mem[key]; }
  }
};

// Estado global (objeto reactivo plano; cambios disparan render() manualmente)
export const State = {
  config: Storage.get('config') || { url: '', anonKey: '' },
  user: Storage.get('user') || null,
  view: 'scan',
  modal: null,
  cache: {
    boxes: [],
    movements: [],
    users: [],
    articulos: [],
    posiciones: [],
    showConsumed: false,
    currentBox: null,
    currentArticleId: null,
    newBox: null,
    printCode: null
  },
  loading: false,
  scannerActive: false,
  searchQuery: '',
  adminTab: 'inicio',
  adminTiendaId: null
};

// Helper: ¿estamos en modo demo (sin Supabase)?
export const isDemoMode = () => !State.config.url || !State.config.anonKey;
