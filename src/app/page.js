'use client';
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { forceDirectAPISync } from '@/app/actions/adminSync';

const AVAILABLE_COMPETITIONS = [
  { id: 2021, code: 'PL', name: 'Premier League 🏴󠁧󠁢󠁥󠁮󠁧󠁿' },
  { id: 2001, code: 'CL', name: 'Champions League 🇪🇺' },
  { id: 2000, code: 'WC', name: 'FIFA World Cup 🏆' }
];

export default function Home() {
  const [user, setUser] = useState(null);
  const [authMode, setAuthMode] = useState('login'); 
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');

  // Business App States
  const [myPools, setMyPools] = useState([]);
  const [activePool, setActivePool] = useState(null);
  const [matches, setMatches] = useState([]);
  const [leaderboard, setLeaderboard] = useState([]);
  const [predictions, setPredictions] = useState({});

  // Wizard Creation Configuration States
  const [createTitle, setCreateTitle] = useState('');
  const [selectedCompId, setSelectedCompId] = useState(2021);
  const [scopeMode, setScopeMode] = useState('all'); // 'all' or 'custom'
  const [wizardMatches, setWizardMatches] = useState([]);
  const [selectedMatchIds, setSelectedMatchIds] = useState([]);
  const [exactPts, setExactPts] = useState(5);
  const [joinCode, setJoinCode] = useState('');
  const [syncLoading, setSyncLoading] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
      if (session?.user) fetchUserPools(session.user.id);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
      if (session?.user) fetchUserPools(session.user.id);
      else setMyPools([]);
    });
    return () => subscription.unsubscribe();
  }, []);

  // Fetch matches to show in creation wizard when league selection changes
  useEffect(() => {
    if (scopeMode === 'custom' && user) {
      supabase.from('matches')
        .select('*')
        .eq('competition_id', selectedCompId)
        .order('utc_date', { ascending: true })
        .then(({ data }) => setWizardMatches(data || []));
    }
  }, [selectedCompId, scopeMode, user]);

  const fetchUserPools = async (userId) => {
    const { data } = await supabase
      .from('pool_participants')
      .select('pools(*)')
      .eq('user_id', userId);
    if (data) setMyPools(data.map(item => item.pools).filter(Boolean));
  };

  const handleEmailAuth = async (e) => {
    e.preventDefault();
    setLoading(true);
    const { error } = authMode === 'signup' 
      ? await supabase.auth.signUp({ email, password, options: { emailRedirectTo: window.location.origin } })
      : await supabase.auth.signInWithPassword({ email, password });
    if (error) alert(error.message);
    setLoading(false);
  };

  const selectPool = async (pool) => {
    setActivePool(pool);
    
    // Fetch scope-aware matches for active pool selection
    let mData = [];
    if (pool.match_scope === 'all') {
      const { data } = await supabase.from('matches').select('*').eq('competition_id', pool.competition_id).order('utc_date', { ascending: true });
      mData = data || [];
    } else {
      const { data } = await supabase.from('pool_matches').select('matches(*)').eq('pool_id', pool.id);
      mData = data?.map(d => d.matches).filter(Boolean) || [];
    }
    setMatches(mData);

    // Fetch localized leaderboard matrix
    const { data: lData } = await supabase.from('pool_participants').select('total_points, profiles(username)').eq('pool_id', pool.id).order('total_points', { ascending: false });
    setLeaderboard(lData || []);

    // Fetch user predictions mapped for this pool
    const { data: pData } = await supabase.from('predictions').select('*').eq('pool_id', pool.id).eq('user_id', user.id);
    const predMap = {};
    pData?.forEach(p => { predMap[p.match_id] = { home: p.home_prediction, away: p.away_prediction }; });
    setPredictions(predMap);
  };

  const toggleWizardMatch = (id) => {
    setSelectedMatchIds(prev => prev.includes(id) ? prev.filter(mId => mId !== id) : [...prev, id]);
  };

  const createGroupPool = async (e) => {
    e.preventDefault();
    if (!createTitle) return;
    if (scopeMode === 'custom' && selectedMatchIds.length === 0) return alert('Select at least one match for this pool configuration!');

    // 1. Write the base parent pool properties
    const { data: poolData, error: pErr } = await supabase.from('pools').insert({
      title: createTitle,
      created_by: user.id,
      competition_id: selectedCompId,
      match_scope: scopeMode,
      pts_exact_score: parseInt(exactPts),
      pts_goal_diff: Math.ceil(exactPts / 2),
      pts_outcome: Math.floor(exactPts / 2)
    }).select().single();

    if (pErr) return alert(pErr.message);

    // 2. If scope is custom, map match selections into pool_matches
    if (scopeMode === 'custom') {
      const joinRows = selectedMatchIds.map(mId => ({ pool_id: poolData.id, match_id: mId }));
      await supabase.from('pool_matches').insert(joinRows);
    }

    // 3. Auto join admin to their participant array
    await supabase.from('pool_participants').insert({ pool_id: poolData.id, user_id: user.id });
    
    alert(`🎉 Custom Party initialized! Share Group Invite Code ID:\n${poolData.id}`);
    setCreateTitle('');
    setSelectedMatchIds([]);
    fetchUserPools(user.id);
  };

  const joinGroupPool = async (e) => {
    e.preventDefault();
    if (!joinCode) return;
    const { error } = await supabase.from('pool_participants').insert({ pool_id: joinCode.trim(), user_id: user.id });
    if (error) alert('❌ Invalid code configuration or already joined.');
    else { alert('🚀 Joined friend circle!'); setJoinCode(''); fetchUserPools(user.id); }
  };

  const savePrediction = async (matchId) => {
    const pred = predictions[matchId];
    if (!pred?.home || !pred?.away) return alert('Enter score values!');
    const { error } = await supabase.from('predictions').upsert({
      pool_id: activePool.id, user_id: user.id, match_id: matchId,
      home_prediction: parseInt(pred.home), away_prediction: parseInt(pred.away)
    });
    if (error) alert(error.message); else alert('Prediction saved securely!');
  };

  if (!user) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-900 text-white p-4">
        <form onSubmit={handleEmailAuth} className="w-full max-w-md bg-slate-800 p-8 rounded-2xl border border-slate-700 space-y-4">
          <h2 className="text-2xl font-black text-center">⚽ MatchDay Private Arenas</h2>
          <div className="flex border-b border-slate-700 text-sm">
            <button type="button" className={`flex-1 pb-2 font-bold ${authMode === 'login' ? 'text-blue-500 border-b-2 border-blue-500' : 'text-slate-400'}`} onClick={() => setAuthMode('login')}>Login</button>
            <button type="button" className={`flex-1 pb-2 font-bold ${authMode === 'signup' ? 'text-blue-500 border-b-2 border-blue-500' : 'text-slate-400'}`} onClick={() => setAuthMode('signup')}>Register</button>
          </div>
          <input type="email" placeholder="Email" className="w-full p-3 rounded-xl bg-slate-900 border text-sm" value={email} onChange={e=>setEmail(e.target.value)}/>
          <input type="password" placeholder="Password" className="w-full p-3 rounded-xl bg-slate-900 border text-sm" value={password} onChange={e=>setPassword(e.target.value)}/>
          <button className="w-full bg-blue-600 p-3 rounded-xl font-bold hover:bg-blue-700">{authMode === 'login' ? 'Login' : 'Sign Up'}</button>
        </form>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 flex flex-col font-sans">
      <header className="bg-slate-800 border-b border-slate-700 px-6 py-4 flex justify-between items-center shadow-md">
        <h1 className="text-xl font-black tracking-tight text-blue-400">🏆 Tailored Party Pools</h1>
        <div className="flex items-center gap-4 text-xs">
          <span className="text-slate-400 font-medium">{user.email}</span>
          <button onClick={async () => { setSyncLoading(true); await forceDirectAPISync(); alert('Fixtures synced!'); setSyncLoading(false); }} className="text-amber-400 hover:underline">{syncLoading ? 'Syncing...' : '🔄 Pull Live Results'}</button>
          <button onClick={() => supabase.auth.signOut()} className="text-red-400 font-bold hover:underline">Sign Out</button>
        </div>
      </header>

      <main className="flex-1 p-6 grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* LEFT COLUMN: CONFIGURE PARTY SPECIFICATION */}
        <div className="space-y-6 overflow-y-auto max-h-[85vh] pr-1">
          {/* Create custom scoped group */}
          <div className="bg-slate-800 p-4 rounded-xl border border-slate-700 space-y-3">
            <h3 className="font-extrabold text-xs uppercase tracking-wider text-blue-400">Setup Party Bracket</h3>
            <form onSubmit={createGroupPool} className="space-y-3 text-xs">
              <div>
                <label className="text-[10px] text-slate-400 font-bold uppercase block mb-1">Party Name</label>
                <input type="text" required placeholder="Group Name..." className="w-full p-2 rounded bg-slate-900 border border-slate-700 text-white" value={createTitle} onChange={e=>setCreateTitle(e.target.value)}/>
              </div>

              <div>
                <label className="text-[10px] text-slate-400 font-bold uppercase block mb-1">Target Tournament</label>
                <select className="w-full p-2 rounded bg-slate-900 border border-slate-700 text-white" value={selectedCompId} onChange={e=>setSelectedCompId(parseInt(e.target.value))}>
                  {AVAILABLE_COMPETITIONS.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>

              <div>
                <label className="text-[10px] text-slate-400 font-bold uppercase block mb-1">Match Scope Rules</label>
                <div className="flex gap-2">
                  <button type="button" className={`flex-1 p-2 rounded border font-bold ${scopeMode === 'all' ? 'bg-blue-600 border-blue-500' : 'bg-slate-900 border-slate-700'}`} onClick={() => setScopeMode('all')}>Whole League</button>
                  <button type="button" className={`flex-1 p-2 rounded border font-bold ${scopeMode === 'custom' ? 'bg-purple-600 border-purple-500' : 'bg-slate-900 border-slate-700'}`} onClick={() => setScopeMode('custom')}>Custom Set</button>
                </div>
              </div>

              {/* Collapsible scroll view to pick match boundaries if custom is clicked */}
              {scopeMode === 'custom' && (
                <div className="border border-slate-700 rounded p-2 bg-slate-900 space-y-1 max-h-40 overflow-y-auto">
                  <label className="text-[9px] text-slate-400 font-bold block uppercase border-b border-slate-700 pb-1 mb-1">Select Active Matches ({selectedMatchIds.length})</label>
                  {wizardMatches.map(m => (
                    <label key={m.id} className="flex items-center gap-2 p-1 hover:bg-slate-800 rounded cursor-pointer text-[11px]">
                      <input type="checkbox" checked={selectedMatchIds.includes(m.id)} onChange={() => toggleWizardMatch(m.id)} />
                      <span className="truncate flex-1 text-slate-300">{m.home_team} vs {m.away_team}</span>
                    </label>
                  ))}
                  {wizardMatches.length === 0 && <p className="text-[10px] text-slate-500 italic">No games found. Pull results first.</p>}
                </div>
              )}

              <div>
                <label className="text-[10px] text-slate-400 font-bold uppercase block mb-1">Exact Score Reward</label>
                <input type="number" min="1" className="w-full p-2 rounded bg-slate-900 border border-slate-700 text-white" value={exactPts} onChange={e=>setExactPts(e.target.value)}/>
              </div>

              <button type="submit" className="w-full bg-blue-600 font-bold p-2.5 rounded hover:bg-blue-700 transition text-white">Generate Pool</button>
            </form>
          </div>

          <div className="bg-slate-800 p-4 rounded-xl border border-slate-700 space-y-2">
            <h3 className="font-extrabold text-xs uppercase tracking-wider text-slate-400">My Party Rooms</h3>
            {myPools.map(p => (
              <button key={p.id} onClick={() => selectPool(p)} className={`w-full text-left p-3 rounded-lg transition text-xs flex flex-col gap-1 ${activePool?.id === p.id ? 'bg-blue-600 text-white shadow' : 'bg-slate-900 text-slate-300 hover:bg-slate-700'}`}>
                <span className="font-bold text-sm">👥 {p.title}</span>
                <span className="opacity-70 font-mono text-[10px]">Scope: {p.match_scope === 'all' ? 'Full Tournament' : 'Selected Matches'} ({p.pts_exact_score} pts)</span>
              </button>
            ))}
          </div>
        </div>

        {/* WORKSPACE LOGIC VIEWS */}
        {activePool ? (
          <>
            <div className="lg:col-span-2 space-y-4">
              <div className="bg-slate-800 p-4 rounded-xl border border-slate-700">
                <h2 className="text-xl font-black text-white">{activePool.title}</h2>
                <p className="text-xs text-slate-400 mt-1 select-all cursor-pointer">Invite Friends Token: <span className="text-blue-400 font-mono font-bold">{activePool.id}</span></p>
              </div>

              <div className="space-y-3 max-h-[70vh] overflow-y-auto pr-1">
                {matches.map(match => {
                  const isLocked = new Date(match.utc_date) <= new Date();
                  const currentPred = predictions[match.id] || { home: '', away: '' };

                  return (
                    <div key={match.id} className="p-4 bg-slate-800 rounded-xl border border-slate-700 flex items-center justify-between gap-4 shadow-md">
                      <div className="w-1/3 text-right truncate">
                        <span className="text-xs font-bold block text-slate-200">{match.home_team}</span>
                        {match.home_score !== null && <span className="text-[10px] text-slate-400 bg-slate-900/50 px-1 py-0.5 rounded">Result: {match.home_score}</span>}
                      </div>

                      <div className="flex items-center gap-1 bg-slate-900 p-1.5 rounded-lg border border-slate-700">
                        <input type="number" min="0" disabled={isLocked} className="w-9 p-1 text-xs text-center bg-slate-800 text-white border border-slate-600 rounded" value={currentPred.home} onChange={e => setPredictions({...predictions, [match.id]: {...currentPred, home: e.target.value}})}/>
                        <span className="text-xs text-slate-500 font-bold">:</span>
                        <input type="number" min="0" disabled={isLocked} className="w-9 p-1 text-xs text-center bg-slate-800 text-white border border-slate-600 rounded" value={currentPred.away} onChange={e => setPredictions({...predictions, [match.id]: {...currentPred, away: e.target.value}})}/>
                      </div>

                      <div className="w-1/3 text-left truncate">
                        <span className="text-xs font-bold block text-slate-200">{match.away_team}</span>
                        {match.away_score !== null && <span className="text-[10px] text-slate-400 bg-slate-900/50 px-1 py-0.5 rounded">Result: {match.away_score}</span>}
                      </div>

                      <button onClick={() => savePrediction(match.id)} disabled={isLocked} className="bg-blue-600 text-white text-[11px] px-3 py-1.5 rounded-md font-bold hover:bg-blue-700 transition disabled:bg-slate-700 disabled:text-slate-500">
                        {isLocked ? 'Locked' : 'Save'}
                      </button>
                    </div>
                  );
                })}
                {matches.length === 0 && <p className="text-xs text-slate-500 italic p-6 text-center">No active games loaded inside this pool configuration parameters.</p>}
              </div>
            </div>

            {/* RIGHT SIDEBAR: LOCAL LEADERBOARD */}
            <div className="bg-slate-800 p-4 rounded-xl border border-slate-700 h-fit space-y-4">
              <h3 className="font-extrabold text-xs uppercase tracking-wider text-emerald-400 border-b border-slate-700 pb-2">Party Leaderboard</h3>
              <div className="divide-y divide-slate-700">
                {leaderboard.map((row, index) => (
                  <div key={index} className="flex justify-between py-2.5 text-sm items-center">
                    <span className="text-slate-300 font-medium">{index + 1}. {row.profiles?.username || 'Challenger'}</span>
                    <span className="text-emerald-400 bg-emerald-950/40 border border-emerald-900 px-2 py-0.5 rounded text-xs font-black">{row.total_points} PTS</span>
                  </div>
                ))}
              </div>
            </div>
          </>
        ) : (
          <div className="lg:col-span-3 bg-slate-800 p-12 rounded-2xl border border-dashed border-slate-700 flex flex-col items-center justify-center text-slate-500 text-center">
            <span className="text-4xl mb-3">🎮</span>
            <p className="text-sm font-bold">Select an operational party lobby or use the left panel tool to design a brand-new game setup!</p>
          </div>
        )}
      </main>
    </div>
  );
}