// Generated from the schema of the client project (zggylkbgajamhriebdrg) on 2026-10-20 after migration 20261020143507 (Supabase type generator).
// Only `Json` and `Database` are kept; regenerate with `npm run db:types` after any migration.
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: '14.18'
  }
  public: {
    Tables: {
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
            foreignKeyName: 'audit_events_application_id_fkey'
            columns: ['application_id']
            isOneToOne: false
            referencedRelation: 'business_applications'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'audit_events_business_id_fkey'
            columns: ['business_id']
            isOneToOne: false
            referencedRelation: 'businesses'
            referencedColumns: ['id']
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
            foreignKeyName: 'business_applications_business_id_fkey'
            columns: ['business_id']
            isOneToOne: true
            referencedRelation: 'businesses'
            referencedColumns: ['id']
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
            foreignKeyName: 'business_members_business_id_fkey'
            columns: ['business_id']
            isOneToOne: false
            referencedRelation: 'businesses'
            referencedColumns: ['id']
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
            foreignKeyName: 'email_log_application_id_fkey'
            columns: ['application_id']
            isOneToOne: false
            referencedRelation: 'business_applications'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'email_log_business_id_fkey'
            columns: ['business_id']
            isOneToOne: false
            referencedRelation: 'businesses'
            referencedColumns: ['id']
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
      product_analytics: {
        Row: {
          business_id: string
          created_at: string
          event_type: string
          id: string
          product_id: string
        }
        Insert: {
          business_id: string
          created_at?: string
          event_type: string
          id?: string
          product_id: string
        }
        Update: {
          business_id?: string
          created_at?: string
          event_type?: string
          id?: string
          product_id?: string
        }
        Relationships: [
          {
            foreignKeyName: 'product_analytics_product_id_business_id_fkey'
            columns: ['product_id', 'business_id']
            isOneToOne: false
            referencedRelation: 'products'
            referencedColumns: ['id', 'business_id']
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
            foreignKeyName: 'product_images_product_id_fkey'
            columns: ['product_id']
            isOneToOne: false
            referencedRelation: 'products'
            referencedColumns: ['id']
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
            foreignKeyName: 'product_models_product_id_fkey'
            columns: ['product_id']
            isOneToOne: false
            referencedRelation: 'products'
            referencedColumns: ['id']
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
            foreignKeyName: 'product_variant_images_variant_id_product_id_fkey'
            columns: ['variant_id', 'product_id']
            isOneToOne: false
            referencedRelation: 'product_variants'
            referencedColumns: ['id', 'product_id']
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
            foreignKeyName: 'product_variant_models_variant_id_product_id_fkey'
            columns: ['variant_id', 'product_id']
            isOneToOne: false
            referencedRelation: 'product_variants'
            referencedColumns: ['id', 'product_id']
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
            foreignKeyName: 'product_variants_product_id_fkey'
            columns: ['product_id']
            isOneToOne: false
            referencedRelation: 'products'
            referencedColumns: ['id']
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
            foreignKeyName: 'products_business_id_fkey'
            columns: ['business_id']
            isOneToOne: false
            referencedRelation: 'businesses'
            referencedColumns: ['id']
          },
        ]
      }
    }
    Views: {
      product_analytics_daily: {
        Row: {
          ar_activations: number | null
          business_id: string | null
          day: string | null
          model_interactions: number | null
          product_id: string | null
          views: number | null
        }
        Relationships: [
          {
            foreignKeyName: 'product_analytics_product_id_business_id_fkey'
            columns: ['product_id', 'business_id']
            isOneToOne: false
            referencedRelation: 'products'
            referencedColumns: ['id', 'business_id']
          },
        ]
      }
    }
    Functions: {
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
          from: '*'
          to: 'business_applications'
          isOneToOne: true
          isSetofReturn: false
        }
      }
      admin_user_emails: {
        Args: { p_ids: string[] }
        Returns: {
          email: string
          id: string
        }[]
      }
      complete_owner_onboarding: { Args: never; Returns: string }
      is_business_member: { Args: { bid: string }; Returns: boolean }
      is_platform_admin: { Args: never; Returns: boolean }
      record_event_limited: {
        Args: {
          p_business_id: string
          p_event_type: string
          p_product_id: string
          p_visitor_key: string
        }
        Returns: string
      }
      save_product: {
        Args: {
          p_images: Json
          p_models: Json
          p_product: Json
          p_variants: Json
        }
        Returns: string
      }
      service_link_owner: {
        Args: {
          p_actor: string
          p_application_id?: string
          p_business_id: string
          p_user_id: string
        }
        Returns: string
      }
      service_record_email_event: {
        Args: {
          p_event_type: string
          p_provider_message_id: string
          p_svix_id: string
        }
        Returns: boolean
      }
      service_user_id_by_email: { Args: { p_email: string }; Returns: string }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}
