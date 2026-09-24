import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function POST(request: Request) {
  const supabase = await createClient()
  await supabase.auth.signOut()
  const origin = new URL(request.url).origin
  const response = NextResponse.redirect(`${origin}/`, { status: 303 })
  const cookiesToDelete = [
    'demo_user_role',
    'demo_user_name',
    'demo_subscription_status',
    'demo_plan_id',
    'demo_tenant_name',
    'demo_tenant_slug',
    'demo_tenant_id',
    'canchar_tenant_id',
    'demo_is_active',
    'demo_has_card',
    'demo_card_last4',
    'demo_card_brand',
    'demo_card_holder',
    'new_club_pending_activation',
    'canchar_active_venue_id',
    'canchar_active_venue_name',
  ]
  cookiesToDelete.forEach(c => response.cookies.delete(c))
  return response
}

export async function GET(request: Request) {
  return POST(request)
}
