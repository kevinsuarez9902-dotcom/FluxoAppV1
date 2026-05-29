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
const OV_KEY        = 'turnos_ov2';
const EXP_KEY       = 'turnos_exp';
const EXP_MONTH_KEY = 'turnos_exp_m';
const DISC_KEY      = 'turnos_disc';
const DISC_MON_KEY  = 'turnos_disc_m';
const ACCUM_KEY     = 'turnos_accum';
const INC_KEY       = 'turnos_inc';
const INC_MONTH_KEY = 'turnos_inc_m';
const DEBT_KEY      = 'turnos_debts';
const SAVINGS_KEY   = 'turnos_savings';
const CTRL_KEY      = 'turnos_control_start';
const SCHED_KEY     = 'turnos_schedule';
const SALARY_KEY    = 'turnos_salary';
const EXTRAS_KEY    = 'turnos_extras';

// ── Estado global ─────────────────────────────────────────
const today = new Date(); today.setHours(0, 0, 0, 0);
let Y = today.getFullYear();
let M = today.getMonth();
let selKey = null;

// ── Datos persistidos ─────────────────────────────────────
let overrides      = JSON.parse(localStorage.getItem(OV_KEY)        || '{}');
let expenses       = JSON.parse(localStorage.getItem(EXP_KEY)       || '[]');
let monthExpenses  = JSON.parse(localStorage.getItem(EXP_MONTH_KEY) || '{}');
let discounts      = JSON.parse(localStorage.getItem(DISC_KEY)      || '[]');
let discountMonths = JSON.parse(localStorage.getItem(DISC_MON_KEY)  || '{}');
let accumBalances  = JSON.parse(localStorage.getItem(ACCUM_KEY)     || '{}');
let incomes        = JSON.parse(localStorage.getItem(INC_KEY)       || '[]');
let monthIncomes   = JSON.parse(localStorage.getItem(INC_MONTH_KEY) || '{}');
let debts          = JSON.parse(localStorage.getItem(DEBT_KEY)      || '[]');
let savings        = JSON.parse(localStorage.getItem(SAVINGS_KEY)   || '[]');

// Mes de inicio de control (null = sin restricción)
let controlStart   = JSON.parse(localStorage.getItem(CTRL_KEY) || 'null');

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
let schedule = JSON.parse(localStorage.getItem(SCHED_KEY) || 'null');

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
let salary = JSON.parse(localStorage.getItem(SALARY_KEY) || 'null');

// Extras del mes { 'YYYY-MM': [{ id, type, qty, unitValue, desc }] }
let monthExtras = JSON.parse(localStorage.getItem(EXTRAS_KEY) || '{}');

// Migración: asignar startY/startM a registros viejos que no lo tienen
(function migrateDates() {
  let changed = false;
  debts.forEach(d => {
    if (d.startY == null) { d.startY = today.getFullYear(); d.startM = today.getMonth(); changed = true; }
  });
  if (changed) localStorage.setItem(DEBT_KEY, JSON.stringify(debts));
  changed = false;
  savings.forEach(s => {
    if (s.startY == null) { s.startY = today.getFullYear(); s.startM = today.getMonth(); changed = true; }
  });
  if (changed) localStorage.setItem(SAVINGS_KEY, JSON.stringify(savings));
})();

// ── Funciones de guardado ─────────────────────────────────
function save()        { localStorage.setItem(OV_KEY,        JSON.stringify(overrides)); }
function saveExp()     { localStorage.setItem(EXP_KEY,       JSON.stringify(expenses)); }
function saveMonthExp(){ localStorage.setItem(EXP_MONTH_KEY, JSON.stringify(monthExpenses)); }
function saveDisc()    { localStorage.setItem(DISC_KEY,      JSON.stringify(discounts)); }
function saveDiscMon() { localStorage.setItem(DISC_MON_KEY,  JSON.stringify(discountMonths)); }
function saveAccum()   { localStorage.setItem(ACCUM_KEY,     JSON.stringify(accumBalances)); }
function saveInc()     { localStorage.setItem(INC_KEY,       JSON.stringify(incomes)); }
function saveMonthInc(){ localStorage.setItem(INC_MONTH_KEY, JSON.stringify(monthIncomes)); }
function saveDebts()   { localStorage.setItem(DEBT_KEY,      JSON.stringify(debts)); }
function saveSavings()     { localStorage.setItem(SAVINGS_KEY, JSON.stringify(savings)); }
function saveControlStart() { localStorage.setItem(CTRL_KEY,   JSON.stringify(controlStart)); }
function saveSchedule()   { localStorage.setItem(SCHED_KEY,  JSON.stringify(schedule)); }
function saveSalary()    { localStorage.setItem(SALARY_KEY, JSON.stringify(salary)); }
function saveExtras()    { localStorage.setItem(EXTRAS_KEY, JSON.stringify(monthExtras)); }

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
