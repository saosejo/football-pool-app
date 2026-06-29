'use client';

import React, { useState, useEffect } from 'react';
import { createClient } from '@supabase/supabase-js';
// Corrected precise file path target to clear the Turbopack build error
import { forceDirectAPISync } from '@/app/actions/adminSync'; 

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
const supabaseClient = supabaseUrl && supabaseAnonKey ? createClient(supabaseUrl, supabaseAnonKey) : null;

const AVAILABLE_COMPETITIONS = [
  { id: 2021, name: 'English Premier League' },
  { id: 2014, name: 'La Liga (Spain)' },
  { id: 2019, name: 'Serie A (Italy)' },
  { id: 2002, name: 'Bundesliga (Germany)' },
  { id: 2015, name: 'Ligue 1 (France)' },
  { id: 2001, name: 'UEFA Champions League' },
  { id: 2000, name: 'FIFA World Cup' }
];

export default function PartySetupPage() {
  const [selectedCompId, setSelectedCompId] = useState(AVAILABLE_COMPETITIONS[0].id);
  const [scopeMode, setScopeMode] = useState('all'); 
  const [partyName, setPartyName] = useState('');

  const [wizardMatches, setWizardMatches] = useState([]);
  const [selectedMatchIds, setSelectedMatchIds] = useState([]);
  const [syncLoading, setSyncLoading] = useState(false);
  const [formSubmitting, setFormSubmitting] = useState(false);

  useEffect(() => {
    async function fetchLocalMatches() {
      if (!supabaseClient) return;

      const { data, error } = await supabaseClient
        .from('matches')
        .select('*')
        .eq('competition_id', selectedCompId)
        .order('utc_date', { ascending: true });

      if (!error && data) {
        setWizardMatches(data);
      } else {
        setWizardMatches([]);
      }
      setSelectedMatchIds([]);
    }
    fetchLocalMatches();
  }, [selectedCompId]);

  const toggleWizardMatch = (matchId) => {
    setSelectedMatchIds(prev =>
      prev.includes(matchId)
        ? prev.filter(id => id !== matchId)
        : [...prev, matchId]
    );
  };

  const handleLoadTournamentMatches = async () => {
    if (!supabaseClient) {
      alert('Supabase environment variables are missing configuration.');
      return;
    }
    setSyncLoading(true);
    try {
      const res = await forceDirectAPISync(selectedCompId);
      
      if (res && res.success) {
        const { data } = await supabaseClient
          .from('matches')
          .select('*')
          .eq('competition_id', selectedCompId)
          .order('utc_date', { ascending: true });
        
        setWizardMatches(data || []);
        alert('🟢 Tournament fixtures successfully loaded into database!');
      } else {
        alert(`❌ API Error: ${res?.error || 'Could not fetch tournament data.'}`);
      }
    } catch (err) {
      console.error(err);
      alert('❌ Connection failed while requesting live match ingestion.');
    } finally {
      setSyncLoading(false);
    }
  };

  const handleCreateParty = async (e) => {
    e.preventDefault();
    if (!partyName.trim()) return alert('Please enter a party name');
    if (!supabaseClient) return;

    setFormSubmitting(true);
    try {
      const finalMatches = scopeMode === 'all' 
        ? wizardMatches.map(m => m.id) 
        : selectedMatchIds;

      if (finalMatches.length === 0) {
        alert('Cannot create a prediction pool with 0 active matches. Load fixtures first!');
        setFormSubmitting(false);
        return;
      }

      const { error } = await supabaseClient
        .from('pools')
        .insert([{
          name: partyName,
          competition_id: selectedCompId,
          match_ids: finalMatches,
          created_at: new Date().toISOString()
        }]);

      if (error) throw error;

      alert('🎉 Prediction Party created successfully!');
      setPartyName('');
      setSelectedMatchIds([]);
    } catch (err) {
      console.error(err);
      alert('❌ Failed to save structural configurations.');
    } finally {
      setFormSubmitting(false);
    }
  };

  return (
    <main className="min-h-screen bg-slate-950 text-white p-6 flex flex-col items-center justify-center">
      <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-2xl space-y-5">
        
        <div>
          <h1 className="text-xl font-extrabold tracking-tight">Setup Prediction Party</h1>
          <p className="text-xs text-slate-400 mt-0.5">Initialize dynamic rules and preload target tournament schedules.</p>
        </div>

        <form onSubmit={handleCreateParty} className="space-y-4">
          
          <div className="flex flex-col gap-1">
            <label className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Party / Group Name</label>
            <input 
              type="text"
              required
              placeholder="e.g., Weekend Champions League Group"
              value={partyName}
              onChange={e => setPartyName(e.target.value)}
              className="p-2 rounded bg-slate-950 border border-slate-800 text-white text-xs focus:outline-none focus:border-blue-500 transition"
            />
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Target Tournament</label>
            <div className="flex gap-2">
              <select 
                value={selectedCompId} 
                onChange={e => setSelectedCompId(parseInt(e.target.value))}
                className="flex-1 p-2 rounded bg-slate-950 border border-slate-800 text-white text-xs focus:outline-none focus:border-blue-500 transition" 
              >
                {AVAILABLE_COMPETITIONS.map(c => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>

              <button
                type="button"
                disabled={syncLoading}
                onClick={handleLoadTournamentMatches}
                className="bg-amber-600 hover:bg-amber-700 disabled:bg-slate-800 text-white text-[11px] font-bold px-3 rounded transition flex items-center justify-center min-w-[100px]"
              >
                {syncLoading ? 'Loading...' : 'Load Matches'}
              </button>
            </div>
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Match Scope Rules</label>
            <div className="flex gap-2">
              <button 
                type="button" 
                onClick={() => setScopeMode('all')}
                className={`flex-1 p-2 rounded border text-xs font-bold transition ${scopeMode === 'all' ? 'bg-blue-600 border-blue-500 text-white' : 'bg-slate-950 border-slate-800 text-slate-400 hover:bg-slate-800'}`} 
              >
                Whole League
              </button>
              <button 
                type="button" 
                onClick={() => setScopeMode('custom')}
                className={`flex-1 p-2 rounded border text-xs font-bold transition ${scopeMode === 'custom' ? 'bg-purple-600 border-purple-500 text-white' : 'bg-slate-950 border-slate-800 text-slate-400 hover:bg-slate-800'}`} 
              >
                Custom Set
              </button>
            </div>
          </div>

          {scopeMode === 'custom' && (
            <div className="border border-slate-800 rounded p-2 bg-slate-950 space-y-2">
              <label className="text-[9px] text-slate-400 font-bold block uppercase border-b border-slate-800 pb-1">
                Select Active Matches ({selectedMatchIds.length})
              </label>
              
              <div className="max-h-44 overflow-y-auto space-y-1 pr-1">
                {wizardMatches.map(m => (
                  <label key={m.id} className="flex items-center gap-2 p-1.5 hover:bg-slate-900 rounded cursor-pointer text-[11px] transition">
                    <input 
                      type="checkbox" 
                      checked={selectedMatchIds.includes(m.id)} 
                      onChange={() => toggleWizardMatch(m.id)} 
                      className="rounded border-slate-700 bg-slate-800 text-purple-600 focus:ring-0 focus:ring-offset-0"
                    />
                    <span className="truncate flex-1 text-slate-300">
                      {m.home_team} <span className="text-slate-500 text-[9px]">vs</span> {m.away_team}
                    </span>
                  </label>
                ))}

                {wizardMatches.length === 0 && !syncLoading && (
                  <div className="text-center py-4 space-y-1">
                    <p className="text-[10px] text-slate-500 italic">No matches found in database.</p>
                    <p className="text-[9px] text-amber-500/80">Click "Load Matches" above to fetch from the API.</p>
                  </div>
                )}
              </div>
            </div>
          )}

          <button
            type="submit"
            disabled={formSubmitting || syncLoading}
            className="w-full mt-2 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-800 text-white rounded text-xs font-bold tracking-wide shadow transition"
          >
            {formSubmitting ? 'Creating Party...' : 'Create Group Prediction Party'}
          </button>

        </form>
      </div>
    </main>
  );
}