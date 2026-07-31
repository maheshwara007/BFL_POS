import * as dotenv from 'dotenv';
import * as path from 'path';
import * as fs from 'fs';
dotenv.config({ path: path.resolve(process.cwd(), '.env.test') });

export const BASE_URL = process.env.BASE_URL || 'https://bfl-uat-pos.reciproci.com';
export const STORE_ID = process.env.STORE_ID || 'BFL01';
export const POS_MOBILE = process.env.POS_MOBILE || '917598994461';
export const WEB_MOBILE = process.env.WEB_MOBILE || '971507101004';
export const COUNTRY_CODE = process.env.COUNTRY_CODE || 'IN';

// Load tier-specific mobile numbers written by globalSetup
// Priority: .jest-tier-accounts.tmp (fresh accounts per run) → .env.test → fallback
function loadTierAccounts(): Record<string, string> {
  const tmpPath = path.resolve(process.cwd(), '.jest-tier-accounts.tmp');
  if (fs.existsSync(tmpPath)) {
    try { return JSON.parse(fs.readFileSync(tmpPath, 'utf8')); } catch { return {}; }
  }
  return {};
}
const _tier = loadTierAccounts();

export const POS_EXPLORER_MOBILE = _tier['POS_EXPLORER_MOBILE'] || process.env.POS_EXPLORER_MOBILE || POS_MOBILE;
export const POS_HUNTER_MOBILE   = _tier['POS_HUNTER_MOBILE']   || process.env.POS_HUNTER_MOBILE   || POS_MOBILE;
export const POS_CHAMPION_MOBILE = _tier['POS_CHAMPION_MOBILE']  || process.env.POS_CHAMPION_MOBILE  || POS_MOBILE;
export const WEB_EXPLORER_MOBILE = _tier['WEB_EXPLORER_MOBILE']  || process.env.WEB_EXPLORER_MOBILE  || WEB_MOBILE;
export const WEB_HUNTER_MOBILE   = _tier['WEB_HUNTER_MOBILE']    || process.env.WEB_HUNTER_MOBILE    || WEB_MOBILE;
export const WEB_CHAMPION_MOBILE = _tier['WEB_CHAMPION_MOBILE']  || process.env.WEB_CHAMPION_MOBILE  || WEB_MOBILE;

export function rnd(len = 10): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let result = '';
  for (let i = 0; i < len; i++) result += chars.charAt(Math.floor(Math.random() * chars.length));
  return result;
}

export function now(): string {
  return new Date().toISOString().replace('T', ' ').substring(0, 19);
}

export interface ApiResponse {
  status: number;
  body: any;
}

export async function post(path: string, body: object, token?: string): Promise<ApiResponse> {
  const url = path.startsWith('http') ? path : `${BASE_URL}${path}`;
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'Accept': 'application/json',
  };
  if (token) headers['Authorization'] = `bearer ${token}`;
  const res = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let json: any = null;
  try { json = JSON.parse(text); } catch { json = text; }
  return { status: res.status, body: json };
}

export function getToken(): string {
  // Token is fetched once in globalSetup and written to .jest-token.tmp
  const tmpPath = path.resolve(process.cwd(), '.jest-token.tmp');
  if (process.env.BFL_TOKEN) return process.env.BFL_TOKEN;
  if (fs.existsSync(tmpPath)) return fs.readFileSync(tmpPath, 'utf8').trim();
  throw new Error('No token available — ensure globalSetup ran successfully');
}

export interface MemberCtx {
  memberId: number;
  storeId: string;
  mobileNumber: string;
  points: number;
  pointsValue: number;
  walletBalance: number;
  tier: string;
}

export async function isMember(token: string, mobileNumber: string, channel = 'POS', storeId: string = STORE_ID): Promise<MemberCtx> {
  const id = rnd();
  const { status, body } = await post('/rprest/api/transaction/v1/isMember', {
    reqId: `REQ${id}`,
    storeId,
    terminalId: '1',
    receiptNo: `TXN${id}`,
    reqTimeStamp: now(),
    cashierId: 'EMP001',
    channel,
    customerIdBarCode: '',
    mobileNumber,
    emailId: '',
  }, token);
  if (status !== 200) throw new Error(`isMember failed: ${status} ${JSON.stringify(body)}`);
  return {
    memberId: body.memberDetails?.memberId,
    storeId: body.storeId || storeId,
    mobileNumber: body.memberDetails?.mobileNumber || mobileNumber,
    points: body.memberDetails?.pointsSummary?.[0]?.points ?? 0,
    pointsValue: body.memberDetails?.pointsSummary?.[0]?.pointsValue ?? 0,
    walletBalance: body.memberDetails?.walletBalance ?? 0,
    tier: body.memberDetails?.memberTier || 'Explorer',
  };
}

export function computeBillDetails(items: any[], id: string): any {
  const subTotal = parseFloat(items.reduce((s: number, i: any) => s + (i.netPrice || 0) * (i.quantity || 1), 0).toFixed(2));
  const totalDiscount = parseFloat(items.reduce((s: number, i: any) => s + (i.discountAmount || 0), 0).toFixed(2));
  const totalTax = parseFloat(items.reduce((s: number, i: any) => s + (i.vatAmount || 0), 0).toFixed(2));
  const totalQuantity = items.reduce((s: number, i: any) => s + (i.quantity || 1), 0);
  return {
    subTotal,
    totalDiscount,
    totalAfterDiscount: parseFloat((subTotal - totalDiscount).toFixed(2)),
    totalTax,
    totalAfterTax: parseFloat((subTotal + totalTax).toFixed(2)),
    taxType: 'VAT',
    taxRate: 5,
    taxInvoiceNo: `BFLIN${id}`,
    totalQuantity,
    cardType: '',
    cardName: '',
    cardNo: null,
    bankName: '',
    appCode: '',
    recNo: '',
    changeDue: 0.00,
  };
}

export function commitBody(opts: {
  id: string; storeId: string; memberId: number; channel: string;
  items?: any[]; tenderDetails?: any[]; couponCodes?: string[];
  previousReceiptNo?: string; commitRequestType?: string;
  billDetails?: any;
}) {
  const items = opts.items || [defaultItem(1)];
  return {
    reqId: `BFLIN${opts.id}`,
    storeId: opts.storeId,
    terminalId: '1',
    receiptNo: `BFLIN${opts.id}`,
    reqTimeStamp: now(),
    cashierId: 'EMP001',
    channel: opts.channel,
    memberId: opts.memberId,
    commitRequestType: opts.commitRequestType || 'Complete',
    txnDate: now(),
    couponCodes: opts.couponCodes || [],
    itemDetails: items,
    previousReceiptNo: opts.previousReceiptNo || '',
    tenderDetails: opts.tenderDetails || [{ code: 'T1', amount: 500.00 }],
    billDetails: opts.billDetails || computeBillDetails(items, opts.id),
  };
}

export function defaultItem(lineNo: number, overrides: any = {}) {
  return {
    lineNo,
    itemType: 'Product',
    sku: '153836',
    hsnCode: '12',
    productName: 'Product Name',
    specification: 'Product Description',
    markDownFlag: 'No',
    quantity: 1,
    grossPrice: 500.00,
    discountAmount: 0.00,
    netPrice: 460.00,
    vatAmount: 40.00,
    concept: 'BFL',
    brand: 'ADIDAS',
    department: 'BFL MEN SHOES',
    division: 'SHOES',
    previousLineNo: 0,
    isReturn: 'No',
    ...overrides,
  };
}
