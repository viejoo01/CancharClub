# 🛡️ Guía de Respaldos Semanales Automáticos — CancharClub

En el plan gratuito (Free) de Supabase no existen copias de seguridad diarias automatizadas ni Point-In-Time Recovery (PITR). Para un complejo deportivo, la pérdida de la base de datos significa perder reservas señadas, saldos a favor y la cartera de teléfonos de los clientes.

Para mitigar este riesgo al 100%, se implementó una **estrategia de respaldo de triple capa**, resiliente, automatizada y con rotación histórica.

---

## 🏗️ Las 3 Capas de Protección

1. **Capa 1 — Dump Nativo de PostgreSQL (`pg_dump`)**:
   - Genera un archivo binario comprimido `.dump` (`-F c`), ideal para restauración rápida con `pg_restore` (soporta restauración en paralelo y por tablas específicas).
   - Genera un script SQL en texto plano `.sql` (`-F p`) que permite abrir e inspeccionar los datos directamente en VS Code o cualquier editor.
   - Conexión vía **Session Pooler** de Supabase (`aws-0-sa-east-1.pooler.supabase.com:5432`) que soporta IPv4 directamente desde Windows.

2. **Capa 2 — Snapshot Inmune de Negocio (`business_data.json`)**:
   - Exporta vía HTTPS (puerto 443) todas las filas de:
     - `bookings` (turnos señados, confirmados, señas y totales)
     - `profiles` (teléfonos WhatsApp, nombres, roles de clientes)
     - `courts` (canchas y tipos de superficie)
     - `court_orders` (pedidos de cantina/buffet)
     - `recurring_slots` (turnos fijos de socios)
     - `tenants`, `price_rules`, `customer_credits`, etc.
   - **Garantía absoluta**: Funciona incluso si el puerto 5432 está bloqueado por el proveedor de internet o si la contraseña de la BD cambia.

3. **Capa 3 — Automatización en Windows (Task Scheduler)**:
   - Tarea programada en Windows: `CancharClub_Weekly_Backup`.
   - Se ejecuta automáticamente **todos los domingos a las 03:00 AM** en segundo plano.
   - Si la computadora estaba apagada, se ejecuta automáticamente apenas se enciende.
   - **Rotación automática**: Conserva las últimas **8 semanas** de copias y elimina las más viejas para no saturar el almacenamiento.

---

## 🔑 Configuración de Contraseña de Base de Datos

Para que `pg_dump` pueda conectarse a PostgreSQL:

1. Ingresá a tu panel de [Supabase Dashboard](https://supabase.com/dashboard/project/nmihhlzbpjonmjsmmred/settings/database).
2. Dirigite a **Project Settings > Database**.
3. En la sección **Database password**, si no recordás la contraseña, hacé clic en **Reset database password** e ingresá una nueva (ej: `TuClaveSegura2026!`).
4. Abrí tu archivo `.env.local` en `canchas-app/` y agregá:
   ```env
   SUPABASE_DB_PASSWORD=TuClaveSegura2026!
   ```

*(Nota: La aplicación web Next.js no se ve afectada si cambiás esta clave, ya que opera mediante la API de Supabase vía HTTPS).*

---

## 🚀 Comandos Rápidos

### 1. Ejecutar respaldo manual ahora mismo
Podés tomar un respaldo instantáneo antes de hacer cambios o migraciones:

```bash
# Opción A: Desde npm
npm run db:backup

# Opción B: Doble clic en Windows
canchas-app\scripts\run-backup.bat

# Opción C: PowerShell directo
npm run db:backup:ps
```

### 2. Consultar el estado de la tarea programada
```powershell
Get-ScheduledTask -TaskName "CancharClub_Weekly_Backup" | Get-ScheduledTaskInfo
```

### 3. Re-registrar o cambiar el horario de la tarea programada
```powershell
# Cambiar para que corra los lunes a las 04:00 AM por ejemplo:
powershell -ExecutionPolicy Bypass -File scripts\register-weekly-backup-task.ps1 -DayOfWeek "Monday" -Time "04:00"
```

---

## 🔄 Restauración en Caso de Emergencia

Todos los respaldos se guardan en la carpeta raíz `backups/`:

```
Sistema Club/
└── backups/
    ├── cancharclub_2026-10-01_20-27-03_business_data.json
    ├── cancharclub_2026-10-01_20-27-03.dump
    ├── cancharclub_2026-10-01_20-27-03.sql
    ├── latest-backup.json
    └── backup.log
```

Para restaurar una copia:

### Simular restauración (Dry Run) sin modificar la base de datos:
```powershell
powershell -ExecutionPolicy Bypass -File scripts\restore-supabase.ps1 -DryRun
```

### Restaurar únicamente la tabla de turnos (`bookings`):
```powershell
powershell -ExecutionPolicy Bypass -File scripts\restore-supabase.ps1 -TargetTable "bookings"
```

### Restaurar base completa:
```powershell
powershell -ExecutionPolicy Bypass -File scripts\restore-supabase.ps1
```
*(El script solicitará confirmación `[S/N]` antes de ejecutar cualquier acción).*
