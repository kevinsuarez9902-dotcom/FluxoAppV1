# Auditoría de arquitectura — Fluxo

Fecha de auditoría: 2026-07-31  
Alcance: inspección estática, sin cambios de comportamiento. La única modificación de esta entrega es este documento.

## Resumen ejecutivo

Fluxo es una PWA sin empaquetador: `index.html` carga, en este orden, `js/finance/financeStorage.js`, `js/finance/calculator.js`, `js/config.js`, `js/app.js` y `js/pwa.js`. La aplicación depende de variables y funciones globales; por ello el orden de carga es parte de su contrato actual.

El código operativo sigue concentrado mayormente en `js/app.js` (5.102 líneas físicas; además contiene bloques de compatibilidad añadidos hasta la marca V20). `FinanceStorage` ya centraliza la persistencia financiera y `FinanceCalculator` concentra los cálculos extraídos hasta ahora; `config.js` conserva el estado global como fachada temporal.

No se recomienda mover módulos antes de consolidar la persistencia. Especialmente, los bloques V10–V20 de ahorros/período deben preservarse primero como comportamiento observable y sustituirse sólo después de pruebas de regresión.

## Progreso de refactorización

### Entrega 1 — FinanceStorage (completada el 2026-07-31)

- `FinanceStorage` se carga antes de `config.js` y concentra las claves, valores predeterminados, carga inicial, guardado y migración de fechas de inicio.
- `config.js` ya no accede directamente a `localStorage`; conserva sus variables globales y funciones `save*` como adaptadores temporales para mantener el comportamiento de `app.js`.
- Las claves persistidas y su formato se mantienen sin cambios.
- Quedan fuera de esta entrega `pwa.js` (`app_version`) y la enumeración diagnóstica de V19 en `app.js`; no son parte de las operaciones financieras normales.

### Entrega 2 — Calculator: ahorro histórico (completada el 2026-07-31)

- Se creó `js/finance/calculator.js` como módulo de cálculos puros.
- Se centralizó el saldo de una meta y el total de ahorros por período.
- Se eliminaron las definiciones duplicadas de total de ahorros y patrimonio que sobrescribían el cálculo histórico.
- Se corrigió el caso de regresión: una meta creada en julio aporta $0 a junio y los aportes sólo cuentan desde su período de registro.

### Entrega 3 — Calculator: ingresos y gastos (completada el 2026-07-31)

- Se movió el cálculo compartido de movimientos recurrentes mensuales, quincenales y diarios a `FinanceCalculator.getRecurringItems`.
- `getMonthExpenses` y `getMonthIncomes` quedaron como adaptadores de estado/UI.

### Entrega 4 — Calculator: descuentos y deudas (completada el 2026-07-31)

- Se movieron la selección de descuentos activos por mes y sus totales fijos/porcentuales al calculador.
- Se centralizó el cálculo de pagos de deuda registrados por mes.
- Las dos funciones duplicadas de `getMonthDebtPayment` ahora delegan en la misma implementación canónica; la eliminación física del segundo adaptador se realizará al extraer el módulo de deudas.

### Próxima entrega

- Extraer `financeEngine.js` para que `calcMonth` y los casos de uso financieros tengan un único punto de entrada.

## Inventario de archivos y carga

| Archivo | Responsabilidad actual | Observación |
|---|---|---|
| `index.html` | Estructura inicial, plantillas/modales y orden de scripts | Contiene llamadas `onclick` globales; los módulos extraídos deberán seguir exponiendo adaptadores globales temporalmente. |
| `js/config.js` | Constantes, claves, estado mutable, carga/migración y funciones `save*` | Es el principal acceso directo restante a `localStorage`. |
| `js/finance/financeStorage.js` | Wrapper JSON y raw de `localStorage` | Ya se carga antes de `app.js`; debe convertirse en la única puerta de persistencia. |
| `js/app.js` | Dominio financiero, UI, render, navegación, PDF, notificaciones y parches | Responsabilidades mezcladas y funciones duplicadas. |
| `js/pwa.js` / `sw.js` | Registro PWA, actualización y caché | `pwa.js` conserva su propia clave `app_version`; dejarla fuera de la primera migración financiera. |
| `style.css`, `manifest.json`, `icons/` | Presentación y PWA | Fuera del alcance de la refactorización financiera. |

## Estado global y modelo de datos

### Constantes y claves

`config.js` declara `START`, `CYCLE`, `RATE`, `HOURS`, `PSHIFT`, `INCAP_RATE`, nombres de meses/días y estilos `SHIFTS`. Las claves persistidas son:

| Clave | Estado asociado | Forma esperada |
|---|---|---|
| `turnos_ov2` | `overrides` | objeto por fecha `YYYY-MM-DD` |
| `turnos_exp` / `turnos_exp_m` | `expenses` / `monthExpenses` | lista global / objeto por mes |
| `turnos_disc` / `turnos_disc_m` | `discounts` / `discountMonths` | lista global / activación por mes |
| `turnos_accum` | `accumBalances` | objeto por mes |
| `turnos_inc` / `turnos_inc_m` | `incomes` / `monthIncomes` | lista global / objeto por mes |
| `turnos_debts` | `debts` | lista de deudas con pagos |
| `turnos_savings` | `savings` | lista de metas con pagos/movimientos |
| `turnos_savings_events` / `turnos_savings_spent` | eventos/historial de ahorro | listas |
| `turnos_control_start` | `controlStart` | `{ y, m }` o `null` |
| `turnos_schedule` | `schedule` | configuración de turnos |
| `turnos_salary` | `salary` | configuración salarial |
| `turnos_extras` | `monthExtras` | objeto por mes |
| `turnos_notif` | `notifEnabled` | cadena raw `true`/`false` |
| `fluxo_user_name` | nombre visible | cadena raw |
| `fluxo_global_period` (V13) | período global | JSON `{ year, month }` |
| `app_version` | actualización PWA | cadena; propiedad de `pwa.js` |

### Variables mutables de aplicación

`Y`, `M` y `selKey` representan el período y día seleccionados. También son globales los datos cargados (`overrides`, `expenses`, `monthExpenses`, `discounts`, `discountMonths`, `accumBalances`, `incomes`, `monthIncomes`, `debts`, `savings`, `savingsEvents`, `savingsSpent`, `controlStart`, `schedule`, `salary`, `monthExtras`).

Hay estado exclusivamente de UI: `movPanel`, `expenseScope`, `discScope`, `incomeScope`, `partialHoursSelected`, selección múltiple, estado de configuración de turnos (`_schedType`, `_cycle*`, `_rot*`), navegación de paneles y tipo salarial. No debe pasar al motor financiero.

## Inventario funcional de `app.js`

Las ubicaciones son líneas actuales de `js/app.js`; pueden cambiar en una extracción posterior.

| Área | Funciones principales | Dependencias/efecto |
|---|---|---|
| Turnos y salario | `getShiftTypeById` (28), `origShift` (33), `isRestShift` (58), `effShift` (66), `getShiftHours` (80), `getShiftStyle` (90), `effHours` (125), `getIncapValue` (147), `effEarnings` (153), `getEffectiveRate` (4247) | Leen `schedule`, `salary`, `overrides`, constantes de configuración. Son candidatas a `calculator.js`. |
| Utilidades/UI común | `toast` (170), `key`, `monthKey`, `dim`, `fday`, `fmt`, `fmtLabel` (en `config.js`) | Formato y DOM; `fmt`/fechas pueden quedar como utilidades puras. |
| Gastos | `getMonthExpenses` (180), `hasDayExpense` (218), `renderExpenses` (1080), scopes, `addExpense` (1168), `deleteExpense` (1246) | Lee/escribe listas globales y llama `calcMonth`/renders. Extraer como módulo completo, no sólo render. |
| Ingresos | `getMonthIncomes` (225), scopes, `addIncome` (1714), `deleteIncome` (1742), `renderIncomes` (1756), `renderIncomesTurnos` (3654) | Incluye ingresos manuales y visualización de ingresos por turnos. |
| Deudas | `getMonthDebtPayment` (264 y duplicada en 1846), frecuencia, `addDebt`, pagos, modal, borrado y `renderDebts` (1927) | Hay dos definiciones; la última sobrescribe la primera. Consolidar con pruebas antes de extraer. |
| Ahorros | `getSavedAmountAt` (370), totales/disponible/patrimonio (428–457; definiciones duplicadas), eventos, frecuencia, altas, aportes, edición, retiro, completar, borrar, `renderSavings` (2403), `renderSavingsHistory` (2518 y 3691) | Es el dominio de mayor riesgo y tiene parches V10–V20. Extraer después de ingresos/gastos/deudas. |
| Descuentos | `getMonthDiscData` (473), `getMonthDiscounts` (481), scopes, `addDiscount`, `deleteDiscount`, `toggleDiscountMonth`, `renderDiscounts` (1343) | Datos globales + activación mensual. |
| Agregación financiera | `calcMonthEarnings` (551), `getMonthSavingsTotal` (597), `isBeforeControl` (619), `calcMonth` (624), acumulados (279–363), disponible y patrimonio | Hoy mezcla reglas, lectura de estado y algunos ajustes de historial. Debe convertirse en `calculator.js` + `financeEngine.js`. |
| Dashboard y calendario | `renderResumen` (655), `renderCal` (975), `renderEstadisticas` (4261), cambio de período (2567–2571), detalle expandible | Renderizan y también invocan cálculos. El dashboard debe consumir un resumen inmutable del motor. |
| Turnos manuales | modal de día (1499–1681), selección múltiple (3028–3180) | Modifican `overrides`, persisten y vuelven a renderizar. Requieren un caso de uso del motor para no editar saldo. |
| Extras | `getMonthExtras`, total, unidad, alta/borrado y panel (3923–3975) | Deben entrar en el cálculo de ingresos a través del motor. |
| Configuración | horario (3195–3396 y modal 4047), salario (3995–4232), inicio de control (4531) | Modifican `schedule`, `salary`, `controlStart`; deben usar repositorio/engine. |
| Navegación | `switchTab`, `switchMov`, paneles financieros y subpaneles (3502–3865) | UI pura, aunque dispara renders globales. |
| Servicios UI | notificaciones (1427–1497), PDF (2590–3027, 3442), nombre/saludo (3886–3912) | No son parte del motor. Extraer PDF tras dashboard, como se solicitó. |

## Dependencias y flujo de datos actual

```text
Eventos inline / formularios
        ↓
Funciones globales en app.js
        ↓
Mutación de arrays globales + save*()
        ↓
localStorage
        ↓
calcMonth() / renderResumen() / reRender()
        ↓
HTML generado con innerHTML
```

Los consumidores centrales son `renderResumen`, `renderCal`, `renderEstadisticas`, paneles de finanzas y ambos PDF. Todos dependen, directa o indirectamente, de `calcMonth(y, m)` y de los helpers de ahorro/deuda/ingreso/gasto.

Flujo objetivo de la migración:

```text
UI (adaptadores del módulo)
        ↓
FinanceEngine (casos de uso y lectura de estado mensual)
        ↓
Calculator (funciones puras)
        ↓
FinanceStorage (repositorio y migraciones)
        ↓
localStorage
```

## Accesos a `localStorage`

`financeStorage.js` ya ofrece `get`, `set`, `remove`, `exists`, `clear`, `getRaw` y `setRaw`. Los accesos directos restantes son:

- `config.js:53–96`: carga inicial de todos los datos de dominio.
- `config.js:104–109`: migración de fecha de deudas y ahorros.
- `config.js:113–128`: las 15 funciones `save*`.
- `app.js:5415` (bloque V19): enumeración directa `localStorage.key(i)` para diagnóstico de ahorros.
- `pwa.js:48–50`: versión de la aplicación; no es dato financiero y se mantiene aislada.

Por tanto, el paso 2 debe crear métodos con nombre de dominio (`loadState`, `saveExpenses`, `saveSavings`, etc.), cambiar `config.js` para usarlos y mantener los `save*` como adaptadores temporales para no romper llamadas existentes. La enumeración diagnóstica V19 necesita una API de listado en `FinanceStorage` si se conserva.

## Bloques de compatibilidad y riesgos

1. `getMonthDebtPayment`, `getTotalSavedAmount`, `getAvailableBalance`, `getTotalWealth` y `renderSavingsHistory` tienen definiciones repetidas. En JavaScript global prevalece la última definición; quitar una sin comparar comportamiento puede cambiar resultados.
2. V10–V12 normalizan y calculan contribuciones de metas; V13–V14 mantienen un período global e introducen `FluxoFinancialEngine`; V15–V20 implementan seis variantes de cálculo histórico de ahorro. Son capas acumuladas, no módulos independientes.
3. V19 sigue consultando directamente `localStorage`; contradice la arquitectura objetivo y será el último consumidor de persistencia a adaptar.
4. Los atributos `onclick` de HTML y el HTML generado en `app.js` requieren que los nombres globales se mantengan durante la transición. Cada módulo debe exportar y, temporalmente, registrar los adaptadores globales necesarios.
5. La aplicación no tiene pruebas automatizadas detectadas. Antes de extraer, conviene definir una matriz manual de regresión con datos de prueba exportables, especialmente para mes anterior/siguiente, ahorro con retiro y deuda pagada parcialmente.

## Orden de extracción recomendado

1. **Línea base de regresión.** Documentar escenarios y capturar datos de ejemplo; no cambiar UI.
2. **`financeStorage.js`.** Convertir la carga, migraciones y los `save*` de `config.js` a repositorio, manteniendo las variables globales como fachada temporal. Verificar que no queda acceso directo financiero a `localStorage`.
3. **`calculator.js`.** Mover primero helpers puros de fecha, turno, salario, ingresos, gastos, descuentos, deudas y ahorro. Sin DOM, estado global ni almacenamiento.
4. **`financeEngine.js`.** Crear `getMonthSummary(y,m)` y casos de uso de escritura. `calcMonth` debe quedar como adaptador temporal que delega aquí.
5. **Módulos completos.** En el orden: `income.js`, `expenses.js`, `savings.js`, `debts.js`, `discounts.js`. Cada uno contiene captura de formulario, validación, caso de uso del engine y render de su panel; no modifica `saldoTotal` ni `accumBalances` directamente.
6. **`historyEngine.js` y `summaryEngine.js`.** Consolidar V10–V20 en una única fuente canónica, una vez cubierta la regresión de ahorros históricos.
7. **Dashboard/calendario y PDF.** Consumir exclusivamente resúmenes del engine; mover PDF luego de estabilizar las formas del resumen.
8. **Reducir `app.js`.** Dejar inicialización, composición de módulos y compatibilidad temporal de eventos inline. Eliminar adaptadores sólo después de migrar los `onclick` a listeners.

## Criterios de aceptación por entrega

- No se cambia HTML, CSS ni nombres de claves persistidas sin una migración explícita y reversible.
- La UI no suma ni resta valores financieros: recibe un resumen del engine.
- Ningún módulo muta `accumBalances`, saldo disponible o patrimonio; registra operaciones mediante `FinanceEngine`.
- Ningún código financiero accede directamente a `localStorage` fuera de `FinanceStorage`.
- Código duplicado, parches obsoletos y comandos sin uso se eliminan como parte de cada extracción, pero sólo después de que una implementación canónica los reemplace, todas las referencias apunten a ella y pase la prueba de regresión aplicable. Nunca se borra código por apariencia o tamaño únicamente.
- Se valida sintaxis de los scripts y se ejecuta la matriz manual: navegación mensual, configuración salarial/turnos, alta/edición/borrado de cada movimiento, deudas, aportes/retiros de ahorro, dashboard y ambos PDF.

## Caso de regresión registrado: ahorro histórico

**Estado:** error conocido pendiente de corregir durante la consolidación de `historyEngine.js` y `savings.js`.

Escenario reproducible:

1. El primer uso de la app y la creación de una meta ocurre en julio.
2. Se configura la meta con saldo inicial de $200.000 y una meta de $1.000.000.
3. Se registra una cuota/aporte durante julio.
4. Al navegar a junio (o cualquier período anterior a julio), el ahorro no debe existir ni contribuir al saldo disponible, saldo total o patrimonio.

Reglas que debe cumplir la corrección:

- El saldo inicial pertenece al período de creación de la meta, no a períodos anteriores.
- Un aporte sólo cuenta desde el mes en el que fue registrado en adelante.
- Una meta creada después del período consultado debe aportar exactamente $0, incluso si tiene saldo inicial o movimientos posteriores.
- La navegación a meses anteriores no puede modificar ni recalcular datos persistidos de meses posteriores.

Este caso cubre directamente las capas V10–V20 identificadas en la auditoría; se implementará una única función canónica de saldo por período antes de retirar esos parches.

## Verificación realizada

- Revisión de estructura, scripts cargados, inventario de funciones, estado Git y referencias a almacenamiento.
- Árbol de trabajo inicialmente limpio; esta auditoría añade `AUDIT.md`.
- Validación de sintaxis aprobada con `node --check` para `js/config.js`, `js/finance/financeStorage.js` y `js/app.js`.

---

# ACTUALIZACIÓN 2026-08-15 — REFACTORIZACIÓN FINANCIERA 6A–6F FINALIZADA

## Estado final de la capa financiera

La refactorización financiera cubierta por los entregables 6A, 6B, 6C, 6D, 6E y 6F queda **FINALIZADA**. Con esta actualización se cierra la fase de extracción de la capa financiera; no se continuará con nuevos entregables de extracción (6G, 6H, etc.).

## Entregables completados

| Entregable | Cambio | Resultado |
|---|---|---|
| 6A | Extracción mínima de `calcMonth(y, m)` a `FinanceEngine.calcMonth(y, m, context)` con adaptador global en `app.js` | Lógica idéntica; regresión dinámica aprobada |
| 6B | `FinanceEngine.computeAccumulated(y, m, context)` puro; `getAccumulatedBalance` conserva mutación de `accumBalances` + `saveAccum()` | Cálculo separado de persistencia |
| 6C | `getTotalSavedAmount` y `getTotalWealth` delegados a `FinanceEngine`; `getAvailableBalance` permanece en `app.js` | Adaptadores delgados sin duplicación |
| 6D | `FinanceEngine.getMonthSummary(y, m, context)` + adaptador global `getMonthSummary(y, m)` | Punto de entrada único para el resumen mensual |
| 6E | `FluxoFinancialEngine.month` consume `getMonthSummary` | Primer consumidor migrado |
| 6F | `FluxoFinancialEngine.accumulated` consume `getMonthSummary` | Segundo consumidor migrado; `saveAccum` pasó de 2 escrituras redundantes a 1 |

## Arquitectura final de la capa financiera

```text
UI / adaptadores globales (app.js)
        ↓
FinanceEngine (calcMonth, computeAccumulated, getTotalSavedAmount, getTotalWealth, getMonthSummary)
        ↓
FinanceCalculator (funciones puras: recurrentes, deuda, descuentos, ahorro histórico)
        ↓
FinanceStorage (única puerta de persistencia)
        ↓
localStorage
```

## Regresión dinámica en navegador — APROBADA (manual, 2026-08-15)

La regresión dinámica se ejecutó manualmente en el navegador con `localStorage` real. Resultados confirmados:

- `getMonthSummary` vs `calcMonth`: **10/10 comparaciones `true`** (totalEarn, incomes, extrasTotal, expenses, discounts, debts, savingsContrib, available, saved, totalWealth).
- `FluxoFinancialEngine.month(Y, M)`: correcto, campos mapeados correctamente desde `getMonthSummary`.
- `FluxoFinancialEngine.accumulated(Y, M)`: correcto (`available`, `saved`, `totalWealth`).
- **Caso crítico de Ahorros:** meta creada en julio → **junio = 0, julio = 200.000**. Verificado.
- **Navegación Junio → Julio → Agosto → Junio:** correcta; cada mes muestra exclusivamente sus datos.
- CRUD de turnos, ingresos, gastos, deudas, descuentos, extras y ahorros: sin regresiones.
- Persistencia tras recargar: correcta; sin mezcla de datos entre meses.
- PDF mensual y PDF anual/renta: valores financieros coherentes.
- Consola: sin `ReferenceError`, `TypeError` ni errores relacionados con `FinanceEngine`.

## Componentes protegidos (NO modificar)

- Lógica histórica de Ahorros **V10–V20** (permanece intacta).
- `getSavedAmountAt` y `FinanceCalculator.getSavingsBalanceAt` (raíz del caso crítico julio ≠ junio).
- `FinanceEngine.computeAccumulated` (cálculo puro del acumulado).
- `getAccumulatedBalance` y `getAvailableBalance` (conservan mutación de `accumBalances` + `saveAccum()`).
- `FinanceStorage` (única puerta de persistencia).
- `calculator.js` (cálculos puros).
- `config.js` (estado global; sin refactorizar).

## Criterio de terminación cumplido

1. Fuente única de verdad para los cálculos financieros importantes: `FinanceEngine` + `FinanceCalculator`. ✅
2. `FluxoFinancialEngine` consume el motor. ✅
3. Separación razonable cálculo / persistencia / UI. ✅
4. Sin duplicación peligrosa de fórmulas. ✅
5. Sin escrituras nuevas en funciones de solo lectura. ✅
6. Ahorros históricos intactos; caso crítico (julio ≠ junio) garantizado. ✅
7. Accesos a `localStorage` solo en `FinanceStorage` (y `pwa.js` aislado). ✅
8. Regresión dinámica manual aprobada. ✅

**Conclusión: REFACTORIZACIÓN FINANCIERA 6A–6F FINALIZADA.**
