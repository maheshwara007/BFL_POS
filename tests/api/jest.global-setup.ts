import * as dotenv from 'dotenv';
import * as path from 'path';
import * as fs from 'fs';

dotenv.config({ path: path.resolve(process.cwd(), '.env.test') });

// ── Inline helpers (no import from helpers.ts to avoid circular load order) ──

function uid(len = 12): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let s = '';
  for (let i = 0; i < len; i++) s += chars.charAt(Math.floor(Math.random() * chars.length));
  return s;
}

function ts(): string {
  return new Date().toISOString().replace('T', ' ').substring(0, 19);
}

function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)); }

async function api(baseUrl: string, urlPath: string, body: object, token?: string) {
  const headers: Record<string, string> = { 'Content-Type': 'application/json', 'Accept': 'application/json' };
  if (token) headers['Authorization'] = `bearer ${token}`;
  const res = await fetch(`${baseUrl}${urlPath}`, { method: 'POST', headers, body: JSON.stringify(body) });
  const text = await res.text();
  let json: any;
  try { json = JSON.parse(text); } catch { json = text; }
  return { status: res.status, body: json };
}

// Random Indian mobile (POS channel): 91 + 10-digit number starting with 7–9
function rndPOS(): string {
  return '91' + String(7000000000 + Math.floor(Math.random() * 2999999999));
}

// Random UAE mobile (WEB channel): 971 + 9-digit number starting with 5
function rndWEB(): string {
  return '971' + String(500000000 + Math.floor(Math.random() * 99999999));
}

// Register a new POS member via send/otp → profile
// The API uses OTP '1111' as a test bypass; requestType 'New' creates a fresh account.
// Falls through multiple requestType values until one succeeds.
async function registerPOS(baseUrl: string, storeId: string, mobile: string, token: string): Promise<boolean> {
  const id = uid();
  const otpRes = await api(baseUrl, '/rprest/api/transaction/v1/send/otp', {
    reqId: `v${id}`, storeId, terminalId: '1', receiptNo: `v${id}`,
    reqTimeStamp: ts(), cashierId: 'EMP001', channel: 'POS', country: 'IN',
    mobileNumber: mobile, memberId: '', language: 'EN', notificationChannel: 'SMS',
  }, token);
  if (otpRes.status !== 200) {
    console.warn(`[TierSetup] POS OTP failed (${otpRes.status}) for ${mobile}`);
    return false;
  }

  const reqId    = otpRes.body?.reqId     || `v${id}`;
  const rcptNo   = otpRes.body?.receiptNo || `v${id}`;
  const baseProf = {
    storeId, terminalId: '1', reqTimeStamp: ts(),
    cashierId: 'EMP001', channel: 'POS', language: 'EN', dateOfBirth: '1990-01-01',
    firstName: 'TierSetup', lastName: 'POSUser', mobileNumber: mobile,
    emailId: `ts${id}@bfltest.com`, gender: 'Male', country: 'IN', city: '',
    nationality: 'IN', otp: '1111', mobileCountryCode: 'IN',
  };

  // Try each requestType until one succeeds
  for (const requestType of ['New', 'Register', 'Enroll', 'Update'] as const) {
    const res = await api(baseUrl, '/rprest/api/transaction/v1/profile', {
      reqId, receiptNo: rcptNo, ...baseProf, requestType,
    }, token);
    if ([200, 201].includes(res.status)) {
      console.log(`[TierSetup] POS profile OK (requestType=${requestType}) for ${mobile}`);
      return true;
    }
    console.warn(`[TierSetup] POS profile requestType=${requestType} → ${res.status}`);
  }
  return false;
}

// Register a new WEB member via profile.
// WEB channel accepts profile without OTP. Falls through requestTypes until one succeeds.
async function registerWEB(baseUrl: string, storeId: string, mobile: string, token: string): Promise<boolean> {
  const id = uid();
  const baseProf = {
    storeId, terminalId: '1', reqTimeStamp: ts(),
    cashierId: '', channel: 'WEB', language: 'EN',
    firstName: 'TierSetup', lastName: 'WEBUser', mobileNumber: mobile,
    emailId: `tsw${id}@bfltest.com`, gender: 'Male', country: 'AE', city: '',
    nationality: 'AE', mobileCountryCode: 'AE',
  };

  for (const requestType of ['New', 'Register', 'Enroll', 'Update'] as const) {
    const res = await api(baseUrl, '/rprest/api/transaction/v1/profile', {
      reqId: `v${id}`, receiptNo: `v${id}`, ...baseProf, requestType,
    }, token);
    if ([200, 201].includes(res.status)) {
      console.log(`[TierSetup] WEB profile OK (requestType=${requestType}) for ${mobile}`);
      return true;
    }
    console.warn(`[TierSetup] WEB profile requestType=${requestType} → ${res.status}`);
  }
  return false;
}

// Fetch member details (memberId + storeId)
async function getMember(
  baseUrl: string, storeId: string, mobile: string, channel: string, token: string
): Promise<{ memberId: number; storeId: string } | null> {
  const id = uid();
  const { status, body } = await api(baseUrl, '/rprest/api/transaction/v1/isMember', {
    reqId: `REQ${id}`, storeId, terminalId: '1', receiptNo: `TXN${id}`,
    reqTimeStamp: ts(), cashierId: 'EMP001', channel,
    customerIdBarCode: '', mobileNumber: mobile, emailId: '',
  }, token);
  if (status !== 200 || !body?.memberDetails?.memberId) {
    console.warn(`[TierSetup] isMember(${channel}) failed (${status}) for ${mobile}`);
    return null;
  }
  return {
    memberId: body.memberDetails.memberId as number,
    storeId:  (body.storeId || storeId) as string,
  };
}

// Commit a transaction to qualify for tier advancement
async function commitTierSpend(
  baseUrl: string, storeId: string, memberId: number, channel: string,
  netPrice: number, token: string
): Promise<void> {
  const id = uid();
  const vatAmount = parseFloat((netPrice * 0.05).toFixed(2));
  const total     = parseFloat((netPrice + vatAmount).toFixed(2));
  const item = {
    lineNo: 1, itemType: 'Product', sku: '153836', hsnCode: '12',
    productName: 'TierSetup', specification: 'TierSetup',
    markDownFlag: 'No', quantity: 1,
    grossPrice: netPrice, discountAmount: 0.00, netPrice, vatAmount,
    concept: 'BFL', brand: 'ADIDAS', department: 'BFL MEN SHOES', division: 'SHOES',
    previousLineNo: 0, isReturn: 'No',
  };
  const res = await api(baseUrl, '/rprest/api/transaction/v1/commitTransaction', {
    reqId: `BFLIN${id}`, storeId, terminalId: '1', receiptNo: `BFLIN${id}`,
    reqTimeStamp: ts(), cashierId: 'EMP001', channel, memberId,
    commitRequestType: 'Complete', txnDate: ts(), couponCodes: [],
    itemDetails: [item], previousReceiptNo: '',
    tenderDetails: [{ code: 'T1', amount: total }],
    billDetails: {
      subTotal: netPrice, totalDiscount: 0.00, totalAfterDiscount: netPrice,
      totalTax: vatAmount, totalAfterTax: total, taxType: 'VAT', taxRate: 5,
      taxInvoiceNo: `BFLIN${id}`, totalQuantity: 1,
      cardType: '', cardName: '', cardNo: null, bankName: '', appCode: '', recNo: '', changeDue: 0.00,
    },
  }, token);
  if (res.status !== 200) {
    console.warn(`[TierSetup] Tier-advance commit failed (${res.status}) for memberId ${memberId}`);
  }
}

// ── Tier spend thresholds ─────────────────────────────────────────────────────
// Explorer → Hunter : single transaction of AED 4001 (net price)
// Hunter  → Champion: subsequent transaction of AED 8002 (net price)
const EXPLORER_TO_HUNTER_NET  = 4001;
const HUNTER_TO_CHAMPION_NET  = 8002;

// ── Setup all 6 tier accounts ─────────────────────────────────────────────────
async function setupTierAccounts(
  baseUrl: string, storeId: string, token: string
): Promise<Record<string, string>> {
  const accounts: Record<string, string> = {};

  type TierCfg = { key: string; needsHunter: boolean; needsChampion: boolean };

  // POS accounts — register via OTP, advance via POS channel commits
  const posTiers: TierCfg[] = [
    { key: 'POS_EXPLORER_MOBILE', needsHunter: false, needsChampion: false },
    { key: 'POS_HUNTER_MOBILE',   needsHunter: true,  needsChampion: false },
    { key: 'POS_CHAMPION_MOBILE', needsHunter: true,  needsChampion: true  },
  ];

  for (const cfg of posTiers) {
    await sleep(1500); // gap between OTP calls to avoid rate limiting
    const mobile = rndPOS();
    console.log(`[TierSetup] Creating POS account for ${cfg.key}: ${mobile}`);
    try {
      const ok = await registerPOS(baseUrl, storeId, mobile, token);
      if (!ok) { console.warn(`[TierSetup] Skipping ${cfg.key} — registration failed`); continue; }

      await sleep(500);
      const member = await getMember(baseUrl, storeId, mobile, 'POS', token);
      if (!member) { console.warn(`[TierSetup] Skipping ${cfg.key} — isMember failed`); continue; }

      if (cfg.needsHunter || cfg.needsChampion) {
        console.log(`[TierSetup] Committing AED ${EXPLORER_TO_HUNTER_NET} → Hunter for ${mobile}`);
        await commitTierSpend(baseUrl, member.storeId, member.memberId, 'POS', EXPLORER_TO_HUNTER_NET, token);
        await sleep(500);
      }
      if (cfg.needsChampion) {
        console.log(`[TierSetup] Committing AED ${HUNTER_TO_CHAMPION_NET} → Champion for ${mobile}`);
        await commitTierSpend(baseUrl, member.storeId, member.memberId, 'POS', HUNTER_TO_CHAMPION_NET, token);
        await sleep(500);
      }
      accounts[cfg.key] = mobile;
    } catch (e) {
      console.warn(`[TierSetup] ${cfg.key} setup error:`, e);
    }
  }

  // WEB accounts — register without OTP, advance via WEB channel commits
  const webTiers: TierCfg[] = [
    { key: 'WEB_EXPLORER_MOBILE', needsHunter: false, needsChampion: false },
    { key: 'WEB_HUNTER_MOBILE',   needsHunter: true,  needsChampion: false },
    { key: 'WEB_CHAMPION_MOBILE', needsHunter: true,  needsChampion: true  },
  ];

  for (const cfg of webTiers) {
    const mobile = rndWEB();
    console.log(`[TierSetup] Creating WEB account for ${cfg.key}: ${mobile}`);
    try {
      const ok = await registerWEB(baseUrl, storeId, mobile, token);
      if (!ok) { console.warn(`[TierSetup] Skipping ${cfg.key} — registration failed`); continue; }

      await sleep(500);
      const member = await getMember(baseUrl, storeId, mobile, 'WEB', token);
      if (!member) { console.warn(`[TierSetup] Skipping ${cfg.key} — isMember failed`); continue; }

      if (cfg.needsHunter || cfg.needsChampion) {
        console.log(`[TierSetup] Committing AED ${EXPLORER_TO_HUNTER_NET} → Hunter for ${mobile}`);
        await commitTierSpend(baseUrl, member.storeId, member.memberId, 'WEB', EXPLORER_TO_HUNTER_NET, token);
        await sleep(500);
      }
      if (cfg.needsChampion) {
        console.log(`[TierSetup] Committing AED ${HUNTER_TO_CHAMPION_NET} → Champion for ${mobile}`);
        await commitTierSpend(baseUrl, member.storeId, member.memberId, 'WEB', HUNTER_TO_CHAMPION_NET, token);
        await sleep(500);
      }
      accounts[cfg.key] = mobile;
    } catch (e) {
      console.warn(`[TierSetup] ${cfg.key} setup error:`, e);
    }
  }

  return accounts;
}

// ── Global setup entry point ──────────────────────────────────────────────────
export default async function globalSetup() {
  const BASE_URL = process.env.BASE_URL || 'https://bfl-uat-pos.reciproci.com';
  const STORE_ID = process.env.STORE_ID || 'BFL01';
  const USERNAME = process.env.API_USERNAME || 'admin';
  const PASSWORD = process.env.API_PASSWORD || '1111';

  // ── Step 1: Fetch bearer token ───────────────────────────────────────────
  const timestamp = ts();
  const tokenRes = await fetch(`${BASE_URL}/rprest/api/transaction/v1/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
    body: JSON.stringify({
      storeId: STORE_ID, reqTimeStamp: timestamp, terminalId: '1',
      username: USERNAME, password: PASSWORD, grant_type: 'password',
    }),
  });

  const tokenBody = await tokenRes.json() as any;
  if (tokenRes.status !== 200 || !tokenBody.access_token) {
    throw new Error(`Global token fetch failed: ${tokenRes.status} ${JSON.stringify(tokenBody)}`);
  }

  const token = tokenBody.access_token as string;
  const tmpPath = path.resolve(process.cwd(), '.jest-token.tmp');
  fs.writeFileSync(tmpPath, token, 'utf8');
  process.env.BFL_TOKEN = token;

  // ── Step 2: Create tier-specific member accounts ─────────────────────────
  console.log('[TierSetup] Creating tier accounts (Explorer / Hunter / Champion) for POS + WEB…');
  let tierAccounts: Record<string, string> = {};
  try {
    tierAccounts = await setupTierAccounts(BASE_URL, STORE_ID, token);
  } catch (e) {
    console.warn('[TierSetup] Tier account setup encountered an error — tests will fall back to .env.test values:', e);
  }

  // Write tier mobile numbers to a temp file; helpers.ts reads it at import time
  const tierPath = path.resolve(process.cwd(), '.jest-tier-accounts.tmp');
  fs.writeFileSync(tierPath, JSON.stringify(tierAccounts, null, 2), 'utf8');
  console.log('[TierSetup] Tier accounts written to .jest-tier-accounts.tmp:', tierAccounts);
}
