// Compile-time check: every column the service reads must exist in the generated schema types.
// A failure here means a migration renamed/dropped a column or the row types are out of date.
import type { Database } from './database.types'
import type { BusinessRow, DailyRow, ImageRow, ModelRow, ProductRow, VariantRow } from './supabaseCatalogService'

type T = Database['public']['Tables']
type Missing<Hand, Gen> = Exclude<keyof Hand, keyof Gen>
type Ok<K> = [K] extends [never] ? true : K

export const schemaMatches: [
  Ok<Missing<BusinessRow, T['businesses']['Row']>>,
  Ok<Missing<Omit<ProductRow, 'product_images' | 'product_models' | 'product_variants'>, T['products']['Row']>>,
  Ok<Missing<ImageRow, T['product_images']['Row']>>,
  Ok<Missing<ModelRow, T['product_models']['Row']>>,
  Ok<Missing<VariantRow, T['product_variants']['Row']>>,
  Ok<Missing<DailyRow, Database['public']['Views']['product_analytics_daily']['Row']>>,
] = [true, true, true, true, true, true]
