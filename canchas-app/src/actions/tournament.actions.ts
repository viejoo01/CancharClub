'use server'
// src/actions/tournament.actions.ts
// ==============================================================================
// SERVER ACTIONS — Módulo de Torneos y Cuadros Exprés (Playoffs Cuartos, Semis, Final)
// ==============================================================================

import { createServiceClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { assertTenantMember } from '@/lib/auth-security'
import { sanitizeText } from '@/lib/sanitize'
import type { 
  Tournament, 
  TournamentCategory, 
  TournamentTeam, 
  TournamentMatch 
} from '@/types/database'

export interface TournamentWithDetails extends Tournament {
  categories: (TournamentCategory & {
    teams: TournamentTeam[]
    matches: TournamentMatch[]
  })[]
}

/** Obtener torneos de un tenant */
export async function getTournaments(tenantId: string): Promise<Tournament[]> {
  try {
    const supabase = await createServiceClient()
    const { data, error } = await supabase
      .from('tournaments')
      .select('*')
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: false })

    if (error) {
      console.warn('[getTournaments] DB warning:', error.message)
      return []
    }
    return (data as Tournament[]) || []
  } catch {
    return []
  }
}

/** Obtener un torneo por ID con categorías, equipos y partidos */
export async function getTournamentById(tournamentId: string): Promise<TournamentWithDetails | null> {
  try {
    const supabase = await createServiceClient()
    
    // 1. Torneo
    const { data: tournament, error: tourError } = await supabase
      .from('tournaments')
      .select('*')
      .eq('id', tournamentId)
      .single()

    if (tourError || !tournament) return null

    // 2. Categorías
    const { data: categories } = await supabase
      .from('tournament_categories')
      .select('*')
      .eq('tournament_id', tournamentId)

    const fullCategories = await Promise.all(
      (categories || []).map(async (cat) => {
        const [{ data: teams }, { data: matches }] = await Promise.all([
          supabase
            .from('tournament_teams')
            .select('*')
            .eq('category_id', cat.id)
            .order('created_at', { ascending: true }),
          supabase
            .from('tournament_matches')
            .select('*')
            .eq('category_id', cat.id)
            .order('match_number', { ascending: true }),
        ])

        return {
          ...cat,
          teams: (teams as TournamentTeam[]) || [],
          matches: (matches as TournamentMatch[]) || [],
        }
      })
    )

    return {
      ...(tournament as Tournament),
      categories: fullCategories,
    }
  } catch (err) {
    console.error('[getTournamentById] Error:', err)
    return null
  }
}

/** Crear un nuevo torneo con sus categorías */
export async function createTournament(payload: {
  tenant_id: string
  name: string
  sport: string
  format: 'PLAYOFFS' | 'GROUPS_AND_PLAYOFFS'
  start_date: string
  end_date: string
  categories: { name: string; max_teams: number }[]
}): Promise<{ success: boolean; tournament_id?: string; error?: string }> {
  try {
    const auth = await assertTenantMember(payload.tenant_id)
    if (!auth.authorized) {
      return { success: false, error: auth.error || 'Sin permisos sobre este club' }
    }

    const supabase = await createServiceClient()

    const { data: tournament, error: tError } = await supabase
      .from('tournaments')
      .insert({
        tenant_id: payload.tenant_id,
        name: payload.name,
        sport: payload.sport,
        format: payload.format,
        start_date: payload.start_date,
        end_date: payload.end_date,
        status: 'REGISTRATION',
      })
      .select('id')
      .single()

    if (tError || !tournament) {
      return { success: false, error: tError?.message || 'Error al crear el torneo' }
    }

    if (payload.categories?.length > 0) {
      const catRows = payload.categories.map((c) => ({
        tournament_id: tournament.id,
        name: c.name,
        max_teams: c.max_teams || 8,
      }))

      await supabase.from('tournament_categories').insert(catRows)
    }

    revalidatePath('/dashboard/torneos')
    return { success: true, tournament_id: tournament.id }
  } catch (err) {
    console.error('[createTournament] Error:', err)
    return { success: false, error: 'Error interno del servidor' }
  }
}

/** Inscribir una pareja / equipo a una categoría */
export async function addTeamToCategory(payload: {
  category_id: string
  name: string
  player_1: string
  player_2?: string
  phone: string
}): Promise<{ success: boolean; team?: TournamentTeam; error?: string }> {
  try {
    const cleanName = sanitizeText(payload.name || '', 60).trim()
    const cleanP1 = sanitizeText(payload.player_1 || '', 60).trim()
    const cleanP2 = payload.player_2 ? sanitizeText(payload.player_2, 60).trim() : null
    const cleanPhone = (payload.phone || '').replace(/[^\d+]/g, '').trim()

    if (cleanName.length < 2 || cleanP1.length < 2) {
      return { success: false, error: 'Nombre de equipo y jugador requeridos' }
    }
    if (cleanPhone.length < 6) {
      return { success: false, error: 'Teléfono de contacto inválido' }
    }

    const supabase = await createServiceClient()

    // Validar que la categoría exista
    const { data: cat } = await supabase
      .from('tournament_categories')
      .select('id')
      .eq('id', payload.category_id)
      .maybeSingle()

    if (!cat) {
      return { success: false, error: 'Categoría no encontrada' }
    }

    const { data: team, error } = await supabase
      .from('tournament_teams')
      .insert({
        category_id: payload.category_id,
        name: cleanName,
        player_1: cleanP1,
        player_2: cleanP2,
        phone: cleanPhone,
      })
      .select()
      .single()

    if (error) return { success: false, error: error.message }

    revalidatePath('/dashboard/torneos')
    return { success: true, team: team as TournamentTeam }
  } catch (err) {
    console.error('[addTeamToCategory] Error:', err)
    return { success: false, error: 'Error al inscribir equipo' }
  }
}

/**
 * Generar cuadro eliminatorio de Playoffs (Cuartos -> Semis -> Final)
 * para un máximo de 8 parejas/equipos.
 */
export async function generatePlayoffBracket(
  categoryId: string
): Promise<{ success: boolean; matchesCount?: number; error?: string }> {
  try {
    const supabase = await createServiceClient()

    // 0. Validar permisos sobre el club propietario del torneo
    const { data: category } = await supabase
      .from('tournament_categories')
      .select('id, tournament_id, tournament:tournaments(id, tenant_id)')
      .eq('id', categoryId)
      .maybeSingle()

    const tourObj = category?.tournament as unknown as { id?: string; tenant_id?: string } | null
    const resourceTenantId = tourObj?.tenant_id
    const tournamentId = category?.tournament_id || tourObj?.id

    if (!resourceTenantId) {
      return { success: false, error: 'Categoría o torneo no encontrado' }
    }

    const auth = await assertTenantMember(resourceTenantId)
    if (!auth.authorized) {
      return { success: false, error: auth.error || 'Sin permisos para armar cuadros de este torneo' }
    }

    // 1. Obtener equipos inscriptos
    const { data: teams, error: tErr } = await supabase
      .from('tournament_teams')
      .select('*')
      .eq('category_id', categoryId)
      .order('created_at', { ascending: true })

    if (tErr || !teams || teams.length < 2) {
      return { 
        success: false, 
        error: 'Se necesitan al menos 2 equipos inscriptos para armar la llave' 
      }
    }

    // 2. Limpiar partidos existentes de la categoría
    await supabase.from('tournament_matches').delete().eq('category_id', categoryId)

    // Actualizar formato del torneo a PLAYOFFS
    if (tournamentId) {
      await supabase.from('tournaments').update({ format: 'PLAYOFFS' }).eq('id', tournamentId)
    }

    let allMatches: Array<{
      category_id: string
      round: string
      match_number: number
      team_a_id: string | null
      team_b_id: string | null
      status: string
      scheduled_time: string
      court_name: string
    }> = []

    if (teams.length === 2) {
      // 2 equipos: Gran Final directa
      allMatches = [
        {
          category_id: categoryId,
          round: 'FINAL',
          match_number: 1,
          team_a_id: teams[0].id,
          team_b_id: teams[1].id,
          status: 'SCHEDULED',
          scheduled_time: 'A definir',
          court_name: 'Cancha Central',
        },
      ]
    } else if (teams.length <= 4) {
      // 3 ó 4 equipos: Semifinales directas y Gran Final
      allMatches = [
        {
          category_id: categoryId,
          round: 'SEMIFINAL',
          match_number: 1,
          team_a_id: teams[0]?.id || null,
          team_b_id: teams[3]?.id || null,
          status: 'SCHEDULED',
          scheduled_time: 'Semis 1 - 18:00',
          court_name: 'Cancha 1',
        },
        {
          category_id: categoryId,
          round: 'SEMIFINAL',
          match_number: 2,
          team_a_id: teams[1]?.id || null,
          team_b_id: teams[2]?.id || null,
          status: 'SCHEDULED',
          scheduled_time: 'Semis 2 - 19:30',
          court_name: 'Cancha 2',
        },
        {
          category_id: categoryId,
          round: 'FINAL',
          match_number: 1,
          team_a_id: null,
          team_b_id: null,
          status: 'SCHEDULED',
          scheduled_time: 'Final - 21:00',
          court_name: 'Cancha Central',
        },
      ]
    } else {
      // 5 a 8 equipos: Cuartos de Final clásicos -> Semis -> Final
      const t = [...teams]
      while (t.length < 8) {
        t.push(null as unknown as TournamentTeam)
      }

      const cuartosRows = [
        {
          category_id: categoryId,
          round: 'CUARTOS',
          match_number: 1,
          team_a_id: t[0]?.id || null,
          team_b_id: t[7]?.id || null,
          status: 'SCHEDULED',
          scheduled_time: 'Viernes 18:00',
          court_name: 'Cancha 1',
        },
        {
          category_id: categoryId,
          round: 'CUARTOS',
          match_number: 2,
          team_a_id: t[3]?.id || null,
          team_b_id: t[4]?.id || null,
          status: 'SCHEDULED',
          scheduled_time: 'Viernes 19:30',
          court_name: 'Cancha 2',
        },
        {
          category_id: categoryId,
          round: 'CUARTOS',
          match_number: 3,
          team_a_id: t[1]?.id || null,
          team_b_id: t[6]?.id || null,
          status: 'SCHEDULED',
          scheduled_time: 'Viernes 21:00',
          court_name: 'Cancha 1',
        },
        {
          category_id: categoryId,
          round: 'CUARTOS',
          match_number: 4,
          team_a_id: t[2]?.id || null,
          team_b_id: t[5]?.id || null,
          status: 'SCHEDULED',
          scheduled_time: 'Viernes 22:30',
          court_name: 'Cancha 2',
        },
      ]

      const semisRows = [
        {
          category_id: categoryId,
          round: 'SEMIFINAL',
          match_number: 1,
          team_a_id: null,
          team_b_id: null,
          status: 'SCHEDULED',
          scheduled_time: 'Sábado 18:00',
          court_name: 'Cancha 1',
        },
        {
          category_id: categoryId,
          round: 'SEMIFINAL',
          match_number: 2,
          team_a_id: null,
          team_b_id: null,
          status: 'SCHEDULED',
          scheduled_time: 'Sábado 19:30',
          court_name: 'Cancha 2',
        },
      ]

      const finalRows = [
        {
          category_id: categoryId,
          round: 'FINAL',
          match_number: 1,
          team_a_id: null,
          team_b_id: null,
          status: 'SCHEDULED',
          scheduled_time: 'Domingo 20:00',
          court_name: 'Cancha Central',
        },
      ]

      allMatches = [...cuartosRows, ...semisRows, ...finalRows]
    }

    const { data: inserted, error: iErr } = await supabase
      .from('tournament_matches')
      .insert(allMatches)
      .select('id')

    if (iErr) return { success: false, error: iErr.message }

    revalidatePath('/dashboard/torneos')
    return { success: true, matchesCount: inserted?.length }
  } catch (err) {
    console.error('[generatePlayoffBracket] Error:', err)
    return { success: false, error: 'Error al generar el cuadro' }
  }
}

/**
 * Cargar / actualizar marcador de un partido y avanzar automáticamente
 * al ganador a la siguiente ronda (Cuartos -> Semis -> Final)
 */
export async function updateMatchScore(payload: {
  matchId: string
  categoryId: string
  score_team_a: string
  score_team_b: string
  winner_team_id: string
  status: 'PLAYING' | 'FINISHED'
}): Promise<{ success: boolean; error?: string }> {
  try {
    const supabase = await createServiceClient()

    // 1. Obtener datos actuales del partido junto a su categoría y torneo
    const { data: currentMatch, error: mErr } = await supabase
      .from('tournament_matches')
      .select('*, category:tournament_categories(tournament:tournaments(tenant_id))')
      .eq('id', payload.matchId)
      .single()

    if (mErr || !currentMatch) {
      return { success: false, error: 'Partido no encontrado' }
    }

    const catObj = currentMatch.category as unknown as { tournament?: { tenant_id?: string } } | null
    const resourceTenantId = catObj?.tournament?.tenant_id
    if (resourceTenantId) {
      const auth = await assertTenantMember(resourceTenantId)
      if (!auth.authorized) {
        return { success: false, error: auth.error || 'Sin permisos para cargar resultados de este torneo' }
      }
    }

    // 2. Actualizar marcador del partido
    await supabase
      .from('tournament_matches')
      .update({
        score_team_a: payload.score_team_a,
        score_team_b: payload.score_team_b,
        winner_team_id: payload.winner_team_id || null,
        status: payload.status,
      })
      .eq('id', payload.matchId)

    // 3. Si finalizó y hay un ganador, avanzar automáticamente a la siguiente ronda
    if (payload.status === 'FINISHED' && payload.winner_team_id) {
      const winnerId = payload.winner_team_id

      if (currentMatch.round === 'CUARTOS') {
        // Cuartos 1 y 2 van a Semifinal 1
        // Cuartos 3 y 4 van a Semifinal 2
        if (currentMatch.match_number === 1) {
          await supabase
            .from('tournament_matches')
            .update({ team_a_id: winnerId })
            .eq('category_id', payload.categoryId)
            .eq('round', 'SEMIFINAL')
            .eq('match_number', 1)
        } else if (currentMatch.match_number === 2) {
          await supabase
            .from('tournament_matches')
            .update({ team_b_id: winnerId })
            .eq('category_id', payload.categoryId)
            .eq('round', 'SEMIFINAL')
            .eq('match_number', 1)
        } else if (currentMatch.match_number === 3) {
          await supabase
            .from('tournament_matches')
            .update({ team_a_id: winnerId })
            .eq('category_id', payload.categoryId)
            .eq('round', 'SEMIFINAL')
            .eq('match_number', 2)
        } else if (currentMatch.match_number === 4) {
          await supabase
            .from('tournament_matches')
            .update({ team_b_id: winnerId })
            .eq('category_id', payload.categoryId)
            .eq('round', 'SEMIFINAL')
            .eq('match_number', 2)
        }
      } else if (currentMatch.round === 'SEMIFINAL') {
        // Semifinal 1 va a Final (Equipo A)
        // Semifinal 2 va a Final (Equipo B)
        if (currentMatch.match_number === 1) {
          await supabase
            .from('tournament_matches')
            .update({ team_a_id: winnerId })
            .eq('category_id', payload.categoryId)
            .eq('round', 'FINAL')
            .eq('match_number', 1)
        } else if (currentMatch.match_number === 2) {
          await supabase
            .from('tournament_matches')
            .update({ team_b_id: winnerId })
            .eq('category_id', payload.categoryId)
            .eq('round', 'FINAL')
            .eq('match_number', 1)
        }
      }
    }

    revalidatePath('/dashboard/torneos')
    return { success: true }
  } catch (err) {
    console.error('[updateMatchScore] Error:', err)
    return { success: false, error: 'Error al actualizar marcador' }
  }
}

/**
 * Generar fase de grupos (Zonas A y B) + Semifinales y Gran Final (Mejora 10)
 */
export async function generateGroupStageAndPlayoffs(
  categoryId: string
): Promise<{ success: boolean; matchesCount?: number; error?: string }> {
  try {
    const supabase = await createServiceClient()

    // 0. Validar permisos sobre el club propietario del torneo
    const { data: category } = await supabase
      .from('tournament_categories')
      .select('id, tournament_id, tournament:tournaments(id, tenant_id)')
      .eq('id', categoryId)
      .maybeSingle()

    const tourObj = category?.tournament as unknown as { id?: string; tenant_id?: string } | null
    const resourceTenantId = tourObj?.tenant_id
    const tournamentId = category?.tournament_id || tourObj?.id

    if (!resourceTenantId) {
      return { success: false, error: 'Categoría o torneo no encontrado' }
    }

    const auth = await assertTenantMember(resourceTenantId)
    if (!auth.authorized) {
      return { success: false, error: auth.error || 'Sin permisos para generar fixture de este torneo' }
    }

    // 1. Obtener equipos inscriptos
    const { data: teams, error: tErr } = await supabase
      .from('tournament_teams')
      .select('*')
      .eq('category_id', categoryId)
      .order('created_at', { ascending: true })

    if (tErr || !teams || teams.length < 4) {
      return {
        success: false,
        error: 'Se necesitan al menos 4 equipos inscriptos para el formato de Fase de Grupos + Playoffs.',
      }
    }

    // 2. Limpiar partidos existentes
    await supabase.from('tournament_matches').delete().eq('category_id', categoryId)

    // Actualizar formato del torneo a GROUPS_AND_PLAYOFFS
    if (tournamentId) {
      await supabase.from('tournaments').update({ format: 'GROUPS_AND_PLAYOFFS' }).eq('id', tournamentId)
    }

    // 3. Dividir en Grupo A y Grupo B
    const groupA = teams.filter((_, idx) => idx % 2 === 0)
    const groupB = teams.filter((_, idx) => idx % 2 !== 0)

    const matchesToInsert: Array<{
      category_id: string
      round: string
      match_number: number
      team_a_id: string | null
      team_b_id: string | null
      status: string
      scheduled_time: string
      court_name: string
    }> = []

    // Helper para round-robin en un grupo
    const buildRoundRobin = (groupTeams: typeof teams, roundName: string, courtName: string) => {
      let matchNum = 1
      for (let i = 0; i < groupTeams.length; i++) {
        for (let j = i + 1; j < groupTeams.length; j++) {
          matchesToInsert.push({
            category_id: categoryId,
            round: roundName,
            match_number: matchNum++,
            team_a_id: groupTeams[i].id,
            team_b_id: groupTeams[j].id,
            status: 'SCHEDULED',
            scheduled_time: `Jornada ${matchNum - 1} - 18:${(matchNum * 15) % 60 || '00'}`,
            court_name: courtName,
          })
        }
      }
    }

    buildRoundRobin(groupA, 'GRUPO_A', 'Cancha 1')
    buildRoundRobin(groupB, 'GRUPO_B', 'Cancha 2')

    // 4. Semifinales
    matchesToInsert.push(
      {
        category_id: categoryId,
        round: 'SEMIFINAL',
        match_number: 1,
        team_a_id: null, // 1° Grupo A
        team_b_id: null, // 2° Grupo B
        status: 'SCHEDULED',
        scheduled_time: 'Domingo 17:00',
        court_name: 'Cancha 1 (Semis)',
      },
      {
        category_id: categoryId,
        round: 'SEMIFINAL',
        match_number: 2,
        team_a_id: null, // 1° Grupo B
        team_b_id: null, // 2° Grupo A
        status: 'SCHEDULED',
        scheduled_time: 'Domingo 18:30',
        court_name: 'Cancha 2 (Semis)',
      }
    )

    // 5. Gran Final
    matchesToInsert.push({
      category_id: categoryId,
      round: 'FINAL',
      match_number: 1,
      team_a_id: null,
      team_b_id: null,
      status: 'SCHEDULED',
      scheduled_time: 'Domingo 20:30',
      court_name: 'Cancha Central',
    })

    const { data: inserted, error: insertErr } = await supabase
      .from('tournament_matches')
      .insert(matchesToInsert)
      .select('id')

    if (insertErr) {
      return { success: false, error: insertErr.message }
    }

    revalidatePath('/dashboard/torneos')
    return { success: true, matchesCount: inserted?.length }
  } catch (err) {
    console.error('[generateGroupStageAndPlayoffs] Error:', err)
    return { success: false, error: 'Error al generar formato de grupos' }
  }
}

/**
 * Modificar el formato de un torneo existente (Fase de grupos + Playoffs o Playoffs Directo)
 */
export async function updateTournamentFormat(
  tournamentId: string,
  format: 'PLAYOFFS' | 'GROUPS_AND_PLAYOFFS'
): Promise<{ success: boolean; error?: string }> {
  try {
    const supabase = await createServiceClient()
    const { data: tour } = await supabase
      .from('tournaments')
      .select('tenant_id')
      .eq('id', tournamentId)
      .single()

    if (!tour) return { success: false, error: 'Torneo no encontrado' }

    const auth = await assertTenantMember(tour.tenant_id)
    if (!auth.authorized) return { success: false, error: auth.error || 'No autorizado' }

    await supabase.from('tournaments').update({ format }).eq('id', tournamentId)

    revalidatePath('/dashboard/torneos')
    revalidatePath(`/torneo/${tournamentId}`)
    return { success: true }
  } catch (err) {
    console.error('[updateTournamentFormat] Error:', err)
    return { success: false, error: 'Error al actualizar formato' }
  }
}

/**
 * Clasificar los mejores de fase de grupos (Zonas A y B) a las Semifinales
 */
export async function advanceGroupWinnersToPlayoffs(
  categoryId: string,
  qualifiers: {
    firstAId?: string | null
    secondAId?: string | null
    firstBId?: string | null
    secondBId?: string | null
  }
): Promise<{ success: boolean; error?: string }> {
  try {
    const supabase = await createServiceClient()
    const { data: category } = await supabase
      .from('tournament_categories')
      .select('id, tournament:tournaments(tenant_id)')
      .eq('id', categoryId)
      .maybeSingle()

    const resourceTenantId = (category?.tournament as unknown as { tenant_id?: string })?.tenant_id
    if (!resourceTenantId) {
      return { success: false, error: 'Categoría no encontrada' }
    }
    const auth = await assertTenantMember(resourceTenantId)
    if (!auth.authorized) {
      return { success: false, error: auth.error || 'Sin permisos' }
    }

    // Semifinal 1: 1° Zona A vs 2° Zona B
    if (qualifiers.firstAId !== undefined || qualifiers.secondBId !== undefined) {
      await supabase
        .from('tournament_matches')
        .update({
          team_a_id: qualifiers.firstAId || null,
          team_b_id: qualifiers.secondBId || null,
        })
        .eq('category_id', categoryId)
        .eq('round', 'SEMIFINAL')
        .eq('match_number', 1)
    }

    // Semifinal 2: 1° Zona B vs 2° Zona A
    if (qualifiers.firstBId !== undefined || qualifiers.secondAId !== undefined) {
      await supabase
        .from('tournament_matches')
        .update({
          team_a_id: qualifiers.firstBId || null,
          team_b_id: qualifiers.secondAId || null,
        })
        .eq('category_id', categoryId)
        .eq('round', 'SEMIFINAL')
        .eq('match_number', 2)
    }

    revalidatePath('/dashboard/torneos')
    return { success: true }
  } catch (err) {
    console.error('[advanceGroupWinnersToPlayoffs] Error:', err)
    return { success: false, error: 'Error al clasificar equipos a semifinales' }
  }
}

/**
 * Eliminar un equipo o pareja inscripta
 */
export async function deleteTeam(teamId: string): Promise<{ success: boolean; error?: string }> {
  try {
    const supabase = await createServiceClient()
    const { data: team } = await supabase
      .from('tournament_teams')
      .select('id, category_id, category:tournament_categories(tournament:tournaments(tenant_id))')
      .eq('id', teamId)
      .maybeSingle()

    if (!team) return { success: false, error: 'Equipo no encontrado' }

    const catObj = team.category as unknown as { tournament?: { tenant_id?: string } } | null
    const resourceTenantId = catObj?.tournament?.tenant_id
    if (resourceTenantId) {
      const auth = await assertTenantMember(resourceTenantId)
      if (!auth.authorized) return { success: false, error: auth.error || 'No autorizado' }
    }

    // Desvincular de partidos donde figure
    await supabase.from('tournament_matches').update({ team_a_id: null }).eq('team_a_id', teamId)
    await supabase.from('tournament_matches').update({ team_b_id: null }).eq('team_b_id', teamId)
    await supabase.from('tournament_matches').update({ winner_team_id: null }).eq('winner_team_id', teamId)

    await supabase.from('tournament_teams').delete().eq('id', teamId)

    revalidatePath('/dashboard/torneos')
    return { success: true }
  } catch (err) {
    console.error('[deleteTeam] Error:', err)
    return { success: false, error: 'Error al eliminar inscripción' }
  }
}

