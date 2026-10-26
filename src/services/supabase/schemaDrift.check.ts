// Compile-time check: every column the service reads must exist in the generated schema types.
// A failure here means a migration renamed/dropped a column or the row types are out of date.
import type { Database } from './database.types'
import type { ApplicationRow, AuditRow, BusinessRow, DailyRow, EmailRow, ImageRow, ModelRow, ProductRow, VariantImageRow, VariantModelRow, VariantRow } from './supabaseCatalogService'
import type { ModelRequestRow } from './modelRequestsRead'

type T = Database['public']['Tables']
type Missing<Hand, Gen> = Exclude<keyof Hand, keyof Gen>
type Ok<K> = [K] extends [never] ? true : K

export const schemaMatches: [
  Ok<Missing<BusinessRow, T['businesses']['Row']>>,
  Ok<Missing<Omit<ProductRow, 'product_images' | 'product_models' | 'product_variants'>, T['products']['Row']>>,
  Ok<Missing<ImageRow, T['product_images']['Row']>>,
  Ok<Missing<ModelRow, T['product_models']['Row']>>,
  Ok<Missing<Omit<VariantRow, 'product_variant_images' | 'product_variant_models'>, T['product_variants']['Row']>>,
  Ok<Missing<VariantImageRow, T['product_variant_images']['Row']>>,
  Ok<Missing<VariantModelRow, T['product_variant_models']['Row']>>,
  Ok<Missing<DailyRow, Database['public']['Views']['product_analytics_daily']['Row']>>,
  Ok<Missing<ApplicationRow, T['business_applications']['Row']>>,
  Ok<Missing<AuditRow, T['audit_events']['Row']>>,
  Ok<Missing<EmailRow, T['email_log']['Row']>>,
  Ok<Missing<Omit<ModelRequestRow, 'products' | 'businesses' | 'product_variants' | 'model_request_photos'>, T['model_requests']['Row']>>,
] = [true, true, true, true, true, true, true, true, true, true, true, true]
