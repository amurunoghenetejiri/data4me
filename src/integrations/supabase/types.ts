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
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      activity_logs: {
        Row: {
          category: string
          created_at: string
          details: Json | null
          event: string
          id: string
          user_email: string | null
          user_id: string | null
        }
        Insert: {
          category?: string
          created_at?: string
          details?: Json | null
          event: string
          id?: string
          user_email?: string | null
          user_id?: string | null
        }
        Update: {
          category?: string
          created_at?: string
          details?: Json | null
          event?: string
          id?: string
          user_email?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      admin_bank_accounts: {
        Row: {
          account_name: string
          account_number: string
          bank_name: string
          created_at: string
          id: string
          is_active: boolean
          sort_order: number
          updated_at: string
        }
        Insert: {
          account_name: string
          account_number: string
          bank_name: string
          created_at?: string
          id?: string
          is_active?: boolean
          sort_order?: number
          updated_at?: string
        }
        Update: {
          account_name?: string
          account_number?: string
          bank_name?: string
          created_at?: string
          id?: string
          is_active?: boolean
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      admin_messages: {
        Row: {
          admin_id: string
          body: string
          created_at: string
          delivered: boolean
          id: string
          title: string
          user_id: string
        }
        Insert: {
          admin_id: string
          body: string
          created_at?: string
          delivered?: boolean
          id?: string
          title: string
          user_id: string
        }
        Update: {
          admin_id?: string
          body?: string
          created_at?: string
          delivered?: boolean
          id?: string
          title?: string
          user_id?: string
        }
        Relationships: []
      }
      admin_notes: {
        Row: {
          admin_id: string
          created_at: string
          id: string
          note: string
          user_id: string
        }
        Insert: {
          admin_id: string
          created_at?: string
          id?: string
          note: string
          user_id: string
        }
        Update: {
          admin_id?: string
          created_at?: string
          id?: string
          note?: string
          user_id?: string
        }
        Relationships: []
      }
      api_providers: {
        Row: {
          api_key_secret: string | null
          api_secret_secret: string | null
          base_url: string
          config: Json
          created_at: string
          environment: string
          extra_secret: string | null
          id: string
          is_active: boolean
          name: string
          slug: string
          updated_at: string
          webhook_url: string | null
        }
        Insert: {
          api_key_secret?: string | null
          api_secret_secret?: string | null
          base_url: string
          config?: Json
          created_at?: string
          environment?: string
          extra_secret?: string | null
          id?: string
          is_active?: boolean
          name: string
          slug: string
          updated_at?: string
          webhook_url?: string | null
        }
        Update: {
          api_key_secret?: string | null
          api_secret_secret?: string | null
          base_url?: string
          config?: Json
          created_at?: string
          environment?: string
          extra_secret?: string | null
          id?: string
          is_active?: boolean
          name?: string
          slug?: string
          updated_at?: string
          webhook_url?: string | null
        }
        Relationships: []
      }
      app_settings: {
        Row: {
          bank_account_name: string
          bank_account_number: string
          bank_name: string
          id: number
          manual_bank_enabled: boolean
          paystack_enabled: boolean
          paystack_live_public_key: string | null
          paystack_mode: string
          paystack_public_key: string | null
          paystack_test_public_key: string | null
          updated_at: string
        }
        Insert: {
          bank_account_name?: string
          bank_account_number?: string
          bank_name?: string
          id?: number
          manual_bank_enabled?: boolean
          paystack_enabled?: boolean
          paystack_live_public_key?: string | null
          paystack_mode?: string
          paystack_public_key?: string | null
          paystack_test_public_key?: string | null
          updated_at?: string
        }
        Update: {
          bank_account_name?: string
          bank_account_number?: string
          bank_name?: string
          id?: number
          manual_bank_enabled?: boolean
          paystack_enabled?: boolean
          paystack_live_public_key?: string | null
          paystack_mode?: string
          paystack_public_key?: string | null
          paystack_test_public_key?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      audit_logs: {
        Row: {
          action: string
          admin_email: string | null
          admin_id: string
          created_at: string
          details: Json
          id: string
          ip: string | null
          target_id: string | null
          target_type: string | null
        }
        Insert: {
          action: string
          admin_email?: string | null
          admin_id: string
          created_at?: string
          details?: Json
          id?: string
          ip?: string | null
          target_id?: string | null
          target_type?: string | null
        }
        Update: {
          action?: string
          admin_email?: string | null
          admin_id?: string
          created_at?: string
          details?: Json
          id?: string
          ip?: string | null
          target_id?: string | null
          target_type?: string | null
        }
        Relationships: []
      }
      bank_details: {
        Row: {
          account_name: string
          account_number: string
          bank_name: string
          created_at: string
          id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          account_name: string
          account_number: string
          bank_name: string
          created_at?: string
          id?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          account_name?: string
          account_number?: string
          bank_name?: string
          created_at?: string
          id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      bank_verification_logs: {
        Row: {
          account_name: string | null
          account_number: string | null
          bank_code: string | null
          bank_name: string | null
          created_at: string
          error_message: string | null
          id: string
          success: boolean
          user_id: string | null
        }
        Insert: {
          account_name?: string | null
          account_number?: string | null
          bank_code?: string | null
          bank_name?: string | null
          created_at?: string
          error_message?: string | null
          id?: string
          success: boolean
          user_id?: string | null
        }
        Update: {
          account_name?: string | null
          account_number?: string | null
          bank_code?: string | null
          bank_name?: string | null
          created_at?: string
          error_message?: string | null
          id?: string
          success?: boolean
          user_id?: string | null
        }
        Relationships: []
      }
      charge_settings: {
        Row: {
          is_active: boolean
          label: string
          mode: string
          service: string
          updated_at: string
          value: number
        }
        Insert: {
          is_active?: boolean
          label: string
          mode?: string
          service: string
          updated_at?: string
          value?: number
        }
        Update: {
          is_active?: boolean
          label?: string
          mode?: string
          service?: string
          updated_at?: string
          value?: number
        }
        Relationships: []
      }
      chat_messages: {
        Row: {
          avatar_id: string | null
          body: string
          created_at: string
          deleted: boolean
          id: string
          reply_to: string | null
          user_id: string | null
          username: string
        }
        Insert: {
          avatar_id?: string | null
          body: string
          created_at?: string
          deleted?: boolean
          id?: string
          reply_to?: string | null
          user_id?: string | null
          username: string
        }
        Update: {
          avatar_id?: string | null
          body?: string
          created_at?: string
          deleted?: boolean
          id?: string
          reply_to?: string | null
          user_id?: string | null
          username?: string
        }
        Relationships: [
          {
            foreignKeyName: "chat_messages_reply_to_fkey"
            columns: ["reply_to"]
            isOneToOne: false
            referencedRelation: "chat_messages"
            referencedColumns: ["id"]
          },
        ]
      }
      contact_messages: {
        Row: {
          created_at: string
          email: string
          id: string
          message: string
          name: string
          subject: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          message: string
          name: string
          subject?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          message?: string
          name?: string
          subject?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      data_plan_audit: {
        Row: {
          action: string
          admin_email: string | null
          admin_id: string | null
          after_data: Json | null
          before_data: Json | null
          created_at: string
          id: string
          plan_id: string | null
        }
        Insert: {
          action: string
          admin_email?: string | null
          admin_id?: string | null
          after_data?: Json | null
          before_data?: Json | null
          created_at?: string
          id?: string
          plan_id?: string | null
        }
        Update: {
          action?: string
          admin_email?: string | null
          admin_id?: string | null
          after_data?: Json | null
          before_data?: Json | null
          created_at?: string
          id?: string
          plan_id?: string | null
        }
        Relationships: []
      }
      data_plans: {
        Row: {
          api_code: string | null
          category: string | null
          cost_price: number
          created_at: string
          data_size: string | null
          description: string | null
          discount_percent: number
          duration: string | null
          id: string
          is_active: boolean
          is_promo: boolean
          network: string
          plan_id: string
          plan_name: string
          profit: number | null
          provider: string
          selling_price: number
          service_fee_percent: number
          supplier: string | null
          updated_at: string
          validity: string | null
        }
        Insert: {
          api_code?: string | null
          category?: string | null
          cost_price?: number
          created_at?: string
          data_size?: string | null
          description?: string | null
          discount_percent?: number
          duration?: string | null
          id?: string
          is_active?: boolean
          is_promo?: boolean
          network: string
          plan_id: string
          plan_name: string
          profit?: number | null
          provider?: string
          selling_price?: number
          service_fee_percent?: number
          supplier?: string | null
          updated_at?: string
          validity?: string | null
        }
        Update: {
          api_code?: string | null
          category?: string | null
          cost_price?: number
          created_at?: string
          data_size?: string | null
          description?: string | null
          discount_percent?: number
          duration?: string | null
          id?: string
          is_active?: boolean
          is_promo?: boolean
          network?: string
          plan_id?: string
          plan_name?: string
          profit?: number | null
          provider?: string
          selling_price?: number
          service_fee_percent?: number
          supplier?: string | null
          updated_at?: string
          validity?: string | null
        }
        Relationships: []
      }
      direct_messages: {
        Row: {
          body: string
          created_at: string
          delivered_at: string | null
          id: string
          read_at: string | null
          recipient_id: string
          sender_id: string
          sender_is_admin: boolean
        }
        Insert: {
          body: string
          created_at?: string
          delivered_at?: string | null
          id?: string
          read_at?: string | null
          recipient_id: string
          sender_id: string
          sender_is_admin?: boolean
        }
        Update: {
          body?: string
          created_at?: string
          delivered_at?: string | null
          id?: string
          read_at?: string | null
          recipient_id?: string
          sender_id?: string
          sender_is_admin?: boolean
        }
        Relationships: []
      }
      email_logs: {
        Row: {
          created_at: string
          error: string | null
          id: string
          recipient: string
          status: string
          subject: string
          template: string | null
        }
        Insert: {
          created_at?: string
          error?: string | null
          id?: string
          recipient: string
          status?: string
          subject: string
          template?: string | null
        }
        Update: {
          created_at?: string
          error?: string | null
          id?: string
          recipient?: string
          status?: string
          subject?: string
          template?: string | null
        }
        Relationships: []
      }
      fee_settings: {
        Row: {
          key: string
          percent: number
          updated_at: string
        }
        Insert: {
          key: string
          percent?: number
          updated_at?: string
        }
        Update: {
          key?: string
          percent?: number
          updated_at?: string
        }
        Relationships: []
      }
      funding_requests: {
        Row: {
          admin_remark: string | null
          amount: number
          bank: string | null
          created_at: string
          id: string
          note: string | null
          provider: string
          receipt_url: string | null
          reference: string
          reviewed_at: string | null
          reviewer_id: string | null
          status: string
          user_id: string
        }
        Insert: {
          admin_remark?: string | null
          amount: number
          bank?: string | null
          created_at?: string
          id?: string
          note?: string | null
          provider?: string
          receipt_url?: string | null
          reference: string
          reviewed_at?: string | null
          reviewer_id?: string | null
          status?: string
          user_id: string
        }
        Update: {
          admin_remark?: string | null
          amount?: number
          bank?: string | null
          created_at?: string
          id?: string
          note?: string | null
          provider?: string
          receipt_url?: string | null
          reference?: string
          reviewed_at?: string | null
          reviewer_id?: string | null
          status?: string
          user_id?: string
        }
        Relationships: []
      }
      login_activity: {
        Row: {
          created_at: string
          event: string
          id: string
          user_agent: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          event: string
          id?: string
          user_agent?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          event?: string
          id?: string
          user_agent?: string | null
          user_id?: string
        }
        Relationships: []
      }
      notifications: {
        Row: {
          body: string | null
          created_at: string
          id: string
          read: boolean
          title: string
          user_id: string | null
        }
        Insert: {
          body?: string | null
          created_at?: string
          id?: string
          read?: boolean
          title: string
          user_id?: string | null
        }
        Update: {
          body?: string | null
          created_at?: string
          id?: string
          read?: boolean
          title?: string
          user_id?: string | null
        }
        Relationships: []
      }
      otp_codes: {
        Row: {
          attempts: number
          code_hash: string
          created_at: string
          email: string
          expires_at: string
          id: string
          purpose: string
          used_at: string | null
        }
        Insert: {
          attempts?: number
          code_hash: string
          created_at?: string
          email: string
          expires_at: string
          id?: string
          purpose?: string
          used_at?: string | null
        }
        Update: {
          attempts?: number
          code_hash?: string
          created_at?: string
          email?: string
          expires_at?: string
          id?: string
          purpose?: string
          used_at?: string | null
        }
        Relationships: []
      }
      payment_bank_accounts: {
        Row: {
          account_name: string
          account_number: string
          account_type: string | null
          bank_name: string
          created_at: string
          id: string
          instructions: string | null
          is_active: boolean
          is_default: boolean
          sort_order: number
          updated_at: string
        }
        Insert: {
          account_name: string
          account_number: string
          account_type?: string | null
          bank_name: string
          created_at?: string
          id?: string
          instructions?: string | null
          is_active?: boolean
          is_default?: boolean
          sort_order?: number
          updated_at?: string
        }
        Update: {
          account_name?: string
          account_number?: string
          account_type?: string | null
          bank_name?: string
          created_at?: string
          id?: string
          instructions?: string | null
          is_active?: boolean
          is_default?: boolean
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      products: {
        Row: {
          cashback_percent: number
          category: string
          cost_price: number | null
          countdown_end: string | null
          countdown_start: string | null
          created_at: string
          data_size: string | null
          discount_percent: number
          display_order: number
          id: string
          is_active: boolean
          label: string | null
          name: string
          network: string
          price: number
          updated_at: string
          validity: string | null
        }
        Insert: {
          cashback_percent?: number
          category?: string
          cost_price?: number | null
          countdown_end?: string | null
          countdown_start?: string | null
          created_at?: string
          data_size?: string | null
          discount_percent?: number
          display_order?: number
          id?: string
          is_active?: boolean
          label?: string | null
          name: string
          network: string
          price: number
          updated_at?: string
          validity?: string | null
        }
        Update: {
          cashback_percent?: number
          category?: string
          cost_price?: number | null
          countdown_end?: string | null
          countdown_start?: string | null
          created_at?: string
          data_size?: string | null
          discount_percent?: number
          display_order?: number
          id?: string
          is_active?: boolean
          label?: string | null
          name?: string
          network?: string
          price?: number
          updated_at?: string
          validity?: string | null
        }
        Relationships: []
      }
      profiles: {
        Row: {
          created_at: string
          email: string | null
          full_name: string | null
          id: string
          phone: string | null
          pin_hash: string | null
          username: string | null
        }
        Insert: {
          created_at?: string
          email?: string | null
          full_name?: string | null
          id: string
          phone?: string | null
          pin_hash?: string | null
          username?: string | null
        }
        Update: {
          created_at?: string
          email?: string | null
          full_name?: string | null
          id?: string
          phone?: string | null
          pin_hash?: string | null
          username?: string | null
        }
        Relationships: []
      }
      secure_secrets: {
        Row: {
          name: string
          updated_at: string
          updated_by: string | null
          value: string
        }
        Insert: {
          name: string
          updated_at?: string
          updated_by?: string | null
          value: string
        }
        Update: {
          name?: string
          updated_at?: string
          updated_by?: string | null
          value?: string
        }
        Relationships: []
      }
      transactions: {
        Row: {
          amount: number
          charge: number
          created_at: string
          description: string | null
          id: string
          meta: Json | null
          profit: number
          provider_response: Json | null
          reference: string
          status: string
          supplier_reference: string | null
          type: string
          user_id: string
        }
        Insert: {
          amount: number
          charge?: number
          created_at?: string
          description?: string | null
          id?: string
          meta?: Json | null
          profit?: number
          provider_response?: Json | null
          reference: string
          status?: string
          supplier_reference?: string | null
          type: string
          user_id: string
        }
        Update: {
          amount?: number
          charge?: number
          created_at?: string
          description?: string | null
          id?: string
          meta?: Json | null
          profit?: number
          provider_response?: Json | null
          reference?: string
          status?: string
          supplier_reference?: string | null
          type?: string
          user_id?: string
        }
        Relationships: []
      }
      user_activity_log: {
        Row: {
          action: string
          category: string
          created_at: string
          details: Json | null
          id: string
          ip_address: string | null
          status: string | null
          user_agent: string | null
          user_id: string | null
        }
        Insert: {
          action: string
          category: string
          created_at?: string
          details?: Json | null
          id?: string
          ip_address?: string | null
          status?: string | null
          user_agent?: string | null
          user_id?: string | null
        }
        Update: {
          action?: string
          category?: string
          created_at?: string
          details?: Json | null
          id?: string
          ip_address?: string | null
          status?: string | null
          user_agent?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      user_bank_accounts: {
        Row: {
          account_name: string
          account_number: string
          bank_name: string
          created_at: string
          id: string
          is_default: boolean
          updated_at: string
          user_id: string
        }
        Insert: {
          account_name: string
          account_number: string
          bank_name: string
          created_at?: string
          id?: string
          is_default?: boolean
          updated_at?: string
          user_id: string
        }
        Update: {
          account_name?: string
          account_number?: string
          bank_name?: string
          created_at?: string
          id?: string
          is_default?: boolean
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      user_status: {
        Row: {
          block_reason: string | null
          blocked_at: string | null
          blocked_by: string | null
          is_blocked: boolean
          is_verified: boolean
          status: string
          suspended_until: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          block_reason?: string | null
          blocked_at?: string | null
          blocked_by?: string | null
          is_blocked?: boolean
          is_verified?: boolean
          status?: string
          suspended_until?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          block_reason?: string | null
          blocked_at?: string | null
          blocked_by?: string | null
          is_blocked?: boolean
          is_verified?: boolean
          status?: string
          suspended_until?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      wallet_holds: {
        Row: {
          amount: number
          created_at: string
          id: string
          meta: Json | null
          purpose: string | null
          reference: string | null
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          amount: number
          created_at?: string
          id?: string
          meta?: Json | null
          purpose?: string | null
          reference?: string | null
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          amount?: number
          created_at?: string
          id?: string
          meta?: Json | null
          purpose?: string | null
          reference?: string | null
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      wallets: {
        Row: {
          balance: number
          updated_at: string
          user_id: string
        }
        Insert: {
          balance?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          balance?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      withdrawals: {
        Row: {
          account_name: string
          account_number: string
          amount: number
          bank_name: string
          created_at: string
          id: string
          status: string
          user_id: string
        }
        Insert: {
          account_name: string
          account_number: string
          amount: number
          bank_name: string
          created_at?: string
          id?: string
          status?: string
          user_id: string
        }
        Update: {
          account_name?: string
          account_number?: string
          amount?: number
          bank_name?: string
          created_at?: string
          id?: string
          status?: string
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      apply_charge: {
        Args: { _amount: number; _service: string }
        Returns: number
      }
      approve_funding: {
        Args: { _id: string; _remark?: string }
        Returns: undefined
      }
      approve_withdrawal: { Args: { _id: string }; Returns: undefined }
      cancel_funding: {
        Args: { _id: string; _remark?: string }
        Returns: undefined
      }
      commit_wallet_hold: {
        Args: {
          _description: string
          _hold_id: string
          _meta?: Json
          _type: string
        }
        Returns: {
          amount: number
          charge: number
          created_at: string
          description: string | null
          id: string
          meta: Json | null
          profit: number
          provider_response: Json | null
          reference: string
          status: string
          supplier_reference: string | null
          type: string
          user_id: string
        }
        SetofOptions: {
          from: "*"
          to: "transactions"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      create_wallet_hold: {
        Args: {
          _amount: number
          _meta?: Json
          _purpose: string
          _user_id: string
        }
        Returns: string
      }
      credit_wallet: {
        Args: {
          _amount: number
          _description: string
          _reference: string
          _user_id: string
        }
        Returns: undefined
      }
      debit_wallet: {
        Args: {
          _amount: number
          _description: string
          _meta: Json
          _type: string
          _user_id: string
        }
        Returns: {
          amount: number
          charge: number
          created_at: string
          description: string | null
          id: string
          meta: Json | null
          profit: number
          provider_response: Json | null
          reference: string
          status: string
          supplier_reference: string | null
          type: string
          user_id: string
        }
        SetofOptions: {
          from: "*"
          to: "transactions"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      has_pending_funding: { Args: { _user_id: string }; Returns: boolean }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      log_activity: {
        Args: { _category: string; _details: Json; _event: string }
        Returns: undefined
      }
      log_admin_action: {
        Args: {
          _action: string
          _details: Json
          _target_id: string
          _target_type: string
        }
        Returns: undefined
      }
      refund_transaction: {
        Args: { _reason?: string; _tx_id: string }
        Returns: undefined
      }
      reject_funding: {
        Args: { _id: string; _remark?: string }
        Returns: undefined
      }
      reject_withdrawal: {
        Args: { _id: string; _reason?: string }
        Returns: undefined
      }
      release_wallet_hold: {
        Args: { _hold_id: string; _reason?: string }
        Returns: undefined
      }
      set_user_status: {
        Args: {
          _reason?: string
          _status: string
          _suspended_until?: string
          _user_id: string
        }
        Returns: undefined
      }
      wallet_available: { Args: { _user_id: string }; Returns: number }
    }
    Enums: {
      app_role: "admin" | "user"
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
    },
  },
} as const
