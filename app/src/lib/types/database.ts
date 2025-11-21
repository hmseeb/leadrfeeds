export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "13.0.5"
  }
  public: {
    Tables: {
      chat_messages: {
        Row: {
          content: string
          context_id: string | null
          context_type: string
          created_at: string | null
          id: string
          role: string
          user_id: string
        }
        Insert: {
          content: string
          context_id?: string | null
          context_type: string
          created_at?: string | null
          id?: string
          role: string
          user_id: string
        }
        Update: {
          content?: string
          context_id?: string | null
          context_type?: string
          created_at?: string | null
          id?: string
          role?: string
          user_id?: string
        }
        Relationships: []
      }
      entries: {
        Row: {
          attachments: Json | null
          author: string | null
          content: string | null
          created_at: string | null
          description: string | null
          feed_id: string
          guid: string | null
          id: string
          inserted_at: string | null
          media: Json | null
          published_at: string | null
          title: string | null
          url: string | null
        }
        Insert: {
          attachments?: Json | null
          author?: string | null
          content?: string | null
          created_at?: string | null
          description?: string | null
          feed_id: string
          guid?: string | null
          id: string
          inserted_at?: string | null
          media?: Json | null
          published_at?: string | null
          title?: string | null
          url?: string | null
        }
        Update: {
          attachments?: Json | null
          author?: string | null
          content?: string | null
          created_at?: string | null
          description?: string | null
          feed_id?: string
          guid?: string | null
          id?: string
          inserted_at?: string | null
          media?: Json | null
          published_at?: string | null
          title?: string | null
          url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "entries_feed_id_fkey"
            columns: ["feed_id"]
            isOneToOne: false
            referencedRelation: "feeds"
            referencedColumns: ["id"]
          },
        ]
      }
      feeds: {
        Row: {
          category: string | null
          checked_at: string | null
          created_at: string | null
          description: string | null
          error_at: string | null
          error_message: string | null
          etag_header: string | null
          id: string
          image: string | null
          last_entry_at: string | null
          last_modified_header: string | null
          site_url: string | null
          subscriber_count: number | null
          title: string | null
          ttl: number | null
          updated_at: string | null
          url: string
        }
        Insert: {
          category?: string | null
          checked_at?: string | null
          created_at?: string | null
          description?: string | null
          error_at?: string | null
          error_message?: string | null
          etag_header?: string | null
          id: string
          image?: string | null
          last_entry_at?: string | null
          last_modified_header?: string | null
          site_url?: string | null
          subscriber_count?: number | null
          title?: string | null
          ttl?: number | null
          updated_at?: string | null
          url: string
        }
        Update: {
          category?: string | null
          checked_at?: string | null
          created_at?: string | null
          description?: string | null
          error_at?: string | null
          error_message?: string | null
          etag_header?: string | null
          id?: string
          image?: string | null
          last_entry_at?: string | null
          last_modified_header?: string | null
          site_url?: string | null
          subscriber_count?: number | null
          title?: string | null
          ttl?: number | null
          updated_at?: string | null
          url?: string
        }
        Relationships: []
      }
      user_entry_status: {
        Row: {
          entry_id: string
          id: string
          is_read: boolean | null
          is_starred: boolean | null
          read_at: string | null
          starred_at: string | null
          user_id: string
        }
        Insert: {
          entry_id: string
          id?: string
          is_read?: boolean | null
          is_starred?: boolean | null
          read_at?: string | null
          starred_at?: string | null
          user_id: string
        }
        Update: {
          entry_id?: string
          id?: string
          is_read?: boolean | null
          is_starred?: boolean | null
          read_at?: string | null
          starred_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_entry_status_entry_id_fkey"
            columns: ["entry_id"]
            isOneToOne: false
            referencedRelation: "entries"
            referencedColumns: ["id"]
          },
        ]
      }
      user_settings: {
        Row: {
          article_panel_width: number | null
          created_at: string | null
          openrouter_api_key: string | null
          preferred_model: string | null
          sidebar_collapsed: boolean | null
          theme: string | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          article_panel_width?: number | null
          created_at?: string | null
          openrouter_api_key?: string | null
          preferred_model?: string | null
          sidebar_collapsed?: boolean | null
          theme?: string | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          article_panel_width?: number | null
          created_at?: string | null
          openrouter_api_key?: string | null
          preferred_model?: string | null
          sidebar_collapsed?: boolean | null
          theme?: string | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      user_subscriptions: {
        Row: {
          feed_id: string
          id: string
          subscribed_at: string | null
          user_id: string
        }
        Insert: {
          feed_id: string
          id?: string
          subscribed_at?: string | null
          user_id: string
        }
        Update: {
          feed_id?: string
          id?: string
          subscribed_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_subscriptions_feed_id_fkey"
            columns: ["feed_id"]
            isOneToOne: false
            referencedRelation: "feeds"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      cleanup_old_entries: { Args: never; Returns: undefined }
      extract_category: { Args: { feed_url: string }; Returns: string }
      get_discovery_feeds: {
        Args: {
          category_filter?: string
          limit_param?: number
          offset_param?: number
          search_query?: string
        }
        Returns: {
          feed_category: string
          feed_description: string
          feed_id: string
          feed_image: string
          feed_site_url: string
          feed_title: string
          last_entry_at: string
          subscriber_count: number
        }[]
      }
      get_unread_counts: {
        Args: { user_id_param: string }
        Returns: {
          feed_id: string
          unread_count: number
        }[]
      }
      get_user_timeline: {
        Args: {
          feed_id_filter?: string
          limit_param?: number
          offset_param?: number
          starred_only?: boolean
          unread_only?: boolean
          user_id_param: string
        }
        Returns: {
          entry_author: string
          entry_content: string
          entry_description: string
          entry_id: string
          entry_published_at: string
          entry_title: string
          entry_url: string
          feed_category: string
          feed_id: string
          feed_image: string
          feed_title: string
          is_read: boolean
          is_starred: boolean
        }[]
      }
      mark_entry_read: {
        Args: { entry_id_param: string; user_id_param: string }
        Returns: undefined
      }
      toggle_entry_star: {
        Args: { entry_id_param: string; user_id_param: string }
        Returns: boolean
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
