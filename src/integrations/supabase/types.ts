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
      audit_logs: {
        Row: {
          action: string
          created_at: string
          id: string
          ip_address: string | null
          new_values: Json | null
          old_values: Json | null
          record_id: string | null
          table_name: string
          user_id: string | null
        }
        Insert: {
          action: string
          created_at?: string
          id?: string
          ip_address?: string | null
          new_values?: Json | null
          old_values?: Json | null
          record_id?: string | null
          table_name: string
          user_id?: string | null
        }
        Update: {
          action?: string
          created_at?: string
          id?: string
          ip_address?: string | null
          new_values?: Json | null
          old_values?: Json | null
          record_id?: string | null
          table_name?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_logs_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      chama: {
        Row: {
          commission_rate: number | null
          contribution_amount: number
          contribution_frequency: Database["public"]["Enums"]["contribution_frequency"]
          created_at: string
          created_by: string
          description: string | null
          every_n_days_count: number | null
          id: string
          is_public: boolean | null
          max_members: number
          min_members: number | null
          name: string
          payout_order: string | null
          slug: string
          status: Database["public"]["Enums"]["chama_status"]
          updated_at: string
          whatsapp_link: string | null
        }
        Insert: {
          commission_rate?: number | null
          contribution_amount: number
          contribution_frequency: Database["public"]["Enums"]["contribution_frequency"]
          created_at?: string
          created_by: string
          description?: string | null
          every_n_days_count?: number | null
          id?: string
          is_public?: boolean | null
          max_members?: number
          min_members?: number | null
          name: string
          payout_order?: string | null
          slug: string
          status?: Database["public"]["Enums"]["chama_status"]
          updated_at?: string
          whatsapp_link?: string | null
        }
        Update: {
          commission_rate?: number | null
          contribution_amount?: number
          contribution_frequency?: Database["public"]["Enums"]["contribution_frequency"]
          created_at?: string
          created_by?: string
          description?: string | null
          every_n_days_count?: number | null
          id?: string
          is_public?: boolean | null
          max_members?: number
          min_members?: number | null
          name?: string
          payout_order?: string | null
          slug?: string
          status?: Database["public"]["Enums"]["chama_status"]
          updated_at?: string
          whatsapp_link?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "chama_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      chama_invite_codes: {
        Row: {
          chama_id: string
          code: string
          created_at: string | null
          created_by: string
          expires_at: string | null
          id: string
          is_active: boolean | null
          used_at: string | null
          used_by: string | null
        }
        Insert: {
          chama_id: string
          code: string
          created_at?: string | null
          created_by: string
          expires_at?: string | null
          id?: string
          is_active?: boolean | null
          used_at?: string | null
          used_by?: string | null
        }
        Update: {
          chama_id?: string
          code?: string
          created_at?: string | null
          created_by?: string
          expires_at?: string | null
          id?: string
          is_active?: boolean | null
          used_at?: string | null
          used_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "chama_invite_codes_chama_id_fkey"
            columns: ["chama_id"]
            isOneToOne: false
            referencedRelation: "chama"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chama_invite_codes_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chama_invite_codes_used_by_fkey"
            columns: ["used_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      chama_members: {
        Row: {
          approval_status: string | null
          balance_credit: number | null
          balance_deficit: number | null
          chama_id: string
          id: string
          is_manager: boolean
          joined_at: string
          last_payment_date: string | null
          member_code: string
          next_due_date: string | null
          order_index: number | null
          status: Database["public"]["Enums"]["member_status"]
          user_id: string | null
        }
        Insert: {
          approval_status?: string | null
          balance_credit?: number | null
          balance_deficit?: number | null
          chama_id: string
          id?: string
          is_manager?: boolean
          joined_at?: string
          last_payment_date?: string | null
          member_code: string
          next_due_date?: string | null
          order_index?: number | null
          status?: Database["public"]["Enums"]["member_status"]
          user_id?: string | null
        }
        Update: {
          approval_status?: string | null
          balance_credit?: number | null
          balance_deficit?: number | null
          chama_id?: string
          id?: string
          is_manager?: boolean
          joined_at?: string
          last_payment_date?: string | null
          member_code?: string
          next_due_date?: string | null
          order_index?: number | null
          status?: Database["public"]["Enums"]["member_status"]
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "chama_members_chama_id_fkey"
            columns: ["chama_id"]
            isOneToOne: false
            referencedRelation: "chama"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chama_members_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      contribution_cycles: {
        Row: {
          chama_id: string
          created_at: string | null
          cycle_number: number
          due_amount: number
          end_date: string
          id: string
          start_date: string
        }
        Insert: {
          chama_id: string
          created_at?: string | null
          cycle_number: number
          due_amount: number
          end_date: string
          id?: string
          start_date: string
        }
        Update: {
          chama_id?: string
          created_at?: string | null
          cycle_number?: number
          due_amount?: number
          end_date?: string
          id?: string
          start_date?: string
        }
        Relationships: [
          {
            foreignKeyName: "contribution_cycles_chama_id_fkey"
            columns: ["chama_id"]
            isOneToOne: false
            referencedRelation: "chama"
            referencedColumns: ["id"]
          },
        ]
      }
      contributions: {
        Row: {
          amount: number
          chama_id: string
          contribution_date: string
          created_at: string
          id: string
          member_id: string
          paid_by_member_id: string | null
          payment_notes: string | null
          payment_reference: string
          status: Database["public"]["Enums"]["transaction_status"]
        }
        Insert: {
          amount: number
          chama_id: string
          contribution_date?: string
          created_at?: string
          id?: string
          member_id: string
          paid_by_member_id?: string | null
          payment_notes?: string | null
          payment_reference: string
          status?: Database["public"]["Enums"]["transaction_status"]
        }
        Update: {
          amount?: number
          chama_id?: string
          contribution_date?: string
          created_at?: string
          id?: string
          member_id?: string
          paid_by_member_id?: string | null
          payment_notes?: string | null
          payment_reference?: string
          status?: Database["public"]["Enums"]["transaction_status"]
        }
        Relationships: [
          {
            foreignKeyName: "contributions_chama_id_fkey"
            columns: ["chama_id"]
            isOneToOne: false
            referencedRelation: "chama"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contributions_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "chama_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contributions_paid_by_member_id_fkey"
            columns: ["paid_by_member_id"]
            isOneToOne: false
            referencedRelation: "chama_members"
            referencedColumns: ["id"]
          },
        ]
      }
      mchango: {
        Row: {
          beneficiary_url: string | null
          category: string | null
          created_at: string
          created_by: string
          current_amount: number
          description: string | null
          end_date: string | null
          id: string
          image_url: string | null
          is_public: boolean | null
          managers: string[] | null
          slug: string
          status: Database["public"]["Enums"]["mchango_status"]
          target_amount: number
          title: string
          updated_at: string
          whatsapp_link: string | null
        }
        Insert: {
          beneficiary_url?: string | null
          category?: string | null
          created_at?: string
          created_by: string
          current_amount?: number
          description?: string | null
          end_date?: string | null
          id?: string
          image_url?: string | null
          is_public?: boolean | null
          managers?: string[] | null
          slug: string
          status?: Database["public"]["Enums"]["mchango_status"]
          target_amount: number
          title: string
          updated_at?: string
          whatsapp_link?: string | null
        }
        Update: {
          beneficiary_url?: string | null
          category?: string | null
          created_at?: string
          created_by?: string
          current_amount?: number
          description?: string | null
          end_date?: string | null
          id?: string
          image_url?: string | null
          is_public?: boolean | null
          managers?: string[] | null
          slug?: string
          status?: Database["public"]["Enums"]["mchango_status"]
          target_amount?: number
          title?: string
          updated_at?: string
          whatsapp_link?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "mchango_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      mchango_donations: {
        Row: {
          amount: number
          completed_at: string | null
          created_at: string
          display_name: string | null
          email: string | null
          id: string
          is_anonymous: boolean
          mchango_id: string
          payment_method: string | null
          payment_reference: string
          payment_status: string
          phone: string | null
          user_id: string | null
        }
        Insert: {
          amount: number
          completed_at?: string | null
          created_at?: string
          display_name?: string | null
          email?: string | null
          id?: string
          is_anonymous?: boolean
          mchango_id: string
          payment_method?: string | null
          payment_reference: string
          payment_status?: string
          phone?: string | null
          user_id?: string | null
        }
        Update: {
          amount?: number
          completed_at?: string | null
          created_at?: string
          display_name?: string | null
          email?: string | null
          id?: string
          is_anonymous?: boolean
          mchango_id?: string
          payment_method?: string | null
          payment_reference?: string
          payment_status?: string
          phone?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "mchango_donations_mchango_id_fkey"
            columns: ["mchango_id"]
            isOneToOne: false
            referencedRelation: "mchango"
            referencedColumns: ["id"]
          },
        ]
      }
      member_cycle_payments: {
        Row: {
          amount_due: number
          amount_paid: number | null
          created_at: string | null
          cycle_id: string
          id: string
          is_paid: boolean | null
          member_id: string
          paid_at: string | null
        }
        Insert: {
          amount_due: number
          amount_paid?: number | null
          created_at?: string | null
          cycle_id: string
          id?: string
          is_paid?: boolean | null
          member_id: string
          paid_at?: string | null
        }
        Update: {
          amount_due?: number
          amount_paid?: number | null
          created_at?: string | null
          cycle_id?: string
          id?: string
          is_paid?: boolean | null
          member_id?: string
          paid_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "member_cycle_payments_cycle_id_fkey"
            columns: ["cycle_id"]
            isOneToOne: false
            referencedRelation: "contribution_cycles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "member_cycle_payments_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "chama_members"
            referencedColumns: ["id"]
          },
        ]
      }
      payouts: {
        Row: {
          amount: number
          chama_id: string | null
          id: string
          mchango_id: string | null
          payment_reference: string | null
          processed_at: string | null
          recipient_id: string
          requested_at: string
          status: Database["public"]["Enums"]["payout_status"]
        }
        Insert: {
          amount: number
          chama_id?: string | null
          id?: string
          mchango_id?: string | null
          payment_reference?: string | null
          processed_at?: string | null
          recipient_id: string
          requested_at?: string
          status?: Database["public"]["Enums"]["payout_status"]
        }
        Update: {
          amount?: number
          chama_id?: string | null
          id?: string
          mchango_id?: string | null
          payment_reference?: string | null
          processed_at?: string | null
          recipient_id?: string
          requested_at?: string
          status?: Database["public"]["Enums"]["payout_status"]
        }
        Relationships: [
          {
            foreignKeyName: "payouts_chama_id_fkey"
            columns: ["chama_id"]
            isOneToOne: false
            referencedRelation: "chama"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payouts_mchango_id_fkey"
            columns: ["mchango_id"]
            isOneToOne: false
            referencedRelation: "mchango"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payouts_recipient_id_fkey"
            columns: ["recipient_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          email: string
          email_verified: boolean | null
          full_name: string
          id: string
          id_back_url: string | null
          id_front_url: string | null
          id_number: string
          kyc_rejection_reason: string | null
          kyc_reviewed_at: string | null
          kyc_reviewed_by: string | null
          kyc_status: Database["public"]["Enums"]["kyc_status"]
          kyc_submitted_at: string | null
          last_login_at: string | null
          last_login_ip: unknown
          phone: string
          phone_verified: boolean | null
          signup_ip: unknown
          updated_at: string
        }
        Insert: {
          created_at?: string
          email: string
          email_verified?: boolean | null
          full_name: string
          id: string
          id_back_url?: string | null
          id_front_url?: string | null
          id_number: string
          kyc_rejection_reason?: string | null
          kyc_reviewed_at?: string | null
          kyc_reviewed_by?: string | null
          kyc_status?: Database["public"]["Enums"]["kyc_status"]
          kyc_submitted_at?: string | null
          last_login_at?: string | null
          last_login_ip?: unknown
          phone: string
          phone_verified?: boolean | null
          signup_ip?: unknown
          updated_at?: string
        }
        Update: {
          created_at?: string
          email?: string
          email_verified?: boolean | null
          full_name?: string
          id?: string
          id_back_url?: string | null
          id_front_url?: string | null
          id_number?: string
          kyc_rejection_reason?: string | null
          kyc_reviewed_at?: string | null
          kyc_reviewed_by?: string | null
          kyc_status?: Database["public"]["Enums"]["kyc_status"]
          kyc_submitted_at?: string | null
          last_login_at?: string | null
          last_login_ip?: unknown
          phone?: string
          phone_verified?: boolean | null
          signup_ip?: unknown
          updated_at?: string
        }
        Relationships: []
      }
      transactions: {
        Row: {
          amount: number
          chama_id: string | null
          created_at: string
          id: string
          mchango_id: string | null
          payment_method: string | null
          payment_reference: string
          status: Database["public"]["Enums"]["transaction_status"]
          transaction_type: Database["public"]["Enums"]["transaction_type"]
          user_id: string
        }
        Insert: {
          amount: number
          chama_id?: string | null
          created_at?: string
          id?: string
          mchango_id?: string | null
          payment_method?: string | null
          payment_reference: string
          status?: Database["public"]["Enums"]["transaction_status"]
          transaction_type: Database["public"]["Enums"]["transaction_type"]
          user_id: string
        }
        Update: {
          amount?: number
          chama_id?: string | null
          created_at?: string
          id?: string
          mchango_id?: string | null
          payment_method?: string | null
          payment_reference?: string
          status?: Database["public"]["Enums"]["transaction_status"]
          transaction_type?: Database["public"]["Enums"]["transaction_type"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "transactions_chama_id_fkey"
            columns: ["chama_id"]
            isOneToOne: false
            referencedRelation: "chama"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_mchango_id_fkey"
            columns: ["mchango_id"]
            isOneToOne: false
            referencedRelation: "mchango"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      withdrawals: {
        Row: {
          amount: number
          chama_id: string | null
          commission_amount: number
          completed_at: string | null
          created_at: string
          id: string
          mchango_id: string | null
          net_amount: number
          notes: string | null
          payment_reference: string | null
          rejection_reason: string | null
          requested_at: string
          requested_by: string
          reviewed_at: string | null
          reviewed_by: string | null
          status: string
          updated_at: string
        }
        Insert: {
          amount: number
          chama_id?: string | null
          commission_amount?: number
          completed_at?: string | null
          created_at?: string
          id?: string
          mchango_id?: string | null
          net_amount: number
          notes?: string | null
          payment_reference?: string | null
          rejection_reason?: string | null
          requested_at?: string
          requested_by: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          amount?: number
          chama_id?: string | null
          commission_amount?: number
          completed_at?: string | null
          created_at?: string
          id?: string
          mchango_id?: string | null
          net_amount?: number
          notes?: string | null
          payment_reference?: string | null
          rejection_reason?: string | null
          requested_at?: string
          requested_by?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "withdrawals_chama_id_fkey"
            columns: ["chama_id"]
            isOneToOne: false
            referencedRelation: "chama"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "withdrawals_mchango_id_fkey"
            columns: ["mchango_id"]
            isOneToOne: false
            referencedRelation: "mchango"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      calculate_next_due_date: {
        Args: { p_chama_id: string; p_last_payment_date: string }
        Returns: string
      }
      generate_invite_code: { Args: never; Returns: string }
      generate_member_code: {
        Args: { p_chama_id: string; p_order_index: number }
        Returns: string
      }
      generate_slug: { Args: { title: string }; Returns: string }
      get_member_payout_position: {
        Args: { p_member_id: string }
        Returns: {
          estimated_amount: number
          estimated_payout_date: string
          position_in_queue: number
        }[]
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_chama_manager: {
        Args: { _chama_id: string; _user_id: string }
        Returns: boolean
      }
      is_chama_member: {
        Args: { _chama_id: string; _user_id: string }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "admin" | "user"
      chama_status: "active" | "inactive" | "completed"
      contribution_frequency: "daily" | "weekly" | "monthly" | "every_n_days"
      kyc_status: "pending" | "approved" | "rejected"
      mchango_status: "active" | "completed" | "cancelled"
      member_status: "active" | "inactive" | "left"
      payout_status: "pending" | "processing" | "completed" | "failed"
      transaction_status: "pending" | "completed" | "failed" | "refunded"
      transaction_type: "donation" | "contribution" | "payout"
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
    Enums: {
      app_role: ["admin", "user"],
      chama_status: ["active", "inactive", "completed"],
      contribution_frequency: ["daily", "weekly", "monthly", "every_n_days"],
      kyc_status: ["pending", "approved", "rejected"],
      mchango_status: ["active", "completed", "cancelled"],
      member_status: ["active", "inactive", "left"],
      payout_status: ["pending", "processing", "completed", "failed"],
      transaction_status: ["pending", "completed", "failed", "refunded"],
      transaction_type: ["donation", "contribution", "payout"],
    },
  },
} as const
