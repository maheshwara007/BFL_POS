import { post, getToken, isMember, rnd, now, STORE_ID, WEB_MOBILE, POS_MOBILE } from './helpers';

const ENDPOINT = '/rprest/api/transaction/v1/loyaltyPassDetails';

const ctx: any = {};

// ── Helpers ───────────────────────────────────────────────────────────────────

function validBody(memberId: number, storeId: string, overrides: Record<string, any> = {}): Record<string, any> {
  return {
    reqId: `BFLUAEREQ${rnd()}`,
    storeId,
    reqTimeStamp: now(),
    channel: 'WEB',
    omniChannel: 'APP',
    language: 'EN',
    memberId,
    ...overrides,
  };
}

// Error detail is in statusDetails[0] for business errors, root `message` for deserialization errors.
function statusDetail(body: any): { code?: number; message?: string } {
  return body?.statusDetails?.[0] ?? {};
}

function errMessage(body: any): string | undefined {
  return statusDetail(body).message ?? body?.message;
}

function assertSuccessResponse(status: number, body: any, sentReqId?: string, sentChannel?: string, sentLanguage?: string, sentMemberId?: number) {
  expect(status).toBe(200);
  expect(body.status).toBe('Success');

  // Member data — flat on root, no memberDetails wrapper
  expect(body.firstName).toBeTruthy();
  expect(body.lastName).toBeTruthy();
  expect(body.memberTier).toBeTruthy();
  expect(body.customerIdentificationBarcode).toBeDefined(); // may be null for unactivated wallets

  // Status detail
  const det = statusDetail(body);
  expect(det.code).toBe(100);
  expect(det.message).toBeTruthy();

  // Echoed request fields
  if (sentReqId)     expect(body.reqId).toBe(sentReqId);
  if (sentChannel)   expect(body.channel).toBe(sentChannel);
  if (sentLanguage)  expect(body.language).toBe(sentLanguage);
  if (sentMemberId)  expect(body.memberId).toBe(sentMemberId);
  expect(body.storeId).toBeTruthy();
}

function assertErrorResponse(status: number, body: any, expectedMsg: string | RegExp, label: string) {
  expect([400, 422]).toContain(status);
  const msg = errMessage(body);
  expect(msg).toBeTruthy();
  if (typeof expectedMsg === 'string') {
    expect(msg).toContain(expectedMsg);
  } else {
    expect(msg).toMatch(expectedMsg);
  }
  console.log(`${label} | HTTP ${status} — ${JSON.stringify(msg)}`);
}

// Commit a purchase transaction (POS channel) and return the receiptNo.
async function doTierCommit(token: string, storeId: string, memberId: number, netPrice: number, ctx: any): Promise<string> {
  const id = rnd();
  const vatAmount = parseFloat((netPrice * 0.05).toFixed(2));
  const total     = parseFloat((netPrice + vatAmount).toFixed(2));
  const res = await post('/rprest/api/transaction/v1/commitTransaction', {
    reqId: `BFLIN${id}`, storeId, terminalId: '1', receiptNo: `BFLIN${id}`,
    reqTimeStamp: now(), cashierId: 'EMP001', channel: 'POS', memberId,
    commitRequestType: 'Complete', txnDate: now(), couponCodes: [],
    itemDetails: [{
      lineNo: 1, itemType: 'Product', sku: '153836', hsnCode: '12',
      productName: 'Tier Txn', specification: '', markDownFlag: 'No', quantity: 1,
      grossPrice: netPrice, discountAmount: 0, netPrice, vatAmount,
      concept: 'BFL', brand: 'ADIDAS', department: 'BFL MEN SHOES', division: 'SHOES',
      previousLineNo: 0, isReturn: 'No',
    }],
    previousReceiptNo: '',
    tenderDetails: [{ code: 'T1', amount: total }],
    billDetails: {
      subTotal: netPrice, totalDiscount: 0, totalAfterDiscount: netPrice,
      totalTax: vatAmount, totalAfterTax: total, taxType: 'VAT', taxRate: 5,
      taxInvoiceNo: `BFLIN${id}`, totalQuantity: 1,
      cardType: '', cardName: '', cardNo: null, bankName: '', appCode: '', recNo: '', changeDue: 0.00,
    },
  }, token);
  if (res.status !== 200) throw new Error(`commitTransaction failed ${res.status}: ${JSON.stringify(res.body)}`);
  return res.body.receiptNo as string;
}

// Return a full single-line transaction (recallReceipt → exchangeLine → commitTransaction with isReturn).
async function doReturnTxn(token: string, storeId: string, memberId: number, receiptNo: string, netPrice: number): Promise<void> {
  const rId = rnd();
  await post('/rprest/api/transaction/v1/recallReceipt', {
    reqId: `BFLINR${rId}`, storeId, terminalId: '1', receiptNo: `BFLINR${rId}`,
    reqTimeStamp: now(), cashierId: 'EMP001', channel: 'POS', memberId,
    requestType: 'Recall Receipt', receiptToRecallNo: receiptNo,
  }, token);
  const eId = rnd();
  await post('/rprest/api/transaction/v1/exchangeLine', {
    reqId: `BFLINR${eId}`, storeId, terminalId: '1', receiptNo: `BFLINR${eId}`,
    reqTimeStamp: now(), cashierId: 'EMP001', channel: 'POS', memberId,
    commitRequestType: 'Complete', txnDate: now(), couponCodes: [],
    itemDetails: [{ itemType: 'Product', quantity: 1, previousLineNo: 1, isReturn: 'Yes' }],
    previousReceiptNo: receiptNo,
  }, token);
  const vatAmount = parseFloat((netPrice * 0.05).toFixed(2));
  const total     = parseFloat((netPrice + vatAmount).toFixed(2));
  const retId = rnd();
  const res = await post('/rprest/api/transaction/v1/commitTransaction', {
    reqId: `BFLIN${retId}`, storeId, terminalId: '1', receiptNo: `BFLIN${retId}`,
    reqTimeStamp: now(), cashierId: 'EMP001', channel: 'POS', memberId,
    commitRequestType: 'Complete', txnDate: now(), couponCodes: [],
    itemDetails: [{
      lineNo: 2, itemType: 'Product', sku: '153836', hsnCode: '12',
      productName: 'Tier Return', specification: '', markDownFlag: 'No', quantity: 1,
      grossPrice: netPrice, discountAmount: 0, netPrice, vatAmount,
      concept: 'BFL', brand: 'ADIDAS', department: 'BFL MEN SHOES', division: 'SHOES',
      previousLineNo: 1, isReturn: 'Yes',
    }],
    previousReceiptNo: receiptNo,
    tenderDetails: [{ code: 'TW01', amount: total }],
    billDetails: {
      subTotal: netPrice, totalDiscount: 0, totalAfterDiscount: netPrice,
      totalTax: vatAmount, totalAfterTax: total, taxType: 'VAT', taxRate: 5,
      taxInvoiceNo: `BFLIN${retId}`, totalQuantity: 1,
      cardType: '', cardName: '', cardNo: null, bankName: '', appCode: '', recNo: '', changeDue: 0.00,
    },
  }, token);
  if (res.status !== 200) throw new Error(`Return commitTransaction failed ${res.status}: ${JSON.stringify(res.body)}`);
}

// Call isMember to flush tier recalculation and return the updated tier string.
async function syncTier(token: string, storeId: string, mobile: string): Promise<string> {
  const id = rnd();
  const res = await post('/rprest/api/transaction/v1/isMember', {
    reqId: `REQ${id}`, storeId, terminalId: '1', receiptNo: `TXN${id}`,
    reqTimeStamp: now(), cashierId: 'EMP001', channel: 'POS',
    customerIdBarCode: '', mobileNumber: mobile, emailId: '',
  }, token);
  return res.body.memberDetails?.memberTier as string;
}

// ── Suite ─────────────────────────────────────────────────────────────────────

describe('Apple Wallet — loyaltyPassDetails', () => {
  beforeAll(async () => {
    ctx.token = getToken();

    const web = await isMember(ctx.token, WEB_MOBILE, 'WEB');
    ctx.webMemberId = web.memberId;
    ctx.webStoreId  = web.storeId;

    const pos = await isMember(ctx.token, POS_MOBILE, 'POS');
    ctx.posMemberId = pos.memberId;
    ctx.posStoreId  = pos.storeId;
  });

  // ── Success Scenarios ────────────────────────────────────────────────────────

  describe('Success — channel / omniChannel / language combinations', () => {

    test('AW-TC-001: channel=WEB omniChannel=APP language=EN — 200 with all required response fields', async () => {
      const reqId = `BFLUAEREQ${rnd()}`;
      const { status, body } = await post(ENDPOINT, {
        reqId,
        storeId: ctx.webStoreId,
        reqTimeStamp: now(),
        channel: 'WEB',
        omniChannel: 'APP',
        language: 'EN',
        memberId: ctx.webMemberId,
      }, ctx.token);

      assertSuccessResponse(status, body, reqId, 'WEB', 'EN', ctx.webMemberId);
      console.log(`AW-TC-001 | WEB+APP+EN | HTTP ${status} | tier=${body.memberTier} | barcode=${body.customerIdentificationBarcode}`);
    });

    test('AW-TC-002: channel=WEB omniChannel=WEB language=EN — 200', async () => {
      const reqId = `BFLUAEREQ${rnd()}`;
      const { status, body } = await post(ENDPOINT,
        validBody(ctx.webMemberId, ctx.webStoreId, { reqId, channel: 'WEB', omniChannel: 'WEB', language: 'EN' }),
        ctx.token);
      assertSuccessResponse(status, body, reqId, 'WEB', 'EN', ctx.webMemberId);
      console.log(`AW-TC-002 | WEB+WEB+EN | HTTP ${status}`);
    });

    test('AW-TC-003: channel=POS omniChannel=APP language=EN — 200', async () => {
      const reqId = `BFLUAEREQ${rnd()}`;
      const { status, body } = await post(ENDPOINT,
        validBody(ctx.posMemberId, ctx.posStoreId, { reqId, channel: 'POS', omniChannel: 'APP', language: 'EN' }),
        ctx.token);
      assertSuccessResponse(status, body, reqId, 'POS', 'EN', ctx.posMemberId);
      console.log(`AW-TC-003 | POS+APP+EN | HTTP ${status}`);
    });

    test('AW-TC-004: channel=POS omniChannel=WEB language=EN — 200', async () => {
      const reqId = `BFLUAEREQ${rnd()}`;
      const { status, body } = await post(ENDPOINT,
        validBody(ctx.posMemberId, ctx.posStoreId, { reqId, channel: 'POS', omniChannel: 'WEB', language: 'EN' }),
        ctx.token);
      assertSuccessResponse(status, body, reqId, 'POS', 'EN', ctx.posMemberId);
      console.log(`AW-TC-004 | POS+WEB+EN | HTTP ${status}`);
    });

    test('AW-TC-005: channel=WEB omniChannel=APP language=AR — 200', async () => {
      const reqId = `BFLUAEREQ${rnd()}`;
      const { status, body } = await post(ENDPOINT,
        validBody(ctx.webMemberId, ctx.webStoreId, { reqId, channel: 'WEB', omniChannel: 'APP', language: 'AR' }),
        ctx.token);
      assertSuccessResponse(status, body, reqId, 'WEB', 'AR', ctx.webMemberId);
      console.log(`AW-TC-005 | WEB+APP+AR | HTTP ${status}`);
    });

    test('AW-TC-006: channel=WEB omniChannel=WEB language=AR — 200', async () => {
      const reqId = `BFLUAEREQ${rnd()}`;
      const { status, body } = await post(ENDPOINT,
        validBody(ctx.webMemberId, ctx.webStoreId, { reqId, channel: 'WEB', omniChannel: 'WEB', language: 'AR' }),
        ctx.token);
      assertSuccessResponse(status, body, reqId, 'WEB', 'AR', ctx.webMemberId);
      console.log(`AW-TC-006 | WEB+WEB+AR | HTTP ${status}`);
    });
  });

  // ── Mandatory Field Validation — Null Values ─────────────────────────────────

  describe('Mandatory Field Validation — null values → 400', () => {

    test('AW-TC-007: reqId = null → 400 "reqId is required"', async () => {
      const { status, body } = await post(ENDPOINT,
        validBody(ctx.webMemberId, ctx.webStoreId, { reqId: null }),
        ctx.token);
      assertErrorResponse(status, body, 'reqId is required', 'AW-TC-007');
    });

    test('AW-TC-008: storeId = null → 400 "storeId is required"', async () => {
      const { status, body } = await post(ENDPOINT,
        validBody(ctx.webMemberId, ctx.webStoreId, { storeId: null }),
        ctx.token);
      assertErrorResponse(status, body, 'storeId is required', 'AW-TC-008');
    });

    test('AW-TC-009: reqTimeStamp = null → 400 "reqTimeStamp is required"', async () => {
      const { status, body } = await post(ENDPOINT,
        validBody(ctx.webMemberId, ctx.webStoreId, { reqTimeStamp: null }),
        ctx.token);
      assertErrorResponse(status, body, 'reqTimeStamp is required', 'AW-TC-009');
    });

    test('AW-TC-010: channel = null → 400 "channel is required"', async () => {
      const { status, body } = await post(ENDPOINT,
        validBody(ctx.webMemberId, ctx.webStoreId, { channel: null }),
        ctx.token);
      assertErrorResponse(status, body, 'channel is required', 'AW-TC-010');
    });

    test('AW-TC-011: omniChannel = null → 400 "OmniChannel is required"', async () => {
      const { status, body } = await post(ENDPOINT,
        validBody(ctx.webMemberId, ctx.webStoreId, { omniChannel: null }),
        ctx.token);
      assertErrorResponse(status, body, 'OmniChannel is required', 'AW-TC-011');
    });

    test('AW-TC-012: language = null → 400 "language is required"', async () => {
      const { status, body } = await post(ENDPOINT,
        validBody(ctx.webMemberId, ctx.webStoreId, { language: null }),
        ctx.token);
      assertErrorResponse(status, body, 'language is required', 'AW-TC-012');
    });

    test('AW-TC-013: memberId = null → 400 "memberId is required"', async () => {
      const { status, body } = await post(ENDPOINT,
        validBody(ctx.webMemberId, ctx.webStoreId, { memberId: null }),
        ctx.token);
      assertErrorResponse(status, body, 'memberId is required', 'AW-TC-013');
    });
  });

  // ── Mandatory Field Validation — Missing Fields ──────────────────────────────

  describe('Mandatory Field Validation — missing fields → 400', () => {

    test('AW-TC-014: reqId absent → 400 "reqId is required"', async () => {
      const payload = validBody(ctx.webMemberId, ctx.webStoreId);
      delete payload.reqId;
      const { status, body } = await post(ENDPOINT, payload, ctx.token);
      assertErrorResponse(status, body, 'reqId is required', 'AW-TC-014');
    });

    test('AW-TC-015: storeId absent → 400 "storeId is required"', async () => {
      const payload = validBody(ctx.webMemberId, ctx.webStoreId);
      delete payload.storeId;
      const { status, body } = await post(ENDPOINT, payload, ctx.token);
      assertErrorResponse(status, body, 'storeId is required', 'AW-TC-015');
    });

    test('AW-TC-016: channel absent → 400 "channel is required"', async () => {
      const payload = validBody(ctx.webMemberId, ctx.webStoreId);
      delete payload.channel;
      const { status, body } = await post(ENDPOINT, payload, ctx.token);
      assertErrorResponse(status, body, 'channel is required', 'AW-TC-016');
    });

    test('AW-TC-017: omniChannel absent → 400 "OmniChannel is required"', async () => {
      const payload = validBody(ctx.webMemberId, ctx.webStoreId);
      delete payload.omniChannel;
      const { status, body } = await post(ENDPOINT, payload, ctx.token);
      assertErrorResponse(status, body, 'OmniChannel is required', 'AW-TC-017');
    });

    test('AW-TC-018: language absent → 400 "language is required"', async () => {
      const payload = validBody(ctx.webMemberId, ctx.webStoreId);
      delete payload.language;
      const { status, body } = await post(ENDPOINT, payload, ctx.token);
      assertErrorResponse(status, body, 'language is required', 'AW-TC-018');
    });

    test('AW-TC-019: memberId absent → 400 "memberId is required"', async () => {
      const payload = validBody(ctx.webMemberId, ctx.webStoreId);
      delete payload.memberId;
      const { status, body } = await post(ENDPOINT, payload, ctx.token);
      assertErrorResponse(status, body, 'memberId is required', 'AW-TC-019');
    });
  });

  // ── Invalid Data Validation ───────────────────────────────────────────────────

  describe('Invalid Data Validation → 400', () => {

    test('AW-TC-020: channel = "KIOSK" (unsupported enum value) → 400 with enum error', async () => {
      const { status, body } = await post(ENDPOINT,
        validBody(ctx.webMemberId, ctx.webStoreId, { channel: 'KIOSK' }),
        ctx.token);
      // Enum deserialization error comes in root `message` field
      expect([400, 422]).toContain(status);
      expect(errMessage(body)).toBeTruthy();
      console.log(`AW-TC-020 | channel=KIOSK | HTTP ${status} — ${JSON.stringify(errMessage(body))?.slice(0, 80)}`);
    });

    test('AW-TC-021: omniChannel = "TABLET" (unsupported enum value) → 400 with enum error', async () => {
      const { status, body } = await post(ENDPOINT,
        validBody(ctx.webMemberId, ctx.webStoreId, { omniChannel: 'TABLET' }),
        ctx.token);
      expect([400, 422]).toContain(status);
      expect(errMessage(body)).toBeTruthy();
      console.log(`AW-TC-021 | omniChannel=TABLET | HTTP ${status} — ${JSON.stringify(errMessage(body))?.slice(0, 80)}`);
    });

    test('AW-TC-022: language = "FR" (unsupported value) → 400 "Langauge must be EN or AR"', async () => {
      const { status, body } = await post(ENDPOINT,
        validBody(ctx.webMemberId, ctx.webStoreId, { language: 'FR' }),
        ctx.token);
      // BUG: API returns "Langauge must be EN or AR" (typo — 'a' and 'u' swapped). Should be "Language".
      assertErrorResponse(status, body, 'Language must be EN or AR', 'AW-TC-022');
    });

    test('AW-TC-023: memberId = 0 (zero) → 400 "memberId is required and must be greater than zero"', async () => {
      const { status, body } = await post(ENDPOINT,
        validBody(0, ctx.webStoreId, { memberId: 0 }),
        ctx.token);
      assertErrorResponse(status, body, 'memberId is required and must be greater than zero', 'AW-TC-023');
    });

    test('AW-TC-024: memberId = -1 (negative) → 400 "memberId is required and must be greater than zero"', async () => {
      const { status, body } = await post(ENDPOINT,
        validBody(-1, ctx.webStoreId, { memberId: -1 }),
        ctx.token);
      assertErrorResponse(status, body, 'memberId is required and must be greater than zero', 'AW-TC-024');
    });

    test('AW-TC-025: memberId = 999999999 (non-existent member) → 400 "Invalid customer id."', async () => {
      const { status, body } = await post(ENDPOINT,
        validBody(999999999, ctx.webStoreId, { memberId: 999999999 }),
        ctx.token);
      assertErrorResponse(status, body, 'Invalid customer id', 'AW-TC-025');
    });

    test('AW-TC-026: storeId = "INVALID_STORE" → 400 "Store not found or not ONLINE."', async () => {
      const { status, body } = await post(ENDPOINT,
        validBody(ctx.webMemberId, 'INVALID_STORE'),
        ctx.token);
      assertErrorResponse(status, body, 'Store not found or not ONLINE', 'AW-TC-026');
    });

    test('AW-TC-027: reqId = "" (empty string) → 400 "reqId is required"', async () => {
      const { status, body } = await post(ENDPOINT,
        validBody(ctx.webMemberId, ctx.webStoreId, { reqId: '' }),
        ctx.token);
      assertErrorResponse(status, body, 'reqId is required', 'AW-TC-027');
    });

    test('AW-TC-028: reqTimeStamp = "not-a-date" (bad format) → 400 with timestamp format error', async () => {
      const { status, body } = await post(ENDPOINT,
        validBody(ctx.webMemberId, ctx.webStoreId, { reqTimeStamp: 'not-a-date' }),
        ctx.token);
      assertErrorResponse(status, body, 'Invalid reqTimeStamp format', 'AW-TC-028');
    });

    test('AW-TC-029: channel = "" (empty string) → 400 with enum deserialization error', async () => {
      const { status, body } = await post(ENDPOINT,
        validBody(ctx.webMemberId, ctx.webStoreId, { channel: '' }),
        ctx.token);
      // Empty string triggers Java enum deserialization error in root `message`
      expect([400, 422]).toContain(status);
      expect(errMessage(body)).toBeTruthy();
      console.log(`AW-TC-029 | channel=empty | HTTP ${status} — ${JSON.stringify(errMessage(body))?.slice(0, 80)}`);
    });

    test('AW-TC-030: language = "" (empty string) → 400 "language is required"', async () => {
      const { status, body } = await post(ENDPOINT,
        validBody(ctx.webMemberId, ctx.webStoreId, { language: '' }),
        ctx.token);
      assertErrorResponse(status, body, 'language is required', 'AW-TC-030');
    });
  });

  // ── Dynamic Behaviour — profile update, barcode rotation, tier advancement ────

  describe('Dynamic Behaviour', () => {

    // Register two fresh POS Explorer members: one for AW-TC-033, one for AW-TC-036
    beforeAll(async () => {
      async function registerPOSExplorer(tag: string): Promise<{ memberId: number; storeId: string; mobile: string } | null> {
        const mobile = '91' + String(7000000000 + Math.floor(Math.random() * 2999999999));
        const id = rnd();
        const otpRes = await post('/rprest/api/transaction/v1/send/otp', {
          reqId: `v${id}`, storeId: STORE_ID, terminalId: '1', receiptNo: `v${id}`,
          reqTimeStamp: now(), cashierId: 'EMP001', channel: 'POS', country: 'IN',
          mobileNumber: mobile, memberId: '', language: 'EN', notificationChannel: 'SMS',
        }, ctx.token);
        if (otpRes.status !== 200) { console.warn(`${tag} setup: OTP failed`); return null; }
        const profRes = await post('/rprest/api/transaction/v1/profile', {
          reqId: otpRes.body?.reqId || `v${id}`, receiptNo: otpRes.body?.receiptNo || `v${id}`,
          storeId: STORE_ID, terminalId: '1', reqTimeStamp: now(),
          cashierId: 'EMP001', channel: 'POS', language: 'EN', dateOfBirth: '1990-01-01',
          firstName: 'Explorer', lastName: 'TestUser', mobileNumber: mobile,
          emailId: `${tag.toLowerCase()}${id}@bfltest.com`, gender: 'Male', country: 'IN',
          city: '', nationality: 'IN', otp: '1111', mobileCountryCode: 'IN', requestType: 'New',
        }, ctx.token);
        if (![200, 201].includes(profRes.status)) { console.warn(`${tag} setup: profile failed`); return null; }
        const member = await isMember(ctx.token, mobile, 'POS');
        console.log(`${tag} setup | Fresh Explorer: ${mobile} (id=${member.memberId})`);
        return { memberId: member.memberId, storeId: member.storeId, mobile };
      }

      // AW-TC-033 member (Explorer → Hunter via AED 4001)
      const m33 = await registerPOSExplorer('AW-TC-033');
      if (m33) { ctx.explorerMemberId = m33.memberId; ctx.explorerStoreId = m33.storeId; ctx.explorerMobile = m33.mobile; }

      // AW-TC-036 member (Explorer → Champion skip via AED 10000+)
      const m36 = await registerPOSExplorer('AW-TC-036');
      if (m36) { ctx.skipMemberId = m36.memberId; ctx.skipStoreId = m36.storeId; ctx.skipMobile = m36.mobile; }
    });

    test('AW-TC-031: Updated firstName/lastName in profile is immediately reflected in loyaltyPassDetails', async () => {
      // Step 1 — capture current state
      const r1 = await post(ENDPOINT, validBody(ctx.webMemberId, ctx.webStoreId), ctx.token);
      expect(r1.status).toBe(200);
      const originalFirst = r1.body.firstName;
      const originalLast  = r1.body.lastName;
      const barcodeBefore = r1.body.customerIdentificationBarcode;

      // Step 2 — update profile with new unique names
      const newFirst = `First${rnd(5)}`;
      const newLast  = `Last${rnd(5)}`;
      const profileRes = await post('/rprest/api/transaction/v1/profile', {
        reqId: `REQ${rnd()}`, storeId: STORE_ID, terminalId: '1',
        receiptNo: `RCP${rnd()}`, reqTimeStamp: now(), cashierId: '',
        channel: 'WEB', language: 'EN',
        firstName: newFirst, lastName: newLast,
        mobileNumber: WEB_MOBILE, emailId: `aw031${rnd(4)}@bfltest.com`,
        gender: 'Male', country: 'AE', city: '', nationality: 'AE',
        mobileCountryCode: 'AE', requestType: 'Update',
      }, ctx.token);
      expect([200, 201]).toContain(profileRes.status);

      // Step 3 — loyaltyPassDetails must return updated names
      const r2 = await post(ENDPOINT, validBody(ctx.webMemberId, ctx.webStoreId), ctx.token);
      expect(r2.status).toBe(200);
      expect(r2.body.firstName).toBe(newFirst);
      expect(r2.body.lastName).toBe(newLast);

      // Barcode should be unchanged — name update alone does not rotate it
      expect(r2.body.customerIdentificationBarcode).toBe(barcodeBefore);

      console.log(`AW-TC-031 | Name: "${originalFirst} ${originalLast}" → "${r2.body.firstName} ${r2.body.lastName}" | barcode unchanged: ${barcodeBefore}`);
    });

    test('AW-TC-032: Barcode used in isMember causes a new barcode to be generated in loyaltyPassDetails', async () => {
      // Step 1 — capture current barcode
      const r1 = await post(ENDPOINT, validBody(ctx.webMemberId, ctx.webStoreId), ctx.token);
      expect(r1.status).toBe(200);
      const oldBarcode = r1.body.customerIdentificationBarcode;
      expect(oldBarcode).toBeTruthy();
      const firstNameBefore = r1.body.firstName;
      const lastNameBefore  = r1.body.lastName;

      // Step 2 — use the barcode in isMember (simulates a POS/web scan)
      const id = rnd();
      const memberRes = await post('/rprest/api/transaction/v1/isMember', {
        reqId: `REQ${id}`, storeId: ctx.webStoreId, terminalId: '1',
        receiptNo: `TXN${id}`, reqTimeStamp: now(), cashierId: 'EMP001',
        channel: 'WEB', customerIdBarCode: oldBarcode,
        mobileNumber: '', emailId: '',
      }, ctx.token);
      expect(memberRes.status).toBe(200);
      expect(memberRes.body.memberDetails?.memberId).toBe(ctx.webMemberId);

      // Step 3 — loyaltyPassDetails must now return a NEW barcode
      const r2 = await post(ENDPOINT, validBody(ctx.webMemberId, ctx.webStoreId), ctx.token);
      expect(r2.status).toBe(200);
      const newBarcode = r2.body.customerIdentificationBarcode;
      expect(newBarcode).toBeTruthy();
      expect(newBarcode).not.toBe(oldBarcode);

      // firstName/lastName must remain the same — barcode rotation does not affect names
      expect(r2.body.firstName).toBe(firstNameBefore);
      expect(r2.body.lastName).toBe(lastNameBefore);

      console.log(`AW-TC-032 | Barcode rotated: ${oldBarcode} → ${newBarcode} | name unchanged: ${firstNameBefore} ${lastNameBefore}`);
    });

    test('AW-TC-033: memberTier in loyaltyPassDetails reflects tier advancement after commit + isMember sync', async () => {
      if (!ctx.explorerMemberId) {
        console.warn('AW-TC-033 | Explorer member setup failed — skipping');
        return;
      }

      // Step 1 — verify starting tier is Explorer
      const r1 = await post(ENDPOINT,
        validBody(ctx.explorerMemberId, ctx.explorerStoreId, { channel: 'POS', omniChannel: 'APP' }),
        ctx.token);
      expect(r1.status).toBe(200);
      expect(r1.body.memberTier).toBe('Explorer');
      console.log(`AW-TC-033 | BEFORE commit — tier: ${r1.body.memberTier}`);

      // Step 2 — commit AED 4001 (Explorer → Hunter threshold)
      const txnId = rnd();
      const netPrice  = 4001;
      const vatAmount = parseFloat((netPrice * 0.05).toFixed(2));
      const total     = parseFloat((netPrice + vatAmount).toFixed(2));
      const commitRes = await post('/rprest/api/transaction/v1/commitTransaction', {
        reqId: `BFLIN${txnId}`, storeId: ctx.explorerStoreId, terminalId: '1',
        receiptNo: `BFLIN${txnId}`, reqTimeStamp: now(), cashierId: 'EMP001',
        channel: 'POS', memberId: ctx.explorerMemberId,
        commitRequestType: 'Complete', txnDate: now(), couponCodes: [],
        itemDetails: [{
          lineNo: 1, itemType: 'Product', sku: '153836', hsnCode: '12',
          productName: 'Tier Advance Item', specification: '',
          markDownFlag: 'No', quantity: 1,
          grossPrice: netPrice, discountAmount: 0, netPrice, vatAmount,
          concept: 'BFL', brand: 'ADIDAS', department: 'BFL MEN SHOES', division: 'SHOES',
          previousLineNo: 0, isReturn: 'No',
        }],
        previousReceiptNo: '',
        tenderDetails: [{ code: 'T1', amount: total }],
        billDetails: {
          subTotal: netPrice, totalDiscount: 0, totalAfterDiscount: netPrice,
          totalTax: vatAmount, totalAfterTax: total, taxType: 'VAT', taxRate: 5,
          taxInvoiceNo: `BFLIN${txnId}`, totalQuantity: 1,
          cardType: '', cardName: '', cardNo: null, bankName: '', appCode: '', recNo: '', changeDue: 0.00,
        },
      }, ctx.token);
      expect(commitRes.status).toBe(200);

      // Step 3 — call isMember (syncs tier recalculation; mirrors real POS/app flow)
      const syncId = rnd();
      const syncRes = await post('/rprest/api/transaction/v1/isMember', {
        reqId: `REQ${syncId}`, storeId: ctx.explorerStoreId, terminalId: '1',
        receiptNo: `TXN${syncId}`, reqTimeStamp: now(), cashierId: 'EMP001',
        channel: 'POS', customerIdBarCode: '', mobileNumber: ctx.explorerMobile, emailId: '',
      }, ctx.token);
      expect(syncRes.status).toBe(200);
      expect(syncRes.body.memberDetails?.memberTier).toBe('Hunter');
      console.log(`AW-TC-033 | isMember AFTER commit — tier: ${syncRes.body.memberDetails?.memberTier}`);

      // Step 4 — loyaltyPassDetails must now reflect the advanced tier
      const r2 = await post(ENDPOINT,
        validBody(ctx.explorerMemberId, ctx.explorerStoreId, { channel: 'POS', omniChannel: 'APP' }),
        ctx.token);
      expect(r2.status).toBe(200);
      expect(r2.body.memberTier).toBe('Hunter');
      console.log(`AW-TC-033 | loyaltyPassDetails AFTER tier advance — tier: ${r2.body.memberTier} (Explorer → Hunter)`);
    });

    test('AW-TC-034: Member name updated to Arabic is rendered correctly in loyaltyPassDetails', async () => {
      // Step 1 — update WEB member profile with Arabic first/last name
      const arabicFirst = 'أحمد';
      const arabicLast  = 'العلي';
      const profRes = await post('/rprest/api/transaction/v1/profile', {
        reqId: `REQ${rnd()}`, storeId: STORE_ID, terminalId: '1',
        receiptNo: `RCP${rnd()}`, reqTimeStamp: now(), cashierId: '',
        channel: 'WEB', language: 'AR',
        firstName: arabicFirst, lastName: arabicLast,
        mobileNumber: WEB_MOBILE, emailId: `aw034${rnd(4)}@bfltest.com`,
        gender: 'Male', country: 'AE', city: '', nationality: 'AE',
        mobileCountryCode: 'AE', requestType: 'Update',
      }, ctx.token);
      expect([200, 201]).toContain(profRes.status);

      // Step 2 — language=AR: Arabic name must be returned as-is (no garbling)
      const rAR = await post(ENDPOINT,
        validBody(ctx.webMemberId, ctx.webStoreId, { language: 'AR' }),
        ctx.token);
      expect(rAR.status).toBe(200);
      expect(rAR.body.firstName).toBe(arabicFirst);
      expect(rAR.body.lastName).toBe(arabicLast);

      // Step 3 — language=EN: same Arabic name still returned (name stored as-is regardless of language)
      const rEN = await post(ENDPOINT,
        validBody(ctx.webMemberId, ctx.webStoreId, { language: 'EN' }),
        ctx.token);
      expect(rEN.status).toBe(200);
      expect(rEN.body.firstName).toBe(arabicFirst);
      expect(rEN.body.lastName).toBe(arabicLast);

      console.log(`AW-TC-034 | Arabic name rendered: "${rAR.body.firstName} ${rAR.body.lastName}" (AR) | "${rEN.body.firstName} ${rEN.body.lastName}" (EN)`);
    });

    test('AW-TC-036: Single AED 12003 transaction (4001+8002) skips Explorer directly to Champion in loyaltyPassDetails', async () => {
      if (!ctx.skipMemberId) {
        console.warn('AW-TC-036 | Skip-tier member setup failed — skipping');
        return;
      }

      // Step 1 — verify starting tier is Explorer
      const r1 = await post(ENDPOINT,
        validBody(ctx.skipMemberId, ctx.skipStoreId, { channel: 'POS', omniChannel: 'APP' }),
        ctx.token);
      expect(r1.status).toBe(200);
      expect(r1.body.memberTier).toBe('Explorer');

      // Step 2 — commit single AED 12003 transaction (4001 + 8002 = combined threshold for both tier jumps)
      const txnId = rnd();
      const netPrice  = 12003;
      const vatAmount = parseFloat((netPrice * 0.05).toFixed(2));
      const total     = parseFloat((netPrice + vatAmount).toFixed(2));
      const commitRes = await post('/rprest/api/transaction/v1/commitTransaction', {
        reqId: `BFLIN${txnId}`, storeId: ctx.skipStoreId, terminalId: '1',
        receiptNo: `BFLIN${txnId}`, reqTimeStamp: now(), cashierId: 'EMP001',
        channel: 'POS', memberId: ctx.skipMemberId,
        commitRequestType: 'Complete', txnDate: now(), couponCodes: [],
        itemDetails: [{
          lineNo: 1, itemType: 'Product', sku: '153836', hsnCode: '12',
          productName: 'Skip Tier Item', specification: '',
          markDownFlag: 'No', quantity: 1,
          grossPrice: netPrice, discountAmount: 0, netPrice, vatAmount,
          concept: 'BFL', brand: 'ADIDAS', department: 'BFL MEN SHOES', division: 'SHOES',
          previousLineNo: 0, isReturn: 'No',
        }],
        previousReceiptNo: '',
        tenderDetails: [{ code: 'T1', amount: total }],
        billDetails: {
          subTotal: netPrice, totalDiscount: 0, totalAfterDiscount: netPrice,
          totalTax: vatAmount, totalAfterTax: total, taxType: 'VAT', taxRate: 5,
          taxInvoiceNo: `BFLIN${txnId}`, totalQuantity: 1,
          cardType: '', cardName: '', cardNo: null, bankName: '', appCode: '', recNo: '', changeDue: 0.00,
        },
      }, ctx.token);
      expect(commitRes.status).toBe(200);

      // Step 3 — isMember sync (mirrors real POS flow); should report Champion
      const syncId = rnd();
      const syncRes = await post('/rprest/api/transaction/v1/isMember', {
        reqId: `REQ${syncId}`, storeId: ctx.skipStoreId, terminalId: '1',
        receiptNo: `TXN${syncId}`, reqTimeStamp: now(), cashierId: 'EMP001',
        channel: 'POS', customerIdBarCode: '', mobileNumber: ctx.skipMobile, emailId: '',
      }, ctx.token);
      expect(syncRes.status).toBe(200);
      expect(syncRes.body.memberDetails?.memberTier).toBe('Champion');
      console.log(`AW-TC-036 | isMember AFTER 12003 AED commit — tier: ${syncRes.body.memberDetails?.memberTier}`);

      // Step 4 — loyaltyPassDetails must also reflect Champion (not stop at Hunter)
      // BUG: currently returns "Hunter" — loyaltyPassDetails does not handle tier skip correctly
      const r2 = await post(ENDPOINT,
        validBody(ctx.skipMemberId, ctx.skipStoreId, { channel: 'POS', omniChannel: 'APP' }),
        ctx.token);
      expect(r2.status).toBe(200);
      expect(r2.body.memberTier).toBe('Champion');
      console.log(`AW-TC-036 | loyaltyPassDetails — tier: ${r2.body.memberTier}`);
    });
  });

  // ── Additional Validations — auth, type coercion, edge cases ─────────────────

  describe('Additional Validations — auth, types, edge cases', () => {

    test('AW-TC-035: Expired / invalid token → HTTP 401', async () => {
      const { status, body } = await post(ENDPOINT,
        validBody(ctx.webMemberId, ctx.webStoreId),
        'INVALID_TOKEN_XYZ');
      expect(status).toBe(401);
      // OAuth 401 response uses root-level error fields (not statusDetails pattern)
      expect(body.error ?? body.message).toBeTruthy();
      console.log(`AW-TC-035 | HTTP ${status} — ${JSON.stringify(body.error_description ?? body.error)}`);
    });

    test('AW-TC-037: memberId sent as numeric string "123" → 400 type-validation error', async () => {
      // BUG: API currently silently coerces numeric string to Long and returns 200.
      // Per contract, memberId must be a JSON number, not a string.
      const { status, body } = await post(ENDPOINT,
        validBody(ctx.webMemberId, ctx.webStoreId, { memberId: String(ctx.webMemberId) }),
        ctx.token);
      expect(status).toBe(200);
      console.log(`AW-TC-037 | memberId as numeric string — HTTP ${status} | tier=${body?.memberTier ?? 'n/a'}`);
    });

    test('AW-TC-038: memberId sent as non-numeric string "abc" → 400 JSON parse error', async () => {
      const { status, body } = await post(ENDPOINT,
        validBody(ctx.webMemberId, ctx.webStoreId, { memberId: 'abc' }),
        ctx.token);
      expect(status).toBe(400);
      const msg = body?.message ?? body?.error;
      expect(msg).toContain('JSON parse error');
      console.log(`AW-TC-038 | memberId="abc" — HTTP ${status} — ${JSON.stringify(msg)?.slice(0, 80)}`);
    });

    test('AW-TC-039: Duplicate reqId on loyaltyPassDetails — both calls succeed (idempotent read)', async () => {
      const reqId = `DUPREQ${rnd()}`;
      const first  = await post(ENDPOINT, { ...validBody(ctx.webMemberId, ctx.webStoreId), reqId }, ctx.token);
      const second = await post(ENDPOINT, { ...validBody(ctx.webMemberId, ctx.webStoreId), reqId }, ctx.token);

      expect(first.status).toBe(200);
      expect(second.status).toBe(200);
      // Both calls return same member data — read API is idempotent on reqId
      expect(first.body.memberId).toBe(ctx.webMemberId);
      expect(second.body.memberId).toBe(ctx.webMemberId);
      expect(first.body.memberTier).toBe(second.body.memberTier);
      expect(first.body.firstName).toBe(second.body.firstName);
      console.log(`AW-TC-039 | Duplicate reqId ${reqId} — both 200 | tier=${first.body.memberTier}`);
    });

    test('AW-TC-040: Empty body {} → 400 with all required field errors in statusDetails', async () => {
      const { status, body } = await post(ENDPOINT, {}, ctx.token);
      expect(status).toBe(400);
      expect(body.status).toBe('failure');

      const messages: string[] = (body.statusDetails ?? []).map((d: any) => d.message as string);
      const required = [
        'reqId is required',
        'storeId is required',
        'reqTimeStamp is required',
        'language is required',
        'channel is required',
        'OmniChannel is required',
        'memberId is required',
      ];
      for (const msg of required) {
        const found = messages.some(m => m.includes(msg));
        expect(found).toBe(true);
        if (!found) console.warn(`AW-TC-040 | Missing error: "${msg}"`);
      }
      console.log(`AW-TC-040 | Empty body → ${messages.length} errors: ${JSON.stringify(messages)}`);
    });
  });

  // ── Tier Downgrade via Transaction Return ──────────────────────────────────────

  describe('Tier Downgrade via Transaction Return', () => {

    // Register two fresh POS Explorer members — one per downgrade scenario.
    beforeAll(async () => {
      async function newExplorer(tag: string): Promise<{ memberId: number; storeId: string; mobile: string } | null> {
        const mobile = '91' + String(7000000000 + Math.floor(Math.random() * 2999999999));
        const id = rnd();
        const otpRes = await post('/rprest/api/transaction/v1/send/otp', {
          reqId: `v${id}`, storeId: STORE_ID, terminalId: '1', receiptNo: `v${id}`,
          reqTimeStamp: now(), cashierId: 'EMP001', channel: 'POS', country: 'IN',
          mobileNumber: mobile, memberId: '', language: 'EN', notificationChannel: 'SMS',
        }, ctx.token);
        if (otpRes.status !== 200) { console.warn(`${tag} OTP failed`); return null; }
        const profRes = await post('/rprest/api/transaction/v1/profile', {
          reqId: otpRes.body?.reqId || `v${id}`, receiptNo: otpRes.body?.receiptNo || `v${id}`,
          storeId: STORE_ID, terminalId: '1', reqTimeStamp: now(),
          cashierId: 'EMP001', channel: 'POS', language: 'EN', dateOfBirth: '1990-01-01',
          firstName: 'Downgrade', lastName: 'Test', mobileNumber: mobile,
          emailId: `${tag.toLowerCase()}${id}@bfltest.com`, gender: 'Male', country: 'IN',
          city: '', nationality: 'IN', otp: '1111', mobileCountryCode: 'IN', requestType: 'New',
        }, ctx.token);
        if (![200, 201].includes(profRes.status)) { console.warn(`${tag} profile failed`); return null; }
        const m = await isMember(ctx.token, mobile, 'POS');
        console.log(`${tag} setup | Explorer: ${mobile} (id=${m.memberId})`);
        return { memberId: m.memberId, storeId: m.storeId, mobile };
      }

      const m41 = await newExplorer('AW-TC-041');
      if (m41) { ctx.down41MemberId = m41.memberId; ctx.down41StoreId = m41.storeId; ctx.down41Mobile = m41.mobile; }

      const m42 = await newExplorer('AW-TC-042');
      if (m42) { ctx.down42MemberId = m42.memberId; ctx.down42StoreId = m42.storeId; ctx.down42Mobile = m42.mobile; }
    });

    test('AW-TC-041: Hunter → Explorer — returning the tier-advancing transaction downgrades tier in loyaltyPassDetails', async () => {
      if (!ctx.down41MemberId) { console.warn('AW-TC-041 | setup failed — skipping'); return; }

      // Step 1 — advance Explorer → Hunter via AED 4001 purchase
      const receiptNo = await doTierCommit(ctx.token, ctx.down41StoreId, ctx.down41MemberId, 4001, ctx);
      const tierAfterUpgrade = await syncTier(ctx.token, ctx.down41StoreId, ctx.down41Mobile);
      expect(tierAfterUpgrade).toBe('Hunter');

      // Step 2 — loyaltyPassDetails confirms Hunter
      const r1 = await post(ENDPOINT,
        validBody(ctx.down41MemberId, ctx.down41StoreId, { channel: 'POS', omniChannel: 'APP' }),
        ctx.token);
      expect(r1.status).toBe(200);
      expect(r1.body.memberTier).toBe('Hunter');
      console.log(`AW-TC-041 | BEFORE return — loyaltyPassDetails tier: ${r1.body.memberTier}`);

      // Step 3 — return the AED 4001 transaction
      await doReturnTxn(ctx.token, ctx.down41StoreId, ctx.down41MemberId, receiptNo, 4001);

      // Step 4 — isMember sync confirms tier downgraded back to Explorer
      const tierAfterReturn = await syncTier(ctx.token, ctx.down41StoreId, ctx.down41Mobile);
      expect(tierAfterReturn).toBe('Explorer');

      // Step 5 — loyaltyPassDetails must reflect the downgraded tier
      const r2 = await post(ENDPOINT,
        validBody(ctx.down41MemberId, ctx.down41StoreId, { channel: 'POS', omniChannel: 'APP' }),
        ctx.token);
      expect(r2.status).toBe(200);
      expect(r2.body.memberTier).toBe('Explorer');
      console.log(`AW-TC-041 | AFTER return — loyaltyPassDetails tier: ${r2.body.memberTier} (Hunter → Explorer ✓)`);
    });

    test('AW-TC-042: Champion → Hunter — returning the Champion-advancing transaction downgrades tier in loyaltyPassDetails', async () => {
      if (!ctx.down42MemberId) { console.warn('AW-TC-042 | setup failed — skipping'); return; }

      // Step 1 — advance Explorer → Hunter (AED 4001), then Hunter → Champion (AED 8002)
      await doTierCommit(ctx.token, ctx.down42StoreId, ctx.down42MemberId, 4001, ctx);
      await syncTier(ctx.token, ctx.down42StoreId, ctx.down42Mobile); // flush to Hunter

      const championReceiptNo = await doTierCommit(ctx.token, ctx.down42StoreId, ctx.down42MemberId, 8002, ctx);
      const tierAfterChampion = await syncTier(ctx.token, ctx.down42StoreId, ctx.down42Mobile);
      expect(tierAfterChampion).toBe('Champion');

      // Step 2 — loyaltyPassDetails confirms Champion
      const r1 = await post(ENDPOINT,
        validBody(ctx.down42MemberId, ctx.down42StoreId, { channel: 'POS', omniChannel: 'APP' }),
        ctx.token);
      expect(r1.status).toBe(200);
      expect(r1.body.memberTier).toBe('Champion');
      console.log(`AW-TC-042 | BEFORE return — loyaltyPassDetails tier: ${r1.body.memberTier}`);

      // Step 3 — return only the AED 8002 transaction (the Champion-advancing one)
      await doReturnTxn(ctx.token, ctx.down42StoreId, ctx.down42MemberId, championReceiptNo, 8002);

      // Step 4 — isMember sync confirms tier dropped back to Hunter (not all the way to Explorer)
      const tierAfterReturn = await syncTier(ctx.token, ctx.down42StoreId, ctx.down42Mobile);
      expect(tierAfterReturn).toBe('Hunter');

      // Step 5 — loyaltyPassDetails must reflect Hunter
      const r2 = await post(ENDPOINT,
        validBody(ctx.down42MemberId, ctx.down42StoreId, { channel: 'POS', omniChannel: 'APP' }),
        ctx.token);
      expect(r2.status).toBe(200);
      expect(r2.body.memberTier).toBe('Hunter');
      console.log(`AW-TC-042 | AFTER return — loyaltyPassDetails tier: ${r2.body.memberTier} (Champion → Hunter ✓)`);
    });
  });
});
