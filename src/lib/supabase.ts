import { createClient, SupabaseClient } from '@supabase/supabase-js';

// Use environment variables with fallback to hardcoded values
// @ts-ignore - Vite injects import.meta.env at build time
const supabaseUrl = (typeof import.meta !== 'undefined' && import.meta.env?.VITE_SUPABASE_URL) || 'https://qdizfhhsqolvuddoxugj.supabase.co';
// @ts-ignore
const supabaseAnonKey = (typeof import.meta !== 'undefined' && import.meta.env?.VITE_SUPABASE_ANON_KEY) || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFkaXpmaGhzcW9sdnVkZG94dWdqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njk4NzY1MjMsImV4cCI6MjA4NTQ1MjUyM30.W00V-_gmfGT19HcSfpwmFNEDlXg6Wt6rZCE_gVPj4fw';

// Create client without strict typing for now (tables are created at runtime)
export const supabase: SupabaseClient = createClient(supabaseUrl, supabaseAnonKey, {
  realtime: {
    params: {
      eventsPerSecond: 20,
    },
  },
});

// Helper to generate a unique player ID for this browser session
export const getLocalPlayerId = (): string => {
  const key = 'mission-control-player-id';
  let id = localStorage.getItem(key);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(key, id);
  }
  return id;
};

// Helper to get team ID from URL or localStorage
export const getTeamFromUrl = (): string | null => {
  const params = new URLSearchParams(window.location.search);
  return params.get('team');
};

export const getStoredTeamId = (): string | null => {
  return localStorage.getItem('mission-control-team-id');
};

export const setStoredTeamId = (teamId: string): void => {
  localStorage.setItem('mission-control-team-id', teamId);
};

// Helper to generate share URL for a team
export const getShareUrl = (inviteCode: string): string => {
  const url = new URL(window.location.href);
  url.searchParams.set('team', inviteCode);
  return url.toString();
};
