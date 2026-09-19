'use server'
// src/actions/tournament.actions.ts
// ==============================================================================
// SERVER ACTIONS — Módulo de Torneos y Cuadros Exprés (Playoffs Cuartos, Semis, Final)
// ==============================================================================

import { createServiceClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
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
    const supabase = await createServiceClient()
    const { data: team, error } = await supabase
      .from('tournament_teams')
      .insert({
        category_id: payload.category_id,
        name: payload.name,
        player_1: payload.player_1,
        player_2: payload.player_2 || null,
        phone: payload.phone,
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

    // Equipos padded a 8 si son menos
    const t = [...teams]
    while (t.length < 8) {
      t.push(null as unknown as TournamentTeam)
    }

    // 3. Crear 4 partidos de Cuartos de Final
    // Cruces clásicos: 1 vs 8, 4 vs 5, 2 vs 7, 3 vs 6
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

    // 4. Crear 2 partidos de Semifinal (esperando ganadores)
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

    // 5. Crear 1 Gran Final
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

    const allMatches = [...cuartosRows, ...semisRows, ...finalRows]
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

    // 1. Obtener datos actuales del partido
    const { data: currentMatch, error: mErr } = await supabase
      .from('tournament_matches')
      .select('*')
      .eq('id', payload.matchId)
      .single()

    if (mErr || !currentMatch) {
      return { success: false, error: 'Partido no encontrado' }
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

