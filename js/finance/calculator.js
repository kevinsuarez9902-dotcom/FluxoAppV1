// Cálculos financieros puros. No conoce DOM, localStorage ni estado global.
const FinanceCalculator = (() => {
  function periodIndex(year, month) { return Number(year) * 12 + Number(month); }

  function paymentPeriodIndex(payment) {
    if (!payment) return null;
    if (payment.y != null && payment.m != null) return periodIndex(payment.y, payment.m);
    if (!payment.mk) return null;
    const parts = String(payment.mk).split('-').map(Number);
    return parts.length === 2 && Number.isFinite(parts[0]) && Number.isFinite(parts[1])
      ? periodIndex(parts[0], parts[1] - 1) : null;
  }

  function initialSavingAmount(saving) {
    const initialPayment = (saving.payments || []).find(payment => payment?.initial);
    if (initialPayment) return Number(initialPayment.amount) || 0;
    return Number(saving.initialBalance ?? saving.initialSaved ?? 0) || 0;
  }

  function isWithdrawal(payment) {
    const type = String(payment?.type ?? payment?.kind ?? '').toLowerCase();
    return type === 'withdrawal' || type === 'retiro' || type === 'withdraw';
  }

  function getSavingsBalanceAt(saving, year, month) {
    if (!saving) return 0;
    const target = periodIndex(year, month);
    if (saving.startY != null && saving.startM != null &&
        target < periodIndex(saving.startY, saving.startM)) return 0;
    if (saving.completed && saving.completedY != null && saving.completedM != null &&
        target >= periodIndex(saving.completedY, saving.completedM)) return 0;

    let balance = initialSavingAmount(saving);
    (saving.payments || []).forEach(payment => {
      if (!payment || payment.initial) return;
      const period = paymentPeriodIndex(payment);
      if (period == null || period > target) return;
      const amount = Math.abs(Number(payment.amount) || 0);
      balance += isWithdrawal(payment) ? -amount : amount;
    });
    return Math.max(0, balance);
  }

  function getSavingsTotalAt(savings, year, month) {
    return (Array.isArray(savings) ? savings : []).reduce(
      (total, saving) => total + getSavingsBalanceAt(saving, year, month), 0
    );
  }

  function getRecurringItems(globalItems, monthlyItems, year, month, daysInMonth, monthLabel, shouldInclude) {
    const allItems = [
      ...(globalItems || []).map(item => ({ ...item, _src: 'global' })),
      ...(monthlyItems || []).map(item => ({ ...item, _src: 'month' }))
    ];
    let total = 0;
    const items = [];
    allItems.forEach(item => {
      const sourceLabel = item._src === 'month' ? `Solo ${monthLabel} ${year}` : null;
      const add = (id, note, slot, day) => {
        if (typeof shouldInclude === 'function' && !shouldInclude(item, year, month, day, slot)) return;
        const amount = Number(item.amount) || 0;
        total += amount;
        items.push({ ...item, id, appliedAmount: amount, note: sourceLabel || note });
      };
      if (item.type === 'monthly') add(item.id, `Día ${item.day} · mensual`, 'monthly', parseInt(item.day));
      else if (item.type === 'quincenal') {
        const day1 = parseInt(item.day), day2 = parseInt(item.day2);
        if (day1 >= 1 && day1 <= 15) add(item.id, `Día ${day1} · Q1`, 'q1', day1);
        if (day2 >= 16 && day2 <= daysInMonth) add(`${item.id}_q2`, `Día ${day2} · Q2`, 'q2', day2);
      } else {
        const day = parseInt(item.day);
        if (day >= 1 && day <= daysInMonth) add(item.id, `Día ${day} · diario`, `d${day}`, day);
      }
    });
    return { total, items };
  }

  function getRecordedDebtPayment(debts, monthKey) {
    return (debts || []).reduce((total, debt) => total + (debt.payments || [])
      .filter(payment => payment.mk === monthKey)
      .reduce((sum, payment) => sum + (Number(payment.amount) || 0), 0), 0);
  }

  function getDiscountData(discounts, monthData) {
    const data = monthData || { disabled: [], extras: [] };
    const disabled = data.disabled || [];
    const activeGlobal = (discounts || []).filter(discount => !disabled.includes(discount.id));
    const extras = data.extras || [];
    return { activeGlobal, extras, disabled, allForMonth: [...activeGlobal, ...extras] };
  }

  function getDiscountTotals(discounts, earnings) {
    let q1disc = 0, q2disc = 0, monthDisc = 0;
    (discounts || []).forEach(discount => {
      const value = rate => discount.type === 'pct' ? (Number(discount.pct) / 100) * rate : Number(discount.fixed) || 0;
      if (discount.freq === 'quincenal') {
        q1disc += value(earnings.q1earn);
        q2disc += value(earnings.q2earn);
      } else monthDisc += value(earnings.totalEarn);
    });
    return { q1disc, q2disc, monthDisc, total: q1disc + q2disc + monthDisc };
  }

  return { periodIndex, paymentPeriodIndex, getSavingsBalanceAt, getSavingsTotalAt,
    getRecurringItems, getRecordedDebtPayment, getDiscountData, getDiscountTotals };
})();
