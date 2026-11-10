---
name: supabase-postgres-engine
description: Reglas y procedimientos obligatorios para migraciones SQL, políticas RLS multi-tenant, índices y funciones RPC en PostgreSQL y Supabase para CancharClub y sistemas SaaS.
---

# Supabase & PostgreSQL Engine — Skill de Base de Datos

Esta skill rige todas las operaciones sobre base de datos PostgreSQL y Supabase. Establece las reglas de diseño relacional, aislamiento de datos, políticas de seguridad (RLS) y optimización transaccional.

---

## 1. Principio Fundamental: Aislamiento Multi-Tenant Estricto

En toda tabla perteneciente a un club o inquilino (`tenants`), la columna `tenant_id` es **obligatoria e inmutable**:
* Tipo: `UUID REFERENCES public.tenants(id) ON DELETE CASCADE`.
* Toda consulta `SELECT`, `UPDATE` o `DELETE` desde la aplicación debe filtrar explícitamente por `tenant_id`.
* La seguridad no recae únicamente en el frontend ni en la capa de API: **Row Level Security (RLS) debe estar activo en el 100% de las tablas del esquema `public`**.

```sql
-- Habilitar RLS siempre en tablas nuevas
ALTER TABLE public.canchas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bookings ENABLE ROW LEVEL SECURITY;
```

---

## 2. Políticas de Seguridad RLS Estándar

### A. Contexto de Usuario Autenticado (Dueño / Empleado del Club)
Utilizar la función de extracción de tenant del usuario autenticado:
```sql
CREATE POLICY "tenant_isolation_policy" ON public.canchas
  FOR ALL
  TO authenticated
  USING (tenant_id = public.get_my_tenant_id())
  WITH CHECK (tenant_id = public.get_my_tenant_id());
```

### B. Portal Público de Reservas (Jugadores anónimos o no logueados)
Para permitir que los jugadores reserven canchas desde la URL pública `cancharclub.com.ar/club/[slug]`:
* `SELECT` permitido únicamente para canchas y turnos disponibles con `is_active = true`.
* `INSERT` de reservas permitido sólo con estado transitorio (`PENDING_DEPOSIT`) y expiración en 7 minutos.

---

## 3. Prevención de Solapamiento de Turnos (Invariante Crítico)

Nunca confiar únicamente en validaciones de JavaScript/Next.js para evitar doble reserva en la misma cancha. Utilizar la extensión PostgreSQL `btree_gist`:

```sql
CREATE EXTENSION IF NOT EXISTS btree_gist;

-- Constraint de exclusión horaria por cancha y fecha
ALTER TABLE public.bookings
  ADD CONSTRAINT no_overlapping_bookings
  EXCLUDE USING gist (
    cancha_id WITH =,
    booking_date WITH =,
    tsrange(start_time::text::time, end_time::text::time) WITH &&
  )
  WHERE (status NOT IN ('CANCELLED', 'EXPIRED'));
```

---

## 4. Convenciones para Migraciones SQL

* **Ubicación de archivos**: `canchas-app/supabase/migrations/` o `supabase/migrations/`.
* **Nomenclatura**: `YYYYMMDDHHMMSS_descripcion_corta.sql` (ej: `20261110120000_add_pwa_push_subscriptions.sql`).
* **Idempotencia**:
  * Utilizar `CREATE TABLE IF NOT EXISTS`.
  * Utilizar `ADD COLUMN IF NOT EXISTS`.
  * Utilizar `CREATE OR REPLACE FUNCTION`.
  * En constraints y triggers, verificar existencia antes de crear (`DO $$ BEGIN ... EXCEPTION ... END $$;`).
* **Prohibición de `DROP` destructivo**:
  * Queda prohibido ejecutar `DROP TABLE`, `DROP COLUMN` o `TRUNCATE` en migraciones de producción sin respaldo verificado.

---

## 5. Verificación de Tipos TypeScript

Tras cualquier modificación en la base de datos:
1. Mantener sincronizada la interfaz `Database` en `src/types/database.types.ts`.
2. Validar que no existan discrepancias ejecutando:
   ```bash
   cd canchas-app
   npx tsc --noEmit
   ```
