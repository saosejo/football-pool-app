'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
const supabaseClient = supabaseUrl && supabaseAnonKey ? createClient(supabaseUrl, supabaseAnonKey) : null;

export default function DashboardPage() {
  const [pools, setPools] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchMyPools() {
      if (!supabaseClient) return;

      // 1. Get the logged-in user
      const { data: { user } } = await supabaseClient.auth.getUser();
      
      if (!user) {
        setLoading(false);
        return; // Handle not logged in state
      }

      // 2. Fetch pools created by this user
      const { data, error } = await supabaseClient
        .from('pools')
        .select('*')
        .eq('created_by', user.id)
        .order('created_at', { ascending: false });

      if (!error && data) {
        setPools(data);
      }
      setLoading(false);
    }

    fetchMyPools();
  }, []);

  return (
    <main className="min-h-screen bg-slate-950 text-white p-8">
      <div className="max-w-4xl mx-auto space-y-8">
        
        <header className="flex justify-between items-center border-b border-slate-800 pb-4">
          <div>
            <h1 className="text-3xl font-extrabold tracking-tight">My Predictions</h1>
            <p className="text-sm text-slate-400">Manage your tournament pools and picks.</p>
          </div>
          
          {/* This Link routes the user to the folder we created in Step 1 */}
          <Link 
            href="/create" 
            className="bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded font-bold text-sm transition shadow"
          >
            + New Pool
          </Link>
        </header>

        {loading ? (
          <p className="text-slate-500 animate-pulse">Loading your pools...</p>
        ) : pools.length === 0 ? (
          <div className="text-center py-20 border border-dashed border-slate-800 rounded-xl bg-slate-900/50">
            <p className="text-slate-400 mb-4">You haven't created any prediction pools yet.</p>
            <Link href="/create" className="text-emerald-500 font-bold hover:underline">
              Create your first party →
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {pools.map(pool => (
              <div key={pool.id} className="bg-slate-900 border border-slate-800 rounded-lg p-5 shadow-lg hover:border-slate-700 transition flex flex-col justify-between h-40">
                <div>
                  <h3 className="font-bold text-lg truncate" title={pool.title}>{pool.title}</h3>
                  <div className="flex gap-2 mt-2">
                    <span className="text-[10px] bg-slate-800 text-slate-300 px-2 py-1 rounded font-mono uppercase">
                      {pool.scope}
                    </span>
                    <span className="text-[10px] bg-blue-900/30 text-blue-400 px-2 py-1 rounded font-mono uppercase border border-blue-800/50">
                      Comp: {pool.competition_id}
                    </span>
                  </div>
                </div>
                <Link 
                  href={`/pool/${pool.id}`} 
                  className="mt-4 text-xs font-bold text-emerald-500 hover:text-emerald-400"
                >
                  View Details & Make Picks →
                </Link>
              </div>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}