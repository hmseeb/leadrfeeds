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
      feed_suggestions: {
        Row: {
          id: string
          feed_url: string
          feed_title: string | null
          feed_description: string | null
          reason: string | null
          suggested_by_user_id: string
          suggested_by_email: string
          status: string
          reviewed_at: string | null
          reviewed_by_email: string | null
          rejection_reason: string | null
          created_at: string | null
          updated_at: string | null
        }
        Insert: {
          id?: string
          feed_url: string
          feed_title?: string | null
          feed_description?: string | null
          reason?: string | null
          suggested_by_user_id: string
          suggested_by_email: string
          status?: string
          reviewed_at?: string | null
          reviewed_by_email?: string | null
          rejection_reason?: string | null
          created_at?: string | null
          updated_at?: string | null
        }
        Update: {
          id?: string
          feed_url?: string
          feed_title?: string | null
          feed_description?: string | null
          reason?: string | null
          suggested_by_user_id?: string
          suggested_by_email?: string
          status?: string
          reviewed_at?: string | null
          reviewed_by_email?: string | null
          rejection_reason?: string | null
          created_at?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      feed_waitlist: {
        Row: {
          id: string
          feed_url: string
          user_id: string
          created_at: string | null
          subscribed: boolean | null
          subscribed_at: string | null
          feed_id: string | null
        }
        Insert: {
          id?: string
          feed_url: string
          user_id: string
          created_at?: string | null
          subscribed?: boolean | null
          subscribed_at?: string | null
          feed_id?: string | null
        }
        Update: {
          id?: string
          feed_url?: string
          user_id?: string
          created_at?: string | null
          subscribed?: boolean | null
          subscribed_at?: string | null
          feed_id?: string | null
        }
        Relationships: []
      }
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
          ai_chat_width: number | null
          article_panel_width: number | null
          created_at: string | null
          openrouter_api_key: string | null
          preferred_model: string | null
          sidebar_collapsed: boolean | null
          theme: string | null
          timeline_filters: { excludedFeedIds: string[]; excludedCategories: string[] } | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          ai_chat_width?: number | null
          article_panel_width?: number | null
          created_at?: string | null
          openrouter_api_key?: string | null
          preferred_model?: string | null
          sidebar_collapsed?: boolean | null
          theme?: string | null
          timeline_filters?: { excludedFeedIds: string[]; excludedCategories: string[] } | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          ai_chat_width?: number | null
          article_panel_width?: number | null
          created_at?: string | null
          openrouter_api_key?: string | null
          preferred_model?: string | null
          sidebar_collapsed?: boolean | null
          theme?: string | null
          timeline_filters?: { excludedFeedIds: string[]; excludedCategories: string[] } | null
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
          feed_url: string
          last_entry_at: string
          subscriber_count: number
        }[]
      }
      get_pending_suggestions_count: {
        Args: Record<string, never>
        Returns: number
      }
      get_suggestion_feed_status: {
        Args: {
          p_suggestion_id: string
        }
        Returns: {
          feed_id: string | null
          feed_title: string | null
          waitlist_count: number
          subscribed_count: number
          is_feed_created: boolean
        }[]
      }
      submit_feed_suggestion: {
        Args: {
          p_feed_url: string
          p_feed_title?: string
          p_feed_description?: string
          p_reason?: string
        }
        Returns: string
      }
      approve_feed_suggestion: {
        Args: {
          p_suggestion_id: string
        }
        Returns: string
      }
      reject_feed_suggestion: {
        Args: {
          p_suggestion_id: string
          p_rejection_reason?: string | null
        }
        Returns: undefined
      }
      delete_feed_suggestion: {
        Args: {
          p_suggestion_id: string
        }
        Returns: undefined
      }
      get_unread_counts: {
        Args: { user_id_param: string }
        Returns: {
          feed_id: string
          unread_count: number
        }[]
      }
      get_waitlist_count: {
        Args: {
          p_feed_url: string
        }
        Returns: number
      }
      link_feed_to_waitlist: {
        Args: {
          p_feed_url: string
          p_feed_id: string
          p_feed_title?: string
        }
        Returns: {
          subscribed_count: number
          already_subscribed: number
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
          entry_author: string | null
          entry_content: string | null
          entry_description: string | null
          entry_id: string
          entry_published_at: string
          entry_title: string | null
          entry_url: string | null
          feed_category: string | null
          feed_id: string
          feed_image: string | null
          feed_title: string | null
          is_read: boolean
          is_starred: boolean
        }[]
      }
      get_ai_context: {
        Args: {
          user_id_param: string
          feed_id_filter?: string
          starred_only?: boolean
          unread_only?: boolean
          hours_lookback?: number
        }
        Returns: {
          entry_id: string
          entry_title: string | null
          entry_description: string | null
          entry_content: string | null
          entry_author: string | null
          entry_url: string | null
          entry_published_at: string
          feed_id: string
          feed_title: string | null
          feed_category: string | null
          feed_url: string | null
          feed_site_url: string | null
          is_starred: boolean
          is_read: boolean
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
