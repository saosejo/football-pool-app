import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const LEAGUES = ['PL', 'CL', 'WC']; 

export async function GET(request) {
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    for (const code of LEAGUES) {
      const apiRes = await fetch(`https://api.football-data.org/v4/competitions/${code}/matches`, {
        headers: { 'X-Auth-Token': process.env.FOOTBALL_DATA_API_KEY },
        next: { revalidate: 0 }
      });
      if (!apiRes.ok) continue;
      const data = await apiRes.json();

      await supabase.from('competitions').upsert({
        id: data.competition.id,
        name: data.competition.name,
        code: data.competition.code,
        emblem: data.competition.emblem
      });

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

      await supabase.from('matches').upsert(mapped);
    }
    return NextResponse.json({ success: true, message: 'Fixtures populated successfully' });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}