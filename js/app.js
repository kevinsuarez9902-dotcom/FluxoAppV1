// ═══════════════════════════════════════════════════════
// MOVEMENT DATE HELPERS — FASE 2A
// ═══════════════════════════════════════════════════════
// Normaliza fechas de movimientos a YYYY-MM-DD sin cambiar todavía
// la estructura financiera existente. Los campos day/day2 siguen
// siendo compatibles y continúan siendo la fuente actual de cálculo.
function fluxoMovementDate(year, month, day) {
  const y = Number(year);
  const m = Number(month);
  const d = Number(day);
  if (!Number.isInteger(y) || !Number.isInteger(m) || m < 0 || m > 11 ||
      !Number.isInteger(d) || d < 1 || d > 31) return null;
  const maxDay = new Date(y, m + 1, 0).getDate();
  if (d > maxDay) return null;
  return `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

function fluxoMovementDateLabel(year, month, day) {
  const key = fluxoMovementDate(year, month, day);
  if (!key) return '';
  const d = new Date(`${key}T12:00:00`);
  return new Intl.DateTimeFormat('es-CO', {
    day: 'numeric', month: 'long', year: 'numeric'
  }).format(d);
}

// Expone la utilidad para las siguientes fases (calendario/reportes).
window.FluxoMovementDate = {
  key: fluxoMovementDate,
  label: fluxoMovementDateLabel
};


// ── Migración: asignar startY/startM a registros sin fecha ──────────
(function fixMissingDates() {
  const todayY = today.getFullYear();
  const todayM = today.getMonth();
  let sc = false;
  savings.forEach(s => {
    if (s.startY == null || s.startY === 0) { s.startY = todayY; s.startM = todayM; sc = true; }
  });
  if (sc) FinanceStorage.saveAppValue('savings', savings);
  let dc = false;
  debts.forEach(d => {
    if (d.startY == null || d.startY === 0) { d.startY = todayY; d.startM = todayM; dc = true; }
  });
  if (dc) FinanceStorage.saveAppValue('debts', debts);
})();

// INIT HEADER
// ═══════════════════════════════════════════════════════
// header-rate removed

// ═══════════════════════════════════════════════════════
// SHIFT LOGIC
// ═══════════════════════════════════════════════════════
function getShiftTypeById(id) {
  if (!schedule) return null;
  return (schedule.shiftTypes || []).find(s => s.id === id) || null;
}

function origShift(y, m, d) {
  // Si hay schedule configurado, usarlo
  if (schedule && (schedule.type === 'cycle' || schedule.type === 'rotating')) {
    const startParts = (schedule.startDate || '').split('-');
    if (startParts.length === 3) {
      const startDt = new Date(+startParts[0], +startParts[1]-1, +startParts[2]);
      startDt.setHours(0,0,0,0);
      const dt = new Date(y, m, d); dt.setHours(0,0,0,0);
      const diff = Math.floor((dt - startDt) / 86400000);
      const cycle = schedule.cycle || [];
      if (cycle.length === 0) return 'DESCANSO';
      const idx = ((diff % cycle.length) + cycle.length) % cycle.length;
      return cycle[idx]; // retorna el id del shiftType
    }
  }
  if (schedule && schedule.type === 'office') {
    const dow = new Date(y, m, d).getDay(); // 0=dom,1=lun...6=sab
    return (schedule.officeDays && schedule.officeDays[dow] > 0) ? 'OFFICE' : 'DESCANSO';
  }
  // Fallback al ciclo hardcodeado
  const dt = new Date(y, m, d); dt.setHours(0, 0, 0, 0);
  const diff = Math.floor((dt - START) / 86400000);
  return CYCLE[((diff % 6) + 6) % 6];
}

function isRestShift(shiftId) {
  if (!schedule || !shiftId) return shiftId === 'DESCANSO';
  // Si el nombre del turno contiene "descanso" o no tiene horas, es descanso
  const st = getShiftTypeById(shiftId);
  if (!st) return shiftId === 'DESCANSO';
  return (st.name || '').toLowerCase().includes('descanso') || st.hours === 0;
}

function effShift(y, m, d) {
  const o  = origShift(y, m, d);
  const ov = overrides[key(y, m, d)];
  if (ov === true)                                          return 'AUSENTE';
  if (ov && typeof ov === 'object' && ov.type === 'INCAP') return 'INCAP';
  if (ov === 'INCAP')                                       return 'INCAP';
  if (typeof ov === 'number')                               return 'PARCIAL';
  if (ov && typeof ov === 'object' && ov.type === 'SWAP')   return ov.shift;
  if (ov && typeof ov === 'object' && ov.type === 'SWAP_PARTIAL') return 'PARCIAL';
  // Si es schedule y el turno es descanso
  if (schedule && (schedule.type === 'cycle' || schedule.type === 'rotating') && isRestShift(o)) return 'DESCANSO';
  return o;
}

function getShiftHours(shiftId) {
  if (schedule && schedule.type === 'office') {
    // shiftId is day-of-week for office
    return schedule.officeDays ? (schedule.officeDays[shiftId] || 0) : HOURS;
  }
  const st = getShiftTypeById(shiftId);
  if (st) return st.hours || HOURS;
  return HOURS;
}

function getShiftStyle(shiftId) {
  // Turnos estándar
  if (SHIFTS[shiftId]) return SHIFTS[shiftId];
  // OFFICE = día de oficina
  if (shiftId === 'OFFICE') return { bg: '#1e3a5f', color: '#60a5fa', border: '#2563eb', icon: '🏢', label: 'Oficina' };
  // Schedule shiftType por id
  if (schedule) {
    const st = getShiftTypeById(shiftId);
    if (st) {
      const isRest = (st.name || '').toLowerCase().includes('descanso') || st.hours === 0;
      if (isRest) return SHIFTS['DESCANSO'];
      // Generar bg oscuro a partir del color del turno
      const c = st.color || '#6366f1';
      // Convertir hex a rgb para hacer bg oscuro con tinte del color
      const r = parseInt(c.slice(1,3),16), g = parseInt(c.slice(3,5),16), b = parseInt(c.slice(5,7),16);
      const bg = `rgb(${Math.round(r*0.15)},${Math.round(g*0.15)},${Math.round(b*0.15)})`;
      return {
        bg,
        color:  c,
        border: c + '99',
        icon:   st.icon || (() => {
          const n = (st.name || '').toLowerCase();
          if (n.includes('día') || n.includes('dia') || n.includes('mañana') || n.includes('manana')) return '☀️';
          if (n.includes('noche')) return '🌙';
          if (n.includes('tarde')) return '🌅';
          if (n.includes('descanso') || n.includes('libre')) return '😴';
          return '🔄';
        })(),
        label:  st.name || 'Turno',
      };
    }
  }
  return SHIFTS['DESCANSO'];
}

function effHours(y, m, d) {
  const eff = effShift(y, m, d);
  if (eff === 'AUSENTE' || eff === 'DESCANSO') return 0;
  if (eff === 'INCAP') return 0;
  if (eff === 'PARCIAL') {
    const ov = overrides[key(y, m, d)];
    if (typeof ov === 'number') return ov;
    if (ov && typeof ov === 'object' && ov.type === 'SWAP_PARTIAL') return ov.hours;
    return 0;
  }
  if (eff === 'OFFICE') {
    const dow = new Date(y, m, d).getDay();
    return schedule && schedule.officeDays ? (schedule.officeDays[dow] || 0) : HOURS;
  }
  // cycle/rotating — eff es el id del shiftType
  if (schedule && (schedule.type === 'cycle' || schedule.type === 'rotating')) {
    if (isRestShift(eff)) return 0;
    return getShiftHours(eff);
  }
  return HOURS;
}

function getIncapValue(y, m, d) {
  const ov = overrides[key(y, m, d)];
  if (ov && typeof ov === 'object' && ov.type === 'INCAP') return ov.value;
  return INCAP_RATE;
}

function effEarnings(y, m, d) {
  const eff = effShift(y, m, d);
  if (eff === 'INCAP') return getIncapValue(y, m, d);
  const h = effHours(y, m, d);
  if (h === 0) return 0;
  // Sueldo fijo — ausentes no afectan, solo incapacidades
  if (salary && salary.type === 'fixed') return 0; // el fijo se calcula en calcMonthEarnings
  // Por hora — usar tarifa del tipo de turno
  const rate = (schedule && (schedule.type === 'cycle' || schedule.type === 'rotating'))
    ? getEffectiveRate(eff)
    : (salary ? salary.baseRate || RATE : RATE);
  return h * rate;
}

// ═══════════════════════════════════════════════════════
// TOAST
// ═══════════════════════════════════════════════════════
function toast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 2500);
}

// ═══════════════════════════════════════════════════════
// SCHEDULED MOVEMENTS — FASE 5
// ═══════════════════════════════════════════════════════
// Los registros nuevos con scheduleVersion=1 son plantillas/programaciones.
// Solo una ocurrencia confirmada se incorpora al cálculo financiero.
function getScheduledRegistrationDate(record) {
  if (!record || record.scheduleVersion !== 1) return null;
  const raw = record.registeredDate || record.createdAt || record.startDate;
  if (raw && /^\d{4}-\d{2}-\d{2}/.test(String(raw))) return String(raw).slice(0, 10);
  const sy = Number(record.startY), sm = Number(record.startM);
  if (Number.isInteger(sy) && Number.isInteger(sm) && sm >= 0 && sm <= 11) return fluxoMovementDate(sy, sm, 1);
  return null;
}

function isScheduledRecordActive(record, y, m, scheduledDay = null) {
  if (!record || record.scheduleVersion !== 1) return true; // compatibilidad legacy
  const sy = Number(record.startY);
  const sm = Number(record.startM);
  if (Number.isInteger(sy) && Number.isInteger(sm) && y * 12 + m < sy * 12 + sm) return false;

  // La programación tampoco puede aparecer en una fecha anterior al momento
  // exacto en que fue registrada. Esto evita, por ejemplo, registrar una luz
  // el día 20 y verla como pendiente el día 5 del mismo mes.
  if (scheduledDay != null) {
    const registrationDate = getScheduledRegistrationDate(record);
    const scheduledDate = fluxoMovementDate(y, m, Number(scheduledDay));
    if (registrationDate && scheduledDate < registrationDate) return false;
  }
  return true;
}

function getScheduledOccurrence(record, y, m, slot) {
  if (!record || record.scheduleVersion !== 1) return null;
  const mk = monthKey(y, m);
  return record.occurrences?.[mk]?.[slot] || null;
}

function isScheduledOccurrenceRealized(record, y, m, day, slot) {
  if (!isScheduledRecordActive(record, y, m, day)) return false;
  if (record.scheduleVersion !== 1) return true;
  return getScheduledOccurrence(record, y, m, slot)?.status === 'completed';
}

function ensureScheduledOccurrence(record, y, m, slot, scheduledDay, actualDate = null) {
  if (!record.occurrences) record.occurrences = {};
  const mk = monthKey(y, m);
  if (!record.occurrences[mk]) record.occurrences[mk] = {};
  const scheduledDate = fluxoMovementDate(y, m, scheduledDay);
  record.occurrences[mk][slot] = {
    status: 'completed',
    scheduledDate,
    date: actualDate || scheduledDate,
    completedAt: new Date().toISOString()
  };
}

function getActualMovementDate(y, m) {
  const targetY = Number(y), targetM = Number(m);
  const currentY = today.getFullYear(), currentM = today.getMonth();
  if (targetY === currentY && targetM === currentM) return fluxoMovementDate(targetY, targetM, today.getDate());
  return null;
}

function getRecurringOccurrenceSlot(record, day) {
  const d = Number(day);
  if (record?.type === 'quincenal') {
    if (d === Number(record.day)) return 'q1';
    if (d === Number(record.day2)) return 'q2';
  }
  if (record?.type === 'daily') return `d${d}`;
  return 'monthly';
}

function getCalculatedMonthExpenses(y, m) {
  return FinanceCalculator.getRecurringItems(
    expenses, monthExpenses[monthKey(y, m)], y, m, dim(y, m), MONTHS[m],
    (record, yy, mm, day, slot) => isScheduledOccurrenceRealized(record, yy, mm, day, slot)
  );
}

function getCalculatedMonthIncomes(y, m) {
  return FinanceCalculator.getRecurringItems(
    incomes, monthIncomes[monthKey(y, m)], y, m, dim(y, m), MONTHS[m],
    (record, yy, mm, day, slot) => isScheduledOccurrenceRealized(record, yy, mm, day, slot)
  );
}

function getMonthExpenses(y, m) {
  return FinanceCalculator.getRecurringItems(expenses, monthExpenses[monthKey(y, m)], y, m, dim(y, m), MONTHS[m]);
}

function hasDayExpense(y, m, d) {
  return expenses.some(e => e.type === 'daily' && parseInt(e.day) === d);
}

// ═══════════════════════════════════════════════════════
// INCOME HELPERS
// ═══════════════════════════════════════════════════════
function getMonthIncomes(y, m) {
  return FinanceCalculator.getRecurringItems(incomes, monthIncomes[monthKey(y, m)], y, m, dim(y, m), MONTHS[m]);
}

// ═══════════════════════════════════════════════════════
// DEBT HELPERS
// ═══════════════════════════════════════════════════════
function getMonthDebtPayment(y, m) {
  return FinanceCalculator.getRecordedDebtPayment(debts, monthKey(y, m));
}

// ═══════════════════════════════════════════════════════
// ACCUMULATED BALANCE
// ═══════════════════════════════════════════════════════
function getAllDataMonthKeys() {
  const keys = new Set();

  // Turnos y cambios de calendario
  Object.keys(overrides).forEach(k => keys.add(k.slice(0, 7)));

  // Movimientos mensuales
  Object.keys(monthExpenses).forEach(k => keys.add(k));
  Object.keys(monthIncomes).forEach(k => keys.add(k));
  Object.keys(monthExtras).forEach(k => keys.add(k));
  Object.keys(discountMonths).forEach(k => keys.add(k));
  Object.keys(accumBalances).forEach(k => keys.add(k));

  // Ahorros
  savings.forEach(s => {
    if (s.startY != null && s.startM != null) {
      keys.add(monthKey(Number(s.startY), Number(s.startM)));
    }
    (s.payments || []).forEach(p => { if (p.mk) keys.add(p.mk); });
    if (s.completedY != null && s.completedM != null) {
      keys.add(monthKey(Number(s.completedY), Number(s.completedM)));
    }
  });
  savingsSpent.forEach(e => { if (e.mk) keys.add(e.mk); });

  // Deudas con fecha de inicio
  debts.forEach(d => {
    if (d.startY != null && d.startM != null) {
      keys.add(monthKey(Number(d.startY), Number(d.startM)));
    }
  });

  return Array.from(keys).sort();
}

function getFirstDataMonth() {
  const keys = getAllDataMonthKeys();

  // Si el usuario configuró sueldo/turnos pero todavía no hay movimientos
  // manuales, el período actual debe poder calcularse inmediatamente.
  if (salary || schedule) {
    const base = controlStart
      ? { y: Number(controlStart.y), m: Number(controlStart.m) }
      : { y: today.getFullYear(), m: today.getMonth() };

    if (keys.length === 0) return base;

    const [ky, km] = keys[0].split('-').map(Number);
    const firstKeyIdx = ky * 12 + (km - 1);
    const baseIdx = base.y * 12 + base.m;
    return baseIdx <= firstKeyIdx ? base : { y: ky, m: km - 1 };
  }

  if (keys.length === 0) return null;

  const [y, m] = keys[0].split('-').map(Number);
  return { y, m: m - 1 };
}

function getAccumulatedBalance(y, m) {
  const result = FinanceEngine.computeAccumulated(y, m, {
    getFirstDataMonth,
    monthKey,
    calcMonth
  });

  if (result === null) return 0;

  result.balances.forEach(({ mk, value }) => {
    accumBalances[mk] = value;
  });

  saveAccum();
  return result.accumulated;
}

function getPrevAccumulated(y, m) {
  let py = Number(y), pm = Number(m) - 1;
  if (pm < 0) { pm = 11; py--; }
  return getAccumulatedBalance(py, pm);
}

// ── Ahorros: saldo histórico del período ───────────────────────────
function getSavedAmountAt(y, m) {
  return FinanceCalculator.getSavingsTotalAt(savings, y, m);
}

// ── Ahorros: desglose del patrimonio disponible ─────────────────────
function getTotalSavedAmount() {
  return FinanceEngine.getTotalSavedAmount(
    { y: Y, m: M },
    { getSavedAmountAt }
  );
}

// El saldo disponible es el acumulado financiero después de aportes a ahorro
// + el dinero que actualmente está apartado en metas. Así mover dinero entre
// Disponible y Ahorros no cambia el Saldo Total.
function getAvailableBalance(y, m) {
  // getAccumulatedBalance ya descuenta los aportes realizados a las metas.
  // Por eso representa el dinero disponible, mientras que el dinero apartado
  // se suma aparte para obtener el patrimonio/Saldo Total.
  return getAccumulatedBalance(y, m);
}

function getTotalWealth(y, m) {
  return FinanceEngine.getTotalWealth(
    y,
    m,
    { getAvailableBalance, getSavedAmountAt }
  );
}

function getMonthSummary(y, m) {
  return FinanceEngine.getMonthSummary(y, m, {
    calcMonth,
    getAvailableBalance,
    getSavedAmountAt
  });
}

function addSavingsEvent(type, savingName, amount, y = Y, m = M) {
  savingsEvents.unshift({
    id: Date.now() + Math.random(), type, savingName, amount: Number(amount) || 0,
    y, m, at: new Date().toISOString()
  });
  savingsEvents = savingsEvents.slice(0, 100);
  saveSavingsEvents();
}

// ═══════════════════════════════════════════════════════
// DISCOUNT HELPERS
// ═══════════════════════════════════════════════════════
function getMonthDiscData(y, m) {
  return FinanceCalculator.getDiscountData(discounts, discountMonths[monthKey(y, m)]);
}

function getMonthDiscounts(y, m) {
  const c = calcMonthEarnings(y, m);
  const { allForMonth } = getMonthDiscData(y, m);
  return FinanceCalculator.getDiscountTotals(allForMonth, c);
}

// ═══════════════════════════════════════════════════════
// TAB NAVIGATION
// ═══════════════════════════════════════════════════════
const TAB_MAP = {
  resumen:      { sec: 'resumen',      tab: 'resumen' },
  finanzas:     { sec: 'finanzas',     tab: 'finanzas' },
  calendar:     { sec: 'calendar',     tab: 'calendar' },
  estadisticas: { sec: 'estadisticas', tab: 'estadisticas' },
  ajustes:      { sec: 'ajustes',      tab: 'ajustes' },
};

function switchTab(tab) {
  Object.keys(TAB_MAP).forEach(t => {
    document.getElementById('section-' + TAB_MAP[t].sec).classList.toggle('active', t === tab);
    document.getElementById('tab-'     + TAB_MAP[t].tab).classList.toggle('active', t === tab);
  });
  // Si salimos de finanzas, ocultar todos los sub-paneles
  if (tab !== 'finanzas') {
    ['gastos','ingresos','ahorros','deudas','descuentos','recargos'].forEach(p => {
      const el = document.getElementById('mov-' + p);
      if (el) el.style.display = 'none';
    });
  }
  if (tab === 'resumen')      renderResumen();
  if (tab === 'calendar')     renderCal();
  if (tab === 'finanzas')     { updateFinMenu(); if (currentFinPanel) openFinPanel(currentFinPanel); }
  if (tab === 'estadisticas') { renderEstadisticas(); }
  if (tab === 'ajustes')      { renderNotifStatus(); initSchedUI(); initSalaryUI(); updateControlStartLabel(); }
}

// ── Movimientos sub-toggle ────────────────────────────
let movPanel = 'gastos';
function switchMov(panel) {
  movPanel = panel;
  // If finanzas tab is active, open the panel directly
  if (document.getElementById('section-finanzas').classList.contains('active')) {
    openFinPanel(panel);
    return;
  }
  ['gastos','ingresos','ahorros','deudas','descuentos','recargos'].forEach(p => {
    const el = document.getElementById('mov-' + p);
    if (el) el.style.display = panel === p ? 'block' : 'none';
    const btn = document.getElementById('mov-btn-' + p);
    if (btn) btn.className = 'mov-toggle-btn' + (panel === p ? ' active-gastos' : '');
  });
  if (panel === 'gastos')      renderExpenses();
  if (panel === 'ingresos')    renderIncomes();
  if (panel === 'ahorros')     renderSavings();
  if (panel === 'deudas')      renderDebts();
  if (panel === 'descuentos')  renderDiscounts();
}

// ═══════════════════════════════════════════════════════
// CALCULATIONS
// ═══════════════════════════════════════════════════════
function calcMonthEarnings(y, m) {
  const total = dim(y, m);
  let q1h = 0, q2h = 0, q1earn = 0, q2earn = 0;
  let q1a = 0, q2a = 0, q1p = 0, q2p = 0, q1i = 0, q2i = 0;
  let totalHours = 0, totalEarn = 0, absentCount = 0, partialCount = 0, incapCount = 0;
  let incapTotal = 0;

  for (let d = 1; d <= total; d++) {
    const eff = effShift(y, m, d);
    const h   = effHours(y, m, d);
    const e   = effEarnings(y, m, d);
    totalHours += h;
    if (eff === 'AUSENTE') { absentCount++;  d <= 15 ? q1a++ : q2a++; }
    if (eff === 'PARCIAL') { partialCount++; d <= 15 ? q1p++ : q2p++; }
    if (eff === 'INCAP')   { incapCount++;   d <= 15 ? q1i++ : q2i++; incapTotal += e; }
    if (d <= 15) q1h += h; else q2h += h;
    // Para pago por hora, acumular earnings normalmente
    if (!salary || salary.type === 'hourly') {
      totalEarn += e;
      if (d <= 15) q1earn += e; else q2earn += e;
    }
  }

  // Para sueldo fijo, calcular el fijo + incapacidades
  if (salary && salary.type === 'fixed') {
    const fixedAmt = salary.fixedAmount || 0;
    if (salary.fixedType === 'quincenal') {
      q1earn = fixedAmt + (q1i > 0 ? incapTotal / 2 : 0);
      q2earn = fixedAmt + (q2i > 0 ? incapTotal / 2 : 0);
    } else {
      q1earn = fixedAmt / 2;
      q2earn = fixedAmt / 2;
      // Agregar incapacidades al periodo correspondiente
      for (let d = 1; d <= total; d++) {
        if (effShift(y, m, d) === 'INCAP') {
          const inc = getIncapValue(y, m, d);
          if (d <= 15) q1earn += inc; else q2earn += inc;
        }
      }
    }
    totalEarn = q1earn + q2earn;
  }

  return { q1h, q2h, q1earn, q2earn, totalHours, totalEarn, absentCount, partialCount, incapCount, q1a, q2a, q1p, q2p, q1i, q2i };
}

function getMonthSavingsTotal(y, m) {
  const _y = (y !== undefined) ? y : Y;
  const _m = (m !== undefined) ? m : M;
  const mk = monthKey(_y, _m);
  const currIdx = _y * 12 + _m;
  let total = 0;
  savings.forEach(s => {
    const sy = (s.startY != null && s.startY > 0) ? s.startY : today.getFullYear();
    const sm = (s.startY != null && s.startY > 0) ? (s.startM != null ? s.startM : today.getMonth()) : today.getMonth();
    const startIdx = sy * 12 + sm;
    if (currIdx < startIdx) return;
    if (typeof window.getRealMonthlySavingsContribution === 'function') {
      total += window.getRealMonthlySavingsContribution(s, mk);
    } else {
      (s.payments || []).forEach(p => { if (p.mk === mk && !p.initial && p.kind !== 'withdrawal') total += Number(p.amount) || 0; });
    }
  });
  // Salidas definitivas de dinero asociadas a metas eliminadas o dinero destruido.
  savingsSpent.forEach(e => { if (e.mk === mk) total += Number(e.amount) || 0; });
  return total;
}

function isBeforeControl(y, m) {
  if (!controlStart) return false;
  return (y * 12 + m) < (controlStart.y * 12 + controlStart.m);
}

function calcMonth(y, m) {
  return FinanceEngine.calcMonth(y, m, {
    isBeforeControl,
    monthKey,
    dim,
    MONTHS,
    today,
    salary,
    schedule,
    overrides,
    expenses,
    monthExpenses,
    incomes,
    monthIncomes,
    discounts,
    discountMonths,
    debts,
    savings,
    savingsSpent,
    monthExtras,
    getMonthExtrasTotal,
    getMonthSavingsTotal,
    getMonthDebtPayment,
    getMonthDiscounts,
    getMonthIncomes: getCalculatedMonthIncomes,
    getMonthExpenses: getCalculatedMonthExpenses,
    calcMonthEarnings
  });
}

// ═══════════════════════════════════════════════════════
// RENDER: RESUMEN
// ═══════════════════════════════════════════════════════
function renderResumen() {
  if (isBeforeControl(Y, M)) {
    const csLabel = `${MONTHS[controlStart.m]} ${controlStart.y}`;
    document.getElementById('resumen-content').innerHTML = `
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px">
        <button class="nav-btn" onclick="prevMonth()" style="background:rgba(99,102,241,0.1)">‹</button>
        <div style="text-align:center">
          <div style="font-family:'DM Serif Display',serif;font-size:18px;color:#c7d2fe">${MONTHS[M]}</div>
          <div style="font-size:11px;color:#6366f1;font-weight:500">${Y}</div>
        </div>
        <button class="nav-btn" onclick="nextMonth()" style="background:rgba(99,102,241,0.1)">›</button>
      </div>
      <div style="text-align:center;padding:40px 20px;color:#475569">
        <div style="font-size:40px;margin-bottom:12px">📅</div>
        <div style="font-size:15px;color:#94a3b8;margin-bottom:4px">Control financiero inicia en</div>
        <div style="font-size:20px;font-weight:700;color:#6366f1">${csLabel}</div>
      </div>`;
    return;
  }
  const c  = calcMonth(Y, M);
  const mn = `${MONTHS[M]} ${Y}`;
  const { items: expItems, total: expTotal } = getMonthExpenses(Y, M);
  const { items: incItems, total: incTotal } = getMonthIncomes(Y, M);
  const debtTotal = getMonthDebtPayment(Y, M);

  let cnt = { DÍA: 0, NOCHE: 0, DESCANSO: 0, AUSENTE: 0, PARCIAL: 0, INCAP: 0 };
  for (let d = 1; d <= dim(Y, M); d++) { const s = effShift(Y, M, d); cnt[s] = (cnt[s] || 0) + 1; }

  // Generar badges según tipo de schedule
  const avgHours = schedule && (schedule.type === 'cycle' || schedule.type === 'rotating')
    ? ((schedule.shiftTypes || []).filter(st => !isRestShift(st.id)).reduce((a,b) => a + b.hours, 0) /
       Math.max(1, (schedule.shiftTypes || []).filter(st => !isRestShift(st.id)).length))
    : schedule && schedule.type === 'office'
      ? (Object.values(schedule.officeDays || {}).reduce((a,b)=>a+b,0) / Math.max(1,Object.keys(schedule.officeDays||{}).length))
      : HOURS;
  const q1w = Math.round(c.q1h / Math.max(1, avgHours));
  const q2w = Math.round(c.q2h / Math.max(1, avgHours));

  // Construir badges dinámicos para schedule
  let badgesHtml = '';
  if (schedule && (schedule.type === 'cycle' || schedule.type === 'rotating')) {
    (schedule.shiftTypes || []).forEach(st => {
      const n = cnt[st.id] || 0;
      if (n > 0) {
        badgesHtml += `<span class="badge" style="background:${st.color}22;color:${st.color};border:1px solid ${st.color}44">
          ${st.icon || '🔄'} ${st.name}: ${n}</span>`;
      }
    });
  } else if (schedule && schedule.type === 'office') {
    const worked = Object.values(cnt).reduce((a,b)=>typeof b==='number'?a+b:a, 0) - (cnt.DESCANSO||0) - (cnt.AUSENTE||0) - (cnt.INCAP||0) - (cnt.PARCIAL||0);
    badgesHtml += `<span class="badge" style="background:#1e3a5f22;color:#60a5fa;border:1px solid #2563eb44">🏢 Oficina: ${cnt.OFFICE||0}</span>`;
  } else {
    badgesHtml = `
      <span class="badge" style="background:#FFF3CD22;color:#ca8a04;border:1px solid #ca8a0444">☀️ Día: ${cnt.DÍA||0}</span>
      <span class="badge" style="background:#1a1a2e;color:#A78BFA;border:1px solid #5B21B644">🌙 Noche: ${cnt.NOCHE||0}</span>`;
  }
  badgesHtml += `<span class="badge" style="background:#DCFCE722;color:#166534;border:1px solid #4ADE8044">😴 Descanso: ${cnt.DESCANSO||0}</span>`;
  if (cnt.AUSENTE > 0) badgesHtml += `<span class="badge" style="background:#2d0a0a;color:#f87171;border:1px solid #7f1d1d">🚫 Ausente: ${cnt.AUSENTE}</span>`;
  if (cnt.PARCIAL > 0) badgesHtml += `<span class="badge" style="background:#1c120022;color:#fbbf24;border:1px solid #d9770644">⏱️ Parcial: ${cnt.PARCIAL}</span>`;
  if (cnt.INCAP   > 0) badgesHtml += `<span class="badge" style="background:#082f49;color:#7dd3fc;border:1px solid #0891b244">🏥 Incap: ${cnt.INCAP}</span>`;

  // ── FASE 4 — AGENDA FINANCIERA: próximos movimientos ──
  // Usa los días configurados en ingresos, gastos, deudas y ahorros sin
  // convertirlos en movimientos realizados. Solo muestra fechas futuras
  // dentro del mes seleccionado.
  const upcomingItems = [];
  const now = new Date();
  const selectedIsCurrentMonth = Y === now.getFullYear() && M === now.getMonth();
  const minUpcomingDay = selectedIsCurrentMonth ? now.getDate() : (Y > now.getFullYear() || (Y === now.getFullYear() && M > now.getMonth()) ? 1 : Infinity);
  const daysInSelectedMonth = dim(Y, M);
  const pushUpcoming = (day, item) => {
    const d = Number(day);
    if (!Number.isInteger(d) || d < 1 || d > daysInSelectedMonth) return;
    upcomingItems.push({ day: d, ...item });
  };
  const currentMk = monthKey(Y, M);
  const currentDay = selectedIsCurrentMonth ? now.getDate() : null;
  const occurrencePending = (record, day, slot) => {
    if (record?.scheduleVersion !== 1) return false;
    if (!isScheduledRecordActive(record, Y, M)) return false;
    return !getScheduledOccurrence(record, Y, M, slot);
  };
  const addScheduledRecord = (record, source, kind, icon, sign) => {
    if (!record || record.scheduleVersion !== 1) return;
    const addOne = (day, slot, suffix = '') => {
      const dueDay = Number(day);
      if (!Number.isInteger(dueDay) || dueDay < 1 || dueDay > daysInSelectedMonth) return;
      if (!isScheduledRecordActive(record, Y, M, dueDay)) return;
      if (!occurrencePending(record, dueDay, slot)) return;
      const dueDate = fluxoMovementDate(Y, M, dueDay);
      const due = selectedIsCurrentMonth ? dueDay <= currentDay : (Y > now.getFullYear() || (Y === now.getFullYear() && M > now.getMonth()));
      const status = selectedIsCurrentMonth && dueDay < currentDay ? 'Pendiente' : dueDay === currentDay && selectedIsCurrentMonth ? 'Vence hoy' : 'Programado';
      pushUpcoming(dueDay, {
        icon, name: record.name || kind, meta: `${status} · ${kind}${suffix}`,
        amount: Number(record.amount) || 0, sign, scheduleKind: kind,
        source, recordId: record.id, slot, dueDate, canConfirm: selectedIsCurrentMonth && dueDay <= currentDay
      });
    };
    if (record.type === 'quincenal') {
      addOne(record.day, 'q1', ' · Q1');
      addOne(record.day2, 'q2', ' · Q2');
    } else addOne(record.day, record.type === 'daily' ? `d${Number(record.day)}` : 'monthly');
  };

  (incomes || []).forEach(i => addScheduledRecord(i, 'global', 'Ingreso programado', '💰', '+'));
  (monthIncomes[currentMk] || []).forEach(i => addScheduledRecord(i, 'month', 'Ingreso programado', '💰', '+'));
  (expenses || []).forEach(e => addScheduledRecord(e, 'global', 'Gasto programado', '💸', '-'));
  (monthExpenses[currentMk] || []).forEach(e => addScheduledRecord(e, 'month', 'Gasto programado', '💸', '-'));

  // Deudas y ahorros ya se basan en pagos reales; aquí solo mostramos la cuota/aporte pendiente.
  (debts || []).filter(d => (Number(d.total) || 0) - (Number(d.paid) || 0) > 0).forEach(d => {
    const startDate = d.registeredDate || d.startDate || (Number.isInteger(Number(d.startY)) && Number.isInteger(Number(d.startM)) ? fluxoMovementDate(Number(d.startY), Number(d.startM), 1) : null);
    const days = d.freq === 'quincenal' ? [d.day, d.day2] : [d.day];
    days.forEach((day, idx) => {
      const dueDay = Number(day);
      if (!dueDay) return;
      const scheduledDate = fluxoMovementDate(Y, M, dueDay);
      if (startDate && scheduledDate < String(startDate).slice(0, 10)) return;
      const slot = d.freq === 'quincenal' ? (idx === 0 ? 'q1' : 'q2') : 'monthly';
      const paid = (d.payments || []).some(p => p.mk === currentMk && ((p.quincena === (idx === 0 ? 'Q1' : 'Q2')) || (!d.freq || d.freq !== 'quincenal')));
      if (paid) return;
      pushUpcoming(dueDay, { icon:'💳', name:d.name || 'Deuda', meta:`${selectedIsCurrentMonth && dueDay < currentDay ? 'Pendiente' : selectedIsCurrentMonth && dueDay === currentDay ? 'Vence hoy' : 'Programado'} · ${d.freq === 'quincenal' ? `Cuota ${idx === 0 ? 'Q1' : 'Q2'}` : 'Cuota'}`, amount:Number(d.cuota)||0, sign:'-', scheduleKind:'Cuota de deuda', source:'debt', recordId:d.id, slot, dueDate:fluxoMovementDate(Y,M,dueDay), canConfirm:selectedIsCurrentMonth && dueDay <= currentDay });
    });
  });
  (savings || []).filter(s => !s.completed).forEach(s => {
    const startDate = s.registeredDate || s.startDate || (Number.isInteger(Number(s.startY)) && Number.isInteger(Number(s.startM)) ? fluxoMovementDate(Number(s.startY), Number(s.startM), 1) : null);
    const days = s.freq === 'quincenal' ? [s.day, s.day2] : [s.day];
    days.forEach((day, idx) => {
      const dueDay = Number(day); if (!dueDay) return;
      const scheduledDate = fluxoMovementDate(Y, M, dueDay);
      if (startDate && scheduledDate < String(startDate).slice(0, 10)) return;
      const payments = (s.payments || []).filter(p => p.mk === currentMk && !p.initial && p.kind !== 'withdrawal' && p.type !== 'withdrawal');
      const paid = s.freq === 'quincenal'
        ? payments.some(p => p.label === (idx === 0 ? 'Q1' : 'Q2'))
        : payments.length > 0;
      if (paid) return;
      pushUpcoming(dueDay, { icon:'🏦', name:s.name || 'Ahorro', meta:`${selectedIsCurrentMonth && dueDay < currentDay ? 'Pendiente' : selectedIsCurrentMonth && dueDay === currentDay ? 'Vence hoy' : 'Programado'} · ${s.freq === 'quincenal' ? `Aporte ${idx === 0 ? 'Q1' : 'Q2'}` : 'Aporte'}`, amount:Number(s.monthly)||0, sign:'-', scheduleKind:'Aporte a ahorro', source:'saving', recordId:s.id, slot:s.freq === 'quincenal' ? (idx === 0 ? 'q1' : 'q2') : 'monthly', dueDate:fluxoMovementDate(Y,M,dueDay), canConfirm:selectedIsCurrentMonth && dueDay <= currentDay });
    });
  });
  upcomingItems.sort((a,b) => a.day - b.day || a.name.localeCompare(b.name));
  const upcomingVisible = upcomingItems.slice(0, 7);
  const upcomingHtml = upcomingVisible.length
    ? upcomingVisible.map(item => `
      <div class="upcoming-item">
        <div class="upcoming-date"><span class="upcoming-day">${item.day}</span><span class="upcoming-month">${MONTHS[M].slice(0,3)}</span></div>
        <div class="upcoming-icon">${item.icon}</div>
        <div class="upcoming-info"><div class="upcoming-name">${item.name}</div><div class="upcoming-meta">${item.meta}</div></div>
        <div class="upcoming-amount ${item.sign === '+' ? 'positive' : 'negative'}">${item.sign}${fmt(item.amount)}</div>
        ${item.canConfirm && item.source !== 'debt' && item.source !== 'saving' ? `<button type="button" class="upcoming-confirm-btn" onclick="window.confirmScheduledMovement('${item.scheduleKind === 'Ingreso programado' ? 'income' : 'expense'}','${item.source}',${item.recordId},${item.day},'${item.slot}')">${item.sign === '+' ? 'Recibido' : 'Ya pagué'}</button>` : ''}
        ${item.canConfirm && item.source === 'debt' ? `<button type="button" class="upcoming-confirm-btn" onclick="window.confirmDebtScheduledMovement(${item.recordId},${item.day},'${item.slot}')">Pagada</button>` : ''}
        ${item.canConfirm && item.source === 'saving' ? `<button type="button" class="upcoming-confirm-btn" onclick="window.confirmSavingScheduledMovement(${item.recordId},${item.day},'${item.slot}')">Aportado</button>` : ''}
      </div>`).join('')
    : '<div class="upcoming-empty">No hay movimientos programados próximos.</div>';

function confirmScheduledMovement(kind, source, id, day, slot) {
  const list = source === 'month' ? (kind === 'income' ? monthIncomes[monthKey(Y,M)] : monthExpenses[monthKey(Y,M)]) : (kind === 'income' ? incomes : expenses);
  const record = (list || []).find(item => String(item.id) === String(id));
  if (!record || record.scheduleVersion !== 1) return;
  const dueDay = Number(day);
  if (!isScheduledRecordActive(record, Y, M, dueDay)) return;
  const targetIdx = Y * 12 + M;
  const todayIdx = today.getFullYear() * 12 + today.getMonth();
  if (!dueDay || targetIdx > todayIdx || (targetIdx === todayIdx && dueDay > today.getDate())) return;
  const actualDate = getActualMovementDate(Y, M) || fluxoMovementDate(Y, M, dueDay);
  ensureScheduledOccurrence(record, Y, M, slot, dueDay, actualDate);
  if (source === 'month') {
    if (kind === 'income') saveMonthInc(); else saveMonthExp();
  } else {
    if (kind === 'income') saveInc(); else saveExp();
  }
  renderResumen(); renderCal();
  if (currentFinPanel === 'gastos') renderExpenses();
  if (currentFinPanel === 'ingresos') renderIncomes();
  toast(kind === 'income' ? `💰 ${record.name || 'Ingreso'} registrado` : `💸 ${record.name || 'Gasto'} registrado`);
}

function confirmDebtScheduledMovement(id, day, slot) {
  const debt = debts.find(d => String(d.id) === String(id));
  if (!debt) return;
  const dueDay = Number(day); if (!dueDay) return;
  const mk = monthKey(Y,M);
  const q = slot === 'q2' ? 'Q2' : slot === 'q1' ? 'Q1' : null;
  if ((debt.payments || []).some(p => p.mk === mk && (!q || p.quincena === q))) return;
  if (!debt.payments) debt.payments = [];
  const actualDate = getActualMovementDate(Y, M) || fluxoMovementDate(Y, M, dueDay);
  debt.payments.push({ mk, amount:Number(debt.cuota)||0, y:Y, m:M, quincena:q, scheduledDate:fluxoMovementDate(Y,M,dueDay), date:actualDate, createdAt:new Date().toISOString() });
  saveDebts(); renderResumen(); renderCal();
  if (currentFinPanel === 'deudas') renderDebts();
  toast(`💳 ${debt.name || 'Deuda'} marcada como pagada`);
}

function confirmSavingScheduledMovement(id, day, slot) {
  const saving = savings.find(s => String(s.id) === String(id));
  if (!saving || saving.completed) return;
  const dueDay = Number(day); if (!dueDay) return;
  const mk = monthKey(Y,M);
  const label = slot === 'q2' ? 'Q2' : slot === 'q1' ? 'Q1' : null;
  const already = (saving.payments || []).some(p => p.mk === mk && !p.initial && p.kind !== 'withdrawal' && p.type !== 'withdrawal' && (!label || p.label === label));
  if (already) return;
  const amount = Math.min(Number(saving.monthly)||0, Math.max(0, Number(saving.goal)||0 - (Number(saving.saved)||0)));
  if (amount <= 0) return;
  const availableNow = getAvailableBalance(Y,M);
  if (amount > availableNow) { toast(`⚠️ No tienes suficiente saldo disponible. Disponible: ${fmt(availableNow)}`); return; }
  if (!saving.payments) saving.payments = [];
  saving.saved = (Number(saving.saved)||0) + amount;
  const actualDate = getActualMovementDate(Y, M) || fluxoMovementDate(Y, M, dueDay);
  saving.payments.push({ mk, amount, y:Y, m:M, label, scheduledDate:fluxoMovementDate(Y,M,dueDay), date:actualDate, createdAt:new Date().toISOString() });
  if (saving.saved >= saving.goal) { saving.completedY=Y; saving.completedM=M; }
  saveSavings(); renderSavings(); renderResumen(); renderCal();
  toast(`🏦 Aporte registrado · ${fmt(amount)}`);
}

// Exposición explícita para los botones inline de Próximos movimientos.
window.confirmScheduledMovement = confirmScheduledMovement;
window.confirmDebtScheduledMovement = confirmDebtScheduledMovement;
window.confirmSavingScheduledMovement = confirmSavingScheduledMovement;

  // ── Actividad reciente (últimos 5 movimientos) ──
  const allActivity = [];
  const { items: expItemsAct } = getCalculatedMonthExpenses(Y, M);
  const { items: incItemsAct  } = getCalculatedMonthIncomes(Y, M);
  const extrasAct = getMonthExtras(Y, M);
  const discDataAct = getMonthDiscounts(Y, M);
  expItemsAct.forEach(e => allActivity.push({ icon: '🛒', iconBg: 'rgba(239,68,68,0.15)', name: e.name, meta: 'Gasto', amount: `-${fmt(e.appliedAmount)}`, color: '#f87171' }));
  incItemsAct.forEach(i => allActivity.push({ icon: '💰', iconBg: 'rgba(16,185,129,0.15)', name: i.name, meta: 'Ingreso', amount: `+${fmt(i.amount)}`, color: '#6ee7b7' }));
  extrasAct.forEach(e => {
    const t = ['⏰','🌙','🎉','📅','➕'][['overtime','nocturnal','holiday','sunday','other'].indexOf(e.type)] || '➕';
    allActivity.push({ icon: t, iconBg: 'rgba(245,158,11,0.15)', name: e.desc || 'Extra', meta: 'Extra/Recargo', amount: `+${fmt(e.qty*e.unitValue)}`, color: '#fbbf24' });
  });
  // Ahorros del mes
  savings.forEach(s => {
    (s.payments || []).filter(p => p.mk === monthKey(Y,M)).forEach(p => {
      allActivity.push({ icon: '🏦', iconBg: 'rgba(59,130,246,0.15)', name: s.name, meta: 'Aporte a ahorro · movimiento interno', amount: `-${fmt(p.amount)}`, color: '#60a5fa' });
    });
  });
  savingsEvents.filter(e => e.y === Y && e.m === M).forEach(e => {
    if (e.type === 'refund') {
      allActivity.push({ icon: '↩️', iconBg: 'rgba(16,185,129,0.15)', name: e.savingName, meta: 'Dinero devuelto de ahorro', amount: `+${fmt(e.amount)}`, color: '#6ee7b7' });
    } else if (e.type === 'destroy') {
      allActivity.push({ icon: '🗑️', iconBg: 'rgba(239,68,68,0.15)', name: e.savingName, meta: 'Ahorro eliminado · dinero no disponible', amount: `-${fmt(e.amount)}`, color: '#f87171' });
    } else if (e.type === 'withdraw') {
      allActivity.push({ icon: '↩️', iconBg: 'rgba(16,185,129,0.15)', name: e.savingName, meta: 'Retiro de ahorro · vuelve al disponible', amount: `+${fmt(e.amount)}`, color: '#6ee7b7' });
    } else if (e.type === 'complete') {
      allActivity.push({ icon: '🏆', iconBg: 'rgba(239,68,68,0.15)', name: e.savingName, meta: 'Meta cumplida · dinero utilizado', amount: `-${fmt(e.amount)}`, color: '#f87171' });
    }
  });
  // Descuentos del mes
  discDataAct.items && discDataAct.items.forEach(d => {
    allActivity.push({ icon: '✂️', iconBg: 'rgba(168,85,247,0.15)', name: d.name, meta: 'Descuento', amount: `-${fmt(d.appliedAmount || d.amount)}`, color: '#c084fc' });
  });
  // Deudas del mes
  debts.forEach(d => {
    (d.payments || []).filter(p => p.mk === monthKey(Y,M)).forEach(p => {
      allActivity.push({ icon: '💳', iconBg: 'rgba(239,68,68,0.12)', name: d.name, meta: 'Cuota deuda', amount: `-${fmt(p.amount)}`, color: '#fca5a5' });
    });
  });
  const recentActivity = allActivity.slice(0, 5);
  const activityHtml = recentActivity.length > 0
    ? recentActivity.map(a => `
      <div class="activity-item">
        <div class="activity-icon" style="background:${a.iconBg}">${a.icon}</div>
        <div class="activity-info">
          <div class="activity-name">${a.name}</div>
          <div class="activity-meta">${a.meta} · ${MONTHS[M]} ${Y}</div>
        </div>
        <div class="activity-amount" style="color:${a.color}">${a.amount}</div>
      </div>`).join('')
    : '<div style="text-align:center;padding:16px;color:var(--text-muted);font-size:13px">Sin movimientos este mes</div>';

  // ── Comparativo vs mes anterior ──
  let prevM = M - 1, prevY = Y;
  if (prevM < 0) { prevM = 11; prevY--; }
  const prevC = isBeforeControl(prevY, prevM) ? null : calcMonth(prevY, prevM);
  const prevBal = prevC ? prevC.balance : null;
  const balDiff = prevBal !== null ? c.balance - prevBal : null;
  const balDiffPct = (prevBal && prevBal !== 0) ? Math.round(((c.balance - prevBal) / Math.abs(prevBal)) * 100) : null;

  document.getElementById('resumen-content').innerHTML = `

    <!-- NAV HEADER -->
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px">
      <button class="nav-btn" onclick="prevMonth()">‹</button>
      <div style="text-align:center">
        <div style="font-size:18px;font-weight:700;color:var(--text)">${MONTHS[M]}</div>
        <div style="font-size:11px;color:var(--accent);font-weight:600">${Y}</div>
      </div>
      <button class="nav-btn" onclick="nextMonth()">›</button>
    </div>

    <!-- HERO SALDO con sparkline y detalles colapsables -->
    ${(() => {
      const sparkData = [];
      for (let i = 5; i >= 0; i--) {
        let sy = Y, sm = M - i;
        while (sm < 0) { sm += 12; sy--; }
        if (!isBeforeControl(sy, sm)) sparkData.push(calcMonth(sy, sm).balance);
      }
      let sparkSvg = '';
      if (sparkData.length > 1) {
        const minV = Math.min(...sparkData);
        const maxV = Math.max(...sparkData);
        const range = maxV - minV || 1;
        const pts = sparkData.map((v, i) => {
          const x = (i / (sparkData.length - 1)) * 90;
          const y = 34 - ((v - minV) / range) * 30;
          return `${x},${y}`;
        }).join(' ');
        sparkSvg = `<svg viewBox="0 0 90 36" style="width:90px;height:36px">
          <defs><linearGradient id="sg" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stop-color="#a78bfa" stop-opacity="0.3"/>
            <stop offset="100%" stop-color="#a78bfa" stop-opacity="0"/>
          </linearGradient></defs>
          <polyline points="${pts}" fill="none" stroke="#a78bfa" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
          <circle cx="${(sparkData.length-1)/(sparkData.length-1)*90}" cy="${34-((sparkData[sparkData.length-1]-minV)/range)*30}" r="3" fill="#a78bfa"/>
        </svg>`;
      }
      const prevAccum  = getPrevAccumulated(Y, M);
      const availableBalance = getAvailableBalance(Y, M);
      const totalSavedAmount = getTotalSavedAmount();
      const totalWealth = getTotalWealth(Y, M);
      return `
    <div class="hero-balance-card">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:4px">
        <div class="hero-balance-label">Saldo total</div>
        <button onclick="toggleResumenDetails()" id="btn-toggle-details"
          style="background:rgba(255,255,255,0.1);border:1px solid rgba(255,255,255,0.15);
                 color:rgba(255,255,255,0.6);border-radius:20px;padding:4px 12px;
                 font-size:11px;font-weight:600;cursor:pointer;font-family:'Outfit',sans-serif;
                 display:flex;align-items:center;gap:4px" id="btn-toggle-details">
          <span id="details-toggle-icon">⌄</span> Detalles
        </button>
      </div>
      <div style="display:flex;justify-content:space-between;align-items:flex-end">
        <div>
          <div class="hero-balance-amount">${fmt(totalWealth)}</div>
          <div style="font-size:11px;color:rgba(255,255,255,0.4);margin-top:2px">Disponible + dinero en ahorros</div>
          ${balDiffPct !== null ? `
          <span class="hero-balance-trend ${balDiffPct >= 0 ? 'up' : 'down'}" style="margin-top:8px;display:inline-flex">
            ${balDiffPct >= 0 ? '↑' : '↓'} ${Math.abs(balDiffPct)}% vs ${MONTHS[prevM]}
          </span>` : ''}
          <div style="margin-top:10px;font-size:10px;color:rgba(255,255,255,0.35)">
            Disponible: <span style="color:${availableBalance>=0?'#6ee7b7':'#f87171'};font-weight:600;font-family:'DM Mono',monospace">${fmt(availableBalance)}</span>
            <span style="margin:0 5px;color:rgba(255,255,255,0.18)">·</span>
            En ahorros: <span style="color:#60a5fa;font-weight:600;font-family:'DM Mono',monospace">${fmt(totalSavedAmount)}</span>
          </div>
        </div>
        ${sparkSvg}
      </div>

      <!-- DETALLES COLAPSABLES -->
      <div id="resumen-details" style="display:none;margin-top:16px;padding-top:16px;border-top:1px solid rgba(255,255,255,0.1)">
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:8px">
          <div style="background:rgba(16,185,129,0.08);border:1px solid rgba(16,185,129,0.14);border-radius:10px;padding:10px">
            <div style="font-size:9px;color:#6ee7b7;letter-spacing:1px;margin-bottom:3px">💵 DISPONIBLE</div>
            <div style="font-size:15px;font-weight:600;color:#6ee7b7;font-family:'DM Mono',monospace">${fmt(availableBalance)}</div>
            <div style="font-size:9px;color:rgba(255,255,255,0.3);margin-top:2px">Dinero disponible para usar</div>
          </div>
          <div style="background:rgba(59,130,246,0.08);border:1px solid rgba(59,130,246,0.14);border-radius:10px;padding:10px">
            <div style="font-size:9px;color:#60a5fa;letter-spacing:1px;margin-bottom:3px">🏦 EN AHORROS</div>
            <div style="font-size:15px;font-weight:600;color:#60a5fa;font-family:'DM Mono',monospace">${fmt(totalSavedAmount)}</div>
            <div style="font-size:9px;color:rgba(255,255,255,0.3);margin-top:2px">Solo metas activas</div>
          </div>
          <div style="background:rgba(255,255,255,0.05);border-radius:10px;padding:10px">
            <div style="font-size:9px;color:rgba(255,255,255,0.4);letter-spacing:1px;margin-bottom:3px">1ª QUINCENA</div>
            <div style="font-size:15px;font-weight:600;color:#93c5fd;font-family:'DM Mono',monospace">${fmt(c.q1earn)}</div>
            <div style="font-size:9px;color:rgba(255,255,255,0.3);margin-top:2px">${salary && salary.type==='fixed' ? 'Fijo' : c.q1h+'h · '+q1w+' turnos'}</div>
          </div>
          <div style="background:rgba(255,255,255,0.05);border-radius:10px;padding:10px">
            <div style="font-size:9px;color:rgba(255,255,255,0.4);letter-spacing:1px;margin-bottom:3px">2ª QUINCENA</div>
            <div style="font-size:15px;font-weight:600;color:#93c5fd;font-family:'DM Mono',monospace">${fmt(c.q2earn)}</div>
            <div style="font-size:9px;color:rgba(255,255,255,0.3);margin-top:2px">${salary && salary.type==='fixed' ? 'Fijo' : c.q2h+'h · '+q2w+' turnos'}</div>
          </div>
          <div style="background:rgba(255,255,255,0.05);border-radius:10px;padding:10px">
            <div style="font-size:9px;color:rgba(255,255,255,0.4);letter-spacing:1px;margin-bottom:3px">DEVENGADO</div>
            <div style="font-size:15px;font-weight:600;color:#c4b5fd;font-family:'DM Mono',monospace">${fmt(c.totalEarn)}</div>
            <div style="font-size:9px;color:rgba(255,255,255,0.3);margin-top:2px">${c.totalHours}h trabajadas</div>
          </div>
          <div style="background:rgba(255,255,255,0.05);border-radius:10px;padding:10px">
            <div style="font-size:9px;color:rgba(255,255,255,0.4);letter-spacing:1px;margin-bottom:3px">EXTRAS</div>
            <div style="font-size:15px;font-weight:600;color:#6ee7b7;font-family:'DM Mono',monospace">+${fmt(incTotal + (c.extrasTotal||0))}</div>
            <div style="font-size:9px;color:rgba(255,255,255,0.3);margin-top:2px">${incItems.length + (c.extrasTotal>0?1:0)} concepto(s)</div>
          </div>
          <div style="background:rgba(255,255,255,0.05);border-radius:10px;padding:10px">
            <div style="font-size:9px;color:rgba(255,255,255,0.4);letter-spacing:1px;margin-bottom:3px">GASTOS</div>
            <div style="font-size:15px;font-weight:600;color:#f87171;font-family:'DM Mono',monospace">-${fmt(expTotal)}</div>
            <div style="font-size:9px;color:rgba(255,255,255,0.3);margin-top:2px">${expItems.length} concepto(s)</div>
          </div>
          <div style="background:rgba(255,255,255,0.05);border-radius:10px;padding:10px">
            <div style="font-size:9px;color:rgba(255,255,255,0.4);letter-spacing:1px;margin-bottom:3px">DESCUENTOS</div>
            <div style="font-size:15px;font-weight:600;color:#c084fc;font-family:'DM Mono',monospace">-${fmt(c.discounts||0)}</div>
            <div style="font-size:9px;color:rgba(255,255,255,0.3);margin-top:2px">${discounts.length} descuento(s)</div>
          </div>
          ${debtTotal > 0 ? `<div style="background:rgba(255,255,255,0.05);border-radius:10px;padding:10px">
            <div style="font-size:9px;color:rgba(255,255,255,0.4);letter-spacing:1px;margin-bottom:3px">DEUDAS</div>
            <div style="font-size:15px;font-weight:600;color:#fca5a5;font-family:'DM Mono',monospace">-${fmt(debtTotal)}</div>
            <div style="font-size:9px;color:rgba(255,255,255,0.3);margin-top:2px">${debts.filter(d=>(d.total-(d.paid||0))>0).length} activa(s)</div>
          </div>` : ''}
          ${c.savingsContrib > 0 ? `<div style="background:rgba(255,255,255,0.05);border-radius:10px;padding:10px">
            <div style="font-size:9px;color:rgba(255,255,255,0.4);letter-spacing:1px;margin-bottom:3px">MOVIMIENTO A AHORROS</div>
            <div style="font-size:15px;font-weight:600;color:#60a5fa;font-family:'DM Mono',monospace">${fmt(c.savingsContrib)}</div>
            <div style="font-size:9px;color:rgba(255,255,255,0.3);margin-top:2px">No es un gasto · dinero apartado</div>
          </div>` : ''}
        </div>
        <!-- Desglose del saldo total -->
        <div style="background:rgba(124,111,247,0.1);border:1px solid rgba(124,111,247,0.2);border-radius:10px;padding:10px;display:flex;justify-content:space-between;align-items:center">
          <div>
            <div style="font-size:9px;color:#a78bfa;letter-spacing:1px;margin-bottom:2px">💰 SALDO TOTAL</div>
            <div style="font-size:9px;color:rgba(255,255,255,0.3)">Disponible + dinero en ahorros</div>
          </div>
          <div style="font-size:18px;font-weight:700;color:${totalWealth>=0?'#a78bfa':'#f87171'};font-family:'DM Mono',monospace">${fmt(totalWealth)}</div>
        </div>
        <!-- Turnos badges -->
        <div class="badges" style="margin-top:10px">${badgesHtml}</div>
      </div>
    </div>`;
    })()}

    <!-- RESUMEN RÁPIDO -->
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px">
      <div style="font-size:13px;font-weight:700;color:var(--text)">Resumen rápido</div>
      <div style="font-size:11px;color:var(--accent);cursor:pointer" onclick="switchTab('estadisticas')">Ver todo →</div>
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;margin-bottom:20px">
      <div class="s-card" style="padding:14px;text-align:center;border:1px solid rgba(16,185,129,0.2)">
        <div style="width:36px;height:36px;border-radius:50%;background:rgba(16,185,129,0.15);display:flex;align-items:center;justify-content:center;font-size:18px;margin:0 auto 8px">💰</div>
        <div style="font-size:10px;color:#a7f3d0;font-weight:600;margin-bottom:4px">Ingresos</div>
        <div style="font-family:'DM Mono',monospace;font-size:13px;font-weight:700;color:#6ee7b7">${fmt(c.totalEarn + incTotal + (c.extrasTotal||0))}</div>
      </div>
      <div class="s-card" style="padding:14px;text-align:center;border:1px solid rgba(239,68,68,0.2)">
        <div style="width:36px;height:36px;border-radius:50%;background:rgba(239,68,68,0.15);display:flex;align-items:center;justify-content:center;font-size:18px;margin:0 auto 8px">🛒</div>
        <div style="font-size:10px;color:#fca5a5;font-weight:600;margin-bottom:4px">Gastos</div>
        <div style="font-family:'DM Mono',monospace;font-size:13px;font-weight:700;color:#f87171">${fmt(expTotal + (c.discounts||0))}</div>
      </div>
      <div class="s-card" style="padding:14px;text-align:center;border:1px solid rgba(59,130,246,0.2)">
        <div style="width:36px;height:36px;border-radius:50%;background:rgba(59,130,246,0.15);display:flex;align-items:center;justify-content:center;font-size:18px;margin:0 auto 8px">🏦</div>
        <div style="font-size:10px;color:#93c5fd;font-weight:600;margin-bottom:4px">Ahorros</div>
        <div style="font-family:'DM Mono',monospace;font-size:13px;font-weight:700;color:#60a5fa">${fmt(c.savingsContrib)}</div>
      </div>
    </div>

    <!-- ACCIONES RÁPIDAS -->
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px">
      <div style="font-size:13px;font-weight:700;color:var(--text)">Acciones rápidas</div>
    </div>
    <div class="quick-actions" style="margin-bottom:20px">
      <div class="quick-btn" onclick="switchTab('finanzas');switchMov('ingresos')">
        <div class="quick-btn-icon" style="background:rgba(16,185,129,0.2)">💰</div>
        <div class="quick-btn-label" style="color:#6ee7b7">+ Ingreso</div>
      </div>
      <div class="quick-btn" onclick="switchTab('finanzas');switchMov('gastos')">
        <div class="quick-btn-icon" style="background:rgba(239,68,68,0.2)">🛒</div>
        <div class="quick-btn-label" style="color:#f87171">+ Gasto</div>
      </div>
      <div class="quick-btn" onclick="switchTab('finanzas');switchMov('ahorros')">
        <div class="quick-btn-icon" style="background:rgba(59,130,246,0.2)">🏦</div>
        <div class="quick-btn-label" style="color:#60a5fa">+ Ahorro</div>
      </div>
      <div class="quick-btn" onclick="showPDFModal()">
        <div class="quick-btn-icon" style="background:rgba(124,111,247,0.2)">📄</div>
        <div class="quick-btn-label" style="color:#c4b5fd">PDF</div>
      </div>
    </div>

    <!-- PRÓXIMOS MOVIMIENTOS -->
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px">
      <div style="font-size:13px;font-weight:700;color:var(--text)">Próximos movimientos</div>
      <div style="font-size:11px;color:var(--accent);cursor:pointer" onclick="setCalendarView('movements');switchTab('calendar')">Ver calendario →</div>
    </div>
    <div class="s-card-full upcoming-card" style="margin-bottom:20px;padding:6px 14px">
      ${upcomingHtml}
    </div>

    <!-- ACTIVIDAD RECIENTE -->
    ${recentActivity.length > 0 ? `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px">
      <div style="font-size:13px;font-weight:700;color:var(--text)">Actividad reciente</div>
      <div style="font-size:11px;color:var(--accent);cursor:pointer" onclick="switchTab('finanzas')">Ver todo →</div>
    </div>
    <div class="s-card-full" style="margin-bottom:12px;padding:0 16px">
      ${activityHtml}
    </div>` : ''}
  `;
}

// ═══════════════════════════════════════════════════════
// RENDER: CALENDAR
// ═══════════════════════════════════════════════════════
let calendarView = 'shifts';
let selectedMovementDay = null;

function setCalendarView(view) {
  calendarView = view === 'movements' ? 'movements' : 'shifts';
  selectedMovementDay = null;
  renderCal();
}

function getMovementDayFromDate(value) {
  if (!value) return null;
  const match = String(value).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match || Number(match[1]) !== Y || Number(match[2]) !== M + 1) return null;
  const day = Number(match[3]);
  return day >= 1 && day <= dim(Y, M) ? day : null;
}

function getMovementCalendarData() {
  const byDay = Array.from({ length: dim(Y, M) + 1 }, () => []);
  const mk = monthKey(Y, M);
  const add = (day, movement) => {
    if (day >= 1 && day < byDay.length) byDay[day].push({ ...movement, day });
  };
  const addRecurring = (records, scope, type, icon, sign) => {
    (records || []).forEach(record => {
      const storedDateDay = getMovementDayFromDate(record.date || record.createdAt);
      if (record.scheduleVersion !== 1 && storedDateDay) {
        add(storedDateDay, { type, icon, sign, name: record.name || type, amount: Number(record.amount) || 0,
          status: 'completed', date: fluxoMovementDate(Y, M, storedDateDay), timestamp: record.date || record.createdAt || '',
          source: scope, recordId: record.id, slot: 'legacy', description: `${record.name || type}${scope === 'month' ? ' · solo este mes' : ''}` });
        return;
      }
      const addRecord = (day, slot, suffix = '') => {
        const dueDay = Number(day); if (!Number.isInteger(dueDay)) return;
        const realized = isScheduledOccurrenceRealized(record, Y, M, dueDay, slot);
        const occ = getScheduledOccurrence(record, Y, M, slot);
        // El calendario de movimientos representa hechos reales, no compromisos.
        // Una programación pendiente vive en Próximos movimientos hasta que se confirma.
        if (record.scheduleVersion === 1 && !realized) return;
        const actualDate = record.scheduleVersion === 1
          ? (occ?.date || fluxoMovementDate(Y, M, dueDay))
          : (record.date || record.createdAt || fluxoMovementDate(Y, M, dueDay));
        const actualDay = getMovementDayFromDate(actualDate);
        if (!actualDay) return;
        add(actualDay, {
          type, icon, sign, name: record.name || type, amount: Number(record.amount) || 0,
          status: 'completed', date: actualDate, timestamp: actualDate,
          source: scope, recordId: record.id, slot,
          description: `${record.name || type}${scope === 'month' ? ' · solo este mes' : ''}${suffix}`
        });
      };
      if (record.type === 'quincenal') { addRecord(record.day, 'q1', ' · Q1'); addRecord(record.day2, 'q2', ' · Q2'); }
      else addRecord(record.day, record.type === 'daily' ? `d${Number(record.day)}` : 'monthly');
    });
  };

  addRecurring(expenses, 'global', 'Gasto normal', '💸', '-');
  addRecurring(monthExpenses[mk], 'month', 'Gasto normal', '💸', '-');
  addRecurring(incomes, 'global', 'Ingreso', '💰', '+');
  addRecurring(monthIncomes[mk], 'month', 'Ingreso', '💰', '+');

  // Extras y descuentos sólo se muestran si su propio registro ya trae fecha.
  // No se asigna una fecha artificial a movimientos que históricamente no la tienen.
  (monthExtras[mk] || []).forEach(extra => {
    const day = getMovementDayFromDate(extra.date || extra.createdAt);
    if (day) add(day, { type: 'Extra', icon: '⏰', sign: '+', name: extra.desc || 'Extra',
      description: extra.desc || 'Extra o recargo', amount: (Number(extra.qty) || 0) * (Number(extra.unitValue) || 0),
      date: fluxoMovementDate(Y, M, day), timestamp: extra.date || extra.createdAt || '' });
  });

  const discountData = getMonthDiscData(Y, M);
  const earnings = calcMonthEarnings(Y, M);
  discountData.allForMonth.forEach(discount => {
    const day = getMovementDayFromDate(discount.date || discount.createdAt);
    if (!day) return;
    const base = discount.freq === 'quincenal'
      ? (day <= 15 ? earnings.q1earn : earnings.q2earn) : earnings.totalEarn;
    const amount = discount.type === 'pct'
      ? (Number(discount.pct) || 0) / 100 * base : Number(discount.fixed) || 0;
    add(day, { type: 'Descuento', icon: '✂️', sign: '-', name: discount.name || 'Descuento',
      description: discount.name || 'Descuento', amount, date: fluxoMovementDate(Y, M, day),
      timestamp: discount.date || discount.createdAt || '' });
  });

  debts.forEach(debt => (debt.payments || []).forEach(payment => {
    if (payment.mk !== mk) return;
    const day = getMovementDayFromDate(payment.date || payment.createdAt) ||
      (payment.quincena === 'Q2' ? Number(debt.day2) : Number(debt.day));
    add(day, { type: 'Pago de deuda', icon: '💳', sign: '-', name: debt.name || 'Deuda',
      description: `${debt.name || 'Deuda'}${payment.quincena ? ` · ${payment.quincena}` : ''}`,
      amount: Number(payment.amount) || 0, date: fluxoMovementDate(Y, M, day),
      timestamp: payment.date || payment.createdAt || '' });
  }));

  savings.forEach(saving => (saving.payments || []).forEach(payment => {
    if (payment.mk !== mk || payment.kind === 'withdrawal' || payment.type === 'withdrawal') return;
    const day = getMovementDayFromDate(payment.date || payment.createdAt) ||
      (payment.initial ? getMovementDayFromDate(saving.startDate) : null) ||
      (payment.label === 'Q2' ? Number(saving.day2) : Number(saving.day));
    add(day, { type: 'Aporte a ahorro', icon: '🏦', sign: '-', name: saving.name || 'Ahorro',
      description: `${saving.name || 'Ahorro'}${payment.initial ? ' · saldo inicial' : payment.label ? ` · ${payment.label}` : ''}`,
      amount: Math.abs(Number(payment.amount) || 0), date: fluxoMovementDate(Y, M, day),
      timestamp: payment.date || payment.createdAt || '' });
  }));

  savingsEvents.forEach(event => {
    const day = getMovementDayFromDate(event.at || event.date || event.createdAt);
    if (!day) return;
    const eventType = event.type === 'withdraw' ? 'Retiro de ahorro'
      : event.type === 'complete' ? 'Meta de ahorro completada'
      : event.type === 'destroy' ? 'Meta de ahorro gastada' : null;
    if (!eventType) return;
    add(day, { type: eventType, icon: event.type === 'withdraw' ? '↩️' : '🏆',
      sign: '-', name: event.savingName || 'Ahorro', description: event.savingName || 'Ahorro',
      amount: Number(event.amount) || 0, date: fluxoMovementDate(Y, M, day), timestamp: event.at || '' });
  });

  return byDay.map(movements => movements.sort((a, b) => String(a.timestamp).localeCompare(String(b.timestamp)) || a.type.localeCompare(b.type)));
}

function selectMovementDay(day) {
  selectedMovementDay = day;
  renderMovementCalendar();
}

function renderMovementCalendar() {
  const total = dim(Y, M);
  const first = fday(Y, M);
  const movementsByDay = getMovementCalendarData();
  let cells = '';
  for (let i = 0; i < first; i++) cells += '<div class="cal-empty"></div>';
  for (let day = 1; day <= total; day++) {
    const movements = movementsByDay[day];
    const isToday = new Date(Y, M, day).getTime() === today.getTime();
    const isSelected = selectedMovementDay === day;
    const movementKinds = [...new Set(movements.map(m => m.type === 'Gasto normal' ? 'expense' : m.type.includes('Ahorro') || m.type.includes('ahorro') ? 'saving' : m.type.includes('deuda') || m.type.includes('Deuda') ? 'debt' : m.type === 'Descuento' ? 'discount' : m.type === 'Extra' ? 'extra' : 'income'))].slice(0, 4);
    const kindDots = movementKinds.map(kind => `<span class="movement-kind-dot ${kind}" aria-hidden="true"></span>`).join('');
    cells += `<button type="button" class="cal-cell movement-cell${movements.length ? ' has-movements' : ''}${isSelected ? ' selected' : ''}"${isToday ? ' data-today="true"' : ''}
      onclick="selectMovementDay(${day})" aria-label="${day} de ${MONTHS[M]}, ${movements.length} movimientos">
      <div class="movement-day-top"><span class="cell-day" style="font-weight:${isToday ? '800' : '700'};color:${isToday ? '#f472b6' : '#e8edff'}">${day}</span>${movements.length ? `<span class="movement-count">${movements.length}</span>` : ''}</div>
      ${movements.length ? `<div class="movement-icons">${movements.slice(0, 3).map((m, idx) => `<span class="movement-icon movement-icon-${idx}">${m.icon}</span>`).join('')}</div><div class="movement-kind-row">${kindDots}</div>` : '<div class="movement-empty">Sin movimientos</div>'}
    </button>`;
  }
  const selected = selectedMovementDay ? movementsByDay[selectedMovementDay] : null;
  const detail = !selected
    ? '<div class="empty-state">Selecciona un día para ver sus movimientos</div>'
    : selected.length === 0
      ? '<div class="empty-state">Sin movimientos</div>'
      : selected.map(movement => `<div class="movement-detail-item">
          <div class="movement-detail-icon">${movement.icon}</div>
          <div class="movement-detail-info"><div class="movement-detail-type">${movement.type}</div><div class="movement-detail-name">${movement.description}</div><div class="movement-detail-date">${fmtLabel(movement.date)}</div></div>
          <div class="movement-detail-amount ${movement.sign === '+' ? 'positive' : 'negative'}">${movement.sign}${fmt(movement.amount)}</div>
        </div>`).join('');
  document.getElementById('cal-content').innerHTML = `
    <div class="month-nav"><button class="nav-btn" onclick="prevMonth()">‹</button><div class="month-label"><div class="month-name">${MONTHS[M]}</div><div class="month-year">${Y}</div></div><button class="nav-btn" onclick="nextMonth()">›</button></div>
    <button class="today-btn" onclick="goToday()">Hoy</button>
    <div class="calendar-view-toggle"><button class="calendar-view-btn" onclick="setCalendarView('shifts')"><span class="calendar-view-icon">📅</span><span>Turnos</span></button><button class="calendar-view-btn active" onclick="setCalendarView('movements')"><span class="calendar-view-icon">💰</span><span>Movimientos</span></button></div>
    <div class="day-headers">${WDAYS.map(day => `<div class="day-header">${day}</div>`).join('')}</div><div class="cal-grid movement-grid">${cells}</div>
    <div class="section-title">📋 Movimientos · ${selectedMovementDay ? fmtLabel(key(Y, M, selectedMovementDay)) : MONTHS[M]}</div><div>${detail}</div>
    <div class="footer">Los movimientos se muestran sólo en los días que ya tienen fecha o día registrados.</div>`;
}

function renderCal() {
  if (calendarView === 'movements') { renderMovementCalendar(); return; }
  const total  = dim(Y, M);
  const first  = fday(Y, M);
  const prefix = `${Y}-${String(M + 1).padStart(2, '0')}-`;
  const monthOv = Object.keys(overrides).filter(k => k.startsWith(prefix)).sort();

  let cells = '';
  for (let i = 0; i < first; i++) cells += `<div class="cal-empty"></div>`;
  for (let d = 1; d <= total; d++) {
    const o   = origShift(Y, M, d);
    const eff = effShift(Y, M, d);
    const s   = getShiftStyle(eff);
    const isToday   = new Date(Y, M, d).getTime() === today.getTime();
    const isAbsent  = eff === 'AUSENTE';
    const isPartial = eff === 'PARCIAL';
    const isIncap   = eff === 'INCAP';
    const isQ1      = d === 15;
    const ov     = overrides[key(Y, M, d)];
    const isSwap = ov && typeof ov === 'object' && ov.type === 'SWAP';
    const h      = effHours(Y, M, d);
    const hasExp = hasDayExpense(Y, M, d);
    const dk     = key(Y, M, d);

    cells += `<div class="cal-cell" data-day="${d}" data-key="${dk}"
      style="background:${s.bg};border:${isToday ? '2px solid #f472b6' : `1px solid ${s.border}`};box-shadow:${isToday ? '0 0 12px rgba(244,114,182,0.5)' : isQ1 ? '0 0 8px rgba(59,130,246,0.35)' : 'none'}"
      onclick="handleCellClick(${Y},${M},${d})"
      oncontextmenu="event.preventDefault();enterMultiMode('${dk}')"
      ontouchstart="startLongPress('${dk}',event)"
      ontouchend="clearLongPress()"
      ontouchmove="clearLongPress()">
      ${isAbsent ? '<div class="cell-dot"></div>' : ''}
      ${isIncap  ? '<div class="cell-incap">🏥</div>' : ''}
      ${isSwap   ? '<div class="cell-incap" style="color:#f59e0b">🔄</div>' : ''}
      ${isQ1     ? '<div class="cell-q1">Q1✓</div>' : ''}
      ${isPartial ? '<div class="cell-partial"></div>' : ''}
      ${hasExp   ? '<div class="cell-expense">💸</div>' : ''}
      <div class="cell-day" style="font-weight:${isToday ? 'bold' : 'normal'};color:${isToday ? '#f472b6' : s.color}">${d}</div>
      <div class="cell-icon">${s.icon}</div>
      <div class="cell-label" style="color:${s.color}">${s.label.toUpperCase()}</div>
      ${(eff !== 'DESCANSO' && eff !== 'AUSENTE' && eff !== 'INCAP') ? `<div class="cell-hours" style="color:${s.color}">${h}h</div>` : ''}
      ${isIncap ? `<div class="cell-hours" style="color:${s.color}">${fmt(getIncapValue(Y, M, d))}</div>` : ''}
    </div>`;
  }

  // Overrides list
  let ovList = '';
  const absentKeys  = monthOv.filter(k => overrides[k] === true);
  const partialKeys = monthOv.filter(k => typeof overrides[k] === 'number');
  const incapKeys   = monthOv.filter(k => overrides[k] === 'INCAP');

  if (absentKeys.length === 0 && partialKeys.length === 0 && incapKeys.length === 0) {
    ovList = '<div class="empty-state">Sin modificaciones en este mes ✓</div>';
  } else {
    absentKeys.forEach(k => {
      const [,, dd] = k.split('-'), d = parseInt(dd), o = origShift(Y, M, d);
      ovList += `<div class="override-item absent">
        <div><div class="override-date absent">🚫 ${fmtLabel(k)}</div>
        <div class="override-orig">${SHIFTS[o].icon} ${SHIFTS[o].label} original · −${fmt(PSHIFT)}</div></div>
        <button class="override-remove absent" onclick="removeOverride('${k}')">Restaurar</button>
      </div>`;
    });
    incapKeys.forEach(k => {
      const [,, dd] = k.split('-'), d = parseInt(dd), o = origShift(Y, M, d);
      ovList += `<div class="override-item" style="background:rgba(8,145,178,0.08);border:1px solid rgba(8,145,178,0.25)">
        <div><div class="override-date" style="color:#7dd3fc;font-weight:600;font-size:12px;margin-bottom:2px">🏥 ${fmtLabel(k)}</div>
        <div class="override-orig">${SHIFTS[o].icon} ${SHIFTS[o].label} original · ${fmt(getIncapValue(Y, M, d))}</div></div>
        <button class="override-remove" style="background:rgba(8,145,178,0.12);border:1px solid rgba(8,145,178,0.25);color:#7dd3fc;border-radius:8px;padding:5px 10px;font-size:10px;cursor:pointer;font-family:'Outfit',sans-serif;font-weight:600" onclick="removeOverride('${k}')">Restaurar</button>
      </div>`;
    });
    partialKeys.forEach(k => {
      const [,, dd] = k.split('-'), d = parseInt(dd), o = origShift(Y, M, d), h = overrides[k];
      ovList += `<div class="override-item partial">
        <div><div class="override-date partial">⏱️ ${fmtLabel(k)}</div>
        <div class="override-orig">${SHIFTS[o].icon} ${SHIFTS[o].label} · ${h}h trabajadas · ${fmt(h * RATE)}</div></div>
        <button class="override-remove partial" onclick="removeOverride('${k}')">Restaurar</button>
      </div>`;
    });
  }

  document.getElementById('cal-content').innerHTML = `
    <div class="month-nav">
      <button class="nav-btn" onclick="prevMonth()">‹</button>
      <div class="month-label">
        <div class="month-name">${MONTHS[M]}</div>
        <div class="month-year">${Y}</div>
      </div>
      <button class="nav-btn" onclick="nextMonth()">›</button>
    </div>
    <button class="today-btn" onclick="goToday()">Hoy</button>
    <div class="calendar-view-toggle"><button class="calendar-view-btn active" onclick="setCalendarView('shifts')"><span class="calendar-view-icon">📅</span><span>Turnos</span></button><button class="calendar-view-btn" onclick="setCalendarView('movements')"><span class="calendar-view-icon">💰</span><span>Movimientos</span></button></div>
    <div class="day-headers">${WDAYS.map(d => `<div class="day-header">${d}</div>`).join('')}</div>
    <div class="cal-grid">${cells}</div>
    <div class="section-title">📋 Modificaciones · ${MONTHS[M]}</div>
    <div>${ovList}</div>
    <div class="footer">
      Mantén presionado un día para selección múltiple · Toca para editar<br>
      ☀️ Día · 🌙 Noche · 😴 Descanso · ⏱️ Parcial · 🚫 Ausente · 🏥 Incapacidad<br>
      <span style="color:#f472b6">●</span> Hoy · <span style="color:#f87171">●</span> Ausente · <span style="color:#f59e0b">●</span> Parcial · 💸 Gasto
    </div>`;

  if (multiMode) updateCellSelection();
}

// ═══════════════════════════════════════════════════════
// RENDER: EXPENSES
// ═══════════════════════════════════════════════════════
function renderExpenses() {
  const { items, total } = getMonthExpenses(Y, M);
  const mk = monthKey(Y, M);
  const globalMonthly    = expenses.filter(e => e.type === 'monthly');
  const globalDaily      = expenses.filter(e => e.type === 'daily');
  const globalQuincenal  = expenses.filter(e => e.type === 'quincenal');
  const localMonthly     = (monthExpenses[mk] || []).filter(e => e.type === 'monthly');
  const localDaily       = (monthExpenses[mk] || []).filter(e => e.type === 'daily');
  const localQuincenal   = (monthExpenses[mk] || []).filter(e => e.type === 'quincenal');
  const totalItems = globalMonthly.length + globalDaily.length + globalQuincenal.length + localMonthly.length + localDaily.length + localQuincenal.length;

  let html = `<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px">
    <button class="nav-btn" onclick="prevMonth()" style="background:rgba(99,102,241,0.1)">‹</button>
    <div style="text-align:center">
      <div style="font-family:'DM Serif Display',serif;font-size:17px;color:#c7d2fe">${MONTHS[M]} ${Y}</div>
    </div>
    <button class="nav-btn" onclick="nextMonth()" style="background:rgba(99,102,241,0.1)">›</button>
  </div>`;

  if (totalItems === 0) {
    html += '<div class="empty-state" style="color:#374151;padding:20px">No hay gastos registrados.<br><span style="font-size:20px">💸</span></div>';
  } else {
    const expItem = (e, src) => `<div class="exp-item ${e.type}">
      <div>
        <div class="exp-name">${e.name}</div>
        <div class="exp-meta">${src === 'global'
          ? (e.type === 'monthly' ? 'Todos los meses'
            : e.type === 'quincenal' ? `Días ${e.day} (Q1) y ${e.day2} (Q2) · todos los meses`
            : `Día ${e.day} · todos los meses`)
          : (e.type === 'monthly' ? `Solo ${MONTHS[M]} ${Y}`
            : e.type === 'quincenal' ? `Días ${e.day} (Q1) y ${e.day2} (Q2) · solo ${MONTHS[M]} ${Y}`
            : `Día ${e.day} · solo ${MONTHS[M]} ${Y}`)}</div>
      </div>
      <div class="exp-right">
        <div class="exp-amount">${fmt(e.amount)}</div>
        <button class="exp-del" onclick="deleteExpense('${src}',${e.id})">✕</button>
      </div>
    </div>`;

    if (globalMonthly.length > 0 || globalDaily.length > 0 || globalQuincenal.length > 0) {
      html += `<div class="section-title">🔁 Gastos Recurrentes (todos los meses)</div>`;
      globalMonthly.forEach(e => html += expItem(e, 'global'));
      globalDaily.forEach(e => html += expItem(e, 'global'));
      globalQuincenal.forEach(e => html += expItem(e, 'global'));
    }
    if (localMonthly.length > 0 || localDaily.length > 0 || localQuincenal.length > 0) {
      html += `<div class="section-title">📅 Solo ${MONTHS[M]} ${Y}</div>`;
      localMonthly.forEach(e => html += expItem(e, 'month'));
      localDaily.forEach(e => html += expItem(e, 'month'));
      localQuincenal.forEach(e => html += expItem(e, 'month'));
    }
    html += `<div class="section-title">💰 Total en ${MONTHS[M]} ${Y}</div>
      <div class="s-card-full" style="margin-bottom:0">
        <div class="card-label" style="color:#fca5a5">Total Gastos del Mes</div>
        <div class="card-amount red" style="font-size:24px">${fmt(total)}</div>
      </div>`;
  }

  const expEl = document.getElementById('expense-list-content'); if(expEl) expEl.innerHTML = html;
}

// ═══════════════════════════════════════════════════════
// EXPENSE ACTIONS
// ═══════════════════════════════════════════════════════
let expenseScope = 'month'; // 'month' | 'all'

function setScopeMonth() {
  expenseScope = 'month';
  document.getElementById('scope-btn-month').classList.add('scope-active');
  document.getElementById('scope-btn-all').classList.remove('scope-active');
}
function setScopeAll() {
  expenseScope = 'all';
  document.getElementById('scope-btn-all').classList.add('scope-active');
  document.getElementById('scope-btn-month').classList.remove('scope-active');
}

function onExpTypeChange() {
  const type  = document.getElementById('exp-type').value;
  const lbl   = document.getElementById('exp-day-label');
  const g2    = document.getElementById('exp-day2-group');
  const dayEl = document.getElementById('exp-day');
  lbl.textContent = type === 'quincenal' ? 'Día Q1' : 'Día del mes';
  g2.style.display = type === 'quincenal' ? 'flex' : 'none';
  dayEl.max = type === 'quincenal' ? '15' : '31';
  dayEl.placeholder = type === 'quincenal' ? '1-15' : '1-31';
}

function addExpense() {
  const name   = document.getElementById('exp-name').value.trim();
  const type   = document.getElementById('exp-type').value;
  const amount = parseInt(document.getElementById('exp-amount').value);
  const day    = parseInt(document.getElementById('exp-day').value);
  const day2   = parseInt(document.getElementById('exp-day2').value);

  if (!name)                { toast('⚠️ Escribe una descripción'); return; }
  if (!amount || amount <= 0) { toast('⚠️ Ingresa un valor válido'); return; }
  if (type === 'quincenal' && (!day || day < 1 || day > 15)) { toast('⚠️ El día Q1 debe ser entre 1 y 15'); return; }
  if (type !== 'quincenal' && (!day || day < 1 || day > 31)) { toast('⚠️ Indica el día del mes (1-31)'); return; }
  if (type === 'quincenal' && (!day2 || day2 < 16 || day2 > 31)) { toast('⚠️ El día Q2 debe ser entre 16 y 31'); return; }

  const entry = {
    id: Date.now(), name, type, amount, day,
    day2: type === 'quincenal' ? day2 : null,
    date: expenseScope === 'month' ? fluxoMovementDate(Y, M, day) : null,
    scheduleVersion: 1, startY: Y, startM: M, registeredDate: fluxoMovementDate(today.getFullYear(), today.getMonth(), today.getDate()), occurrences: {}
  };
  if (expenseScope === 'all') { expenses.push(entry); saveExp(); }
  else {
    const mk = monthKey(Y, M);
    if (!monthExpenses[mk]) monthExpenses[mk] = [];
    monthExpenses[mk].push(entry); saveMonthExp();
  }
  document.getElementById('exp-name').value   = '';
  document.getElementById('exp-amount').value = '';
  document.getElementById('exp-day').value    = '';
  document.getElementById('exp-day2').value   = '';
  renderExpenses(); renderResumen();
  toast('✅ Gasto agregado');
}

function showDeleteConfirm({
  title = '¿Eliminar este registro?',
  message = 'Esta acción no se puede deshacer.'
} = {}) {
  return new Promise(resolve => {
    const existing = document.getElementById('fluxo-confirm-modal');
    if (existing) existing.remove();

    const modal = document.createElement('div');
    modal.id = 'fluxo-confirm-modal';
    modal.className = 'fluxo-confirm-overlay';
    modal.innerHTML = `
      <div class="fluxo-confirm-card" role="dialog" aria-modal="true" aria-labelledby="fluxo-confirm-title">
        <div class="fluxo-confirm-icon">🗑️</div>
        <div id="fluxo-confirm-title" class="fluxo-confirm-title">${title}</div>
        <div class="fluxo-confirm-message">${message}</div>
        <div class="fluxo-confirm-actions">
          <button type="button" class="fluxo-confirm-btn fluxo-confirm-cancel">Cancelar</button>
          <button type="button" class="fluxo-confirm-btn fluxo-confirm-delete">Eliminar</button>
        </div>
      </div>`;

    document.body.appendChild(modal);
    requestAnimationFrame(() => modal.classList.add('open'));

    let settled = false;
    const finish = value => {
      if (settled) return;
      settled = true;
      modal.classList.remove('open');
      setTimeout(() => modal.remove(), 180);
      resolve(value);
    };

    modal.querySelector('.fluxo-confirm-cancel').addEventListener('click', () => finish(false));
    modal.querySelector('.fluxo-confirm-delete').addEventListener('click', () => finish(true));
    modal.addEventListener('click', e => {
      if (e.target === modal) finish(false);
    });

    const onKey = e => {
      if (e.key === 'Escape') {
        document.removeEventListener('keydown', onKey);
        finish(false);
      }
    };
    document.addEventListener('keydown', onKey);
  });
}

async function deleteExpense(src, id) {
  const ok = await showDeleteConfirm({ title: '¿Eliminar este gasto?', message: 'El gasto se eliminará de tus registros y esta acción no se puede deshacer.' });
  if (!ok) return;
  if (src === 'global') {
    expenses = expenses.filter(e => e.id !== id);
    saveExp();
  } else {
    const mk = monthKey(Y, M);
    if (monthExpenses[mk]) monthExpenses[mk] = monthExpenses[mk].filter(e => e.id !== id);
    saveMonthExp();
  }
  renderExpenses();
  toast('🗑️ Gasto eliminado');
}

// ═══════════════════════════════════════════════════════
// DESCUENTOS
// ═══════════════════════════════════════════════════════
let discScope = 'global'; // 'global' | 'month'

function setDiscScopeAll() {
  discScope = 'global';
  document.getElementById('disc-scope-btn-all').classList.add('scope-active');
  document.getElementById('disc-scope-btn-month').classList.remove('scope-active');
}
function setDiscScopeMonth() {
  discScope = 'month';
  document.getElementById('disc-scope-btn-month').classList.add('scope-active');
  document.getElementById('disc-scope-btn-all').classList.remove('scope-active');
}

function toggleDiscType() {
  const t = document.getElementById('disc-type').value;
  document.getElementById('disc-pct-group').style.display   = t === 'pct'   ? 'flex' : 'none';
  document.getElementById('disc-fixed-group').style.display = t === 'fixed' ? 'flex' : 'none';
}

function addDiscount() {
  const name  = document.getElementById('disc-name').value.trim();
  const freq  = document.getElementById('disc-freq').value;
  const type  = document.getElementById('disc-type').value;
  const pct   = parseFloat(document.getElementById('disc-pct').value);
  const fixed = parseInt(document.getElementById('disc-fixed').value);
  if (!name)                              { toast('⚠️ Escribe el nombre del descuento'); return; }
  if (type === 'pct'   && (!pct   || pct   <= 0)) { toast('⚠️ Ingresa el porcentaje'); return; }
  if (type === 'fixed' && (!fixed || fixed <= 0)) { toast('⚠️ Ingresa el valor'); return; }

  const entry = { id: Date.now(), name, freq, type, pct: type === 'pct' ? pct : null, fixed: type === 'fixed' ? fixed : null, scope: discScope };

  if (discScope === 'global') {
    discounts.push(entry);
    saveDisc();
  } else {
    const mk = monthKey(Y, M);
    if (!discountMonths[mk]) discountMonths[mk] = { disabled: [], extras: [] };
    discountMonths[mk].extras.push(entry);
    saveDiscMon();
  }
  document.getElementById('disc-name').value  = '';
  document.getElementById('disc-pct').value   = '';
  document.getElementById('disc-fixed').value = '';
  renderDiscounts();
  renderResumen();
  toast('✅ Descuento agregado');
}

async function deleteDiscount(id, scope) {
  const ok = await showDeleteConfirm({ title: '¿Eliminar este descuento?', message: 'El descuento se eliminará de tus registros y esta acción no se puede deshacer.' });
  if (!ok) return;
  if (scope === 'global') {
    discounts = discounts.filter(d => d.id !== id);
    saveDisc();
    Object.keys(discountMonths).forEach(mk => {
      if (discountMonths[mk].disabled) discountMonths[mk].disabled = discountMonths[mk].disabled.filter(x => x !== id);
    });
    saveDiscMon();
  } else {
    const mk = monthKey(Y, M);
    if (discountMonths[mk]?.extras) discountMonths[mk].extras = discountMonths[mk].extras.filter(d => d.id !== id);
    saveDiscMon();
  }
  renderDiscounts();
  renderResumen();
  toast('🗑️ Descuento eliminado');
}

function toggleDiscountMonth(id) {
  const mk = monthKey(Y, M);
  if (!discountMonths[mk]) discountMonths[mk] = { disabled: [], extras: [] };
  const disabled = discountMonths[mk].disabled;
  const idx = disabled.indexOf(id);
  if (idx >= 0) disabled.splice(idx, 1); else disabled.push(id);
  saveDiscMon();
  renderDiscounts();
  renderResumen();
}

function renderDiscounts() {
  const earn     = calcMonthEarnings(Y, M);
  const discData = getMonthDiscounts(Y, M);
  const { extras, disabled } = getMonthDiscData(Y, M);
  const mk = monthKey(Y, M);

  const discItem = (d, isGlobal) => {
    const isDisabled = isGlobal && disabled.includes(d.id);
    const valQ1  = d.type === 'pct' ? (d.pct / 100) * earn.q1earn    : d.fixed;
    const valQ2  = d.type === 'pct' ? (d.pct / 100) * earn.q2earn    : d.fixed;
    const valM   = d.type === 'pct' ? (d.pct / 100) * earn.totalEarn : d.fixed;
    const label  = d.type === 'pct' ? `${d.pct}%` : fmt(d.fixed);
    const preview = d.freq === 'quincenal'
      ? `1ª: ${fmt(valQ1)} · 2ª: ${fmt(valQ2)}`
      : `Mensual: ${fmt(valM)}`;
    const scopeBadge = isGlobal
      ? `<span class="disc-scope-badge global">Todos los meses</span>`
      : `<span class="disc-scope-badge month">Solo ${MONTHS[M]}</span>`;
    const toggleBtn = isGlobal
      ? `<button class="disc-toggle ${isDisabled ? 'off' : ''}" onclick="toggleDiscountMonth(${d.id})">${isDisabled ? 'OFF' : 'ON'}</button>`
      : '';
    return `<div class="disc-item ${d.freq}${isDisabled ? ' disabled' : ''}">
      <div style="flex:1">
        <div class="exp-name">${d.name}</div>
        <div class="exp-meta">${d.freq === 'quincenal' ? 'Quincenal' : 'Mensual'} · ${label}</div>
        ${scopeBadge}
        ${!isDisabled
          ? `<div class="exp-meta" style="color:#9ca3af;margin-top:2px">${preview}</div>`
          : '<div class="exp-meta" style="color:#64748b;margin-top:2px">Desactivado este mes</div>'}
      </div>
      <div class="exp-right">
        <span class="disc-pct-badge">${label}</span>
        ${toggleBtn}
        <button class="exp-del" onclick="deleteDiscount(${d.id},'${isGlobal ? 'global' : 'month'}')">✕</button>
      </div>
    </div>`;
  };

  const allGlobal = discounts;
  const allExtras = (discountMonths[mk]?.extras) || [];
  let html = '';

  if (allGlobal.length === 0 && allExtras.length === 0) {
    html = '<div class="empty-state" style="color:#374151;padding:20px">No hay descuentos registrados.<br><span style="font-size:20px">✂️</span></div>';
  } else {
    const globalQ = allGlobal.filter(d => d.freq === 'quincenal');
    const globalM = allGlobal.filter(d => d.freq === 'mensual');
    const extraQ  = allExtras.filter(d => d.freq === 'quincenal');
    const extraM  = allExtras.filter(d => d.freq === 'mensual');

    if (globalQ.length > 0 || globalM.length > 0) {
      html += `<div class="section-title">🔁 Descuentos Globales</div>`;
      globalQ.forEach(d => html += discItem(d, true));
      globalM.forEach(d => html += discItem(d, true));
    }
    if (allExtras.length > 0) {
      html += `<div class="section-title">📅 Solo ${MONTHS[M]} ${Y}</div>`;
      extraQ.forEach(d => html += discItem(d, false));
      extraM.forEach(d => html += discItem(d, false));
    }
    html += `<div class="section-title">✂️ Total Descuentos — ${MONTHS[M]} ${Y}</div>
      <div class="s-card-full" style="margin-bottom:0;background:linear-gradient(135deg,#1e0a3c,#2e1065)">
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:8px">
          <div>
            <div class="card-label" style="color:#c084fc">1ª Quincena</div>
            <div class="card-amount" style="color:#c084fc;font-size:16px">${fmt(discData.q1disc)}</div>
          </div>
          <div>
            <div class="card-label" style="color:#c084fc">2ª Quincena</div>
            <div class="card-amount" style="color:#c084fc;font-size:16px">${fmt(discData.q2disc)}</div>
          </div>
        </div>
        <div class="card-label" style="color:#e9d5ff">Total Mes</div>
        <div class="card-amount" style="color:#e9d5ff;font-size:24px">${fmt(discData.total)}</div>
      </div>`;
  }

  const discEl = document.getElementById('discount-list-content');
  if (discEl) discEl.innerHTML = html;
}

// ═══════════════════════════════════════════════════════
// NOTIFICACIONES — movimientos programados
// La entrega real de avisos con la app cerrada se completa
// mediante Web Push. Este bloque gestiona permiso, estado y
// la suscripción local; el envío se realiza desde el backend.
// ═══════════════════════════════════════════════════════
const NOTIF_KEY = 'fluxo_notifications_enabled';
let notifEnabled = FinanceStorage.getRaw(NOTIF_KEY) === 'true';

async function renderNotifStatus() {
  const btn = document.getElementById('notif-toggle-btn');
  const status = document.getElementById('notif-status');
  if (!btn || !status) return;

  if (!('Notification' in window) || !('serviceWorker' in navigator)) {
    btn.textContent = 'No disponible';
    btn.disabled = true;
    btn.style.cssText = 'background:#374151;color:#9ca3af;border-radius:20px;padding:7px 16px;font-size:12px;font-weight:700;cursor:not-allowed;font-family:Outfit,sans-serif;border:none;';
    status.textContent = 'Este dispositivo/navegador no permite notificaciones web.';
    return;
  }

  if (notifEnabled && Notification.permission === 'granted') {
    btn.textContent = 'Desactivar 🔕';
    btn.disabled = false;
    btn.style.cssText = 'background:#7f1d1d;color:#fca5a5;border-radius:20px;padding:7px 16px;font-size:12px;font-weight:700;cursor:pointer;font-family:Outfit,sans-serif;border:none;';
    const subscribed = await window.FluxoNotifications?.isSubscribed?.();
    status.innerHTML = subscribed
      ? '✅ Activadas · Lista para recibir avisos de movimientos programados.'
      : '✅ Permiso concedido · preparando avisos de movimientos programados.';
    return;
  }

  btn.disabled = false;
  btn.textContent = 'Activar 🔔';
  btn.style.cssText = 'background:#14532d;color:#6ee7b7;border-radius:20px;padding:7px 16px;font-size:12px;font-weight:700;cursor:pointer;font-family:Outfit,sans-serif;border:none;';
  status.textContent = Notification.permission === 'denied'
    ? '⚠️ Bloqueadas en tu navegador. Actívalas en Configuración.'
    : 'Desactivadas';
}

async function toggleNotifications() {
  if (!('Notification' in window) || !('serviceWorker' in navigator)) {
    toast('Tu dispositivo no soporta notificaciones web');
    return;
  }

  if (notifEnabled) {
    notifEnabled = false;
    FinanceStorage.setRaw(NOTIF_KEY, 'false');
    try { await window.FluxoNotifications?.unsubscribe?.(); } catch (_) {}
    toast('🔕 Notificaciones desactivadas');
    renderNotifStatus();
    return;
  }

  const perm = Notification.permission === 'granted'
    ? 'granted'
    : await Notification.requestPermission();

  if (perm !== 'granted') {
    toast('⚠️ Permiso de notificaciones no concedido.');
    renderNotifStatus();
    return;
  }

  try {
    const ready = await window.FluxoNotifications?.subscribe?.();
    if (!ready) {
      toast('⚠️ No se pudo preparar la suscripción de notificaciones.');
      renderNotifStatus();
      return;
    }
    notifEnabled = true;
    FinanceStorage.setRaw(NOTIF_KEY, 'true');
    await window.FluxoNotifications?.showTest?.();
    toast('🔔 Notificaciones activadas');
  } catch (err) {
    console.error('FluxoApp notifications:', err);
    toast('⚠️ No se pudieron activar las notificaciones.');
  }
  renderNotifStatus();
}

window.renderNotifStatus = renderNotifStatus;
window.toggleNotifications = toggleNotifications;

// ═══════════════════════════════════════════════════════
// MODAL: TURNO
// ═══════════════════════════════════════════════════════
let partialHoursSelected = null;

function openModal(y, m, d) {
  const o   = origShift(y, m, d);
  selKey    = key(y, m, d);
  const ov  = overrides[selKey];
  const absent        = ov === true;
  const incap         = ov && typeof ov === 'object' && ov.type === 'INCAP';
  const partial       = typeof ov === 'number';
  const isSwap        = ov && typeof ov === 'object' && ov.type === 'SWAP';
  const isSwapPartial = ov && typeof ov === 'object' && ov.type === 'SWAP_PARTIAL';
  const eff = effShift(y, m, d);
  const s   = getShiftStyle(eff);
  partialHoursSelected = null;

  document.getElementById('m-date').textContent = `${WFULL[new Date(y, m, d).getDay()]}, ${fmtLabel(selKey)}`;
  document.getElementById('m-shift').style.cssText = `background:${s.bg}33;border:1px solid ${s.border}`;
  document.getElementById('m-shift').innerHTML = `
    <div class="modal-shift-icon">${s.icon}</div>
    <div class="modal-shift-name" style="color:${s.color}">${s.label}</div>
    <div class="modal-shift-detail" style="color:${s.color}">${
      absent        ? 'Turno original: ' + getShiftStyle(o).icon + ' ' + getShiftStyle(o).label
      : incap       ? `Valor incapacidad: ${fmt(getIncapValue(y, m, d))}`
      : partial     ? `${ov}h trabajadas · ${fmt(ov * RATE)}`
      : isSwapPartial ? `Mocho ${ov.hours}h · Cambiado desde ${getShiftStyle(o).icon} ${getShiftStyle(o).label} · ${fmt(ov.hours * RATE)}`
      : isSwap      ? `Cambiado desde ${getShiftStyle(o).icon} ${getShiftStyle(o).label} · ${effHours(y,m,d)}h · ${fmt(effEarnings(y,m,d))}`
      : `${effHours(y,m,d)}h · ${fmt(effEarnings(y,m,d))}`
    }</div>`;

  const isDescanso = o === 'DESCANSO' || isRestShift(o);
  const modified   = absent || incap || partial || isSwapPartial;
  const swapOnly   = isSwap && !isSwapPartial;

  document.getElementById('m-notice').style.display  = absent  ? 'block' : 'none';
  document.getElementById('m-incap').style.display   = incap   ? 'block' : 'none';
  if (incap)        document.getElementById('m-incap').textContent   = `🏥 Incapacidad · ${fmt(getIncapValue(y, m, d))}`;
  document.getElementById('m-partial').style.display = (partial || isSwapPartial) ? 'block' : 'none';
  if (partial)      document.getElementById('m-partial').textContent = `⏱️ Turno parcial: ${ov}h trabajadas · ${fmt(ov * RATE)}`;
  if (isSwapPartial) document.getElementById('m-partial').textContent = `⏱️ Turno mocho: ${ov.hours}h trabajadas · ${fmt(ov.hours * RATE)}`;
  document.getElementById('partial-selector').style.display = 'none';
  document.getElementById('incap-selector').style.display   = 'none';

  const canSwap = !absent && !incap && !partial && !isSwapPartial;
  const swapDiv = document.getElementById('swap-btns');
  if (canSwap) {
    if (schedule && (schedule.type === 'cycle' || schedule.type === 'rotating') && schedule.shiftTypes) {
      // Mostrar botones dinámicos para cada tipo de turno del schedule
      swapDiv.innerHTML = schedule.shiftTypes.map(st => {
        if (isRestShift(st.id)) return '';
        const isCurrent = eff === st.id;
        return `<button class="modal-btn" style="display:${isCurrent ? 'none' : 'block'};
          background:${st.color}22;border:1px solid ${st.color}66;color:${st.color}"
          onclick="swapShift('${st.id}')">
          🔄 Cambiar a ${st.name}
        </button>`;
      }).join('') + `<button id="btn-swap-extra" class="modal-btn" style="display:block" onclick="swapShift('DÍA')" style="display:none"></button>`;
      swapDiv.style.display = 'block';
    } else {
      swapDiv.innerHTML = `
        <button id="btn-swap-dia"   class="modal-btn" onclick="swapShift('DÍA')"   style="display:${eff !== 'DÍA'   ? 'block' : 'none'}">☀️ Cambiar a Día</button>
        <button id="btn-swap-noche" class="modal-btn" onclick="swapShift('NOCHE')" style="display:${eff !== 'NOCHE' ? 'block' : 'none'}">🌙 Cambiar a Noche</button>`;
      swapDiv.style.display = 'block';
    }
  } else {
    swapDiv.style.display = 'none';
  }

  const canPartial     = !modified && !isDescanso;
  const canPartialSwap = swapOnly;
  document.getElementById('btn-partial').style.display = (canPartial || canPartialSwap) ? 'block' : 'none';

  const canIncap  = (!modified && !swapOnly) || isDescanso || swapOnly;
  const showIncap = canIncap && !absent && !partial && !isSwapPartial;
  document.getElementById('btn-incap').style.display  = showIncap ? 'block' : 'none';
  document.getElementById('btn-absent').style.display = (!modified && !isDescanso && !swapOnly) ? 'block' : 'none';

  const anyOverride = absent || incap || partial || isSwap || isSwapPartial;
  document.getElementById('btn-restore').style.display = anyOverride ? 'block' : 'none';

  document.getElementById('modal').classList.add('open');
}

function showPartialSelector() {
  const sel = document.getElementById('partial-selector');
  sel.style.display = 'block';
  document.getElementById('btn-partial').style.display = 'none';
  document.getElementById('btn-absent').style.display  = 'none';

  const grid = document.getElementById('hours-grid');
  grid.innerHTML = '';
  for (let h = 1; h < HOURS; h++) {
    const btn = document.createElement('button');
    btn.className = 'hour-btn' + (partialHoursSelected === h ? ' selected' : '');
    btn.textContent = `${h}h`;
    btn.onclick = () => {
      partialHoursSelected = h;
      grid.querySelectorAll('.hour-btn').forEach(b => b.classList.remove('selected'));
      btn.classList.add('selected');
    };
    grid.appendChild(btn);
  }
  if (!document.getElementById('btn-confirm-partial')) {
    const confirm = document.createElement('button');
    confirm.id        = 'btn-confirm-partial';
    confirm.className = 'modal-btn btn-partial';
    confirm.textContent = '✅ Confirmar turno parcial';
    confirm.onclick = confirmPartial;
    sel.after(confirm);
  }
  document.getElementById('btn-confirm-partial').style.display = 'block';
}

function confirmPartial() {
  if (!partialHoursSelected) { toast('⚠️ Selecciona las horas trabajadas'); return; }
  if (!selKey) return;
  const ov     = overrides[selKey];
  const isSwap = ov && typeof ov === 'object' && ov.type === 'SWAP';
  overrides[selKey] = isSwap
    ? { type: 'SWAP_PARTIAL', shift: ov.shift, hours: partialHoursSelected }
    : partialHoursSelected;
  save(); closeModal();
  toast(`⏱️ Turno mocho: ${partialHoursSelected}h · ${fmt(partialHoursSelected * RATE)}`);
  renderCal(); renderResumen();
}

function swapShift(newShift) {
  if (!selKey) return;
  const parts = selKey.split('-');
  const y = parseInt(parts[0]), mo = parseInt(parts[1]) - 1, d = parseInt(parts[2]);
  const o = origShift(y, mo, d);
  if (o === newShift) { delete overrides[selKey]; }
  else { overrides[selKey] = { type: 'SWAP', shift: newShift }; }
  save(); closeModal();
  toast(`🔄 Turno cambiado a ${SHIFTS[newShift].icon} ${SHIFTS[newShift].label}`);
  renderCal(); renderResumen();
}

function closeModal() {
  document.getElementById('modal').classList.remove('open');
  const confirmBtn = document.getElementById('btn-confirm-partial');
  if (confirmBtn) confirmBtn.style.display = 'none';
  document.getElementById('partial-selector').style.display = 'none';
  document.getElementById('incap-selector').style.display   = 'none';
  document.getElementById('swap-btns').style.display        = 'none';
  document.getElementById('btn-absent').style.display  = 'block';
  document.getElementById('btn-incap').style.display   = 'block';
  document.getElementById('btn-partial').style.display = 'block';
}

function closeBg(e) { if (e.target === document.getElementById('modal')) closeModal(); }

function markAbsent() {
  if (!selKey) return;
  overrides[selKey] = true; save(); closeModal();
  toast('📋 Día registrado como no laborado');
  renderCal(); renderResumen();
}

function showIncapSelector() {
  document.getElementById('incap-selector').style.display = 'block';
  document.getElementById('btn-incap').style.display   = 'none';
  document.getElementById('btn-partial').style.display = 'none';
  document.getElementById('btn-absent').style.display  = 'none';
  document.getElementById('incap-value-input').value = '';
  document.getElementById('incap-value-input').focus();
}

function confirmIncapacity() {
  const val = parseInt(document.getElementById('incap-value-input').value);
  if (!val || val <= 0) { toast('⚠️ Ingresa el valor del día de incapacidad'); return; }
  if (!selKey) return;
  overrides[selKey] = { type: 'INCAP', value: val };
  save(); closeModal();
  toast(`🏥 Incapacidad registrada · ${fmt(val)}`);
  renderCal(); renderResumen();
}

function restoreDay() {
  if (!selKey) return;
  delete overrides[selKey]; save(); closeModal();
  toast('✅ Turno restaurado');
  renderCal(); renderResumen();
}

function removeOverride(k) {
  delete overrides[k]; save();
  toast('✅ Turno restaurado');
  renderCal(); renderResumen();
}

// ═══════════════════════════════════════════════════════
// INGRESOS EXTRAS
// ═══════════════════════════════════════════════════════
let incomeScope = 'month';

function setIncScopeMonth() {
  incomeScope = 'month';
  document.getElementById('inc-scope-btn-month').classList.add('scope-active');
  document.getElementById('inc-scope-btn-all').classList.remove('scope-active');
}
function setIncScopeAll() {
  incomeScope = 'all';
  document.getElementById('inc-scope-btn-all').classList.add('scope-active');
  document.getElementById('inc-scope-btn-month').classList.remove('scope-active');
}

function onIncTypeChange() {
  const type  = document.getElementById('inc-type').value;
  const lbl   = document.getElementById('inc-day-label');
  const g2    = document.getElementById('inc-day2-group');
  const dayEl = document.getElementById('inc-day');
  lbl.textContent = type === 'quincenal' ? 'Día Q1' : 'Día del mes';
  g2.style.display = type === 'quincenal' ? 'flex' : 'none';
  dayEl.max = type === 'quincenal' ? '15' : '31';
  dayEl.placeholder = type === 'quincenal' ? '1-15' : '1-31';
}

function addIncome() {
  const name   = document.getElementById('inc-name').value.trim();
  const type   = document.getElementById('inc-type').value;
  const amount = parseInt(document.getElementById('inc-amount').value);
  const day    = parseInt(document.getElementById('inc-day').value);
  const day2   = parseInt(document.getElementById('inc-day2').value);

  if (!name)                  { toast('⚠️ Escribe una descripción'); return; }
  if (!amount || amount <= 0) { toast('⚠️ Ingresa un valor válido'); return; }
  if (type === 'quincenal' && (!day || day < 1 || day > 15)) { toast('⚠️ El día Q1 debe ser entre 1 y 15'); return; }
  if (type !== 'quincenal' && (!day || day < 1 || day > 31)) { toast('⚠️ Indica el día del mes (1-31)'); return; }
  if (type === 'quincenal' && (!day2 || day2 < 16 || day2 > 31)) { toast('⚠️ El día Q2 debe ser entre 16 y 31'); return; }

  const entry = {
    id: Date.now(), name, type, amount, day,
    day2: type === 'quincenal' ? day2 : null,
    date: incomeScope === 'month' ? fluxoMovementDate(Y, M, day) : null,
    scheduleVersion: 1, startY: Y, startM: M, registeredDate: fluxoMovementDate(today.getFullYear(), today.getMonth(), today.getDate()), occurrences: {}
  };
  if (incomeScope === 'all') { incomes.push(entry); saveInc(); }
  else {
    const mk = monthKey(Y, M);
    if (!monthIncomes[mk]) monthIncomes[mk] = [];
    monthIncomes[mk].push(entry); saveMonthInc();
  }
  document.getElementById('inc-name').value   = '';
  document.getElementById('inc-amount').value = '';
  document.getElementById('inc-day').value    = '';
  document.getElementById('inc-day2').value   = '';
  renderIncomes(); renderResumen();
  toast('✅ Ingreso agregado');
}

async function deleteIncome(src, id) {
  const ok = await showDeleteConfirm({ title: '¿Eliminar este ingreso?', message: 'El ingreso se eliminará de tus registros y esta acción no se puede deshacer.' });
  if (!ok) return;
  if (src === 'global') {
    incomes = incomes.filter(i => i.id !== id); saveInc();
  } else {
    const mk = monthKey(Y, M);
    if (monthIncomes[mk]) monthIncomes[mk] = monthIncomes[mk].filter(i => i.id !== id);
    saveMonthInc();
  }
  renderIncomes(); renderResumen();
  toast('🗑️ Ingreso eliminado');
}

function renderIncomes() {
  const { items, total } = getMonthIncomes(Y, M);
  const mk = monthKey(Y, M);
  const globalList = incomes;
  const localList  = monthIncomes[mk] || [];

  const incItem = (i, src) => `<div class="exp-item monthly" style="border-left-color:var(--green)">
    <div>
      <div class="exp-name">${i.name}</div>
      <div class="exp-meta">${src === 'global'
        ? (i.type === 'monthly' ? 'Todos los meses' : `Día ${i.day} · todos los meses`)
        : (i.type === 'monthly' ? `Solo ${MONTHS[M]} ${Y}` : `Día ${i.day} · solo ${MONTHS[M]} ${Y}`)}</div>
    </div>
    <div class="exp-right">
      <div class="exp-amount" style="color:var(--green)">+${fmt(i.amount)}</div>
      <button class="exp-del" onclick="deleteIncome('${src}',${i.id})">✕</button>
    </div>
  </div>`;

  let html = `<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px">
    <button class="nav-btn" onclick="prevMonth()" style="background:rgba(16,185,129,0.1)">‹</button>
    <div style="text-align:center">
      <div style="font-family:'DM Serif Display',serif;font-size:17px;color:#c7d2fe">${MONTHS[M]} ${Y}</div>
    </div>
    <button class="nav-btn" onclick="nextMonth()" style="background:rgba(16,185,129,0.1)">›</button>
  </div>`;

  if (globalList.length === 0 && localList.length === 0) {
    html += '<div class="empty-state" style="color:#374151;padding:20px">No hay ingresos extras.<br><span style="font-size:20px">💰</span></div>';
  } else {
    if (globalList.length > 0) {
      html += `<div class="section-title">🔁 Ingresos Recurrentes</div>`;
      globalList.forEach(i => html += incItem(i, 'global'));
    }
    if (localList.length > 0) {
      html += `<div class="section-title">📅 Solo ${MONTHS[M]} ${Y}</div>`;
      localList.forEach(i => html += incItem(i, 'month'));
    }
    html += `<div class="section-title">💰 Total Ingresos — ${MONTHS[M]} ${Y}</div>
      <div class="s-card-full" style="background:linear-gradient(135deg,#052e16,#064e3b);border-color:rgba(16,185,129,0.25)">
        <div style="position:absolute;top:0;left:0;right:0;height:2px;background:linear-gradient(90deg,#10b981,#34d399,transparent)"></div>
        <div class="card-label" style="color:#6ee7b7">Total Ingresos Extras del Mes</div>
        <div class="card-amount green" style="font-size:24px">+${fmt(total)}</div>
      </div>`;
  }
  const incEl = document.getElementById('income-list-content'); if(incEl) incEl.innerHTML = html;
}

// ═══════════════════════════════════════════════════════
// DEUDAS
// ═══════════════════════════════════════════════════════
function onDebtFreqChange() {
  const freq  = document.getElementById('debt-freq').value;
  const g2    = document.getElementById('debt-day2-group');
  const lbl   = document.getElementById('debt-day-label');
  const dayEl = document.getElementById('debt-day');
  lbl.textContent  = freq === 'quincenal' ? 'Día pago Q1' : 'Día de pago';
  g2.style.display = freq === 'quincenal' ? 'flex' : 'none';
  dayEl.max = freq === 'quincenal' ? '15' : '31';
  dayEl.placeholder = freq === 'quincenal' ? '1-15' : '1-31';
}

function addDebt() {
  const name  = document.getElementById('debt-name').value.trim();
  const freq  = document.getElementById('debt-freq').value;
  const total = parseInt(document.getElementById('debt-total').value);
  const cuota = parseInt(document.getElementById('debt-cuota').value);
  const day   = parseInt(document.getElementById('debt-day').value);
  const day2  = parseInt(document.getElementById('debt-day2').value);
  const paid  = parseInt(document.getElementById('debt-paid').value) || 0;

  if (!name)                { toast('⚠️ Escribe el nombre de la deuda'); return; }
  if (!total || total <= 0) { toast('⚠️ Ingresa el monto total'); return; }
  if (!cuota || cuota <= 0) { toast('⚠️ Ingresa el valor de la cuota'); return; }
  if (freq === 'quincenal' && (!day || day < 1 || day > 15)) { toast('⚠️ El día Q1 debe ser entre 1 y 15'); return; }
  if (freq !== 'quincenal' && (!day || day < 1 || day > 31)) { toast('⚠️ Indica el día del mes (1-31)'); return; }
  if (freq === 'quincenal' && (!day2 || day2 < 16 || day2 > 31)) { toast('⚠️ El día Q2 debe ser entre 16 y 31'); return; }

  debts.push({
    id: Date.now(), name, freq, total, cuota, day,
    day2: freq === 'quincenal' ? day2 : null, paid,
    startY: Y, startM: M,
    startDate: fluxoMovementDate(Y, M, day), registeredDate: fluxoMovementDate(today.getFullYear(), today.getMonth(), today.getDate())
  });
  saveDebts();
  document.getElementById('debt-name').value  = '';
  document.getElementById('debt-total').value = '';
  document.getElementById('debt-cuota').value = '';
  document.getElementById('debt-day').value   = '';
  document.getElementById('debt-day2').value  = '';
  document.getElementById('debt-paid').value  = '';
  renderDebts(); renderResumen();
  toast('✅ Deuda agregada');
}

function payDebtInstallment(id, customAmount) {
  const debt = debts.find(d => d.id === id);
  if (!debt) return;
  const mk = monthKey(Y, M);
  if (!debt.payments) debt.payments = [];
  const paymentsThisMonth = debt.payments.filter(p => p.mk === mk);
  const maxPerMonth = debt.freq === 'quincenal' ? 2 : 1;
  if (paymentsThisMonth.length >= maxPerMonth) {
    toast(debt.freq === 'quincenal'
      ? '⚠️ Ya registraste las 2 cuotas de este mes (Q1 y Q2)'
      : '⚠️ Ya registraste la cuota de este mes');
    return;
  }
  // Si no viene monto personalizado, pedir al usuario
  if (customAmount === undefined) {
    showDebtAmountModal(id, debt.cuota, paymentsThisMonth.length, debt.freq);
    return;
  }
  const amount = parseFloat(customAmount);
  if (isNaN(amount) || amount <= 0) { toast('⚠️ Ingresa un monto válido'); return; }
  const toApply = Math.min(amount, debt.total - (debt.paid || 0));
  if (toApply <= 0) return;
  debt.paid = (debt.paid || 0) + toApply;
  const quincena = debt.freq === 'quincenal' ? (paymentsThisMonth.length === 0 ? 'Q1' : 'Q2') : null;
  debt.payments.push({ mk, amount: toApply, y: Y, m: M, quincena, date: getActualMovementDate(Y, M) || null, createdAt: new Date().toISOString() });
  if (debt.paid >= debt.total) { debt.completedY = Y; debt.completedM = M; }
  saveDebts(); renderDebts(); renderResumen();
  const pending = debt.total - debt.paid;
  const label = quincena ? ` (${quincena})` : '';
  toast(pending <= 0 ? '🎉 ¡Deuda saldada!' : `💳 Cuota${label} registrada · Pendiente: ${fmt(pending)}`);
}

function showDebtAmountModal(id, defaultAmount, paidCount, freq) {
  const quincenaLabel = freq === 'quincenal' ? (paidCount === 0 ? ' (Q1)' : ' (Q2)') : '';
  const existing = document.getElementById('custom-amount-modal');
  if (existing) existing.remove();
  const modal = document.createElement('div');
  modal.id = 'custom-amount-modal';
  modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.7);z-index:9999;display:flex;align-items:center;justify-content:center;padding:20px';
  modal.innerHTML = `
    <div style="background:#1e2640;border:1px solid rgba(99,102,241,0.3);border-radius:16px;padding:24px;width:100%;max-width:320px">
      <div style="font-size:16px;font-weight:700;color:#e2e8f0;margin-bottom:4px">💳 Registrar cuota${quincenaLabel}</div>
      <div style="font-size:12px;color:#64748b;margin-bottom:16px">Cuota sugerida: ${fmt(defaultAmount)}</div>
      <input id="modal-amount-input" type="number" inputmode="numeric" placeholder="${defaultAmount}"
        style="width:100%;background:#0f172a;border:1px solid rgba(99,102,241,0.3);border-radius:8px;padding:10px 12px;color:#e2e8f0;font-size:16px;box-sizing:border-box;margin-bottom:12px"/>
      <div style="display:flex;gap:8px">
        <button onclick="document.getElementById('custom-amount-modal').remove()"
          style="flex:1;background:rgba(100,116,139,0.15);border:1px solid rgba(100,116,139,0.3);color:#94a3b8;border-radius:8px;padding:10px;font-size:13px;cursor:pointer">Cancelar</button>
        <button onclick="confirmDebtAmount(${id})"
          style="flex:1;background:rgba(16,185,129,0.15);border:1px solid rgba(16,185,129,0.3);color:#6ee7b7;border-radius:8px;padding:10px;font-size:13px;font-weight:600;cursor:pointer">Registrar</button>
      </div>
    </div>`;
  document.body.appendChild(modal);
  setTimeout(() => document.getElementById('modal-amount-input').focus(), 100);
}

function confirmDebtAmount(id) {
  const val = document.getElementById('modal-amount-input').value;
  document.getElementById('custom-amount-modal').remove();
  payDebtInstallment(id, val);
}

async function deleteDebt(id) {
  const ok = await showDeleteConfirm({ title: '¿Eliminar esta deuda?', message: 'La deuda y su información asociada se eliminarán. Esta acción no se puede deshacer.' });
  if (!ok) return;
  debts = debts.filter(d => d.id !== id);
  saveDebts(); renderDebts(); renderResumen();
  toast('🗑️ Deuda eliminada');
}

function renderDebts() {
  const currIdx = Y * 12 + M;
  // Solo mostrar deudas que ya iniciaron en el mes actual o antes
  const visible = debts.filter(d => {
    const dy = (d.startY != null && d.startY > 0) ? d.startY : today.getFullYear();
    const dm = (d.startY != null && d.startY > 0) ? (d.startM != null ? d.startM : today.getMonth()) : today.getMonth();
    if ((dy * 12 + dm) > currIdx) return false; // antes del inicio
    // Si está saldada, solo mostrar el mes en que se completó
    const isSettled = (d.total - (d.paid || 0)) <= 0;
    if (isSettled && d.completedY != null) {
      return (d.completedY * 12 + d.completedM) === currIdx;
    }
    return true;
  });
  const active  = visible.filter(d => (d.total - (d.paid || 0)) > 0);
  const settled = visible.filter(d => (d.total - (d.paid || 0)) <= 0);

  const debtCard = (d) => {
    const pending    = d.total - (d.paid || 0);
    const pct        = Math.round(((d.paid || 0) / d.total) * 100);
    const cuotasLeft = pending > 0 ? Math.ceil(pending / (d.freq === 'quincenal' ? d.cuota * 2 : d.cuota)) : 0;
    const isSettled  = pending <= 0;
    const diaLabel   = d.freq === 'quincenal'
      ? `Días ${d.day} (Q1) y ${d.day2} (Q2)`
      : `Día ${d.day}`;
    // Verificar si ya pagó este mes
    const mk = monthKey(Y, M);
    const paymentsThisMonth = (d.payments || []).filter(p => p.mk === mk).length;
    const maxPerMonth = d.freq === 'quincenal' ? 2 : 1;
    const paidThisMonth = paymentsThisMonth >= maxPerMonth;
    const btnLabel = d.freq === 'quincenal'
      ? (paymentsThisMonth === 0 ? '✅ Registrar cuota Q1' : paymentsThisMonth === 1 ? '✅ Registrar cuota Q2' : '✔ Q1 y Q2 registradas')
      : (paidThisMonth ? '✔ Cuota del mes pagada' : '✅ Registrar cuota');
    // Historial de cuotas (solo para saldadas)
    const historial = isSettled && (d.payments || []).length > 0
      ? `<div style="margin-top:10px;border-top:1px solid rgba(99,102,241,0.2);padding-top:8px">
          <div style="font-size:10px;color:#818cf8;font-weight:600;letter-spacing:1px;margin-bottom:6px">HISTORIAL DE CUOTAS</div>
          ${[...(d.payments)].sort((a,b)=>(a.y*12+a.m)-(b.y*12+b.m)).map(p =>
            `<div style="display:flex;justify-content:space-between;font-size:11px;color:#94a3b8;padding:2px 0">
              <span>${MONTHS[p.m]} ${p.y}${p.quincena ? ' · ' + p.quincena : ''}</span>
              <span style="color:#6ee7b7;font-weight:600">${fmt(p.amount)}</span>
            </div>`
          ).join('')}
        </div>`
      : '';
    return `<div class="debt-card" style="${isSettled ? 'opacity:0.75' : ''}">
      <div class="debt-card-header">
        <div>
          <div class="debt-name">${d.name}</div>
          <div class="debt-meta">📅 ${diaLabel} · ${d.freq === 'quincenal' ? 'Quincenal' : 'Mensual'}</div>
          ${!isSettled ? `<div class="debt-meta" style="color:var(--amber);margin-top:2px">~${cuotasLeft} mes${cuotasLeft !== 1 ? 'es' : ''} restante${cuotasLeft !== 1 ? 's' : ''}</div>` : ''}
        </div>
        <div style="text-align:right">
          <div class="debt-amount total">${fmt(d.total)}</div>
          <div class="debt-amount ${isSettled ? 'paid' : 'pending'}">${isSettled ? '✅ Saldada' : fmt(pending)}</div>
          ${d.paid > 0 ? `<div class="debt-amount paid">Pagado: ${fmt(d.paid)}</div>` : ''}
        </div>
      </div>
      <div class="debt-progress-wrap">
        <div class="debt-progress-bar">
          <div class="debt-progress-fill" style="width:${pct}%${isSettled ? ';background:linear-gradient(90deg,#6366f1,#818cf8)' : ''}"></div>
        </div>
        <div class="debt-progress-label">
          <span>${pct}% pagado</span>
          <span>${fmt(d.paid || 0)} / ${fmt(d.total)}</span>
        </div>
      </div>
      ${historial}
      <div class="debt-footer" style="margin-top:${isSettled ? '4px' : '10px'}">
        <div>
          <div class="debt-cuota-info">Cuota ${d.freq === 'quincenal' ? 'quincenal' : 'mensual'}</div>
          <div class="debt-cuota-val">${fmt(d.cuota)}${d.freq === 'quincenal' ? ` × 2 = ${fmt(d.cuota * 2)}/mes` : '/mes'}</div>
        </div>
        <div style="display:flex;gap:6px">
          ${!isSettled ? `<button onclick="payDebtInstallment(${d.id})" style="background:${paidThisMonth ? 'rgba(99,102,241,0.12)' : 'rgba(16,185,129,0.12)'};border:1px solid ${paidThisMonth ? 'rgba(99,102,241,0.3)' : 'rgba(16,185,129,0.3)'};color:${paidThisMonth ? '#a5b4fc' : '#6ee7b7'};border-radius:8px;padding:6px 10px;font-size:11px;cursor:pointer;font-family:'Outfit',sans-serif;font-weight:600">${btnLabel}</button>` : ''}
          <button onclick="deleteDebt(${d.id})" class="exp-del">✕</button>
        </div>
      </div>
    </div>`;
  };

  const totalMes = getMonthDebtPayment(Y, M);
  let html = '';

  if (debts.length === 0) {
    html = '<div class="empty-state" style="color:#374151;padding:20px">No hay deudas registradas.<br><span style="font-size:20px">💳</span></div>';
  } else {
    if (active.length > 0) {
      html += `<div class="section-title">🔴 Deudas Activas</div>`;
      active.forEach(d => html += debtCard(d));
    }
    if (settled.length > 0) {
      html += `<div class="section-title">✅ Saldadas</div>`;
      settled.forEach(d => html += debtCard(d));
    }
    if (totalMes > 0) {
      html += `<div class="section-title">💳 Cuotas de este mes</div>
        <div class="s-card-full" style="background:linear-gradient(135deg,#2d0a0a,#450a0a);border-color:rgba(239,68,68,0.2)">
          <div style="position:absolute;top:0;left:0;right:0;height:2px;background:linear-gradient(90deg,#ef4444,#f97316,transparent)"></div>
          <div class="card-label" style="color:#fca5a5">Total a pagar — ${MONTHS[M]} ${Y}</div>
          <div class="card-amount red" style="font-size:24px">${fmt(totalMes)}</div>
        </div>`;
    }
  }
  const debtListEl = document.getElementById('debt-list-content'); if(debtListEl) debtListEl.innerHTML = html;
}


// ═══════════════════════════════════════════════════════
// AHORROS
// ═══════════════════════════════════════════════════════
function onSavFreqChange() {
  const freq  = document.getElementById('sav-freq').value;
  const g2    = document.getElementById('sav-day2-group');
  const lbl   = document.getElementById('sav-day-label');
  const mlbl  = document.getElementById('sav-monthly-label');
  const dayEl = document.getElementById('sav-day');
  if (freq === 'quincenal') {
    lbl.textContent   = 'Día aporte Q1';
    g2.style.display  = 'flex';
    mlbl.textContent  = 'Aporte por quincena ($)';
    dayEl.max         = '15';
    dayEl.placeholder = '1-15';
  } else if (freq === 'daily') {
    lbl.textContent   = 'Día del mes (cualquiera)';
    g2.style.display  = 'none';
    mlbl.textContent  = 'Aporte diario ($)';
    dayEl.max         = '31';
    dayEl.placeholder = '1-31';
  } else {
    lbl.textContent   = 'Día de aporte';
    g2.style.display  = 'none';
    mlbl.textContent  = 'Aporte mensual ($)';
    dayEl.max         = '31';
    dayEl.placeholder = '1-31';
  }
}

function addSaving() {
  const name    = document.getElementById('sav-name').value.trim();
  const freq    = document.getElementById('sav-freq').value;
  const goal    = parseInt(document.getElementById('sav-goal').value);
  const monthly = parseInt(document.getElementById('sav-monthly').value);
  const saved   = parseInt(document.getElementById('sav-saved').value) || 0;
  const day     = parseInt(document.getElementById('sav-day').value);
  const day2    = parseInt(document.getElementById('sav-day2').value);

  if (!name)                    { toast('⚠️ Escribe el nombre del ahorro'); return; }
  if (!goal || goal <= 0)       { toast('⚠️ Ingresa la meta'); return; }
  if (saved > goal)            { toast('⚠️ El ahorro inicial no puede superar la meta'); return; }
  if (!monthly || monthly <= 0) { toast('⚠️ Ingresa el valor del aporte'); return; }
  if (freq === 'quincenal' && (!day || day < 1 || day > 15)) { toast('⚠️ El día Q1 debe ser entre 1 y 15'); return; }
  if (freq === 'monthly' && (!day || day < 1 || day > 31)) { toast('⚠️ Indica el día del mes (1-31)'); return; }
  if (freq === 'quincenal' && (!day2 || day2 < 16 || day2 > 31)) { toast('⚠️ El día Q2 debe ser entre 16 y 31'); return; }

  if (saved > 0) {
    const availableNow = getAvailableBalance(Y, M);
    if (saved > availableNow) {
      toast(`⚠️ No tienes suficiente saldo disponible. Disponible: ${fmt(availableNow)}`);
      return;
    }
  }

  const initialPayment = saved > 0 ? [{ mk: monthKey(Y, M), amount: saved, y: Y, m: M, label: 'Saldo inicial', initial: true }] : [];
  savings.push({
    id: Date.now(), name, freq: freq || 'monthly', goal, monthly, saved, day,
    day2: freq === 'quincenal' ? day2 : null,
    startY: Y, startM: M, startDate: fluxoMovementDate(Y, M, day), registeredDate: fluxoMovementDate(today.getFullYear(), today.getMonth(), today.getDate()), payments: initialPayment
  });
  saveSavings();
  document.getElementById('sav-name').value    = '';
  document.getElementById('sav-goal').value    = '';
  document.getElementById('sav-monthly').value = '';
  document.getElementById('sav-saved').value   = '';
  document.getElementById('sav-day').value     = '';
  document.getElementById('sav-day2').value    = '';
  renderSavings(); renderResumen();
  toast('✅ Meta de ahorro agregada');
}

function contributeToSaving(id, dayOverride) {
  const s = savings.find(sv => sv.id === id);
  if (!s) return;
  if (s.completed) { toast('⚠️ Esta meta está en Metas cumplidas'); return; }
  const sy = (s.startY != null && s.startY > 0) ? s.startY : today.getFullYear();
  const sm = (s.startY != null && s.startY > 0) ? (s.startM != null ? s.startM : today.getMonth()) : today.getMonth();
  if ((Y * 12 + M) < (sy * 12 + sm)) { toast('⚠️ Este ahorro aún no había iniciado en este mes'); return; }
  const freq = s.freq || 'monthly';
  const mk   = monthKey(Y, M);
  if (!s.payments) s.payments = [];
  const paymentsThisMonth = s.payments.filter(p => p.mk === mk && !p.initial && p.kind !== 'withdrawal' && Number(p.amount) > 0);

  // Calcular máximo de aportes permitidos este mes según frecuencia
  let maxPerMonth;
  if (freq === 'daily') {
    // días del mes actual
    maxPerMonth = new Date(Y, M + 1, 0).getDate();
  } else if (freq === 'quincenal') {
    maxPerMonth = 2;
  } else {
    maxPerMonth = 1;
  }

  if (paymentsThisMonth.length >= maxPerMonth) {
    const msg = freq === 'daily'
      ? `⚠️ Ya registraste los ${maxPerMonth} aportes de este mes`
      : freq === 'quincenal'
        ? '⚠️ Ya registraste los 2 aportes (Q1 y Q2) de este mes'
        : '⚠️ Ya registraste el aporte de este mes';
    toast(msg); return;
  }

  // Si no viene monto personalizado, pedir al usuario
  if (dayOverride === undefined) {
    showSavingAmountModal(s.id, s.monthly, paymentsThisMonth.length, freq);
    return;
  }
  const amount = parseFloat(dayOverride);
  if (isNaN(amount) || amount <= 0) { toast('⚠️ Ingresa un monto válido'); return; }
  const availableNow = getAvailableBalance(Y, M);
  if (amount > availableNow) {
    toast(`⚠️ No tienes suficiente saldo disponible. Disponible: ${fmt(availableNow)}`);
    return;
  }
  const toApply = Math.min(amount, s.goal - (s.saved || 0));
  if (toApply <= 0) return;
  s.saved = (s.saved || 0) + toApply;

  let label = null;
  if (freq === 'quincenal') label = paymentsThisMonth.length === 0 ? 'Q1' : 'Q2';
  if (freq === 'daily')     label = `Día ${paymentsThisMonth.length + 1}`;

  s.payments.push({ mk, amount: toApply, y: Y, m: M, label, date: getActualMovementDate(Y, M) || null, createdAt: new Date().toISOString() });
  if (s.saved >= s.goal) { s.completedY = Y; s.completedM = M; }
  saveSavings(); renderSavings(); renderResumen();
  const pending = s.goal - s.saved;
  const lstr = label ? ` (${label})` : '';
  toast(pending <= 0 ? '🎉 ¡Meta alcanzada!' : `🏦 Aporte${lstr} registrado · Falta: ${fmt(pending)}`);
}

function showSavingAmountModal(id, defaultAmount, paidCount, freq) {
  const labelExtra = freq === 'quincenal' ? (paidCount === 0 ? ' (Q1)' : ' (Q2)') : '';
  const existing = document.getElementById('custom-amount-modal');
  if (existing) existing.remove();
  const modal = document.createElement('div');
  modal.id = 'custom-amount-modal';
  modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.7);z-index:9999;display:flex;align-items:center;justify-content:center;padding:20px';
  modal.innerHTML = `
    <div style="background:#1e2640;border:1px solid rgba(59,130,246,0.3);border-radius:16px;padding:24px;width:100%;max-width:320px">
      <div style="font-size:16px;font-weight:700;color:#e2e8f0;margin-bottom:4px">🏦 Registrar aporte${labelExtra}</div>
      <div style="font-size:12px;color:#64748b;margin-bottom:16px">Aporte sugerido: ${fmt(defaultAmount)}</div>
      <input id="modal-amount-input" type="number" inputmode="numeric" placeholder="${defaultAmount}"
        style="width:100%;background:#0f172a;border:1px solid rgba(59,130,246,0.3);border-radius:8px;padding:10px 12px;color:#e2e8f0;font-size:16px;box-sizing:border-box;margin-bottom:12px"/>
      <div style="display:flex;gap:8px">
        <button onclick="document.getElementById('custom-amount-modal').remove()"
          style="flex:1;background:rgba(100,116,139,0.15);border:1px solid rgba(100,116,139,0.3);color:#94a3b8;border-radius:8px;padding:10px;font-size:13px;cursor:pointer">Cancelar</button>
        <button onclick="confirmSavingAmount(${id})"
          style="flex:1;background:rgba(59,130,246,0.15);border:1px solid rgba(59,130,246,0.3);color:#93c5fd;border-radius:8px;padding:10px;font-size:13px;font-weight:600;cursor:pointer">Registrar</button>
      </div>
    </div>`;
  document.body.appendChild(modal);
  setTimeout(() => document.getElementById('modal-amount-input').focus(), 100);
}

function confirmSavingAmount(id) {
  const val = document.getElementById('modal-amount-input').value;
  document.getElementById('custom-amount-modal').remove();
  contributeToSaving(id, val);
}

async function completeSaving(id) {
  const s = savings.find(sv => sv.id === id);
  if (!s) return;
  const saved = Number(s.saved) || 0;
  const goal = Number(s.goal) || 0;
  if (saved < goal) {
    toast('⚠️ Primero debes alcanzar el 100% de la meta');
    return;
  }
  const ok = await showDeleteConfirm({
    title: '¿Marcar esta meta como cumplida?',
    message: 'Al marcarla como cumplida se entiende que el dinero fue utilizado para alcanzar tu objetivo. La meta pasará al historial y dejará de formar parte de tu Saldo Total.',
    confirmLabel: 'Sí, marcar cumplida',
    icon: '🏆'
  });
  if (!ok) return;
  s.completed = true;
  s.completedY = Y;
  s.completedM = M;
  s.completedAt = new Date().toISOString();

  // Al completar la meta, el dinero ya había sido descontado del disponible
  // mediante sus aportes. Por eso NO se registra en savingsSpent aquí: hacerlo
  // volvería a descontar el mismo dinero. Lo que necesitamos es registrar el
  // hecho de que el ahorro fue utilizado para que aparezca en Actividad reciente.
  if (saved > 0) {
    addSavingsEvent('complete', s.name, saved, Y, M);
  }

  saveSavings();
  renderSavings();
  renderSavingsHistory();
  renderResumen();
  toast('🏆 Meta cumplida · el dinero fue retirado del saldo');
}

async function editSaving(id) {
  const s = savings.find(sv => sv.id === id);
  if (!s || s.completed) return;
  const existing = document.getElementById('saving-edit-modal');
  if (existing) existing.remove();
  const modal = document.createElement('div');
  modal.id = 'saving-edit-modal';
  modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.78);z-index:10000;display:flex;align-items:center;justify-content:center;padding:20px;backdrop-filter:blur(5px)';
  modal.innerHTML = `
    <div style="width:100%;max-width:390px;background:#111827;border:1px solid rgba(96,165,250,.22);border-radius:18px;padding:22px;box-shadow:0 20px 60px rgba(0,0,0,.45)">
      <div style="font-size:20px;font-weight:700;color:#f1f5f9;margin-bottom:14px">✏️ Editar ahorro</div>
      <label style="display:block;font-size:11px;color:#94a3b8;margin:10px 0 5px">Nombre</label>
      <input id="sav-edit-name" value="${String(s.name || '').replace(/"/g,'&quot;')}" style="width:100%;box-sizing:border-box;background:#0f172a;border:1px solid rgba(96,165,250,.25);border-radius:9px;padding:10px;color:#e2e8f0">
      <label style="display:block;font-size:11px;color:#94a3b8;margin:10px 0 5px">Meta objetivo</label>
      <input id="sav-edit-goal" type="number" min="${Math.max(1, Number(s.saved)||1)}" value="${Number(s.goal)||0}" style="width:100%;box-sizing:border-box;background:#0f172a;border:1px solid rgba(96,165,250,.25);border-radius:9px;padding:10px;color:#e2e8f0">
      <label style="display:block;font-size:11px;color:#94a3b8;margin:10px 0 5px">Aporte programado</label>
      <input id="sav-edit-monthly" type="number" min="1" value="${Number(s.monthly)||0}" style="width:100%;box-sizing:border-box;background:#0f172a;border:1px solid rgba(96,165,250,.25);border-radius:9px;padding:10px;color:#e2e8f0">
      <div style="display:flex;gap:8px;margin-top:18px">
        <button onclick="document.getElementById('saving-edit-modal').remove()" style="flex:1;background:rgba(100,116,139,.12);border:1px solid rgba(100,116,139,.25);color:#94a3b8;border-radius:9px;padding:10px;cursor:pointer">Cancelar</button>
        <button onclick="saveEditedSaving(${id})" style="flex:1;background:rgba(59,130,246,.14);border:1px solid rgba(59,130,246,.3);color:#93c5fd;border-radius:9px;padding:10px;font-weight:700;cursor:pointer">Guardar</button>
      </div>
    </div>`;
  document.body.appendChild(modal);
  modal.onclick = e => { if (e.target === modal) modal.remove(); };
}

function saveEditedSaving(id) {
  const s = savings.find(sv => sv.id === id);
  if (!s) return;
  const name = document.getElementById('sav-edit-name')?.value.trim();
  const goal = Number(document.getElementById('sav-edit-goal')?.value);
  const monthly = Number(document.getElementById('sav-edit-monthly')?.value);
  if (!name) { toast('⚠️ Escribe el nombre del ahorro'); return; }
  if (!goal || goal <= 0 || goal < (Number(s.saved)||0)) { toast('⚠️ La meta no puede ser menor que lo ya ahorrado'); return; }
  if (!monthly || monthly <= 0) { toast('⚠️ Ingresa un aporte válido'); return; }
  s.name = name; s.goal = goal; s.monthly = monthly;
  saveSavings();
  document.getElementById('saving-edit-modal')?.remove();
  renderSavings(); renderResumen();
  toast('✅ Ahorro actualizado');
}

function withdrawFromSaving(id) {
  const s = savings.find(sv => sv.id === id);
  if (!s || s.completed) return;
  const availableSaved = Number(s.saved) || 0;
  if (availableSaved <= 0) { toast('⚠️ Esta meta no tiene dinero para retirar'); return; }
  const existing = document.getElementById('saving-withdraw-modal');
  if (existing) existing.remove();
  const modal = document.createElement('div');
  modal.id = 'saving-withdraw-modal';
  modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.78);z-index:10000;display:flex;align-items:center;justify-content:center;padding:20px;backdrop-filter:blur(5px)';
  modal.innerHTML = `
    <div style="width:100%;max-width:350px;background:#111827;border:1px solid rgba(16,185,129,.22);border-radius:18px;padding:22px">
      <div style="font-size:20px;font-weight:700;color:#f1f5f9;margin-bottom:5px">↩️ Retirar dinero</div>
      <div style="font-size:12px;color:#94a3b8;margin-bottom:14px">Disponible en esta meta: <strong style="color:#6ee7b7">${fmt(availableSaved)}</strong></div>
      <input id="sav-withdraw-amount" type="number" min="1" max="${availableSaved}" placeholder="Monto a retirar" style="width:100%;box-sizing:border-box;background:#0f172a;border:1px solid rgba(16,185,129,.25);border-radius:9px;padding:11px;color:#e2e8f0;font-size:16px">
      <div style="display:flex;gap:8px;margin-top:16px">
        <button onclick="document.getElementById('saving-withdraw-modal').remove()" style="flex:1;background:rgba(100,116,139,.12);border:1px solid rgba(100,116,139,.25);color:#94a3b8;border-radius:9px;padding:10px;cursor:pointer">Cancelar</button>
        <button onclick="confirmSavingWithdrawal(${id})" style="flex:1;background:rgba(16,185,129,.12);border:1px solid rgba(16,185,129,.3);color:#6ee7b7;border-radius:9px;padding:10px;font-weight:700;cursor:pointer">Retirar</button>
      </div>
    </div>`;
  document.body.appendChild(modal);
  modal.onclick = e => { if (e.target === modal) modal.remove(); };
}

function confirmSavingWithdrawal(id) {
  const s = savings.find(sv => sv.id === id);
  const input = document.getElementById('sav-withdraw-amount');
  const amount = Number(input?.value);
  if (!s || s.completed || !amount || amount <= 0) { toast('⚠️ Ingresa un monto válido'); return; }
  if (amount > (Number(s.saved)||0)) { toast('⚠️ No puedes retirar más de lo ahorrado'); return; }
  const mk = monthKey(Y, M);
  if (!s.payments) s.payments = [];
  s.saved = (Number(s.saved)||0) - amount;
  s.payments.push({ mk, amount: -amount, y: Y, m: M, label: 'Retiro', kind: 'withdrawal' });
  saveSavings();
  document.getElementById('saving-withdraw-modal')?.remove();
  addSavingsEvent('withdraw', s.name, amount, Y, M);
  renderSavings(); renderResumen();
  toast(`↩️ ${fmt(amount)} devueltos al saldo disponible`);
}

function showSavingDeleteChoice(id) {
  const s = savings.find(sv => sv.id === id);
  if (!s) return Promise.resolve(null);
  const amount = Number(s.saved) || 0;
  const existing = document.getElementById('saving-delete-choice-modal');
  if (existing) existing.remove();

  return new Promise(resolve => {
    const modal = document.createElement('div');
    modal.id = 'saving-delete-choice-modal';
    modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.78);z-index:10000;display:flex;align-items:center;justify-content:center;padding:20px;backdrop-filter:blur(5px)';
    modal.innerHTML = `
      <div style="width:100%;max-width:390px;background:#111827;border:1px solid rgba(96,165,250,0.22);border-radius:18px;padding:22px;box-shadow:0 20px 60px rgba(0,0,0,.45)">
        <div style="font-size:28px;margin-bottom:8px">🗑️</div>
        <div style="font-size:17px;font-weight:700;color:#f1f5f9;margin-bottom:6px">¿Eliminar esta meta?</div>
        <div style="font-size:12px;line-height:1.55;color:#94a3b8;margin-bottom:16px">La meta <strong style="color:#e2e8f0">${s.name}</strong> tiene <strong style="color:#60a5fa">${fmt(amount)}</strong> apartados. ¿Qué quieres hacer con ese dinero?</div>
        <div style="display:grid;gap:8px">
          <button id="sav-refund-btn" style="width:100%;background:rgba(16,185,129,0.12);border:1px solid rgba(16,185,129,0.28);color:#6ee7b7;border-radius:10px;padding:11px 12px;font-size:12px;font-weight:700;cursor:pointer;font-family:'Outfit',sans-serif">↩️ Devolver ${fmt(amount)} al saldo disponible</button>
          <button id="sav-destroy-btn" style="width:100%;background:rgba(239,68,68,0.10);border:1px solid rgba(239,68,68,0.25);color:#fca5a5;border-radius:10px;padding:11px 12px;font-size:12px;font-weight:700;cursor:pointer;font-family:'Outfit',sans-serif">🗑️ Eliminar meta y dinero</button>
          <button id="sav-cancel-btn" style="width:100%;background:rgba(100,116,139,0.10);border:1px solid rgba(100,116,139,0.22);color:#94a3b8;border-radius:10px;padding:10px 12px;font-size:12px;font-weight:600;cursor:pointer;font-family:'Outfit',sans-serif">Cancelar</button>
        </div>
      </div>`;
    document.body.appendChild(modal);

    const finish = value => { modal.remove(); resolve(value); };
    modal.querySelector('#sav-refund-btn').onclick = () => finish('refund');
    modal.querySelector('#sav-destroy-btn').onclick = async () => {
      const ok = await showDeleteConfirm({
        title: '¿Eliminar también el dinero?',
        message: `${fmt(amount)} dejarán de estar disponibles y no volverán a tu saldo. Esta acción no se puede deshacer.`,
        confirmLabel: 'Sí, eliminar dinero',
        icon: '⚠️'
      });
      if (ok) finish('destroy');
    };
    modal.querySelector('#sav-cancel-btn').onclick = () => finish(null);
    modal.onclick = e => { if (e.target === modal) finish(null); };
  });
}

async function deleteSaving(id) {
  const s = savings.find(sv => sv.id === id);
  if (!s) return;
  const amount = Number(s.saved) || 0;

  // Las metas cumplidas ya representan dinero utilizado. Si se borra su
  // historial, el saldo no debe volver a aumentar: conservamos la salida
  // definitiva en el libro de movimientos de dinero.
  if (s.completed) {
    const ok = await showDeleteConfirm({
      title: '¿Eliminar esta meta cumplida?',
      message: 'Se eliminará el registro histórico. El dinero ya utilizado no volverá a tu saldo disponible.',
      confirmLabel: 'Eliminar historial',
      icon: '🗑️'
    });
    if (!ok) return;
    // Si la meta fue completada con la nueva lógica, la salida ya quedó
    // registrada en savingsSpent al marcarla como cumplida. Para metas
    // antiguas, sin ese registro, lo conservamos al eliminar el historial.
    const spent = amount;
    const completedMk = monthKey(s.completedY ?? Y, s.completedM ?? M);
    const alreadyRecorded = savingsSpent.some(e =>
      e.mk === completedMk &&
      e.savingName === s.name &&
      Number(e.amount) === spent
    );
    if (spent > 0 && !alreadyRecorded) {
      savingsSpent.push({
        id: Date.now() + Math.random(),
        mk: completedMk,
        y: s.completedY ?? Y,
        m: s.completedM ?? M,
        amount: spent,
        savingName: s.name,
        reason: 'complete'
      });
      saveSavingsSpent();
    }
    savings = savings.filter(x => x.id !== id);
    saveSavings();
    renderSavingsHistory();
    renderResumen();
    toast('🗑️ Historial de meta eliminado');
    return;
  }

  if (amount <= 0) {
    const ok = await showDeleteConfirm({ title: '¿Eliminar esta meta de ahorro?', message: 'La meta no tiene dinero apartado. Esta acción no se puede deshacer.' });
    if (!ok) return;
    savings = savings.filter(x => x.id !== id);
    saveSavings();
  } else {
    const action = await showSavingDeleteChoice(id);
    if (!action) return;
    const name = s.name;
    if (action === 'destroy') {
      // Al eliminar el dinero, la salida queda registrada para que el saldo
      // disponible no se recupere al borrar los pagos de la meta.
      savingsSpent.push({ id: Date.now() + Math.random(), mk: monthKey(Y, M), y: Y, m: M, amount, savingName: name });
      saveSavingsSpent();
      addSavingsEvent('destroy', name, amount, Y, M);
    } else {
      addSavingsEvent('refund', name, amount, Y, M);
    }
    savings = savings.filter(x => x.id !== id);
    saveSavings();
  }
  if (currentFinPanel === 'ahorros-cumplidas' || currentFinPanel === 'ahorros-historial') renderSavingsHistory();
  else renderSavings();
  renderResumen();
  toast('🗑️ Meta eliminada');
}

function renderSavings() {
  const activeSavings = savings.filter(s => !s.completed);
  const currIdx2 = Y * 12 + M;
  const visible2 = activeSavings.filter(s => {
    const sy = (s.startY != null && s.startY > 0) ? s.startY : today.getFullYear();
    const sm = (s.startY != null && s.startY > 0) ? (s.startM != null ? s.startM : today.getMonth()) : today.getMonth();
    return (sy * 12 + sm) <= currIdx2;
  });
  const totalContrib = getMonthSavingsTotal(Y, M);
  const totalSavedNow = getTotalSavedAmount();
  const availableNow = getAvailableBalance(Y, M);

  const savCard = (s) => {
    const saved      = s.saved || 0;
    const pending    = Math.max(0, s.goal - saved);
    const pct        = Math.min(Math.round((saved / s.goal) * 100), 100);
    const isReached  = saved >= s.goal;
    const freq       = s.freq || 'monthly';
    const monthsLeft = isReached ? 0 : (freq === 'daily'
      ? Math.ceil(pending / (s.monthly * 30))
      : freq === 'quincenal'
        ? Math.ceil(pending / (s.monthly * 2))
        : Math.ceil(pending / s.monthly));
    const mk = monthKey(Y, M);
    const _sy = (s.startY != null && s.startY > 0) ? s.startY : today.getFullYear();
    const _sm = (s.startY != null && s.startY > 0) ? (s.startM != null ? s.startM : today.getMonth()) : today.getMonth();
    const savStartIdx = _sy * 12 + _sm;
    const currIdx = Y * 12 + M;
    const beforeStart = currIdx < savStartIdx;
    const paymentsThisMonth = (s.payments || []).filter(p => p.mk === mk && !p.initial).length;
    const maxPerMonth = freq === 'daily' ? new Date(Y, M + 1, 0).getDate() : freq === 'quincenal' ? 2 : 1;
    const contributedThisMonth = paymentsThisMonth >= maxPerMonth;

    let btnLabel;
    if (freq === 'quincenal') {
      btnLabel = paymentsThisMonth === 0 ? '🏦 Registrar aporte Q1'
               : paymentsThisMonth === 1 ? '🏦 Registrar aporte Q2'
               : '✔ Q1 y Q2 registrados';
    } else if (freq === 'daily') {
      btnLabel = contributedThisMonth
        ? `✔ ${paymentsThisMonth} aportes este mes`
        : `🏦 Registrar aporte (${paymentsThisMonth}/${maxPerMonth})`;
    } else {
      btnLabel = contributedThisMonth ? '✔ Aporte del mes registrado' : '🏦 Registrar aporte';
    }
    const freqLabel = freq === 'daily' ? 'Diario' : freq === 'quincenal' ? 'Quincenal' : 'Mensual';

    return `<div class="saving-card" style="${isReached ? 'border-color:rgba(16,185,129,0.28)' : ''}">
      <div class="debt-card-header">
        <div>
          <div class="debt-name">${s.name}</div>
          <div class="debt-meta">📅 ${freqLabel}${s.freq === 'quincenal' ? ` · Días ${s.day} (Q1) y ${s.day2} (Q2)` : s.freq === 'daily' ? '' : ` · Día ${s.day}`} · ${fmt(s.monthly)}${s.freq === 'daily' ? '/día' : s.freq === 'quincenal' ? '/quincena' : '/mes'}</div>
          ${!isReached ? `<div class="debt-meta" style="color:#60a5fa;margin-top:2px">~${monthsLeft} mes${monthsLeft !== 1 ? 'es' : ''} para la meta</div>` : `<div class="debt-meta" style="color:#6ee7b7;margin-top:2px">🎯 Meta alcanzada · Puedes marcarla como cumplida</div>`}
        </div>
        <div style="text-align:right">
          <div class="debt-amount total">${fmt(s.goal)}</div>
          <div class="debt-amount" style="color:${isReached ? 'var(--green)' : '#60a5fa'};font-size:16px">${isReached ? '🎯 ¡Logrado!' : fmt(pending) + ' falta'}</div>
          ${saved > 0 ? `<div class="debt-amount paid">Ahorrado: ${fmt(saved)}</div>` : ''}
        </div>
      </div>
      <div class="saving-progress-bar">
        <div class="saving-progress-fill" style="width:${pct}%${isReached ? ';background:linear-gradient(90deg,#10b981,#34d399)' : ''}"></div>
      </div>
      <div class="saving-progress-label">
        <span>${pct}% alcanzado</span>
        <span>${fmt(saved)} / ${fmt(s.goal)}</span>
      </div>
      <div class="debt-footer" style="margin-top:10px">
        <div>
          <div class="debt-cuota-info">Aporte ${freqLabel.toLowerCase()}</div>
          <div class="debt-cuota-val" style="color:#60a5fa">${fmt(s.monthly)}</div>
        </div>
        <div style="display:flex;gap:6px;flex-wrap:wrap;justify-content:flex-end">
          ${(!isReached && !beforeStart) ? `<button onclick="contributeToSaving(${s.id})" style="background:${contributedThisMonth ? 'rgba(99,102,241,0.12)' : 'rgba(59,130,246,0.12)'};border:1px solid ${contributedThisMonth ? 'rgba(99,102,241,0.3)' : 'rgba(59,130,246,0.3)'};color:${contributedThisMonth ? '#a5b4fc' : '#93c5fd'};border-radius:8px;padding:6px 10px;font-size:11px;cursor:pointer;font-family:'Outfit',sans-serif;font-weight:600">${btnLabel}</button>` : ''}
          ${saved > 0 ? `<button onclick="withdrawFromSaving(${s.id})" style="background:rgba(16,185,129,0.10);border:1px solid rgba(16,185,129,0.25);color:#6ee7b7;border-radius:8px;padding:6px 10px;font-size:11px;cursor:pointer;font-family:'Outfit',sans-serif;font-weight:600">↩ Retirar</button>` : ''}
          <button onclick="editSaving(${s.id})" style="background:rgba(168,85,247,0.10);border:1px solid rgba(168,85,247,0.25);color:#d8b4fe;border-radius:8px;padding:6px 10px;font-size:11px;cursor:pointer;font-family:'Outfit',sans-serif;font-weight:600">✏️ Editar</button>
          ${isReached ? `<button onclick="completeSaving(${s.id})" style="background:rgba(16,185,129,0.12);border:1px solid rgba(16,185,129,0.3);color:#6ee7b7;border-radius:8px;padding:6px 10px;font-size:11px;cursor:pointer;font-family:'Outfit',sans-serif;font-weight:600">🏆 Marcar como cumplida</button>` : ''}
          <button onclick="deleteSaving(${s.id})" class="exp-del" aria-label="Eliminar meta">✕</button>
        </div>
      </div>
    </div>`;
  };

  let html = `
    <div class="s-card-full" style="margin-bottom:12px;background:linear-gradient(135deg,rgba(59,130,246,0.10),rgba(30,64,175,0.12));border-color:rgba(59,130,246,0.22)">
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
        <div>
          <div class="card-label" style="color:#60a5fa">🏦 EN AHORROS</div>
          <div class="card-amount blue" style="font-size:24px">${fmt(totalSavedNow)}</div>
          <div style="font-size:9px;color:#64748b;margin-top:3px">Solo metas activas</div>
        </div>
        <div>
          <div class="card-label" style="color:#6ee7b7">💵 DISPONIBLE</div>
          <div style="font-family:'DM Mono',monospace;font-size:24px;font-weight:700;color:#6ee7b7">${fmt(availableNow)}</div>
          <div style="font-size:9px;color:#64748b;margin-top:3px">Saldo para utilizar</div>
        </div>
      </div>
    </div>`;
  if (visible2.length === 0) {
    html = '<div class="empty-state" style="color:#374151;padding:20px">No tienes metas de ahorro activas.<br><span style="font-size:20px">🏦</span></div>';
  } else {
    visible2.forEach(s => html += savCard(s));
    if (totalContrib > 0) {
      html += `<div class="section-title">💰 Aportes de este mes</div>
        <div class="s-card-full" style="background:linear-gradient(135deg,#0c1a3a,#1e3a5f);border-color:rgba(59,130,246,0.25)">
          <div style="position:absolute;top:0;left:0;right:0;height:2px;background:linear-gradient(90deg,#3b82f6,#60a5fa,transparent)"></div>
          <div class="card-label" style="color:#93c5fd">Total aportado a ahorros — ${MONTHS[M]} ${Y}</div>
          <div class="card-amount blue" style="font-size:24px">${fmt(totalContrib)}</div>
        </div>`;
    }
  }
  const savEl = document.getElementById('saving-list-content');
  if (savEl) savEl.innerHTML = html;
}

// ═══════════════════════════════════════════════════════
// MONTH NAVIGATION
// ═══════════════════════════════════════════════════════
function prevMonth() { if (M === 0) { M = 11; Y--; } else M--; reRender(); }
function nextMonth() { if (M === 11) { M = 0;  Y++; } else M++; reRender(); }
function goToday()   { Y = today.getFullYear(); M = today.getMonth(); reRender(); }

function reRender() {
  const active = document.querySelector('.section.active').id;
  if (active === 'section-resumen')      renderResumen();
  if (active === 'section-calendar')     renderCal();
  if (active === 'section-finanzas') {
    if (currentFinPanel) {
      FIN_PANELS[currentFinPanel] && FIN_PANELS[currentFinPanel].render();
    } else {
      updateFinMenu();
    }
  }
  // Siempre actualizar listas aunque no estén visibles
  renderSavings();
  renderDebts();
}

// ═══════════════════════════════════════════════════════
// PDF EXPORT
// ═══════════════════════════════════════════════════════
function exportPDF() {
  const c       = calcMonth(Y, M);
  const mn      = `${MONTHS[M]} ${Y}`;
  const dateStr = new Date().toLocaleDateString('es-CO', { day: 'numeric', month: 'long', year: 'numeric' });
  const total   = dim(Y, M);

  // ── Datos financieros ──
  const { items: expItems, total: expTotal } = getMonthExpenses(Y, M);
  const { items: incItemsGlobal }            = getMonthIncomes(Y, M);
  const extras    = getMonthExtras(Y, M);
  const extTotal  = getMonthExtrasTotal(Y, M);
  const discData  = getMonthDiscounts(Y, M);
  const prevAccum = getPrevAccumulated(Y, M);
  const totalAccum= getAccumulatedBalance(Y, M);
  const totalEarn = c.totalEarn + c.incomes + extTotal;

  // ── Datos de turnos (compacto) ──
  let cntWorked = 0, cntRest = 0, cntAusente = 0, cntIncap = 0;
  const shiftCounts = {};
  for (let d = 1; d <= total; d++) {
    const eff = effShift(Y, M, d);
    const o   = origShift(Y, M, d);
    if (eff === 'AUSENTE')  { cntAusente++; continue; }
    if (eff === 'INCAP')    { cntIncap++;   continue; }
    if (eff === 'DESCANSO' || isRestShift(o)) { cntRest++; continue; }
    cntWorked++;
    const st = getShiftTypeById(o);
    const lbl = st ? st.name : (o === 'DÍA' ? 'Día' : o === 'NOCHE' ? 'Noche' : o);
    shiftCounts[lbl] = (shiftCounts[lbl] || 0) + 1;
  }
  const shiftSummary = Object.entries(shiftCounts).map(([k,v]) => `${k}: ${v}`).join(' · ') || 'Sin turnos registrados';

  // ── Ingresos rows ──
  let incRowsHtml = '';
  if (c.totalEarn > 0) {
    const earnLabel = salary && salary.type === 'fixed'
      ? `Sueldo fijo (${salary.fixedType === 'quincenal' ? 'quincenal' : 'mensual'})`
      : `Devengado por turnos (${c.totalHours}h)`;
    incRowsHtml += `<div class="pdf-exp-row" style="border-left:3px solid #6366f1;padding-left:8px;margin-bottom:6px">
      <span class="pdf-exp-name">${earnLabel}</span>
      <span class="pdf-exp-amt" style="color:#6366f1">${fmt(c.totalEarn)}</span>
    </div>`;
  }
  incItemsGlobal.forEach(i => {
    incRowsHtml += `<div class="pdf-exp-row" style="border-left:3px solid #10b981;padding-left:8px;margin-bottom:6px">
      <span class="pdf-exp-name">${i.name}</span>
      <span class="pdf-exp-amt" style="color:#10b981">+${fmt(i.amount)}</span>
    </div>`;
  });
  extras.forEach(e => {
    const type = ['⏰ Hora extra','🌙 Recargo nocturno','🎉 Festivo','📅 Domingo','➕ Otro'][['overtime','nocturnal','holiday','sunday','other'].indexOf(e.type)] || e.type;
    incRowsHtml += `<div class="pdf-exp-row" style="border-left:3px solid #f59e0b;padding-left:8px;margin-bottom:6px">
      <span class="pdf-exp-name">${type}${e.desc ? ' · ' + e.desc : ''}</span>
      <span class="pdf-exp-amt" style="color:#f59e0b">+${fmt(e.qty * e.unitValue)}</span>
    </div>`;
  });
  if (!incRowsHtml) incRowsHtml = '<div class="pdf-exp-empty">Sin ingresos registrados</div>';

  // ── Gastos rows ──
  let expRowsHtml = '';
  if (expItems.length === 0) {
    expRowsHtml = '<div class="pdf-exp-empty">Sin gastos registrados</div>';
  } else {
    expItems.forEach(e => {
      expRowsHtml += `<div class="pdf-exp-row" style="border-left:3px solid #ef4444;padding-left:8px;margin-bottom:6px">
        <span class="pdf-exp-name">${e.name}</span>
        <span class="pdf-exp-amt" style="color:#ef4444">-${fmt(e.appliedAmount)}</span>
      </div>`;
    });
  }

  // ── Descuentos rows ──
  let discRowsHtml = '';
  if (discData.total > 0) {
    discRowsHtml = `<div class="pdf-exp-row" style="border-left:3px solid #f59e0b;padding-left:8px;margin-bottom:6px">
      <span class="pdf-exp-name">Descuentos del mes</span>
      <span class="pdf-exp-amt" style="color:#f59e0b">-${fmt(discData.total)}</span>
    </div>`;
  }

  // ── Deudas y ahorros ──
  const activeDebts = debts.filter(d => (d.total - (d.paid||0)) > 0);
  const activeSavings = savings.filter(s => (s.goal - (s.saved||0)) > 0);

  document.getElementById('print-report').innerHTML = `
  <div class="pdf-page">

    <!-- ENCABEZADO -->
    <div class="pdf-header">
      <div class="pdf-header-left">
        <div class="pdf-logo-box">💰</div>
        <div>
          <div class="pdf-app-name">FluxoApp</div>
          <div class="pdf-app-sub">Reporte Financiero Mensual</div>
        </div>
      </div>
      <div class="pdf-header-right">
        <div class="pdf-month-label">${MONTHS[M]} <span>${Y}</span></div>
        <div class="pdf-generated">Generado: ${dateStr}</div>
      </div>
    </div>

    <!-- RESUMEN FINANCIERO -->
    <div class="pdf-top-grid">
      <div class="pdf-top-card blue">
        <div class="pdf-top-card-icon">💰</div>
        <div class="pdf-top-card-label">Total Ingresos</div>
        <div class="pdf-top-card-val">${fmt(totalEarn)}</div>
        <div class="pdf-top-card-sub">${salary && salary.type === 'fixed' ? 'Sueldo fijo' : c.totalHours + 'h trabajadas'}</div>
      </div>
      <div class="pdf-top-card red">
        <div class="pdf-top-card-icon">📋</div>
        <div class="pdf-top-card-label">Total Egresos</div>
        <div class="pdf-top-card-val">${fmt(expTotal + discData.total + c.debts + c.savingsContrib)}</div>
        <div class="pdf-top-card-sub">${expItems.length} gasto${expItems.length !== 1 ? 's' : ''} + otros</div>
      </div>
      <div class="pdf-top-card green">
        <div class="pdf-top-card-icon">💵</div>
        <div class="pdf-top-card-label">Saldo Neto</div>
        <div class="pdf-top-card-val">${fmt(c.balance)}</div>
        <div class="pdf-top-card-sub">${c.balance >= 0 ? 'Positivo ✓' : 'Negativo ✗'}</div>
      </div>
    </div>

    <!-- QUINCENAS -->
    <div class="pdf-q-grid">
      <div class="pdf-q-card">
        <div class="pdf-q-card-header"><div class="pdf-q-icon">📅</div><div class="pdf-q-title">1ª Quincena (1–15)</div></div>
        <div class="pdf-q-val">${fmt(c.q1earn)}</div>
        <div class="pdf-q-meta">
          ${salary && salary.type === 'fixed'
            ? `<div class="pdf-q-meta-item">Sueldo fijo</div>`
            : `<div class="pdf-q-meta-item">⏱️ ${c.q1h}h trabajadas</div>`}
          ${c.q1disc > 0 ? `<div class="pdf-q-meta-item">✂️ -${fmt(c.q1disc)} desc.</div>` : ''}
          ${c.q1i > 0 ? `<div class="pdf-q-meta-item">🏥 ${c.q1i} incap.</div>` : ''}
        </div>
      </div>
      <div class="pdf-q-card">
        <div class="pdf-q-card-header"><div class="pdf-q-icon">📅</div><div class="pdf-q-title">2ª Quincena (16–${total})</div></div>
        <div class="pdf-q-val">${fmt(c.q2earn)}</div>
        <div class="pdf-q-meta">
          ${salary && salary.type === 'fixed'
            ? `<div class="pdf-q-meta-item">Sueldo fijo</div>`
            : `<div class="pdf-q-meta-item">⏱️ ${c.q2h}h trabajadas</div>`}
          ${c.q2disc > 0 ? `<div class="pdf-q-meta-item">✂️ -${fmt(c.q2disc)} desc.</div>` : ''}
          ${c.q2i > 0 ? `<div class="pdf-q-meta-item">🏥 ${c.q2i} incap.</div>` : ''}
        </div>
      </div>
    </div>

    <!-- DETALLE INGRESOS -->
    <div class="pdf-table-section">
      <div class="pdf-section-heading">Ingresos y Extras</div>
      ${incRowsHtml}
      <div class="pdf-exp-row" style="font-weight:700;border-top:2px solid #e2e8f0;padding-top:6px;margin-top:4px">
        <span>TOTAL INGRESOS</span>
        <span class="pdf-exp-amt" style="color:#6366f1">${fmt(totalEarn)}</span>
      </div>
    </div>

    <!-- DETALLE GASTOS -->
    <div class="pdf-table-section">
      <div class="pdf-section-heading">Gastos del Mes</div>
      ${expRowsHtml}
      ${discRowsHtml}
      ${c.debts > 0 ? `<div class="pdf-exp-row" style="border-left:3px solid #dc2626;padding-left:8px;margin-bottom:6px">
        <span class="pdf-exp-name">Cuotas de deudas</span>
        <span class="pdf-exp-amt" style="color:#dc2626">-${fmt(c.debts)}</span>
      </div>` : ''}
      ${c.savingsContrib > 0 ? `<div class="pdf-exp-row" style="border-left:3px solid #8b5cf6;padding-left:8px;margin-bottom:6px">
        <span class="pdf-exp-name">Aportes a ahorros</span>
        <span class="pdf-exp-amt" style="color:#8b5cf6">-${fmt(c.savingsContrib)}</span>
      </div>` : ''}
      <div class="pdf-exp-row" style="font-weight:700;border-top:2px solid #e2e8f0;padding-top:6px;margin-top:4px">
        <span>TOTAL EGRESOS</span>
        <span class="pdf-exp-amt" style="color:#ef4444">-${fmt(expTotal + discData.total + c.debts + c.savingsContrib)}</span>
      </div>
    </div>

    <!-- DEUDAS Y AHORROS -->
    ${(activeDebts.length > 0 || activeSavings.length > 0) ? `
    <div class="pdf-bottom-grid">
      ${activeDebts.length > 0 ? `<div class="pdf-exp-box">
        <div class="pdf-section-heading" style="margin-bottom:8px">💳 Deudas Activas</div>
        ${activeDebts.map(d => {
          const pct = Math.min(Math.round(((d.paid||0)/d.total)*100),100);
          return `<div style="margin-bottom:8px">
            <div class="pdf-exp-row"><span class="pdf-exp-name">${d.name}</span><span class="pdf-exp-amt">Falta: ${fmt(d.total-(d.paid||0))}</span></div>
            <div style="background:#fee2e2;border-radius:3px;height:4px">
              <div style="background:#ef4444;height:100%;width:${pct}%;border-radius:3px"></div>
            </div>
            <div style="font-size:9px;color:#94a3b8;margin-top:2px">${pct}% pagado</div>
          </div>`;
        }).join('')}
      </div>` : ''}
      ${activeSavings.length > 0 ? `<div class="pdf-exp-box">
        <div class="pdf-section-heading" style="margin-bottom:8px">🏦 Metas de Ahorro</div>
        ${activeSavings.map(s => {
          const pct = Math.min(Math.round(((s.saved||0)/s.goal)*100),100);
          return `<div style="margin-bottom:8px">
            <div class="pdf-exp-row"><span class="pdf-exp-name">${s.name}</span><span class="pdf-exp-amt">Falta: ${fmt(s.goal-(s.saved||0))}</span></div>
            <div style="background:#e0e7ff;border-radius:3px;height:4px">
              <div style="background:#6366f1;height:100%;width:${pct}%;border-radius:3px"></div>
            </div>
            <div style="font-size:9px;color:#94a3b8;margin-top:2px">${pct}% alcanzado</div>
          </div>`;
        }).join('')}
      </div>` : ''}
    </div>` : ''}

    <!-- SALDO ACUMULADO -->
    <div style="display:flex;gap:12px;margin-bottom:16px">
      <div class="pdf-balance-box" style="flex:1">
        <div class="pdf-balance-icon">💵</div>
        <div class="pdf-balance-label">Dinero Real Disponible</div>
        <div class="pdf-balance-val">${fmt(c.balance)}</div>
        <div class="pdf-balance-sub">Ingresos − Egresos del mes</div>
      </div>
      <div class="pdf-balance-box" style="flex:1;background:#f5f3ff;border-color:#c4b5fd;position:relative">
        <div style="position:absolute;top:0;left:0;right:0;height:3px;background:linear-gradient(90deg,#6366f1,#a855f7)"></div>
        <div class="pdf-balance-icon" style="background:#6366f1">📈</div>
        <div class="pdf-balance-label" style="color:#6366f1">Saldo Acumulado</div>
        <div class="pdf-balance-val" style="color:${totalAccum >= 0 ? '#4f46e5' : '#dc2626'}">${fmt(totalAccum)}</div>
        <div class="pdf-balance-sub" style="color:#a78bfa">${prevAccum !== 0 ? `Arrastre ${fmt(prevAccum)} + Mes ${fmt(c.balance)}` : 'Primer mes'}</div>
      </div>
    </div>

    <!-- TURNOS (pequeño y conciso) -->
    <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:10px 14px;margin-bottom:16px">
      <div class="pdf-section-heading" style="margin-bottom:6px;font-size:10px">📅 Resumen de Turnos — ${mn}</div>
      <div style="font-size:11px;color:#475569">
        <span style="margin-right:12px">✅ Trabajados: <strong>${cntWorked}</strong></span>
        <span style="margin-right:12px">😴 Descansos: <strong>${cntRest}</strong></span>
        ${cntAusente > 0 ? `<span style="margin-right:12px">🚫 Ausencias: <strong>${cntAusente}</strong></span>` : ''}
        ${cntIncap > 0   ? `<span style="margin-right:12px">🏥 Incapacidades: <strong>${cntIncap}</strong></span>` : ''}
        ${cntWorked > 0  ? `<span style="color:#6366f1">${shiftSummary}</span>` : ''}
      </div>
    </div>

    <!-- FOOTER -->
    <div class="pdf-footer">
      <div class="pdf-footer-left">
        <span class="pdf-footer-shield">🛡️</span>
        <span>Generado por <strong>FluxoApp</strong></span>
      </div>
      <div>Reporte confidencial · Uso personal</div>
    </div>
  </div>`;

  setTimeout(() => window.print(), 150);
}


// ═══════════════════════════════════════════════════════
// EXPORTAR PDF DECLARACIÓN DE RENTA ANUAL
// ═══════════════════════════════════════════════════════
function exportRentaPDF() {
  const year = Y;
  const dateStr = new Date().toLocaleDateString('es-CO', { day: 'numeric', month: 'long', year: 'numeric' });
  const monthsData = [];
  for (let m = 0; m < 12; m++) {
    if (isBeforeControl(year, m)) { monthsData.push(null); continue; }
    const c = calcMonth(year, m);
    const extras = getMonthExtrasTotal(year, m);
    const { items: incItems, total: incTotal } = getMonthIncomes(year, m);
    const { total: expTotal } = getMonthExpenses(year, m);
    const discData = getMonthDiscounts(year, m);
    monthsData.push({ m, c, extras, incTotal, expTotal, discTotal: discData.total });
  }
  const validMonths = monthsData.filter(m => m !== null);
  const totalIngresos   = validMonths.reduce((s,m) => s + m.c.totalEarn + m.incTotal + m.extras, 0);
  const totalGastos     = validMonths.reduce((s,m) => s + m.expTotal, 0);
  const totalDescuentos = validMonths.reduce((s,m) => s + m.discTotal, 0);
  const totalDeudas     = validMonths.reduce((s,m) => s + m.c.debts, 0);
  const totalAhorros    = validMonths.reduce((s,m) => s + m.c.savingsContrib, 0);
  const totalEgresos    = totalGastos + totalDescuentos + totalDeudas + totalAhorros;
  const saldoAnual      = totalIngresos - totalEgresos;
  const totalAhorradoActual = savings.reduce((s,sv) => s + (sv.saved||0), 0);
  const totalDeudaPendiente = debts.reduce((s,d) => s + Math.max(d.total-(d.paid||0),0), 0);
  const saldoAcumAnual  = getAccumulatedBalance(year, 11);
  const patrimonioNeto  = totalAhorradoActual + Math.max(saldoAcumAnual,0) - totalDeudaPendiente;

  const monthRows = validMonths.map(m => {
    const ingresos = m.c.totalEarn + m.incTotal + m.extras;
    const egresos  = m.expTotal + m.discTotal + m.c.debts + m.c.savingsContrib;
    const saldo    = m.c.balance;
    return `<tr>
      <td style="font-weight:600;color:#374151;padding:6px 10px">${MONTHS[m.m]}</td>
      <td style="color:#10b981;font-family:'DM Mono',monospace;text-align:right;padding:6px 10px">${fmt(ingresos)}</td>
      <td style="color:#ef4444;font-family:'DM Mono',monospace;text-align:right;padding:6px 10px">${fmt(egresos)}</td>
      <td style="font-weight:700;color:${saldo>=0?'#16a34a':'#dc2626'};font-family:'DM Mono',monospace;text-align:right;padding:6px 10px">${fmt(saldo)}</td>
    </tr>`;
  }).join('');

  document.getElementById('print-report').innerHTML = `
  <div class="pdf-page">
    <div class="pdf-header">
      <div class="pdf-header-left">
        <div class="pdf-logo-box">🇨🇴</div>
        <div>
          <div class="pdf-app-name">Declaración de Renta</div>
          <div class="pdf-app-sub">Resumen Año Gravable ${year} · Formulario 210</div>
        </div>
      </div>
      <div class="pdf-header-right">
        <div class="pdf-month-label">${year}</div>
        <div class="pdf-generated">Generado: ${dateStr}</div>
        <div class="pdf-generated" style="color:#ef4444;margin-top:2px">⚠️ Solo referencia — verificar con contador</div>
      </div>
    </div>

    <div class="pdf-top-grid">
      <div class="pdf-top-card blue">
        <div class="pdf-top-card-icon">💰</div>
        <div class="pdf-top-card-label">Total Ingresos Brutos</div>
        <div class="pdf-top-card-val">${fmt(totalIngresos)}</div>
        <div class="pdf-top-card-sub">Casillas 33–48 Form. 210</div>
      </div>
      <div class="pdf-top-card red">
        <div class="pdf-top-card-icon">📋</div>
        <div class="pdf-top-card-label">Total Deducciones</div>
        <div class="pdf-top-card-val">${fmt(totalDescuentos)}</div>
        <div class="pdf-top-card-sub">Casillas 80–88 Form. 210</div>
      </div>
      <div class="pdf-top-card green">
        <div class="pdf-top-card-icon">📊</div>
        <div class="pdf-top-card-label">Ingreso Neto del Año</div>
        <div class="pdf-top-card-val">${fmt(saldoAnual)}</div>
        <div class="pdf-top-card-sub">Base aprox. de tributación</div>
      </div>
    </div>

    <div class="pdf-table-section" style="margin-bottom:14px">
      <div class="pdf-section-heading">📥 Ingresos del Año ${year} — Casillas 33 a 48</div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
        <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:10px">
          <div style="font-size:9px;color:#16a34a;font-weight:700;letter-spacing:1px;margin-bottom:4px">INGRESOS LABORALES</div>
          <div style="font-family:'DM Mono',monospace;font-size:18px;font-weight:700;color:#15803d">${fmt(validMonths.reduce((s,m)=>s+m.c.totalEarn,0))}</div>
          <div style="font-size:9px;color:#4ade80;margin-top:2px">Sueldos y salarios del año</div>
        </div>
        <div style="background:#fffbeb;border:1px solid #fde68a;border-radius:8px;padding:10px">
          <div style="font-size:9px;color:#d97706;font-weight:700;letter-spacing:1px;margin-bottom:4px">OTROS INGRESOS</div>
          <div style="font-family:'DM Mono',monospace;font-size:18px;font-weight:700;color:#b45309">${fmt(validMonths.reduce((s,m)=>s+m.incTotal+m.extras,0))}</div>
          <div style="font-size:9px;color:#fbbf24;margin-top:2px">Extras, recargos e ingresos adicionales</div>
        </div>
      </div>
    </div>

    <div class="pdf-table-section" style="margin-bottom:14px">
      <div class="pdf-section-heading">📤 Deducciones del Año — Casillas 80 a 88</div>
      <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px">
        <div style="background:#fff1f2;border:1px solid #fecdd3;border-radius:8px;padding:10px">
          <div style="font-size:9px;color:#e11d48;font-weight:700;letter-spacing:1px;margin-bottom:4px">GASTOS</div>
          <div style="font-family:'DM Mono',monospace;font-size:15px;font-weight:700;color:#be123c">${fmt(totalGastos)}</div>
          <div style="font-size:9px;color:#fb7185;margin-top:2px">Gastos del año</div>
        </div>
        <div style="background:#fdf4ff;border:1px solid #e9d5ff;border-radius:8px;padding:10px">
          <div style="font-size:9px;color:#7c3aed;font-weight:700;letter-spacing:1px;margin-bottom:4px">DESCUENTOS</div>
          <div style="font-family:'DM Mono',monospace;font-size:15px;font-weight:700;color:#6d28d9">${fmt(totalDescuentos)}</div>
          <div style="font-size:9px;color:#c4b5fd;margin-top:2px">Aportes salud, pensión, etc.</div>
        </div>
        <div style="background:#eff6ff;border:1px solid #bfdbfe;border-radius:8px;padding:10px">
          <div style="font-size:9px;color:#1d4ed8;font-weight:700;letter-spacing:1px;margin-bottom:4px">OBLIGACIONES</div>
          <div style="font-family:'DM Mono',monospace;font-size:15px;font-weight:700;color:#1e40af">${fmt(totalDeudas+totalAhorros)}</div>
          <div style="font-size:9px;color:#93c5fd;margin-top:2px">Deudas + aportes a ahorros</div>
        </div>
      </div>
    </div>

    <div class="pdf-table-section" style="margin-bottom:14px">
      <div class="pdf-section-heading">🏛️ Patrimonio al 31 de Diciembre ${year} — Casillas 28 a 32</div>
      <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px">
        <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:10px">
          <div style="font-size:9px;color:#16a34a;font-weight:700;letter-spacing:1px;margin-bottom:4px">ACTIVOS (AHORROS)</div>
          <div style="font-family:'DM Mono',monospace;font-size:15px;font-weight:700;color:#15803d">${fmt(totalAhorradoActual)}</div>
          <div style="font-size:9px;color:#4ade80;margin-top:2px">Total ahorrado acumulado</div>
        </div>
        <div style="background:#fff1f2;border:1px solid #fecdd3;border-radius:8px;padding:10px">
          <div style="font-size:9px;color:#e11d48;font-weight:700;letter-spacing:1px;margin-bottom:4px">PASIVOS (DEUDAS)</div>
          <div style="font-family:'DM Mono',monospace;font-size:15px;font-weight:700;color:#be123c">${fmt(totalDeudaPendiente)}</div>
          <div style="font-size:9px;color:#fb7185;margin-top:2px">Deudas pendientes</div>
        </div>
        <div style="background:${patrimonioNeto>=0?'#f0fdf4':'#fff1f2'};border:1px solid ${patrimonioNeto>=0?'#bbf7d0':'#fecdd3'};border-radius:8px;padding:10px">
          <div style="font-size:9px;color:${patrimonioNeto>=0?'#16a34a':'#e11d48'};font-weight:700;letter-spacing:1px;margin-bottom:4px">PATRIMONIO NETO</div>
          <div style="font-family:'DM Mono',monospace;font-size:15px;font-weight:700;color:${patrimonioNeto>=0?'#15803d':'#be123c'}">${fmt(patrimonioNeto)}</div>
          <div style="font-size:9px;color:#94a3b8;margin-top:2px">Activos − Pasivos</div>
        </div>
      </div>
    </div>

    <div class="pdf-table-section" style="margin-bottom:14px">
      <div class="pdf-section-heading">📅 Resumen Mensual ${year}</div>
      <table style="width:100%;border-collapse:collapse;font-size:10px">
        <thead>
          <tr style="background:#1e293b">
            <th style="padding:7px 10px;text-align:left;color:white;font-size:9px">MES</th>
            <th style="padding:7px 10px;text-align:right;color:#6ee7b7;font-size:9px">INGRESOS</th>
            <th style="padding:7px 10px;text-align:right;color:#f87171;font-size:9px">EGRESOS</th>
            <th style="padding:7px 10px;text-align:right;color:#a5b4fc;font-size:9px">SALDO</th>
          </tr>
        </thead>
        <tbody>${monthRows}</tbody>
        <tfoot>
          <tr style="background:#f8fafc;border-top:2px solid #e2e8f0">
            <td style="padding:8px 10px;font-weight:700;color:#1e293b">TOTAL ${year}</td>
            <td style="padding:8px 10px;text-align:right;font-weight:700;color:#16a34a;font-family:'DM Mono',monospace">${fmt(totalIngresos)}</td>
            <td style="padding:8px 10px;text-align:right;font-weight:700;color:#dc2626;font-family:'DM Mono',monospace">${fmt(totalEgresos)}</td>
            <td style="padding:8px 10px;text-align:right;font-weight:700;color:${saldoAnual>=0?'#16a34a':'#dc2626'};font-family:'DM Mono',monospace">${fmt(saldoAnual)}</td>
          </tr>
        </tfoot>
      </table>
    </div>

    <div style="background:#fffbeb;border:1px solid #fde68a;border-radius:8px;padding:12px;margin:0 0 16px;font-size:9px;color:#92400e">
      <strong>⚠️ Nota importante:</strong> Este documento es un resumen de referencia generado por FluxoApp.
      No reemplaza el asesoramiento de un contador ni la verificación oficial ante la DIAN.
      Los valores de retención en la fuente, activos fijos e inversiones deben verificarse con su contador.
    </div>

    <div class="pdf-footer">
      <div class="pdf-footer-left">
        <span class="pdf-footer-shield">🛡️</span>
        <span>Generado por <strong>FluxoApp</strong> · Año gravable ${year}</span>
      </div>
      <div>Documento de referencia · Verificar con contador</div>
    </div>
  </div>`;
  setTimeout(() => window.print(), 150);
}
// ═══════════════════════════════════════════════════════
// MULTI-SELECT
// ═══════════════════════════════════════════════════════
let multiMode        = false;
let selectedDays     = new Set();
let bulkParcialHours = null;
let longPressTimer   = null;
let longPressFired   = false;

function startLongPress(dayKey, event) {
  clearLongPress();
  longPressFired = false;
  longPressTimer = setTimeout(() => {
    longPressFired = true;
    longPressTimer = null;
    if (!multiMode) enterMultiMode(dayKey);
    else toggleDaySelection(dayKey);
    if (navigator.vibrate) navigator.vibrate(40);
  }, 1000);
}

function clearLongPress() {
  if (longPressTimer) { clearTimeout(longPressTimer); longPressTimer = null; }
}

function handleCellClick(y, m, d) {
  if (longPressFired) { longPressFired = false; return; }
  if (multiMode) toggleDaySelection(key(y, m, d));
  else openModal(y, m, d);
}

function enterMultiMode(dayKey) {
  multiMode    = true;
  selectedDays = new Set([dayKey]);
  document.getElementById('cal-content').querySelector('.cal-grid')?.classList.add('multi-mode');
  updateMultiBar();
  updateCellSelection();
  if (navigator.vibrate) navigator.vibrate(40);
}

function exitMultiMode() {
  multiMode = false;
  selectedDays.clear();
  document.getElementById('multi-bar').classList.remove('visible');
  updateCellSelection();
  const grid = document.getElementById('cal-content').querySelector('.cal-grid');
  if (grid) grid.classList.remove('multi-mode');
}

function toggleDaySelection(dayKey) {
  if (selectedDays.has(dayKey)) selectedDays.delete(dayKey);
  else selectedDays.add(dayKey);
  updateMultiBar();
  updateCellSelection();
}

function updateMultiBar() {
  const bar = document.getElementById('multi-bar');
  const n   = selectedDays.size;
  document.getElementById('multi-bar-title').textContent =
    n === 0 ? 'Ningún día seleccionado' : `${n} día${n > 1 ? 's' : ''} seleccionado${n > 1 ? 's' : ''}`;
  bar.classList.toggle('visible', n > 0);
}

function updateCellSelection() {
  document.querySelectorAll('.cal-cell').forEach(cell => {
    const d = parseInt(cell.dataset.day);
    if (!d) return;
    cell.classList.toggle('multi-selected', selectedDays.has(key(Y, M, d)));
  });
}

function bulkAction(action) {
  if (selectedDays.size === 0) return;

  if (action === 'incap') {
    const n = selectedDays.size;
    document.getElementById('bulk-incap-subtitle').textContent = `${n} día${n > 1 ? 's' : ''} seleccionado${n > 1 ? 's' : ''}`;
    document.getElementById('bulk-incap-input').value = '';
    document.getElementById('bulk-incap-modal').classList.add('open');
    setTimeout(() => document.getElementById('bulk-incap-input').focus(), 350);
    return;
  }
  if (action === 'parcial') {
    const n = selectedDays.size;
    document.getElementById('bulk-parcial-subtitle').textContent = `${n} día${n > 1 ? 's' : ''} seleccionado${n > 1 ? 's' : ''}`;
    bulkParcialHours = null;
    const grid = document.getElementById('bulk-hours-grid');
    grid.innerHTML = '';
    for (let h = 1; h < HOURS; h++) {
      const btn = document.createElement('button');
      btn.className = 'hour-btn';
      btn.textContent = `${h}h`;
      btn.onclick = () => {
        bulkParcialHours = h;
        grid.querySelectorAll('.hour-btn').forEach(b => b.classList.remove('selected'));
        btn.classList.add('selected');
      };
      grid.appendChild(btn);
    }
    document.getElementById('bulk-parcial-modal').classList.add('open');
    return;
  }

  const keysToProcess = Array.from(selectedDays);
  keysToProcess.forEach(k => {
    const parts = k.split('-');
    const y = parseInt(parts[0]), mo = parseInt(parts[1]) - 1, d = parseInt(parts[2]);
    if (action === 'absent') {
      overrides[k] = true;
    } else if (action === 'dia') {
      const o = origShift(y, mo, d);
      if (o === 'DÍA') delete overrides[k];
      else overrides[k] = { type: 'SWAP', shift: 'DÍA' };
    } else if (action === 'noche') {
      const o = origShift(y, mo, d);
      if (o === 'NOCHE') delete overrides[k];
      else overrides[k] = { type: 'SWAP', shift: 'NOCHE' };
    } else if (action === 'restore') {
      delete overrides[k];
    }
  });

  save();
  const n = keysToProcess.length;
  const labels = { absent: '🚫 Ausente', dia: '☀️ Día', noche: '🌙 Noche', restore: '✅ Restaurado' };
  toast(`${labels[action]} aplicado a ${n} día${n > 1 ? 's' : ''}`);
  exitMultiMode();
  renderCal(); renderResumen();
}

function confirmBulkIncap() {
  const val = parseInt(document.getElementById('bulk-incap-input').value);
  if (!val || val <= 0) { toast('⚠️ Ingresa el valor de incapacidad'); return; }
  selectedDays.forEach(k => { overrides[k] = { type: 'INCAP', value: val }; });
  save();
  const n = selectedDays.size;
  toast(`🏥 Incapacidad aplicada a ${n} día${n > 1 ? 's' : ''} · ${fmt(val)}/día`);
  closeBulkIncap();
  exitMultiMode();
  renderCal(); renderResumen();
}

function confirmBulkParcial() {
  if (!bulkParcialHours) { toast('⚠️ Selecciona las horas'); return; }
  selectedDays.forEach(k => {
    const ov     = overrides[k];
    const isSwap = ov && typeof ov === 'object' && ov.type === 'SWAP';
    overrides[k] = isSwap
      ? { type: 'SWAP_PARTIAL', shift: ov.shift, hours: bulkParcialHours }
      : bulkParcialHours;
  });
  save();
  const n = selectedDays.size;
  toast(`⏱️ ${bulkParcialHours}h aplicadas a ${n} día${n > 1 ? 's' : ''}`);
  closeBulkParcial();
  exitMultiMode();
  renderCal(); renderResumen();
}

function closeBulkIncap()   { document.getElementById('bulk-incap-modal').classList.remove('open'); }
function closeBulkParcial() { document.getElementById('bulk-parcial-modal').classList.remove('open'); }


// ═══════════════════════════════════════════════════════
// SCHEDULE CONFIG
// ═══════════════════════════════════════════════════════

let _schedType = 'cycle'; // tipo seleccionado actualmente en UI
let _cycleShiftTypes = []; // [{id, name, hours, color}]
let _cycleSlots = [];      // [shiftTypeId, ...]
let _rotShiftTypes = [];
let _rotSlots = [];

const SHIFT_COLORS = ['#6366f1','#10b981','#f59e0b','#ef4444','#3b82f6','#8b5cf6','#ec4899','#64748b'];

function selectSchedType(type) {
  _schedType = type;
  ['cycle','rotating','office'].forEach(t => {
    const panel = document.getElementById('sched-' + (t==='rotating'?'rotating':t==='cycle'?'cycle':'office') + '-panel');
    const btn   = document.getElementById('sched-btn-' + t);
    if (panel) panel.style.display = 'none';
    if (btn)   btn.classList.remove('active-gastos');
  });
  const panelId = type === 'cycle' ? 'sched-cycle-panel' : type === 'rotating' ? 'sched-rotating-panel' : 'sched-office-panel';
  const panel = document.getElementById(panelId);
  const btn   = document.getElementById('sched-btn-' + type);
  const saveBtn = document.getElementById('sched-save-btn');
  if (panel)   panel.style.display = 'block';
  if (btn)     btn.classList.add('active-gastos');
  if (saveBtn) saveBtn.style.display = 'block';
}

// ── CICLO FIJO ────────────────────────────────────────
function addCycleShiftType() {
  const id = 'st_' + Date.now();
  _cycleShiftTypes.push({ id, name: '', hours: 12, color: SHIFT_COLORS[_cycleShiftTypes.length % SHIFT_COLORS.length] });
  renderCycleShiftTypes();
}

async function removeCycleShiftType(id) {
  const ok = await showDeleteConfirm({ title: '¿Eliminar este tipo de turno?', message: 'También se quitará de las posiciones del ciclo donde esté asignado.' });
  if (!ok) return;
  _cycleShiftTypes = _cycleShiftTypes.filter(s => s.id !== id);
  _cycleSlots = _cycleSlots.filter(s => s !== id);
  renderCycleShiftTypes();
  renderCycleSlots();
}

function renderCycleShiftTypes() {
  const el = document.getElementById('sched-cycle-shift-types');
  if (!el) return;
  el.innerHTML = _cycleShiftTypes.map((s, i) => `
    <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px">
      <div style="width:14px;height:14px;border-radius:50%;background:${s.color};flex-shrink:0"></div>
      <input class="form-input" style="flex:2;margin:0" placeholder="Nombre (ej. DÍA, NOCHE)" value="${s.name}"
        oninput="_cycleShiftTypes[${i}].name=this.value" />
      <input class="form-input" style="width:65px;margin:0" type="number" placeholder="12" min="1" max="24" value="${s.hours}"
        oninput="_cycleShiftTypes[${i}].hours=+this.value" inputmode="numeric"/>
      <span style="color:#64748b;font-size:11px">h</span>
      <button onclick="removeCycleShiftType('${s.id}')"
        style="background:rgba(239,68,68,0.12);border:1px solid rgba(239,68,68,0.3);color:#f87171;
               border-radius:6px;padding:5px 8px;font-size:11px;cursor:pointer">✕</button>
    </div>`).join('');
}

function addCycleSlot() {
  if (_cycleShiftTypes.length === 0) { toast('⚠️ Primero agrega los tipos de turno'); return; }
  _cycleSlots.push(_cycleShiftTypes[0].id);
  renderCycleSlots();
}

async function removeCycleSlot(i) {
  const ok = await showDeleteConfirm({ title: '¿Eliminar esta posición del ciclo?', message: 'La posición seleccionada se quitará del ciclo configurado.' });
  if (!ok) return;
  _cycleSlots.splice(i, 1);
  renderCycleSlots();
}

function renderCycleSlots() {
  const el = document.getElementById('sched-cycle-slots');
  if (!el) return;
  el.innerHTML = _cycleSlots.map((slotId, i) => {
    const st = _cycleShiftTypes.find(s => s.id === slotId) || _cycleShiftTypes[0];
    return `<div style="display:flex;align-items:center;gap:8px;margin-bottom:6px">
      <span style="color:#64748b;font-size:11px;width:20px">D${i+1}</span>
      <select class="form-select" style="flex:1" onchange="_cycleSlots[${i}]=this.value">
        ${_cycleShiftTypes.map(s => `<option value="${s.id}" ${s.id===slotId?'selected':''}>${s.name||'Sin nombre'} (${s.hours}h)</option>`).join('')}
      </select>
      <button onclick="removeCycleSlot(${i})"
        style="background:rgba(239,68,68,0.12);border:1px solid rgba(239,68,68,0.3);color:#f87171;
               border-radius:6px;padding:5px 8px;font-size:11px;cursor:pointer">✕</button>
    </div>`;
  }).join('');
}

// ── ROTATIVO ──────────────────────────────────────────
function addRotShiftType() {
  const id = 'rst_' + Date.now();
  _rotShiftTypes.push({ id, name: '', startTime: '', endTime: '', hours: 8, color: SHIFT_COLORS[_rotShiftTypes.length % SHIFT_COLORS.length] });
  renderRotShiftTypes();
}

async function removeRotShiftType(id) {
  const ok = await showDeleteConfirm({ title: '¿Eliminar este tipo de turno?', message: 'También se quitará de las posiciones de la rotación donde esté asignado.' });
  if (!ok) return;
  _rotShiftTypes = _rotShiftTypes.filter(s => s.id !== id);
  _rotSlots = _rotSlots.filter(s => s !== id);
  renderRotShiftTypes();
  renderRotSlots();
}

function renderRotShiftTypes() {
  const el = document.getElementById('sched-rot-shift-types');
  if (!el) return;
  el.innerHTML = _rotShiftTypes.map((s, i) => `
    <div style="background:rgba(15,23,42,0.5);border:1px solid rgba(99,102,241,0.15);border-radius:10px;padding:10px;margin-bottom:8px">
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px">
        <div style="width:14px;height:14px;border-radius:50%;background:${s.color};flex-shrink:0"></div>
        <input class="form-input" style="flex:1;margin:0" placeholder="Nombre (ej. Mañana)" value="${s.name}"
          oninput="_rotShiftTypes[${i}].name=this.value" />
        <button onclick="removeRotShiftType('${s.id}')"
          style="background:rgba(239,68,68,0.12);border:1px solid rgba(239,68,68,0.3);color:#f87171;
                 border-radius:6px;padding:5px 8px;font-size:11px;cursor:pointer">✕</button>
      </div>
      <div style="display:flex;gap:8px">
        <div style="flex:1">
          <div style="font-size:10px;color:#64748b;margin-bottom:3px">Hora inicio</div>
          <input class="form-input" style="margin:0;width:100%" type="time" value="${s.startTime}"
            oninput="_rotShiftTypes[${i}].startTime=this.value" />
        </div>
        <div style="flex:1">
          <div style="font-size:10px;color:#64748b;margin-bottom:3px">Hora fin</div>
          <input class="form-input" style="margin:0;width:100%" type="time" value="${s.endTime}"
            oninput="_rotShiftTypes[${i}].endTime=this.value" />
        </div>
        <div style="width:65px">
          <div style="font-size:10px;color:#64748b;margin-bottom:3px">Horas</div>
          <input class="form-input" style="margin:0;width:100%" type="number" min="1" max="24" value="${s.hours}"
            oninput="_rotShiftTypes[${i}].hours=+this.value" inputmode="numeric"/>
        </div>
      </div>
    </div>`).join('');
}

function addRotSlot() {
  if (_rotShiftTypes.length === 0) { toast('⚠️ Primero agrega los tipos de turno'); return; }
  _rotSlots.push(_rotShiftTypes[0].id);
  renderRotSlots();
}

async function removeRotSlot(i) {
  const ok = await showDeleteConfirm({ title: '¿Eliminar esta posición de la rotación?', message: 'La posición seleccionada se quitará de la rotación configurada.' });
  if (!ok) return;
  _rotSlots.splice(i, 1);
  renderRotSlots();
}

function renderRotSlots() {
  const el = document.getElementById('sched-rot-slots');
  if (!el) return;
  el.innerHTML = _rotSlots.map((slotId, i) => {
    return `<div style="display:flex;align-items:center;gap:8px;margin-bottom:6px">
      <span style="color:#64748b;font-size:11px;width:20px">D${i+1}</span>
      <select class="form-select" style="flex:1" onchange="_rotSlots[${i}]=this.value">
        ${_rotShiftTypes.map(s => `<option value="${s.id}" ${s.id===slotId?'selected':''}>${s.name||'Sin nombre'} (${s.hours}h)</option>`).join('')}
      </select>
      <button onclick="removeRotSlot(${i})"
        style="background:rgba(239,68,68,0.12);border:1px solid rgba(239,68,68,0.3);color:#f87171;
               border-radius:6px;padding:5px 8px;font-size:11px;cursor:pointer">✕</button>
    </div>`;
  }).join('');
}

// ── GUARDAR ───────────────────────────────────────────
function saveScheduleConfig() {
  if (_schedType === 'cycle') {
    if (_cycleShiftTypes.length === 0) { toast('⚠️ Agrega al menos un tipo de turno'); return; }
    if (_cycleSlots.length === 0)      { toast('⚠️ Define el ciclo'); return; }
    const start = document.getElementById('sched-cycle-start').value;
    if (!start) { toast('⚠️ Indica la fecha de inicio del ciclo'); return; }
    schedule = { type: 'cycle', shiftTypes: [..._cycleShiftTypes], cycle: [..._cycleSlots], startDate: start };
  } else if (_schedType === 'rotating') {
    if (_rotShiftTypes.length === 0) { toast('⚠️ Agrega al menos un tipo de turno'); return; }
    if (_rotSlots.length === 0)      { toast('⚠️ Define el ciclo'); return; }
    const start = document.getElementById('sched-rot-start').value;
    if (!start) { toast('⚠️ Indica la fecha de inicio del ciclo'); return; }
    schedule = { type: 'rotating', shiftTypes: [..._rotShiftTypes], cycle: [..._rotSlots], startDate: start };
  } else {
    const days = {};
    [1,2,3,4,5,6].forEach(d => {
      const checked = document.getElementById('office-' + d).checked;
      const hours   = parseFloat(document.getElementById('office-' + d + '-h').value) || 0;
      if (checked && hours > 0) days[d] = hours;
    });
    if (Object.keys(days).length === 0) { toast('⚠️ Selecciona al menos un día'); return; }
    schedule = { type: 'office', officeDays: days };
  }
  saveSchedule();
  updateSchedLabel();
  reRender();
  const schedModal = document.getElementById('schedule-config-modal');
  if (schedModal) schedModal.remove();
  toast('✅ Configuración de turno guardada');
}

function updateSchedLabel() {
  const el = document.getElementById('sched-current-label');
  if (!el) return;
  if (!schedule) { el.textContent = 'Sin configuración guardada'; return; }
  const types = { cycle: '🔄 Ciclo fijo', rotating: '🔃 Rotativo', office: '🏢 Oficina' };
  const extra = schedule.type === 'office'
    ? ` · ${Object.keys(schedule.officeDays).length} días/semana`
    : ` · Ciclo de ${schedule.cycle.length} días`;
  el.textContent = `✅ ${types[schedule.type]}${extra}`;
}

function initSchedUI() {
  updateSchedLabel();
  if (!schedule) return;
  // Solo precargar UI si el modal está abierto
  if (!document.getElementById('sched-btn-cycle')) return;
  selectSchedType(schedule.type);
  if (schedule.type === 'cycle' || schedule.type === 'rotating') {
    const isRot = schedule.type === 'rotating';
    if (isRot) {
      _rotShiftTypes = [...(schedule.shiftTypes || [])];
      _rotSlots      = [...(schedule.cycle || [])];
      document.getElementById('sched-rot-start').value = schedule.startDate || '';
      renderRotShiftTypes(); renderRotSlots();
    } else {
      _cycleShiftTypes = [...(schedule.shiftTypes || [])];
      _cycleSlots      = [...(schedule.cycle || [])];
      document.getElementById('sched-cycle-start').value = schedule.startDate || '';
      renderCycleShiftTypes(); renderCycleSlots();
    }
  } else if (schedule.type === 'office') {
    Object.entries(schedule.officeDays).forEach(([d, h]) => {
      const cb = document.getElementById('office-' + d);
      const hi = document.getElementById('office-' + d + '-h');
      if (cb) cb.checked = true;
      if (hi) hi.value  = h;
    });
  }
}






// ═══════════════════════════════════════════════════════
// RESUMEN — detalles colapsables y modal PDF
// ═══════════════════════════════════════════════════════
function toggleResumenDetails() {
  const el   = document.getElementById('resumen-details');
  const icon = document.getElementById('details-toggle-icon');
  if (!el) return;
  const isOpen = el.style.display !== 'none';
  el.style.display = isOpen ? 'none' : 'block';
  if (icon) icon.textContent = isOpen ? '⌄' : '⌃';
}

function showPDFModal() {
  const existing = document.getElementById('pdf-choice-modal');
  if (existing) existing.remove();
  const modal = document.createElement('div');
  modal.id = 'pdf-choice-modal';
  modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.75);z-index:9999;display:flex;align-items:flex-end;justify-content:center';
  modal.innerHTML = `
    <div style="background:#111118;border:1px solid rgba(124,111,247,0.2);border-radius:20px 20px 0 0;
      padding:24px 20px 40px;width:100%;max-width:480px">
      <div style="width:40px;height:4px;background:rgba(255,255,255,0.15);border-radius:2px;margin:0 auto 20px"></div>
      <div style="font-size:16px;font-weight:700;color:#f1f0ff;margin-bottom:6px">Exportar PDF</div>
      <div style="font-size:12px;color:#5a5a7a;margin-bottom:20px">Elige el tipo de reporte</div>

      <div onclick="document.getElementById('pdf-choice-modal').remove();exportPDF()"
        style="display:flex;align-items:center;gap:14px;padding:16px;background:#16161e;
               border:1px solid rgba(255,255,255,0.06);border-radius:14px;cursor:pointer;margin-bottom:10px">
        <div style="width:48px;height:48px;border-radius:14px;background:rgba(124,111,247,0.15);
                    display:flex;align-items:center;justify-content:center;font-size:24px;flex-shrink:0">📄</div>
        <div>
          <div style="font-size:14px;font-weight:700;color:#f1f0ff">Reporte mensual</div>
          <div style="font-size:11px;color:#5a5a7a;margin-top:2px">Resumen financiero de ${MONTHS[M]} ${Y}</div>
        </div>
        <div style="margin-left:auto;color:#5a5a7a;font-size:18px">›</div>
      </div>

      <div onclick="document.getElementById('pdf-choice-modal').remove();exportRentaPDF()"
        style="display:flex;align-items:center;gap:14px;padding:16px;background:#16161e;
               border:1px solid rgba(255,255,255,0.06);border-radius:14px;cursor:pointer;margin-bottom:16px">
        <div style="width:48px;height:48px;border-radius:14px;background:rgba(245,158,11,0.15);
                    display:flex;align-items:center;justify-content:center;font-size:24px;flex-shrink:0">🇨🇴</div>
        <div>
          <div style="font-size:14px;font-weight:700;color:#f1f0ff">Declaración de renta</div>
          <div style="font-size:11px;color:#5a5a7a;margin-top:2px">Resumen anual ${Y} · Formulario 210 DIAN</div>
        </div>
        <div style="margin-left:auto;color:#5a5a7a;font-size:18px">›</div>
      </div>

      <div style="font-size:11px;color:#a5b4fc;font-weight:700;letter-spacing:.8px;margin:18px 0 8px">REPORTES POR FECHA</div>
      ${[['day','📅','Reporte diario','Movimientos de una fecha'],['week','🗓️','Reporte semanal','Movimientos de una semana'],['month','📊','Reporte mensual por fecha','Movimientos fechados del mes'],['range','↔️','Reporte personalizado','Rango de fechas']].map(([type, icon, title, subtitle]) => `
      <div onclick="openReportPDFModal('${type}')" style="display:flex;align-items:center;gap:14px;padding:13px;background:#16161e;border:1px solid rgba(255,255,255,0.06);border-radius:14px;cursor:pointer;margin-bottom:8px">
        <div style="width:42px;height:42px;border-radius:12px;background:rgba(99,102,241,0.15);display:flex;align-items:center;justify-content:center;font-size:20px;flex-shrink:0">${icon}</div>
        <div><div style="font-size:13px;font-weight:700;color:#f1f0ff">${title}</div><div style="font-size:11px;color:#5a5a7a;margin-top:2px">${subtitle}</div></div><div style="margin-left:auto;color:#5a5a7a;font-size:18px">›</div>
      </div>`).join('')}

      <button onclick="document.getElementById('pdf-choice-modal').remove()"
        style="width:100%;padding:13px;background:rgba(239,68,68,0.1);border:1px solid rgba(239,68,68,0.2);
               color:#f87171;border-radius:12px;font-size:14px;font-weight:600;cursor:pointer;
               font-family:'Outfit',sans-serif">Cancelar</button>
    </div>`;
  document.body.appendChild(modal);
}

function openReportPDFModal(type) {
  reportPeriodType = type;
  document.getElementById('pdf-choice-modal')?.remove();
  const modal = document.createElement('div');
  modal.id = 'report-pdf-modal';
  modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.75);z-index:10000;display:flex;align-items:flex-end;justify-content:center';
  const title = { day: 'Reporte diario', week: 'Reporte semanal', month: 'Reporte mensual por fecha', range: 'Reporte personalizado' }[type];
  const picker = type === 'range'
    ? `<div style="display:flex;gap:10px"><div style="flex:1"><label class="form-label">Desde</label><input id="report-start" class="form-input" type="date" value="${reportRangeStart}"></div><div style="flex:1"><label class="form-label">Hasta</label><input id="report-end" class="form-input" type="date" value="${reportRangeEnd}"></div></div>`
    : `<label class="form-label">${type === 'month' ? 'Mes' : 'Fecha'}</label><input id="report-date" class="form-input" type="${type === 'month' ? 'month' : 'date'}" value="${type === 'month' ? reportSelectedDate.slice(0, 7) : reportSelectedDate}">`;
  modal.innerHTML = `<div style="background:#111118;border:1px solid rgba(124,111,247,0.2);border-radius:20px 20px 0 0;padding:24px 20px 40px;width:100%;max-width:480px"><div style="width:40px;height:4px;background:rgba(255,255,255,0.15);border-radius:2px;margin:0 auto 20px"></div><div style="font-size:16px;font-weight:700;color:#f1f0ff;margin-bottom:6px">${title}</div><div style="font-size:12px;color:#5a5a7a;margin-bottom:18px">Selecciona el período del reporte</div>${picker}<button onclick="exportReportPDFFromModal()" class="btn-add" style="width:100%;margin-top:18px">📄 Generar PDF</button><button onclick="document.getElementById('report-pdf-modal').remove()" style="width:100%;margin-top:10px;padding:13px;background:rgba(239,68,68,0.1);border:1px solid rgba(239,68,68,0.2);color:#f87171;border-radius:12px;font-size:14px;font-weight:600;cursor:pointer;font-family:'Outfit',sans-serif">Cancelar</button></div>`;
  document.body.appendChild(modal);
}

function exportReportPDFFromModal() {
  refreshReport();
  if (!getReportPeriod()) { toast('⚠️ Selecciona un período válido'); return; }
  document.getElementById('report-pdf-modal')?.remove();
  exportReportPDF();
}

// ═══════════════════════════════════════════════════════
// FINANZAS — navegación por capas
// ═══════════════════════════════════════════════════════

// ── Reportes financieros por fecha (capa de consulta, sin alterar saldos) ──
let reportPeriodType = 'month';
let reportSelectedDate = fluxoMovementDate(Y, M, Math.min(today.getDate(), dim(Y, M))) || `${Y}-${String(M + 1).padStart(2, '0')}-01`;
let reportRangeStart = `${Y}-${String(M + 1).padStart(2, '0')}-01`;
let reportRangeEnd = fluxoMovementDate(Y, M, dim(Y, M));

function reportDateKey(year, month, day) {
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day) || month < 0 || month > 11 || day < 1 || day > dim(year, month)) return null;
  return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}
function reportDateFromValue(value) { return String(value || '').match(/^(\d{4}-\d{2}-\d{2})/)?.[1] || null; }
function reportDateParts(value) {
  const key = reportDateFromValue(value); if (!key) return null;
  const [year, month, day] = key.split('-').map(Number);
  return reportDateKey(year, month - 1, day) ? { year, month: month - 1, day, key } : null;
}
function reportDateLabel(value) { const date = reportDateParts(value); return date ? `${date.day} de ${MONTHS[date.month]} de ${date.year}` : 'Fecha no disponible'; }
function reportMonthsBetween(start, end) {
  const months = []; let year = start.year, month = start.month;
  while (year * 12 + month <= end.year * 12 + end.month) { months.push({ year, month }); month++; if (month === 12) { month = 0; year++; } }
  return months;
}

function getReportPeriod() {
  const selected = reportDateParts(document.getElementById('report-date')?.value || reportSelectedDate);
  const rangeStart = reportDateParts(document.getElementById('report-start')?.value || reportRangeStart);
  const rangeEnd = reportDateParts(document.getElementById('report-end')?.value || reportRangeEnd);
  if (reportPeriodType === 'range') return !rangeStart || !rangeEnd || rangeStart.key > rangeEnd.key ? null : { start: rangeStart, end: rangeEnd, label: `${reportDateLabel(rangeStart.key)} – ${reportDateLabel(rangeEnd.key)}`, typeLabel: 'Reporte por rango' };
  if (!selected) return null;
  if (reportPeriodType === 'day') return { start: selected, end: selected, label: reportDateLabel(selected.key), typeLabel: 'Reporte diario' };
  if (reportPeriodType === 'week') {
    const anchor = new Date(selected.year, selected.month, selected.day, 12), offset = (anchor.getDay() + 6) % 7;
    const first = new Date(anchor); first.setDate(anchor.getDate() - offset);
    const last = new Date(first); last.setDate(first.getDate() + 6);
    const start = { year: first.getFullYear(), month: first.getMonth(), day: first.getDate(), key: reportDateKey(first.getFullYear(), first.getMonth(), first.getDate()) };
    const end = { year: last.getFullYear(), month: last.getMonth(), day: last.getDate(), key: reportDateKey(last.getFullYear(), last.getMonth(), last.getDate()) };
    return { start, end, label: `${reportDateLabel(start.key)} – ${reportDateLabel(end.key)}`, typeLabel: 'Reporte semanal' };
  }
  const start = { year: selected.year, month: selected.month, day: 1, key: reportDateKey(selected.year, selected.month, 1) };
  const end = { year: selected.year, month: selected.month, day: dim(selected.year, selected.month), key: reportDateKey(selected.year, selected.month, dim(selected.year, selected.month)) };
  return { start, end, label: `${MONTHS[selected.month]} ${selected.year}`, typeLabel: 'Reporte mensual' };
}

function getReportMovements(period) {
  const movements = [];
  const add = movement => { const date = reportDateFromValue(movement.date); if (date && date >= period.start.key && date <= period.end.key) movements.push({ ...movement, date }); };
  const months = reportMonthsBetween(period.start, period.end);
  const addRecurring = (records, scope, type, sign) => (records || []).forEach(record => {
    const storedDate = reportDateFromValue(record.date || record.createdAt);
    if (record.scheduleVersion !== 1 && storedDate) {
      add({ date: storedDate, type, sign, description: record.name || type, amount: Number(record.amount) || 0 });
      return;
    }
    months.forEach(({ year, month }) => {
      const addDay = (day, slot, suffix = '') => {
        const dueDay = Number(day);
        if (!isScheduledOccurrenceRealized(record, year, month, dueDay, slot)) return;
        const occ = getScheduledOccurrence(record, year, month, slot);
        const date = reportDateFromValue(occ?.date) || reportDateKey(year, month, dueDay) || reportDateFromValue(record.date || record.createdAt);
        add({ date, type, sign, description: `${record.name || type}${scope === 'month' ? ' · solo este mes' : ''}${suffix}`, amount: Number(record.amount) || 0 });
      };
      if (record.type === 'quincenal') { addDay(record.day, 'q1', ' · Q1'); addDay(record.day2, 'q2', ' · Q2'); }
      else addDay(record.day, record.type === 'daily' ? `d${Number(record.day)}` : 'monthly');
    });
  });
  addRecurring(expenses, 'global', 'Gasto normal', '-'); addRecurring(incomes, 'global', 'Ingreso', '+');
  months.forEach(({ year, month }) => {
    const mk = monthKey(year, month);
    addRecurring(monthExpenses[mk], 'month', 'Gasto normal', '-'); addRecurring(monthIncomes[mk], 'month', 'Ingreso', '+');
    (monthExtras[mk] || []).forEach(extra => add({ date: extra.date || extra.createdAt, type: 'Extra', sign: '+', description: extra.desc || 'Extra o recargo', amount: (Number(extra.qty) || 0) * (Number(extra.unitValue) || 0) }));
    const earnings = calcMonthEarnings(year, month);
    getMonthDiscData(year, month).allForMonth.forEach(discount => {
      const date = reportDateFromValue(discount.date || discount.createdAt); if (!date) return;
      const day = reportDateParts(date)?.day, base = discount.freq === 'quincenal' ? (day <= 15 ? earnings.q1earn : earnings.q2earn) : earnings.totalEarn;
      add({ date, type: 'Descuento', sign: '-', description: discount.name || 'Descuento', amount: discount.type === 'pct' ? (Number(discount.pct) || 0) / 100 * base : Number(discount.fixed) || 0 });
    });
    debts.forEach(debt => (debt.payments || []).filter(payment => payment.mk === mk).forEach(payment => add({ date: reportDateFromValue(payment.date || payment.createdAt) || reportDateKey(year, month, payment.quincena === 'Q2' ? Number(debt.day2) : Number(debt.day)), type: 'Pago de deuda', sign: '-', description: `${debt.name || 'Deuda'}${payment.quincena ? ` · ${payment.quincena}` : ''}`, amount: Number(payment.amount) || 0 })));
    savings.forEach(saving => (saving.payments || []).filter(payment => payment.mk === mk && payment.kind !== 'withdrawal' && payment.type !== 'withdrawal').forEach(payment => add({ date: reportDateFromValue(payment.date || payment.createdAt) || (payment.initial ? reportDateFromValue(saving.startDate) : null) || reportDateKey(year, month, payment.label === 'Q2' ? Number(saving.day2) : Number(saving.day)), type: 'Aporte a ahorro', sign: '-', description: `${saving.name || 'Ahorro'}${payment.initial ? ' · saldo inicial' : payment.label ? ` · ${payment.label}` : ''}`, amount: Math.abs(Number(payment.amount) || 0) })));
  });
  savingsEvents.forEach(event => {
    const definitions = { withdraw: ['Retiro de ahorro', '+'], refund: ['Devolución de ahorro', '+'], complete: ['Meta de ahorro completada', '-'], destroy: ['Meta de ahorro gastada', '-'] };
    if (definitions[event.type]) add({ date: event.at || event.date || event.createdAt, type: definitions[event.type][0], sign: definitions[event.type][1], description: event.savingName || 'Ahorro', amount: Number(event.amount) || 0 });
  });
  return movements.sort((a, b) => a.date.localeCompare(b.date) || a.type.localeCompare(b.type));
}

function getReportSummary(movements) {
  const total = type => movements.filter(movement => movement.type === type).reduce((sum, movement) => sum + movement.amount, 0);
  const income = total('Ingreso'), extras = total('Extra'), expenses = total('Gasto normal'), debts = total('Pago de deuda'), discounts = total('Descuento');
  const savings = movements.filter(movement => movement.type === 'Aporte a ahorro' || movement.type.includes('Meta de ahorro')).reduce((sum, movement) => sum + movement.amount, 0);
  const withdrawals = movements.filter(movement => movement.sign === '+' && movement.type !== 'Ingreso' && movement.type !== 'Extra').reduce((sum, movement) => sum + movement.amount, 0);
  const totalIn = income + extras + withdrawals, totalOut = expenses + debts + discounts + savings;
  return { income, extras, expenses, debts, discounts, savings, withdrawals, totalIn, totalOut, balance: totalIn - totalOut };
}

function setReportPeriodType(type) { reportPeriodType = type; renderReportsPanel(); }
function refreshReport() {
  const selected = document.getElementById('report-date')?.value;
  reportSelectedDate = selected ? (reportPeriodType === 'month' ? `${selected}-01` : selected) : reportSelectedDate;
  reportRangeStart = document.getElementById('report-start')?.value || reportRangeStart;
  reportRangeEnd = document.getElementById('report-end')?.value || reportRangeEnd;
  renderReportsPanel();
}

function renderReportsPanel() {
  const contentEl = document.getElementById('fin-panel-content'), period = getReportPeriod(), movements = period ? getReportMovements(period) : [], summary = getReportSummary(movements);
  const picker = reportPeriodType === 'range' ? `<div class="report-date-row"><div class="form-group"><label class="form-label">Desde</label><input id="report-start" class="form-input" type="date" value="${reportRangeStart}" onchange="refreshReport()"></div><div class="form-group"><label class="form-label">Hasta</label><input id="report-end" class="form-input" type="date" value="${reportRangeEnd}" onchange="refreshReport()"></div></div>` : `<div class="form-group"><label class="form-label">${reportPeriodType === 'month' ? 'Mes de consulta' : 'Fecha'}</label><input id="report-date" class="form-input" type="${reportPeriodType === 'month' ? 'month' : 'date'}" value="${reportPeriodType === 'month' ? reportSelectedDate.slice(0, 7) : reportSelectedDate}" onchange="refreshReport()"></div>`;
  const details = movements.length ? movements.map(movement => `<div class="report-movement"><div><div class="report-movement-date">${reportDateLabel(movement.date)}</div><div class="report-movement-type">${movement.type}</div><div class="report-movement-name">${movement.description}</div></div><div class="${movement.sign === '+' ? 'report-positive' : 'report-negative'}">${movement.sign}${fmt(movement.amount)}</div></div>`).join('') : '<div class="empty-state">Sin movimientos con fecha registrada en este período</div>';
  contentEl.innerHTML = `<div class="report-panel"><div class="report-period-buttons"><button class="scope-btn ${reportPeriodType === 'day' ? 'scope-active' : ''}" onclick="setReportPeriodType('day')">Diario</button><button class="scope-btn ${reportPeriodType === 'week' ? 'scope-active' : ''}" onclick="setReportPeriodType('week')">Semanal</button><button class="scope-btn ${reportPeriodType === 'month' ? 'scope-active' : ''}" onclick="setReportPeriodType('month')">Mensual</button><button class="scope-btn ${reportPeriodType === 'range' ? 'scope-active' : ''}" onclick="setReportPeriodType('range')">Personalizado</button></div>${picker}${period ? `<div class="report-period-label">${period.typeLabel} · ${period.label}</div>` : '<div class="empty-state">Selecciona un rango válido</div>'}<div class="report-summary"><div><span>Ingresos</span><strong>${fmt(summary.income)}</strong></div><div><span>Extras</span><strong>${fmt(summary.extras)}</strong></div><div><span>Gastos normales</span><strong>${fmt(summary.expenses)}</strong></div><div><span>Deudas</span><strong>${fmt(summary.debts)}</strong></div><div><span>Descuentos</span><strong>${fmt(summary.discounts)}</strong></div><div><span>Ahorros</span><strong>${fmt(summary.savings)}</strong></div><div><span>Total salidas</span><strong>${fmt(summary.totalOut)}</strong></div><div class="report-balance"><span>Balance</span><strong>${fmt(summary.balance)}</strong></div></div><button class="btn-add" onclick="exportReportPDF()" ${period ? '' : 'disabled'}>📄 Exportar reporte a PDF</button><div class="section-title">📋 Movimientos</div>${details}<div class="report-note">Se incluyen únicamente movimientos con una fecha o día ya registrado. Los registros históricos sin fecha exacta no se ubican artificialmente en un día.</div></div>`;
}

function escapeReportHtml(value) { return String(value).replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]); }
function exportReportPDF() {
  const period = getReportPeriod();
  if (!period) { toast('⚠️ Selecciona un período válido'); return; }

  const movements = getReportMovements(period);
  const summary = getReportSummary(movements);
  const popup = window.open('', '_blank');
  if (!popup) { toast('⚠️ Permite las ventanas emergentes para exportar el PDF'); return; }

  const dateStr = new Date().toLocaleDateString('es-CO', { day: 'numeric', month: 'long', year: 'numeric' });
  const typeIcons = { 'Ingreso':'💰', 'Extra':'⏰', 'Gasto normal':'💸', 'Deuda':'💳', 'Descuento':'✂️', 'Ahorro':'🏦', 'Retiro de ahorro':'🏦' };
  const rows = movements.map(m => {
    const cls = m.sign === '+' ? 'green' : 'red';
    return `<div class="pdf-exp-row ${cls}">
      <div class="pdf-move-main"><span class="pdf-move-date">${escapeReportHtml(reportDateLabel(m.date))}</span><span class="pdf-exp-name">${typeIcons[m.type] || '📋'} ${escapeReportHtml(m.description)}</span><span class="pdf-exp-type">${escapeReportHtml(m.type)}</span></div>
      <span class="pdf-exp-amt ${m.sign === '+' ? 'positive' : 'negative'}">${m.sign}${fmt(m.amount)}</span>
    </div>`;
  }).join('') || '<div class="pdf-exp-empty">Sin movimientos con fecha registrada</div>';

  popup.document.write(`<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"><title>FluxoApp · ${escapeReportHtml(period.typeLabel)}</title>
  <style>
    *{box-sizing:border-box}body{margin:0;background:#eef0f6;color:#25243a;font-family:'Segoe UI',Arial,sans-serif}.pdf-page{width:210mm;min-height:297mm;margin:0 auto;background:#fff;padding:18mm 16mm}.pdf-header{display:flex;justify-content:space-between;align-items:center;padding-bottom:14px;border-bottom:2px solid #e8e6f7;margin-bottom:18px}.pdf-header-left{display:flex;align-items:center;gap:10px}.pdf-logo-box{width:42px;height:42px;border-radius:12px;background:linear-gradient(135deg,#6366f1,#8b5cf6);display:flex;align-items:center;justify-content:center;font-size:22px}.pdf-app-name{font-size:24px;font-weight:800;color:#34325a}.pdf-app-sub{font-size:12px;color:#77758e;margin-top:2px}.pdf-header-right{text-align:right}.pdf-month-label{font-size:16px;font-weight:700;color:#34325a}.pdf-month-label span{color:#6965d8}.pdf-generated{font-size:10px;color:#8b899d;margin-top:5px}.pdf-top-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-bottom:20px}.pdf-top-card{border-radius:14px;padding:13px;border:1px solid #e7e6ef}.pdf-top-card.blue{background:#f4f4ff;border-color:#dfdefc}.pdf-top-card.red{background:#fff5f5;border-color:#f9dddd}.pdf-top-card.green{background:#f2fbf6;border-color:#d9f1e3}.pdf-top-card-icon{font-size:18px;margin-bottom:6px}.pdf-top-card-label{font-size:10px;color:#77758e;text-transform:uppercase;letter-spacing:.4px}.pdf-top-card-val{font-size:17px;font-weight:800;margin-top:4px}.pdf-top-card.blue .pdf-top-card-val{color:#6366f1}.pdf-top-card.red .pdf-top-card-val{color:#ef4444}.pdf-top-card.green .pdf-top-card-val{color:#10b981}.pdf-top-card-sub{font-size:9px;color:#8b899d;margin-top:4px}.pdf-section{margin-top:18px}.pdf-section-title{font-size:14px;font-weight:800;color:#34325a;margin-bottom:9px;display:flex;align-items:center;gap:6px}.pdf-summary-grid{display:grid;grid-template-columns:repeat(2,1fr);gap:8px}.pdf-summary-card{border:1px solid #ebeaf2;border-radius:10px;padding:10px;background:#fafafd}.pdf-summary-card span{display:block;font-size:10px;color:#7d7a90}.pdf-summary-card strong{display:block;font-size:15px;color:#37355c;margin-top:3px}.pdf-summary-card.balance{background:#f4f4ff;border-color:#deddfc}.pdf-summary-card.balance strong{color:#6366f1}.pdf-exp-list{border:1px solid #ebeaf2;border-radius:12px;padding:4px 10px}.pdf-exp-row{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:10px 2px;border-bottom:1px solid #efedf4}.pdf-exp-row:last-child{border-bottom:0}.pdf-move-main{min-width:0;display:flex;align-items:center;gap:7px;flex-wrap:wrap}.pdf-move-date{font-size:10px;color:#77758e;min-width:54px}.pdf-exp-name{font-size:11px;color:#37354b;font-weight:600}.pdf-exp-type{font-size:9px;color:#88859a;background:#f1f0f7;border-radius:99px;padding:3px 6px}.pdf-exp-amt{font-size:12px;font-weight:800;white-space:nowrap}.positive{color:#10b981}.negative{color:#ef4444}.pdf-exp-empty{padding:20px;text-align:center;color:#9995a8;font-size:11px}.pdf-footer{margin-top:24px;padding-top:10px;border-top:1px solid #ebeaf2;display:flex;justify-content:space-between;color:#9995a8;font-size:9px}@media print{body{background:#fff}.pdf-page{margin:0;width:auto;min-height:auto;padding:12mm}.pdf-top-card-val{font-size:15px}}
  </style></head><body><div class="pdf-page">
    <div class="pdf-header"><div class="pdf-header-left"><div class="pdf-logo-box">💰</div><div><div class="pdf-app-name">FluxoApp</div><div class="pdf-app-sub">${escapeReportHtml(period.typeLabel)}</div></div></div><div class="pdf-header-right"><div class="pdf-month-label">${escapeReportHtml(period.label)}</div><div class="pdf-generated">Generado: ${escapeReportHtml(dateStr)}</div></div></div>
    <div class="pdf-top-grid"><div class="pdf-top-card blue"><div class="pdf-top-card-icon">💰</div><div class="pdf-top-card-label">Total entradas</div><div class="pdf-top-card-val">${fmt(summary.income + summary.extras)}</div><div class="pdf-top-card-sub">Ingresos + extras</div></div><div class="pdf-top-card red"><div class="pdf-top-card-icon">📋</div><div class="pdf-top-card-label">Total salidas</div><div class="pdf-top-card-val">${fmt(summary.totalOut)}</div><div class="pdf-top-card-sub">Gastos, deudas, descuentos y ahorros</div></div><div class="pdf-top-card green"><div class="pdf-top-card-icon">💵</div><div class="pdf-top-card-label">Balance</div><div class="pdf-top-card-val">${fmt(summary.balance)}</div><div class="pdf-top-card-sub">Resultado del período</div></div></div>
    <div class="pdf-section"><div class="pdf-section-title">📊 Resumen financiero</div><div class="pdf-summary-grid"><div class="pdf-summary-card"><span>Ingresos</span><strong>${fmt(summary.income)}</strong></div><div class="pdf-summary-card"><span>Extras</span><strong>${fmt(summary.extras)}</strong></div><div class="pdf-summary-card"><span>Gastos normales</span><strong>${fmt(summary.expenses)}</strong></div><div class="pdf-summary-card"><span>Deudas</span><strong>${fmt(summary.debts)}</strong></div><div class="pdf-summary-card"><span>Descuentos</span><strong>${fmt(summary.discounts)}</strong></div><div class="pdf-summary-card"><span>Ahorros</span><strong>${fmt(summary.savings)}</strong></div><div class="pdf-summary-card"><span>Total salidas</span><strong>${fmt(summary.totalOut)}</strong></div><div class="pdf-summary-card balance"><span>Balance del período</span><strong>${fmt(summary.balance)}</strong></div></div></div>
    <div class="pdf-section"><div class="pdf-section-title">📋 Movimientos</div><div class="pdf-exp-list">${rows}</div></div>
    <div class="pdf-footer"><span>FluxoApp · Reporte financiero</span><span>${escapeReportHtml(period.typeLabel)} · ${escapeReportHtml(period.label)}</span></div>
  </div><script>window.onload=()=>window.print();</script></body></html>`);
  popup.document.close();
}

const FIN_PANELS = {
  ingresos:    { title: 'Ingresos',    icon: '💰', render: renderIngresoPanel },
  gastos:      { title: 'Gastos',      icon: '💸', render: renderGastosPanel },
  ahorros:     { title: 'Ahorros',     icon: '🏦', render: renderAhorrosPanel },
  // Sub-paneles internos
  'ingresos-turnos':   { title: 'Ingresos por turnos', icon: '📅', render: renderIncomesTurnos },
  'ingresos-extras':   { title: 'Ingresos extras',     icon: '💰', render: renderIncomes },
  'ingresos-recargos': { title: 'Extras y recargos',   icon: '⏰', render: renderRecargosPanel },
  'gastos-normales':   { title: 'Gastos normales',     icon: '💸', render: renderExpenses },
  'gastos-deudas':     { title: 'Deudas',              icon: '💳', render: renderDebts },
  'gastos-descuentos': { title: 'Descuentos',          icon: '✂️', render: renderDiscounts },
  'ahorros-activos':   { title: 'Ahorros activos',     icon: '🏦', render: renderSavings },
  'ahorros-historial': { title: 'Historial de ahorros',icon: '📋', render: renderSavingsHistory },
};

function renderIngresoPanel() {
  const contentEl = document.getElementById('fin-panel-content');
  const c = calcMonth(Y, M);
  const extTotal = getMonthExtrasTotal(Y, M);
  contentEl.innerHTML = `
    <div class="fin-menu-item" onclick="openSubPanel('ingresos-turnos')">
      <div class="fin-menu-icon" style="background:rgba(99,102,241,0.15)">📅</div>
      <div class="fin-menu-info">
        <div class="fin-menu-title">Ingresos por turnos</div>
        <div class="fin-menu-sub">Salario · ${salary ? (salary.type==='fixed'?'Sueldo fijo':'Por hora') : 'Sin configurar'}</div>
      </div>
      <div class="fin-menu-val" style="color:#a5b4fc">${fmt(c.totalEarn)}</div>
      <div class="fin-menu-arrow">›</div>
    </div>
    <div class="fin-menu-item" onclick="openSubPanel('ingresos-extras')">
      <div class="fin-menu-icon" style="background:rgba(16,185,129,0.15)">💰</div>
      <div class="fin-menu-info">
        <div class="fin-menu-title">Ingresos extras</div>
        <div class="fin-menu-sub">Bonificaciones, otros ingresos</div>
      </div>
      <div class="fin-menu-val" style="color:#6ee7b7">${c.incomes > 0 ? fmt(c.incomes) : ''}</div>
      <div class="fin-menu-arrow">›</div>
    </div>
    <div class="fin-menu-item" onclick="openSubPanel('ingresos-recargos')">
      <div class="fin-menu-icon" style="background:rgba(245,158,11,0.15)">⏰</div>
      <div class="fin-menu-info">
        <div class="fin-menu-title">Extras y recargos</div>
        <div class="fin-menu-sub">Horas extra, nocturnos, festivos</div>
      </div>
      <div class="fin-menu-val" style="color:#fbbf24">${extTotal > 0 ? fmt(extTotal) : ''}</div>
      <div class="fin-menu-arrow">›</div>
    </div>`;
}

function renderRecargosPanel() {
  const contentEl = document.getElementById('recargos-list-content');
  if (!contentEl) return;

  const extras = getMonthExtras(Y, M);
  const mk = monthKey(Y, M);
  const EXTRA_TYPES_MAP = {
    overtime:  { label: 'Hora extra',        icon: '⏰', color: '#f59e0b' },
    nocturnal: { label: 'Recargo nocturno',  icon: '🌙', color: '#8b5cf6' },
    holiday:   { label: 'Trabajo festivo',   icon: '🎉', color: '#10b981' },
    sunday:    { label: 'Domingo trabajado', icon: '📅', color: '#3b82f6' },
    other:     { label: 'Otro',              icon: '➕', color: '#64748b' },
  };

  const extrasList = extras.length > 0
    ? extras.map(e => {
        const t = EXTRA_TYPES_MAP[e.type] || EXTRA_TYPES_MAP.other;
        const units = e.qty === 1 ? 'unidad' : 'unidades';
        return `<div class="exp-item" style="border-left-color:${t.color}">
          <div>
            <div class="exp-name">${t.icon} ${t.label}</div>
            <div class="exp-meta">${e.desc || 'Sin descripción'} · ${e.qty} ${units} × ${fmt(e.unitValue)}</div>
          </div>
          <div class="exp-right">
            <div class="exp-amount" style="color:${t.color}">+${fmt(e.qty * e.unitValue)}</div>
            <button class="exp-del" onclick="deleteExtra('${mk}','${e.id}')" aria-label="Eliminar extra">✕</button>
          </div>
        </div>`;
      }).join('')
    : '<div class="empty-state" style="color:#374151;padding:20px">No hay extras o recargos registrados.<br><span style="font-size:20px">⏰</span></div>';

  let html = `<div class="month-nav">
    <button class="nav-btn" onclick="prevMonth()" style="background:rgba(245,158,11,0.1)">‹</button>
    <div class="month-label">
      <div class="month-name" style="font-family:'DM Serif Display',serif;font-size:17px">${MONTHS[M]} ${Y}</div>
    </div>
    <button class="nav-btn" onclick="nextMonth()" style="background:rgba(245,158,11,0.1)">›</button>
  </div>`;

  html += extrasList;
  contentEl.innerHTML = html;

  updateExtraUnit();
}

function renderGastosPanel() {
  const contentEl = document.getElementById('fin-panel-content');
  const c = calcMonth(Y, M);
  const {total: expTotal} = getMonthExpenses(Y, M);
  const discData = getMonthDiscounts(Y, M);
  contentEl.innerHTML = `
    <div class="fin-menu-item" onclick="openSubPanel('gastos-normales')">
      <div class="fin-menu-icon" style="background:rgba(239,68,68,0.15)">🛒</div>
      <div class="fin-menu-info">
        <div class="fin-menu-title">Gastos normales</div>
        <div class="fin-menu-sub">Compras, servicios, alimentación</div>
      </div>
      <div class="fin-menu-val" style="color:#f87171">${expTotal > 0 ? fmt(expTotal) : ''}</div>
      <div class="fin-menu-arrow">›</div>
    </div>
    <div class="fin-menu-item" onclick="openSubPanel('gastos-deudas')">
      <div class="fin-menu-icon" style="background:rgba(239,68,68,0.12)">💳</div>
      <div class="fin-menu-info">
        <div class="fin-menu-title">Deudas</div>
        <div class="fin-menu-sub">Préstamos, cuotas, tarjetas</div>
      </div>
      <div class="fin-menu-val" style="color:#fca5a5">${c.debts > 0 ? fmt(c.debts) : ''}</div>
      <div class="fin-menu-arrow">›</div>
    </div>
    <div class="fin-menu-item" onclick="openSubPanel('gastos-descuentos')">
      <div class="fin-menu-icon" style="background:rgba(168,85,247,0.15)">✂️</div>
      <div class="fin-menu-info">
        <div class="fin-menu-title">Descuentos</div>
        <div class="fin-menu-sub">Nómina, embargos, retenciones</div>
      </div>
      <div class="fin-menu-val" style="color:#c084fc">${discData.total > 0 ? fmt(discData.total) : ''}</div>
      <div class="fin-menu-arrow">›</div>
    </div>`;
}

function renderAhorrosPanel() {
  const contentEl = document.getElementById('fin-panel-content');
  const activos   = savings.filter(s => (s.goal-(s.saved||0)) > 0).length;
  const completados = savings.filter(s => (s.goal-(s.saved||0)) <= 0).length;
  contentEl.innerHTML = `
    <div class="fin-menu-item" onclick="openSubPanel('ahorros-activos')">
      <div class="fin-menu-icon" style="background:rgba(59,130,246,0.15)">🏦</div>
      <div class="fin-menu-info">
        <div class="fin-menu-title">Mis ahorros</div>
        <div class="fin-menu-sub">${activos} meta${activos !== 1 ? 's' : ''} en curso</div>
      </div>
      <div class="fin-menu-arrow">›</div>
    </div>
    <div class="fin-menu-item" onclick="openSubPanel('ahorros-historial')">
      <div class="fin-menu-icon" style="background:rgba(16,185,129,0.15)">📋</div>
      <div class="fin-menu-info">
        <div class="fin-menu-title">Metas cumplidas</div>
        <div class="fin-menu-sub">${completados} ahorro${completados !== 1 ? 's' : ''} completado${completados !== 1 ? 's' : ''}</div>
      </div>
      <div class="fin-menu-arrow">›</div>
    </div>`;
}

function renderIncomesTurnos() {
  const contentEl = document.getElementById('fin-panel-content');
  const c = calcMonth(Y, M);
  const salLabel = salary
    ? (salary.type === 'fixed'
        ? `Sueldo fijo ${salary.fixedType === 'quincenal' ? 'quincenal' : 'mensual'}: ${fmt(salary.fixedAmount)}`
        : `Por hora: ${fmt(salary.baseRate)}/h`)
    : 'Sin sueldo configurado';
  contentEl.innerHTML = `
    <div class="s-card-full" style="margin-bottom:12px;background:rgba(99,102,241,0.08);border-color:rgba(99,102,241,0.2)">
      <div style="font-size:11px;color:#a5b4fc;font-weight:700;margin-bottom:8px">💰 DEVENGADO ESTE MES</div>
      <div style="font-family:'DM Mono',monospace;font-size:32px;font-weight:500;color:#c4b5fd">${fmt(c.totalEarn)}</div>
      <div style="font-size:11px;color:#5a5a7a;margin-top:6px">${salary && salary.type === 'fixed' ? 'Sueldo fijo' : c.totalHours+'h trabajadas'}</div>
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:16px">
      <div class="s-card" style="border-left:3px solid #60a5fa;padding:12px">
        <div class="card-label" style="color:#93c5fd">1ª Quincena</div>
        <div class="card-amount" style="color:#60a5fa;font-size:18px">${fmt(c.q1earn)}</div>
        <div style="font-size:10px;color:#5a5a7a;margin-top:3px">${c.q1h}h · ${Math.round(c.q1h/(salary?.hours||12))} turnos</div>
      </div>
      <div class="s-card" style="border-left:3px solid #60a5fa;padding:12px">
        <div class="card-label" style="color:#93c5fd">2ª Quincena</div>
        <div class="card-amount" style="color:#60a5fa;font-size:18px">${fmt(c.q2earn)}</div>
        <div style="font-size:10px;color:#5a5a7a;margin-top:3px">${c.q2h}h · ${Math.round(c.q2h/(salary?.hours||12))} turnos</div>
      </div>
    </div>
    <div class="s-card-full" style="margin-bottom:12px;cursor:pointer" onclick="openSalaryModal()">
      <div style="display:flex;justify-content:space-between;align-items:center">
        <div>
          <div style="font-size:13px;font-weight:600;color:#f1f0ff">⚙️ Configurar sueldo</div>
          <div style="font-size:11px;color:#5a5a7a;margin-top:3px">${salLabel}</div>
        </div>
        <div style="color:#5a5a7a;font-size:18px">›</div>
      </div>
    </div>`;
}

function renderSavingsHistory() {
  const contentEl = document.getElementById('fin-panel-content');
  const completed = savings.filter(s => (s.goal-(s.saved||0)) <= 0);
  if (completed.length === 0) {
    contentEl.innerHTML = '<div class="empty-state">Aún no has completado ninguna meta de ahorro 🏦</div>';
    return;
  }
  contentEl.innerHTML = completed.map(s => {
    const completedDate = s.completedAt ? new Date(s.completedAt) : null;
    const completedLabel = completedDate && !isNaN(completedDate)
      ? completedDate.toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' })
      : (s.completedY != null ? `${MONTHS[s.completedM ?? M]} ${s.completedY}` : 'Fecha no disponible');
    return `<div class="saving-card" style="opacity:0.9;border-color:rgba(16,185,129,0.22)">
      <div class="debt-card-header">
        <div>
          <div class="debt-name">${s.name}</div>
          <div class="debt-meta" style="color:#6ee7b7">🏆 Completada el ${completedLabel}</div>
        </div>
        <div style="text-align:right">
          <div class="debt-amount total">${fmt(s.goal)}</div>
          <div class="debt-amount paid">Ahorrado: ${fmt(s.saved || 0)}</div>
        </div>
      </div>
      <div class="saving-progress-bar"><div class="saving-progress-fill" style="width:100%;background:linear-gradient(90deg,#10b981,#34d399)"></div></div>
      <div class="saving-progress-label">
        <span>100% alcanzado</span>
        <span>${fmt(s.saved || 0)} / ${fmt(s.goal)}</span>
      </div>
      ${(s.payments || []).length > 0 ? `<div style="margin-top:10px;border-top:1px solid rgba(16,185,129,0.16);padding-top:9px">
        <div style="font-size:9px;color:#34d399;font-weight:700;letter-spacing:1px;margin-bottom:6px">HISTORIAL DE APORTES</div>
        ${[...(s.payments)].sort((a,b)=>(a.y*12+a.m)-(b.y*12+b.m)).map(p =>
          `<div style="display:flex;justify-content:space-between;font-size:11px;color:#94a3b8;padding:2px 0">
            <span>${MONTHS[p.m]} ${p.y}${p.label ? ' · ' + p.label : ''}</span>
            <span style="color:#6ee7b7;font-weight:600">${fmt(p.amount)}</span>
          </div>`).join('')}
      </div>` : ''}
      <div class="debt-footer" style="margin-top:10px">
        <div class="debt-cuota-info">💸 Dinero utilizado · ya no forma parte del saldo</div>
        <div style="display:flex;gap:6px">
          <button onclick="deleteSaving(${s.id})" class="exp-del" aria-label="Eliminar historial de meta cumplida">✕</button>
        </div>
      </div>
    </div>`;
  }).join('');
}

// Sub-panel navigation (second level inside finanzas)
let subPanelStack = [];

function openSubPanel(panel) {
  const p = FIN_PANELS[panel];
  if (!p) return;
  subPanelStack.push(currentFinPanel);
  currentFinPanel = panel;
  document.getElementById('fin-panel-title').textContent = p.icon + ' ' + p.title;
  const contentEl = document.getElementById('fin-panel-content');
  const finSec = document.getElementById('section-finanzas');

  const movMap = {
    'gastos-normales':   'gastos',
    'ingresos-extras':   'ingresos',
    'gastos-deudas':     'deudas',
    'gastos-descuentos': 'descuentos',
    'ahorros-activos':   'ahorros',
    'ingresos-recargos': 'recargos',
  };
  const movKey = movMap[panel];

  if (movKey) {
    // Make sure the mov-* div is in section-finanzas first (not destroyed)
    const movEl = document.getElementById('mov-' + movKey);
    if (movEl && movEl.parentElement !== finSec) {
      finSec.appendChild(movEl);
    }
    // Clear contentEl and move the correct div in
    contentEl.innerHTML = '';
    if (movEl) {
      contentEl.appendChild(movEl);
      movEl.style.display = 'block';
    }
  } else {
    contentEl.innerHTML = '';
  }
  p.render();

  const backBtn = document.querySelector('.sub-panel-back');
  if (backBtn) backBtn.onclick = closeSubPanel;
}

function closeSubPanel() {
  const parent = subPanelStack.pop();
  if (!parent) { closeFinPanel(); return; }
  currentFinPanel = parent;
  const p = FIN_PANELS[parent];
  if (!p) { closeFinPanel(); return; }
  document.getElementById('fin-panel-title').textContent = p.icon + ' ' + p.title;
  const backBtn = document.querySelector('.sub-panel-back');
  if (backBtn) backBtn.onclick = subPanelStack.length > 0 ? closeSubPanel : closeFinPanel;
  const contentEl = document.getElementById('fin-panel-content');
  // Return any mov-* divs to section-finanzas and hide them
  const finSection = document.getElementById('section-finanzas');
  ['gastos','ingresos','ahorros','deudas','descuentos','recargos'].forEach(pp => {
    const el = document.getElementById('mov-' + pp);
    if (el) { el.style.display = 'none'; finSection.appendChild(el); }
  });
  contentEl.innerHTML = '';
  p.render();
}

let currentFinPanel = null;

function openFinPanel(panel) {
  currentFinPanel = panel;
  movPanel = panel;
  subPanelStack = [];

  const p = FIN_PANELS[panel];
  if (!p) return;

  const finMenu = document.getElementById('fin-menu');
  const finPanel = document.getElementById('fin-panel');
  const contentEl = document.getElementById('fin-panel-content');
  const finSec = document.getElementById('section-finanzas');

  finMenu.style.display = 'none';
  finPanel.style.display = 'block';
  document.getElementById('fin-panel-title').textContent = p.icon + ' ' + p.title;

  // IMPORTANT:
  // The bottom navigation hides all mov-* panels when leaving Finanzas.
  // If the last active Finance view is a sub-panel, simply calling p.render()
  // is not enough: its mov-* container may still be hidden and outside
  // fin-panel-content. We therefore restore the correct container here,
  // exactly as openSubPanel() does.
  const movMap = {
    'gastos-normales':   'gastos',
    'ingresos-extras':   'ingresos',
    'gastos-deudas':     'deudas',
    'gastos-descuentos': 'descuentos',
    'ahorros-activos':   'ahorros',
    'ingresos-recargos': 'recargos',
  };

  const movKey = movMap[panel];

  // Always return all mov-* containers to the Finance section and hide them
  // first, preventing stale/duplicate DOM state after bottom-bar navigation.
  ['gastos','ingresos','ahorros','deudas','descuentos','recargos'].forEach(pp => {
    const el = document.getElementById('mov-' + pp);
    if (el) {
      el.style.display = 'none';
      if (el.parentElement !== finSec) finSec.appendChild(el);
    }
  });

  contentEl.innerHTML = '';

  if (movKey) {
    const movEl = document.getElementById('mov-' + movKey);
    if (movEl) {
      contentEl.appendChild(movEl);
      movEl.style.display = 'block';
    }
  }

  // Render after the correct container has been restored.
  p.render();
}
function closeFinPanel() {
  currentFinPanel = null;
  movPanel = 'gastos';
  document.getElementById('fin-panel').style.display = 'none';
  document.getElementById('fin-menu').style.display = 'block';
  subPanelStack = [];
  ['gastos','ingresos','ahorros','deudas','descuentos','recargos'].forEach(p => {
    const el = document.getElementById('mov-' + p);
    if (el) el.style.display = 'none';
  });
  // Return mov-* divs to section-finanzas
  const finSec = document.getElementById('section-finanzas');
  ['gastos','ingresos','ahorros','deudas','descuentos','recargos'].forEach(pp => {
    const el = document.getElementById('mov-' + pp);
    if (el) { el.style.display = 'none'; finSec.appendChild(el); }
  });
  const backBtn = document.querySelector('.sub-panel-back');
  if (backBtn) backBtn.onclick = closeFinPanel;
  updateFinMenu();
}

function updateFinMenu() {
  const { total: expTotal } = getMonthExpenses(Y, M);
  const { total: incTotal } = getMonthIncomes(Y, M);
  const savTotal  = getMonthSavingsTotal(Y, M);
  const c = calcMonth(Y, M);
  const vals = {
    gastos:   (expTotal + (c.discounts||0) + c.debts) > 0 ? `-${fmt(expTotal + (c.discounts||0) + c.debts)}` : '',
    ingresos: (c.totalEarn + incTotal + (c.extrasTotal||0)) > 0 ? `+${fmt(c.totalEarn + incTotal + (c.extrasTotal||0))}` : '',
    ahorros:  savTotal > 0 ? `-${fmt(savTotal)}` : '',
  };
  Object.entries(vals).forEach(([key, val]) => {
    const el = document.getElementById('fin-val-' + key);
    if (el) el.textContent = val;
  });
}

// ═══════════════════════════════════════════════════════
// USUARIO — nombre y saludo
// ═══════════════════════════════════════════════════════
const USER_NAME_KEY = 'fluxo_user_name';

function saveUserName() {
  const input = document.getElementById('user-name-input');
  if (!input) return;
  const name = input.value.trim();
  if (!name) { toast('⚠️ Escribe tu nombre'); return; }
  FinanceStorage.setRaw(USER_NAME_KEY, name);
  updateGreeting();
  toast('✅ Nombre guardado');
}

function updateGreeting() {
  const name = FinanceStorage.getRaw(USER_NAME_KEY);
  const el   = document.getElementById('header-greeting');
  const inp  = document.getElementById('user-name-input');
  if (el) {
    const hour = new Date().getHours();
    const timeGreet = hour < 12 ? 'Buenos días' : hour < 18 ? 'Buenas tardes' : 'Buenas noches';
    el.textContent = name ? `${timeGreet}, ${name} 👋` : 'Bienvenido 👋';
  }
  if (inp && !inp.value) {
    const saved = FinanceStorage.getRaw(USER_NAME_KEY);
    if (saved) inp.value = saved;
  }
}

// ═══════════════════════════════════════════════════════
// EXTRAS (horas extra, recargos, festivos)
// ═══════════════════════════════════════════════════════

const EXTRA_TYPES = [
  { id: 'overtime',  label: 'Hora extra',        icon: '⏰', color: '#f59e0b' },
  { id: 'nocturnal', label: 'Recargo nocturno',   icon: '🌙', color: '#8b5cf6' },
  { id: 'holiday',   label: 'Trabajo festivo',    icon: '🎉', color: '#10b981' },
  { id: 'sunday',    label: 'Domingo trabajado',  icon: '📅', color: '#3b82f6' },
  { id: 'other',     label: 'Otro',               icon: '➕', color: '#64748b' },
];

function getMonthExtras(y, m) {
  const mk = monthKey(y, m);
  return monthExtras[mk] || [];
}

function getMonthExtrasTotal(y, m) {
  return getMonthExtras(y, m).reduce((sum, e) => sum + (e.qty * e.unitValue), 0);
}

function updateExtraUnit() {
  const type = document.getElementById('extra-type').value;
  const qLbl = document.getElementById('extra-qty-label');
  const uLbl = document.getElementById('extra-unit-label');
  if (type === 'holiday' || type === 'sunday') {
    qLbl.textContent = 'Cantidad (días)';
    uLbl.textContent = 'Valor por día ($)';
  } else if (type === 'nocturnal') {
    qLbl.textContent = 'Cantidad (horas)';
    uLbl.textContent = 'Valor recargo/hora ($)';
  } else if (type === 'other') {
    qLbl.textContent = 'Cantidad';
    uLbl.textContent = 'Valor unitario ($)';
  } else {
    qLbl.textContent = 'Cantidad (horas)';
    uLbl.textContent = 'Valor por hora ($)';
  }
}

function addExtra() {
  const type      = document.getElementById('extra-type').value;
  const qty       = parseFloat(document.getElementById('extra-qty').value);
  const unitValue = parseFloat(document.getElementById('extra-unit').value);
  const desc      = document.getElementById('extra-desc').value.trim();

  if (!qty || qty <= 0)             { toast('⚠️ Ingresa la cantidad'); return; }
  if (!unitValue || unitValue <= 0) { toast('⚠️ Ingresa el valor'); return; }

  const mk = monthKey(Y, M);
  if (!monthExtras[mk]) monthExtras[mk] = [];
  monthExtras[mk].push({ id: Date.now() + '', type, qty, unitValue, desc });
  saveExtras();

  document.getElementById('extra-qty').value = '';
  document.getElementById('extra-unit').value = '';
  document.getElementById('extra-desc').value = '';

  renderRecargosPanel();
  renderResumen();
  updateFinMenu();
  toast(`✅ Extra registrado · ${fmt(qty * unitValue)}`);
}

async function deleteExtra(mk, id) {
  if (!monthExtras[mk]) return;
  const ok = await showDeleteConfirm({ title: '¿Eliminar este extra o recargo?', message: 'El registro se eliminará y esta acción no se puede deshacer.' });
  if (!ok) return;

  monthExtras[mk] = monthExtras[mk].filter(e => e.id !== id);
  if (monthExtras[mk].length === 0) delete monthExtras[mk];
  saveExtras();

  renderRecargosPanel();
  renderResumen();
  updateFinMenu();
  toast('🗑️ Extra o recargo eliminado');
}


// ═══════════════════════════════════════════════════════
// AJUSTES MODALS (sueldo y turno)
// ═══════════════════════════════════════════════════════

function openSalaryModal() {
  const existing = document.getElementById('salary-config-modal');
  if (existing) existing.remove();
  const modal = document.createElement('div');
  modal.id = 'salary-config-modal';
  modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.75);z-index:9999;display:flex;align-items:flex-end;justify-content:center';
  modal.innerHTML = `
    <div style="background:#0f172a;border:1px solid rgba(99,102,241,0.2);border-radius:20px 20px 0 0;
      padding:24px;width:100%;max-width:480px;max-height:90vh;overflow-y:auto">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px">
        <div style="font-size:16px;font-weight:700;color:#e2e8f0">💰 Configurar sueldo</div>
        <button onclick="document.getElementById('salary-config-modal').remove()"
          style="background:rgba(100,116,139,0.15);border:1px solid rgba(100,116,139,0.3);color:#94a3b8;
                 border-radius:8px;padding:6px 10px;font-size:13px;cursor:pointer">✕</button>
      </div>
      <div style="margin-bottom:14px">
        <label class="form-label">Tipo de pago</label>
        <div style="display:flex;gap:6px;margin-top:4px">
          <button id="sal-btn-hourly" class="scope-btn" onclick="selectSalaryType('hourly')">⏱️ Por hora</button>
          <button id="sal-btn-fixed"  class="scope-btn" onclick="selectSalaryType('fixed')">📅 Fijo</button>
        </div>
      </div>
      <div id="sal-hourly-panel" style="display:none">
        <div class="form-row" style="margin-bottom:12px">
          <div class="form-group" style="flex:1">
            <label class="form-label">Tarifa base ($/hora)</label>
            <input class="form-input" id="sal-base-rate" type="number" placeholder="30937" inputmode="numeric"/>
          </div>
        </div>
        <div id="sal-shift-rates" style="margin-bottom:8px"></div>
      </div>
      <div id="sal-fixed-panel" style="display:none">
        <div style="display:flex;gap:6px;margin-bottom:12px">
          <button id="sal-btn-monthly"   class="scope-btn" onclick="selectFixedType('monthly')">📆 Mensual</button>
          <button id="sal-btn-quincenal" class="scope-btn" onclick="selectFixedType('quincenal')">✌️ Quincenal</button>
        </div>
        <div class="form-row" style="margin-bottom:0">
          <div class="form-group" style="flex:1">
            <label class="form-label" id="sal-fixed-label">Valor mensual ($)</label>
            <input class="form-input" id="sal-fixed-amount" type="number" placeholder="3000000" inputmode="numeric"/>
          </div>
        </div>
      </div>
      <button onclick="saveSalaryConfig()" style="width:100%;margin-top:16px;
        background:linear-gradient(135deg,#312e81,#4f46e5);border:1px solid rgba(99,102,241,0.4);
        color:#e0e7ff;border-radius:10px;padding:11px;font-size:13px;font-weight:700;
        cursor:pointer;font-family:'Outfit',sans-serif">💾 Guardar sueldo</button>
    </div>`;
  document.body.appendChild(modal);
  initSalaryUI();
}

function openScheduleModal() {
  const existing = document.getElementById('schedule-config-modal');
  if (existing) existing.remove();
  const modal = document.createElement('div');
  modal.id = 'schedule-config-modal';
  modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.75);z-index:9999;display:flex;align-items:flex-end;justify-content:center';
  modal.innerHTML = `
    <div style="background:#0f172a;border:1px solid rgba(139,92,246,0.2);border-radius:20px 20px 0 0;
      padding:24px;width:100%;max-width:480px;max-height:90vh;overflow-y:auto">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px">
        <div style="font-size:16px;font-weight:700;color:#e2e8f0">⚙️ Configurar turno</div>
        <button onclick="document.getElementById('schedule-config-modal').remove()"
          style="background:rgba(100,116,139,0.15);border:1px solid rgba(100,116,139,0.3);color:#94a3b8;
                 border-radius:8px;padding:6px 10px;font-size:13px;cursor:pointer">✕</button>
      </div>
      <div style="margin-bottom:14px">
        <label class="form-label">Tipo de turno</label>
        <div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:4px">
          <button id="sched-btn-cycle"    class="scope-btn" onclick="selectSchedType('cycle')">🔄 Ciclo fijo</button>
          <button id="sched-btn-rotating" class="scope-btn" onclick="selectSchedType('rotating')">🔃 Rotativo</button>
          <button id="sched-btn-office"   class="scope-btn" onclick="selectSchedType('office')">🏢 Oficina</button>
        </div>
      </div>
      <!-- CICLO FIJO -->
      <div id="sched-cycle-panel" style="display:none">
        <div class="form-label" style="margin-bottom:8px">Tipos de turno en el ciclo</div>
        <div id="sched-cycle-shift-types" style="margin-bottom:10px"></div>
        <button onclick="addCycleShiftType()" style="background:rgba(99,102,241,0.1);border:1px solid rgba(99,102,241,0.3);color:#a5b4fc;
          border-radius:8px;padding:7px 12px;font-size:12px;cursor:pointer;font-family:'Outfit',sans-serif;font-weight:600;margin-bottom:14px;width:100%">+ Agregar tipo de turno</button>
        <div class="form-label" style="margin-bottom:6px">Ciclo</div>
        <div id="sched-cycle-slots" style="margin-bottom:10px"></div>
        <button onclick="addCycleSlot()" style="background:rgba(99,102,241,0.1);border:1px solid rgba(99,102,241,0.3);color:#a5b4fc;
          border-radius:8px;padding:7px 12px;font-size:12px;cursor:pointer;font-family:'Outfit',sans-serif;font-weight:600;margin-bottom:14px;width:100%">+ Agregar slot al ciclo</button>
        <div class="form-row" style="margin-bottom:0">
          <div class="form-group" style="flex:1">
            <label class="form-label">Fecha inicio del ciclo</label>
            <input class="form-input" id="sched-cycle-start" type="date" />
          </div>
        </div>
      </div>
      <!-- ROTATIVO -->
      <div id="sched-rotating-panel" style="display:none">
        <div class="form-label" style="margin-bottom:8px">Tipos de turno</div>
        <div id="sched-rot-shift-types" style="margin-bottom:10px"></div>
        <button onclick="addRotShiftType()" style="background:rgba(99,102,241,0.1);border:1px solid rgba(99,102,241,0.3);color:#a5b4fc;
          border-radius:8px;padding:7px 12px;font-size:12px;cursor:pointer;font-family:'Outfit',sans-serif;font-weight:600;margin-bottom:14px;width:100%">+ Agregar tipo de turno</button>
        <div class="form-label" style="margin-bottom:6px">Orden del ciclo</div>
        <div id="sched-rot-slots" style="margin-bottom:10px"></div>
        <button onclick="addRotSlot()" style="background:rgba(99,102,241,0.1);border:1px solid rgba(99,102,241,0.3);color:#a5b4fc;
          border-radius:8px;padding:7px 12px;font-size:12px;cursor:pointer;font-family:'Outfit',sans-serif;font-weight:600;margin-bottom:14px;width:100%">+ Agregar slot al ciclo</button>
        <div class="form-row" style="margin-bottom:0">
          <div class="form-group" style="flex:1">
            <label class="form-label">Fecha inicio del ciclo</label>
            <input class="form-input" id="sched-rot-start" type="date" />
          </div>
        </div>
      </div>
      <!-- OFICINA -->
      <div id="sched-office-panel" style="display:none">
        <div class="form-label" style="margin-bottom:8px">Días y horas de trabajo</div>
        <div style="display:flex;flex-direction:column;gap:8px;margin-bottom:14px">
          ${['Lunes','Martes','Miércoles','Jueves','Viernes','Sábado'].map((d,i) => `
          <div style="display:flex;align-items:center;gap:10px">
            <input type="checkbox" id="office-${i+1}" class="office-day-check" style="width:18px;height:18px;accent-color:#6366f1">
            <label for="office-${i+1}" style="color:#e2e8f0;font-size:13px;flex:1">${d}</label>
            <input class="form-input" id="office-${i+1}-h" type="number" placeholder="${i===5?'4':'8'}" min="1" max="24" inputmode="numeric" style="width:70px;margin:0">
            <span style="color:#64748b;font-size:12px">h</span>
          </div>`).join('')}
        </div>
      </div>
      <div id="sched-current-label" style="font-size:11px;color:#6366f1;margin-top:8px;font-weight:600"></div>
      <button id="sched-save-btn" onclick="saveScheduleConfig()" style="width:100%;margin-top:16px;
        background:linear-gradient(135deg,#312e81,#4f46e5);border:1px solid rgba(99,102,241,0.4);
        color:#e0e7ff;border-radius:10px;padding:11px;font-size:13px;font-weight:700;
        cursor:pointer;font-family:'Outfit',sans-serif">💾 Guardar configuración de turno</button>
    </div>`;
  document.body.appendChild(modal);
  initSchedUI();
}

// Override saveSalaryConfig and saveScheduleConfig to close modal after saving
const _origSaveSalary = typeof saveSalaryConfig !== 'undefined' ? saveSalaryConfig : null;
// ═══════════════════════════════════════════════════════
// SALARY CONFIG
// ═══════════════════════════════════════════════════════

let _salType   = 'hourly';
let _fixedType = 'monthly';

function selectSalaryType(type) {
  _salType = type;
  document.getElementById('sal-hourly-panel').style.display = type === 'hourly' ? 'block' : 'none';
  document.getElementById('sal-fixed-panel').style.display  = type === 'fixed'  ? 'block' : 'none';
  document.getElementById('sal-btn-hourly').classList.toggle('active-gastos', type === 'hourly');
  document.getElementById('sal-btn-fixed').classList.toggle('active-gastos',  type === 'fixed');
  if (type === 'hourly') renderShiftRates();
}

function selectFixedType(type) {
  _fixedType = type;
  document.getElementById('sal-btn-monthly').classList.toggle('active-gastos',   type === 'monthly');
  document.getElementById('sal-btn-quincenal').classList.toggle('active-gastos', type === 'quincenal');
  document.getElementById('sal-fixed-label').textContent = type === 'monthly' ? 'Valor mensual ($)' : 'Valor por quincena ($)';
}

function renderShiftRates() {
  const el = document.getElementById('sal-shift-rates');
  if (!el) return;
  if (!schedule || schedule.type === 'office' || !schedule.shiftTypes) {
    el.innerHTML = ''; return;
  }
  const workingShifts = schedule.shiftTypes.filter(st => !isRestShift(st.id));
  if (workingShifts.length === 0) { el.innerHTML = ''; return; }
  const baseRate = parseFloat(document.getElementById('sal-base-rate').value) || (salary && salary.baseRate) || RATE;
  el.innerHTML = `
    <div style="font-size:11px;color:#64748b;margin-bottom:8px">Tarifa por tipo de turno (opcional — si no se configura usa la tarifa base)</div>
    ${workingShifts.map(st => {
      const saved = salary && salary.shiftRates && salary.shiftRates[st.id];
      const mode  = saved ? saved.mode : 'fixed';
      const val   = saved ? saved.value : '';
      return `<div style="background:rgba(15,23,42,0.5);border:1px solid rgba(99,102,241,0.15);border-radius:10px;padding:10px;margin-bottom:8px">
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px">
          <div style="width:10px;height:10px;border-radius:50%;background:${st.color};flex-shrink:0"></div>
          <span style="color:#e2e8f0;font-size:13px;font-weight:600">${st.name}</span>
        </div>
        <div style="display:flex;gap:6px;align-items:center">
          <select class="form-select" id="rate-mode-${st.id}" style="flex:1" onchange="updateRateLabel('${st.id}')">
            <option value="fixed"  ${mode==='fixed' ?'selected':''}>Valor fijo $/h</option>
            <option value="pct"    ${mode==='pct'   ?'selected':''}>% sobre base</option>
          </select>
          <input class="form-input" id="rate-val-${st.id}" type="number" inputmode="numeric"
            style="flex:1;margin:0" placeholder="${mode==='pct'?'35':baseRate}" value="${val}" />
          <span id="rate-label-${st.id}" style="color:#64748b;font-size:11px">${mode==='pct'?'%':'$/h'}</span>
        </div>
      </div>`;
    }).join('')}`;
}

function updateRateLabel(id) {
  const mode = document.getElementById('rate-mode-' + id).value;
  const lbl  = document.getElementById('rate-label-' + id);
  if (lbl) lbl.textContent = mode === 'pct' ? '%' : '$/h';
}

function saveSalaryConfig() {
  const type = _salType;
  if (type === 'hourly') {
    const baseRate = parseFloat(document.getElementById('sal-base-rate').value);
    if (!baseRate || baseRate <= 0) { toast('⚠️ Ingresa la tarifa base por hora'); return; }
    const shiftRates = {};
    if (schedule && schedule.shiftTypes) {
      schedule.shiftTypes.filter(st => !isRestShift(st.id)).forEach(st => {
        const modeEl = document.getElementById('rate-mode-' + st.id);
        const valEl  = document.getElementById('rate-val-'  + st.id);
        if (modeEl && valEl && valEl.value) {
          shiftRates[st.id] = { mode: modeEl.value, value: parseFloat(valEl.value) };
        }
      });
    }
    salary = { type: 'hourly', baseRate, shiftRates };
  } else {
    const amount = parseFloat(document.getElementById('sal-fixed-amount').value);
    if (!amount || amount <= 0) { toast('⚠️ Ingresa el valor del sueldo'); return; }
    salary = { type: 'fixed', fixedType: _fixedType, fixedAmount: amount };
  }
  saveSalary();
  updateSalaryLabel();
  reRender();
  const salModal = document.getElementById('salary-config-modal');
  if (salModal) salModal.remove();
  toast('✅ Sueldo guardado');
}

function updateSalaryLabel() {
  const el = document.getElementById('sal-current-label');
  if (!el) return;
  if (!salary) { el.textContent = 'Sin sueldo configurado (usando tarifa por defecto)'; return; }
  if (salary.type === 'hourly') {
    el.textContent = `✅ Por hora · Base: ${fmt(salary.baseRate)}/h`;
  } else {
    const ftype = salary.fixedType === 'quincenal' ? 'quincenal' : 'mensual';
    el.textContent = `✅ Fijo ${ftype}: ${fmt(salary.fixedAmount)}`;
  }
}

function initSalaryUI() {
  updateSalaryLabel();
  if (!salary) return;
  if (!document.getElementById('sal-btn-hourly')) return;
  selectSalaryType(salary.type);
  if (salary.type === 'hourly') {
    document.getElementById('sal-base-rate').value = salary.baseRate || '';
    renderShiftRates();
  } else {
    selectFixedType(salary.fixedType || 'monthly');
    document.getElementById('sal-fixed-amount').value = salary.fixedAmount || '';
  }
}

// ── Obtener tarifa efectiva por turno ───────────────────
function getEffectiveRate(shiftId) {
  if (!salary || salary.type !== 'hourly') return RATE;
  const base = salary.baseRate || RATE;
  if (!salary.shiftRates || !salary.shiftRates[shiftId]) return base;
  const sr = salary.shiftRates[shiftId];
  if (sr.mode === 'pct') return base * (1 + sr.value / 100);
  return sr.value;
}


// ═══════════════════════════════════════════════════════
// ESTADÍSTICAS
// ═══════════════════════════════════════════════════════

function renderEstadisticas() {
  const el = document.getElementById('section-estadisticas');
  if (!el) return;

  // Recopilar datos de los últimos 12 meses
  const months = [];
  for (let i = 11; i >= 0; i--) {
    let y = Y, m = M - i;
    while (m < 0) { m += 12; y--; }
    if (isBeforeControl(y, m)) continue;
    const c = calcMonth(y, m);
    months.push({ y, m, label: MONTHS[m].substring(0,3) + ' ' + String(y).slice(-2), c });
  }

  if (months.length === 0) {
    el.innerHTML = '<div style="text-align:center;padding:60px 20px;color:#475569"><div style="font-size:40px;margin-bottom:12px">📈</div><div>Sin datos suficientes</div></div>';
    return;
  }

  // ── Datos del mes actual y anterior ──
  const cur  = months[months.length - 1];
  const prev = months.length > 1 ? months[months.length - 2] : null;
  const curEarn = cur.c.totalEarn + cur.c.incomes + (cur.c.extrasTotal || 0);
  const curExp  = cur.c.expenses + cur.c.discounts;
  const prevEarn = prev ? prev.c.totalEarn + prev.c.incomes + (prev.c.extrasTotal || 0) : 0;
  const prevExp  = prev ? prev.c.expenses + prev.c.discounts : 0;
  const earnDiff = prev && prevEarn > 0 ? Math.round(((curEarn - prevEarn) / prevEarn) * 100) : null;
  const expDiff  = prev && prevExp  > 0 ? Math.round(((curExp  - prevExp)  / prevExp)  * 100) : null;
  const balDiff  = prev ? cur.c.balance - prev.c.balance : null;

  // ── Mejor / peor mes ──
  const withBalance = months.filter(m => m.c.totalEarn > 0);
  const best  = withBalance.length ? withBalance.reduce((a,b) => b.c.balance > a.c.balance ? b : a) : null;
  const worst = withBalance.length ? withBalance.reduce((a,b) => b.c.balance < a.c.balance ? b : a) : null;

  // ── Distribución de gastos del mes actual ──
  const expData = getMonthExpenses(Y, M);
  const totalExp = expData.total || 1;
  const expItems = expData.items || [];
  const topExp = [...expItems].sort((a,b) => b.amount - a.amount).slice(0, 5);
  const expColors = ['#ef4444','#f59e0b','#8b5cf6','#3b82f6','#10b981'];

  // ── Ahorro más cercano a completarse ──
  const activeS = savings.filter(s => (s.goal - (s.saved||0)) > 0);
  const closestS = activeS.length
    ? activeS.reduce((a,b) => ((b.saved||0)/b.goal) > ((a.saved||0)/a.goal) ? b : a)
    : null;

  // ── Deuda más cercana a terminar ──
  const activeD = debts.filter(d => (d.total - (d.paid||0)) > 0);
  const closestD = activeD.length
    ? activeD.reduce((a,b) => ((b.paid||0)/b.total) > ((a.paid||0)/a.total) ? b : a)
    : null;

  // ── Gráfica ingresos vs gastos ──
  const maxVal = Math.max(...months.map(m => {
    const e = m.c.totalEarn + m.c.incomes + (m.c.extrasTotal||0);
    const x = m.c.expenses + m.c.discounts;
    return Math.max(e, x);
  }), 1);

  const barChart = months.map(m => {
    const earn = m.c.totalEarn + m.c.incomes + (m.c.extrasTotal || 0);
    const exp  = m.c.expenses + m.c.discounts;
    const earnPct = Math.round((earn / maxVal) * 100);
    const expPct  = Math.round((exp  / maxVal) * 100);
    const bal = m.c.balance;
    const balColor = bal >= 0 ? '#10b981' : '#ef4444';
    const isCurrentMonth = m.y === Y && m.m === M;
    return `<div style="display:flex;flex-direction:column;align-items:center;gap:3px;flex:1;min-width:0">
      <div style="font-size:8px;color:${isCurrentMonth ? '#a5b4fc' : '#64748b'};white-space:nowrap;overflow:hidden;text-overflow:ellipsis;width:100%;text-align:center;font-weight:${isCurrentMonth ? '700' : '400'}">${m.label}</div>
      <div style="width:100%;display:flex;gap:2px;align-items:flex-end;height:70px">
        <div style="flex:1;background:${isCurrentMonth ? '#818cf8' : '#6366f1'};border-radius:3px 3px 0 0;height:${earnPct}%;min-height:2px"></div>
        <div style="flex:1;background:${isCurrentMonth ? '#f87171' : '#ef4444'};border-radius:3px 3px 0 0;height:${expPct}%;min-height:2px"></div>
      </div>
      <div style="font-size:8px;color:${balColor};font-weight:700">${bal >= 0 ? '+' : ''}${Math.abs(bal) >= 1000000 ? (bal/1000000).toFixed(1)+'M' : Math.abs(bal) >= 1000 ? (bal/1000).toFixed(0)+'K' : bal}</div>
    </div>`;
  }).join('');

  // ── Evolución saldo ──
  const saldoPoints = months.map((m, i) => ({ x: i, y: m.c.balance }));
  const minSaldo = Math.min(...saldoPoints.map(p => p.y));
  const maxSaldo = Math.max(...saldoPoints.map(p => p.y), 0);
  const rangeSaldo = maxSaldo - minSaldo || 1;
  const saldoPath = saldoPoints.map((p, i) => {
    const px = months.length > 1 ? (i / (months.length - 1)) * 100 : 50;
    const py = 100 - ((p.y - minSaldo) / rangeSaldo) * 95;
    return `${px},${py}`;
  }).join(' ');

  // ── Promedios 6 meses ──
  const last6 = months.slice(-6);
  const avgEarn = last6.reduce((s,m) => s + m.c.totalEarn + m.c.incomes + (m.c.extrasTotal||0), 0) / Math.max(last6.length,1);
  const avgExp  = last6.reduce((s,m) => s + m.c.expenses + m.c.discounts, 0) / Math.max(last6.length,1);
  const avgBal  = last6.reduce((s,m) => s + m.c.balance, 0) / Math.max(last6.length,1);

  el.innerHTML = `<div style="padding:16px 16px 80px">

    <!-- RESUMEN MES ACTUAL -->
    <div style="font-size:10px;color:#6366f1;font-weight:700;letter-spacing:2px;margin-bottom:10px">📋 RESUMEN — ${MONTHS[M]} ${Y}</div>
    <div style="display:flex;gap:8px;margin-bottom:16px">
      <div class="s-card" style="flex:1;text-align:center">
        <div style="font-size:10px;color:#6ee7b7;margin-bottom:3px">Ingresos</div>
        <div style="font-size:15px;font-weight:700;color:#e2e8f0">${fmt(curEarn)}</div>
        ${earnDiff !== null ? `<div style="font-size:10px;color:${earnDiff >= 0 ? '#10b981' : '#ef4444'}">${earnDiff >= 0 ? '↑' : '↓'} ${Math.abs(earnDiff)}% vs anterior</div>` : ''}
      </div>
      <div class="s-card" style="flex:1;text-align:center">
        <div style="font-size:10px;color:#f87171;margin-bottom:3px">Gastos</div>
        <div style="font-size:15px;font-weight:700;color:#e2e8f0">${fmt(curExp)}</div>
        ${expDiff !== null ? `<div style="font-size:10px;color:${expDiff <= 0 ? '#10b981' : '#ef4444'}">${expDiff >= 0 ? '↑' : '↓'} ${Math.abs(expDiff)}% vs anterior</div>` : ''}
      </div>
      <div class="s-card" style="flex:1;text-align:center">
        <div style="font-size:10px;color:#a5b4fc;margin-bottom:3px">Saldo</div>
        <div style="font-size:15px;font-weight:700;color:${cur.c.balance >= 0 ? '#6ee7b7' : '#f87171'}">${fmt(cur.c.balance)}</div>
        ${balDiff !== null ? `<div style="font-size:10px;color:${balDiff >= 0 ? '#10b981' : '#ef4444'}">${balDiff >= 0 ? '↑' : '↓'} ${fmt(Math.abs(balDiff))} vs anterior</div>` : ''}
      </div>
    </div>

    <!-- PROMEDIOS -->
    <div class="s-card-full" style="margin-bottom:16px">
      <div style="font-size:11px;color:#6366f1;font-weight:700;letter-spacing:1px;margin-bottom:10px">📊 PROMEDIO ÚLTIMOS ${last6.length} MESES</div>
      <div style="display:flex;gap:12px">
        <div style="flex:1;text-align:center">
          <div style="font-size:10px;color:#6ee7b7;margin-bottom:2px">Ingresos</div>
          <div style="font-size:13px;font-weight:700;color:#e2e8f0">${fmt(Math.round(avgEarn))}</div>
        </div>
        <div style="flex:1;text-align:center;border-left:1px solid rgba(99,102,241,0.2);border-right:1px solid rgba(99,102,241,0.2)">
          <div style="font-size:10px;color:#f87171;margin-bottom:2px">Gastos</div>
          <div style="font-size:13px;font-weight:700;color:#e2e8f0">${fmt(Math.round(avgExp))}</div>
        </div>
        <div style="flex:1;text-align:center">
          <div style="font-size:10px;color:#a5b4fc;margin-bottom:2px">Saldo</div>
          <div style="font-size:13px;font-weight:700;color:${avgBal >= 0 ? '#6ee7b7' : '#f87171'}">${fmt(Math.round(avgBal))}</div>
        </div>
      </div>
    </div>

    <!-- MEJOR / PEOR MES -->
    <div style="display:flex;gap:10px;margin-bottom:16px">
      ${best ? `<div class="s-card" style="flex:1;background:rgba(16,185,129,0.08);border-color:rgba(16,185,129,0.25)">
        <div style="font-size:9px;color:#10b981;font-weight:700;letter-spacing:1px;margin-bottom:3px">🏆 MEJOR MES</div>
        <div style="font-size:13px;font-weight:700;color:#e2e8f0">${MONTHS[best.m].substring(0,3)} ${best.y}</div>
        <div style="font-size:13px;color:#6ee7b7;font-weight:700">+${fmt(best.c.balance)}</div>
      </div>` : ''}
      ${worst ? `<div class="s-card" style="flex:1;background:rgba(239,68,68,0.08);border-color:rgba(239,68,68,0.25)">
        <div style="font-size:9px;color:#ef4444;font-weight:700;letter-spacing:1px;margin-bottom:3px">📉 PEOR MES</div>
        <div style="font-size:13px;font-weight:700;color:#e2e8f0">${MONTHS[worst.m].substring(0,3)} ${worst.y}</div>
        <div style="font-size:13px;color:#f87171;font-weight:700">${fmt(worst.c.balance)}</div>
      </div>` : ''}
    </div>

    <!-- DISTRIBUCIÓN DE GASTOS -->
    ${topExp.length > 0 ? `<div class="s-card-full" style="margin-bottom:16px">
      <div style="font-size:11px;color:#6366f1;font-weight:700;letter-spacing:1px;margin-bottom:12px">💸 DISTRIBUCIÓN DE GASTOS — ${MONTHS[M]}</div>
      ${topExp.map((e, i) => {
        const pct = Math.round((e.amount / totalExp) * 100);
        return `<div style="margin-bottom:10px">
          <div style="display:flex;justify-content:space-between;margin-bottom:4px">
            <span style="font-size:12px;color:#e2e8f0">${e.name}</span>
            <span style="font-size:12px;color:${expColors[i]};font-weight:600">${pct}% · ${fmt(e.amount)}</span>
          </div>
          <div style="background:rgba(99,102,241,0.1);border-radius:4px;height:5px">
            <div style="background:${expColors[i]};border-radius:4px;height:100%;width:${pct}%;transition:width 0.4s"></div>
          </div>
        </div>`;
      }).join('')}
      ${expItems.length > 5 ? `<div style="font-size:10px;color:#64748b;text-align:center;margin-top:4px">+${expItems.length - 5} gastos más</div>` : ''}
    </div>` : ''}

    <!-- GRÁFICA INGRESOS VS GASTOS -->
    <div class="s-card-full" style="margin-bottom:16px">
      <div style="font-size:11px;color:#6366f1;font-weight:700;letter-spacing:1px;margin-bottom:12px">📊 INGRESOS VS GASTOS</div>
      <div style="display:flex;gap:6px;align-items:flex-end;justify-content:space-between">${barChart}</div>
      <div style="display:flex;gap:16px;margin-top:8px;justify-content:center">
        <div style="display:flex;align-items:center;gap:4px"><div style="width:8px;height:8px;background:#6366f1;border-radius:2px"></div><span style="font-size:10px;color:#64748b">Ingresos</span></div>
        <div style="display:flex;align-items:center;gap:4px"><div style="width:8px;height:8px;background:#ef4444;border-radius:2px"></div><span style="font-size:10px;color:#64748b">Gastos</span></div>
      </div>
    </div>

    <!-- EVOLUCIÓN SALDO -->
    <div class="s-card-full" style="margin-bottom:16px">
      <div style="font-size:11px;color:#6366f1;font-weight:700;letter-spacing:1px;margin-bottom:12px">📈 EVOLUCIÓN DEL SALDO</div>
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" style="width:100%;height:90px">
        <polyline points="${saldoPath}" fill="none" stroke="#6366f1" stroke-width="2.5" vector-effect="non-scaling-stroke" stroke-linecap="round" stroke-linejoin="round"/>
        ${saldoPoints.map((p, i) => {
          const px = months.length > 1 ? (i / (months.length - 1)) * 100 : 50;
          const py = 100 - ((p.y - minSaldo) / rangeSaldo) * 95;
          const isLast = i === saldoPoints.length - 1;
          return `<circle cx="${px}" cy="${py}" r="${isLast ? 3 : 1.5}" fill="${p.y >= 0 ? '#6366f1' : '#ef4444'}" vector-effect="non-scaling-stroke"/>`;
        }).join('')}
      </svg>
      <div style="display:flex;justify-content:space-between;margin-top:2px">
        <span style="font-size:9px;color:#64748b">${months[0].label}</span>
        <span style="font-size:9px;color:#a5b4fc;font-weight:600">${months[months.length-1].label} · ${fmt(cur.c.balance)}</span>
      </div>
    </div>

    <!-- METAS: AHORRO MÁS CERCANO -->
    ${closestS ? `<div class="s-card-full" style="margin-bottom:16px;background:rgba(16,185,129,0.06);border-color:rgba(16,185,129,0.2)">
      <div style="font-size:11px;color:#10b981;font-weight:700;letter-spacing:1px;margin-bottom:10px">🏦 AHORRO MÁS CERCANO</div>
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
        <span style="font-size:14px;font-weight:700;color:#e2e8f0">${closestS.name}</span>
        <span style="font-size:13px;color:#6ee7b7;font-weight:700">${Math.min(Math.round(((closestS.saved||0)/closestS.goal)*100),100)}%</span>
      </div>
      <div style="background:rgba(16,185,129,0.15);border-radius:6px;height:8px;margin-bottom:6px">
        <div style="background:linear-gradient(90deg,#10b981,#34d399);border-radius:6px;height:100%;width:${Math.min(Math.round(((closestS.saved||0)/closestS.goal)*100),100)}%"></div>
      </div>
      <div style="display:flex;justify-content:space-between">
        <span style="font-size:11px;color:#64748b">Ahorrado: ${fmt(closestS.saved||0)}</span>
        <span style="font-size:11px;color:#64748b">Falta: ${fmt(closestS.goal - (closestS.saved||0))}</span>
      </div>
    </div>` : ''}

    <!-- METAS: DEUDA MÁS CERCANA -->
    ${closestD ? `<div class="s-card-full" style="margin-bottom:16px;background:rgba(239,68,68,0.06);border-color:rgba(239,68,68,0.2)">
      <div style="font-size:11px;color:#ef4444;font-weight:700;letter-spacing:1px;margin-bottom:10px">💳 DEUDA MÁS CERCANA A TERMINAR</div>
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
        <span style="font-size:14px;font-weight:700;color:#e2e8f0">${closestD.name}</span>
        <span style="font-size:13px;color:#f87171;font-weight:700">${Math.min(Math.round(((closestD.paid||0)/closestD.total)*100),100)}% pagado</span>
      </div>
      <div style="background:rgba(239,68,68,0.15);border-radius:6px;height:8px;margin-bottom:6px">
        <div style="background:linear-gradient(90deg,#ef4444,#f87171);border-radius:6px;height:100%;width:${Math.min(Math.round(((closestD.paid||0)/closestD.total)*100),100)}%"></div>
      </div>
      <div style="display:flex;justify-content:space-between">
        <span style="font-size:11px;color:#64748b">Pagado: ${fmt(closestD.paid||0)}</span>
        <span style="font-size:11px;color:#64748b">Falta: ${fmt(closestD.total - (closestD.paid||0))}</span>
      </div>
    </div>` : ''}

    <!-- PROGRESO TODOS LOS AHORROS -->
    ${savings.filter(s => s.goal > 0).length > 1 ? `<div class="s-card-full" style="margin-bottom:16px">
      <div style="font-size:11px;color:#6366f1;font-weight:700;letter-spacing:1px;margin-bottom:12px">🏦 TODOS LOS AHORROS</div>
      ${savings.filter(s => s.goal > 0).map(s => {
        const pct = Math.min(Math.round(((s.saved||0)/s.goal)*100),100);
        return `<div style="margin-bottom:10px">
          <div style="display:flex;justify-content:space-between;margin-bottom:3px">
            <span style="font-size:12px;color:#e2e8f0">${s.name}</span>
            <span style="font-size:11px;color:#6ee7b7;font-weight:600">${pct}%</span>
          </div>
          <div style="background:rgba(99,102,241,0.12);border-radius:4px;height:5px">
            <div style="background:linear-gradient(90deg,#6366f1,#818cf8);border-radius:4px;height:100%;width:${pct}%"></div>
          </div>
        </div>`;
      }).join('')}
    </div>` : ''}

    <!-- PROGRESO TODAS LAS DEUDAS -->
    ${debts.filter(d => d.total > 0).length > 1 ? `<div class="s-card-full" style="margin-bottom:16px">
      <div style="font-size:11px;color:#6366f1;font-weight:700;letter-spacing:1px;margin-bottom:12px">💳 TODAS LAS DEUDAS</div>
      ${debts.filter(d => d.total > 0).map(d => {
        const pct = Math.min(Math.round(((d.paid||0)/d.total)*100),100);
        return `<div style="margin-bottom:10px">
          <div style="display:flex;justify-content:space-between;margin-bottom:3px">
            <span style="font-size:12px;color:#e2e8f0">${d.name}</span>
            <span style="font-size:11px;color:#f87171;font-weight:600">${pct}%</span>
          </div>
          <div style="background:rgba(239,68,68,0.12);border-radius:4px;height:5px">
            <div style="background:linear-gradient(90deg,#ef4444,#f87171);border-radius:4px;height:100%;width:${pct}%"></div>
          </div>
        </div>`;
      }).join('')}
    </div>` : ''}

  </div>`;
}


// ═══════════════════════════════════════════════════════
// CONTROL START
// ═══════════════════════════════════════════════════════
function saveControlStartDate() {
  const m = parseInt(document.getElementById('ctrl-month').value);
  const y = parseInt(document.getElementById('ctrl-year').value);
  if (!y || y < 2020 || y > 2099) { toast('⚠️ Ingresa un año válido'); return; }
  controlStart = { y, m };
  saveControlStart();
  updateControlStartLabel();
  reRender();
  toast(`✅ Control inicia en ${MONTHS[m]} ${y}`);
}

function updateControlStartLabel() {
  const el = document.getElementById('ctrl-start-label');
  if (!el) return;
  if (controlStart) {
    el.textContent = `✅ Control activo desde ${MONTHS[controlStart.m]} ${controlStart.y}`;
    document.getElementById('ctrl-month').value = controlStart.m;
    document.getElementById('ctrl-year').value  = controlStart.y;
  } else {
    el.textContent = 'Sin fecha de inicio configurada';
  }
}

// ═══════════════════════════════════════════════════════
// INIT
// ═══════════════════════════════════════════════════════
updateControlStartLabel();
initSchedUI();
initSalaryUI();
updateGreeting();
updateFinMenu();
renderResumen();


/* V10_SAVINGS_INITIAL_VS_MOVEMENTS */
(function(){
  window.FluxoSavingsV10 = {
    normalizeGoal: function(goal) {
      if (!goal || typeof goal !== 'object') return goal;
      if (goal.initialBalance == null) {
        goal.initialBalance = Number(
          goal.initialSaved ??
          goal.initialAmount ??
          goal.startAmount ??
          goal.alreadySaved ??
          0
        ) || 0;
      }
      if (!Array.isArray(goal.movements)) goal.movements = [];
      return goal;
    },

    addInitialBalance: function(goal, amount) {
      this.normalizeGoal(goal);
      const value = Math.max(0, Number(amount) || 0);
      goal.initialBalance = value;
      return goal;
    },

    addContribution: function(goal, amount, date) {
      this.normalizeGoal(goal);
      const value = Math.max(0, Number(amount) || 0);
      if (!value) return goal;
      goal.movements.push({
        type: 'contribution',
        amount: value,
        date: date || new Date().toISOString(),
        label: 'Aporte'
      });
      return goal;
    },

    addWithdrawal: function(goal, amount, date) {
      this.normalizeGoal(goal);
      const value = Math.max(0, Number(amount) || 0);
      if (!value) return goal;
      goal.movements.push({
        type: 'withdrawal',
        amount: value,
        date: date || new Date().toISOString(),
        label: 'Retiro'
      });
      return goal;
    },

    getContributions: function(goal) {
      this.normalizeGoal(goal);
      return goal.movements
        .filter(m => m && m.type === 'contribution')
        .reduce((sum, m) => sum + (Number(m.amount) || 0), 0);
    },

    getWithdrawals: function(goal) {
      this.normalizeGoal(goal);
      return goal.movements
        .filter(m => m && m.type === 'withdrawal')
        .reduce((sum, m) => sum + (Number(m.amount) || 0), 0);
    },

    getCurrentBalance: function(goal) {
      this.normalizeGoal(goal);
      return Math.max(
        0,
        (Number(goal.initialBalance) || 0) +
        this.getContributions(goal) -
        this.getWithdrawals(goal)
      );
    },

    getMonthlyMovements: function(goal, year, month) {
      this.normalizeGoal(goal);
      return goal.movements.filter(m => {
        if (!m || !m.date) return false;
        const d = new Date(m.date);
        return d.getFullYear() === Number(year) &&
               d.getMonth() === Number(month);
      });
    }
  };
})();


/* V11_SAVINGS_REAL_CONTRIBUTIONS */
(function(){
  window.FluxoSavingsV11 = {
    getInitial: function(goal) {
      return Number(
        goal?.initialBalance ??
        goal?.initialSaved ??
        goal?.initialAmount ??
        goal?.startAmount ??
        goal?.alreadySaved ??
        0
      ) || 0;
    },
    getMovements: function(goal) {
      return Array.isArray(goal?.movements) ? goal.movements : [];
    },
    getContributions: function(goal) {
      const ms = this.getMovements(goal);
      return ms.filter(m => m && (
        m.type === 'contribution' ||
        m.type === 'aporte' ||
        m.kind === 'contribution' ||
        m.kind === 'aporte'
      )).reduce((s,m) => s + Math.max(0, Number(m.amount ?? m.value ?? 0) || 0), 0);
    },
    getWithdrawals: function(goal) {
      const ms = this.getMovements(goal);
      return ms.filter(m => m && (
        m.type === 'withdrawal' ||
        m.type === 'retiro' ||
        m.kind === 'withdrawal' ||
        m.kind === 'retiro'
      )).reduce((s,m) => s + Math.max(0, Number(m.amount ?? m.value ?? 0) || 0), 0);
    },
    getRealContributed: function(goal) {
      // IMPORTANT: initialBalance is deliberately excluded.
      return this.getContributions(goal);
    },
    getCurrentBalance: function(goal) {
      return Math.max(0, this.getInitial(goal) + this.getContributions(goal) - this.getWithdrawals(goal));
    }
  };
})();


/* V11_SAVINGS_CAPITAL_UI_FALLBACK */
(function(){
  function fixCapitalLabels() {
    try {
      const goals =
        window.ahorros ||
        window.savings ||
        window.savingGoals ||
        window.ahorroMetas ||
        [];
      if (!Array.isArray(goals)) return;

      goals.forEach(goal => {
        if (!goal || !goal.id) return;
        const real = window.FluxoSavingsV11
          ? FluxoSavingsV11.getRealContributed(goal)
          : 0;

        const selectors = [
          `[data-savings-id="${goal.id}"][data-field="capital-aportado"]`,
          `[data-goal-id="${goal.id}"][data-field="capital-aportado"]`
        ];

        selectors.forEach(sel => {
          document.querySelectorAll(sel).forEach(el => {
            el.textContent = new Intl.NumberFormat('es-CO', {
              style: 'currency',
              currency: 'COP',
              maximumFractionDigits: 0
            }).format(real);
          });
        });
      });
    } catch(e) {}
  }

  window.fixSavingsCapitalContributed = fixCapitalLabels;
})();


/* V12_SAVINGS_INITIAL_PAYMENT_EXCLUDED */
(function(){
  // The initial amount entered at goal creation is stored as a payment with
  // initial:true. Monthly contribution totals must always ignore that record.
  window.getRealMonthlySavingsContribution = function(saving, mk) {
    return (saving?.payments || [])
      .filter(p => p && p.mk === mk && !p.initial && p.kind !== 'withdrawal')
      .reduce((sum, p) => sum + (Number(p.amount) || 0), 0);
  };
})();


/* V13_GLOBAL_PERIOD_SERVICE */
(function(){
  const KEY = 'fluxo_global_period_v1';

  function pad(n){ return String(n).padStart(2,'0'); }
  function monthKey(year, month){ return String(year) + '-' + pad(Number(month)+1); }

  function read(){
    try {
      const raw = FinanceStorage.getRaw(KEY);
      if (raw) {
        const v = JSON.parse(raw);
        if (v && Number.isFinite(Number(v.year)) && Number.isFinite(Number(v.month))) return v;
      }
    } catch(e){}
    const d = new Date();
    return {year:d.getFullYear(), month:d.getMonth()};
  }

  function write(period){
    const p = {
      year:Number(period.year),
      month:Number(period.month)
    };
    try { FinanceStorage.setRaw(KEY, JSON.stringify(p)); } catch(e){}
    return p;
  }

  function get(){
    const p = read();
    window.fluxoGlobalPeriod = p;
    return p;
  }

  function set(year, month){
    const p = write({year:Number(year), month:Number(month)});
    window.fluxoGlobalPeriod = p;

    // Broadcast a single application-wide event. Existing modules can
    // subscribe incrementally; this avoids forcing a simultaneous rewrite.
    try {
      window.dispatchEvent(new CustomEvent('fluxo:period-change', {detail:p}));
    } catch(e){}

    return p;
  }

  function isBefore(date, period){
    const d = date instanceof Date ? date : new Date(date);
    if (isNaN(d.getTime())) return false;
    const y=d.getFullYear(), m=d.getMonth();
    return y < Number(period.year) || (y === Number(period.year) && m < Number(period.month));
  }

  function isAfter(date, period){
    const d = date instanceof Date ? date : new Date(date);
    if (isNaN(d.getTime())) return false;
    const y=d.getFullYear(), m=d.getMonth();
    return y > Number(period.year) || (y === Number(period.year) && m > Number(period.month));
  }

  function isSameMonth(date, period){
    const d = date instanceof Date ? date : new Date(date);
    return !isNaN(d.getTime()) &&
      d.getFullYear() === Number(period.year) &&
      d.getMonth() === Number(period.month);
  }

  function effectiveBalance(initialBalance, movements, period){
    let total = Number(initialBalance) || 0;
    (Array.isArray(movements) ? movements : []).forEach(m => {
      if (!m || m.initial) return;
      const dt = m.date || m.createdAt || m.timestamp;
      if (!dt || isAfter(dt, period)) return;
      const amount = Number(m.amount ?? m.value ?? 0) || 0;
      if (m.type === 'withdrawal' || m.kind === 'withdrawal' || m.type === 'retiro' || m.kind === 'retiro') total -= amount;
      else total += amount;
    });
    return Math.max(0,total);
  }

  function savingsBalanceAt(goal, period){
    if (!goal) return 0;
    const created = goal.createdAt || goal.createdDate || goal.date || goal.fechaCreacion;
    if (created && isAfter(created, period)) return 0;

    const initial = Number(
      goal.initialBalance ??
      goal.initialSaved ??
      goal.initialAmount ??
      goal.startAmount ??
      goal.alreadySaved ??
      0
    ) || 0;

    // Current v12 model stores the initial amount as a payment marked initial.
    // Therefore it is excluded from movements and only used as initialBalance.
    const movements = Array.isArray(goal.movements)
      ? goal.movements
      : (Array.isArray(goal.payments) ? goal.payments : []);

    return effectiveBalance(initial, movements, period);
  }

  window.FluxoPeriod = {
    get, set, monthKey, isBefore, isAfter, isSameMonth,
    effectiveBalance, savingsBalanceAt
  };
  window.fluxoGlobalPeriod = get();

  // Convenience listener point for the dashboard and future modules.
  window.addEventListener('fluxo:period-change', function(e){
    window.fluxoGlobalPeriod = e.detail || get();
  });
})();


/* V13_GLOBAL_PERIOD_BRIDGE */
(function(){
  window.setFluxoGlobalPeriod = function(year, month){
    if (window.FluxoPeriod && typeof window.FluxoPeriod.set === 'function') {
      return window.FluxoPeriod.set(year, month);
    }
    return null;
  };
  window.getFluxoGlobalPeriod = function(){
    if (window.FluxoPeriod && typeof window.FluxoPeriod.get === 'function') {
      return window.FluxoPeriod.get();
    }
    return null;
  };
})();


/* V14_GLOBAL_PERIOD_TO_APP_STATE */
(function(){
  window.addEventListener('fluxo:period-change', function(e){
    const p = e.detail;
    if (!p || !Number.isFinite(Number(p.year)) || !Number.isFinite(Number(p.month))) return;
    Y = Number(p.year);
    M = Number(p.month);
    if (typeof reRender === 'function') reRender();
  });

  // Make the current Inicio period the canonical global period on startup.
  if (window.FluxoPeriod && typeof window.FluxoPeriod.set === 'function') {
    try { window.FluxoPeriod.set(Y, M); } catch(e) {}
  }
})();


/* V14_FINANCIAL_ENGINE */
(function(){
  window.FluxoFinancialEngine = {
    month: function(year, month) {
      const y = Number(year), m = Number(month);
      const s = getMonthSummary(y, m);
      return {
        year: y, month: m,
        earnings: Number(s.totalEarn) || 0,
        incomes: Number(s.incomes) || 0,
        extras: Number(s.extrasTotal) || 0,
        expenses: Number(s.expenses) || 0,
        discounts: Number(s.discounts) || 0,
        debts: Number(s.debts) || 0,
        savingsContrib: Number(s.savingsContrib) || 0,
        available: s.available,
        saved: s.saved,
        totalWealth: s.totalWealth,
        monthlyNet: Number(s.balance) || 0
      };
    },
    accumulated: function(year, month) {
      const y = Number(year), m = Number(month);
      const s = getMonthSummary(y, m);
      return {
        year: y, month: m,
        available: s.available,
        saved: s.saved,
        totalWealth: s.totalWealth
      };
    }
  };
})();


/* V15_CANONICAL_HISTORICAL_SAVINGS */
(function(){
  function periodKey(p){
    if (!p) return null;
    return {year:Number(p.year), month:Number(p.month)};
  }

  function dateParts(value){
    if (!value) return null;
    if (typeof value === 'string') {
      const m = value.match(/^(\d{4})-(\d{1,2})(?:-(\d{1,2}))?/);
      if (m) return {year:Number(m[1]), month:Number(m[2])-1, day:Number(m[3]||1)};
    }
    const d = new Date(value);
    if (isNaN(d.getTime())) return null;
    return {year:d.getFullYear(), month:d.getMonth(), day:d.getDate()};
  }

  function beforePeriod(value, period){
    const d=dateParts(value), p=periodKey(period);
    if (!d || !p) return false;
    return d.year < p.year || (d.year === p.year && d.month < p.month);
  }

  function goalCreatedAfterPeriod(goal, period){
    const created = goal && (
      goal.createdAt || goal.createdDate || goal.creationDate ||
      goal.date || goal.fechaCreacion || goal.created
    );
    return !!created && beforePeriod(created, period) === false &&
      (function(){
        const d=dateParts(created), p=periodKey(period);
        return d && p && (d.year > p.year || (d.year === p.year && d.month > p.month));
      })();
  }

  function initialAmount(goal){
    return Number(
      goal?.initialBalance ??
      goal?.initialSaved ??
      goal?.initialAmount ??
      goal?.startAmount ??
      goal?.alreadySaved ??
      0
    ) || 0;
  }

  function movementDate(m){
    return m?.date || m?.createdAt || m?.timestamp || m?.fecha || m?.created;
  }

  function historicalGoalBalance(goal, period){
    if (!goal || !period) return 0;
    if (goalCreatedAfterPeriod(goal, period)) return 0;

    let total = initialAmount(goal);
    const movements = Array.isArray(goal.movements)
      ? goal.movements
      : (Array.isArray(goal.payments) ? goal.payments : []);

    movements.forEach(m=>{
      if (!m || m.initial) return;
      const dt=movementDate(m);
      if (!dt) return;
      const d=dateParts(dt), p=periodKey(period);
      if (!d || !p) return;
      const after = d.year > p.year || (d.year === p.year && d.month > p.month);
      if (after) return;

      const amount=Number(m.amount ?? m.value ?? 0) || 0;
      const type=String(m.type ?? m.kind ?? '').toLowerCase();
      if (type === 'withdrawal' || type === 'retiro' || type === 'withdraw') total -= amount;
      else total += amount;
    });

    return Math.max(0,total);
  }

  function historicalSavingsTotal(goals, period){
    return (Array.isArray(goals) ? goals : [])
      .reduce((sum,g)=>sum + historicalGoalBalance(g,period),0);
  }

  window.FluxoSavingsHistory = {
    dateParts,
    goalCreatedAfterPeriod,
    historicalGoalBalance,
    historicalSavingsTotal
  };
})();


/* V15_SAVINGS_HISTORY_BRIDGE */
(function(){
  window.isSavingGoalVisibleForPeriod = function(goal, period){
    return !(window.FluxoSavingsHistory &&
      window.FluxoSavingsHistory.goalCreatedAfterPeriod(goal, period));
  };
})();


/* V16_HISTORICAL_SAVINGS_INTEGRATION */
(function(){
  function currentPeriod(){
    if (window.FluxoPeriod && typeof window.FluxoPeriod.get === 'function') return window.FluxoPeriod.get();
    const d=new Date(); return {year:d.getFullYear(), month:d.getMonth()};
  }
  function parseDate(v){
    if (!v) return null;
    if (typeof v === 'string') {
      const m=v.match(/^(\d{4})-(\d{1,2})(?:-(\d{1,2}))?/);
      if(m) return {year:+m[1],month:+m[2]-1,day:+(m[3]||1)};
    }
    const d=new Date(v); if(isNaN(d.getTime())) return null;
    return {year:d.getFullYear(),month:d.getMonth(),day:d.getDate()};
  }
  function afterPeriod(v,p){
    const d=parseDate(v); if(!d||!p)return false;
    return d.year>+p.year || (d.year===+p.year && d.month>+p.month);
  }
  function creationDate(g){
    return g && (g.createdAt||g.createdDate||g.creationDate||g.fechaCreacion||g.dateCreated||g.created||g.date);
  }
  function isCreatedAfter(g,p){
    const c=creationDate(g); return !!c && afterPeriod(c,p);
  }
  function initial(g){
    return Number(g?.initialBalance ?? g?.initialSaved ?? g?.initialAmount ?? g?.startAmount ?? g?.alreadySaved ?? 0)||0;
  }
  function movements(g){
    return Array.isArray(g?.movements)?g.movements:(Array.isArray(g?.payments)?g.payments:[]);
  }
  function balance(g,p){
    if(!g || isCreatedAfter(g,p)) return 0;
    let total=initial(g);
    movements(g).forEach(m=>{
      if(!m||m.initial)return;
      const dt=m.date||m.createdAt||m.timestamp||m.fecha||m.created||m.mk;
      if(!dt)return;
      let d=parseDate(dt);
      if(!d && typeof dt==='string'){
        const mm=dt.match(/^(\d{4})-(\d{1,2})$/);
        if(mm)d={year:+mm[1],month:+mm[2]-1,day:1};
      }
      if(!d)return;
      if(d.year>+p.year || (d.year===+p.year && d.month>+p.month))return;
      const a=Number(m.amount??m.value??0)||0;
      const t=String(m.type??m.kind??'').toLowerCase();
      if(t==='withdrawal'||t==='retiro'||t==='withdraw')total-=a; else total+=a;
    });
    return Math.max(0,total);
  }
  function goals(){
    // Try common app data containers without changing existing storage.
    const candidates=[
      window.savings,window.ahorros,window.savingGoals,window.savingsGoals,
      window.appState?.savings,window.appState?.ahorros,
      window.state?.savings,window.state?.ahorros
    ];
    for(const c of candidates) if(Array.isArray(c)) return c;
    return [];
  }
  function canonicalTotal(p){
    return goals().reduce((s,g)=>s+balance(g,p),0);
  }

  window.FluxoSavingsHistory.getCurrentPeriod = currentPeriod;
  window.FluxoSavingsHistory.historicalSavingsTotal = canonicalTotal;
  window.FluxoSavingsHistory.historicalGoalBalance = balance;
  window.FluxoSavingsHistory.goalCreatedAfterPeriod = isCreatedAfter;
  window.FluxoSavingsHistory.isGoalVisible = function(g,p){return !isCreatedAfter(g,p);};

  // Provide explicit canonical methods for existing renderers to call.
  window.getHistoricalSavingsTotal = function(period){return canonicalTotal(period||currentPeriod());};
  window.getHistoricalSavingBalance = function(goal,period){return balance(goal,period||currentPeriod());};
})();


/* V17_HISTORICAL_SAVINGS_SOURCE_OF_TRUTH */
(function(){
  function periodFromAny(p){
    if(!p) {
      const d=new Date();
      return {year:d.getFullYear(),month:d.getMonth()};
    }
    return {year:Number(p.year),month:Number(p.month)};
  }
  function goalStart(g){
    if(!g) return null;
    if(g.startY!=null && g.startM!=null)
      return {year:Number(g.startY),month:Number(g.startM)};
    const v=g.createdAt||g.createdDate||g.creationDate||g.fechaCreacion||g.dateCreated||g.created;
    if(!v) return null;
    const m=String(v).match(/^(\d{4})-(\d{1,2})/);
    if(m) return {year:Number(m[1]),month:Number(m[2])-1};
    const d=new Date(v);
    return isNaN(d.getTime())?null:{year:d.getFullYear(),month:d.getMonth()};
  }
  function existsByPeriod(g,p){
    const s=goalStart(g), q=periodFromAny(p);
    if(!s) return true;
    return s.year<q.year || (s.year===q.year && s.month<=q.month);
  }
  function movementPeriod(m){
    if(!m) return null;
    if(m.year!=null && m.month!=null) return {year:Number(m.year),month:Number(m.month)};
    const v=m.date||m.createdAt||m.timestamp||m.fecha||m.created;
    if(!v)return null;
    const mm=String(v).match(/^(\d{4})-(\d{1,2})/);
    if(mm)return {year:Number(mm[1]),month:Number(mm[2])-1};
    const d=new Date(v);
    return isNaN(d.getTime())?null:{year:d.getFullYear(),month:d.getMonth()};
  }
  function leq(a,b){
    return a.year<b.year || (a.year===b.year && a.month<=b.month);
  }
  function initial(g){
    return Number(g?.initial ?? g?.initialBalance ?? g?.initialSaved ?? g?.initialAmount ?? 0)||0;
  }
  function balance(g,p){
    const q=periodFromAny(p);
    if(!existsByPeriod(g,q)) return 0;
    let total=initial(g);
    const arr=Array.isArray(g?.payments)?g.payments:(Array.isArray(g?.movements)?g.movements:[]);
    for(const m of arr){
      const mp=movementPeriod(m);
      if(!mp || !leq(mp,q)) continue;
      const amount=Number(m.amount??m.value??m.monto??0)||0;
      const t=String(m.type??m.kind??m.tipo??'').toLowerCase();
      if(t.includes('retir')||t.includes('withdraw')) total-=amount;
      else total+=amount;
    }
    return Math.max(0,total);
  }
  window.FluxoSavingsSourceOfTruth={
    periodFromAny, goalStart, existsByPeriod, balance
  };
  window.getSavingsBalanceForPeriod=function(goal,period){
    return window.FluxoSavingsSourceOfTruth.balance(goal,period);
  };
  window.goalExistsInPeriod=function(goal,period){
    return window.FluxoSavingsSourceOfTruth.existsByPeriod(goal,period);
  };
})();


/* V18_REAL_HISTORICAL_SAVINGS_ENGINE */
(function(){
  function selectedPeriod(){
    // Prefer the app's global period variables if present.
    const y = (typeof window.globalPeriodYear !== 'undefined') ? Number(window.globalPeriodYear) : null;
    const m = (typeof window.globalPeriodMonth !== 'undefined') ? Number(window.globalPeriodMonth) : null;
    if(Number.isFinite(y)&&Number.isFinite(m)) return {year:y,month:m};
    const d=new Date();
    return {year:d.getFullYear(),month:d.getMonth()};
  }

  function normalizePeriod(p){
    if(!p) return selectedPeriod();
    return {year:Number(p.year),month:Number(p.month)};
  }

  function goalStart(goal){
    if(!goal) return null;
    if(goal.startY!=null && goal.startM!=null){
      return {year:Number(goal.startY),month:Number(goal.startM)};
    }
    if(goal.startYear!=null && goal.startMonth!=null){
      return {year:Number(goal.startYear),month:Number(goal.startMonth)};
    }
    return null;
  }

  function goalExists(goal,period){
    const s=goalStart(goal), p=normalizePeriod(period);
    if(!s) return true;
    return s.year<p.year || (s.year===p.year && s.month<=p.month);
  }

  function initial(goal){
    // Existing Fluxo savings data can use any of these fields.
    return Number(
      goal.initial ??
      goal.initialSaved ??
      goal.initialBalance ??
      goal.initialAmount ??
      goal.startAmount ??
      0
    ) || 0;
  }

  function movementPeriod(m){
    if(!m) return null;
    if(m.year!=null && m.month!=null) return {year:Number(m.year),month:Number(m.month)};
    const value=m.date||m.createdAt||m.timestamp||m.fecha||m.created;
    if(!value) return null;
    const s=String(value);
    const match=s.match(/^(\d{4})-(\d{1,2})/);
    if(match) return {year:Number(match[1]),month:Number(match[2])-1};
    const d=new Date(value);
    if(isNaN(d.getTime())) return null;
    return {year:d.getFullYear(),month:d.getMonth()};
  }

  function beforeOrEqual(a,b){
    return a.year<b.year || (a.year===b.year && a.month<=b.month);
  }

  function balance(goal,period){
    const p=normalizePeriod(period);
    if(!goalExists(goal,p)) return 0;

    let value=initial(goal);
    const list=Array.isArray(goal.payments) ? goal.payments :
      (Array.isArray(goal.movements) ? goal.movements : []);

    for(const mov of list){
      const mp=movementPeriod(mov);
      if(!mp || !beforeOrEqual(mp,p)) continue;
      const amount=Number(mov.amount??mov.value??mov.monto??0)||0;
      const type=String(mov.type??mov.kind??mov.tipo??'').toLowerCase();
      if(type.includes('retir')||type.includes('withdraw')) value-=amount;
      else value+=amount;
    }
    return Math.max(0,value);
  }

  function visibleGoals(goals,period){
    return (Array.isArray(goals)?goals:[]).filter(g=>goalExists(g,period));
  }

  window.FluxoHistoricalSavings = {
    selectedPeriod,
    normalizePeriod,
    goalStart,
    goalExists,
    balance,
    visibleGoals
  };

  // These are the canonical functions the existing UI should use.
  window.getSavingsHistoricalBalance = function(goal,period){
    return balance(goal,period);
  };
  window.getSavingsHistoricalGoals = function(goals,period){
    return visibleGoals(goals,period);
  };
})();


/* V19_GLOBAL_HISTORICAL_FINANCE_DIAGNOSTIC */
(function(){
  const MONTH_NAMES = ["enero","febrero","marzo","abril","mayo","junio","julio","agosto","septiembre","octubre","noviembre","diciembre"];

  function n(v){ const x=Number(v); return Number.isFinite(x)?x:null; }

  function readPeriod(){
    const candidates=[
      ["globalPeriodYear","globalPeriodMonth"],
      ["selectedYear","selectedMonth"],
      ["currentYear","currentMonth"],
      ["periodYear","periodMonth"],
      ["viewYear","viewMonth"],
      ["filterYear","filterMonth"]
    ];
    for(const [yk,mk] of candidates){
      const y=n(window[yk]), m=n(window[mk]);
      if(y!==null&&m!==null) return {year:y,month:m,source:yk+"/"+mk};
    }
    // Common localStorage keys
    for(const key of ["fluxo_period","globalPeriod","selectedPeriod","periodoGlobal"]){
      try{
        const raw=FinanceStorage.getRaw(key);
        if(raw){
          const o=JSON.parse(raw);
          const y=n(o.year??o.y), m=n(o.month??o.m);
          if(y!==null&&m!==null) return {year:y,month:m,source:"localStorage:"+key};
        }
      }catch(e){}
    }
    const d=new Date();
    return {year:d.getFullYear(),month:d.getMonth(),source:"fallback-current-date"};
  }

  function normalizePeriod(p){
    if(!p) return readPeriod();
    if(typeof p==="string"){
      const m=p.match(/^(\d{4})[-/](\d{1,2})/);
      if(m) return {year:+m[1],month:+m[2]-1,source:"string"};
    }
    return {year:n(p.year??p.y),month:n(p.month??p.m),source:"object"};
  }

  function startOfGoal(g){
    if(!g) return null;
    const pairs=[
      ["startY","startM"],["startYear","startMonth"],["createdYear","createdMonth"]
    ];
    for(const [yk,mk] of pairs){
      const y=n(g[yk]),m=n(g[mk]);
      if(y!==null&&m!==null) return {year:y,month:m,source:yk+"/"+mk};
    }
    for(const k of ["createdAt","createdDate","creationDate","fechaCreacion","dateCreated","created","date"]){
      if(g[k]){
        const s=String(g[k]), mm=s.match(/^(\d{4})[-/](\d{1,2})/);
        if(mm) return {year:+mm[1],month:+mm[2]-1,source:k};
        const d=new Date(g[k]);
        if(!isNaN(d.getTime())) return {year:d.getFullYear(),month:d.getMonth(),source:k};
      }
    }
    return null;
  }

  function existsAt(g,p){
    const s=startOfGoal(g),q=normalizePeriod(p);
    if(!s||q.year===null||q.month===null) return true;
    return s.year<q.year || (s.year===q.year&&s.month<=q.month);
  }

  function movementPeriod(m){
    if(!m)return null;
    const y=n(m.year??m.y),mo=n(m.month??m.m);
    if(y!==null&&mo!==null) return {year:y,month:mo};
    for(const k of ["date","createdAt","timestamp","fecha","created"]){
      if(m[k]){
        const s=String(m[k]),mm=s.match(/^(\d{4})[-/](\d{1,2})/);
        if(mm)return {year:+mm[1],month:+mm[2]-1};
        const d=new Date(m[k]);
        if(!isNaN(d.getTime()))return {year:d.getFullYear(),month:d.getMonth()};
      }
    }
    return null;
  }

  function leq(a,b){return a.year<b.year||(a.year===b.year&&a.month<=b.month);}

  function initial(g){
    for(const k of ["initial","initialSaved","initialBalance","initialAmount","startAmount","alreadySaved","saldoInicial"]){
      if(g[k]!==undefined&&g[k]!==null){
        const x=Number(g[k]); if(Number.isFinite(x))return x;
      }
    }
    return 0;
  }

  function balance(g,p){
    const q=normalizePeriod(p);
    if(!existsAt(g,q))return 0;
    let total=initial(g);
    const list=Array.isArray(g.payments)?g.payments:(Array.isArray(g.movements)?g.movements:[]);
    for(const m of list){
      const mp=movementPeriod(m);
      if(!mp||!leq(mp,q))continue;
      const amount=Number(m.amount??m.value??m.monto??m.valor??0)||0;
      const t=String(m.type??m.kind??m.tipo??"").toLowerCase();
      if(t.includes("retir")||t.includes("withdraw")||t.includes("sacar"))total-=amount;
      else total+=amount;
    }
    return Math.max(0,total);
  }

  function findGoalArrays(){
    const found=[];
    const seen=new Set();
    function add(source,value){
      if(!Array.isArray(value)||seen.has(value))return;
      seen.add(value);found.push({source,goals:value});
    }
    const candidates=[
      ["window.savings",window.savings],["window.ahorros",window.ahorros],
      ["window.savingGoals",window.savingGoals],["window.savingsGoals",window.savingsGoals],
      ["window.appState.savings",window.appState?.savings],["window.appState.ahorros",window.appState?.ahorros],
      ["window.state.savings",window.state?.savings],["window.state.ahorros",window.state?.ahorros]
    ];
    candidates.forEach(x=>add(x[0],x[1]));
    // Scan localStorage for arrays of goal-like objects.
    try{
      FinanceStorage.allKeys().forEach(k=>{
        const raw=FinanceStorage.getRaw(k);
        if(!raw)return;
        try{
          const v=JSON.parse(raw);
          if(Array.isArray(v)&&v.some(x=>x&&typeof x==="object"&&("startY"in x||"startM"in x||"payments"in x||"initial"in x))){
            add("localStorage:"+k,v);
          }
        }catch(e){}
      });
    }catch(e){}
    return found;
  }

  function canonical(goals,p){
    const q=normalizePeriod(p);
    return (Array.isArray(goals)?goals:[]).reduce((s,g)=>s+balance(g,q),0);
  }

  window.FluxoFinanceDiagnostic={
    period:readPeriod,
    goalStart:startOfGoal,
    goalExistsAt:existsAt,
    goalBalanceAt:balance,
    findGoalArrays,
    canonicalSavingsTotal:function(p){
      const arr=findGoalArrays();
      const source=arr[0];
      return {period:normalizePeriod(p),sources:arr.map(x=>x.source),total:source?canonical(source.goals,p):0};
    },
    inspect:function(){
      const arr=findGoalArrays(),p=readPeriod();
      return {
        selectedPeriod:p,
        arrays:arr.map(x=>({source:x.source,count:x.goals.length,goals:x.goals.map(g=>({
          start:startOfGoal(g),exists:existsAt(g,p),initial:initial(g),balance:balance(g,p)
        }))}))
      };
    }
  };

  window.getCanonicalSavingsTotal=function(period){
    const found=findGoalArrays();
    return found.length?canonical(found[0].goals,period):0;
  };
})();


/* V20_DIRECT_ORIGIN_HISTORICAL_SAVINGS */
(function(){
  function num(v){var n=Number(v);return Number.isFinite(n)?n:null;}

  function getPeriod(){
    var pairs=[
      ["selectedYear","selectedMonth"],["currentYear","currentMonth"],
      ["globalYear","globalMonth"],["globalPeriodYear","globalPeriodMonth"],
      ["periodYear","periodMonth"],["viewYear","viewMonth"],
      ["filterYear","filterMonth"],["yearSelected","monthSelected"]
    ];
    for(var i=0;i<pairs.length;i++){
      var y=num(window[pairs[i][0]]),m=num(window[pairs[i][1]]);
      if(y!==null&&m!==null)return {year:y,month:m};
    }
    var objs=[window.selectedPeriod,window.currentPeriod,window.globalPeriod,window.periodoGlobal];
    for(var j=0;j<objs.length;j++){
      var o=objs[j];
      if(o){
        var yy=num(o.year??o.y),mm=num(o.month??o.m);
        if(yy!==null&&mm!==null)return {year:yy,month:mm};
      }
    }
    var d=new Date();
    return {year:d.getFullYear(),month:d.getMonth()};
  }

  function normalize(p){
    if(!p)return getPeriod();
    var y=num(p.year??p.y),m=num(p.month??p.m);
    return {year:y,month:m};
  }

  function goalStart(g){
    if(!g)return null;
    var y=num(g.startY),m=num(g.startM);
    if(y!==null&&m!==null){
      // Fluxo may store month as 0..11 or 1..12. Prefer explicit metadata when present.
      if(g.startMonthBase===1 && m>=1&&m<=12)m--;
      else if(m===12)m=11;
      return {year:y,month:m};
    }
    var pairs=[["startYear","startMonth"],["createdYear","createdMonth"]];
    for(var i=0;i<pairs.length;i++){
      y=num(g[pairs[i][0]]);m=num(g[pairs[i][1]]);
      if(y!==null&&m!==null){
        if(m>=1&&m<=12)m--;
        return {year:y,month:m};
      }
    }
    return null;
  }

  function exists(g,p){
    var s=goalStart(g),q=normalize(p);
    if(!s||q.year===null||q.month===null)return true;
    return s.year<q.year || (s.year===q.year&&s.month<=q.month);
  }

  function movementPeriod(m){
    if(!m)return null;
    var y=num(m.year??m.y),mo=num(m.month??m.m);
    if(y!==null&&mo!==null){
      if(mo>=1&&mo<=12)mo--;
      return {year:y,month:mo};
    }
    var v=m.date||m.createdAt||m.timestamp||m.fecha||m.created;
    if(!v)return null;
    var s=String(v),match=s.match(/^(\d{4})[-/](\d{1,2})/);
    if(match)return {year:+match[1],month:+match[2]-1};
    var d=new Date(v);
    return isNaN(d.getTime())?null:{year:d.getFullYear(),month:d.getMonth()};
  }

  function leq(a,b){return a.year<b.year||(a.year===b.year&&a.month<=b.month);}

  function initial(g){
    var keys=["initial","initialSaved","initialBalance","initialAmount","startAmount","alreadySaved","saldoInicial"];
    for(var i=0;i<keys.length;i++){
      if(g[keys[i]]!==undefined&&g[keys[i]]!==null){
        var x=Number(g[keys[i]]);
        if(Number.isFinite(x))return x;
      }
    }
    return 0;
  }

  function balance(g,p){
    var q=normalize(p);
    if(!exists(g,q))return 0;
    var total=initial(g);
    var list=Array.isArray(g.payments)?g.payments:(Array.isArray(g.movements)?g.movements:[]);
    for(var i=0;i<list.length;i++){
      var mp=movementPeriod(list[i]);
      if(!mp||!leq(mp,q))continue;
      var amount=Number(list[i].amount??list[i].value??list[i].monto??list[i].valor??0)||0;
      var type=String(list[i].type??list[i].kind??list[i].tipo??"").toLowerCase();
      if(type.indexOf("retir")>=0||type.indexOf("withdraw")>=0)total-=amount;
      else total+=amount;
    }
    return Math.max(0,total);
  }

  function aggregate(goals,p){
    if(!Array.isArray(goals))return 0;
    var total=0;
    for(var i=0;i<goals.length;i++)total+=balance(goals[i],p);
    return total;
  }

  window.FluxoSavingsOrigin={
    period:getPeriod,goalStart:goalStart,exists:exists,
    balance:balance,aggregate:aggregate
  };
  window.calculateHistoricalSavings=aggregate;
  window.calculateSavingsForSelectedPeriod=function(goals){return aggregate(goals,getPeriod());};
})();
