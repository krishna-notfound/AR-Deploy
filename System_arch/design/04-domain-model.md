# 04 · Domain model (`src/domain/types.ts`)
Read when: touching entities, seed data, forms, or service methods.
Decisions: [ADR-0003](../decisions/ADR-0003-money-minor-units.md), [ADR-0004](../decisions/ADR-0004-localized-content.md)

```ts
export type ID = string; export type ISODate = string;
export type Lang = 'en' | 'pt';
export type LocalizedText = { en: string; pt?: string };   // PT optional → fallback EN

export type BusinessStatus = 'active' | 'inactive' | 'draft';
export type ProductStatus  = 'draft' | 'published';
export type LengthUnit = 'cm' | 'in'; export type WeightUnit = 'kg' | 'lb';
export type Currency = 'EUR' | 'BRL' | 'USD';

export interface BusinessContact { email?: string; phone?: string; website?: string; address?: string }
export interface Business {
  id: ID; name: string; slug: string; logoUrl?: string; description: string;
  contact: BusinessContact; status: BusinessStatus;
  branding: { accentColor: string };        // public pages only
  defaultCurrency: Currency; createdAt: ISODate; updatedAt: ISODate;
}
export interface BusinessCatalog {          // derived, not stored
  business: Business; catalogUrl: string; localPath: string; publishedProductCount: number;
}

export interface ProductImage { id: ID; url: string; alt?: string; isPrimary: boolean; kind: 'gallery' | 'additional' }
export type ModelFormat = 'glb' | 'usdz';
export type AssetStatus = 'valid' | 'invalid' | 'missing' | 'session-only';
export interface ModelAsset { format: ModelFormat; url: string; fileName: string; sizeBytes?: number; status: AssetStatus; validationMessage?: string }
export interface Dimensions { width: number; height: number; depth: number; unit: LengthUnit }
export interface ProductVariant { id: ID; name: LocalizedText; colorHex?: string; sku?: string; priceDelta?: number }

export interface Product {
  id: ID; businessId: ID; slug: string;
  name: LocalizedText; shortDescription: LocalizedText; description: LocalizedText;
  category: string;                          // sofa|chair|table|bed|storage|lighting|decor
  price: number; currency: Currency;         // price in minor units (cents)
  images: ProductImage[];
  models: { glb?: ModelAsset; usdz?: ModelAsset };
  dimensions: Dimensions; material: LocalizedText;
  weight?: { value: number; unit: WeightUnit };
  variants: ProductVariant[];
  cta: { label: LocalizedText; url?: string };
  status: ProductStatus; publishedAt?: ISODate; createdAt: ISODate; updatedAt: ISODate;
}

export type AnalyticsEventType = 'view' | 'ar_activation';
export interface AnalyticsEvent { id: ID; productId: ID; businessId: ID; type: AnalyticsEventType; at: ISODate; sample: boolean }
export interface DailyPoint { date: string; views: number; arActivations: number }
export interface ProductAnalytics { productId: ID; businessId: ID; views: number; arActivations: number; arRate: number }
export interface AnalyticsSummary {
  totals: { businesses: number; products: number; published: number; drafts: number; views: number; arActivations: number };
  series: DailyPoint[];                     // last 30 days
  byProduct: ProductAnalytics[];            // desc by views
  byBusiness: { businessId: ID; views: number; arActivations: number; products: number }[];
  isSample: true;
}

export type Role = 'super_admin' | 'business_admin';
export interface User { id: ID; name: string; email: string; role: Role; businessId?: ID; avatarUrl?: string }

export interface ActivityItem {
  id: ID; at: ISODate; message: string; businessId?: ID; productId?: ID;
  kind: 'business_created' | 'business_updated' | 'product_created' | 'product_published' | 'product_unpublished' | 'product_deleted';
}
```

## As built (differences from the sketch above)
- `Category` is a union taken from `CATEGORIES`. `CURRENCIES` is exported for selects.
- `BusinessCatalog` also has `totalProductCount`.
- `ActivityKind` adds `business_deleted` and `product_updated`.
- `User` has no `avatarUrl`; initials are shown instead.
- `AnalyticsSummary.byBusiness` uses the `BusinessAnalytics` type.

## Invariants
- `Business.slug` is globally unique. `Product.slug` is unique per business. Both must match `/^[a-z0-9]+(?:-[a-z0-9]+)*$/`.
- When gallery images exist, exactly one gallery image is primary.
- **Publish requires:** EN name, price > 0, at least 1 image, and width/height/depth > 0. A product may publish without a model; the public page shows a fallback.
- Products of an `inactive` business are not shown publicly.
