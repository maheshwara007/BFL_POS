// Centralised test-data for all BFL API spec files.
// Change values here to run scenarios against different amounts, SKUs or tiers.

// ---------------------------------------------------------------------------
// Earn-rate configuration (pts earned per AED, earn base = netPrice + vatAmount)
// Explorer=1, Hunter=2, Champion=3  (observed from UAT; multiply by 10 in Excel docs)
// ---------------------------------------------------------------------------
export const EARN_RATES: Record<string, number> = {
  Explorer: 1,
  Hunter: 2,
  Champion: 3,
};

export function calcExpectedEarn(netPrice: number, vatAmount: number, tier: string): number {
  return Math.floor((netPrice + vatAmount) * (EARN_RATES[tier] ?? 1));
}

// Minimum spend threshold below which 0 pts are earned
export const MIN_SPEND_AED = 10;

// ---------------------------------------------------------------------------
// Tender codes
// ---------------------------------------------------------------------------
export const TENDER = {
  CASH: 'T1',
  POINTS: 'T8',
  WALLET: 'TW01',
  CARD: 'T2',
};

// ---------------------------------------------------------------------------
// SKU / item-category templates
// ---------------------------------------------------------------------------
export const SKU = {
  STANDARD: { sku: '153836', hsnCode: '12', concept: 'BFL', brand: 'ADIDAS', department: 'BFL MEN SHOES', division: 'SHOES' },
  VARIANT:  { sku: '153837', hsnCode: '1123', concept: 'BFL', brand: 'ADIDAS', department: 'BFL MEN SHOES', division: 'SHOES' },
};

// ---------------------------------------------------------------------------
// Item builder — every field explicitly declared so tests are self-documenting
// ---------------------------------------------------------------------------
export interface ItemOpts {
  lineNo: number;
  sku?: string;
  hsnCode?: string;
  qty?: number;
  grossPrice: number;
  netPrice: number;
  vatAmount: number;
  discountAmount?: number;
  markDownFlag?: 'Yes' | 'No';
  isReturn?: 'Yes' | 'No';
  previousLineNo?: number;
  concept?: string;
  brand?: string;
  department?: string;
  division?: string;
}

export function makeItem(o: ItemOpts) {
  const base = o.sku === SKU.VARIANT.sku ? SKU.VARIANT : SKU.STANDARD;
  return {
    lineNo: o.lineNo,
    itemType: 'Product',
    sku: o.sku ?? base.sku,
    hsnCode: o.hsnCode ?? base.hsnCode,
    productName: 'Product Name',
    specification: 'Product Description',
    markDownFlag: o.markDownFlag ?? 'No',
    quantity: o.qty ?? 1,
    grossPrice: o.grossPrice,
    discountAmount: o.discountAmount ?? 0.00,
    netPrice: o.netPrice,
    vatAmount: o.vatAmount,
    concept: o.concept ?? base.concept,
    brand: o.brand ?? base.brand,
    department: o.department ?? base.department,
    division: o.division ?? base.division,
    previousLineNo: o.previousLineNo ?? 0,
    isReturn: o.isReturn ?? 'No',
  };
}

// ---------------------------------------------------------------------------
// Pre-defined test scenarios — each entry maps 1-to-1 with a test case
// Edit amounts here; the spec files pick them up automatically.
// ---------------------------------------------------------------------------
export const TD = {

  // TIER-TC-001 – Explorer earns 1 pt/AED on non-sale
  TIER_TC001: {
    grossPrice: 100.00, netPrice: 100.00, vatAmount: 5.00,
    tenderAmount: 105.00, markDownFlag: 'No' as 'No',
  },

  // TIER-TC-002 – Hunter earns 2 pts/AED on non-sale
  TIER_TC002: {
    grossPrice: 100.00, netPrice: 100.00, vatAmount: 5.00,
    tenderAmount: 105.00, markDownFlag: 'No' as 'No',
  },

  // TIER-TC-003 – Champion earns 3 pts/AED on non-sale
  TIER_TC003: {
    grossPrice: 100.00, netPrice: 100.00, vatAmount: 5.00,
    tenderAmount: 105.00, markDownFlag: 'No' as 'No',
  },

  // TIER-TC-004 – Sale item (markDownFlag=Yes) earns 0 pts
  TIER_TC004: {
    grossPrice: 100.00, netPrice: 100.00, vatAmount: 5.00,
    tenderAmount: 105.00, markDownFlag: 'Yes' as 'Yes',
  },

  // TIER-TC-005 – Mixed cart: 1 sale + 1 non-sale; only non-sale earns
  TIER_TC005: {
    saleItem:    { grossPrice: 200.00, netPrice: 200.00, vatAmount: 10.00 },
    nonSaleItem: { grossPrice: 100.00, netPrice: 100.00, vatAmount: 5.00 },
    tenderAmount: 315.00,
  },

  // TIER-TC-006 – Non-sale item earn (currency-agnostic, same AED amounts)
  TIER_TC006: {
    grossPrice: 100.00, netPrice: 100.00, vatAmount: 5.00,
    tenderAmount: 105.00, markDownFlag: 'No' as 'No',
  },

  // TIER-TC-007 – Below AED 10 threshold → 0 pts
  TIER_TC007: {
    grossPrice: 5.00, netPrice: 5.00, vatAmount: 0.25,
    tenderAmount: 5.25, markDownFlag: 'No' as 'No',
  },

  // TIER-TC-008 – Exactly at AED 10 threshold → earns pts
  TIER_TC008: {
    grossPrice: 10.00, netPrice: 10.00, vatAmount: 0.50,
    tenderAmount: 10.50, markDownFlag: 'No' as 'No',
  },

  // TIER-TC-009 – Tier ratio validation: same spend, different tier members
  TIER_TC009: {
    grossPrice: 100.00, netPrice: 100.00, vatAmount: 5.00,
    tenderAmount: 105.00, markDownFlag: 'No' as 'No',
  },

  // TIER-TC-010 – Same item, compare sale (0 pts) vs non-sale (tier earn)
  TIER_TC010: {
    saleItem:    { grossPrice: 100.00, netPrice: 100.00, vatAmount: 5.00 },
    nonSaleItem: { grossPrice: 100.00, netPrice: 100.00, vatAmount: 5.00 },
    tenderAmount: 105.00,
  },

  // TIER-TC-011 – Earn base excludes delivery cost (verify pts = rate×(net+vat) only)
  TIER_TC011: {
    grossPrice: 100.00, netPrice: 100.00, vatAmount: 5.00,
    deliveryCost: 20.00, tenderAmount: 125.00, markDownFlag: 'No' as 'No',
  },

  // TIER-TC-012 – VAT included in earn base: pts = rate × (netPrice + vatAmount)
  TIER_TC012: {
    grossPrice: 105.00, netPrice: 100.00, vatAmount: 5.00,
    tenderAmount: 105.00, markDownFlag: 'No' as 'No',
  },

  // TIER-TC-013 – Multiple sequential transactions; earn rate stays consistent
  TIER_TC013: {
    txn1: { grossPrice: 100.00, netPrice: 100.00, vatAmount: 5.00, tenderAmount: 105.00 },
    txn2: { grossPrice: 200.00, netPrice: 200.00, vatAmount: 10.00, tenderAmount: 210.00 },
  },

  // TIER-TC-014 – Champion: block pts + commit with T8 redemption (OTP-gated)
  TIER_TC014: {
    blockPoints: 10.00,
    grossPrice: 500.00, netPrice: 460.00, vatAmount: 40.00,
    tenderPoints: 10.00, tenderCash: 490.00,
  },

  // TIER-TC-015 – Full return reverses all earned pts
  TIER_TC015: {
    grossPrice: 100.00, netPrice: 100.00, vatAmount: 5.00, tenderAmount: 105.00,
  },

  // TIER-TC-016 – Return of sale item (0 pts earned); no reversal
  TIER_TC016: {
    grossPrice: 100.00, netPrice: 100.00, vatAmount: 5.00, tenderAmount: 105.00,
    markDownFlag: 'Yes' as 'Yes',
  },

  // TIER-TC-017 – Just below threshold (AED 9.99) → 0 pts
  TIER_TC017: {
    grossPrice: 9.99, netPrice: 9.99, vatAmount: 0.50,
    tenderAmount: 10.49, markDownFlag: 'No' as 'No',
  },

  // TIER-TC-018 – Sale item with coupon → 0 pts (sale rule overrides)
  TIER_TC018: {
    grossPrice: 100.00, netPrice: 100.00, vatAmount: 5.00,
    tenderAmount: 105.00, markDownFlag: 'Yes' as 'Yes',
    couponCode: 'GET40FORFIRSTORD_1760',
  },

  // TIER-TC-019 – Large transaction (no overflow)
  TIER_TC019: {
    grossPrice: 5000.00, netPrice: 5000.00, vatAmount: 250.00,
    tenderAmount: 5250.00, markDownFlag: 'No' as 'No',
  },

  // TIER-TC-020 – Return after tier change; reversal uses original earn rate
  TIER_TC020: {
    grossPrice: 100.00, netPrice: 100.00, vatAmount: 5.00, tenderAmount: 105.00,
  },

  // ACC-TC-001 – Single item earn rate validation
  ACC_TC001: {
    grossPrice: 500.00, netPrice: 500.00, vatAmount: 25.00,
    tenderAmount: 525.00, markDownFlag: 'No' as 'No',
  },

  // ACC-TC-002 – Multi-item: earn on sum of all non-sale net prices
  ACC_TC002: {
    item1: { grossPrice: 300.00, netPrice: 300.00, vatAmount: 15.00 },
    item2: { grossPrice: 200.00, netPrice: 200.00, vatAmount: 10.00 },
    tenderAmount: 525.00,
  },

  // ACC-TC-003 – Preview (calculatePointsForCartItems) matches actual commit
  ACC_TC003: {
    grossPrice: 200.00, netPrice: 200.00, vatAmount: 10.00,
    tenderAmount: 210.00,
  },

  // RED-TC-001 – Block POINTS + T8 tender → exact pts deducted
  RED_TC001: {
    blockPoints: 10.00,
    grossPrice: 500.00, netPrice: 460.00, vatAmount: 40.00,
    tenderPoints: 10.00, tenderCash: 490.00,
  },

  // RED-TC-002 – Block WALLET + TW01 tender → exact wallet deducted
  RED_TC002: {
    blockWallet: 50.00,
    grossPrice: 500.00, netPrice: 460.00, vatAmount: 40.00,
    tenderWallet: 50.00, tenderCash: 450.00,
  },

  // RED-TC-003 – Return with TW01 refund restores wallet balance
  RED_TC003: {
    blockWallet: 50.00,
    grossPrice: 500.00, netPrice: 460.00, vatAmount: 40.00,
    tenderWallet: 50.00, tenderCash: 450.00,
  },

  // RED-TC-004 – Block then UNBLOCK (no commit) → balance fully restored
  RED_TC004: {
    blockPoints: 30.00,
  },

  // RVRSL-TC-001 – Full return: all earned pts reversed
  RVRSL_TC001: {
    grossPrice: 200.00, netPrice: 200.00, vatAmount: 10.00, tenderAmount: 210.00,
  },

  // RVRSL-TC-002 – Partial return: only L1 reversed, L2 retained
  RVRSL_TC002: {
    item1: { grossPrice: 300.00, netPrice: 300.00, vatAmount: 15.00 },
    item2: { grossPrice: 200.00, netPrice: 200.00, vatAmount: 10.00 },
    tenderAmount: 525.00, returnTenderAmount: 315.00,
  },

  // RVRSL-TC-003 – Return reverses both pts and TW01 wallet
  RVRSL_TC003: {
    blockWallet: 50.00,
    grossPrice: 500.00, netPrice: 460.00, vatAmount: 40.00,
    tenderWallet: 50.00, tenderCash: 450.00,
  },

  // RVRSL-TC-004 – Double return prevention
  RVRSL_TC004: {
    grossPrice: 100.00, netPrice: 100.00, vatAmount: 5.00, tenderAmount: 105.00,
  },

  // EDGE-TC-001 – Zero-price non-sale item
  EDGE_TC001: {
    grossPrice: 0.00, netPrice: 0.00, vatAmount: 0.00, tenderAmount: 0.01,
  },

  // EDGE-TC-002 – Fractional earn: 15.00 AED × rate should round exactly
  EDGE_TC002: {
    grossPrice: 15.00, netPrice: 15.00, vatAmount: 0.75, tenderAmount: 15.75,
  },

  // EDGE-TC-003 – Block exactly current full points balance
  EDGE_TC003: {
    grossPrice: 500.00, netPrice: 460.00, vatAmount: 40.00, tenderCash: 500.00,
  },

  // EDGE-TC-004 – Block more than available → error
  EDGE_TC004: {
    blockOverage: 9_999_999.00,
  },

  // EDGE-TC-005 – Concurrent commits from 2 terminals
  EDGE_TC005: {
    txnA: { grossPrice: 500.00, netPrice: 500.00, vatAmount: 25.00, tenderAmount: 525.00 },
    txnB: { grossPrice: 300.00, netPrice: 300.00, vatAmount: 15.00, tenderAmount: 315.00 },
  },

  // EDGE-TC-006 – Return of sale item; no pts reversed
  EDGE_TC006: {
    grossPrice: 100.00, netPrice: 100.00, vatAmount: 5.00,
    tenderAmount: 105.00, markDownFlag: 'Yes' as 'Yes',
  },
};
