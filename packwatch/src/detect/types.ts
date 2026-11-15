import type { ListingProduct, Money, StableState } from "../shared/types";

export type DetectState = StableState | "queue";

export interface DetectResult {
  state: DetectState;
  price?: Money;
  variantTitle?: string;
  seller?: string;
  products?: ListingProduct[];
  /** Short human-readable reason shown in the UI, e.g. "JSON-LD availability = PreOrder". */
  evidence: string;
}
