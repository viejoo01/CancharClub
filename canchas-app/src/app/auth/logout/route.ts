import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function POST(request: Request) {
  const supabase = await createClient()
  await supabase.auth.signOut()
  const origin = new URL(request.url).origin
  const response = NextResponse.redirect(`${origin}/auth/login`)
  response.cookies.delete('demo_user_role')
  response.cookies.delete('demo_user_name')
  response.cookies.delete('demo_subscription_status')
  response.cookies.delete('demo_plan_id')
  response.cookies.delete('demo_tenant_name')
  response.cookies.delete('demo_tenant_slug')
  return response
}
