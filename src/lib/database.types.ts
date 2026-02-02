export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export interface Database {
  public: {
    Tables: {
      teams: {
        Row: {
          id: string;
          name: string;
          invite_code: string;
          team_points: number;
          completed_planets: string[];
          goals: Json;
          custom_planets: Json;
          created_at: string;
        };
        Insert: {
          id?: string;
          name?: string;
          invite_code?: string;
          team_points?: number;
          completed_planets?: string[];
          goals?: Json;
          custom_planets?: Json;
          created_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          invite_code?: string;
          team_points?: number;
          completed_planets?: string[];
          goals?: Json;
          custom_planets?: Json;
          created_at?: string;
        };
      };
      players: {
        Row: {
          id: string;
          team_id: string;
          username: string;
          display_name: string;
          color: string;
          ship_base_image: string;
          ship_current_image: string;
          ship_upgrades: string[];
          ship_effects: Json;
          planet_image_url: string;
          planet_terraform_count: number;
          planet_size_level: number;
          planet_history: Json;
          mascot_history: Json;
          personal_points: number;
          is_online: boolean;
          last_seen: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          team_id: string;
          username: string;
          display_name: string;
          color?: string;
          ship_base_image?: string;
          ship_current_image?: string;
          ship_upgrades?: string[];
          ship_effects?: Json;
          planet_image_url?: string;
          planet_terraform_count?: number;
          planet_size_level?: number;
          planet_history?: Json;
          mascot_history?: Json;
          personal_points?: number;
          is_online?: boolean;
          last_seen?: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          team_id?: string;
          username?: string;
          display_name?: string;
          color?: string;
          ship_base_image?: string;
          ship_current_image?: string;
          ship_upgrades?: string[];
          ship_effects?: Json;
          planet_image_url?: string;
          planet_terraform_count?: number;
          planet_size_level?: number;
          planet_history?: Json;
          mascot_history?: Json;
          personal_points?: number;
          is_online?: boolean;
          last_seen?: string;
          created_at?: string;
        };
      };
      ship_positions: {
        Row: {
          player_id: string;
          x: number;
          y: number;
          vx: number;
          vy: number;
          rotation: number;
          thrusting: boolean;
          updated_at: string;
        };
        Insert: {
          player_id: string;
          x?: number;
          y?: number;
          vx?: number;
          vy?: number;
          rotation?: number;
          thrusting?: boolean;
          updated_at?: string;
        };
        Update: {
          player_id?: string;
          x?: number;
          y?: number;
          vx?: number;
          vy?: number;
          rotation?: number;
          thrusting?: boolean;
          updated_at?: string;
        };
      };
      point_transactions: {
        Row: {
          id: string;
          team_id: string;
          player_id: string | null;
          source: 'planet' | 'notion' | 'manual';
          notion_task_id: string | null;
          task_name: string | null;
          points: number;
          point_type: 'personal' | 'team';
          created_at: string;
        };
        Insert: {
          id?: string;
          team_id: string;
          player_id?: string | null;
          source: 'planet' | 'notion' | 'manual';
          notion_task_id?: string | null;
          task_name?: string | null;
          points: number;
          point_type?: 'personal' | 'team';
          created_at?: string;
        };
        Update: {
          id?: string;
          team_id?: string;
          player_id?: string | null;
          source?: 'planet' | 'notion' | 'manual';
          notion_task_id?: string | null;
          task_name?: string | null;
          points?: number;
          point_type?: 'personal' | 'team';
          created_at?: string;
        };
      };
      point_config: {
        Row: {
          id: string;
          source: string;
          task_type: string;
          points: number;
        };
        Insert: {
          id?: string;
          source: string;
          task_type: string;
          points: number;
        };
        Update: {
          id?: string;
          source?: string;
          task_type?: string;
          points?: number;
        };
      };
      notion_planets: {
        Row: {
          id: string;
          team_id: string;
          notion_task_id: string;
          name: string;
          description: string | null;
          notion_url: string | null;
          assigned_to: string | null;
          created_by: string | null;
          task_type: string | null;
          priority: string | null;
          points: number;
          x: number;
          y: number;
          completed: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          team_id: string;
          notion_task_id: string;
          name: string;
          description?: string | null;
          notion_url?: string | null;
          assigned_to?: string | null;
          created_by?: string | null;
          task_type?: string | null;
          priority?: string | null;
          points?: number;
          x?: number;
          y?: number;
          completed?: boolean;
          created_at?: string;
        };
        Update: {
          id?: string;
          team_id?: string;
          notion_task_id?: string;
          name?: string;
          description?: string | null;
          notion_url?: string | null;
          assigned_to?: string | null;
          created_by?: string | null;
          task_type?: string | null;
          priority?: string | null;
          points?: number;
          x?: number;
          y?: number;
          completed?: boolean;
          created_at?: string;
        };
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
  };
}

// Convenience type exports
export type Team = Database['public']['Tables']['teams']['Row'];
export type TeamInsert = Database['public']['Tables']['teams']['Insert'];
export type TeamUpdate = Database['public']['Tables']['teams']['Update'];

export type Player = Database['public']['Tables']['players']['Row'];
export type PlayerInsert = Database['public']['Tables']['players']['Insert'];
export type PlayerUpdate = Database['public']['Tables']['players']['Update'];

export type ShipPosition = Database['public']['Tables']['ship_positions']['Row'];
export type ShipPositionInsert = Database['public']['Tables']['ship_positions']['Insert'];
export type ShipPositionUpdate = Database['public']['Tables']['ship_positions']['Update'];

export type PointTransaction = Database['public']['Tables']['point_transactions']['Row'];
export type PointTransactionInsert = Database['public']['Tables']['point_transactions']['Insert'];

export type PointConfig = Database['public']['Tables']['point_config']['Row'];

export type NotionPlanetRow = Database['public']['Tables']['notion_planets']['Row'];
export type NotionPlanetInsert = Database['public']['Tables']['notion_planets']['Insert'];
export type NotionPlanetUpdate = Database['public']['Tables']['notion_planets']['Update'];
