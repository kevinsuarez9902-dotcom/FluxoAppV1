// Motor financiero de Fluxo. Cálculos puros que reciben su contexto por parámetros.
// No conoce DOM, localStorage ni variables globales de app.js.
const FinanceEngine = (() => {
  function calcMonth(y, m, context) {
    if (context.isBeforeControl(y, m)) {
      return { q1earn:0, q2earn:0, totalEarn:0, totalHours:0, q1h:0, q2h:0,
               q1a:0, q2a:0, q1p:0, q2p:0, absentCount:0,
               expenses:0, discounts:0, incomes:0, debts:0, savingsContrib:0,
               q1disc:0, q2disc:0, monthDisc:0, balance:0 };
    }
    const earn     = context.calcMonthEarnings(y, m);
    const expData  = context.getMonthExpenses(y, m);
    const discData = context.getMonthDiscounts(y, m);
    const incData  = context.getMonthIncomes(y, m);
    const debtAmt  = context.getMonthDebtPayment(y, m);
    const savAmt   = context.getMonthSavingsTotal(y, m);
    const extrasTotal = context.getMonthExtrasTotal(y, m);
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

  function computeAccumulated(y, m, context) {
    const first = context.getFirstDataMonth();
    if (!first) return null;

    const targetIdx = Number(y) * 12 + Number(m);
    const firstIdx = Number(first.y) * 12 + Number(first.m);
    if (targetIdx < firstIdx) return null;

    let cy = first.y, cm = first.m;
    let accum = 0;
    const balances = [];

    while ((cy * 12 + cm) <= targetIdx) {
      const mk = context.monthKey(cy, cm);
      const c = context.calcMonth(cy, cm);
      accum += Number(c.balance) || 0;
      balances.push({ mk, value: accum });

      cm++;
      if (cm > 11) { cm = 0; cy++; }
    }

    return { accumulated: accum, balances };
  }

  function getTotalSavedAmount(period, context) {
    return context.getSavedAmountAt(period.y, period.m);
  }

  function getTotalWealth(y, m, context) {
    return context.getAvailableBalance(y, m) + context.getSavedAmountAt(y, m);
  }

  function getMonthSummary(y, m, context) {
    const c = context.calcMonth(y, m);
    const available = context.getAvailableBalance(y, m);
    const saved = context.getSavedAmountAt(y, m);
    return {
      year: y,
      month: m,
      ...c,
      available,
      saved,
      totalWealth: available + saved
    };
  }

  return {
    calcMonth,
    computeAccumulated,
    getTotalSavedAmount,
    getTotalWealth,
    getMonthSummary
  };
})();
