import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

export async function GET(request) {
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { data: finishedMatches } = await supabase.from('matches').select('*').eq('status', 'FINISHED');
    if (!finishedMatches || finishedMatches.length === 0) {
      return NextResponse.json({ message: 'No finished matches to process' });
    }

    const { data: predictions } = await supabase.from('predictions').select('*, pools(*)').eq('calculated', false);

    for (const pred of predictions) {
      const match = finishedMatches.find(m => m.id === pred.match_id);
      if (!match) continue;

      let pointsEarned = 0;
      const pool = pred.pools;

      const exactMatch = (pred.home_prediction === match.home_score) && (pred.away_prediction === match.away_score);
      const predWinner = pred.home_prediction > pred.away_prediction ? 'HOME_TEAM' : pred.home_prediction < pred.away_prediction ? 'AWAY_TEAM' : 'DRAW';
      const actualWinner = match.winner;
      
      const correctOutcome = predWinner === actualWinner;
      const exactGoalDiff = (pred.home_prediction - pred.away_prediction) === (match.home_score - match.away_score);

      if (exactMatch) pointsEarned = pool.pts_exact_score;
      else if (correctOutcome && exactGoalDiff) pointsEarned = pool.pts_goal_diff;
      else if (correctOutcome) pointsEarned = pool.pts_outcome;

      await supabase.from('predictions').update({ points_earned: pointsEarned, calculated: true }).eq('id', pred.id);
      await supabase.rpc('increment_pool_points', { p_pool_id: pred.pool_id, p_user_id: pred.user_id, p_points: pointsEarned });
    }
    return NextResponse.json({ success: true, processed: predictions.length });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}