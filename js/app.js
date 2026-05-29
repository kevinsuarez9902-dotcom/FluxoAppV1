// ═══════════════════════════════════════════════════════



// ── Migración: asignar startY/startM a registros sin fecha ──────────
(function fixMissingDates() {
  const todayY = today.getFullYear();
  const todayM = today.getMonth();
  let sc = false;
  savings.forEach(s => {
    if (s.startY == null || s.startY === 0) { s.startY = todayY; s.startM = todayM; sc = true; }
  });
  if (sc) localStorage.setItem('turnos_savings', JSON.stringify(savings));
  let dc = false;
  debts.forEach(d => {
    if (d.startY == null || d.startY === 0) { d.startY = todayY; d.startM = todayM; dc = true; }
  });
  if (dc) localStorage.setItem('turnos_debts', JSON.stringify(debts));
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
// EXPENSES HELPERS
// ═══════════════════════════════════════════════════════
function getMonthExpenses(y, m) {
  const totalDays = dim(y, m);
  const mk = monthKey(y, m);
  const allExp = [
    ...expenses.map(e => ({ ...e, _src: 'global' })),
    ...((monthExpenses[mk]) || []).map(e => ({ ...e, _src: 'month' }))
  ];
  let total = 0;
  const items = [];
  allExp.forEach(exp => {
    const srcLabel = exp._src === 'month' ? `Solo ${MONTHS[m]} ${y}` : null;
    if (exp.type === 'monthly') {
      total += exp.amount;
      items.push({ ...exp, appliedAmount: exp.amount, note: srcLabel || `Día ${exp.day} · mensual` });
    } else if (exp.type === 'quincenal') {
      // Q1
      const d1 = parseInt(exp.day);
      if (d1 >= 1 && d1 <= 15) {
        total += exp.amount;
        items.push({ ...exp, appliedAmount: exp.amount, note: srcLabel || `Día ${d1} · Q1` });
      }
      // Q2
      const d2 = parseInt(exp.day2);
      if (d2 >= 16 && d2 <= totalDays) {
        total += exp.amount;
        items.push({ ...exp, id: exp.id + '_q2', appliedAmount: exp.amount, note: srcLabel || `Día ${d2} · Q2` });
      }
    } else { // daily
      const d = parseInt(exp.day);
      if (d >= 1 && d <= totalDays) {
        total += exp.amount;
        items.push({ ...exp, appliedAmount: exp.amount, note: srcLabel || `Día ${d} · diario` });
      }
    }
  });
  return { total, items };
}

function hasDayExpense(y, m, d) {
  return expenses.some(e => e.type === 'daily' && parseInt(e.day) === d);
}

// ═══════════════════════════════════════════════════════
// INCOME HELPERS
// ═══════════════════════════════════════════════════════
function getMonthIncomes(y, m) {
  const totalDays = dim(y, m);
  const mk = monthKey(y, m);
  const allInc = [
    ...incomes.map(i => ({ ...i, _src: 'global' })),
    ...((monthIncomes[mk]) || []).map(i => ({ ...i, _src: 'month' }))
  ];
  let total = 0;
  const items = [];
  allInc.forEach(inc => {
    const srcLabel = inc._src === 'month' ? `Solo ${MONTHS[m]} ${y}` : null;
    if (inc.type === 'monthly') {
      total += inc.amount;
      items.push({ ...inc, appliedAmount: inc.amount, note: srcLabel || `Día ${inc.day} · mensual` });
    } else if (inc.type === 'quincenal') {
      const d1 = parseInt(inc.day);
      if (d1 >= 1 && d1 <= 15) {
        total += inc.amount;
        items.push({ ...inc, appliedAmount: inc.amount, note: srcLabel || `Día ${d1} · Q1` });
      }
      const d2 = parseInt(inc.day2);
      if (d2 >= 16 && d2 <= totalDays) {
        total += inc.amount;
        items.push({ ...inc, id: inc.id + '_q2', appliedAmount: inc.amount, note: srcLabel || `Día ${d2} · Q2` });
      }
    } else {
      const d = parseInt(inc.day);
      if (d >= 1 && d <= totalDays) {
        total += inc.amount;
        items.push({ ...inc, appliedAmount: inc.amount, note: srcLabel || `Día ${d} · diario` });
      }
    }
  });
  return { total, items };
}

// ═══════════════════════════════════════════════════════
// DEBT HELPERS
// ═══════════════════════════════════════════════════════
function getMonthDebtPayment(y, m) {
  // Suma las cuotas de deudas activas (con saldo pendiente) en el mes dado
  let total = 0;
  debts.forEach(d => {
    const pending = d.total - (d.paid || 0);
    if (pending <= 0) return; // saldada
    total += d.cuota;
    if (d.freq === 'quincenal') total += d.cuota; // dos cuotas al mes
  });
  return total;
}

// ═══════════════════════════════════════════════════════
// ACCUMULATED BALANCE
// ═══════════════════════════════════════════════════════
function getAllDataMonthKeys() {
  const keys = new Set();
  Object.keys(overrides).forEach(k => keys.add(k.slice(0, 7)));
  Object.keys(monthExpenses).forEach(k => keys.add(k));
  Object.keys(discountMonths).forEach(k => keys.add(k));
  Object.keys(accumBalances).forEach(k => keys.add(k));
  return Array.from(keys).sort();
}

function getFirstDataMonth() {
  const keys = getAllDataMonthKeys();
  if (keys.length === 0) return null;
  const [y, m] = keys[0].split('-').map(Number);
  return { y, m: m - 1 };
}

function getAccumulatedBalance(y, m) {
  const first = getFirstDataMonth();
  if (!first) return 0;
  let cy = first.y, cm = first.m;
  let accum = 0;
  const targetKey = monthKey(y, m);
  while (true) {
    const mk = monthKey(cy, cm);
    const c  = calcMonth(cy, cm);
    accum += c.balance;
    accumBalances[mk] = accum;
    if (mk === targetKey) break;
    cm++;
    if (cm > 11) { cm = 0; cy++; }
    if (cy > y || (cy === y && cm > m)) break;
  }
  saveAccum();
  return accum;
}

function getPrevAccumulated(y, m) {
  let py = y, pm = m - 1;
  if (pm < 0) { pm = 11; py--; }
  const first = getFirstDataMonth();
  if (!first) return 0;
  if (py < first.y || (py === first.y && pm < first.m)) return 0;
  return getAccumulatedBalance(py, pm);
}

// ═══════════════════════════════════════════════════════
// DISCOUNT HELPERS
// ═══════════════════════════════════════════════════════
function getMonthDiscData(y, m) {
  const mk = monthKey(y, m);
  const md = discountMonths[mk] || { disabled: [], extras: [] };
  const activeGlobal = discounts.filter(d => !md.disabled.includes(d.id));
  const extras = md.extras || [];
  return { activeGlobal, extras, disabled: md.disabled || [], allForMonth: [...activeGlobal, ...extras] };
}

function getMonthDiscounts(y, m) {
  const c = calcMonthEarnings(y, m);
  const { allForMonth } = getMonthDiscData(y, m);
  let q1disc = 0, q2disc = 0, monthDisc = 0;
  allForMonth.forEach(d => {
    if (d.freq === 'quincenal') {
      q1disc += d.type === 'pct' ? (d.pct / 100) * c.q1earn : d.fixed;
      q2disc += d.type === 'pct' ? (d.pct / 100) * c.q2earn : d.fixed;
    } else {
      monthDisc += d.type === 'pct' ? (d.pct / 100) * c.totalEarn : d.fixed;
    }
  });
  return { q1disc, q2disc, total: q1disc + q2disc + monthDisc, monthDisc };
}

// ═══════════════════════════════════════════════════════
// TAB NAVIGATION
// ═══════════════════════════════════════════════════════
const TAB_MAP = {
  resumen:      { sec: 'resumen',      tab: 'resumen' },
  calendar:     { sec: 'calendar',     tab: 'calendar' },
  finanzas:     { sec: 'finanzas',     tab: 'finanzas' },
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
    ['gastos','ingresos','ahorros','deudas','descuentos'].forEach(p => {
      const el = document.getElementById('mov-' + p);
      if (el) el.style.display = 'none';
    });
  }
  if (tab === 'resumen')      renderResumen();
  if (tab === 'calendar')     renderCal();
  if (tab === 'finanzas')     { switchMov(movPanel); }
  if (tab === 'estadisticas') { renderEstadisticas(); }
  if (tab === 'ajustes')      { renderNotifStatus(); initSchedUI(); initSalaryUI(); updateControlStartLabel(); }
}

// ── Movimientos sub-toggle ────────────────────────────
let movPanel = 'gastos';
function switchMov(panel) {
  movPanel = panel;
  ['gastos','ingresos','ahorros','deudas','descuentos'].forEach(p => {
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
    (s.payments || []).forEach(p => { if (p.mk === mk) total += p.amount; });
  });
  return total;
}

function isBeforeControl(y, m) {
  if (!controlStart) return false;
  return (y * 12 + m) < (controlStart.y * 12 + controlStart.m);
}

function calcMonth(y, m) {
  if (isBeforeControl(y, m)) {
    return { q1earn:0, q2earn:0, totalEarn:0, totalHours:0, q1h:0, q2h:0,
             q1a:0, q2a:0, q1p:0, q2p:0, absentCount:0,
             expenses:0, discounts:0, incomes:0, debts:0, savingsContrib:0,
             q1disc:0, q2disc:0, monthDisc:0, balance:0 };
  }
  const earn     = calcMonthEarnings(y, m);
  const expData  = getMonthExpenses(y, m);
  const discData = getMonthDiscounts(y, m);
  const incData  = getMonthIncomes(y, m);
  const debtAmt  = getMonthDebtPayment(y, m);
  const savAmt   = getMonthSavingsTotal(y, m);
  const extrasTotal = getMonthExtrasTotal(y, m);
  const balance  = earn.totalEarn + incData.total + extrasTotal - expData.total - discData.total - debtAmt - savAmt;
  return {
    ...earn,
    expenses:  expData.total,
    discounts: discData.total,
    incomes:   incData.total,
    debts:     debtAmt,
    savingsContrib: savAmt,
    extrasTotal,
    q1disc: discData.q1disc, q2disc: discData.q2disc, monthDisc: discData.monthDisc,
    balance,
  };
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

  document.getElementById('resumen-content').innerHTML = `
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px">
      <button class="nav-btn" onclick="prevMonth()" style="background:rgba(99,102,241,0.1)">‹</button>
      <div style="text-align:center">
        <div style="font-family:'DM Serif Display',serif;font-size:18px;color:#c7d2fe">${MONTHS[M]}</div>
        <div style="font-size:11px;color:#6366f1;font-weight:500">${Y}</div>
      </div>
      <button class="nav-btn" onclick="nextMonth()" style="background:rgba(99,102,241,0.1)">›</button>
    </div>

    <div class="badges">${badgesHtml}</div>

    <!-- 1. DINERO REAL DISPONIBLE — primero y en verde fuerte -->
    <div class="balance-card" style="background:linear-gradient(135deg,#052e16,#065f46);border-color:rgba(16,185,129,0.35)">
      <div style="position:absolute;top:0;left:0;right:0;height:2px;background:linear-gradient(90deg,#10b981,#34d399,transparent)"></div>
      <div class="balance-label" style="color:#10b981">💵 Dinero Real Disponible</div>
      <div class="balance-eq" style="font-size:9px;color:#6ee7b7">
        Devengado ${fmt(c.totalEarn)}${c.extrasTotal > 0 ? ` + Extras ${fmt(c.extrasTotal)}` : ''}${incTotal > 0 ? ` + Ingresos ${fmt(incTotal)}` : ''} − Gastos ${fmt(expTotal)} − Desc. ${fmt(c.discounts || 0)}${debtTotal > 0 ? ` − Deudas ${fmt(debtTotal)}` : ''}${c.savingsContrib > 0 ? ` − Ahorros ${fmt(c.savingsContrib)}` : ''}
      </div>
      <div class="balance-amount" style="color:#10b981">${fmt(c.balance)}</div>
    </div>

    <!-- 2. QUINCENAS -->
    <div class="summary-grid">
      <div class="s-card blue">
        <div class="card-label" style="color:#93c5fd">1ª Quincena</div>
        <div class="card-sub">Días 1 – 15</div>
        <div class="card-detail">${salary && salary.type === 'fixed' ? `Sueldo fijo ${salary.fixedType === 'quincenal' ? 'quincenal' : '(½ mensual)'}` : `${c.q1h}h · ${q1w} turnos`}${c.q1a > 0 ? ` · <span style="color:var(--red)">-${c.q1a} aus.</span>` : ''}${c.q1p > 0 ? ` · <span style="color:var(--amber)">${c.q1p} parc.</span>` : ''}${c.q1i > 0 ? ` · <span style="color:#7dd3fc">🏥${c.q1i}</span>` : ''}</div>
        <div class="card-amount blue">${fmt(c.q1earn)}</div>
      </div>
      <div class="s-card blue">
        <div class="card-label" style="color:#93c5fd">2ª Quincena</div>
        <div class="card-sub">Días 16 – ${dim(Y, M)}</div>
        <div class="card-detail">${salary && salary.type === 'fixed' ? `Sueldo fijo ${salary.fixedType === 'quincenal' ? 'quincenal' : '(½ mensual)'}` : `${c.q2h}h · ${q2w} turnos`}${c.q2a > 0 ? ` · <span style="color:var(--red)">-${c.q2a} aus.</span>` : ''}${c.q2p > 0 ? ` · <span style="color:var(--amber)">${c.q2p} parc.</span>` : ''}${c.q2i > 0 ? ` · <span style="color:#7dd3fc">🏥${c.q2i}</span>` : ''}</div>
        <div class="card-amount blue">${fmt(c.q2earn)}</div>
      </div>
    </div>

    <!-- 3. TOTAL DEVENGADO | INGRESOS EXTRAS -->
    <div class="summary-grid">
      <div class="s-card" style="border-left:3px solid #818cf8;position:relative">
        <div class="card-label" style="color:#c4b5fd">💰 Total Devengado</div>
        <div class="card-detail" style="color:#c4b5fd">${salary && salary.type === 'fixed' ? 'Sueldo fijo' : `${c.totalHours}h trabajadas`}${c.absentCount > 0 ? ` · ${c.absentCount} aus.` : ''}</div>
        <div class="card-amount purple" style="font-size:20px">${fmt(c.totalEarn)}</div>
      </div>
      <div class="s-card" style="border-left:3px solid #6ee7b7;position:relative">
        <div class="card-label" style="color:#a7f3d0">💰 Ingresos Extras</div>
        <div class="card-detail" style="color:#a7f3d0">${incItems.length + (c.extrasTotal > 0 ? 1 : 0)} concepto${(incItems.length + (c.extrasTotal > 0 ? 1 : 0)) !== 1 ? 's' : ''}</div>
        <div class="card-amount" style="color:#6ee7b7;font-size:20px">+${fmt(incTotal + (c.extrasTotal || 0))}</div>
      </div>
    </div>

    <!-- 4. GASTOS | DESCUENTOS -->
    <div class="summary-grid">
      <div class="s-card red">
        <div class="card-label" style="color:#fca5a5">Gastos</div>
        <div class="card-sub">${expItems.length} concepto${expItems.length !== 1 ? 's' : ''}</div>
        <div class="card-amount red" style="font-size:18px">${fmt(expTotal)}</div>
      </div>
      <div class="s-card" style="border-left:3px solid #a855f7">
        <div class="card-label" style="color:#c084fc">Descuentos</div>
        <div class="card-sub">${discounts.length} descuento${discounts.length !== 1 ? 's' : ''}</div>
        <div class="card-amount" style="color:#c084fc;font-size:18px">${fmt(c.discounts || 0)}</div>
      </div>
    </div>

    <!-- 5. DEUDAS | AHORROS -->
    ${(debtTotal > 0 || c.savingsContrib > 0) ? `
    <div class="summary-grid">
      ${debtTotal > 0 ? `
      <div class="s-card" style="border-left:3px solid #ef4444;position:relative">
        <div style="position:absolute;top:0;left:0;right:0;height:2px;background:linear-gradient(90deg,#ef4444,transparent)"></div>
        <div class="card-label" style="color:#fca5a5">💳 Deudas</div>
        <div class="card-sub" style="color:#fca5a5">${debts.filter(d => (d.total-(d.paid||0)) > 0).length} activa${debts.filter(d => (d.total-(d.paid||0)) > 0).length !== 1 ? 's' : ''}</div>
        <div class="card-amount red" style="font-size:18px">−${fmt(debtTotal)}</div>
      </div>` : '<div class="s-card" style="border-left:3px solid #374151"><div class="card-label" style="color:#475569">💳 Deudas</div><div class="card-amount" style="color:#475569;font-size:18px">$0</div></div>'}
      ${c.savingsContrib > 0 ? `
      <div class="s-card" style="border-left:3px solid #3b82f6;position:relative">
        <div style="position:absolute;top:0;left:0;right:0;height:2px;background:linear-gradient(90deg,#3b82f6,transparent)"></div>
        <div class="card-label" style="color:#93c5fd">🏦 Ahorros</div>
        <div class="card-sub" style="color:#93c5fd">${savings.filter(s => (s.goal-(s.saved||0)) > 0).length} meta${savings.filter(s => (s.goal-(s.saved||0)) > 0).length !== 1 ? 's' : ''}</div>
        <div class="card-amount blue" style="font-size:18px">−${fmt(c.savingsContrib)}</div>
      </div>` : '<div class="s-card" style="border-left:3px solid #374151"><div class="card-label" style="color:#475569">🏦 Ahorros</div><div class="card-amount" style="color:#475569;font-size:18px">$0</div></div>'}
    </div>` : ''}

    <!-- 6. SALDO ACUMULADO -->
    ${(() => {
      const prevAccum  = getPrevAccumulated(Y, M);
      const totalAccum = getAccumulatedBalance(Y, M);
      const hasPrev    = prevAccum !== 0;
      return `
    <div class="balance-card" style="background:linear-gradient(135deg,#0c1433 0%,#1a1035 100%);border-color:rgba(139,92,246,0.3)">
      <div style="position:absolute;top:0;left:0;right:0;height:2px;background:linear-gradient(90deg,#6366f1,#a855f7,transparent)"></div>
      <div class="balance-label" style="color:#c4b5fd;letter-spacing:3px">📈 Saldo Acumulado</div>
      ${hasPrev
        ? `<div class="balance-eq" style="color:#a78bfa">Arrastre ${fmt(prevAccum)} + Saldo mes ${fmt(c.balance)}</div>`
        : `<div class="balance-eq" style="color:#a78bfa">Primer mes registrado · sin arrastre</div>`}
      <div class="balance-amount" style="color:${totalAccum >= 0 ? '#a78bfa' : '#f87171'}">${fmt(totalAccum)}</div>
    </div>`;
    })()}
  `;
}

// ═══════════════════════════════════════════════════════
// RENDER: CALENDAR
// ═══════════════════════════════════════════════════════
function renderCal() {
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

  document.getElementById('expense-list-content').innerHTML = html;
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

  const entry = { id: Date.now(), name, type, amount, day, day2: type === 'quincenal' ? day2 : null };
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

function deleteExpense(src, id) {
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

function deleteDiscount(id, scope) {
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
// NOTIFICACIONES
// ═══════════════════════════════════════════════════════
const NOTIF_KEY = 'turnos_notif';
let notifEnabled = localStorage.getItem(NOTIF_KEY) === 'true';

function renderNotifStatus() {
  const btn    = document.getElementById('notif-toggle-btn');
  const status = document.getElementById('notif-status');
  if (!('Notification' in window)) {
    btn.textContent = 'No disponible';
    btn.style.cssText = 'background:#374151;color:#9ca3af;border-radius:20px;padding:7px 16px;font-size:12px;font-weight:700;cursor:not-allowed;font-family:Outfit,sans-serif;border:none;';
    status.textContent = 'Tu dispositivo no soporta notificaciones.';
    return;
  }
  if (notifEnabled && Notification.permission === 'granted') {
    btn.textContent = 'Desactivar 🔕';
    btn.style.cssText = 'background:#7f1d1d;color:#fca5a5;border-radius:20px;padding:7px 16px;font-size:12px;font-weight:700;cursor:pointer;font-family:Outfit,sans-serif;border:none;';
    const tom = new Date(today); tom.setDate(tom.getDate() + 1);
    const s   = SHIFTS[effShift(tom.getFullYear(), tom.getMonth(), tom.getDate())];
    status.innerHTML = `✅ Activadas · Mañana: <b style="color:${s.color}">${s.icon} ${s.label}</b>`;
  } else {
    btn.textContent = 'Activar 🔔';
    btn.style.cssText = 'background:#14532d;color:#6ee7b7;border-radius:20px;padding:7px 16px;font-size:12px;font-weight:700;cursor:pointer;font-family:Outfit,sans-serif;border:none;';
    status.textContent = Notification.permission === 'denied'
      ? '⚠️ Bloqueadas en tu navegador. Actívalas en Configuración.'
      : 'Desactivadas';
  }
}

async function toggleNotifications() {
  if (!('Notification' in window)) { toast('Tu dispositivo no soporta notificaciones'); return; }
  if (notifEnabled) {
    notifEnabled = false;
    localStorage.setItem(NOTIF_KEY, 'false');
    toast('🔕 Notificaciones desactivadas');
    renderNotifStatus();
    return;
  }
  const perm = await Notification.requestPermission();
  if (perm === 'granted') {
    notifEnabled = true;
    localStorage.setItem(NOTIF_KEY, 'true');
    scheduleNotification();
    toast('🔔 Notificaciones activadas');
  } else {
    toast('⚠️ Permiso denegado. Actívalo en configuración del navegador.');
  }
  renderNotifStatus();
}

function scheduleNotification() {
  if (!notifEnabled || Notification.permission !== 'granted') return;
  const now  = new Date();
  const fire = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 20, 0, 0);
  if (fire <= now) fire.setDate(fire.getDate() + 1);
  setTimeout(() => {
    const tom = new Date(); tom.setDate(tom.getDate() + 1);
    const eff = effShift(tom.getFullYear(), tom.getMonth(), tom.getDate());
    const s   = getShiftStyle(eff);
    const body = eff !== 'DESCANSO'
      ? `Tu turno de mañana es ${s.icon} ${s.label}`
      : '😴 Mañana es día de descanso';
    new Notification('📅 Mis Turnos — Mañana', { body, icon: 'https://api.iconify.design/twemoji:calendar.svg' });
    scheduleNotification();
  }, fire - now);
}

if (notifEnabled && Notification.permission === 'granted') scheduleNotification();

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

  const entry = { id: Date.now(), name, type, amount, day, day2: type === 'quincenal' ? day2 : null };
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

function deleteIncome(src, id) {
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
  // Add extras button before income list
  const extrasHtml = `<div style="background:linear-gradient(135deg,#1c1917,#292524);border:1px solid rgba(245,158,11,0.25);
    border-radius:14px;padding:14px;margin-bottom:12px;cursor:pointer;position:relative;overflow:hidden"
    onclick="openExtrasModal(${Y},${M})">
    <div style="position:absolute;top:0;left:0;right:0;height:2px;background:linear-gradient(90deg,#f59e0b,#fbbf24,transparent)"></div>
    <div style="display:flex;justify-content:space-between;align-items:center">
      <div>
        <div style="font-size:12px;font-weight:700;color:#fbbf24;letter-spacing:0.5px">⏰ EXTRAS Y RECARGOS</div>
        <div style="font-size:11px;color:#92400e;margin-top:2px">${getMonthExtras(Y,M).length > 0 ? getMonthExtras(Y,M).length + ' concepto(s) registrado(s)' : 'Horas extra, nocturnos, festivos...'}</div>
      </div>
      <div style="display:flex;align-items:center;gap:8px">
        ${getMonthExtrasTotal(Y,M) > 0 ? `<span style="color:#fbbf24;font-weight:700;font-size:15px">+${fmt(getMonthExtrasTotal(Y,M))}</span>` : ''}
        <div style="background:rgba(245,158,11,0.15);border:1px solid rgba(245,158,11,0.3);color:#fbbf24;
          border-radius:8px;padding:5px 10px;font-size:12px;font-weight:600">+ Agregar</div>
      </div>
    </div>
  </div>`;
  document.getElementById('income-list-content').innerHTML = extrasHtml + html;
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

  debts.push({ id: Date.now(), name, freq, total, cuota, day, day2: freq === 'quincenal' ? day2 : null, paid, startY: Y, startM: M });
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

function getMonthDebtPayment(y, m) {
  // Solo suma lo que fue registrado manualmente ese mes en payments[]
  const mk = monthKey(y, m);
  let total = 0;
  debts.forEach(d => {
    const payments = d.payments || [];
    payments.forEach(p => { if (p.mk === mk) total += p.amount; });
  });
  return total;
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
  debt.payments.push({ mk, amount: toApply, y: Y, m: M, quincena });
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

function deleteDebt(id) {
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
  document.getElementById('debt-list-content').innerHTML = html;
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
  if (!monthly || monthly <= 0) { toast('⚠️ Ingresa el valor del aporte'); return; }
  if (freq === 'quincenal' && (!day || day < 1 || day > 15)) { toast('⚠️ El día Q1 debe ser entre 1 y 15'); return; }
  if (freq === 'monthly' && (!day || day < 1 || day > 31)) { toast('⚠️ Indica el día del mes (1-31)'); return; }
  if (freq === 'quincenal' && (!day2 || day2 < 16 || day2 > 31)) { toast('⚠️ El día Q2 debe ser entre 16 y 31'); return; }

  savings.push({
    id: Date.now(), name, freq: freq || 'monthly', goal, monthly, saved, day,
    day2: freq === 'quincenal' ? day2 : null,
    startY: Y, startM: M
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
  const sy = (s.startY != null && s.startY > 0) ? s.startY : today.getFullYear();
  const sm = (s.startY != null && s.startY > 0) ? (s.startM != null ? s.startM : today.getMonth()) : today.getMonth();
  if ((Y * 12 + M) < (sy * 12 + sm)) { toast('⚠️ Este ahorro aún no había iniciado en este mes'); return; }
  const freq = s.freq || 'monthly';
  const mk   = monthKey(Y, M);
  if (!s.payments) s.payments = [];
  const paymentsThisMonth = s.payments.filter(p => p.mk === mk);

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
  const toApply = Math.min(amount, s.goal - (s.saved || 0));
  if (toApply <= 0) return;
  s.saved = (s.saved || 0) + toApply;

  let label = null;
  if (freq === 'quincenal') label = paymentsThisMonth.length === 0 ? 'Q1' : 'Q2';
  if (freq === 'daily')     label = `Día ${paymentsThisMonth.length + 1}`;

  s.payments.push({ mk, amount: toApply, y: Y, m: M, label });
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

function deleteSaving(id) {
  savings = savings.filter(s => s.id !== id);
  saveSavings(); renderSavings(); renderResumen();
  toast('🗑️ Meta eliminada');
}

function renderSavings() {
  const currIdx2 = Y * 12 + M;
  const visible2 = savings.filter(s => {
    const sy = (s.startY != null && s.startY > 0) ? s.startY : today.getFullYear();
    const sm = (s.startY != null && s.startY > 0) ? (s.startM != null ? s.startM : today.getMonth()) : today.getMonth();
    if ((sy * 12 + sm) > currIdx2) return false; // antes del inicio
    // Si está completada, solo mostrar el mes exacto en que se completó
    const isDone = (s.goal - (s.saved || 0)) <= 0;
    if (isDone) {
      let cy = s.completedY, cm = s.completedM;
      if (cy == null && s.payments && s.payments.length > 0) {
        const last = s.payments.reduce((a, b) => (a.y * 12 + a.m) >= (b.y * 12 + b.m) ? a : b);
        cy = last.y; cm = last.m;
      }
      if (cy != null) return (cy * 12 + cm) === currIdx2;
    }
    return true;
  });
  const active   = visible2.filter(s => (s.goal - (s.saved || 0)) > 0);
  const achieved = visible2.filter(s => (s.goal - (s.saved || 0)) <= 0);
  const totalContrib = getMonthSavingsTotal(Y, M);

  const savCard = (s) => {
    const saved      = s.saved || 0;
    const pending    = s.goal - saved;
    const pct        = Math.min(Math.round((saved / s.goal) * 100), 100);
    const isDone     = pending <= 0;
    const freq       = s.freq || 'monthly';
    const monthsLeft = isDone ? 0 : (freq === 'daily'
      ? Math.ceil(pending / (s.monthly * 30))
      : freq === 'quincenal'
        ? Math.ceil(pending / (s.monthly * 2))
        : Math.ceil(pending / s.monthly));
    const mk = monthKey(Y, M);
    // Filtro: no mostrar botón en meses anteriores al inicio
    const _sy = (s.startY != null && s.startY > 0) ? s.startY : today.getFullYear();
    const _sm = (s.startY != null && s.startY > 0) ? (s.startM != null ? s.startM : today.getMonth()) : today.getMonth();
    const savStartIdx = _sy * 12 + _sm;
    const currIdx     = Y * 12 + M;
    const beforeStart = currIdx < savStartIdx;
    const paymentsThisMonth = (s.payments || []).filter(p => p.mk === mk).length;
    const maxPerMonth = freq === 'daily' ? new Date(Y, M + 1, 0).getDate() : freq === 'quincenal' ? 2 : 1;
    const contributedThisMonth = paymentsThisMonth >= maxPerMonth;
    // Etiqueta del botón según frecuencia y progreso
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
    const historial = isDone && (s.payments || []).length > 0
      ? `<div style="margin-top:10px;border-top:1px solid rgba(16,185,129,0.2);padding-top:8px">
          <div style="font-size:10px;color:#34d399;font-weight:600;letter-spacing:1px;margin-bottom:6px">HISTORIAL DE APORTES</div>
          ${[...(s.payments)].sort((a,b)=>(a.y*12+a.m)-(b.y*12+b.m)).map(p =>
            `<div style="display:flex;justify-content:space-between;font-size:11px;color:#94a3b8;padding:2px 0">
              <span>${MONTHS[p.m]} ${p.y}${p.label ? ' · ' + p.label : ''}</span>
              <span style="color:#6ee7b7;font-weight:600">${fmt(p.amount)}</span>
            </div>`
          ).join('')}
        </div>`
      : '';
    return `<div class="saving-card" style="${isDone ? 'opacity:0.75' : ''}">
      <div class="debt-card-header">
        <div>
          <div class="debt-name">${s.name}</div>
          <div class="debt-meta">📅 ${freqLabel}${s.freq === 'quincenal' ? ` · Días ${s.day} (Q1) y ${s.day2} (Q2)` : s.freq === 'daily' ? '' : ` · Día ${s.day}`} · ${fmt(s.monthly)}${s.freq === 'daily' ? '/día' : s.freq === 'quincenal' ? '/quincena' : '/mes'}</div>
          ${!isDone ? `<div class="debt-meta" style="color:#60a5fa;margin-top:2px">~${monthsLeft} mes${monthsLeft !== 1 ? 'es' : ''} para la meta</div>` : ''}
        </div>
        <div style="text-align:right">
          <div class="debt-amount total">${fmt(s.goal)}</div>
          <div class="debt-amount" style="color:${isDone ? 'var(--green)' : '#60a5fa'};font-size:16px">${isDone ? '🎯 ¡Logrado!' : fmt(pending) + ' falta'}</div>
          ${saved > 0 ? `<div class="debt-amount paid">Ahorrado: ${fmt(saved)}</div>` : ''}
        </div>
      </div>
      <div class="saving-progress-bar">
        <div class="saving-progress-fill" style="width:${pct}%${isDone ? ';background:linear-gradient(90deg,#10b981,#34d399)' : ''}"></div>
      </div>
      <div class="saving-progress-label">
        <span>${pct}% alcanzado</span>
        <span>${fmt(saved)} / ${fmt(s.goal)}</span>
      </div>
      ${historial}
      <div class="debt-footer" style="margin-top:${isDone ? '4px' : '10px'}">
        <div>
          <div class="debt-cuota-info">Aporte ${freqLabel.toLowerCase()}</div>
          <div class="debt-cuota-val" style="color:#60a5fa">${fmt(s.monthly)}</div>
        </div>
        <div style="display:flex;gap:6px">
          ${(!isDone && !beforeStart) ? `<button onclick="contributeToSaving(${s.id})" style="background:${contributedThisMonth ? 'rgba(99,102,241,0.12)' : 'rgba(59,130,246,0.12)'};border:1px solid ${contributedThisMonth ? 'rgba(99,102,241,0.3)' : 'rgba(59,130,246,0.3)'};color:${contributedThisMonth ? '#a5b4fc' : '#93c5fd'};border-radius:8px;padding:6px 10px;font-size:11px;cursor:pointer;font-family:'Outfit',sans-serif;font-weight:600">${btnLabel}</button>` : ''}
          <button onclick="deleteSaving(${s.id})" class="exp-del">✕</button>
        </div>
      </div>
    </div>`;
  };

  let html = '';
  if (visible2.length === 0) {
    html = '<div class="empty-state" style="color:#374151;padding:20px">No hay metas de ahorro.<br><span style="font-size:20px">🏦</span></div>';
  } else {
    if (active.length > 0) {
      html += `<div class="section-title">🎯 Metas Activas</div>`;
      active.forEach(s => html += savCard(s));
    }
    if (achieved.length > 0) {
      html += `<div class="section-title">✅ Metas Alcanzadas</div>`;
      achieved.forEach(s => html += savCard(s));
    }
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
    if (movPanel === 'gastos')      renderExpenses();
    if (movPanel === 'ingresos')    renderIncomes();
    if (movPanel === 'ahorros')     renderSavings();
    if (movPanel === 'deudas')      renderDebts();
    if (movPanel === 'descuentos')  renderDiscounts();
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

function removeCycleShiftType(id) {
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

function removeCycleSlot(i) {
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

function removeRotShiftType(id) {
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

function removeRotSlot(i) {
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

function openExtrasModal(y, m) {
  const mk     = monthKey(y, m);
  const extras = getMonthExtras(y, m);
  const baseRate = salary ? (salary.baseRate || RATE) : RATE;

  const existing = document.getElementById('extras-modal');
  if (existing) existing.remove();

  const modal = document.createElement('div');
  modal.id = 'extras-modal';
  modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.75);z-index:9999;display:flex;align-items:flex-end;justify-content:center;padding:0';

  const extrasList = extras.length > 0
    ? extras.map(e => {
        const type = EXTRA_TYPES.find(t => t.id === e.type) || EXTRA_TYPES[4];
        return `<div style="display:flex;align-items:center;justify-content:space-between;
          padding:10px 12px;background:rgba(15,23,42,0.6);border:1px solid rgba(99,102,241,0.15);
          border-radius:10px;margin-bottom:6px">
          <div>
            <div style="font-size:13px;color:${type.color};font-weight:600">${type.icon} ${type.label}</div>
            <div style="font-size:11px;color:#64748b">${e.desc || ''} · ${e.qty} ${e.qty === 1 ? 'unidad' : 'unidades'} × ${fmt(e.unitValue)}</div>
          </div>
          <div style="display:flex;align-items:center;gap:8px">
            <span style="color:#6ee7b7;font-weight:700;font-size:14px">${fmt(e.qty * e.unitValue)}</span>
            <button onclick="deleteExtra('${mk}','${e.id}')"
              style="background:rgba(239,68,68,0.12);border:1px solid rgba(239,68,68,0.3);color:#f87171;
                     border-radius:6px;padding:4px 8px;font-size:11px;cursor:pointer">✕</button>
          </div>
        </div>`;
      }).join('')
    : '<div style="text-align:center;color:#475569;padding:12px 0;font-size:13px">Sin extras registrados este mes</div>';

  modal.innerHTML = `
    <div style="background:#0f172a;border:1px solid rgba(99,102,241,0.2);border-radius:20px 20px 0 0;
      padding:24px;width:100%;max-width:480px;max-height:90vh;overflow-y:auto">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">
        <div style="font-size:16px;font-weight:700;color:#e2e8f0">⏰ Extras — ${MONTHS[m]} ${y}</div>
        <button onclick="document.getElementById('extras-modal').remove()"
          style="background:rgba(100,116,139,0.15);border:1px solid rgba(100,116,139,0.3);color:#94a3b8;
                 border-radius:8px;padding:6px 10px;font-size:13px;cursor:pointer">✕</button>
      </div>

      <div id="extras-list" style="margin-bottom:16px">${extrasList}</div>

      <div style="border-top:1px solid rgba(99,102,241,0.2);padding-top:16px;margin-bottom:4px">
        <div style="font-size:12px;color:#6366f1;font-weight:600;margin-bottom:12px">+ AGREGAR EXTRA</div>

        <div style="margin-bottom:10px">
          <label class="form-label">Tipo</label>
          <select class="form-select" id="extra-type" onchange="updateExtraUnit()">
            ${EXTRA_TYPES.map(t => `<option value="${t.id}">${t.icon} ${t.label}</option>`).join('')}
          </select>
        </div>

        <div style="display:flex;gap:8px;margin-bottom:10px">
          <div style="flex:1">
            <label class="form-label" id="extra-qty-label">Cantidad (horas)</label>
            <input class="form-input" id="extra-qty" type="number" placeholder="1" min="0.5" step="0.5" inputmode="decimal" style="margin:0"/>
          </div>
          <div style="flex:1">
            <label class="form-label" id="extra-unit-label">Valor por hora ($)</label>
            <input class="form-input" id="extra-unit" type="number" placeholder="${baseRate}" inputmode="numeric" style="margin:0"/>
          </div>
        </div>

        <div style="margin-bottom:12px">
          <label class="form-label">Descripción (opcional)</label>
          <input class="form-input" id="extra-desc" type="text" placeholder="ej. Turno extra el 15..." style="margin:0"/>
        </div>

        <button onclick="addExtra(${y},${m})"
          style="width:100%;background:linear-gradient(135deg,#312e81,#4f46e5);border:1px solid rgba(99,102,241,0.4);
                 color:#e0e7ff;border-radius:10px;padding:11px;font-size:13px;font-weight:700;
                 cursor:pointer;font-family:'Outfit',sans-serif">✅ Agregar extra</button>
      </div>
    </div>`;

  document.body.appendChild(modal);
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

function addExtra(y, m) {
  const type      = document.getElementById('extra-type').value;
  const qty       = parseFloat(document.getElementById('extra-qty').value);
  const unitValue = parseFloat(document.getElementById('extra-unit').value);
  const desc      = document.getElementById('extra-desc').value.trim();
  const baseRate  = salary ? (salary.baseRate || RATE) : RATE;

  if (!qty || qty <= 0)            { toast('⚠️ Ingresa la cantidad'); return; }
  if (!unitValue || unitValue <= 0){ toast('⚠️ Ingresa el valor'); return; }

  const mk = monthKey(y, m);
  if (!monthExtras[mk]) monthExtras[mk] = [];
  monthExtras[mk].push({ id: Date.now() + '', type, qty, unitValue, desc });
  saveExtras();
  toast(`✅ Extra registrado · ${fmt(qty * unitValue)}`);
  document.getElementById('extras-modal').remove();
  openExtrasModal(y, m);
  renderResumen();
}

function deleteExtra(mk, id) {
  if (!monthExtras[mk]) return;
  monthExtras[mk] = monthExtras[mk].filter(e => e.id !== id);
  if (monthExtras[mk].length === 0) delete monthExtras[mk];
  saveExtras();
  const [yr, mo] = mk.split('-').map(Number);
  document.getElementById('extras-modal').remove();
  openExtrasModal(yr, mo - 1);
  renderResumen();
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
renderResumen();
