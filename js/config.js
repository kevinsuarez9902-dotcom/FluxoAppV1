// ═══════════════════════════════════════════════════════
// CONFIGURATION — edita aquí tu tarifa, ciclo y fecha de inicio
// ═══════════════════════════════════════════════════════

const START = new Date(2026, 4, 12); // Fecha de inicio del ciclo (año, mes-1, día)
const CYCLE = ['DÍA', 'DÍA', 'NOCHE', 'NOCHE', 'DESCANSO', 'DESCANSO'];
const RATE  = 30937;  // Valor por hora ($)
const HOURS = 12;     // Horas por turno
const PSHIFT = RATE * HOURS; // Valor de un turno completo

const INCAP_RATE = 26670; // Valor por defecto de un día de incapacidad

// ── Nombres ──────────────────────────────────────────────
const MONTHS = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
const WDAYS  = ['Dom','Lun','Mar','Mié','Jue','Vie','Sáb'];
const WFULL  = ['Domingo','Lunes','Martes','Miércoles','Jueves','Viernes','Sábado'];

// ── Estilos visuales por tipo de turno ───────────────────
const SHIFTS = {
  'DÍA':      { bg: '#FFF3CD', color: '#8B6914', border: '#F0C040', icon: '☀️',  label: 'Día' },
  'NOCHE':    { bg: '#1a1a2e', color: '#A78BFA', border: '#5B21B6', icon: '🌙',  label: 'Noche' },
  'DESCANSO': { bg: '#DCFCE7', color: '#166534', border: '#4ADE80', icon: '😴',  label: 'Descanso' },
  'AUSENTE':  { bg: '#2d0a0a', color: '#f87171', border: '#7f1d1d', icon: '🚫',  label: 'Ausente' },
  'PARCIAL':  { bg: '#1c1200', color: '#fbbf24', border: '#d97706', icon: '⏱️',  label: 'Parcial' },
  'INCAP':    { bg: '#082f49', color: '#7dd3fc', border: '#0891b2', icon: '🏥',  label: 'Incapacidad' },
};

// ── Claves de localStorage ────────────────────────────────
// Las claves y los valores predeterminados viven en FinanceStorage.

// ── Estado global ─────────────────────────────────────────
const today = new Date(); today.setHours(0, 0, 0, 0);
let Y = today.getFullYear();
let M = today.getMonth();
let selKey = null;

// ── Datos persistidos ─────────────────────────────────────
const storedState = FinanceStorage.loadAppState();
let overrides      = storedState.overrides;
let expenses       = storedState.expenses;
let monthExpenses  = storedState.monthExpenses;
let discounts      = storedState.discounts;
let discountMonths = storedState.discountMonths;
let accumBalances  = storedState.accumBalances;
let incomes        = storedState.incomes;
let monthIncomes   = storedState.monthIncomes;
let debts          = storedState.debts;
let savings        = storedState.savings;
let savingsEvents  = storedState.savingsEvents;
let savingsSpent   = storedState.savingsSpent;

// Mes de inicio de control (null = sin restricción)
let controlStart   = storedState.controlStart;

// Configuración de turno y sueldo
// schedule = {
//   type: 'cycle' | 'rotating' | 'office',
//   -- cycle/rotating --
//   shiftTypes: [{ id, name, hours, icon, color }],
//   cycle: ['id1','id2',...],
//   startDate: 'YYYY-MM-DD',
//   -- office --
//   officeDays: { 1:8, 2:8, 3:8, 4:8, 5:8, 6:4 }, // 0=dom..6=sab, value=hours
// }
let schedule = storedState.schedule;

// Configuración de sueldo
// salary = {
//   type: 'hourly' | 'fixed',
//   -- hourly --
//   baseRate: 30937,         // tarifa base por hora
//   shiftRates: {            // tarifa por tipo de turno (cycle/rotating)
//     'st_id': { mode: 'fixed'|'pct', value: 13000 | 35 }
//   },
//   -- fixed --
//   fixedType: 'monthly' | 'quincenal',
//   fixedAmount: 3000000,    // monto fijo (mensual o por quincena)
// }
let salary = storedState.salary;

// Extras del mes { 'YYYY-MM': [{ id, type, qty, unitValue, desc }] }
let monthExtras = storedState.monthExtras;

// Migración: asignar startY/startM a registros viejos que no lo tienen
FinanceStorage.migrateStartDates({ debts, savings }, today);

// ── Funciones de guardado ─────────────────────────────────
function save()        { FinanceStorage.saveAppValue('overrides', overrides); }
function saveExp()     { FinanceStorage.saveAppValue('expenses', expenses); window.FluxoNotifications?.scheduleSync?.(); }
function saveMonthExp(){ FinanceStorage.saveAppValue('monthExpenses', monthExpenses); window.FluxoNotifications?.scheduleSync?.(); }
function saveDisc()    { FinanceStorage.saveAppValue('discounts', discounts); }
function saveDiscMon() { FinanceStorage.saveAppValue('discountMonths', discountMonths); }
function saveAccum()   { FinanceStorage.saveAppValue('accumBalances', accumBalances); }
function saveInc()     { FinanceStorage.saveAppValue('incomes', incomes); window.FluxoNotifications?.scheduleSync?.(); }
function saveMonthInc(){ FinanceStorage.saveAppValue('monthIncomes', monthIncomes); window.FluxoNotifications?.scheduleSync?.(); }
function saveDebts()   { FinanceStorage.saveAppValue('debts', debts); window.FluxoNotifications?.scheduleSync?.(); }
function saveSavings() { FinanceStorage.saveAppValue('savings', savings); window.FluxoNotifications?.scheduleSync?.(); }
function saveSavingsEvents(){ FinanceStorage.saveAppValue('savingsEvents', savingsEvents); }
function saveSavingsSpent(){ FinanceStorage.saveAppValue('savingsSpent', savingsSpent); }
function saveControlStart() { FinanceStorage.saveAppValue('controlStart', controlStart); }
function saveSchedule() { FinanceStorage.saveAppValue('schedule', schedule); window.FluxoNotifications?.scheduleSync?.(); }
function saveSalary() { FinanceStorage.saveAppValue('salary', salary); }
function saveExtras() { FinanceStorage.saveAppValue('monthExtras', monthExtras); }

// ── Utilidades de fecha ───────────────────────────────────
function key(y, m, d)  { return `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`; }
function monthKey(y, m){ return `${y}-${String(m + 1).padStart(2, '0')}`; }
function dim(y, m)     { return new Date(y, m + 1, 0).getDate(); } // días en el mes
function fday(y, m)    { return new Date(y, m, 1).getDay(); }      // día de la semana del 1ro

// ── Formato de moneda ─────────────────────────────────────
function fmt(n) {
  return '$' + Math.round(n).toLocaleString('es-CO');
}

// ── Formato de etiqueta de fecha ──────────────────────────
function fmtLabel(k) {
  const [y, mo, d] = k.split('-');
  return `${WFULL[new Date(+y, +mo - 1, +d).getDay()]} ${+d} de ${MONTHS[+mo - 1]}`;
}
