import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';

export type PromptType = 'ship_upgrade' | 'planet_terraform' | 'planet_create' | 'planet_base';

export interface PromptRecord {
  id: string;
  teamId: string;
  playerId: string | null;
  promptType: PromptType;
  promptText: string;
  userInput: string | null;
  apiUsed: string | null;
  sourceImageUrl: string | null;
  resultImageUrl: string | null;
  createdAt: string;
}

interface UsePromptHistoryOptions {
  teamId: string | null;
  playerId: string | null;
}

interface UsePromptHistoryReturn {
  prompts: PromptRecord[];
  isLoading: boolean;

  // Record a new prompt
  recordPrompt: (data: {
    promptType: PromptType;
    promptText: string;
    userInput?: string;
    apiUsed?: string;
    sourceImageUrl?: string;
    resultImageUrl?: string;
  }) => Promise<PromptRecord | null>;

  // Get prompts for a specific type
  getPromptsByType: (type: PromptType) => PromptRecord[];

  // Get prompts for a specific player
  getPromptsByPlayer: (playerId: string) => PromptRecord[];

  // Get recent prompts
  getRecentPrompts: (limit?: number) => PromptRecord[];

  // Refresh prompts from database
  refreshPrompts: () => Promise<void>;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const rowToPromptRecord = (row: any): PromptRecord => ({
  id: row.id,
  teamId: row.team_id,
  playerId: row.player_id,
  promptType: row.prompt_type,
  promptText: row.prompt_text,
  userInput: row.user_input,
  apiUsed: row.api_used,
  sourceImageUrl: row.source_image_url,
  resultImageUrl: row.result_image_url,
  createdAt: row.created_at,
});

export function usePromptHistory(options: UsePromptHistoryOptions): UsePromptHistoryReturn {
  const { teamId, playerId } = options;

  const [prompts, setPrompts] = useState<PromptRecord[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  // Fetch prompts from Supabase
  const refreshPrompts = useCallback(async () => {
    if (!teamId) return;

    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from('prompts')
        .select('*')
        .eq('team_id', teamId)
        .order('created_at', { ascending: false })
        .limit(100);

      if (error) {
        console.error('[usePromptHistory] Error fetching prompts:', error);
        return;
      }

      if (data) {
        setPrompts(data.map(rowToPromptRecord));
      }
    } catch (err) {
      console.error('[usePromptHistory] Exception:', err);
    } finally {
      setIsLoading(false);
    }
  }, [teamId]);

  // Record a new prompt
  const recordPrompt = useCallback(async (data: {
    promptType: PromptType;
    promptText: string;
    userInput?: string;
    apiUsed?: string;
    sourceImageUrl?: string;
    resultImageUrl?: string;
  }): Promise<PromptRecord | null> => {
    if (!teamId) {
      console.warn('[usePromptHistory] No teamId, cannot record prompt');
      return null;
    }

    try {
      const { data: inserted, error } = await supabase
        .from('prompts')
        .insert({
          team_id: teamId,
          player_id: playerId,
          prompt_type: data.promptType,
          prompt_text: data.promptText,
          user_input: data.userInput || null,
          api_used: data.apiUsed || null,
          source_image_url: data.sourceImageUrl || null,
          result_image_url: data.resultImageUrl || null,
        })
        .select()
        .single();

      if (error) {
        console.error('[usePromptHistory] Error recording prompt:', error);
        return null;
      }

      if (inserted) {
        const record = rowToPromptRecord(inserted);
        setPrompts(prev => [record, ...prev]);
        console.log('[usePromptHistory] Prompt recorded:', record.id);
        return record;
      }

      return null;
    } catch (err) {
      console.error('[usePromptHistory] Exception recording prompt:', err);
      return null;
    }
  }, [teamId, playerId]);

  // Get prompts by type
  const getPromptsByType = useCallback((type: PromptType): PromptRecord[] => {
    return prompts.filter(p => p.promptType === type);
  }, [prompts]);

  // Get prompts by player
  const getPromptsByPlayer = useCallback((targetPlayerId: string): PromptRecord[] => {
    return prompts.filter(p => p.playerId === targetPlayerId);
  }, [prompts]);

  // Get recent prompts
  const getRecentPrompts = useCallback((limit: number = 10): PromptRecord[] => {
    return prompts.slice(0, limit);
  }, [prompts]);

  // Initial load
  useEffect(() => {
    if (teamId) {
      refreshPrompts();
    }
  }, [teamId, refreshPrompts]);

  // Subscribe to realtime updates
  useEffect(() => {
    if (!teamId) return;

    const channel = supabase
      .channel(`prompts:${teamId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'prompts', filter: `team_id=eq.${teamId}` },
        (payload) => {
          const record = rowToPromptRecord(payload.new);
          // Only add if not already in the list (avoid duplicates from own inserts)
          setPrompts(prev => {
            if (prev.some(p => p.id === record.id)) {
              return prev;
            }
            return [record, ...prev];
          });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [teamId]);

  return {
    prompts,
    isLoading,
    recordPrompt,
    getPromptsByType,
    getPromptsByPlayer,
    getRecentPrompts,
    refreshPrompts,
  };
}
