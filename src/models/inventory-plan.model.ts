
export interface InventoryPlanItem {
  category: string;
  monthlyNeed: string;
  annualTotal: string;
  recommendedStock: string;
}

export interface ShopOffer {
  shop: string;
  price: string;
  totalCost: string;
  estimatedSavings?: string;
  webShopUrl?: string;
}

export interface ShoppingPlanItem {
  item: string;
  quantity: string;
  offers: ShopOffer[];
  selectedOfferIndex: number;
}

export interface InventoryFormInput {
  seasonLength: number;
  avgNightsPerUnit: number;
  avgNightsPerBooking: number;
  totalArea: number;
  units: number;
  avgUnitArea: number;
  cleaners: number;
}
