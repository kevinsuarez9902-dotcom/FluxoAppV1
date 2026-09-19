# FluxoApp Push Server

Este servidor completa las notificaciones reales cuando la PWA está cerrada. Usa Cloudflare Worker + D1 + Web Push/VAPID. Cloudflare Cron ejecuta el Worker cada minuto; el servidor guarda la suscripción y la agenda de los próximos eventos que FluxoApp sincroniza.

## 1. Crear el D1

```bash
npx wrangler d1 create fluxo_push
```
Copia el `database_id` en `wrangler.toml`.

## 2. Inicializar tablas

```bash
npx wrangler d1 execute fluxo_push --remote --file=schema.sql
```

## 3. Guardar secretos

```bash
npx wrangler secret put VAPID_PUBLIC_KEY
npx wrangler secret put VAPID_PRIVATE_KEY
npx wrangler secret put VAPID_SUBJECT
```

Usa como `VAPID_PUBLIC_KEY` la clave que ya está en `../js/notifications.js`. La privada está solamente en tus secretos y **no debe entrar al ZIP público ni al repositorio de FluxoApp**.

Para `VAPID_SUBJECT`, usa un correo tuyo, por ejemplo `mailto:tu-correo@example.com`.

## 4. Instalar y publicar

```bash
npm install
npx wrangler login
npx wrangler deploy
```

Cloudflare te dará una URL tipo `https://fluxoapp-push.<tu-subdominio>.workers.dev`.

## 5. Conectar FluxoApp

En `../js/notifications.js`, cambia:

```js
const FLUXO_PUSH_API_URL = '';
```

por:

```js
const FLUXO_PUSH_API_URL = 'https://TU-WORKER.workers.dev/api';
```

Luego vuelve a publicar FluxoApp.

## Qué envía el servidor

- Turnos: mantiene la lógica anterior: cada día a las 20:00 avisa el turno del día siguiente.
- Movimientos: 1 día antes a las 20:00, el día del movimiento a las 08:00 y recordatorio de pendiente a las 20:00.
- Confirmar un movimiento hace que FluxoApp vuelva a sincronizar y ese movimiento deja de estar en la agenda pendiente.
- El servidor no cambia saldos ni marca movimientos como realizados.

## Prueba

1. Activa notificaciones en FluxoApp.
2. Comprueba que la prueba sigue llegando.
3. Revisa `https://TU-WORKER.workers.dev/api/health`.
4. Crea un movimiento programado para mañana.
5. Abre FluxoApp una vez para sincronizarlo.
6. Para probar sin esperar, puedes cambiar temporalmente las horas en `notifications.js` a unos minutos próximos; después vuelve a 20:00/08:00.
