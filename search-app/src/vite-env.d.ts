/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_COVEO_ORG_ID: string;
  readonly VITE_COVEO_SEARCH_TOKEN: string;
  readonly VITE_COVEO_TRACKING_ID: string;
  readonly VITE_COVEO_ANSWER_CONFIG_ID?: string;
  readonly VITE_COVEO_TRENDING_SLOT_ID?: string;
  readonly VITE_COVEO_ENRICHMENT_PLACEMENT_IDS?: string;
  readonly VITE_COVEO_PLP_EMPTY_STATE_SLOT_ID?: string;
  readonly VITE_COVEO_PDP_RECOMMENDATIONS_SLOT_ID?: string;
  readonly VITE_COVEO_PDP_BOUGHT_TOGETHER_SLOT_ID?: string;
  readonly VITE_COVEO_CART_RECOMMENDATIONS_SLOT_ID?: string;
  /** Home "Recently Viewed" slot. Optional: without it the rail falls back to a client-side
   *  trail (see recentlyViewedStorage.ts), so the app degrades rather than breaking. */
  readonly VITE_COVEO_RECENTLY_VIEWED_SLOT_ID?: string;
  readonly VITE_SITE_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
