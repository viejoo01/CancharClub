import { createServerClient } from '@supabase/ssr'
import { createClient as createSupabaseClient, type SupabaseClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'

export async function createClient() {
  const cookieStore = await cookies()

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://placeholder.supabase.co',
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'placeholder-anon-key',
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          } catch {
            // setAll en Server Components es no-op esperado
          }
        },
      },
    }
  )
}

/** 
 * Cliente con privilegios reales de service_role — para Server Actions y operaciones backend.
 * NO utiliza cookies de sesión del usuario para evitar que el token de usuario o RLS sobrescriban
 * los permisos de administración del sistema.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let serviceClientInstance: SupabaseClient<any, 'public', any> | null = null

export async function createServiceClient() {
  if (serviceClientInstance) return serviceClientInstance

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://placeholder.supabase.co'
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || 'placeholder-service-key'

  serviceClientInstance = createSupabaseClient(supabaseUrl, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  })

  return serviceClientInstance
}
