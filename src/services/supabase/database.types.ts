// Generated from the live schema of pmnjchhrgvajtjpadpqo on 2026-10-13 (Supabase type generator).
// Only `Json` and `Database` are kept; regenerate with `npm run db:types` after any migration.
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  __InternalSupabase: {
    PostgrestVersion: '14.18'
  }
  public: {
    Tables: {
      business_members: {
        Row: { business_id: string; created_at: string; id: string; role: string; user_id: string }
        Insert: { business_id: string; created_at?: string; id?: string; role?: string; user_id: string }
        Update: { business_id?: string; created_at?: string; id?: string; role?: string; user_id?: string }
        Relationships: [
          { foreignKeyName: 'business_members_business_id_fkey'; columns: ['business_id']; isOneToOne: false; referencedRelation: 'businesses'; referencedColumns: ['id'] },
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
      platform_admins: {
        Row: { created_at: string; user_id: string }
        Insert: { created_at?: string; user_id: string }
        Update: { created_at?: string; user_id?: string }
        Relationships: []
      }
      product_analytics: {
        Row: { business_id: string; created_at: string; event_type: string; id: string; product_id: string }
        Insert: { business_id: string; created_at?: string; event_type: string; id?: string; product_id: string }
        Update: { business_id?: string; created_at?: string; event_type?: string; id?: string; product_id?: string }
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
          { foreignKeyName: 'product_images_product_id_fkey'; columns: ['product_id']; isOneToOne: false; referencedRelation: 'products'; referencedColumns: ['id'] },
        ]
      }
      product_models: {
        Row: {
          created_at: string
          file_name: string
          format: string
          product_id: string
          size_bytes: number | null
          storage_path: string | null
          url: string | null
        }
        Insert: {
          created_at?: string
          file_name: string
          format: string
          product_id: string
          size_bytes?: number | null
          storage_path?: string | null
          url?: string | null
        }
        Update: {
          created_at?: string
          file_name?: string
          format?: string
          product_id?: string
          size_bytes?: number | null
          storage_path?: string | null
          url?: string | null
        }
        Relationships: [
          { foreignKeyName: 'product_models_product_id_fkey'; columns: ['product_id']; isOneToOne: false; referencedRelation: 'products'; referencedColumns: ['id'] },
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
          { foreignKeyName: 'product_variants_product_id_fkey'; columns: ['product_id']; isOneToOne: false; referencedRelation: 'products'; referencedColumns: ['id'] },
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
          { foreignKeyName: 'products_business_id_fkey'; columns: ['business_id']; isOneToOne: false; referencedRelation: 'businesses'; referencedColumns: ['id'] },
        ]
      }
    }
    Views: {
      product_analytics_daily: {
        Row: {
          ar_activations: number | null
          business_id: string | null
          day: string | null
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
      is_business_member: { Args: { bid: string }; Returns: boolean }
      is_platform_admin: { Args: never; Returns: boolean }
      save_product: {
        Args: { p_images: Json; p_models: Json; p_product: Json; p_variants: Json }
        Returns: string
      }
    }
    Enums: { [_ in never]: never }
    CompositeTypes: { [_ in never]: never }
  }
}
