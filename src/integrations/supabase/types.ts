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
          contribution_amount: number
          contribution_frequency: Database["public"]["Enums"]["contribution_frequency"]
          created_at: string
          created_by: string
          description: string | null
          id: string
          max_members: number
          name: string
          slug: string
          status: Database["public"]["Enums"]["chama_status"]
          updated_at: string
          whatsapp_link: string | null
        }
        Insert: {
          contribution_amount: number
          contribution_frequency: Database["public"]["Enums"]["contribution_frequency"]
          created_at?: string
          created_by: string
          description?: string | null
          id?: string
          max_members?: number
          name: string
          slug: string
          status?: Database["public"]["Enums"]["chama_status"]
          updated_at?: string
          whatsapp_link?: string | null
        }
        Update: {
          contribution_amount?: number
          contribution_frequency?: Database["public"]["Enums"]["contribution_frequency"]
          created_at?: string
          created_by?: string
          description?: string | null
          id?: string
          max_members?: number
          name?: string
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
      chama_members: {
        Row: {
          chama_id: string
          id: string
          is_manager: boolean
          joined_at: string
          member_code: string
          status: Database["public"]["Enums"]["member_status"]
          user_id: string | null
        }
        Insert: {
          chama_id: string
          id?: string
          is_manager?: boolean
          joined_at?: string
          member_code: string
          status?: Database["public"]["Enums"]["member_status"]
          user_id?: string | null
        }
        Update: {
          chama_id?: string
          id?: string
          is_manager?: boolean
          joined_at?: string
          member_code?: string
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
      contributions: {
        Row: {
          amount: number
          chama_id: string
          contribution_date: string
          created_at: string
          id: string
          member_id: string
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
          phone: string
          phone_verified: boolean | null
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
          phone: string
          phone_verified?: boolean | null
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
          phone?: string
          phone_verified?: boolean | null
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
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      generate_slug: {
        Args: { title: string }
        Returns: string
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "admin" | "user"
      chama_status: "active" | "inactive" | "completed"
      contribution_frequency: "daily" | "weekly" | "monthly"
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
      contribution_frequency: ["daily", "weekly", "monthly"],
      kyc_status: ["pending", "approved", "rejected"],
      mchango_status: ["active", "completed", "cancelled"],
      member_status: ["active", "inactive", "left"],
      payout_status: ["pending", "processing", "completed", "failed"],
      transaction_status: ["pending", "completed", "failed", "refunded"],
      transaction_type: ["donation", "contribution", "payout"],
    },
  },
} as const
