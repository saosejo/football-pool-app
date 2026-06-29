'use client';
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';

export default function Home() {
  const [user, setUser] = useState(null);
  const [authMode, setAuthMode] = useState('login'); 
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');

  // Main UI Data State
  const [pools, setPools] = useState([]);
  const [activePool, setActivePool] = useState(null);
  const [matches, setMatches] = useState([]);
  const [leaderboard, setLeaderboard] = useState([]);
  const [predictions, setPredictions] = useState({});

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });
    fetchGlobalPools();
    return () => subscription.unsubscribe();
  }, []);

  const handleEmailAuth = async (e) => {
    e.preventDefault();
    setLoading(true);
    setMessage('');
    const redirectUrl = window.location.origin;

    if (authMode === 'signup') {
      const { error } = await supabase.auth.signUp({
        email, password, options: { emailRedirectTo: redirectUrl }
      });
      if (error) setMessage(`❌ ${error.message}`);
      else setMessage('✉️ Success! Check your email inbox to verify your account.');
    } else {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) setMessage(`❌ ${error.message}`);
    }
    setLoading(false);
  };

  const handleGoogleLogin = async () => {
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: window.location.origin }
    });
  };

  const fetchGlobalPools = async () => {
    const { data } = await supabase.from('pools').select('*');
    setPools(data || []);
  };

  const selectPool = async (pool) => {
    setActivePool(pool);
    const { data: mData } = await supabase.from('matches').select('*').limit(15);
    setMatches(mData || []);

    const { data: lData } = await supabase
      .from('pool_participants')
      .select('total_points, profiles(username)')
      .eq('pool_id', pool.id)
      .order('total_points', { ascending: false });
    setLeaderboard(lData || []);
  };

  const savePrediction = async (matchId) => {
    const pred = predictions[matchId];
    if (!pred) return;
    await supabase.from('predictions').upsert({
      pool_id: activePool.id, user_id: user.id, match_id: matchId,
      home_prediction: parseInt(pred.home), away_prediction: parseInt(pred.away)
    });
    alert('Prediction saved securely!');
  };

  if (!user) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50 p-4">
        <div className="w-full max-w-md bg-white p-8 rounded-2xl shadow-xl border border-gray-100 space-y-6">
          <div className="text-center">
            <h2 className="text-3xl font-extrabold text-gray-900">🏆 Arena Pools</h2>
            <p className="text-sm text-gray-500 mt-1">Predict matches and climb the leaderboard standings</p>
          </div>
          <div className="flex border-b">
            <button className={`flex-1 pb-2 font-bold ${authMode === 'login' ? 'border-b-2 border-blue-600 text-blue-600' : 'text-gray-400'}`} onClick={() => setAuthMode('login')}>Sign In</button>
            <button className={`flex-1 pb-2 font-bold ${authMode === 'signup' ? 'border-b-2 border-blue-600 text-blue-600' : 'text-gray-400'}`} onClick={() => setAuthMode('signup')}>Sign Up</button>
          </div>
          <form onSubmit={handleEmailAuth} className="space-y-4">
            <input type="email" required placeholder="Email" className="w-full p-3 border rounded-xl" value={email} onChange={e=>setEmail(e.target.value)}/>
            <input type="password" required placeholder="Password" className="w-full p-3 border rounded-xl" value={password} onChange={e=>setPassword(e.target.value)}/>
            <button type="submit" disabled={loading} className="w-full bg-blue-600 text-white p-3 rounded-xl font-bold">{loading ? 'Processing...' : authMode === 'login' ? 'Log In' : 'Register'}</button>
          </form>
          {message && <div className="p-3 bg-blue-50 text-blue-700 rounded-xl text-xs text-center">{message}</div>}
          <div className="text-center text-xs text-gray-400 font-bold uppercase">or</div>
          <button type="button" onClick={handleGoogleLogin} className="w-full border p-3 rounded-xl font-medium flex items-center justify-center gap-2 hover:bg-gray-50 shadow-sm">
            <svg className="w-5 h-5" viewBox="0 0 24 24">
              <path fill="#EA4335" d="M12 5.04c1.67 0 3.17.58 4.35 1.71l3.25-3.25C17.63 1.63 14.97 1 12 1 7.37 1 3.4 3.67 1.4 7.56l3.87 3a7.16 7.16 0 0 1 6.73-5.52z"/>
              <path fill="#4285F4" d="M23.49 12.27c0-.81-.07-1.59-.2-2.36H12v4.51h6.46a5.5 5.5 0 0 1-2.39 3.62l3.71 2.88c2.17-2 3.71-4.95 3.71-8.65z"/>
              <path fill="#FBBC05" d="M5.27 14.22a7.15 7.15 0 0 1 0-4.44l-3.87-3A11.94 11.94 0 0 0 0 12c0 1.92.45 3.74 1.4 5.37l3.87-3.15z"/>
              <path fill="#34A853" d="M12 23c3.24 0 5.97-1.08 7.96-2.91l-3.71-2.88c-1.03.69-2.35 1.11-4.25 1.11-3.14 0-5.8-2.12-6.75-4.99l-3.87 3A11.94 11.94 0 0 0 12 23z"/>
            </svg>
            Continue with Gmail
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <header className="bg-white border-b px-6 py-4 flex justify-between items-center shadow-sm">
        <h1 className="text-xl font-bold text-gray-950">🏆 MatchDay Leaderboard</h1>
        <div className="flex items-center gap-4 text-sm">
          <span className="text-gray-500 font-medium">{user.email}</span>
          <button onClick={() => supabase.auth.signOut()} className="text-red-500 font-bold hover:underline">Sign Out</button>
        </div>
      </header>

      <main className="flex-1 p-6 grid grid-cols-1 md:grid-cols-4 gap-6">
        <div className="bg-white p-4 rounded-xl shadow-sm border h-fit space-y-2">
          <h3 className="font-bold text-xs uppercase tracking-wider text-gray-400 mb-2">Active Competitions</h3>
          {pools.map(p => (
            <button key={p.id} onClick={() => selectPool(p)} className={`w-full text-left p-3 rounded-xl transition font-medium text-sm ${activePool?.id === p.id ? 'bg-blue-50 text-blue-600' : 'hover:bg-gray-50 text-gray-700'}`}>
              🏁 {p.title}
            </button>
          ))}
        </div>

        {activePool ? (
          <>
            <div className="md:col-span-2 space-y-4">
              <h3 className="font-bold text-lg text-gray-800">Match Schedules</h3>
              {matches.map(match => {
                const isLocked = new Date(match.utc_date) <= new Date();
                return (
                  <div key={match.id} className="p-4 bg-white rounded-xl border flex items-center justify-between gap-2 shadow-sm">
                    <span className="text-xs font-semibold text-gray-700 w-1/3 text-right truncate">{match.home_team}</span>
                    <div className="flex items-center gap-1 bg-gray-50 p-1.5 rounded-lg border">
                      <input type="number" disabled={isLocked} className="w-10 p-1 text-center bg-white border rounded" onChange={e => setPredictions({...predictions, [match.id]: {...predictions[match.id], home: e.target.value}})}/>
                      <span className="text-xs text-gray-400 font-bold mx-1">:</span>
                      <input type="number" disabled={isLocked} className="w-10 p-1 text-center bg-white border rounded" onChange={e => setPredictions({...predictions, [match.id]: {...predictions[match.id], away: e.target.value}})}/>
                    </div>
                    <span className="text-xs font-semibold text-gray-700 w-1/3 text-left truncate">{match.away_team}</span>
                    <button onClick={() => savePrediction(match.id)} disabled={isLocked} className="bg-blue-600 text-white text-xs px-4 py-2 rounded-lg font-bold disabled:bg-gray-200 disabled:text-gray-400">{isLocked ? 'Locked' : 'Save'}</button>
                  </div>
                );
              })}
            </div>

            <div className="bg-white p-4 rounded-xl shadow-sm border h-fit">
              <h3 className="font-bold text-gray-800 text-xs uppercase tracking-wider mb-3">Live Standings</h3>
              <div className="divide-y">
                {leaderboard.map((row, index) => (
                  <div key={index} className="flex justify-between py-3 text-sm font-medium">
                    <span className="text-gray-700">{index + 1}. {row.profiles?.username}</span>
                    <span className="text-blue-600 bg-blue-50 px-2 py-0.5 rounded-md text-xs font-bold">{row.total_points} PTS</span>
                  </div>
                ))}
              </div>
            </div>
          </>
        ) : (
          <div className="md:col-span-3 flex items-center justify-center text-gray-400 p-12 bg-white rounded-xl border border-dashed">Select an active tournament from the sidebar panel to show predictions.</div>
        )}
      </main>
    </div>
  );
}