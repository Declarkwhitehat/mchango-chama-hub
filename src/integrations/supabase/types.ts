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
          available_balance: number | null
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
          is_verified: boolean
          last_cycle_completed_at: string | null
          max_members: number
          min_members: number | null
          monthly_contribution_day: number | null
          monthly_contribution_day_2: number | null
          name: string
          payout_order: string | null
          slug: string
          start_date: string | null
          status: Database["public"]["Enums"]["chama_status"]
          total_commission_paid: number | null
          total_gross_collected: number | null
          total_withdrawn: number | null
          updated_at: string
          whatsapp_link: string | null
        }
        Insert: {
          accepting_rejoin_requests?: boolean | null
          available_balance?: number | null
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
          is_verified?: boolean
          last_cycle_completed_at?: string | null
          max_members?: number
          min_members?: number | null
          monthly_contribution_day?: number | null
          monthly_contribution_day_2?: number | null
          name: string
          payout_order?: string | null
          slug: string
          start_date?: string | null
          status?: Database["public"]["Enums"]["chama_status"]
          total_commission_paid?: number | null
          total_gross_collected?: number | null
          total_withdrawn?: number | null
          updated_at?: string
          whatsapp_link?: string | null
        }
        Update: {
          accepting_rejoin_requests?: boolean | null
          available_balance?: number | null
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
          is_verified?: boolean
          last_cycle_completed_at?: string | null
          max_members?: number
          min_members?: number | null
          monthly_contribution_day?: number | null
          monthly_contribution_day_2?: number | null
          name?: string
          payout_order?: string | null
          slug?: string
          start_date?: string | null
          status?: Database["public"]["Enums"]["chama_status"]
          total_commission_paid?: number | null
          total_gross_collected?: number | null
          total_withdrawn?: number | null
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
      chama_cycle_deficits: {
        Row: {
          chama_id: string
          commission_rate: number
          created_at: string | null
          cycle_id: string
          debt_id: string
          id: string
          net_owed_to_recipient: number
          non_payer_member_id: string
          paid_at: string | null
          principal_amount: number
          recipient_member_id: string
          status: string
        }
        Insert: {
          chama_id: string
          commission_rate?: number
          created_at?: string | null
          cycle_id: string
          debt_id: string
          id?: string
          net_owed_to_recipient: number
          non_payer_member_id: string
          paid_at?: string | null
          principal_amount: number
          recipient_member_id: string
          status?: string
        }
        Update: {
          chama_id?: string
          commission_rate?: number
          created_at?: string | null
          cycle_id?: string
          debt_id?: string
          id?: string
          net_owed_to_recipient?: number
          non_payer_member_id?: string
          paid_at?: string | null
          principal_amount?: number
          recipient_member_id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "chama_cycle_deficits_chama_id_fkey"
            columns: ["chama_id"]
            isOneToOne: false
            referencedRelation: "chama"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chama_cycle_deficits_cycle_id_fkey"
            columns: ["cycle_id"]
            isOneToOne: false
            referencedRelation: "contribution_cycles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chama_cycle_deficits_debt_id_fkey"
            columns: ["debt_id"]
            isOneToOne: false
            referencedRelation: "chama_member_debts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chama_cycle_deficits_non_payer_member_id_fkey"
            columns: ["non_payer_member_id"]
            isOneToOne: false
            referencedRelation: "chama_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chama_cycle_deficits_recipient_member_id_fkey"
            columns: ["recipient_member_id"]
            isOneToOne: false
            referencedRelation: "chama_members"
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
      chama_member_debts: {
        Row: {
          chama_id: string
          cleared_at: string | null
          created_at: string | null
          cycle_id: string
          id: string
          member_id: string
          payment_allocations: Json | null
          penalty_debt: number
          penalty_remaining: number
          principal_debt: number
          principal_remaining: number
          status: string
        }
        Insert: {
          chama_id: string
          cleared_at?: string | null
          created_at?: string | null
          cycle_id: string
          id?: string
          member_id: string
          payment_allocations?: Json | null
          penalty_debt: number
          penalty_remaining: number
          principal_debt: number
          principal_remaining: number
          status?: string
        }
        Update: {
          chama_id?: string
          cleared_at?: string | null
          created_at?: string | null
          cycle_id?: string
          id?: string
          member_id?: string
          payment_allocations?: Json | null
          penalty_debt?: number
          penalty_remaining?: number
          principal_debt?: number
          principal_remaining?: number
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "chama_member_debts_chama_id_fkey"
            columns: ["chama_id"]
            isOneToOne: false
            referencedRelation: "chama"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chama_member_debts_cycle_id_fkey"
            columns: ["cycle_id"]
            isOneToOne: false
            referencedRelation: "contribution_cycles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chama_member_debts_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "chama_members"
            referencedColumns: ["id"]
          },
        ]
      }
      chama_member_removals: {
        Row: {
          chama_id: string
          chama_name: string | null
          created_at: string | null
          id: string
          member_id: string
          member_name: string | null
          member_phone: string | null
          notification_sent: boolean | null
          removal_reason: string
          removed_at: string | null
          user_id: string
          was_manager: boolean | null
        }
        Insert: {
          chama_id: string
          chama_name?: string | null
          created_at?: string | null
          id?: string
          member_id: string
          member_name?: string | null
          member_phone?: string | null
          notification_sent?: boolean | null
          removal_reason: string
          removed_at?: string | null
          user_id: string
          was_manager?: boolean | null
        }
        Update: {
          chama_id?: string
          chama_name?: string | null
          created_at?: string | null
          id?: string
          member_id?: string
          member_name?: string | null
          member_phone?: string | null
          notification_sent?: boolean | null
          removal_reason?: string
          removed_at?: string | null
          user_id?: string
          was_manager?: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "chama_member_removals_chama_id_fkey"
            columns: ["chama_id"]
            isOneToOne: false
            referencedRelation: "chama"
            referencedColumns: ["id"]
          },
        ]
      }
      chama_members: {
        Row: {
          approval_status: string | null
          balance_credit: number | null
          balance_deficit: number | null
          carry_forward_credit: number | null
          chama_id: string
          contribution_status: string | null
          expected_contributions: number | null
          first_payment_at: string | null
          first_payment_completed: boolean | null
          id: string
          is_manager: boolean
          joined_at: string
          last_payment_date: string | null
          member_code: string
          missed_payments_count: number | null
          next_cycle_credit: number | null
          next_due_date: string | null
          order_index: number | null
          original_order_index: number | null
          payout_deferred_count: number | null
          position_swapped_at: string | null
          removal_reason: string | null
          removed_at: string | null
          requires_admin_verification: boolean | null
          rescheduled_to_position: number | null
          skip_reason: string | null
          skipped_at: string | null
          status: Database["public"]["Enums"]["member_status"]
          swapped_with_member_id: string | null
          total_contributed: number | null
          user_id: string | null
          was_skipped: boolean | null
        }
        Insert: {
          approval_status?: string | null
          balance_credit?: number | null
          balance_deficit?: number | null
          carry_forward_credit?: number | null
          chama_id: string
          contribution_status?: string | null
          expected_contributions?: number | null
          first_payment_at?: string | null
          first_payment_completed?: boolean | null
          id?: string
          is_manager?: boolean
          joined_at?: string
          last_payment_date?: string | null
          member_code: string
          missed_payments_count?: number | null
          next_cycle_credit?: number | null
          next_due_date?: string | null
          order_index?: number | null
          original_order_index?: number | null
          payout_deferred_count?: number | null
          position_swapped_at?: string | null
          removal_reason?: string | null
          removed_at?: string | null
          requires_admin_verification?: boolean | null
          rescheduled_to_position?: number | null
          skip_reason?: string | null
          skipped_at?: string | null
          status?: Database["public"]["Enums"]["member_status"]
          swapped_with_member_id?: string | null
          total_contributed?: number | null
          user_id?: string | null
          was_skipped?: boolean | null
        }
        Update: {
          approval_status?: string | null
          balance_credit?: number | null
          balance_deficit?: number | null
          carry_forward_credit?: number | null
          chama_id?: string
          contribution_status?: string | null
          expected_contributions?: number | null
          first_payment_at?: string | null
          first_payment_completed?: boolean | null
          id?: string
          is_manager?: boolean
          joined_at?: string
          last_payment_date?: string | null
          member_code?: string
          missed_payments_count?: number | null
          next_cycle_credit?: number | null
          next_due_date?: string | null
          order_index?: number | null
          original_order_index?: number | null
          payout_deferred_count?: number | null
          position_swapped_at?: string | null
          removal_reason?: string | null
          removed_at?: string | null
          requires_admin_verification?: boolean | null
          rescheduled_to_position?: number | null
          skip_reason?: string | null
          skipped_at?: string | null
          status?: Database["public"]["Enums"]["member_status"]
          swapped_with_member_id?: string | null
          total_contributed?: number | null
          user_id?: string | null
          was_skipped?: boolean | null
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
            foreignKeyName: "chama_members_swapped_with_member_id_fkey"
            columns: ["swapped_with_member_id"]
            isOneToOne: false
            referencedRelation: "chama_members"
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
      chama_messages: {
        Row: {
          chama_id: string
          created_at: string
          id: string
          is_announcement: boolean
          message: string
          user_id: string
        }
        Insert: {
          chama_id: string
          created_at?: string
          id?: string
          is_announcement?: boolean
          message: string
          user_id: string
        }
        Update: {
          chama_id?: string
          created_at?: string
          id?: string
          is_announcement?: boolean
          message?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "chama_messages_chama_id_fkey"
            columns: ["chama_id"]
            isOneToOne: false
            referencedRelation: "chama"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chama_messages_user_id_fkey"
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
          {
            foreignKeyName: "chama_rejoin_requests_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
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
        Relationships: []
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
          members_paid_count: number | null
          members_skipped_count: number | null
          payout_amount: number | null
          payout_processed: boolean | null
          payout_processed_at: string | null
          payout_type: string | null
          start_date: string
          total_collected_amount: number | null
          total_expected_amount: number | null
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
          members_paid_count?: number | null
          members_skipped_count?: number | null
          payout_amount?: number | null
          payout_processed?: boolean | null
          payout_processed_at?: string | null
          payout_type?: string | null
          start_date: string
          total_collected_amount?: number | null
          total_expected_amount?: number | null
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
          members_paid_count?: number | null
          members_skipped_count?: number | null
          payout_amount?: number | null
          payout_processed?: boolean | null
          payout_processed_at?: string | null
          payout_type?: string | null
          start_date?: string
          total_collected_amount?: number | null
          total_expected_amount?: number | null
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
          idempotency_key: string | null
          member_id: string
          mpesa_receipt_number: string | null
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
          idempotency_key?: string | null
          member_id: string
          mpesa_receipt_number?: string | null
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
          idempotency_key?: string | null
          member_id?: string
          mpesa_receipt_number?: string | null
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
      financial_ledger: {
        Row: {
          commission_amount: number
          commission_rate: number
          created_at: string
          description: string | null
          gross_amount: number
          id: string
          metadata: Json | null
          net_amount: number
          payer_name: string | null
          payer_phone: string | null
          reference_id: string | null
          source_id: string
          source_type: string
          transaction_type: string
        }
        Insert: {
          commission_amount?: number
          commission_rate: number
          created_at?: string
          description?: string | null
          gross_amount?: number
          id?: string
          metadata?: Json | null
          net_amount?: number
          payer_name?: string | null
          payer_phone?: string | null
          reference_id?: string | null
          source_id: string
          source_type: string
          transaction_type: string
        }
        Update: {
          commission_amount?: number
          commission_rate?: number
          created_at?: string
          description?: string | null
          gross_amount?: number
          id?: string
          metadata?: Json | null
          net_amount?: number
          payer_name?: string | null
          payer_phone?: string | null
          reference_id?: string | null
          source_id?: string
          source_type?: string
          transaction_type?: string
        }
        Relationships: []
      }
      fraud_config: {
        Row: {
          created_at: string
          description: string | null
          id: string
          rule_key: string
          rule_value: Json
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          rule_key: string
          rule_value: Json
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          rule_key?: string
          rule_value?: Json
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fraud_config_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      fraud_events: {
        Row: {
          admin_action: string | null
          created_at: string
          device_info: Json | null
          id: string
          ip_address: string | null
          metadata: Json | null
          risk_points_added: number
          rule_triggered: string
          total_risk_score: number
          transaction_id: string | null
          user_id: string
        }
        Insert: {
          admin_action?: string | null
          created_at?: string
          device_info?: Json | null
          id?: string
          ip_address?: string | null
          metadata?: Json | null
          risk_points_added?: number
          rule_triggered: string
          total_risk_score?: number
          transaction_id?: string | null
          user_id: string
        }
        Update: {
          admin_action?: string | null
          created_at?: string
          device_info?: Json | null
          id?: string
          ip_address?: string | null
          metadata?: Json | null
          risk_points_added?: number
          rule_triggered?: string
          total_risk_score?: number
          transaction_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "fraud_events_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
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
          is_verified: boolean
          managers: string[] | null
          paybill_account_id: string
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
          is_verified?: boolean
          managers?: string[] | null
          paybill_account_id: string
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
          is_verified?: boolean
          managers?: string[] | null
          paybill_account_id?: string
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
          mpesa_receipt_number: string | null
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
          mpesa_receipt_number?: string | null
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
          mpesa_receipt_number?: string | null
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
          amount_remaining: number | null
          created_at: string | null
          credited_to_next_cycle: boolean | null
          cycle_id: string
          fully_paid: boolean | null
          id: string
          is_late_payment: boolean | null
          is_paid: boolean | null
          member_id: string
          paid_at: string | null
          payment_allocations: Json | null
          payment_time: string | null
          reminder_sent_at: string | null
        }
        Insert: {
          amount_due: number
          amount_paid?: number | null
          amount_remaining?: number | null
          created_at?: string | null
          credited_to_next_cycle?: boolean | null
          cycle_id: string
          fully_paid?: boolean | null
          id?: string
          is_late_payment?: boolean | null
          is_paid?: boolean | null
          member_id: string
          paid_at?: string | null
          payment_allocations?: Json | null
          payment_time?: string | null
          reminder_sent_at?: string | null
        }
        Update: {
          amount_due?: number
          amount_paid?: number | null
          amount_remaining?: number | null
          created_at?: string | null
          credited_to_next_cycle?: boolean | null
          cycle_id?: string
          fully_paid?: boolean | null
          id?: string
          is_late_payment?: boolean | null
          is_paid?: boolean | null
          member_id?: string
          paid_at?: string | null
          payment_allocations?: Json | null
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
      member_trust_scores: {
        Row: {
          id: string
          total_chamas_completed: number
          total_late_payments: number
          total_missed_payments: number
          total_on_time_payments: number
          total_outstanding_debts: number
          trust_score: number
          updated_at: string
          user_id: string
        }
        Insert: {
          id?: string
          total_chamas_completed?: number
          total_late_payments?: number
          total_missed_payments?: number
          total_on_time_payments?: number
          total_outstanding_debts?: number
          trust_score?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          id?: string
          total_chamas_completed?: number
          total_late_payments?: number
          total_missed_payments?: number
          total_on_time_payments?: number
          total_outstanding_debts?: number
          trust_score?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "member_trust_scores_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          category: string
          created_at: string
          id: string
          is_read: boolean
          message: string
          related_entity_id: string | null
          related_entity_type: string | null
          title: string
          type: string
          user_id: string
        }
        Insert: {
          category: string
          created_at?: string
          id?: string
          is_read?: boolean
          message: string
          related_entity_id?: string | null
          related_entity_type?: string | null
          title: string
          type?: string
          user_id: string
        }
        Update: {
          category?: string
          created_at?: string
          id?: string
          is_read?: boolean
          message?: string
          related_entity_id?: string | null
          related_entity_type?: string | null
          title?: string
          type?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
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
          mpesa_receipt_number: string | null
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
          mpesa_receipt_number?: string | null
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
          mpesa_receipt_number?: string | null
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
          paybill_account_id: string
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
          paybill_account_id: string
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
          paybill_account_id?: string
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
      payout_approval_requests: {
        Row: {
          admin_notes: string | null
          b2c_triggered: boolean | null
          chama_id: string
          chosen_member_id: string | null
          created_at: string
          cycle_id: string
          id: string
          ineligible_members: Json | null
          payout_amount: number
          reason: string
          recommended_member_id: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          scheduled_beneficiary_id: string
          status: string
          updated_at: string
          withdrawal_id: string | null
        }
        Insert: {
          admin_notes?: string | null
          b2c_triggered?: boolean | null
          chama_id: string
          chosen_member_id?: string | null
          created_at?: string
          cycle_id: string
          id?: string
          ineligible_members?: Json | null
          payout_amount?: number
          reason: string
          recommended_member_id?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          scheduled_beneficiary_id: string
          status?: string
          updated_at?: string
          withdrawal_id?: string | null
        }
        Update: {
          admin_notes?: string | null
          b2c_triggered?: boolean | null
          chama_id?: string
          chosen_member_id?: string | null
          created_at?: string
          cycle_id?: string
          id?: string
          ineligible_members?: Json | null
          payout_amount?: number
          reason?: string
          recommended_member_id?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          scheduled_beneficiary_id?: string
          status?: string
          updated_at?: string
          withdrawal_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "payout_approval_requests_chama_id_fkey"
            columns: ["chama_id"]
            isOneToOne: false
            referencedRelation: "chama"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payout_approval_requests_chosen_member_id_fkey"
            columns: ["chosen_member_id"]
            isOneToOne: false
            referencedRelation: "chama_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payout_approval_requests_cycle_id_fkey"
            columns: ["cycle_id"]
            isOneToOne: true
            referencedRelation: "contribution_cycles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payout_approval_requests_recommended_member_id_fkey"
            columns: ["recommended_member_id"]
            isOneToOne: false
            referencedRelation: "chama_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payout_approval_requests_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payout_approval_requests_scheduled_beneficiary_id_fkey"
            columns: ["scheduled_beneficiary_id"]
            isOneToOne: false
            referencedRelation: "chama_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payout_approval_requests_withdrawal_id_fkey"
            columns: ["withdrawal_id"]
            isOneToOne: false
            referencedRelation: "withdrawals"
            referencedColumns: ["id"]
          },
        ]
      }
      payout_skips: {
        Row: {
          amount_owed: number
          amount_paid: number
          chama_id: string
          created_at: string | null
          cycle_id: string | null
          id: string
          member_id: string
          new_position: number | null
          new_withdrawal_id: string | null
          notification_sent: boolean | null
          original_position: number
          original_withdrawal_id: string | null
          skip_reason: string
          swap_performed: boolean | null
          swapped_with_member_id: string | null
        }
        Insert: {
          amount_owed: number
          amount_paid: number
          chama_id: string
          created_at?: string | null
          cycle_id?: string | null
          id?: string
          member_id: string
          new_position?: number | null
          new_withdrawal_id?: string | null
          notification_sent?: boolean | null
          original_position: number
          original_withdrawal_id?: string | null
          skip_reason: string
          swap_performed?: boolean | null
          swapped_with_member_id?: string | null
        }
        Update: {
          amount_owed?: number
          amount_paid?: number
          chama_id?: string
          created_at?: string | null
          cycle_id?: string | null
          id?: string
          member_id?: string
          new_position?: number | null
          new_withdrawal_id?: string | null
          notification_sent?: boolean | null
          original_position?: number
          original_withdrawal_id?: string | null
          skip_reason?: string
          swap_performed?: boolean | null
          swapped_with_member_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "payout_skips_chama_id_fkey"
            columns: ["chama_id"]
            isOneToOne: false
            referencedRelation: "chama"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payout_skips_cycle_id_fkey"
            columns: ["cycle_id"]
            isOneToOne: false
            referencedRelation: "contribution_cycles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payout_skips_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "chama_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payout_skips_new_withdrawal_id_fkey"
            columns: ["new_withdrawal_id"]
            isOneToOne: false
            referencedRelation: "withdrawals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payout_skips_original_withdrawal_id_fkey"
            columns: ["original_withdrawal_id"]
            isOneToOne: false
            referencedRelation: "withdrawals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payout_skips_swapped_with_member_id_fkey"
            columns: ["swapped_with_member_id"]
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
          deleted_at: string | null
          deleted_by: string | null
          deletion_reason: string | null
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
          deleted_at?: string | null
          deleted_by?: string | null
          deletion_reason?: string | null
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
          deleted_at?: string | null
          deleted_by?: string | null
          deletion_reason?: string | null
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
      reconciliation_logs: {
        Row: {
          actual_value: number | null
          anomaly_type: string
          auto_corrected: boolean | null
          created_at: string
          details: Json | null
          difference: number | null
          entity_id: string | null
          entity_type: string
          expected_value: number | null
          id: string
        }
        Insert: {
          actual_value?: number | null
          anomaly_type: string
          auto_corrected?: boolean | null
          created_at?: string
          details?: Json | null
          difference?: number | null
          entity_id?: string | null
          entity_type: string
          expected_value?: number | null
          id?: string
        }
        Update: {
          actual_value?: number | null
          anomaly_type?: string
          auto_corrected?: boolean | null
          created_at?: string
          details?: Json | null
          difference?: number | null
          entity_id?: string | null
          entity_type?: string
          expected_value?: number | null
          id?: string
        }
        Relationships: []
      }
      settlement_locks: {
        Row: {
          contribution_id: string
          created_at: string
          id: string
          settled_at: string
          settlement_result: Json | null
        }
        Insert: {
          contribution_id: string
          created_at?: string
          id?: string
          settled_at?: string
          settlement_result?: Json | null
        }
        Update: {
          contribution_id?: string
          created_at?: string
          id?: string
          settled_at?: string
          settlement_result?: Json | null
        }
        Relationships: []
      }
      totp_secrets: {
        Row: {
          backup_codes: string[] | null
          created_at: string
          encrypted_secret: string
          id: string
          is_enabled: boolean
          user_id: string
          verified_at: string | null
        }
        Insert: {
          backup_codes?: string[] | null
          created_at?: string
          encrypted_secret: string
          id?: string
          is_enabled?: boolean
          user_id: string
          verified_at?: string | null
        }
        Update: {
          backup_codes?: string[] | null
          created_at?: string
          encrypted_secret?: string
          id?: string
          is_enabled?: boolean
          user_id?: string
          verified_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "totp_secrets_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
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
          mpesa_receipt_number: string | null
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
          mpesa_receipt_number?: string | null
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
          mpesa_receipt_number?: string | null
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
          {
            foreignKeyName: "transactions_user_id_profiles_fkey"
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
      user_risk_profiles: {
        Row: {
          created_at: string
          frozen_at: string | null
          frozen_by: string | null
          id: string
          is_flagged: boolean
          is_frozen: boolean
          last_risk_update: string
          review_status: string
          reviewed_at: string | null
          reviewed_by: string | null
          risk_level: string
          risk_score: number
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          frozen_at?: string | null
          frozen_by?: string | null
          id?: string
          is_flagged?: boolean
          is_frozen?: boolean
          last_risk_update?: string
          review_status?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          risk_level?: string
          risk_score?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          frozen_at?: string | null
          frozen_by?: string | null
          id?: string
          is_flagged?: boolean
          is_frozen?: boolean
          last_risk_update?: string
          review_status?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          risk_level?: string
          risk_score?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_risk_profiles_frozen_by_fkey"
            columns: ["frozen_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_risk_profiles_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_risk_profiles_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
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
      verification_requests: {
        Row: {
          created_at: string
          entity_id: string
          entity_type: string
          id: string
          rejection_reason: string | null
          request_reason: string | null
          requested_by: string
          reviewed_at: string | null
          reviewed_by: string | null
          status: string
          supporting_documents: string[] | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          entity_id: string
          entity_type: string
          id?: string
          rejection_reason?: string | null
          request_reason?: string | null
          requested_by: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          supporting_documents?: string[] | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          entity_id?: string
          entity_type?: string
          id?: string
          rejection_reason?: string | null
          request_reason?: string | null
          requested_by?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          supporting_documents?: string[] | null
          updated_at?: string
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
      welfare_contribution_cycles: {
        Row: {
          amount: number
          created_at: string
          end_date: string
          id: string
          set_by: string
          start_date: string
          status: string
          welfare_id: string
        }
        Insert: {
          amount: number
          created_at?: string
          end_date: string
          id?: string
          set_by: string
          start_date: string
          status?: string
          welfare_id: string
        }
        Update: {
          amount?: number
          created_at?: string
          end_date?: string
          id?: string
          set_by?: string
          start_date?: string
          status?: string
          welfare_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "welfare_contribution_cycles_welfare_id_fkey"
            columns: ["welfare_id"]
            isOneToOne: false
            referencedRelation: "welfares"
            referencedColumns: ["id"]
          },
        ]
      }
      welfare_contributions: {
        Row: {
          commission_amount: number | null
          completed_at: string | null
          created_at: string
          cycle_month: string | null
          gross_amount: number
          id: string
          member_id: string
          mpesa_receipt_number: string | null
          net_amount: number
          payment_method: string | null
          payment_reference: string
          payment_status: string
          user_id: string
          welfare_id: string
        }
        Insert: {
          commission_amount?: number | null
          completed_at?: string | null
          created_at?: string
          cycle_month?: string | null
          gross_amount: number
          id?: string
          member_id: string
          mpesa_receipt_number?: string | null
          net_amount: number
          payment_method?: string | null
          payment_reference: string
          payment_status?: string
          user_id: string
          welfare_id: string
        }
        Update: {
          commission_amount?: number | null
          completed_at?: string | null
          created_at?: string
          cycle_month?: string | null
          gross_amount?: number
          id?: string
          member_id?: string
          mpesa_receipt_number?: string | null
          net_amount?: number
          payment_method?: string | null
          payment_reference?: string
          payment_status?: string
          user_id?: string
          welfare_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "welfare_contributions_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "welfare_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "welfare_contributions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "welfare_contributions_welfare_id_fkey"
            columns: ["welfare_id"]
            isOneToOne: false
            referencedRelation: "welfares"
            referencedColumns: ["id"]
          },
        ]
      }
      welfare_executive_changes: {
        Row: {
          admin_decided_at: string | null
          admin_decided_by: string | null
          admin_decision: string | null
          admin_notes: string | null
          affected_member_id: string | null
          affected_user_name: string | null
          change_type: string
          changed_by: string | null
          cooldown_ends_at: string
          cooldown_hours: number
          created_at: string
          id: string
          new_member_id: string | null
          new_role: string | null
          new_user_name: string | null
          old_role: string | null
          pending_withdrawals_cancelled: number | null
          welfare_id: string
        }
        Insert: {
          admin_decided_at?: string | null
          admin_decided_by?: string | null
          admin_decision?: string | null
          admin_notes?: string | null
          affected_member_id?: string | null
          affected_user_name?: string | null
          change_type: string
          changed_by?: string | null
          cooldown_ends_at: string
          cooldown_hours?: number
          created_at?: string
          id?: string
          new_member_id?: string | null
          new_role?: string | null
          new_user_name?: string | null
          old_role?: string | null
          pending_withdrawals_cancelled?: number | null
          welfare_id: string
        }
        Update: {
          admin_decided_at?: string | null
          admin_decided_by?: string | null
          admin_decision?: string | null
          admin_notes?: string | null
          affected_member_id?: string | null
          affected_user_name?: string | null
          change_type?: string
          changed_by?: string | null
          cooldown_ends_at?: string
          cooldown_hours?: number
          created_at?: string
          id?: string
          new_member_id?: string | null
          new_role?: string | null
          new_user_name?: string | null
          old_role?: string | null
          pending_withdrawals_cancelled?: number | null
          welfare_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "welfare_executive_changes_admin_decided_by_fkey"
            columns: ["admin_decided_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "welfare_executive_changes_changed_by_fkey"
            columns: ["changed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "welfare_executive_changes_welfare_id_fkey"
            columns: ["welfare_id"]
            isOneToOne: false
            referencedRelation: "welfares"
            referencedColumns: ["id"]
          },
        ]
      }
      welfare_members: {
        Row: {
          created_at: string
          id: string
          is_eligible_for_withdrawal: boolean | null
          joined_at: string
          member_code: string | null
          role: string
          status: string
          total_contributed: number | null
          user_id: string
          welfare_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_eligible_for_withdrawal?: boolean | null
          joined_at?: string
          member_code?: string | null
          role?: string
          status?: string
          total_contributed?: number | null
          user_id: string
          welfare_id: string
        }
        Update: {
          created_at?: string
          id?: string
          is_eligible_for_withdrawal?: boolean | null
          joined_at?: string
          member_code?: string | null
          role?: string
          status?: string
          total_contributed?: number | null
          user_id?: string
          welfare_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "welfare_members_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "welfare_members_welfare_id_fkey"
            columns: ["welfare_id"]
            isOneToOne: false
            referencedRelation: "welfares"
            referencedColumns: ["id"]
          },
        ]
      }
      welfare_withdrawal_approvals: {
        Row: {
          approver_id: string
          approver_role: string
          created_at: string
          decided_at: string | null
          decision: string
          id: string
          rejection_reason: string | null
          welfare_id: string
          withdrawal_id: string
        }
        Insert: {
          approver_id: string
          approver_role: string
          created_at?: string
          decided_at?: string | null
          decision?: string
          id?: string
          rejection_reason?: string | null
          welfare_id: string
          withdrawal_id: string
        }
        Update: {
          approver_id?: string
          approver_role?: string
          created_at?: string
          decided_at?: string | null
          decision?: string
          id?: string
          rejection_reason?: string | null
          welfare_id?: string
          withdrawal_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "welfare_withdrawal_approvals_approver_id_fkey"
            columns: ["approver_id"]
            isOneToOne: false
            referencedRelation: "welfare_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "welfare_withdrawal_approvals_welfare_id_fkey"
            columns: ["welfare_id"]
            isOneToOne: false
            referencedRelation: "welfares"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "welfare_withdrawal_approvals_withdrawal_id_fkey"
            columns: ["withdrawal_id"]
            isOneToOne: false
            referencedRelation: "withdrawals"
            referencedColumns: ["id"]
          },
        ]
      }
      welfares: {
        Row: {
          available_balance: number | null
          commission_rate: number | null
          constitution_file_name: string | null
          constitution_file_path: string | null
          constitution_uploaded_at: string | null
          constitution_uploaded_by: string | null
          contribution_amount: number | null
          contribution_deadline_days: number | null
          contribution_frequency: string | null
          created_at: string
          created_by: string
          current_amount: number | null
          description: string | null
          frozen_at: string | null
          frozen_reason: string | null
          group_code: string | null
          id: string
          is_frozen: boolean | null
          is_public: boolean | null
          is_verified: boolean | null
          min_contribution_period_months: number | null
          name: string
          paybill_account_id: string | null
          slug: string
          status: string
          total_commission_paid: number | null
          total_gross_collected: number | null
          total_withdrawn: number | null
          updated_at: string
          whatsapp_link: string | null
        }
        Insert: {
          available_balance?: number | null
          commission_rate?: number | null
          constitution_file_name?: string | null
          constitution_file_path?: string | null
          constitution_uploaded_at?: string | null
          constitution_uploaded_by?: string | null
          contribution_amount?: number | null
          contribution_deadline_days?: number | null
          contribution_frequency?: string | null
          created_at?: string
          created_by: string
          current_amount?: number | null
          description?: string | null
          frozen_at?: string | null
          frozen_reason?: string | null
          group_code?: string | null
          id?: string
          is_frozen?: boolean | null
          is_public?: boolean | null
          is_verified?: boolean | null
          min_contribution_period_months?: number | null
          name: string
          paybill_account_id?: string | null
          slug: string
          status?: string
          total_commission_paid?: number | null
          total_gross_collected?: number | null
          total_withdrawn?: number | null
          updated_at?: string
          whatsapp_link?: string | null
        }
        Update: {
          available_balance?: number | null
          commission_rate?: number | null
          constitution_file_name?: string | null
          constitution_file_path?: string | null
          constitution_uploaded_at?: string | null
          constitution_uploaded_by?: string | null
          contribution_amount?: number | null
          contribution_deadline_days?: number | null
          contribution_frequency?: string | null
          created_at?: string
          created_by?: string
          current_amount?: number | null
          description?: string | null
          frozen_at?: string | null
          frozen_reason?: string | null
          group_code?: string | null
          id?: string
          is_frozen?: boolean | null
          is_public?: boolean | null
          is_verified?: boolean | null
          min_contribution_period_months?: number | null
          name?: string
          paybill_account_id?: string | null
          slug?: string
          status?: string
          total_commission_paid?: number | null
          total_gross_collected?: number | null
          total_withdrawn?: number | null
          updated_at?: string
          whatsapp_link?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "welfares_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      withdrawals: {
        Row: {
          amount: number
          b2c_attempt_count: number | null
          b2c_error_details: Json | null
          chama_id: string | null
          commission_amount: number
          completed_at: string | null
          created_at: string
          cycle_id: string | null
          id: string
          last_b2c_attempt_at: string | null
          mchango_id: string | null
          net_amount: number
          notes: string | null
          organization_id: string | null
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
          welfare_id: string | null
        }
        Insert: {
          amount: number
          b2c_attempt_count?: number | null
          b2c_error_details?: Json | null
          chama_id?: string | null
          commission_amount?: number
          completed_at?: string | null
          created_at?: string
          cycle_id?: string | null
          id?: string
          last_b2c_attempt_at?: string | null
          mchango_id?: string | null
          net_amount: number
          notes?: string | null
          organization_id?: string | null
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
          welfare_id?: string | null
        }
        Update: {
          amount?: number
          b2c_attempt_count?: number | null
          b2c_error_details?: Json | null
          chama_id?: string | null
          commission_amount?: number
          completed_at?: string | null
          created_at?: string
          cycle_id?: string | null
          id?: string
          last_b2c_attempt_at?: string | null
          mchango_id?: string | null
          net_amount?: number
          notes?: string | null
          organization_id?: string | null
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
          welfare_id?: string | null
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
            foreignKeyName: "withdrawals_cycle_id_fkey"
            columns: ["cycle_id"]
            isOneToOne: false
            referencedRelation: "contribution_cycles"
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
            foreignKeyName: "withdrawals_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "withdrawals_payment_method_id_fkey"
            columns: ["payment_method_id"]
            isOneToOne: false
            referencedRelation: "payment_methods"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "withdrawals_requested_by_fkey"
            columns: ["requested_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "withdrawals_welfare_id_fkey"
            columns: ["welfare_id"]
            isOneToOne: false
            referencedRelation: "welfares"
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
      calculate_expected_contributions: {
        Args: { p_chama_id: string }
        Returns: undefined
      }
      calculate_next_due_date: {
        Args: { p_chama_id: string; p_last_payment_date: string }
        Returns: string
      }
      check_all_members_paid: { Args: { p_cycle_id: string }; Returns: boolean }
      check_and_lock_withdrawal_balance: {
        Args: { p_amount: number; p_chama_id?: string; p_mchango_id?: string }
        Returns: {
          available_balance: number
          can_withdraw: boolean
          entity_name: string
        }[]
      }
      check_kyc_approved: { Args: { _user_id: string }; Returns: boolean }
      check_loan_eligibility: {
        Args: { p_member_id: string }
        Returns: boolean
      }
      check_member_payout_eligibility: {
        Args: { p_member_id: string }
        Returns: {
          contributed_amount: number
          is_eligible: boolean
          required_amount: number
          shortfall: number
        }[]
      }
      check_member_schedule_eligibility: {
        Args: { p_chama_id: string; p_member_id: string }
        Returns: {
          carry_forward: number
          is_eligible: boolean
          total_amount_owed: number
          total_periods_owed: number
        }[]
      }
      check_signup_uniqueness: {
        Args: { p_email: string; p_id_number: string; p_phone: string }
        Returns: Json
      }
      claim_cycle_for_processing: {
        Args: { p_cycle_id: string }
        Returns: boolean
      }
      cleanup_expired_otps: { Args: never; Returns: undefined }
      cleanup_old_chat_messages: { Args: never; Returns: undefined }
      cleanup_old_rate_limits: { Args: never; Returns: undefined }
      generate_group_invite_code: { Args: never; Returns: string }
      generate_invite_code: { Args: never; Returns: string }
      generate_mchango_code: { Args: never; Returns: string }
      generate_member_code: {
        Args: { p_chama_id: string; p_order_index: number }
        Returns: string
      }
      generate_org_code: { Args: never; Returns: string }
      generate_paybill_account_id: {
        Args: { entity_type: string }
        Returns: string
      }
      generate_short_member_code: {
        Args: { p_group_code: string; p_member_number: number }
        Returns: string
      }
      generate_slug: { Args: { title: string }; Returns: string }
      generate_unique_member_id: {
        Args: { p_group_id: string; p_member_number: number }
        Returns: string
      }
      generate_welfare_code: { Args: never; Returns: string }
      generate_welfare_member_code: {
        Args: { p_welfare_id: string }
        Returns: string
      }
      generate_welfare_paybill_account_id: { Args: never; Returns: string }
      get_member_payout_position: {
        Args: { p_member_id: string }
        Returns: {
          estimated_amount: number
          estimated_payout_date: string
          position_in_queue: number
        }[]
      }
      get_next_order_index: { Args: { p_chama_id: string }; Returns: number }
      get_welfare_role: {
        Args: { _user_id: string; _welfare_id: string }
        Returns: string
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
      is_welfare_chairman: {
        Args: { _user_id: string; _welfare_id: string }
        Returns: boolean
      }
      is_welfare_member: {
        Args: { _user_id: string; _welfare_id: string }
        Returns: boolean
      }
      is_welfare_secretary: {
        Args: { _user_id: string; _welfare_id: string }
        Returns: boolean
      }
      process_withdrawal_completion: {
        Args: {
          p_mpesa_receipt: string
          p_transaction_amount: number
          p_withdrawal_id: string
        }
        Returns: Json
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
      resequence_member_order: {
        Args: { p_chama_id: string }
        Returns: undefined
      }
      update_chama_withdrawn: {
        Args: { p_amount: number; p_chama_id: string }
        Returns: undefined
      }
      update_mchango_withdrawn: {
        Args: { p_amount: number; p_mchango_id: string }
        Returns: undefined
      }
      update_organization_withdrawn: {
        Args: { p_amount: number; p_organization_id: string }
        Returns: undefined
      }
      update_welfare_withdrawn: {
        Args: { p_amount: number; p_welfare_id: string }
        Returns: undefined
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
        | "deleted"
      contribution_frequency:
        | "daily"
        | "weekly"
        | "monthly"
        | "every_n_days"
        | "twice_monthly"
      kyc_status: "pending" | "approved" | "rejected"
      mchango_status: "active" | "completed" | "cancelled"
      member_status: "active" | "inactive" | "left" | "removed"
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
        "deleted",
      ],
      contribution_frequency: [
        "daily",
        "weekly",
        "monthly",
        "every_n_days",
        "twice_monthly",
      ],
      kyc_status: ["pending", "approved", "rejected"],
      mchango_status: ["active", "completed", "cancelled"],
      member_status: ["active", "inactive", "left", "removed"],
      payment_method_type: ["mpesa", "airtel_money", "bank_account"],
      payout_status: ["pending", "processing", "completed", "failed"],
      rate_limit_type: ["ip", "phone", "email"],
      transaction_status: ["pending", "completed", "failed", "refunded"],
      transaction_type: ["donation", "contribution", "payout"],
    },
  },
} as const
