'use client';

import React, { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
const supabaseClient = supabaseUrl && supabaseAnonKey ? createClient(supabaseUrl, supabaseAnonKey) : null;

export default function PoolDetailsPage() {
  const { id } = useParams(); // Grabs the pool ID from the URL
  const router = useRouter();
  
  const [pool, setPool] = useState(null);
  const [matches, setMatches] = useState([]);
  const [picks, setPicks] = useState({}); // Stores { match_id: { home: 0, away: 0 } }
  
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [currentUser, setCurrentUser] = useState(null);

  useEffect(() => {
    async function loadPoolData() {
      if (!supabaseClient || !id) return;

      // 1. Authenticate user
      const { data: { user } } = await supabaseClient.auth.getUser();
      if (!user) {
        alert("You must be logged in to view this pool.");
        router.push('/');
        return;
      }
      setCurrentUser(user);

      try {
        // 2. Fetch Pool Details
        const { data: poolData, error: poolError } = await supabaseClient
          .from('pools')
          .select('*')
          .eq('id', id)
          .single();
        
        if (poolError) throw poolError;
        setPool(poolData);

        // 3. Fetch connected match IDs from junction table
        const { data: junctionData, error: junctionError } = await supabaseClient
          .from('pool_matches')
          .select('match_id')
          .eq('pool_id', id);

        if (junctionError) throw junctionError;

        const matchIds = junctionData.map(j => j.match_id);

        if (matchIds.length > 0) {
          // 4. Fetch the actual match details
          const { data: matchData, error: matchError } = await supabaseClient
            .from('matches')
            .select('*')
            .in('id', matchIds)
            .order('utc_date', { ascending: true });
            
          if (matchError) throw matchError;
          setMatches(matchData);
        }
      } catch (err) {
        console.error("Error loading pool:", err);
      } finally {
        setLoading(false);
      }
    }

    loadPoolData();
  }, [id, router]);

  const handleScoreChange = (matchId, team, value) => {
    const numValue = value === '' ? '' : parseInt(value, 10);
    setPicks(prev => ({
      ...prev,
      [matchId]: {
        ...prev[matchId],
        [team]: numValue
      }
    }));
  };

  const handleSavePicks = async () => {
    if (!supabaseClient || !currentUser) return;
    setSaving(true);

    try {
      // Format predictions for database insertion
      const predictionsPayload = Object.entries(picks).map(([matchId, scores]) => ({
        user_id: currentUser.id,
        pool_id: id,
        match_id: parseInt(matchId),
        home_score: scores.home !== '' ? scores.home : 0,
        away_score: scores.away !== '' ? scores.away : 0,
        updated_at: new Date().toISOString()
      }));

      if (predictionsPayload.length === 0) {
        alert("Please make at least one prediction before saving.");
        setSaving(false);
        return;
      }

      // NOTE: Ensure you have a table named 'predictions' to store these!
      // If your table is named 'picks' or something else, change 'predictions' below.
      const { error } = await supabaseClient
        .from('predictions')
        .upsert(predictionsPayload, { 
          onConflict: 'user_id, pool_id, match_id' // Requires a unique constraint on these 3 columns in DB
        });

      if (error) throw error;
      
      alert('✅ Predictions saved successfully!');
    } catch (err) {
      console.error(err);
      alert('❌ Failed to save predictions. Check console for details.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="min-h-screen bg-slate-950 text-white flex items-center justify-center">Loading Pool...</div>;
  }

  if (!pool) {
    return <div className="min-h-screen bg-slate-950 text-white flex items-center justify-center">Pool not found.</div>;
  }

  return (
    <main className="min-h-screen bg-slate-950 text-white p-6 md:p-10">
      <div className="max-w-3xl mx-auto space-y-6">
        
        {/* Header */}
        <div className="flex items-center gap-4 border-b border-slate-800 pb-4">
          <Link href="/" className="text-slate-400 hover:text-white transition">← Back</Link>
          <div>
            <h1 className="text-2xl font-extrabold">{pool.title}</h1>
            <p className="text-xs text-slate-400 font-mono mt-1">Pool ID: {pool.id}</p>
          </div>
        </div>

        {/* Prediction UI */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 shadow-2xl">
          <div className="flex justify-between items-center mb-6">
            <h2 className="font-bold text-lg">Make Your Picks</h2>
            <span className="text-xs bg-slate-800 px-2 py-1 rounded text-slate-300">
              {matches.length} Matches
            </span>
          </div>

          <div className="space-y-3">
            {matches.map(match => (
              <div key={match.id} className="flex flex-col md:flex-row items-center justify-between bg-slate-950 border border-slate-800 p-4 rounded-lg hover:border-slate-700 transition">
                
                {/* Match Info */}
                <div className="text-center md:text-left mb-4 md:mb-0 w-full md:w-1/3">
                  <p className="text-[10px] text-slate-500 uppercase tracking-wider font-bold mb-1">
                    {new Date(match.utc_date).toLocaleDateString()}
                  </p>
                  <p className="text-xs text-slate-400">{match.stage}</p>
                </div>

                {/* Score Inputs */}
                <div className="flex items-center justify-center gap-4 w-full md:w-2/3">
                  <div className="flex flex-col items-center gap-2">
                    <span className="text-sm font-bold text-slate-200 truncate w-24 text-right">
                      {match.home_team}
                    </span>
                    <input 
                      type="number" 
                      min="0"
                      value={picks[match.id]?.home ?? ''}
                      onChange={(e) => handleScoreChange(match.id, 'home', e.target.value)}
                      className="w-12 h-10 text-center bg-slate-800 border border-slate-700 rounded text-lg font-bold focus:outline-none focus:border-emerald-500 transition"
                    />
                  </div>

                  <span className="text-slate-600 font-bold text-xs">VS</span>

                  <div className="flex flex-col items-center gap-2">
                    <span className="text-sm font-bold text-slate-200 truncate w-24 text-left">
                      {match.away_team}
                    </span>
                    <input 
                      type="number" 
                      min="0"
                      value={picks[match.id]?.away ?? ''}
                      onChange={(e) => handleScoreChange(match.id, 'away', e.target.value)}
                      className="w-12 h-10 text-center bg-slate-800 border border-slate-700 rounded text-lg font-bold focus:outline-none focus:border-emerald-500 transition"
                    />
                  </div>
                </div>

              </div>
            ))}

            {matches.length === 0 && (
              <p className="text-center text-slate-500 py-10">No matches found for this pool.</p>
            )}
          </div>

          <div className="mt-6 pt-6 border-t border-slate-800 flex justify-end">
            <button
              onClick={handleSavePicks}
              disabled={saving || matches.length === 0}
              className="bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-800 text-white font-bold py-3 px-8 rounded shadow-lg transition"
            >
              {saving ? 'Saving...' : 'Save Predictions'}
            </button>
          </div>
        </div>

      </div>
    </main>
  );
}