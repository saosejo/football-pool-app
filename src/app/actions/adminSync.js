'use server'

import { createClient } from '@supabase/supabase-js';

// Initializes service role client to securely handle database upserts
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL, 
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const LEAGUES = ['PL', 'CL', 'WC'];

export async function forceDirectAPISync() {
  try {
    for (const code of LEAGUES) {
      const apiRes = await fetch(`https://api.football-data.org/v4/competitions/${code}/matches`, {
        headers: { 'X-Auth-Token': process.env.FOOTBALL_DATA_API_KEY },
        next: { revalidate: 0 }
      });

      if (!apiRes.ok) continue;
      const data = await apiRes.json();

      // 1. Core competition save
      await supabase.from('competitions').upsert({
        id: data.competition.id,
        name: data.competition.name,
        code: data.competition.code,
        emblem: data.competition.emblem
      });

      // 2. Map match structural payloads
      const mapped = data.matches.map(m => ({
        id: m.id,
        competition_id: data.competition.id,
        utc_date: m.utcDate,
        status: m.status,
        matchday: m.matchday,
        stage: m.stage,
        home_team: m.homeTeam.name,
        away_team: m.awayTeam.name,
        home_score: m.score.fullTime.home ?? null,
        away_score: m.score.fullTime.away ?? null,
        winner: m.score.winner ?? null
      }));

      // 3. Database Sync
      await supabase.from('matches').upsert(mapped);
    }

    return { success: true, message: "Successfully synced directly from external API!" };
  } catch (error) {
    return { success: false, error: error.message };
  }
}