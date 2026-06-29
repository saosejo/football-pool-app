'use client';
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { forceDirectAPISync } from '@/app/actions/adminSync';

export default function Home() {
  const [user, setUser] = useState(null);
  const [authMode, setAuthMode] = useState('login'); 
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');

  // App Business States
  const [myPools, setMyPools] = useState([]);
  const [activePool, setActivePool] = useState(null);
  const [matches, setMatches] = useState([]);
  const [leaderboard, setLeaderboard] = useState([]);
  const [predictions, setPredictions] = useState({});

  // Group Creation/Join UI States
  const [createTitle, setCreateTitle] = useState('');
  const [joinCode, setJoinCode] = useState('');
  const [exactPts, setExactPts] = useState(5);
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

  // Fetches only the groups/parties the current user has explicitly joined
  const fetchUserPools = async (userId) => {
    const { data, error } = await supabase
      .from('pool_participants')
      .select('pools(*)')
      .eq('user_id', userId);
    
    if (data) setMyPools(data.map(item => item.pools).filter(Boolean));
  };

  const handleEmailAuth = async (e) => {
    e.preventDefault();
    setLoading(true);
    setMessage('');
    const { error } = authMode === 'signup' 
      ? await supabase.auth.signUp({ email, password, options: { emailRedirectTo: window.location.origin } })
      : await supabase.auth.signInWithPassword({ email, password });

    if (error) setMessage(`❌ ${error.message}`);
    else if (authMode === 'signup') setMessage('✉️ Check your inbox to verify your email!');
    setLoading(false);
  };

  const selectPool = async (pool) => {
    setActivePool(pool);
    
    // Fetch global match fixtures
    const { data: mData } = await supabase.from('matches').select('*').order('utc_date', { ascending: true }).limit(20);
    setMatches(mData || []);

    // Fetch group-isolated leaderboard
    const { data: lData } = await supabase
      .from('pool_participants')
      .select('total_points, profiles(username)')
      .eq('pool_id', pool.id)
      .order('total_points', { ascending: false });
    setLeaderboard(lData || []);

    // Fetch user's existing predictions unique to THIS specific pool group
    const { data: pData } = await supabase
      .from('predictions')
      .select('*')
      .eq('pool_id', pool.id)
      .eq('user_id', user.id);
    
    const predMap = {};
    pData?.forEach(p => {
      predMap[p.match_id] = { home: p.home_prediction, away: p.away_prediction };
    });
    setPredictions(predMap);
  };

  const createGroupPool = async (e) => {
    e.preventDefault();
    if (!createTitle) return;

    // 1. Create the standalone pool group with custom point metrics
    const { data: poolData, error: pErr } = await supabase.from('pools').insert({
      title: createTitle,
      created_by: user.id,
      scope: 'tournament',
      pts_exact_score: parseInt(exactPts),
      pts_goal_diff: Math.ceil(exactPts / 2),
      pts_outcome: Math.floor(exactPts / 2)
    }).select().single();

    if (pErr) return alert(pErr.message);

    // 2. Automatically join the creator to their own group party
    await supabase.from('pool_participants').insert({ pool_id: poolData.id, user_id: user.id });
    
    alert(`🎉 Group created! Share this Join Code with friends:\n${poolData.id}`);
    setCreateTitle('');
    fetchUserPools(user.id);
  };

  const joinGroupPool = async (e) => {
    e.preventDefault();
    if (!joinCode) return;

    const { error } = await supabase.from('pool_participants').insert({
      pool_id: joinCode.trim(),
      user_id: user.id
    });

    if (error) alert('❌ Invalid Group Code or you are already in this group party.');
    else {
      alert('🚀 Successfully joined group party!');
      setJoinCode('');
      fetchUserPools(user.id);
    }
  };

  const savePrediction = async (matchId) => {
    const pred = predictions[matchId];
    if (!pred?.home || !pred?.away) return alert('Enter scores first!');

    const { error } = await supabase.from('predictions').upsert({
      pool_id: activePool.id,
      user_id: user.id,
      match_id: matchId,
      home_prediction: parseInt(pred.home),
      away_prediction: parseInt(pred.away)
    });

    if (error) alert(error.message);
    else alert('Prediction locked for this group!');
  };

  const triggerMasterFixtureSync = async () => {
    setSyncLoading(true);
    const res = await forceDirectAPISync();
    alert(res.success ? '🔄 Master match fixtures updated across all pools!' : `❌ Error: ${res.error}`);
    if (activePool) selectPool(activePool);
    setSyncLoading(false);
  };

  if (!user) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-900 p-4">
        <div className="w-full max-w-md bg-slate-800 p-8 rounded-2xl shadow-2xl border border-slate-700 space-y-6 text-white">
          <div className="text-center">
            <h2 className="text-3xl font-black tracking-tight">⚽ Party Pools</h2>
            <p className="text-sm text-slate-400 mt-1">Create private prediction groups for you and your friends</p>
          </div>
          <div className="flex border-b border-slate-700">
            <button className={`flex-1 pb-2 font-bold ${authMode === 'login' ? 'border-b-2 border-blue-500 text-blue-500' : 'text-slate-500'}`} onClick={() => setAuthMode('login')}>Log In</button>
            <button className={`flex-1 pb-2 font-bold ${authMode === 'signup' ? 'border-b-2 border-blue-500 text-blue-500' : 'text-slate-500'}`} onClick={() => setAuthMode('signup')}>Sign Up</button>
          </div>
          <form onSubmit={handleEmailAuth} className="space-y-4 text-slate-900">
            <input type="email" required placeholder="Email Address" className="w-full p-3 rounded-xl bg-slate-100" value={email} onChange={e=>setEmail(e.target.value)}/>
            <input type="password" required placeholder="Password" className="w-full p-3 rounded-xl bg-slate-100" value={password} onChange={e=>setPassword(e.target.value)}/>
            <button type="submit" className="w-full bg-blue-600 hover:bg-blue-700 text-white p-3 rounded-xl font-bold transition">{authMode === 'login' ? 'Enter Arena' : 'Register Account'}</button>
          </form>
          {message && <div className="p-3 bg-slate-700 text-blue-400 rounded-xl text-xs text-center">{message}</div>}
          <button type="button" onClick={() => supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: window.location.origin } })} className="w-full bg-white text-slate-900 p-3 rounded-xl font-bold flex items-center justify-center gap-2 transition hover:bg-slate-100">
            Continue with Gmail
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 flex flex-col font-sans">
      <header className="bg-slate-800 border-b border-slate-700 px-6 py-4 flex justify-between items-center shadow-md">
        <h1 className="text-xl font-black tracking-tight flex items-center gap-2 text-blue-400">🏆 Private Groups Arena</h1>
        <div className="flex items-center gap-4 text-xs">
          <span className="bg-slate-700 text-slate-300 px-3 py-1.5 rounded-full font-semibold">{user.email}</span>
          <button onClick={triggerMasterFixtureSync} disabled={syncLoading} className="text-amber-400 hover:underline">{syncLoading ? 'Syncing...' : '🔄 Update Global Scores'}</button>
          <button onClick={() => supabase.auth.signOut()} className="text-red-400 font-bold hover:underline">Sign Out</button>
        </div>
      </header>

      <main className="flex-1 p-6 grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* LEFT COLUMN: GROUP MANIPULATION PORTS */}
        <div className="space-y-6">
          {/* Create Group Party */}
          <div className="bg-slate-800 p-4 rounded-xl border border-slate-700 space-y-3">
            <h3 className="font-extrabold text-xs uppercase tracking-wider text-blue-400">Create New Party Group</h3>
            <form onSubmit={createGroupPool} className="space-y-2">
              <input type="text" required placeholder="Group Name (e.g. World Cup Office)" className="w-full p-2 text-sm rounded bg-slate-900 border border-slate-700 text-white" value={createTitle} onChange={e=>setCreateTitle(e.target.value)}/>
              <div>
                <label className="text-[10px] text-slate-400 font-bold block uppercase mb-1">Exact Score Reward Points</label>
                <input type="number" min="1" max="50" className="w-full p-2 text-sm rounded bg-slate-900 border border-slate-700 text-white" value={exactPts} onChange={e=>setExactPts(e.target.value)}/>
              </div>
              <button type="submit" className="w-full bg-blue-600 text-xs font-bold p-2 rounded hover:bg-blue-700 transition text-white">Initialize Group</button>
            </form>
          </div>

          {/* Join Existing Group Party */}
          <div className="bg-slate-800 p-4 rounded-xl border border-slate-700 space-y-3">
            <h3 className="font-extrabold text-xs uppercase tracking-wider text-purple-400">Join Friend's Group Party</h3>
            <form onSubmit={joinGroupPool} className="flex gap-2">
              <input type="text" required placeholder="Paste Group ID Code..." className="flex-1 p-2 text-sm rounded bg-slate-900 border border-slate-700 text-white" value={joinCode} onChange={e=>setJoinCode(e.target.value)}/>
              <button type="submit" className="bg-purple-600 text-xs font-bold px-4 rounded hover:bg-purple-700 transition text-white">Join</button>
            </form>
          </div>

          {/* User's Current Parties Navigation */}
          <div className="bg-slate-800 p-4 rounded-xl border border-slate-700 space-y-2">
            <h3 className="font-extrabold text-xs uppercase tracking-wider text-slate-400">My Active Party Circles</h3>
            {myPools.map(p => (
              <button key={p.id} onClick={() => selectPool(p)} className={`w-full text-left p-3 rounded-lg transition font-medium text-sm flex justify-between items-center ${activePool?.id === p.id ? 'bg-blue-600 text-white shadow' : 'bg-slate-900 text-slate-300 hover:bg-slate-700'}`}>
                <span>👥 {p.title}</span>
                <span className="text-[10px] bg-black/30 px-1.5 py-0.5 rounded text-slate-400">Rules: {p.pts_exact_score}pts</span>
              </button>
            ))}
          </div>
        </div>

        {/* COMPONENT VIEWS LAYER */}
        {activePool ? (
          <>
            {/* CENTRAL WORKSPACE: MATCH FIXTURES LIST */}
            <div className="lg:col-span-2 space-y-4">
              <div className="bg-slate-800 p-4 rounded-xl border border-slate-700">
                <h2 className="text-xl font-black">{activePool.title}</h2>
                <p className="text-xs text-slate-400 mt-1 select-all cursor-pointer">Group Invite Code ID: <span className="text-blue-400 font-mono font-bold">{activePool.id}</span></p>
              </div>

              <div className="space-y-3">
                {matches.map(match => {
                  const isLocked = new Date(match.utc_date) <= new Date();
                  const currentPred = predictions[match.id] || { home: '', away: '' };

                  return (
                    <div key={match.id} className="p-4 bg-slate-800 rounded-xl border border-slate-700 flex items-center justify-between gap-4 shadow-md">
                      <div className="w-1/3 text-right truncate">
                        <span className="text-xs font-bold block">{match.home_team}</span>
                        {match.home_score !== null && <span className="text-xs text-slate-400">Actual: {match.home_score}</span>}
                      </div>

                      <div className="flex items-center gap-1 bg-slate-900 p-2 rounded-lg border border-slate-700">
                        <input type="number" min="0" disabled={isLocked} placeholder="-" className="w-10 p-1 text-center bg-slate-800 text-white border border-slate-600 rounded disabled:opacity-50" value={currentPred.home} onChange={e => setPredictions({...predictions, [match.id]: {...currentPred, home: e.target.value}})}/>
                        <span className="text-xs text-slate-500 font-bold mx-1">:</span>
                        <input type="number" min="0" disabled={isLocked} placeholder="-" className="w-10 p-1 text-center bg-slate-800 text-white border border-slate-600 rounded disabled:opacity-50" value={currentPred.away} onChange={e => setPredictions({...predictions, [match.id]: {...currentPred, away: e.target.value}})}/>
                      </div>

                      <div className="w-1/3 text-left truncate">
                        <span className="text-xs font-bold block">{match.away_team}</span>
                        {match.away_score !== null && <span className="text-xs text-slate-400">Actual: {match.away_score}</span>}
                      </div>

                      <button onClick={() => savePrediction(match.id)} disabled={isLocked} className="bg-blue-600 text-white text-xs px-4 py-2 rounded-lg font-bold hover:bg-blue-700 transition disabled:bg-slate-700 disabled:text-slate-500">
                        {isLocked ? 'Locked' : 'Save'}
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* RIGHT WORKSPACE: GROUP STANDINGS */}
            <div className="bg-slate-800 p-4 rounded-xl border border-slate-700 h-fit space-y-4">
              <h3 className="font-extrabold text-sm uppercase tracking-wider text-emerald-400 border-b border-slate-700 pb-2">Group Circle Standings</h3>
              <div className="divide-y divide-slate-700">
                {leaderboard.map((row, index) => (
                  <div key={index} className="flex justify-between py-3 text-sm items-center">
                    <span className="text-slate-300 font-medium">{index + 1}. {row.profiles?.username || 'Challenger'}</span>
                    <span className="text-emerald-400 bg-emerald-950 border border-emerald-800 px-3 py-1 rounded-md text-xs font-black">{row.total_points} PTS</span>
                  </div>
                ))}
              </div>
            </div>
          </>
        ) : (
          <div className="lg:col-span-3 flex flex-col items-center justify-center text-slate-500 p-16 bg-slate-800 rounded-2xl border border-dashed border-slate-700">
            <span className="text-5xl mb-4">👥</span>
            <p className="text-sm font-bold">Select an active friend party circle or create a brand new one to check prediction schedules!</p>
          </div>
        )}
      </main>
    </div>
  );
}