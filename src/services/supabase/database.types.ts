// Generated from the schema of the client project (zggylkbgajamhriebdrg) on 2026-10-26 after migration 20261025180600
// (Supabase type generator). Regenerate after any migration: npx supabase gen types typescript --project-id <ref>.
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
    PostgrestVersion: "14.18"
  }
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      account_closure_requests: {
        Row: {
          business_id: string | null
          previous_business_status: string | null
          requested_at: string
          user_id: string
        }
        Insert: {
          business_id?: string | null
          previous_business_status?: string | null
          requested_at?: string
          user_id: string
        }
        Update: {
          business_id?: string | null
          previous_business_status?: string | null
          requested_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "account_closure_requests_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_events: {
        Row: {
          actor_id: string | null
          application_id: string | null
          business_id: string | null
          created_at: string
          event_type: string
          from_status: string | null
          id: string
          metadata: Json
          to_status: string | null
        }
        Insert: {
          actor_id?: string | null
          application_id?: string | null
          business_id?: string | null
          created_at?: string
          event_type: string
          from_status?: string | null
          id?: string
          metadata?: Json
          to_status?: string | null
        }
        Update: {
          actor_id?: string | null
          application_id?: string | null
          business_id?: string | null
          created_at?: string
          event_type?: string
          from_status?: string | null
          id?: string
          metadata?: Json
          to_status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_events_application_id_fkey"
            columns: ["application_id"]
            isOneToOne: false
            referencedRelation: "business_applications"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "audit_events_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      business_applications: {
        Row: {
          answers: Json
          applicant_email: string
          applicant_name: string
          applicant_phone: string | null
          business_id: string | null
          business_name: string
          category: string
          city: string
          country: string
          created_at: string
          decision_reason: string | null
          id: string
          language: string
          reference: string
          reviewed_at: string | null
          reviewed_by: string | null
          status: string
          submission_key: string
          submitter_hash: string | null
          updated_at: string
          website: string | null
        }
        Insert: {
          answers?: Json
          applicant_email: string
          applicant_name: string
          applicant_phone?: string | null
          business_id?: string | null
          business_name: string
          category: string
          city: string
          country: string
          created_at?: string
          decision_reason?: string | null
          id?: string
          language?: string
          reference?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          submission_key: string
          submitter_hash?: string | null
          updated_at?: string
          website?: string | null
        }
        Update: {
          answers?: Json
          applicant_email?: string
          applicant_name?: string
          applicant_phone?: string | null
          business_id?: string | null
          business_name?: string
          category?: string
          city?: string
          country?: string
          created_at?: string
          decision_reason?: string | null
          id?: string
          language?: string
          reference?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          submission_key?: string
          submitter_hash?: string | null
          updated_at?: string
          website?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "business_applications_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: true
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      business_members: {
        Row: {
          accepted_at: string | null
          business_id: string
          created_at: string
          id: string
          invited_at: string | null
          role: string
          user_id: string
        }
        Insert: {
          accepted_at?: string | null
          business_id: string
          created_at?: string
          id?: string
          invited_at?: string | null
          role?: string
          user_id: string
        }
        Update: {
          accepted_at?: string | null
          business_id?: string
          created_at?: string
          id?: string
          invited_at?: string | null
          role?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "business_members_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      businesses: {
        Row: {
          accent_color: string
          contact_address: string | null
          contact_email: string | null
          contact_phone: string | null
          contact_website: string | null
          created_at: string
          default_currency: string
          description: string
          id: string
          logo_url: string | null
          name: string
          slug: string
          status: string
          updated_at: string
        }
        Insert: {
          accent_color?: string
          contact_address?: string | null
          contact_email?: string | null
          contact_phone?: string | null
          contact_website?: string | null
          created_at?: string
          default_currency?: string
          description?: string
          id?: string
          logo_url?: string | null
          name: string
          slug: string
          status?: string
          updated_at?: string
        }
        Update: {
          accent_color?: string
          contact_address?: string | null
          contact_email?: string | null
          contact_phone?: string | null
          contact_website?: string | null
          created_at?: string
          default_currency?: string
          description?: string
          id?: string
          logo_url?: string | null
          name?: string
          slug?: string
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      email_log: {
        Row: {
          application_id: string | null
          attempt: number
          business_id: string | null
          created_at: string
          error: string | null
          id: string
          kind: string
          provider: string
          provider_message_id: string | null
          recipient: string
          status: string
          subject: string
          triggered_by: string | null
          updated_at: string
          workflow: string | null
        }
        Insert: {
          application_id?: string | null
          attempt?: number
          business_id?: string | null
          created_at?: string
          error?: string | null
          id?: string
          kind: string
          provider?: string
          provider_message_id?: string | null
          recipient: string
          status: string
          subject: string
          triggered_by?: string | null
          updated_at?: string
          workflow?: string | null
        }
        Update: {
          application_id?: string | null
          attempt?: number
          business_id?: string | null
          created_at?: string
          error?: string | null
          id?: string
          kind?: string
          provider?: string
          provider_message_id?: string | null
          recipient?: string
          status?: string
          subject?: string
          triggered_by?: string | null
          updated_at?: string
          workflow?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "email_log_application_id_fkey"
            columns: ["application_id"]
            isOneToOne: false
            referencedRelation: "business_applications"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_log_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      platform_admins: {
        Row: {
          created_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          user_id?: string
        }
        Relationships: []
      }
      platform_members: {
        Row: {
          activated_at: string | null
          created_at: string
          deactivated_at: string | null
          email: string
          full_name: string | null
          id: string
          invited_by: string | null
          role: Database["public"]["Enums"]["platform_role"]
          status: Database["public"]["Enums"]["member_status"]
          updated_at: string
          user_id: string | null
        }
        Insert: {
          activated_at?: string | null
          created_at?: string
          deactivated_at?: string | null
          email: string
          full_name?: string | null
          id?: string
          invited_by?: string | null
          role: Database["public"]["Enums"]["platform_role"]
          status?: Database["public"]["Enums"]["member_status"]
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          activated_at?: string | null
          created_at?: string
          deactivated_at?: string | null
          email?: string
          full_name?: string | null
          id?: string
          invited_by?: string | null
          role?: Database["public"]["Enums"]["platform_role"]
          status?: Database["public"]["Enums"]["member_status"]
          updated_at?: string
          user_id?: string | null
        }
        Relationships: []
      }
      platform_role_permissions: {
        Row: {
          permission: string
          role: Database["public"]["Enums"]["platform_role"]
        }
        Insert: {
          permission: string
          role: Database["public"]["Enums"]["platform_role"]
        }
        Update: {
          permission?: string
          role?: Database["public"]["Enums"]["platform_role"]
        }
        Relationships: []
      }
      platform_settings: {
        Row: {
          id: boolean
          require_2fa_business: boolean
          require_2fa_staff: boolean
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          id?: boolean
          require_2fa_business?: boolean
          require_2fa_staff?: boolean
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          id?: boolean
          require_2fa_business?: boolean
          require_2fa_staff?: boolean
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      product_analytics: {
        Row: {
          business_id: string
          created_at: string
          event_type: string
          id: string
          product_id: string | null
        }
        Insert: {
          business_id: string
          created_at?: string
          event_type: string
          id?: string
          product_id?: string | null
        }
        Update: {
          business_id?: string
          created_at?: string
          event_type?: string
          id?: string
          product_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "product_analytics_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_analytics_product_id_business_id_fkey"
            columns: ["product_id", "business_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id", "business_id"]
          },
        ]
      }
      product_images: {
        Row: {
          alt: string | null
          created_at: string
          id: string
          is_primary: boolean
          kind: string
          product_id: string
          sort_order: number
          storage_path: string | null
          url: string | null
        }
        Insert: {
          alt?: string | null
          created_at?: string
          id?: string
          is_primary?: boolean
          kind?: string
          product_id: string
          sort_order?: number
          storage_path?: string | null
          url?: string | null
        }
        Update: {
          alt?: string | null
          created_at?: string
          id?: string
          is_primary?: boolean
          kind?: string
          product_id?: string
          sort_order?: number
          storage_path?: string | null
          url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "product_images_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      product_models: {
        Row: {
          created_at: string
          file_name: string
          format: string
          product_id: string
          required_extensions: string[] | null
          size_bytes: number | null
          storage_path: string | null
          url: string | null
        }
        Insert: {
          created_at?: string
          file_name: string
          format: string
          product_id: string
          required_extensions?: string[] | null
          size_bytes?: number | null
          storage_path?: string | null
          url?: string | null
        }
        Update: {
          created_at?: string
          file_name?: string
          format?: string
          product_id?: string
          required_extensions?: string[] | null
          size_bytes?: number | null
          storage_path?: string | null
          url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "product_models_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      product_variant_images: {
        Row: {
          alt: string | null
          created_at: string
          id: string
          is_primary: boolean
          product_id: string
          sort_order: number
          storage_path: string
          variant_id: string
        }
        Insert: {
          alt?: string | null
          created_at?: string
          id?: string
          is_primary?: boolean
          product_id: string
          sort_order?: number
          storage_path: string
          variant_id: string
        }
        Update: {
          alt?: string | null
          created_at?: string
          id?: string
          is_primary?: boolean
          product_id?: string
          sort_order?: number
          storage_path?: string
          variant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_variant_images_variant_id_product_id_fkey"
            columns: ["variant_id", "product_id"]
            isOneToOne: false
            referencedRelation: "product_variants"
            referencedColumns: ["id", "product_id"]
          },
        ]
      }
      product_variant_models: {
        Row: {
          created_at: string
          file_name: string
          format: string
          product_id: string
          required_extensions: string[] | null
          size_bytes: number | null
          storage_path: string
          variant_id: string
        }
        Insert: {
          created_at?: string
          file_name: string
          format: string
          product_id: string
          required_extensions?: string[] | null
          size_bytes?: number | null
          storage_path: string
          variant_id: string
        }
        Update: {
          created_at?: string
          file_name?: string
          format?: string
          product_id?: string
          required_extensions?: string[] | null
          size_bytes?: number | null
          storage_path?: string
          variant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_variant_models_variant_id_product_id_fkey"
            columns: ["variant_id", "product_id"]
            isOneToOne: false
            referencedRelation: "product_variants"
            referencedColumns: ["id", "product_id"]
          },
        ]
      }
      product_variants: {
        Row: {
          color_hex: string | null
          created_at: string
          id: string
          name: Json
          price_delta: number | null
          product_id: string
          sku: string | null
          sort_order: number
        }
        Insert: {
          color_hex?: string | null
          created_at?: string
          id?: string
          name: Json
          price_delta?: number | null
          product_id: string
          sku?: string | null
          sort_order?: number
        }
        Update: {
          color_hex?: string | null
          created_at?: string
          id?: string
          name?: Json
          price_delta?: number | null
          product_id?: string
          sku?: string | null
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "product_variants_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      products: {
        Row: {
          business_id: string
          category: string
          created_at: string
          cta_label: Json
          cta_url: string | null
          currency: string
          depth: number
          description: Json
          dimension_unit: string
          height: number
          id: string
          material: Json
          name: Json
          price: number
          published_at: string | null
          short_description: Json
          slug: string
          status: string
          updated_at: string
          weight_unit: string | null
          weight_value: number | null
          width: number
        }
        Insert: {
          business_id: string
          category: string
          created_at?: string
          cta_label?: Json
          cta_url?: string | null
          currency: string
          depth: number
          description?: Json
          dimension_unit: string
          height: number
          id?: string
          material?: Json
          name: Json
          price: number
          published_at?: string | null
          short_description?: Json
          slug: string
          status?: string
          updated_at?: string
          weight_unit?: string | null
          weight_value?: number | null
          width: number
        }
        Update: {
          business_id?: string
          category?: string
          created_at?: string
          cta_label?: Json
          cta_url?: string | null
          currency?: string
          depth?: number
          description?: Json
          dimension_unit?: string
          height?: number
          id?: string
          material?: Json
          name?: Json
          price?: number
          published_at?: string | null
          short_description?: Json
          slug?: string
          status?: string
          updated_at?: string
          weight_unit?: string | null
          weight_value?: number | null
          width?: number
        }
        Relationships: [
          {
            foreignKeyName: "products_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_path: string | null
          clock: string
          date_format: string
          display_name: string | null
          notify_new_applications: boolean
          onboarding_completed_at: string | null
          onboarding_dismissed_at: string | null
          timezone: string
          updated_at: string
          user_id: string
        }
        Insert: {
          avatar_path?: string | null
          clock?: string
          date_format?: string
          display_name?: string | null
          notify_new_applications?: boolean
          onboarding_completed_at?: string | null
          onboarding_dismissed_at?: string | null
          timezone?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          avatar_path?: string | null
          clock?: string
          date_format?: string
          display_name?: string | null
          notify_new_applications?: boolean
          onboarding_completed_at?: string | null
          onboarding_dismissed_at?: string | null
          timezone?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      business_product_counts: {
        Row: {
          business_id: string | null
          drafts: number | null
          published: number | null
          total: number | null
        }
        Relationships: [
          {
            foreignKeyName: "products_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      product_analytics_daily: {
        Row: {
          ar_activations: number | null
          business_id: string | null
          day: string | null
          embed_views: number | null
          model_interactions: number | null
          product_id: string | null
          views: number | null
        }
        Relationships: [
          {
            foreignKeyName: "product_analytics_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_analytics_product_id_business_id_fkey"
            columns: ["product_id", "business_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id", "business_id"]
          },
        ]
      }
    }
    Functions: {
      admin_deactivate_member: { Args: { p_member: string }; Returns: Json }
      admin_get_member: { Args: { p_member: string }; Returns: Json }
      admin_invite_member: {
        Args: {
          p_email: string
          p_role: Database["public"]["Enums"]["platform_role"]
        }
        Returns: Json
      }
      admin_list_business_members: {
        Args: { p_business_id: string }
        Returns: {
          accepted_at: string
          created_at: string
          email: string
          invited_at: string
          last_sign_in_at: string
          user_id: string
        }[]
      }
      admin_list_closure_requests: { Args: never; Returns: Json }
      admin_list_member_invites: { Args: { p_member: string }; Returns: Json }
      admin_list_members: { Args: never; Returns: Json }
      admin_reactivate_member: { Args: { p_member: string }; Returns: Json }
      admin_review_application: {
        Args: { p_action: string; p_application_id: string; p_reason?: string }
        Returns: {
          answers: Json
          applicant_email: string
          applicant_name: string
          applicant_phone: string | null
          business_id: string | null
          business_name: string
          category: string
          city: string
          country: string
          created_at: string
          decision_reason: string | null
          id: string
          language: string
          reference: string
          reviewed_at: string | null
          reviewed_by: string | null
          status: string
          submission_key: string
          submitter_hash: string | null
          updated_at: string
          website: string | null
        }
        SetofOptions: {
          from: "*"
          to: "business_applications"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      admin_revoke_member_invite: { Args: { p_member: string }; Returns: Json }
      admin_set_member_role: {
        Args: {
          p_member: string
          p_role: Database["public"]["Enums"]["platform_role"]
        }
        Returns: Json
      }
      admin_set_role_permissions: {
        Args: {
          p_permissions: string[]
          p_role: Database["public"]["Enums"]["platform_role"]
        }
        Returns: Json
      }
      admin_user_emails: {
        Args: { p_ids: string[] }
        Returns: {
          email: string
          id: string
        }[]
      }
      analytics_daily: {
        Args: { p_business?: string; p_days?: number; p_tz: string }
        Returns: {
          ar_activations: number
          business_id: string
          day: string
          embed_views: number
          model_interactions: number
          product_id: string | null
          views: number
        }[]
      }
      caller_has_verified_factor: { Args: never; Returns: boolean }
      caller_mfa_satisfied: { Args: never; Returns: boolean }
      cancel_account_closure: { Args: never; Returns: Json }
      complete_owner_onboarding: { Args: never; Returns: string }
      is_business_member: { Args: { bid: string }; Returns: boolean }
      is_platform_admin: { Args: never; Returns: boolean }
      is_platform_member: { Args: never; Returns: boolean }
      list_my_security_events: {
        Args: never
        Returns: {
          actor_id: string | null
          application_id: string | null
          business_id: string | null
          created_at: string
          event_type: string
          from_status: string | null
          id: string
          metadata: Json
          to_status: string | null
        }[]
        SetofOptions: {
          from: "*"
          to: "audit_events"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      log_account_event: { Args: { p_event: string }; Returns: undefined }
      my_platform_access: { Args: never; Returns: Json }
      my_recovery_codes_left: { Args: never; Returns: number }
      my_security_state: { Args: never; Returns: Json }
      platform_can: { Args: { p_permission: string }; Returns: boolean }
      platform_can_read_profile: { Args: { p_user: string }; Returns: boolean }
      record_event_limited: {
        Args: {
          p_business_id: string
          p_event_type: string
          p_product_id: string
          p_visitor_key: string
        }
        Returns: string
      }
      record_sign_in: { Args: { p_user_agent: string }; Returns: string }
      save_product: {
        Args: {
          p_images: Json
          p_models: Json
          p_product: Json
          p_variants: Json
        }
        Returns: string
      }
      service_accept_invite: {
        Args: { p_full_name?: string; p_token_hash: string; p_user: string }
        Returns: string
      }
      service_check_action_code: {
        Args: { p_code: string; p_purpose: string; p_user: string }
        Returns: Json
      }
      service_classify_user: { Args: { p_user: string }; Returns: Json }
      service_clear_recovery_codes: { Args: { p_user: string }; Returns: Json }
      service_closure_target: { Args: { p_user: string }; Returns: Json }
      service_create_action_code: {
        Args: {
          p_code_hash: string
          p_purpose: string
          p_salt: string
          p_user: string
        }
        Returns: Json
      }
      service_create_member_invite: {
        Args: {
          p_actor: string
          p_expires_at: string
          p_member: string
          p_token_hash: string
        }
        Returns: Json
      }
      service_end_sessions: { Args: { p_user: string }; Returns: undefined }
      service_has_recovery_codes: { Args: { p_user: string }; Returns: Json }
      service_inspect_invite: { Args: { p_token_hash: string }; Returns: Json }
      service_link_owner: {
        Args: {
          p_actor: string
          p_application_id?: string
          p_business_id: string
          p_user_id: string
        }
        Returns: string
      }
      service_log_access_denied: {
        Args: { p_action: string; p_actor: string }
        Returns: undefined
      }
      service_log_account_event: {
        Args: {
          p_event: string
          p_ip: string
          p_metadata: Json
          p_user: string
        }
        Returns: Json
      }
      service_record_email_event: {
        Args: {
          p_event_type: string
          p_provider_message_id: string
          p_svix_id: string
        }
        Returns: boolean
      }
      service_record_invite_email: {
        Args: { p_detail: string; p_invite: string; p_ok: boolean }
        Returns: undefined
      }
      service_request_closure: { Args: { p_user: string }; Returns: Json }
      service_requires_2fa: { Args: { p_user: string }; Returns: Json }
      service_restore_closure: {
        Args: { p_actor: string; p_user: string }
        Returns: Json
      }
      service_set_recovery_codes: {
        Args: { p_hashes: string[]; p_salt: string; p_user: string }
        Returns: Json
      }
      service_use_recovery_code: {
        Args: { p_code: string; p_user: string }
        Returns: Json
      }
      service_user_can: {
        Args: { p_permission: string; p_user: string }
        Returns: boolean
      }
      service_user_id_by_email: { Args: { p_email: string }; Returns: string }
      service_void_action_codes: {
        Args: { p_purpose: string; p_user: string }
        Returns: Json
      }
    }
    Enums: {
      invite_status:
        | "pending"
        | "sent"
        | "email_failed"
        | "accepted"
        | "expired"
        | "revoked"
      member_status: "invited" | "active" | "deactivated"
      platform_role: "admin" | "team"
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {
      invite_status: [
        "pending",
        "sent",
        "email_failed",
        "accepted",
        "expired",
        "revoked",
      ],
      member_status: ["invited", "active", "deactivated"],
      platform_role: ["admin", "team"],
    },
  },
} as const
