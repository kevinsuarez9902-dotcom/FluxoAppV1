// Único acceso a la persistencia financiera de Fluxo.
// La API conserva los datos y claves existentes para no requerir migraciones.
const FinanceStorage = (() => {
  const keys = Object.freeze({
    overrides: 'turnos_ov2', expenses: 'turnos_exp', monthExpenses: 'turnos_exp_m',
    discounts: 'turnos_disc', discountMonths: 'turnos_disc_m', accumBalances: 'turnos_accum',
    incomes: 'turnos_inc', monthIncomes: 'turnos_inc_m', debts: 'turnos_debts',
    savings: 'turnos_savings', savingsEvents: 'turnos_savings_events',
    savingsSpent: 'turnos_savings_spent', controlStart: 'turnos_control_start',
    schedule: 'turnos_schedule', salary: 'turnos_salary', monthExtras: 'turnos_extras'
  });

  const defaults = Object.freeze({
    overrides: {}, expenses: [], monthExpenses: {}, discounts: [], discountMonths: {},
    accumBalances: {}, incomes: [], monthIncomes: {}, debts: [], savings: [],
    savingsEvents: [], savingsSpent: [], controlStart: null, schedule: null,
    salary: null, monthExtras: {}
  });

  function get(key, fallback = null) {
    try {
      const value = localStorage.getItem(key);
      return value === null ? fallback : JSON.parse(value);
    } catch (error) {
      console.error(`No se pudo leer la clave de almacenamiento: ${key}`, error);
      return fallback;
    }
  }

  function set(key, value) { localStorage.setItem(key, JSON.stringify(value)); }

  function loadAppState() {
    return Object.keys(keys).reduce((state, name) => {
      state[name] = get(keys[name], defaults[name]);
      return state;
    }, {});
  }

  function saveAppValue(name, value) {
    if (!Object.prototype.hasOwnProperty.call(keys, name)) {
      throw new Error(`Clave financiera desconocida: ${name}`);
    }
    set(keys[name], value);
  }

  function migrateStartDates(state, today) {
    ['debts', 'savings'].forEach(name => {
      const records = state[name];
      if (!Array.isArray(records)) return;
      let changed = false;
      records.forEach(record => {
        if (record.startY == null) {
          record.startY = today.getFullYear();
          record.startM = today.getMonth();
          changed = true;
        }
      });
      if (changed) saveAppValue(name, records);
    });
  }

  // Lista las claves presentes en localStorage (para diagnóstico/inspección).
  function allKeys() {
    const result = [];
    for (let i = 0; i < localStorage.length; i++) {
      result.push(localStorage.key(i));
    }
    return result;
  }

  return {
    keys, get, set,
    remove: key => localStorage.removeItem(key),
    exists: key => localStorage.getItem(key) !== null,
    clear: () => localStorage.clear(),
    getRaw: key => localStorage.getItem(key),
    setRaw: (key, value) => localStorage.setItem(key, value),
    loadAppState, saveAppValue, migrateStartDates, allKeys
  };
})();
