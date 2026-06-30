'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
const supabaseClient = supabaseUrl && supabaseAnonKey ? createClient(supabaseUrl, supabaseAnonKey) : null;

export default function DashboardPage() {
  const router = useRouter();
  const [pools, setPools] = useState([]);
  const [loading, setLoading] = useState(true);
  const [currentUser, setCurrentUser] = useState(null);
  
  // Join Pool State
  const [joinCode, setJoinCode] = useState('');
  const [joining, setJoining] = useState(false);

  const fetchMyPools = async () => {
    if (!supabaseClient) return;
    setLoading(true);

    const { data: { user } } = await supabaseClient.auth.getUser();
    
    if (!user) {
      router.push('/auth');
      return; 
    }
    setCurrentUser(user);

    try {
      // 1. Fetch pools the user created
      const { data: createdData, error: createdError } = await supabaseClient
        .from('pools')
        .select('*')
        .eq('created_by', user.id);

      if (createdError) throw createdError;

      // 2. Fetch pools the user joined (from pool_participants)
      const { data: participantData, error: participantError } = await supabaseClient
        .from('pool_participants')
        .select('pool_id')
        .eq('user_id', user.id);

      if (participantError) throw participantError;

      const joinedPoolIds = participantData.map(p => p.pool_id);
      
      let joinedData = [];
      if (joinedPoolIds.length > 0) {
        const { data, error: joinedError } = await supabaseClient
          .from('pools')
          .select('*')
          .in('id', joinedPoolIds);
          
        if (joinedError) throw joinedError;
        joinedData = data || [];
      }

      // 3. Merge and deduplicate (in case the creator is also listed as a participant)
      const allPools = [...(createdData || []), ...joinedData];
      const uniquePools = Array.from(new Map(allPools.map(item => [item.id, item])).values());
      
      // Sort by newest first
      uniquePools.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
      
      setPools(uniquePools);
    } catch (err) {
      console.error("Error fetching pools:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMyPools();
  }, [router]);

  const handleLogout = async () => {
    await supabaseClient.auth.signOut();
    router.push('/auth');
  };

  const handleJoinPool = async (e) => {
    e.preventDefault();
    if (!joinCode.trim() || !currentUser) return;
    setJoining(true);

    try {
      // 1. Verify the pool exists using the provided UUID code
      const { data: pool, error: poolError } = await supabaseClient
        .from('pools')
        .select('id, title')
        .eq('id', joinCode.trim())
        .single();

      if (poolError || !pool) {
        throw new Error('Invalid Pool Code. Please ensure you copied the entire ID.');
      }

      // 2. Insert the user into the pool_participants junction table
      const { error: joinError } = await supabaseClient
        .from('pool_participants')
        .insert([{
          pool_id: pool.id,
          user_id: currentUser.id
        }]);

      if (joinError) {
        // Postgres error 23505 means a unique constraint violation (they are already in it)
        if (joinError.code === '23505') {
          throw new Error('You have already joined this pool!');
        }
        throw joinError;
      }

      alert(`✅ Successfully joined: ${pool.title}!`);
      setJoinCode('');
      fetchMyPools(); // Refresh the dashboard to show the new pool
      
    } catch (err) {
      alert(`❌ ${err.message}`);
    } finally {
      setJoining(false);
    }
  };

  return (
    <main className="min-h-screen bg-slate-950 text-white p-8">
      <div className="max-w-5xl mx-auto space-y-8">
        
        {/* Header Section */}
        <header className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 border-b border-slate-800 pb-6">
          <div>
            <h1 className="text-3xl font-extrabold tracking-tight">My Predictions</h1>
            <p className="text-sm text-slate-400">Manage your tournament pools and picks.</p>
          </div>
          
          <div className="flex flex-col sm:flex-row items-center gap-4 w-full md:w-auto">
            {/* Join Pool Form */}
            <form onSubmit={handleJoinPool} className="flex w-full sm:w-auto">
              <input 
                type="text" 
                placeholder="Paste Pool Code (ID)..."
                value={joinCode}
                onChange={e => setJoinCode(e.target.value)}
                className="bg-slate-900 border border-slate-700 text-white text-xs px-3 py-2 rounded-l focus:outline-none focus:border-emerald-500 w-full sm:w-48 transition"
              />
              <button 
                type="submit"
                disabled={joining || !joinCode.trim()}
                className="bg-blue-600 hover:bg-blue-700 disabled:bg-slate-800 text-white px-4 py-2 rounded-r font-bold text-xs transition"
              >
                {joining ? 'Joining...' : 'Join'}
              </button>
            </form>

            <div className="flex gap-3 w-full sm:w-auto justify-end">
              <Link 
                href="/create" 
                className="bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded font-bold text-sm transition shadow flex-shrink-0"
              >
                + New Pool
              </Link>
              <button 
                onClick={handleLogout}
                className="text-xs text-slate-400 hover:text-white transition px-3 py-2 flex-shrink-0"
              >
                Log Out
              </button>
            </div>
          </div>
        </header>

        {/* Pools Grid */}
        {loading ? (
          <p className="text-slate-500 animate-pulse text-center py-10">Loading your pools...</p>
        ) : pools.length === 0 ? (
          <div className="text-center py-20 border border-dashed border-slate-800 rounded-xl bg-slate-900/50">
            <p className="text-slate-400 mb-4">You haven't created or joined any prediction pools yet.</p>
            <Link href="/create" className="text-emerald-500 font-bold hover:underline">
              Create your first party →
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {pools.map(pool => {
              const isCreator = pool.created_by === currentUser?.id;
              
              return (
                <div key={pool.id} className="bg-slate-900 border border-slate-800 rounded-lg p-5 shadow-lg hover:border-slate-700 transition flex flex-col justify-between h-48">
                  <div>
                    <div className="flex justify-between items-start mb-2">
                      <h3 className="font-bold text-lg truncate pr-2" title={pool.title}>{pool.title}</h3>
                      {isCreator && (
                        <span className="bg-amber-900/30 text-amber-500 text-[9px] font-bold px-2 py-0.5 rounded border border-amber-800/50">
                          ADMIN
                        </span>
                      )}
                    </div>
                    
                    <div className="flex flex-wrap gap-2 mt-2">
                      <span className="text-[10px] bg-slate-800 text-slate-300 px-2 py-1 rounded font-mono uppercase">
                        {pool.scope}
                      </span>
                      <span className="text-[10px] bg-blue-900/30 text-blue-400 px-2 py-1 rounded font-mono uppercase border border-blue-800/50">
                        Comp: {pool.competition_id}
                      </span>
                    </div>
                    
                    {/* Display the shareable code */}
                    <div className="mt-4 pt-3 border-t border-slate-800/50">
                      <p className="text-[9px] text-slate-500 font-bold uppercase mb-1">Invite Code</p>
                      <code className="text-[10px] text-slate-400 bg-slate-950 px-2 py-1 rounded block truncate" title="Click to copy">
                        {pool.id}
                      </code>
                    </div>
                  </div>
                  
                  <Link 
                    href={`/pool/${pool.id}`} 
                    className="mt-4 text-xs font-bold text-emerald-500 hover:text-emerald-400 flex items-center justify-between"
                  >
                    <span>View Details & Make Picks</span>
                    <span>→</span>
                  </Link>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </main>
  );
}