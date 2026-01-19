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
          accepting_rejoin_requests: boolean | null
          commission_rate: number | null
          contribution_amount: number
          contribution_frequency: Database["public"]["Enums"]["contribution_frequency"]
          created_at: string
          created_by: string
          current_cycle_round: number | null
          description: string | null
          every_n_days_count: number | null
          group_code: string | null
          id: string
          is_public: boolean | null
          last_cycle_completed_at: string | null
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
          accepting_rejoin_requests?: boolean | null
          commission_rate?: number | null
          contribution_amount: number
          contribution_frequency: Database["public"]["Enums"]["contribution_frequency"]
          created_at?: string
          created_by: string
          current_cycle_round?: number | null
          description?: string | null
          every_n_days_count?: number | null
          group_code?: string | null
          id?: string
          is_public?: boolean | null
          last_cycle_completed_at?: string | null
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
          accepting_rejoin_requests?: boolean | null
          commission_rate?: number | null
          contribution_amount?: number
          contribution_frequency?: Database["public"]["Enums"]["contribution_frequency"]
          created_at?: string
          created_by?: string
          current_cycle_round?: number | null
          description?: string | null
          every_n_days_count?: number | null
          group_code?: string | null
          id?: string
          is_public?: boolean | null
          last_cycle_completed_at?: string | null
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
      chama_cycle_history: {
        Row: {
          chama_id: string
          completed_at: string | null
          created_at: string | null
          cycle_round: number
          id: string
          started_at: string
          total_members: number
          total_payouts_made: number
        }
        Insert: {
          chama_id: string
          completed_at?: string | null
          created_at?: string | null
          cycle_round: number
          id?: string
          started_at: string
          total_members: number
          total_payouts_made: number
        }
        Update: {
          chama_id?: string
          completed_at?: string | null
          created_at?: string | null
          cycle_round?: number
          id?: string
          started_at?: string
          total_members?: number
          total_payouts_made?: number
        }
        Relationships: [
          {
            foreignKeyName: "chama_cycle_history_chama_id_fkey"
            columns: ["chama_id"]
            isOneToOne: false
            referencedRelation: "chama"
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
          missed_payments_count: number | null
          next_cycle_credit: number | null
          next_due_date: string | null
          order_index: number | null
          requires_admin_verification: boolean | null
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
          missed_payments_count?: number | null
          next_cycle_credit?: number | null
          next_due_date?: string | null
          order_index?: number | null
          requires_admin_verification?: boolean | null
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
          missed_payments_count?: number | null
          next_cycle_credit?: number | null
          next_due_date?: string | null
          order_index?: number | null
          requires_admin_verification?: boolean | null
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
      chama_rejoin_requests: {
        Row: {
          chama_id: string
          id: string
          notes: string | null
          previous_member_id: string | null
          requested_at: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          status: string
          user_id: string
        }
        Insert: {
          chama_id: string
          id?: string
          notes?: string | null
          previous_member_id?: string | null
          requested_at?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          user_id: string
        }
        Update: {
          chama_id?: string
          id?: string
          notes?: string | null
          previous_member_id?: string | null
          requested_at?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "chama_rejoin_requests_chama_id_fkey"
            columns: ["chama_id"]
            isOneToOne: false
            referencedRelation: "chama"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chama_rejoin_requests_previous_member_id_fkey"
            columns: ["previous_member_id"]
            isOneToOne: false
            referencedRelation: "chama_members"
            referencedColumns: ["id"]
          },
        ]
      }
      chat_messages: {
        Row: {
          content: string
          created_at: string
          id: string
          role: string
          session_id: string
          user_id: string | null
        }
        Insert: {
          content: string
          created_at?: string
          id?: string
          role: string
          session_id: string
          user_id?: string | null
        }
        Update: {
          content?: string
          created_at?: string
          id?: string
          role?: string
          session_id?: string
          user_id?: string | null
        }
        Relationships: []
      }
      company_earnings: {
        Row: {
          amount: number
          created_at: string
          description: string | null
          group_id: string | null
          id: string
          reference_id: string | null
          source: string
        }
        Insert: {
          amount: number
          created_at?: string
          description?: string | null
          group_id?: string | null
          id?: string
          reference_id?: string | null
          source: string
        }
        Update: {
          amount?: number
          created_at?: string
          description?: string | null
          group_id?: string | null
          id?: string
          reference_id?: string | null
          source?: string
        }
        Relationships: [
          {
            foreignKeyName: "company_earnings_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "saving_groups"
            referencedColumns: ["id"]
          },
        ]
      }
      contribution_cycles: {
        Row: {
          beneficiary_member_id: string | null
          chama_id: string
          created_at: string | null
          cycle_number: number
          due_amount: number
          end_date: string
          id: string
          is_complete: boolean | null
          payout_amount: number | null
          payout_processed: boolean | null
          payout_processed_at: string | null
          payout_type: string | null
          start_date: string
        }
        Insert: {
          beneficiary_member_id?: string | null
          chama_id: string
          created_at?: string | null
          cycle_number: number
          due_amount: number
          end_date: string
          id?: string
          is_complete?: boolean | null
          payout_amount?: number | null
          payout_processed?: boolean | null
          payout_processed_at?: string | null
          payout_type?: string | null
          start_date: string
        }
        Update: {
          beneficiary_member_id?: string | null
          chama_id?: string
          created_at?: string | null
          cycle_number?: number
          due_amount?: number
          end_date?: string
          id?: string
          is_complete?: boolean | null
          payout_amount?: number | null
          payout_processed?: boolean | null
          payout_processed_at?: string | null
          payout_type?: string | null
          start_date?: string
        }
        Relationships: [
          {
            foreignKeyName: "contribution_cycles_beneficiary_member_id_fkey"
            columns: ["beneficiary_member_id"]
            isOneToOne: false
            referencedRelation: "chama_members"
            referencedColumns: ["id"]
          },
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
      customer_callbacks: {
        Row: {
          conversation_history: Json | null
          created_at: string
          customer_name: string | null
          id: string
          notes: string | null
          phone_number: string
          question: string
          resolved_at: string | null
          status: string
        }
        Insert: {
          conversation_history?: Json | null
          created_at?: string
          customer_name?: string | null
          id?: string
          notes?: string | null
          phone_number: string
          question: string
          resolved_at?: string | null
          status?: string
        }
        Update: {
          conversation_history?: Json | null
          created_at?: string
          customer_name?: string | null
          id?: string
          notes?: string | null
          phone_number?: string
          question?: string
          resolved_at?: string | null
          status?: string
        }
        Relationships: []
      }
      mchango: {
        Row: {
          available_balance: number | null
          beneficiary_url: string | null
          category: string | null
          created_at: string
          created_by: string
          current_amount: number
          description: string | null
          end_date: string | null
          group_code: string | null
          id: string
          image_url: string | null
          image_url_2: string | null
          image_url_3: string | null
          is_public: boolean | null
          managers: string[] | null
          slug: string
          status: Database["public"]["Enums"]["mchango_status"]
          target_amount: number
          title: string
          total_commission_paid: number | null
          total_gross_collected: number | null
          updated_at: string
          whatsapp_link: string | null
          youtube_url: string | null
        }
        Insert: {
          available_balance?: number | null
          beneficiary_url?: string | null
          category?: string | null
          created_at?: string
          created_by: string
          current_amount?: number
          description?: string | null
          end_date?: string | null
          group_code?: string | null
          id?: string
          image_url?: string | null
          image_url_2?: string | null
          image_url_3?: string | null
          is_public?: boolean | null
          managers?: string[] | null
          slug: string
          status?: Database["public"]["Enums"]["mchango_status"]
          target_amount: number
          title: string
          total_commission_paid?: number | null
          total_gross_collected?: number | null
          updated_at?: string
          whatsapp_link?: string | null
          youtube_url?: string | null
        }
        Update: {
          available_balance?: number | null
          beneficiary_url?: string | null
          category?: string | null
          created_at?: string
          created_by?: string
          current_amount?: number
          description?: string | null
          end_date?: string | null
          group_code?: string | null
          id?: string
          image_url?: string | null
          image_url_2?: string | null
          image_url_3?: string | null
          is_public?: boolean | null
          managers?: string[] | null
          slug?: string
          status?: Database["public"]["Enums"]["mchango_status"]
          target_amount?: number
          title?: string
          total_commission_paid?: number | null
          total_gross_collected?: number | null
          updated_at?: string
          whatsapp_link?: string | null
          youtube_url?: string | null
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
          commission_amount: number | null
          completed_at: string | null
          created_at: string
          display_name: string | null
          email: string | null
          gross_amount: number | null
          id: string
          is_anonymous: boolean
          mchango_id: string
          net_amount: number | null
          payment_method: string | null
          payment_reference: string
          payment_status: string
          phone: string | null
          user_id: string | null
        }
        Insert: {
          amount: number
          commission_amount?: number | null
          completed_at?: string | null
          created_at?: string
          display_name?: string | null
          email?: string | null
          gross_amount?: number | null
          id?: string
          is_anonymous?: boolean
          mchango_id: string
          net_amount?: number | null
          payment_method?: string | null
          payment_reference: string
          payment_status?: string
          phone?: string | null
          user_id?: string | null
        }
        Update: {
          amount?: number
          commission_amount?: number | null
          completed_at?: string | null
          created_at?: string
          display_name?: string | null
          email?: string | null
          gross_amount?: number | null
          id?: string
          is_anonymous?: boolean
          mchango_id?: string
          net_amount?: number | null
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
          credited_to_next_cycle: boolean | null
          cycle_id: string
          id: string
          is_late_payment: boolean | null
          is_paid: boolean | null
          member_id: string
          paid_at: string | null
          payment_time: string | null
          reminder_sent_at: string | null
        }
        Insert: {
          amount_due: number
          amount_paid?: number | null
          created_at?: string | null
          credited_to_next_cycle?: boolean | null
          cycle_id: string
          id?: string
          is_late_payment?: boolean | null
          is_paid?: boolean | null
          member_id: string
          paid_at?: string | null
          payment_time?: string | null
          reminder_sent_at?: string | null
        }
        Update: {
          amount_due?: number
          amount_paid?: number | null
          created_at?: string | null
          credited_to_next_cycle?: boolean | null
          cycle_id?: string
          id?: string
          is_late_payment?: boolean | null
          is_paid?: boolean | null
          member_id?: string
          paid_at?: string | null
          payment_time?: string | null
          reminder_sent_at?: string | null
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
      organization_donations: {
        Row: {
          amount: number
          commission_amount: number | null
          completed_at: string | null
          created_at: string
          display_name: string | null
          email: string | null
          gross_amount: number | null
          id: string
          is_anonymous: boolean
          net_amount: number | null
          organization_id: string
          payment_method: string | null
          payment_reference: string
          payment_status: string
          phone: string | null
          user_id: string | null
        }
        Insert: {
          amount: number
          commission_amount?: number | null
          completed_at?: string | null
          created_at?: string
          display_name?: string | null
          email?: string | null
          gross_amount?: number | null
          id?: string
          is_anonymous?: boolean
          net_amount?: number | null
          organization_id: string
          payment_method?: string | null
          payment_reference: string
          payment_status?: string
          phone?: string | null
          user_id?: string | null
        }
        Update: {
          amount?: number
          commission_amount?: number | null
          completed_at?: string | null
          created_at?: string
          display_name?: string | null
          email?: string | null
          gross_amount?: number | null
          id?: string
          is_anonymous?: boolean
          net_amount?: number | null
          organization_id?: string
          payment_method?: string | null
          payment_reference?: string
          payment_status?: string
          phone?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "organization_donations_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "organization_donations_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      organizations: {
        Row: {
          about: string | null
          available_balance: number | null
          category: string
          cover_image_url: string | null
          created_at: string
          created_by: string
          current_amount: number
          description: string | null
          email: string | null
          group_code: string | null
          id: string
          is_public: boolean | null
          is_verified: boolean | null
          location: string | null
          logo_url: string | null
          name: string
          phone: string | null
          slug: string
          status: string
          total_commission_paid: number | null
          total_gross_collected: number | null
          updated_at: string
          website_url: string | null
          whatsapp_link: string | null
          youtube_url: string | null
        }
        Insert: {
          about?: string | null
          available_balance?: number | null
          category: string
          cover_image_url?: string | null
          created_at?: string
          created_by: string
          current_amount?: number
          description?: string | null
          email?: string | null
          group_code?: string | null
          id?: string
          is_public?: boolean | null
          is_verified?: boolean | null
          location?: string | null
          logo_url?: string | null
          name: string
          phone?: string | null
          slug: string
          status?: string
          total_commission_paid?: number | null
          total_gross_collected?: number | null
          updated_at?: string
          website_url?: string | null
          whatsapp_link?: string | null
          youtube_url?: string | null
        }
        Update: {
          about?: string | null
          available_balance?: number | null
          category?: string
          cover_image_url?: string | null
          created_at?: string
          created_by?: string
          current_amount?: number
          description?: string | null
          email?: string | null
          group_code?: string | null
          id?: string
          is_public?: boolean | null
          is_verified?: boolean | null
          location?: string | null
          logo_url?: string | null
          name?: string
          phone?: string | null
          slug?: string
          status?: string
          total_commission_paid?: number | null
          total_gross_collected?: number | null
          updated_at?: string
          website_url?: string | null
          whatsapp_link?: string | null
          youtube_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "organizations_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      otp_verifications: {
        Row: {
          attempts: number | null
          created_at: string | null
          expires_at: string
          id: string
          max_attempts: number | null
          otp: string
          phone: string
          verified: boolean | null
        }
        Insert: {
          attempts?: number | null
          created_at?: string | null
          expires_at: string
          id?: string
          max_attempts?: number | null
          otp: string
          phone: string
          verified?: boolean | null
        }
        Update: {
          attempts?: number | null
          created_at?: string | null
          expires_at?: string
          id?: string
          max_attempts?: number | null
          otp?: string
          phone?: string
          verified?: boolean | null
        }
        Relationships: []
      }
      payment_methods: {
        Row: {
          account_name: string | null
          account_number: string | null
          bank_name: string | null
          created_at: string | null
          id: string
          is_default: boolean | null
          is_verified: boolean | null
          method_type: Database["public"]["Enums"]["payment_method_type"]
          phone_number: string | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          account_name?: string | null
          account_number?: string | null
          bank_name?: string | null
          created_at?: string | null
          id?: string
          is_default?: boolean | null
          is_verified?: boolean | null
          method_type: Database["public"]["Enums"]["payment_method_type"]
          phone_number?: string | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          account_name?: string | null
          account_number?: string | null
          bank_name?: string | null
          created_at?: string | null
          id?: string
          is_default?: boolean | null
          is_verified?: boolean | null
          method_type?: Database["public"]["Enums"]["payment_method_type"]
          phone_number?: string | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
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
      platform_financial_summary: {
        Row: {
          chama_client_funds: number | null
          chama_commission: number | null
          chama_gross: number | null
          created_at: string | null
          id: string
          mchango_client_funds: number | null
          mchango_commission: number | null
          mchango_gross: number | null
          org_client_funds: number | null
          org_commission: number | null
          org_gross: number | null
          pending_withdrawals: number | null
          savings_client_funds: number | null
          savings_commission: number | null
          savings_gross: number | null
          summary_date: string
          total_client_funds: number | null
          total_commission: number | null
          total_gross: number | null
          updated_at: string | null
        }
        Insert: {
          chama_client_funds?: number | null
          chama_commission?: number | null
          chama_gross?: number | null
          created_at?: string | null
          id?: string
          mchango_client_funds?: number | null
          mchango_commission?: number | null
          mchango_gross?: number | null
          org_client_funds?: number | null
          org_commission?: number | null
          org_gross?: number | null
          pending_withdrawals?: number | null
          savings_client_funds?: number | null
          savings_commission?: number | null
          savings_gross?: number | null
          summary_date?: string
          total_client_funds?: number | null
          total_commission?: number | null
          total_gross?: number | null
          updated_at?: string | null
        }
        Update: {
          chama_client_funds?: number | null
          chama_commission?: number | null
          chama_gross?: number | null
          created_at?: string | null
          id?: string
          mchango_client_funds?: number | null
          mchango_commission?: number | null
          mchango_gross?: number | null
          org_client_funds?: number | null
          org_commission?: number | null
          org_gross?: number | null
          pending_withdrawals?: number | null
          savings_client_funds?: number | null
          savings_commission?: number | null
          savings_gross?: number | null
          summary_date?: string
          total_client_funds?: number | null
          total_commission?: number | null
          total_gross?: number | null
          updated_at?: string | null
        }
        Relationships: []
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
          payment_details_completed: boolean | null
          phone: string | null
          phone_otp_verified: boolean | null
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
          payment_details_completed?: boolean | null
          phone?: string | null
          phone_otp_verified?: boolean | null
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
          payment_details_completed?: boolean | null
          phone?: string | null
          phone_otp_verified?: boolean | null
          phone_verified?: boolean | null
          signup_ip?: unknown
          updated_at?: string
        }
        Relationships: []
      }
      rate_limit_attempts: {
        Row: {
          action: string
          attempts: number
          created_at: string
          id: string
          identifier: string
          identifier_type: Database["public"]["Enums"]["rate_limit_type"]
          updated_at: string
          window_start: string
        }
        Insert: {
          action: string
          attempts?: number
          created_at?: string
          id?: string
          identifier: string
          identifier_type: Database["public"]["Enums"]["rate_limit_type"]
          updated_at?: string
          window_start?: string
        }
        Update: {
          action?: string
          attempts?: number
          created_at?: string
          id?: string
          identifier?: string
          identifier_type?: Database["public"]["Enums"]["rate_limit_type"]
          updated_at?: string
          window_start?: string
        }
        Relationships: []
      }
      saving_deposits: {
        Row: {
          balance_after: number
          commission_amount: number
          created_at: string
          deposit_date: string
          gross_amount: number
          group_id: string
          id: string
          member_id: string
          net_amount: number
          notes: string | null
          paid_by_user_id: string
          payment_reference: string
          user_id: string
        }
        Insert: {
          balance_after: number
          commission_amount: number
          created_at?: string
          deposit_date?: string
          gross_amount: number
          group_id: string
          id?: string
          member_id: string
          net_amount: number
          notes?: string | null
          paid_by_user_id: string
          payment_reference: string
          user_id: string
        }
        Update: {
          balance_after?: number
          commission_amount?: number
          created_at?: string
          deposit_date?: string
          gross_amount?: number
          group_id?: string
          id?: string
          member_id?: string
          net_amount?: number
          notes?: string | null
          paid_by_user_id?: string
          payment_reference?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "saving_deposits_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "saving_groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "saving_deposits_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "saving_group_members"
            referencedColumns: ["id"]
          },
        ]
      }
      saving_group_deposits: {
        Row: {
          amount: number
          commission_amount: number
          completed_at: string | null
          created_at: string
          failed_reason: string | null
          id: string
          last_retry_at: string | null
          max_retries: number | null
          member_user_id: string
          mpesa_receipt_number: string | null
          net_amount: number
          payer_user_id: string
          payment_reference: string | null
          profit_fee: number | null
          retry_count: number | null
          saved_for_member_id: string | null
          saving_group_id: string
          status: string | null
        }
        Insert: {
          amount: number
          commission_amount: number
          completed_at?: string | null
          created_at?: string
          failed_reason?: string | null
          id?: string
          last_retry_at?: string | null
          max_retries?: number | null
          member_user_id: string
          mpesa_receipt_number?: string | null
          net_amount: number
          payer_user_id: string
          payment_reference?: string | null
          profit_fee?: number | null
          retry_count?: number | null
          saved_for_member_id?: string | null
          saving_group_id: string
          status?: string | null
        }
        Update: {
          amount?: number
          commission_amount?: number
          completed_at?: string | null
          created_at?: string
          failed_reason?: string | null
          id?: string
          last_retry_at?: string | null
          max_retries?: number | null
          member_user_id?: string
          mpesa_receipt_number?: string | null
          net_amount?: number
          payer_user_id?: string
          payment_reference?: string | null
          profit_fee?: number | null
          retry_count?: number | null
          saved_for_member_id?: string | null
          saving_group_id?: string
          status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "saving_group_deposits_saved_for_member_id_fkey"
            columns: ["saved_for_member_id"]
            isOneToOne: false
            referencedRelation: "saving_group_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "saving_group_deposits_saving_group_id_fkey"
            columns: ["saving_group_id"]
            isOneToOne: false
            referencedRelation: "saving_groups"
            referencedColumns: ["id"]
          },
        ]
      }
      saving_group_invite_codes: {
        Row: {
          code: string
          created_at: string | null
          created_by: string
          expires_at: string | null
          id: string
          is_active: boolean | null
          saving_group_id: string
          used_at: string | null
          used_by: string | null
        }
        Insert: {
          code: string
          created_at?: string | null
          created_by: string
          expires_at?: string | null
          id?: string
          is_active?: boolean | null
          saving_group_id: string
          used_at?: string | null
          used_by?: string | null
        }
        Update: {
          code?: string
          created_at?: string | null
          created_by?: string
          expires_at?: string | null
          id?: string
          is_active?: boolean | null
          saving_group_id?: string
          used_at?: string | null
          used_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "saving_group_invite_codes_saving_group_id_fkey"
            columns: ["saving_group_id"]
            isOneToOne: false
            referencedRelation: "saving_groups"
            referencedColumns: ["id"]
          },
        ]
      }
      saving_group_loan_guarantors: {
        Row: {
          approved_at: string
          default_payment_amount: number | null
          guarantor_user_id: string
          id: string
          is_default_payer: boolean
          loan_id: string
        }
        Insert: {
          approved_at?: string
          default_payment_amount?: number | null
          guarantor_user_id: string
          id?: string
          is_default_payer?: boolean
          loan_id: string
        }
        Update: {
          approved_at?: string
          default_payment_amount?: number | null
          guarantor_user_id?: string
          id?: string
          is_default_payer?: boolean
          loan_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "saving_group_loan_guarantors_loan_id_fkey"
            columns: ["loan_id"]
            isOneToOne: false
            referencedRelation: "saving_group_loans"
            referencedColumns: ["id"]
          },
        ]
      }
      saving_group_loan_repayments: {
        Row: {
          amount: number
          created_at: string
          id: string
          loan_id: string
        }
        Insert: {
          amount: number
          created_at?: string
          id?: string
          loan_id: string
        }
        Update: {
          amount?: number
          created_at?: string
          id?: string
          loan_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "saving_group_loan_repayments_loan_id_fkey"
            columns: ["loan_id"]
            isOneToOne: false
            referencedRelation: "saving_group_loans"
            referencedColumns: ["id"]
          },
        ]
      }
      saving_group_loans: {
        Row: {
          approved_at: string | null
          balance_remaining: number
          borrower_user_id: string
          commission_deducted: number
          defaulted_at: string | null
          disbursed_amount: number
          disbursed_at: string | null
          due_date: string
          id: string
          insurance_fee_rate: number
          interest_rate: number
          is_active: boolean
          principal_amount: number
          profit_deducted: number
          repaid_at: string | null
          repayment_due_date: string | null
          requested_amount: number
          requested_at: string
          saving_group_id: string
          status: string
          total_repayment_amount: number
          waitlist: boolean | null
        }
        Insert: {
          approved_at?: string | null
          balance_remaining: number
          borrower_user_id: string
          commission_deducted: number
          defaulted_at?: string | null
          disbursed_amount: number
          disbursed_at?: string | null
          due_date: string
          id?: string
          insurance_fee_rate?: number
          interest_rate?: number
          is_active?: boolean
          principal_amount: number
          profit_deducted: number
          repaid_at?: string | null
          repayment_due_date?: string | null
          requested_amount: number
          requested_at?: string
          saving_group_id: string
          status?: string
          total_repayment_amount: number
          waitlist?: boolean | null
        }
        Update: {
          approved_at?: string | null
          balance_remaining?: number
          borrower_user_id?: string
          commission_deducted?: number
          defaulted_at?: string | null
          disbursed_amount?: number
          disbursed_at?: string | null
          due_date?: string
          id?: string
          insurance_fee_rate?: number
          interest_rate?: number
          is_active?: boolean
          principal_amount?: number
          profit_deducted?: number
          repaid_at?: string | null
          repayment_due_date?: string | null
          requested_amount?: number
          requested_at?: string
          saving_group_id?: string
          status?: string
          total_repayment_amount?: number
          waitlist?: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "saving_group_loans_saving_group_id_fkey"
            columns: ["saving_group_id"]
            isOneToOne: false
            referencedRelation: "saving_groups"
            referencedColumns: ["id"]
          },
        ]
      }
      saving_group_members: {
        Row: {
          current_savings: number
          group_id: string
          id: string
          is_approved: boolean | null
          is_loan_eligible: boolean
          joined_at: string
          lifetime_deposits: number
          status: string
          unique_member_id: string | null
          user_id: string
        }
        Insert: {
          current_savings?: number
          group_id: string
          id?: string
          is_approved?: boolean | null
          is_loan_eligible?: boolean
          joined_at?: string
          lifetime_deposits?: number
          status?: string
          unique_member_id?: string | null
          user_id: string
        }
        Update: {
          current_savings?: number
          group_id?: string
          id?: string
          is_approved?: boolean | null
          is_loan_eligible?: boolean
          joined_at?: string
          lifetime_deposits?: number
          status?: string
          unique_member_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "saving_group_members_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "saving_groups"
            referencedColumns: ["id"]
          },
        ]
      }
      saving_group_profit_distributions: {
        Row: {
          amount: number
          created_at: string
          cycle_end_date: string
          id: string
          saving_group_id: string
          user_id: string
        }
        Insert: {
          amount: number
          created_at?: string
          cycle_end_date: string
          id?: string
          saving_group_id: string
          user_id: string
        }
        Update: {
          amount?: number
          created_at?: string
          cycle_end_date?: string
          id?: string
          saving_group_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "saving_group_profit_distributions_saving_group_id_fkey"
            columns: ["saving_group_id"]
            isOneToOne: false
            referencedRelation: "saving_groups"
            referencedColumns: ["id"]
          },
        ]
      }
      saving_group_profit_shares: {
        Row: {
          created_at: string
          disbursed: boolean | null
          disbursed_at: string | null
          id: string
          member_id: string
          profit_id: string
          savings_ratio: number
          share_amount: number
        }
        Insert: {
          created_at?: string
          disbursed?: boolean | null
          disbursed_at?: string | null
          id?: string
          member_id: string
          profit_id: string
          savings_ratio?: number
          share_amount?: number
        }
        Update: {
          created_at?: string
          disbursed?: boolean | null
          disbursed_at?: string | null
          id?: string
          member_id?: string
          profit_id?: string
          savings_ratio?: number
          share_amount?: number
        }
        Relationships: [
          {
            foreignKeyName: "saving_group_profit_shares_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "saving_group_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "saving_group_profit_shares_profit_id_fkey"
            columns: ["profit_id"]
            isOneToOne: false
            referencedRelation: "saving_group_profits"
            referencedColumns: ["id"]
          },
        ]
      }
      saving_group_profits: {
        Row: {
          created_at: string
          cycle_period: string
          distributed: boolean | null
          distribution_date: string | null
          group_id: string
          id: string
          total_profit: number
        }
        Insert: {
          created_at?: string
          cycle_period: string
          distributed?: boolean | null
          distribution_date?: string | null
          group_id: string
          id?: string
          total_profit?: number
        }
        Update: {
          created_at?: string
          cycle_period?: string
          distributed?: boolean | null
          distribution_date?: string | null
          group_id?: string
          id?: string
          total_profit?: number
        }
        Relationships: [
          {
            foreignKeyName: "saving_group_profits_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "saving_groups"
            referencedColumns: ["id"]
          },
        ]
      }
      saving_group_transactions: {
        Row: {
          amount: number
          created_at: string
          group_id: string
          id: string
          member_id: string | null
          notes: string | null
          reference_id: string | null
          transaction_type: string
        }
        Insert: {
          amount: number
          created_at?: string
          group_id: string
          id?: string
          member_id?: string | null
          notes?: string | null
          reference_id?: string | null
          transaction_type: string
        }
        Update: {
          amount?: number
          created_at?: string
          group_id?: string
          id?: string
          member_id?: string | null
          notes?: string | null
          reference_id?: string | null
          transaction_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "saving_group_transactions_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "saving_groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "saving_group_transactions_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "saving_group_members"
            referencedColumns: ["id"]
          },
        ]
      }
      saving_groups: {
        Row: {
          created_at: string
          created_by: string
          cycle_end_date: string
          cycle_start_date: string
          description: string | null
          group_code: string | null
          group_profit_pool: number
          id: string
          manager_id: string
          max_members: number
          monthly_target: number
          name: string
          period_months: number
          profile_picture: string | null
          saving_goal: number
          slug: string
          started_at: string | null
          status: string
          total_group_savings: number
          total_profits: number
          total_savings: number
          updated_at: string
          whatsapp_group_link: string | null
          whatsapp_link: string | null
        }
        Insert: {
          created_at?: string
          created_by: string
          cycle_end_date: string
          cycle_start_date: string
          description?: string | null
          group_code?: string | null
          group_profit_pool?: number
          id?: string
          manager_id: string
          max_members?: number
          monthly_target?: number
          name: string
          period_months?: number
          profile_picture?: string | null
          saving_goal?: number
          slug: string
          started_at?: string | null
          status?: string
          total_group_savings?: number
          total_profits?: number
          total_savings?: number
          updated_at?: string
          whatsapp_group_link?: string | null
          whatsapp_link?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string
          cycle_end_date?: string
          cycle_start_date?: string
          description?: string | null
          group_code?: string | null
          group_profit_pool?: number
          id?: string
          manager_id?: string
          max_members?: number
          monthly_target?: number
          name?: string
          period_months?: number
          profile_picture?: string | null
          saving_goal?: number
          slug?: string
          started_at?: string | null
          status?: string
          total_group_savings?: number
          total_profits?: number
          total_savings?: number
          updated_at?: string
          whatsapp_group_link?: string | null
          whatsapp_link?: string | null
        }
        Relationships: []
      }
      saving_loans: {
        Row: {
          amount: number
          approved_at: string | null
          approved_by: string | null
          borrower_id: string
          created_at: string
          due_date: string | null
          group_id: string
          id: string
          interest_rate: number
          notes: string | null
          repaid_at: string | null
          requested_at: string
          status: string
        }
        Insert: {
          amount: number
          approved_at?: string | null
          approved_by?: string | null
          borrower_id: string
          created_at?: string
          due_date?: string | null
          group_id: string
          id?: string
          interest_rate?: number
          notes?: string | null
          repaid_at?: string | null
          requested_at?: string
          status?: string
        }
        Update: {
          amount?: number
          approved_at?: string | null
          approved_by?: string | null
          borrower_id?: string
          created_at?: string
          due_date?: string | null
          group_id?: string
          id?: string
          interest_rate?: number
          notes?: string | null
          repaid_at?: string | null
          requested_at?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "saving_loans_borrower_id_fkey"
            columns: ["borrower_id"]
            isOneToOne: false
            referencedRelation: "saving_group_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "saving_loans_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "saving_groups"
            referencedColumns: ["id"]
          },
        ]
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
      user_consents: {
        Row: {
          accepted_at: string
          created_at: string
          id: string
          ip_address: string | null
          privacy_version: string
          terms_version: string
          user_id: string
        }
        Insert: {
          accepted_at?: string
          created_at?: string
          id?: string
          ip_address?: string | null
          privacy_version?: string
          terms_version?: string
          user_id: string
        }
        Update: {
          accepted_at?: string
          created_at?: string
          id?: string
          ip_address?: string | null
          privacy_version?: string
          terms_version?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_consents_user_id_fkey"
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
      webauthn_credentials: {
        Row: {
          counter: number
          created_at: string
          credential_id: string
          device_name: string | null
          id: string
          last_used_at: string | null
          public_key: string
          user_id: string
        }
        Insert: {
          counter?: number
          created_at?: string
          credential_id: string
          device_name?: string | null
          id?: string
          last_used_at?: string | null
          public_key: string
          user_id: string
        }
        Update: {
          counter?: number
          created_at?: string
          credential_id?: string
          device_name?: string | null
          id?: string
          last_used_at?: string | null
          public_key?: string
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
          payment_method_id: string | null
          payment_method_type:
            | Database["public"]["Enums"]["payment_method_type"]
            | null
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
          payment_method_id?: string | null
          payment_method_type?:
            | Database["public"]["Enums"]["payment_method_type"]
            | null
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
          payment_method_id?: string | null
          payment_method_type?:
            | Database["public"]["Enums"]["payment_method_type"]
            | null
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
          {
            foreignKeyName: "withdrawals_payment_method_id_fkey"
            columns: ["payment_method_id"]
            isOneToOne: false
            referencedRelation: "payment_methods"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      daily_withdrawal_totals: {
        Row: {
          daily_total: number | null
          payment_method_id: string | null
          transaction_count: number | null
          withdrawal_date: string | null
        }
        Relationships: [
          {
            foreignKeyName: "withdrawals_payment_method_id_fkey"
            columns: ["payment_method_id"]
            isOneToOne: false
            referencedRelation: "payment_methods"
            referencedColumns: ["id"]
          },
        ]
      }
      public_donations: {
        Row: {
          amount: number | null
          completed_at: string | null
          created_at: string | null
          display_name: string | null
          id: string | null
          mchango_id: string | null
          payment_status: string | null
        }
        Insert: {
          amount?: number | null
          completed_at?: string | null
          created_at?: string | null
          display_name?: never
          id?: string | null
          mchango_id?: string | null
          payment_status?: string | null
        }
        Update: {
          amount?: number | null
          completed_at?: string | null
          created_at?: string | null
          display_name?: never
          id?: string | null
          mchango_id?: string | null
          payment_status?: string | null
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
    }
    Functions: {
      calculate_available_loan_pool: {
        Args: { p_group_id: string }
        Returns: number
      }
      calculate_next_due_date: {
        Args: { p_chama_id: string; p_last_payment_date: string }
        Returns: string
      }
      check_all_members_paid: { Args: { p_cycle_id: string }; Returns: boolean }
      check_kyc_approved: { Args: { _user_id: string }; Returns: boolean }
      check_loan_eligibility: {
        Args: { p_member_id: string }
        Returns: boolean
      }
      cleanup_expired_otps: { Args: never; Returns: undefined }
      cleanup_old_chat_messages: { Args: never; Returns: undefined }
      cleanup_old_rate_limits: { Args: never; Returns: undefined }
      generate_group_code: { Args: never; Returns: string }
      generate_group_invite_code: { Args: never; Returns: string }
      generate_invite_code: { Args: never; Returns: string }
      generate_mchango_code: { Args: never; Returns: string }
      generate_member_code: {
        Args: { p_chama_id: string; p_order_index: number }
        Returns: string
      }
      generate_org_code: { Args: never; Returns: string }
      generate_short_member_code: {
        Args: { p_group_code: string; p_member_number: number }
        Returns: string
      }
      generate_slug: { Args: { title: string }; Returns: string }
      generate_unique_member_id: {
        Args: { p_group_id: string; p_member_number: number }
        Returns: string
      }
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
      is_savings_group_manager: {
        Args: { _group_id: string; _user_id: string }
        Returns: boolean
      }
      record_company_earning: {
        Args: {
          p_amount: number
          p_description?: string
          p_group_id?: string
          p_reference_id?: string
          p_source: string
        }
        Returns: string
      }
    }
    Enums: {
      app_role: "admin" | "user"
      chama_status:
        | "active"
        | "inactive"
        | "completed"
        | "pending"
        | "cycle_complete"
      contribution_frequency: "daily" | "weekly" | "monthly" | "every_n_days"
      kyc_status: "pending" | "approved" | "rejected"
      mchango_status: "active" | "completed" | "cancelled"
      member_status: "active" | "inactive" | "left"
      payment_method_type: "mpesa" | "airtel_money" | "bank_account"
      payout_status: "pending" | "processing" | "completed" | "failed"
      rate_limit_type: "ip" | "phone" | "email"
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
      chama_status: [
        "active",
        "inactive",
        "completed",
        "pending",
        "cycle_complete",
      ],
      contribution_frequency: ["daily", "weekly", "monthly", "every_n_days"],
      kyc_status: ["pending", "approved", "rejected"],
      mchango_status: ["active", "completed", "cancelled"],
      member_status: ["active", "inactive", "left"],
      payment_method_type: ["mpesa", "airtel_money", "bank_account"],
      payout_status: ["pending", "processing", "completed", "failed"],
      rate_limit_type: ["ip", "phone", "email"],
      transaction_status: ["pending", "completed", "failed", "refunded"],
      transaction_type: ["donation", "contribution", "payout"],
    },
  },
} as const
