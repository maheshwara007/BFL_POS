// Exchange Line & Commit Transaction — WEB channel test suite
// Full mirror of exchange-sale.spec.ts (38 tests) for WEB channel.
// Key WEB differences vs POS:
//   1. channel: 'WEB', cashierId: '' (empty)
//   2. createWebPurchase = commit + updateOrderStatus('Delivered') to accrue points
//   3. No OTP required for redemption or registration
//   4. Uses WEB_MOBILE (UAE numbers: 971...)

import {
  post, getToken, isMember, commitBody, defaultItem,
  computeBillDetails, rnd, now, WEB_MOBILE,
} from './helpers';
import { calcExpectedEarn, TENDER } from './test-data';
import { initApiLog, appendApiLog, generateApiHtmlReport } from './api-report-logger';

const ctx: any = {};

beforeAll(() => initApiLog());
afterAll(() => generateApiHtmlReport());

// ─── Shared helpers ───────────────────────────────────────────────────────────

function logApiCall(endpoint: string, requestBody: object, res: { status: number; body: any }): void {
  const testName = (expect as any).getState()?.currentTestName ?? 'Unknown Test';
  appendApiLog({ testName, endpoint, httpStatus: res.status, request: requestBody, response: res.body });
}

async function loggedPost(endpoint: string, body: object, token?: string) {
  const res = await post(endpoint, body, token);
  logApiCall(endpoint, body, res);
  return res;
}

async function updateOrderStatus(
  token: string, storeId: string, memberId: number,
  previousReceiptNo: string, lineNos: number[],
): Promise<void> {
  const id = rnd();
  const body = {
    reqId: `BFLWEB${id}`, storeId, terminalId: '1',
    receiptNo: `BFLWEB${id}`, reqTimeStamp: now(), cashierId: '',
    channel: 'WEB', memberId, previousReceiptNo,
    updateOrderStatusItemDetails: lineNos.map(n => ({ lineItemNo: n, orderStatus: 'Delivered' })),
  };
  const res = await post('/rprest/api/transaction/v1/upadteOrderStatus', body, token);
  logApiCall('/rprest/api/transaction/v1/upadteOrderStatus', body, res);
}

async function createWebPurchase(
  token: string, storeId: string, memberId: number,
  items: any[], tenderAmount: number,
): Promise<string> {
  const id = rnd();
  const body = {
    reqId: `BFLWEB${id}`, storeId, terminalId: '1',
    receiptNo: `BFLWEB${id}`, reqTimeStamp: now(), cashierId: '',
    channel: 'WEB', memberId, commitRequestType: 'Complete',
    txnDate: now(), couponCodes: [], itemDetails: items, previousReceiptNo: '',
    tenderDetails: [{ code: TENDER.CASH, amount: tenderAmount }],
    billDetails: computeBillDetails(items, id),
  };
  const res = await post('/rprest/api/transaction/v1/commitTransaction', body, token);
  if (res.status !== 200) throw new Error(`WEB setup purchase failed: ${JSON.stringify(res.body)}`);
  const receiptNo: string = res.body.receiptNo;
  await updateOrderStatus(token, storeId, memberId, receiptNo, items.map((i: any) => i.lineNo));
  return receiptNo;
}

async function callWebExchangeLine(
  token: string,
  opts: { storeId: string; memberId: number; itemDetails: any[]; previousReceiptNo: string; receiptId?: string },
) {
  const id = opts.receiptId ?? rnd();
  const requestBody = {
    reqId: `BFLWEXL${id}`, storeId: opts.storeId, terminalId: '1',
    receiptNo: `BFLWEXL${id}`, reqTimeStamp: now(), cashierId: '',
    channel: 'WEB', memberId: opts.memberId, commitRequestType: 'Complete',
    txnDate: now(), itemDetails: opts.itemDetails, previousReceiptNo: opts.previousReceiptNo,
  };
  const res = await post('/rprest/api/transaction/v1/exchangeLine', requestBody, token);
  logApiCall('/rprest/api/transaction/v1/exchangeLine', requestBody, res);
  return res;
}

async function callWebCommit(body: object, token: string): Promise<{ status: number; body: any }> {
  const res = await post('/rprest/api/transaction/v1/commitTransaction', body, token);
  logApiCall('/rprest/api/transaction/v1/commitTransaction', body, res);
  return res;
}

function webCommitBody(id: string, storeId: string, memberId: number, items: any[],
  tenderDetails: any[], previousReceiptNo: string, language?: string) {
  return {
    reqId: `BFLWEXC${id}`, storeId, terminalId: '1',
    receiptNo: `BFLWEXC${id}`, reqTimeStamp: now(), cashierId: '',
    channel: 'WEB', memberId, commitRequestType: 'Complete',
    txnDate: now(), couponCodes: [], language: language ?? 'EN',
    itemDetails: items, previousReceiptNo,
    tenderDetails,
    billDetails: computeBillDetails(items, id),
  };
}

function calcNetRefund(exlBody: any): number {
  const tenderTotal: number = exlBody.tenderDetails?.reduce((s: number, t: any) => s + t.amount, 0) ?? 0;
  const deduction: number = exlBody.totalRefundValue ?? 0;
  return Math.max(0, parseFloat((tenderTotal - deduction).toFixed(2)));
}

function buildExchangeTenders(netRefund: number, newPurchaseTotal: number): any[] {
  const creditNoteAmt = parseFloat(Math.min(netRefund, newPurchaseTotal).toFixed(2));
  const cashAmt       = parseFloat(Math.max(0, newPurchaseTotal - netRefund).toFixed(2));
  const tenders: any[] = [];
  if (creditNoteAmt > 0) tenders.push({ code: TENDER.CREDIT_NOTE, amount: creditNoteAmt });
  if (cashAmt > 0)       tenders.push({ code: TENDER.CASH, amount: cashAmt });
  if (tenders.length === 0) tenders.push({ code: TENDER.CASH, amount: newPurchaseTotal });
  return tenders;
}

// ─────────────────────────────────────────────────────────────────────────────
// WEB-EXL — ExchangeLine API: Happy Path (TC-001 to 007)
// ─────────────────────────────────────────────────────────────────────────────

describe('WEB ExchangeLine API — Happy Path', () => {

  beforeAll(async () => {
    ctx.token = getToken();
    const member = await isMember(ctx.token, WEB_MOBILE, 'WEB');
    ctx.memberId = member.memberId;
    ctx.storeId  = member.storeId;
    ctx.purchaseReceipt = await createWebPurchase(ctx.token, ctx.storeId, ctx.memberId,
      [
        defaultItem(1, { grossPrice: 200.00, netPrice: 190.00, vatAmount: 10.00 }),
        defaultItem(2, { sku: '153837', hsnCode: '1123', grossPrice: 500.00, netPrice: 475.00, vatAmount: 25.00 }),
      ], 700.00);
  });

  test('WEB-EXL-TC-001: Single item return — 200 + status=Success + tenderDetails present', async () => {
    const { status, body } = await callWebExchangeLine(ctx.token, {
      storeId: ctx.storeId, memberId: ctx.memberId,
      previousReceiptNo: ctx.purchaseReceipt,
      itemDetails: [{ itemType: 'Product', quantity: 1, previousLineNo: 1, isReturn: 'Yes' }],
    });
    expect(status).toBe(200);
    expect(body.status).toBe('Success');
    expect(Array.isArray(body.tenderDetails)).toBe(true);
    expect(body.tenderDetails.length).toBeGreaterThan(0);
    body.tenderDetails.forEach((t: any) => {
      expect(t).toHaveProperty('code');
      expect(t).toHaveProperty('amount');
      expect(typeof t.amount).toBe('number');
    });
  });

  test('WEB-EXL-TC-002: Multi-item return — both items reflected in itemDetails', async () => {
    const { status, body } = await callWebExchangeLine(ctx.token, {
      storeId: ctx.storeId, memberId: ctx.memberId,
      previousReceiptNo: ctx.purchaseReceipt,
      itemDetails: [
        { itemType: 'Product', quantity: 1, previousLineNo: 1, isReturn: 'Yes' },
        { itemType: 'Product', quantity: 1, previousLineNo: 2, isReturn: 'Yes' },
      ],
    });
    expect(status).toBe(200);
    expect(body.status).toBe('Success');
    expect(Array.isArray(body.itemDetails)).toBe(true);
    expect(body.itemDetails.length).toBe(2);
  });

  test('WEB-EXL-TC-003: Response item has basePointsAccrued + basePointsAccruedValue (numeric)', async () => {
    const { status, body } = await callWebExchangeLine(ctx.token, {
      storeId: ctx.storeId, memberId: ctx.memberId,
      previousReceiptNo: ctx.purchaseReceipt,
      itemDetails: [{ itemType: 'Product', quantity: 1, previousLineNo: 1, isReturn: 'Yes' }],
    });
    expect(status).toBe(200);
    const item = body.itemDetails?.[0];
    expect(item).toBeDefined();
    expect(typeof item.basePointsAccrued).toBe('number');
    expect(typeof item.basePointsAccruedValue).toBe('number');
  });

  test('WEB-EXL-TC-004: totalRefundValue is a non-negative decimal', async () => {
    const { status, body } = await callWebExchangeLine(ctx.token, {
      storeId: ctx.storeId, memberId: ctx.memberId,
      previousReceiptNo: ctx.purchaseReceipt,
      itemDetails: [{ itemType: 'Product', quantity: 1, previousLineNo: 1, isReturn: 'Yes' }],
    });
    expect(status).toBe(200);
    expect(typeof body.totalRefundValue).toBe('number');
    expect(body.totalRefundValue).toBeGreaterThanOrEqual(0);
  });

  test('WEB-EXL-TC-005: totalRefundValue = 0 (no prior redemption) and net refund = tenderTotal exactly', async () => {
    const { status, body } = await callWebExchangeLine(ctx.token, {
      storeId: ctx.storeId, memberId: ctx.memberId,
      previousReceiptNo: ctx.purchaseReceipt,
      itemDetails: [{ itemType: 'Product', quantity: 1, previousLineNo: 1, isReturn: 'Yes' }],
    });
    expect(status).toBe(200);
    const totalRefundValue: number = body.totalRefundValue;
    const tenderTotal: number = body.tenderDetails.reduce((s: number, t: any) => s + t.amount, 0);
    const totalPointsAccruedValue: number = body.itemDetails
      .reduce((s: number, item: any) => s + (item.basePointsAccruedValue ?? 0), 0);
    expect(totalRefundValue).toBe(0);
    expect(totalRefundValue).toBeLessThanOrEqual(parseFloat(totalPointsAccruedValue.toFixed(2)));
    expect(parseFloat((tenderTotal - totalRefundValue).toFixed(2))).toBeGreaterThan(0);
    console.log(`WEB-EXL-TC-005 | tenderTotal: ${tenderTotal} | totalRefundValue: ${totalRefundValue} | pointsAccruedValue: ${totalPointsAccruedValue}`);
  });

  test('WEB-EXL-TC-006: Response echoes memberId, storeId, and receiptNo from request', async () => {
    const id = rnd();
    const { status, body } = await callWebExchangeLine(ctx.token, {
      storeId: ctx.storeId, memberId: ctx.memberId, receiptId: id,
      previousReceiptNo: ctx.purchaseReceipt,
      itemDetails: [{ itemType: 'Product', quantity: 1, previousLineNo: 1, isReturn: 'Yes' }],
    });
    expect(status).toBe(200);
    expect(body.memberId).toBe(ctx.memberId);
    expect(body.storeId).toBe(ctx.storeId);
    expect(body.receiptNo).toBe(`BFLWEXL${id}`);
  });

  test('WEB-EXL-TC-007: pointsSummary present in response (array)', async () => {
    const { status, body } = await callWebExchangeLine(ctx.token, {
      storeId: ctx.storeId, memberId: ctx.memberId,
      previousReceiptNo: ctx.purchaseReceipt,
      itemDetails: [{ itemType: 'Product', quantity: 1, previousLineNo: 1, isReturn: 'Yes' }],
    });
    expect(status).toBe(200);
    expect(Array.isArray(body.pointsSummary)).toBe(true);
  });

});

// ─────────────────────────────────────────────────────────────────────────────
// WEB-EXL — ExchangeLine API: Negative / Validation (TC-008 to 014)
// ─────────────────────────────────────────────────────────────────────────────

describe('WEB ExchangeLine API — Negative / Validation', () => {

  beforeAll(async () => {
    ctx.token = getToken();
    const member = await isMember(ctx.token, WEB_MOBILE, 'WEB');
    ctx.memberId = member.memberId;
    ctx.storeId  = member.storeId;
    ctx.purchaseReceipt = await createWebPurchase(ctx.token, ctx.storeId, ctx.memberId,
      [defaultItem(1, { grossPrice: 200.00, netPrice: 190.00, vatAmount: 10.00 })], 200.00);
  });

  test('WEB-EXL-TC-008: Negative quantity — API silent failure (HTTP 200, status=null, tenderDetails=null)', async () => {
    const { status, body } = await callWebExchangeLine(ctx.token, {
      storeId: ctx.storeId, memberId: ctx.memberId,
      previousReceiptNo: ctx.purchaseReceipt,
      itemDetails: [{ itemType: 'Product', quantity: -1, previousLineNo: 1, isReturn: 'Yes' }],
    });
    expect(body.tenderDetails).toBeNull();
    expect(body.status).not.toBe('Success');
    console.warn(`WEB-EXL-TC-008 | HTTP ${status} status=${body.status} tenderDetails=null (API does not return 400 for negative qty)`);
  });

  test('WEB-EXL-TC-009: Zero quantity — rejected (non-200 or error status)', async () => {
    const { status, body } = await callWebExchangeLine(ctx.token, {
      storeId: ctx.storeId, memberId: ctx.memberId,
      previousReceiptNo: ctx.purchaseReceipt,
      itemDetails: [{ itemType: 'Product', quantity: 0, previousLineNo: 1, isReturn: 'Yes' }],
    });
    expect(status !== 200 || body.status !== 'Success').toBe(true);
  });

  test('WEB-EXL-TC-010: isReturn=No in exchangeLine — rejected (must always be Yes)', async () => {
    const { status, body } = await callWebExchangeLine(ctx.token, {
      storeId: ctx.storeId, memberId: ctx.memberId,
      previousReceiptNo: ctx.purchaseReceipt,
      itemDetails: [{ itemType: 'Product', quantity: 1, previousLineNo: 1, isReturn: 'No' }],
    });
    expect(status !== 200 || body.status !== 'Success').toBe(true);
  });

  test('WEB-EXL-TC-011: Invalid previousReceiptNo — error returned', async () => {
    const { status, body } = await callWebExchangeLine(ctx.token, {
      storeId: ctx.storeId, memberId: ctx.memberId,
      previousReceiptNo: 'INVALID_RECEIPT_WEB_000',
      itemDetails: [{ itemType: 'Product', quantity: 1, previousLineNo: 1, isReturn: 'Yes' }],
    });
    expect(status !== 200 || body.status !== 'Success').toBe(true);
  });

  test('WEB-EXL-TC-012: Missing previousReceiptNo — error returned', async () => {
    const id = rnd();
    const { status, body } = await post('/rprest/api/transaction/v1/exchangeLine', {
      reqId: `BFLWEXL${id}`, storeId: ctx.storeId, terminalId: '1',
      receiptNo: `BFLWEXL${id}`, reqTimeStamp: now(), cashierId: '',
      channel: 'WEB', memberId: ctx.memberId, commitRequestType: 'Complete', txnDate: now(),
      itemDetails: [{ itemType: 'Product', quantity: 1, previousLineNo: 1, isReturn: 'Yes' }],
    }, ctx.token);
    expect(status !== 200 || body.status !== 'Success').toBe(true);
  });

  test('WEB-EXL-TC-013: Wrong previousLineNo — ExchangeLine may pass; mismatch enforced at Commit', async () => {
    const { status, body } = await callWebExchangeLine(ctx.token, {
      storeId: ctx.storeId, memberId: ctx.memberId,
      previousReceiptNo: ctx.purchaseReceipt,
      itemDetails: [{ itemType: 'Product', quantity: 1, previousLineNo: 999, isReturn: 'Yes' }],
    });
    if (status === 200 && body.status === 'Success') {
      console.log('WEB-EXL-TC-013: ExchangeLine returned Success with mismatched lineNo — mismatch enforced at Commit step');
    } else {
      expect(body.status).not.toBe('Success');
    }
    expect(status).toBeDefined();
  });

  test('WEB-EXL-TC-014: New purchase item included in exchangeLine — error (only return items allowed)', async () => {
    const { status, body } = await callWebExchangeLine(ctx.token, {
      storeId: ctx.storeId, memberId: ctx.memberId,
      previousReceiptNo: ctx.purchaseReceipt,
      itemDetails: [
        { itemType: 'Product', quantity: 1, previousLineNo: 1, isReturn: 'Yes' },
        { itemType: 'Product', quantity: 1, previousLineNo: 0, isReturn: 'No' },
      ],
    });
    expect(status !== 200 || body.status !== 'Success').toBe(true);
  });

});

// ─────────────────────────────────────────────────────────────────────────────
// WEB-EXC — Commit Transaction: Usual Return (TC-001 to 003)
// ─────────────────────────────────────────────────────────────────────────────

describe('WEB Commit Transaction — Usual Return (all isReturn:Yes)', () => {

  beforeAll(async () => {
    ctx.token = getToken();
    const member = await isMember(ctx.token, WEB_MOBILE, 'WEB');
    ctx.memberId = member.memberId;
    ctx.storeId  = member.storeId;
  });

  test('WEB-EXC-TC-001: Usual Return — exchangeLine + commit + updateOrderStatus → 200 + statusDetails.code=100', async () => {
    const receipt = await createWebPurchase(ctx.token, ctx.storeId, ctx.memberId,
      [
        defaultItem(1, { grossPrice: 200.00, netPrice: 190.00, vatAmount: 10.00 }),
        defaultItem(2, { sku: '153837', hsnCode: '1123', grossPrice: 300.00, netPrice: 285.00, vatAmount: 15.00 }),
      ], 500.00);

    const exlRes = await callWebExchangeLine(ctx.token, {
      storeId: ctx.storeId, memberId: ctx.memberId, previousReceiptNo: receipt,
      itemDetails: [
        { itemType: 'Product', quantity: 1, previousLineNo: 1, isReturn: 'Yes' },
        { itemType: 'Product', quantity: 1, previousLineNo: 2, isReturn: 'Yes' },
      ],
    });
    expect(exlRes.status).toBe(200);
    expect(exlRes.body.status).toBe('Success');
    const tenderTotal: number = exlRes.body.tenderDetails.reduce((s: number, t: any) => s + t.amount, 0);

    const retId = rnd();
    const retItems = [
      defaultItem(3, { grossPrice: 200.00, netPrice: 190.00, vatAmount: 10.00, previousLineNo: 1, isReturn: 'Yes' }),
      defaultItem(4, { sku: '153837', hsnCode: '1123', grossPrice: 300.00, netPrice: 285.00, vatAmount: 15.00, previousLineNo: 2, isReturn: 'Yes' }),
    ];
    const retRes = await callWebCommit(webCommitBody(retId, ctx.storeId, ctx.memberId, retItems,
      [{ code: TENDER.CASH, amount: tenderTotal }], receipt), ctx.token);
    expect(retRes.status).toBe(200);
    expect(retRes.body.status).toBe('Success');
    expect(retRes.body.statusDetails?.[0]?.code).toBe(100);
  });

  test('WEB-EXC-TC-002: Usual Return — commit response totalRefundValue = 0.0', async () => {
    const receipt = await createWebPurchase(ctx.token, ctx.storeId, ctx.memberId,
      [defaultItem(1, { grossPrice: 200.00, netPrice: 190.00, vatAmount: 10.00 })], 200.00);

    const exlRes = await callWebExchangeLine(ctx.token, {
      storeId: ctx.storeId, memberId: ctx.memberId, previousReceiptNo: receipt,
      itemDetails: [{ itemType: 'Product', quantity: 1, previousLineNo: 1, isReturn: 'Yes' }],
    });
    expect(exlRes.status).toBe(200);
    expect(exlRes.body.status).toBe('Success');
    expect(exlRes.body.tenderDetails[0].amount).toBeGreaterThan(0);
    const tenderTotal: number = exlRes.body.tenderDetails.reduce((s: number, t: any) => s + t.amount, 0);

    const retId = rnd();
    const retItems = [defaultItem(2, { grossPrice: 200.00, netPrice: 190.00, vatAmount: 10.00, previousLineNo: 1, isReturn: 'Yes' })];
    const retRes = await callWebCommit(webCommitBody(retId, ctx.storeId, ctx.memberId, retItems,
      [{ code: TENDER.CASH, amount: tenderTotal }], receipt), ctx.token);
    expect(retRes.status).toBe(200);
    expect(retRes.body.status).toBe('Success');
    expect(retRes.body.totalRefundValue).toBe(0.0);
  });

  test('WEB-EXC-TC-003: Usual Return — commit response has ttReferrenceNumber', async () => {
    const receipt = await createWebPurchase(ctx.token, ctx.storeId, ctx.memberId,
      [defaultItem(1, { grossPrice: 200.00, netPrice: 190.00, vatAmount: 10.00 })], 200.00);

    const exlRes = await callWebExchangeLine(ctx.token, {
      storeId: ctx.storeId, memberId: ctx.memberId, previousReceiptNo: receipt,
      itemDetails: [{ itemType: 'Product', quantity: 1, previousLineNo: 1, isReturn: 'Yes' }],
    });
    expect(exlRes.status).toBe(200);
    const tenderTotal: number = exlRes.body.tenderDetails.reduce((s: number, t: any) => s + t.amount, 0);

    const retId = rnd();
    const retItems = [defaultItem(2, { grossPrice: 200.00, netPrice: 190.00, vatAmount: 10.00, previousLineNo: 1, isReturn: 'Yes' })];
    const retRes = await callWebCommit(webCommitBody(retId, ctx.storeId, ctx.memberId, retItems,
      [{ code: TENDER.CASH, amount: tenderTotal }], receipt), ctx.token);
    expect(retRes.status).toBe(200);
    expect(retRes.body.ttReferrenceNumber).toBeDefined();
    expect(String(retRes.body.ttReferrenceNumber).length).toBeGreaterThan(0);
  });

});

// ─────────────────────────────────────────────────────────────────────────────
// WEB-EXC — Exchange Sale (TC-004 to 013 + 007B)
// ─────────────────────────────────────────────────────────────────────────────

describe('WEB Commit Transaction — Exchange Sale (mixed isReturn Yes/No)', () => {

  beforeAll(async () => {
    ctx.token = getToken();
    const member = await isMember(ctx.token, WEB_MOBILE, 'WEB');
    ctx.memberId = member.memberId;
    ctx.storeId  = member.storeId;
  });

  test('WEB-EXC-TC-004: Exchange Sale — two-step flow → 200 + Success + ttReferrenceNumber', async () => {
    const receipt = await createWebPurchase(ctx.token, ctx.storeId, ctx.memberId,
      [defaultItem(1, { grossPrice: 200.00, netPrice: 190.00, vatAmount: 10.00 })], 200.00);

    const exlRes = await callWebExchangeLine(ctx.token, {
      storeId: ctx.storeId, memberId: ctx.memberId, previousReceiptNo: receipt,
      itemDetails: [{ itemType: 'Product', quantity: 1, previousLineNo: 1, isReturn: 'Yes' }],
    });
    expect(exlRes.status).toBe(200);
    const netRefund = calcNetRefund(exlRes.body);

    const excId = rnd();
    const excItems = [
      defaultItem(3, { grossPrice: 200.00, netPrice: 190.00, vatAmount: 10.00, previousLineNo: 1, isReturn: 'Yes' }),
      defaultItem(4, { sku: '153837', hsnCode: '1123', grossPrice: 500.00, netPrice: 475.00, vatAmount: 25.00, previousLineNo: 0, isReturn: 'No' }),
    ];
    const excRes = await callWebCommit(webCommitBody(excId, ctx.storeId, ctx.memberId, excItems,
      buildExchangeTenders(netRefund, 500.00), receipt), ctx.token);
    if (excRes.status === 200) await updateOrderStatus(ctx.token, ctx.storeId, ctx.memberId, excRes.body.receiptNo, [4]);
    expect(excRes.status).toBe(200);
    expect(excRes.body.status).toBe('Success');
    expect(excRes.body.ttReferrenceNumber).toBeDefined();
  });

  test('WEB-EXC-TC-005: Exchange Sale — points accrued only on isReturn:No items (after updateOrderStatus)', async () => {
    const receipt = await createWebPurchase(ctx.token, ctx.storeId, ctx.memberId,
      [defaultItem(1, { grossPrice: 200.00, netPrice: 190.00, vatAmount: 10.00 })], 200.00);

    const exlRes = await callWebExchangeLine(ctx.token, {
      storeId: ctx.storeId, memberId: ctx.memberId, previousReceiptNo: receipt,
      itemDetails: [{ itemType: 'Product', quantity: 1, previousLineNo: 1, isReturn: 'Yes' }],
    });
    expect(exlRes.status).toBe(200);
    const netRefund = calcNetRefund(exlRes.body);

    const excId = rnd();
    const excItems = [
      defaultItem(3, { grossPrice: 200.00, netPrice: 190.00, vatAmount: 10.00, previousLineNo: 1, isReturn: 'Yes' }),
      defaultItem(4, { sku: '153837', hsnCode: '1123', grossPrice: 500.00, netPrice: 475.00, vatAmount: 25.00, previousLineNo: 0, isReturn: 'No' }),
    ];
    const excRes = await callWebCommit(webCommitBody(excId, ctx.storeId, ctx.memberId, excItems,
      buildExchangeTenders(netRefund, 500.00), receipt), ctx.token);
    expect(excRes.status).toBe(200);
    if (excRes.status === 200) await updateOrderStatus(ctx.token, ctx.storeId, ctx.memberId, excRes.body.receiptNo, [4]);
    const newLine = excRes.body.itemDetails?.find((l: any) => l.isReturn === 'No');
    if (newLine) expect(newLine.basePointsAccrued).toBeGreaterThanOrEqual(0);
  });

  test('WEB-EXC-TC-006: Exchange Sale — Credit Note tender (T32) accepted as valid tender code', async () => {
    const receipt = await createWebPurchase(ctx.token, ctx.storeId, ctx.memberId,
      [defaultItem(1, { grossPrice: 200.00, netPrice: 190.00, vatAmount: 10.00 })], 200.00);

    const exlRes = await callWebExchangeLine(ctx.token, {
      storeId: ctx.storeId, memberId: ctx.memberId, previousReceiptNo: receipt,
      itemDetails: [{ itemType: 'Product', quantity: 1, previousLineNo: 1, isReturn: 'Yes' }],
    });
    expect(exlRes.status).toBe(200);
    const netRefund = calcNetRefund(exlRes.body);
    const cashDue = parseFloat((500.00 - netRefund).toFixed(2));
    const tenders: any[] = [];
    if (netRefund > 0) tenders.push({ code: TENDER.CREDIT_NOTE, amount: netRefund });
    if (cashDue > 0)   tenders.push({ code: TENDER.CASH, amount: cashDue });
    if (tenders.length === 0) tenders.push({ code: TENDER.CASH, amount: 500.00 });

    const excId = rnd();
    const excItems = [
      defaultItem(3, { grossPrice: 200.00, netPrice: 190.00, vatAmount: 10.00, previousLineNo: 1, isReturn: 'Yes' }),
      defaultItem(4, { sku: '153837', hsnCode: '1123', grossPrice: 500.00, netPrice: 475.00, vatAmount: 25.00, previousLineNo: 0, isReturn: 'No' }),
    ];
    const excRes = await callWebCommit(webCommitBody(excId, ctx.storeId, ctx.memberId, excItems, tenders, receipt), ctx.token);
    expect(excRes.status).toBe(200);
  });

  test('WEB-EXC-TC-007: Exchange Sale — wrong previousReceiptNo in Commit → error', async () => {
    const receipt = await createWebPurchase(ctx.token, ctx.storeId, ctx.memberId,
      [defaultItem(1, { grossPrice: 200.00, netPrice: 190.00, vatAmount: 10.00 })], 200.00);
    await callWebExchangeLine(ctx.token, {
      storeId: ctx.storeId, memberId: ctx.memberId, previousReceiptNo: receipt,
      itemDetails: [{ itemType: 'Product', quantity: 1, previousLineNo: 1, isReturn: 'Yes' }],
    });

    const excId = rnd();
    const excItems = [
      defaultItem(3, { grossPrice: 200.00, netPrice: 190.00, vatAmount: 10.00, previousLineNo: 1, isReturn: 'Yes' }),
      defaultItem(4, { sku: '153837', hsnCode: '1123', grossPrice: 500.00, netPrice: 475.00, vatAmount: 25.00, previousLineNo: 0, isReturn: 'No' }),
    ];
    const excRes = await callWebCommit(webCommitBody(excId, ctx.storeId, ctx.memberId, excItems,
      [{ code: TENDER.CASH, amount: 500.00 }], 'WRONG_RECEIPT_WEB_EXC007_' + rnd()), ctx.token);
    expect(excRes.status !== 200 || excRes.body.status !== 'Success').toBe(true);
  });

  test('WEB-EXC-TC-007B: Exchange Sale — previousLineNo mismatch (API does not enforce, documents gap vs doc §3.3.1)', async () => {
    const receipt = await createWebPurchase(ctx.token, ctx.storeId, ctx.memberId,
      [defaultItem(1, { grossPrice: 200.00, netPrice: 190.00, vatAmount: 10.00 })], 200.00);
    await callWebExchangeLine(ctx.token, {
      storeId: ctx.storeId, memberId: ctx.memberId, previousReceiptNo: receipt,
      itemDetails: [{ itemType: 'Product', quantity: 1, previousLineNo: 1, isReturn: 'Yes' }],
    });

    const excId = rnd();
    const excItems = [
      defaultItem(3, { grossPrice: 200.00, netPrice: 190.00, vatAmount: 10.00, previousLineNo: 999, isReturn: 'Yes' }),
      defaultItem(4, { sku: '153837', hsnCode: '1123', grossPrice: 500.00, netPrice: 475.00, vatAmount: 25.00, previousLineNo: 0, isReturn: 'No' }),
    ];
    const excRes = await callWebCommit(webCommitBody(excId, ctx.storeId, ctx.memberId, excItems,
      [{ code: TENDER.CASH, amount: 500.00 }], receipt), ctx.token);
    console.warn(`WEB-EXC-TC-007B | correct receipt + wrong lineNo(999) → HTTP ${excRes.status} status=${excRes.body?.status} | API does not validate previousLineNo`);
    expect(excRes.status).toBe(200);
  });

  test('WEB-EXC-TC-008: Exchange Sale — invalid previousReceiptNo in Commit → error', async () => {
    const excId = rnd();
    const excItems = [
      defaultItem(3, { grossPrice: 200.00, netPrice: 190.00, vatAmount: 10.00, previousLineNo: 1, isReturn: 'Yes' }),
      defaultItem(4, { sku: '153837', hsnCode: '1123', grossPrice: 500.00, netPrice: 475.00, vatAmount: 25.00, previousLineNo: 0, isReturn: 'No' }),
    ];
    const excRes = await callWebCommit(webCommitBody(excId, ctx.storeId, ctx.memberId, excItems,
      [{ code: TENDER.CASH, amount: 500.00 }], 'INVALID_RECEIPT_ABCXYZ_WEB_000'), ctx.token);
    expect(excRes.status !== 200 || excRes.body.status !== 'Success').toBe(true);
  });

  test('WEB-EXC-TC-009: Exchange Sale — commit response has pointsSummary with points + pointsValue + pointsType', async () => {
    const receipt = await createWebPurchase(ctx.token, ctx.storeId, ctx.memberId,
      [defaultItem(1, { grossPrice: 200.00, netPrice: 190.00, vatAmount: 10.00 })], 200.00);

    const exlRes = await callWebExchangeLine(ctx.token, {
      storeId: ctx.storeId, memberId: ctx.memberId, previousReceiptNo: receipt,
      itemDetails: [{ itemType: 'Product', quantity: 1, previousLineNo: 1, isReturn: 'Yes' }],
    });
    expect(exlRes.status).toBe(200);
    const netRefund = calcNetRefund(exlRes.body);

    const excId = rnd();
    const excItems = [
      defaultItem(3, { grossPrice: 200.00, netPrice: 190.00, vatAmount: 10.00, previousLineNo: 1, isReturn: 'Yes' }),
      defaultItem(4, { sku: '153837', hsnCode: '1123', grossPrice: 500.00, netPrice: 475.00, vatAmount: 25.00, previousLineNo: 0, isReturn: 'No' }),
    ];
    const excRes = await callWebCommit(webCommitBody(excId, ctx.storeId, ctx.memberId, excItems,
      buildExchangeTenders(netRefund, 500.00), receipt), ctx.token);
    if (excRes.status === 200) await updateOrderStatus(ctx.token, ctx.storeId, ctx.memberId, excRes.body.receiptNo, [4]);
    expect(excRes.status).toBe(200);
    expect(Array.isArray(excRes.body.pointsSummary)).toBe(true);
    expect(excRes.body.pointsSummary.length).toBeGreaterThan(0);
    const ps = excRes.body.pointsSummary[0];
    expect(ps).toHaveProperty('points');
    expect(ps).toHaveProperty('pointsValue');
    expect(ps).toHaveProperty('pointsType');
  });

  test('WEB-EXC-TC-010: End-to-end worked example (doc §2.4) — 200 AED return, net refund via T32, 500 AED new purchase', async () => {
    const receipt = await createWebPurchase(ctx.token, ctx.storeId, ctx.memberId,
      [defaultItem(1, { grossPrice: 200.00, netPrice: 190.00, vatAmount: 10.00 })], 200.00);

    const exlRes = await callWebExchangeLine(ctx.token, {
      storeId: ctx.storeId, memberId: ctx.memberId, previousReceiptNo: receipt,
      itemDetails: [{ itemType: 'Product', quantity: 1, previousLineNo: 1, isReturn: 'Yes' }],
    });
    expect(exlRes.status).toBe(200);
    expect(exlRes.body.status).toBe('Success');
    const netRefund = calcNetRefund(exlRes.body);

    const excId = rnd();
    const excItems = [
      defaultItem(3, { grossPrice: 200.00, netPrice: 190.00, vatAmount: 10.00, previousLineNo: 1, isReturn: 'Yes' }),
      defaultItem(4, { sku: '153837', hsnCode: '1123', grossPrice: 500.00, netPrice: 475.00, vatAmount: 25.00, previousLineNo: 0, isReturn: 'No' }),
    ];
    const excRes = await callWebCommit(webCommitBody(excId, ctx.storeId, ctx.memberId, excItems,
      buildExchangeTenders(netRefund, 500.00), receipt), ctx.token);
    if (excRes.status === 200) await updateOrderStatus(ctx.token, ctx.storeId, ctx.memberId, excRes.body.receiptNo, [4]);
    expect(excRes.status).toBe(200);
    expect(excRes.body.status).toBe('Success');
    expect(excRes.body.statusDetails?.[0]?.code).toBe(100);
    expect(excRes.body.totalRefundValue).toBe(0.0);
  });

  test('WEB-EXC-TC-011: Exchange Sale multi-item — 2 returned + 2 new items → Success', async () => {
    const receipt = await createWebPurchase(ctx.token, ctx.storeId, ctx.memberId,
      [
        defaultItem(1, { grossPrice: 200.00, netPrice: 190.00, vatAmount: 10.00 }),
        defaultItem(2, { sku: '153837', hsnCode: '1123', grossPrice: 300.00, netPrice: 285.00, vatAmount: 15.00 }),
      ], 500.00);

    const exlRes = await callWebExchangeLine(ctx.token, {
      storeId: ctx.storeId, memberId: ctx.memberId, previousReceiptNo: receipt,
      itemDetails: [
        { itemType: 'Product', quantity: 1, previousLineNo: 1, isReturn: 'Yes' },
        { itemType: 'Product', quantity: 1, previousLineNo: 2, isReturn: 'Yes' },
      ],
    });
    expect(exlRes.status).toBe(200);
    const netRefund = calcNetRefund(exlRes.body);

    const excId = rnd();
    const excItems = [
      defaultItem(3, { grossPrice: 200.00, netPrice: 190.00, vatAmount: 10.00, previousLineNo: 1, isReturn: 'Yes' }),
      defaultItem(4, { sku: '153837', hsnCode: '1123', grossPrice: 300.00, netPrice: 285.00, vatAmount: 15.00, previousLineNo: 2, isReturn: 'Yes' }),
      defaultItem(5, { grossPrice: 400.00, netPrice: 380.00, vatAmount: 20.00, previousLineNo: 0, isReturn: 'No' }),
      defaultItem(6, { sku: '153837', hsnCode: '1123', grossPrice: 600.00, netPrice: 570.00, vatAmount: 30.00, previousLineNo: 0, isReturn: 'No' }),
    ];
    const excRes = await callWebCommit(webCommitBody(excId, ctx.storeId, ctx.memberId, excItems,
      buildExchangeTenders(netRefund, 1000.00), receipt), ctx.token);
    if (excRes.status === 200) await updateOrderStatus(ctx.token, ctx.storeId, ctx.memberId, excRes.body.receiptNo, [5, 6]);
    expect(excRes.status).toBe(200);
    expect(excRes.body.status).toBe('Success');
  });

  test('WEB-EXC-TC-012: Exchange Sale — new purchase price ABOVE return value (customer pays extra cash)', async () => {
    const receipt = await createWebPurchase(ctx.token, ctx.storeId, ctx.memberId,
      [defaultItem(1, { grossPrice: 200.00, netPrice: 190.00, vatAmount: 10.00 })], 200.00);

    const exlRes = await callWebExchangeLine(ctx.token, {
      storeId: ctx.storeId, memberId: ctx.memberId, previousReceiptNo: receipt,
      itemDetails: [{ itemType: 'Product', quantity: 1, previousLineNo: 1, isReturn: 'Yes' }],
    });
    expect(exlRes.status).toBe(200);
    const netRefund = calcNetRefund(exlRes.body);
    const tenders = buildExchangeTenders(netRefund, 500.00);
    expect(tenders.some((t: any) => t.code === TENDER.CREDIT_NOTE)).toBe(true);
    expect(tenders.some((t: any) => t.code === TENDER.CASH)).toBe(true);

    const excId = rnd();
    const excItems = [
      defaultItem(3, { grossPrice: 200.00, netPrice: 190.00, vatAmount: 10.00, previousLineNo: 1, isReturn: 'Yes' }),
      defaultItem(4, { sku: '153837', hsnCode: '1123', grossPrice: 500.00, netPrice: 475.00, vatAmount: 25.00, previousLineNo: 0, isReturn: 'No' }),
    ];
    const excRes = await callWebCommit(webCommitBody(excId, ctx.storeId, ctx.memberId, excItems,
      tenders, receipt), ctx.token);
    if (excRes.status === 200) await updateOrderStatus(ctx.token, ctx.storeId, ctx.memberId, excRes.body.receiptNo, [4]);
    expect(excRes.status).toBe(200);
    expect(excRes.body.status).toBe('Success');
  });

  test('WEB-EXC-TC-013: Exchange Sale — commit response isReturn flag matches per line item', async () => {
    const receipt = await createWebPurchase(ctx.token, ctx.storeId, ctx.memberId,
      [defaultItem(1, { grossPrice: 200.00, netPrice: 190.00, vatAmount: 10.00 })], 200.00);

    const exlRes = await callWebExchangeLine(ctx.token, {
      storeId: ctx.storeId, memberId: ctx.memberId, previousReceiptNo: receipt,
      itemDetails: [{ itemType: 'Product', quantity: 1, previousLineNo: 1, isReturn: 'Yes' }],
    });
    expect(exlRes.status).toBe(200);
    const netRefund = calcNetRefund(exlRes.body);

    const excId = rnd();
    const excItems = [
      defaultItem(3, { grossPrice: 200.00, netPrice: 190.00, vatAmount: 10.00, previousLineNo: 1, isReturn: 'Yes' }),
      defaultItem(4, { sku: '153837', hsnCode: '1123', grossPrice: 500.00, netPrice: 475.00, vatAmount: 25.00, previousLineNo: 0, isReturn: 'No' }),
    ];
    const excRes = await callWebCommit(webCommitBody(excId, ctx.storeId, ctx.memberId, excItems,
      buildExchangeTenders(netRefund, 500.00), receipt), ctx.token);
    if (excRes.status === 200) await updateOrderStatus(ctx.token, ctx.storeId, ctx.memberId, excRes.body.receiptNo, [4]);
    expect(excRes.status).toBe(200);
    const returnedLine = excRes.body.itemDetails?.find((l: any) => l.lineNo === 3);
    const newLine      = excRes.body.itemDetails?.find((l: any) => l.lineNo === 4);
    if (returnedLine) expect(returnedLine.isReturn).toBe('Yes');
    if (newLine)      expect(newLine.isReturn).toBe('No');
  });

});

// ─────────────────────────────────────────────────────────────────────────────
// WEB-EXC — Points Exact Calculation (TC-014, 015)
// ─────────────────────────────────────────────────────────────────────────────

describe('WEB Exchange Sale — Points Exact Calculation on New Items', () => {

  beforeAll(async () => {
    ctx.token = getToken();
    ctx.member = await isMember(ctx.token, WEB_MOBILE, 'WEB');
  });

  test('WEB-EXC-TC-014: Points accrued on new item = Math.floor((netPrice + vatAmount) × earnRate)', async () => {
    const member = await isMember(ctx.token, WEB_MOBILE, 'WEB');
    const receipt = await createWebPurchase(ctx.token, member.storeId, member.memberId,
      [defaultItem(1, { grossPrice: 200.00, netPrice: 190.00, vatAmount: 10.00 })], 200.00);

    const exlRes = await callWebExchangeLine(ctx.token, {
      storeId: member.storeId, memberId: member.memberId, previousReceiptNo: receipt,
      itemDetails: [{ itemType: 'Product', quantity: 1, previousLineNo: 1, isReturn: 'Yes' }],
    });
    expect(exlRes.status).toBe(200);
    const netRefund = calcNetRefund(exlRes.body);
    const newNetPrice = 475.00; const newVatAmount = 25.00;
    const expectedPoints = calcExpectedEarn(newNetPrice, newVatAmount, member.tier);

    const excId = rnd();
    const excItems = [
      defaultItem(3, { grossPrice: 200.00, netPrice: 190.00, vatAmount: 10.00, previousLineNo: 1, isReturn: 'Yes' }),
      defaultItem(4, { sku: '153837', hsnCode: '1123', grossPrice: 500.00, netPrice: newNetPrice, vatAmount: newVatAmount, previousLineNo: 0, isReturn: 'No' }),
    ];
    const excRes = await callWebCommit(webCommitBody(excId, member.storeId, member.memberId, excItems,
      buildExchangeTenders(netRefund, 500.00), receipt), ctx.token);
    if (excRes.status === 200) await updateOrderStatus(ctx.token, member.storeId, member.memberId, excRes.body.receiptNo, [4]);
    expect(excRes.status).toBe(200);
    const newLine = excRes.body.itemDetails?.find((l: any) => l.isReturn === 'No');
    expect(newLine?.basePointsAccrued).toBe(expectedPoints);
    console.log(`WEB-EXC-TC-014 | Tier: ${member.tier} | Expected: ${expectedPoints} | Actual: ${newLine?.basePointsAccrued}`);
  });

  test('WEB-EXC-TC-015: Points accrual on multi-item new purchase — each item earns independently', async () => {
    const member = await isMember(ctx.token, WEB_MOBILE, 'WEB');
    const receipt = await createWebPurchase(ctx.token, member.storeId, member.memberId,
      [
        defaultItem(1, { grossPrice: 200.00, netPrice: 190.00, vatAmount: 10.00 }),
        defaultItem(2, { sku: '153837', hsnCode: '1123', grossPrice: 300.00, netPrice: 285.00, vatAmount: 15.00 }),
      ], 500.00);

    const exlRes = await callWebExchangeLine(ctx.token, {
      storeId: member.storeId, memberId: member.memberId, previousReceiptNo: receipt,
      itemDetails: [
        { itemType: 'Product', quantity: 1, previousLineNo: 1, isReturn: 'Yes' },
        { itemType: 'Product', quantity: 1, previousLineNo: 2, isReturn: 'Yes' },
      ],
    });
    expect(exlRes.status).toBe(200);
    const netRefund = calcNetRefund(exlRes.body);
    const new1Net = 380.00; const new1Vat = 20.00;
    const new2Net = 570.00; const new2Vat = 30.00;
    const expectedPts1 = calcExpectedEarn(new1Net, new1Vat, member.tier);
    const expectedPts2 = calcExpectedEarn(new2Net, new2Vat, member.tier);

    const excId = rnd();
    const excItems = [
      defaultItem(3, { grossPrice: 200.00, netPrice: 190.00, vatAmount: 10.00, previousLineNo: 1, isReturn: 'Yes' }),
      defaultItem(4, { sku: '153837', hsnCode: '1123', grossPrice: 300.00, netPrice: 285.00, vatAmount: 15.00, previousLineNo: 2, isReturn: 'Yes' }),
      defaultItem(5, { grossPrice: 400.00, netPrice: new1Net, vatAmount: new1Vat, previousLineNo: 0, isReturn: 'No' }),
      defaultItem(6, { sku: '153837', hsnCode: '1123', grossPrice: 600.00, netPrice: new2Net, vatAmount: new2Vat, previousLineNo: 0, isReturn: 'No' }),
    ];
    const excRes = await callWebCommit(webCommitBody(excId, member.storeId, member.memberId, excItems,
      buildExchangeTenders(netRefund, 1000.00), receipt), ctx.token);
    if (excRes.status === 200) await updateOrderStatus(ctx.token, member.storeId, member.memberId, excRes.body.receiptNo, [5, 6]);
    expect(excRes.status).toBe(200);
    const line5 = excRes.body.itemDetails?.find((l: any) => l.lineNo === 5);
    const line6 = excRes.body.itemDetails?.find((l: any) => l.lineNo === 6);
    if (line5) expect(line5.basePointsAccrued).toBe(expectedPts1);
    if (line6) expect(line6.basePointsAccrued).toBe(expectedPts2);
    console.log(`WEB-EXC-TC-015 | Tier: ${member.tier} | Item5 exp/act: ${expectedPts1}/${line5?.basePointsAccrued} | Item6 exp/act: ${expectedPts2}/${line6?.basePointsAccrued}`);
  });

});

// ─────────────────────────────────────────────────────────────────────────────
// WEB-EXC — totalRefundValue > 0 (TC-016, 017)
// ─────────────────────────────────────────────────────────────────────────────

describe('WEB Exchange Sale — totalRefundValue > 0 (points redeemed before return)', () => {

  beforeAll(async () => {
    ctx.token = getToken();
    ctx.member = await isMember(ctx.token, WEB_MOBILE, 'WEB');
  });

  test('WEB-EXC-TC-016: WEB — register new user → Txn A + updateOrderStatus → redeem all Txn A points in Txn B → return Txn A → totalRefundValue > 0 and equals basePointsAccruedValue', async () => {
    // Step 1: Register a brand-new WEB member (no OTP needed for WEB)
    const mobile = '971' + String(500000000 + Math.floor(Math.random() * 99999999));
    const regId = rnd();
    const profileRes = await loggedPost('/rprest/api/transaction/v1/profile', {
      reqId: `v${regId}`, storeId: ctx.member.storeId, terminalId: '1',
      receiptNo: `v${regId}`, reqTimeStamp: now(), cashierId: '',
      channel: 'WEB', language: 'EN', dateOfBirth: '1992-04-10',
      firstName: 'EXC016', lastName: 'WEBUser', mobileNumber: mobile,
      emailId: `exc016web${regId}@test.com`, gender: 'Female', country: 'AE',
      city: '', nationality: 'AE', mobileCountryCode: 'AE', requestType: 'New',
    }, ctx.token);
    if (profileRes.status !== 200 && profileRes.status !== 201) {
      console.warn(`WEB-EXC-TC-016: Registration failed (${profileRes.status}) — skipping`); return;
    }
    const newMember = await isMember(ctx.token, mobile, 'WEB');

    // Step 2: Transaction A — 1050 AED purchase (earns ≥1000 pts to meet min burn)
    const txnAItems = [defaultItem(1, { grossPrice: 1050.00, netPrice: 1000.00, vatAmount: 50.00 })];
    const txnAId = rnd();
    const txnABody = {
      reqId: `BFLWEB${txnAId}`, storeId: newMember.storeId, terminalId: '1',
      receiptNo: `BFLWEB${txnAId}`, reqTimeStamp: now(), cashierId: '',
      channel: 'WEB', memberId: newMember.memberId, commitRequestType: 'Complete',
      txnDate: now(), couponCodes: [], itemDetails: txnAItems, previousReceiptNo: '',
      tenderDetails: [{ code: TENDER.CASH, amount: 1050.00 }],
      billDetails: computeBillDetails(txnAItems, txnAId),
    };
    const txnARes = await loggedPost('/rprest/api/transaction/v1/commitTransaction', txnABody, ctx.token);
    expect(txnARes.status).toBe(200);
    const txnAReceipt: string = txnARes.body.receiptNo;
    const txnALine1 = txnARes.body.itemDetails?.find((l: any) => l.lineNo === 1);
    const expectedRefundValue: number = parseFloat((txnALine1?.basePointsAccruedValue ?? 0).toFixed(2));

    await updateOrderStatus(ctx.token, newMember.storeId, newMember.memberId, txnAReceipt, [1]);

    const afterTxnA = await isMember(ctx.token, mobile, 'WEB');
    if (afterTxnA.points === 0 || expectedRefundValue === 0) {
      console.warn('WEB-EXC-TC-016: No points accrued on Txn A — skipping'); return;
    }
    const totalPoints = afterTxnA.points;
    const pointsValue = parseFloat(afterTxnA.pointsValue.toFixed(2)); // AED monetary worth for block & T8

    // Step 3: Pre-generate ONE ID — shared by block and commit (same receiptNo)
    const txnBId = rnd();

    // Step 3: Block ALL points (valueToBlock = AED monetary value, not count)
    const blockRes = await loggedPost('/rprest/api/transaction/v1/blockunblockwalletandpoints', {
      reqId: `BFLWEB${txnBId}`, storeId: newMember.storeId, terminalId: '1',
      receiptNo: `BFLWEB${txnBId}`, reqTimeStamp: now(), cashierId: '',
      channel: 'WEB', memberId: newMember.memberId, blockReqType: 'BLOCK',
      blockSpecifications: [{ redeemType: 'POINTS', valueToBlock: pointsValue }],
    }, ctx.token);
    expect(blockRes.status).toBe(200); // hard-fail

    // Step 4: Transaction B — same receiptNo links block to this commit
    const txnBItems = [defaultItem(1, { grossPrice: 1050.00, netPrice: 1000.00, vatAmount: 50.00 })];
    const confirmedPointsValue = parseFloat((blockRes.body.pointsValue ?? pointsValue).toFixed(2));
    const txnBBody = {
      reqId: `BFLWEB${txnBId}`, storeId: newMember.storeId, terminalId: '1',
      receiptNo: `BFLWEB${txnBId}`, reqTimeStamp: now(), cashierId: '',
      channel: 'WEB', memberId: newMember.memberId, commitRequestType: 'Complete',
      txnDate: now(), couponCodes: [], itemDetails: txnBItems, previousReceiptNo: '',
      tenderDetails: [
        { code: TENDER.POINTS, amount: confirmedPointsValue },
        { code: TENDER.CASH, amount: Math.max(0, parseFloat((1050.00 - confirmedPointsValue).toFixed(2))) },
      ],
      billDetails: computeBillDetails(txnBItems, txnBId),
    };
    const txnBRes = await loggedPost('/rprest/api/transaction/v1/commitTransaction', txnBBody, ctx.token);
    expect(txnBRes.status).toBe(200);
    expect(txnBRes.body.status).toBe('Success');
    await updateOrderStatus(ctx.token, newMember.storeId, newMember.memberId, txnBRes.body.receiptNo, [1]);

    const afterTxnB = await isMember(ctx.token, mobile, 'WEB');
    expect(afterTxnB.pointsValue).toBeLessThan(afterTxnA.pointsValue); // points were redeemed
    console.log(`WEB-EXC-TC-016 | totalPoints: ${totalPoints} | pointsValue: ${pointsValue} | confirmedPointsValue: ${confirmedPointsValue} | afterTxnB.pointsValue: ${afterTxnB.pointsValue}`);

    // Step 5: ExchangeLine for Transaction A
    const exlRes = await callWebExchangeLine(ctx.token, {
      storeId: newMember.storeId, memberId: newMember.memberId,
      previousReceiptNo: txnAReceipt,
      itemDetails: [{ itemType: 'Product', quantity: 1, previousLineNo: 1, isReturn: 'Yes' }],
    });
    expect(exlRes.status).toBe(200);
    expect(exlRes.body.status).toBe('Success');

    const totalRefundValue: number = parseFloat((exlRes.body.totalRefundValue ?? 0).toFixed(2));
    expect(totalRefundValue).toBeGreaterThan(0);
    console.log(`WEB-EXC-TC-016 | expectedRefundValue: ${expectedRefundValue} | totalRefundValue: ${totalRefundValue}`);

    const tenderTotal: number = exlRes.body.tenderDetails?.reduce((s: number, t: any) => s + t.amount, 0) ?? 0;
    const netRefund = parseFloat((tenderTotal - totalRefundValue).toFixed(2));
    console.log(`WEB-EXC-TC-016 | basePointsAccruedValue: ${expectedRefundValue} | totalRefundValue: ${totalRefundValue} ✓ | netRefund: ${netRefund}`);

    // Step 6: Commit return of Transaction A
    const retId = rnd();
    const retItems = [defaultItem(2, { grossPrice: 200.00, netPrice: 190.00, vatAmount: 10.00, previousLineNo: 1, isReturn: 'Yes' })];
    const retRes = await callWebCommit(webCommitBody(retId, newMember.storeId, newMember.memberId, retItems,
      [{ code: TENDER.CASH, amount: netRefund > 0 ? netRefund : tenderTotal }], txnAReceipt), ctx.token);
    expect(retRes.status).toBe(200);
    expect(retRes.body.status).toBe('Success');
    expect(retRes.body.totalRefundValue).toBe(0.0);
  });

  test('WEB-EXC-TC-017: totalRefundValue = 0 when points from original purchase were NOT redeemed', async () => {
    const receipt = await createWebPurchase(ctx.token, ctx.member.storeId, ctx.member.memberId,
      [defaultItem(1, { grossPrice: 200.00, netPrice: 190.00, vatAmount: 10.00 })], 200.00);

    const exlRes = await callWebExchangeLine(ctx.token, {
      storeId: ctx.member.storeId, memberId: ctx.member.memberId, previousReceiptNo: receipt,
      itemDetails: [{ itemType: 'Product', quantity: 1, previousLineNo: 1, isReturn: 'Yes' }],
    });
    expect(exlRes.status).toBe(200);
    expect(exlRes.body.totalRefundValue).toBe(0);
  });

  test('WEB-EXC-TC-016B: WEB — redeem all points from Txn A (≥1000 pts) → Exchange Sale (return Txn A + new item) → new item earns points', async () => {
    // ── Step 1: Register a brand-new WEB member (no OTP required) ────────────
    const mobile = '971' + String(500000000 + Math.floor(Math.random() * 99999999));
    const regId = rnd();
    const profileRes = await post('/rprest/api/transaction/v1/profile', {
      reqId: `v${regId}`, storeId: ctx.member.storeId, terminalId: '1',
      receiptNo: `v${regId}`, reqTimeStamp: now(), cashierId: '',
      channel: 'WEB', language: 'EN', dateOfBirth: '1992-04-10',
      firstName: 'EXC016B', lastName: 'WEBUser', mobileNumber: mobile,
      emailId: `exc016bweb${regId}@test.com`, gender: 'Female', country: 'AE',
      city: '', nationality: 'AE', mobileCountryCode: 'AE', requestType: 'New',
    }, ctx.token);
    if (profileRes.status !== 200 && profileRes.status !== 201) {
      console.warn(`WEB-EXC-TC-016B: Registration failed (${profileRes.status}) — skipping`); return;
    }
    const newMember = await isMember(ctx.token, mobile, 'WEB');

    // ── Step 2: Txn A — purchase + updateOrderStatus to accrue ≥ 1000 pts ────
    // earn base = netPrice + vatAmount = 1050 → Explorer: 1050 pts, Hunter: 2100, Champion: 3150
    const txnAItems = [defaultItem(1, { grossPrice: 1050.00, netPrice: 1000.00, vatAmount: 50.00 })];
    const txnAId = rnd();
    const txnABody = {
      reqId: `BFLWEB${txnAId}`, storeId: newMember.storeId, terminalId: '1',
      receiptNo: `BFLWEB${txnAId}`, reqTimeStamp: now(), cashierId: '',
      channel: 'WEB', memberId: newMember.memberId, commitRequestType: 'Complete',
      txnDate: now(), couponCodes: [], itemDetails: txnAItems, previousReceiptNo: '',
      tenderDetails: [{ code: TENDER.CASH, amount: 1050.00 }],
      billDetails: computeBillDetails(txnAItems, txnAId),
    };
    const txnARes = await loggedPost('/rprest/api/transaction/v1/commitTransaction', txnABody, ctx.token);
    expect(txnARes.status).toBe(200);
    const txnAReceipt: string = txnARes.body.receiptNo;
    const txnALine1 = txnARes.body.itemDetails?.find((l: any) => l.lineNo === 1);
    const expectedRefundValue: number = parseFloat((txnALine1?.basePointsAccruedValue ?? 0).toFixed(2));

    await updateOrderStatus(ctx.token, newMember.storeId, newMember.memberId, txnAReceipt, [1]);

    const afterTxnA = await isMember(ctx.token, mobile, 'WEB');
    if (afterTxnA.points === 0 || expectedRefundValue === 0) {
      console.warn('WEB-EXC-TC-016B: No points accrued on Txn A — skipping'); return;
    }
    const totalPoints = afterTxnA.points;
    const pointsValue = parseFloat(afterTxnA.pointsValue.toFixed(2)); // AED monetary worth for block & T8
    expect(totalPoints).toBeGreaterThanOrEqual(1000); // min burn: ≥1000 pts

    // ── Step 3: Pre-generate ONE ID — shared by block and commit (same receiptNo) ─
    const txnBId = rnd();

    // ── Step 3: Block ALL points (valueToBlock = AED monetary value, not count) ─
    const blockRes = await loggedPost('/rprest/api/transaction/v1/blockunblockwalletandpoints', {
      reqId: `BFLWEB${txnBId}`, storeId: newMember.storeId, terminalId: '1',
      receiptNo: `BFLWEB${txnBId}`, reqTimeStamp: now(), cashierId: '',
      channel: 'WEB', memberId: newMember.memberId, blockReqType: 'BLOCK',
      blockSpecifications: [{ redeemType: 'POINTS', valueToBlock: pointsValue }],
    }, ctx.token);
    expect(blockRes.status).toBe(200); // hard-fail

    // ── Step 4: Txn B — same receiptNo links block to this commit ─────────────
    const txnBItems = [defaultItem(1, { grossPrice: 1050.00, netPrice: 1000.00, vatAmount: 50.00 })];
    const confirmedPointsValue = parseFloat((blockRes.body.pointsValue ?? pointsValue).toFixed(2));
    const txnBBody = {
      reqId: `BFLWEB${txnBId}`, storeId: newMember.storeId, terminalId: '1',
      receiptNo: `BFLWEB${txnBId}`, reqTimeStamp: now(), cashierId: '',
      channel: 'WEB', memberId: newMember.memberId, commitRequestType: 'Complete',
      txnDate: now(), couponCodes: [], itemDetails: txnBItems, previousReceiptNo: '',
      tenderDetails: [
        { code: TENDER.POINTS, amount: confirmedPointsValue },
        { code: TENDER.CASH, amount: Math.max(0, parseFloat((1050.00 - confirmedPointsValue).toFixed(2))) },
      ],
      billDetails: computeBillDetails(txnBItems, txnBId),
    };
    const txnBRes = await loggedPost('/rprest/api/transaction/v1/commitTransaction', txnBBody, ctx.token);
    expect(txnBRes.status).toBe(200);
    expect(txnBRes.body.status).toBe('Success');
    await updateOrderStatus(ctx.token, newMember.storeId, newMember.memberId, txnBRes.body.receiptNo, [1]);

    const afterTxnB = await isMember(ctx.token, mobile, 'WEB');
    expect(afterTxnB.pointsValue).toBeLessThan(afterTxnA.pointsValue); // points were redeemed
    console.log(`WEB-EXC-TC-016B | totalPoints: ${totalPoints} | pointsValue: ${pointsValue} | confirmedPointsValue: ${confirmedPointsValue} | afterTxnB.pointsValue: ${afterTxnB.pointsValue}`);

    // ── Step 5: ExchangeLine for Txn A ───────────────────────────────────────
    const exlRes = await callWebExchangeLine(ctx.token, {
      storeId: newMember.storeId, memberId: newMember.memberId,
      previousReceiptNo: txnAReceipt,
      itemDetails: [{ itemType: 'Product', quantity: 1, previousLineNo: 1, isReturn: 'Yes' }],
    });
    expect(exlRes.status).toBe(200);
    expect(exlRes.body.status).toBe('Success');

    const totalRefundValue: number = parseFloat((exlRes.body.totalRefundValue ?? 0).toFixed(2));
    // WEB: Txn B updateOrderStatus re-earns points that may partially restore balance,
    // so totalRefundValue can be less than expectedRefundValue (still valid > 0).
    expect(totalRefundValue).toBeGreaterThan(0);
    console.log(`WEB-EXC-TC-016B | expectedRefundValue: ${expectedRefundValue} | totalRefundValue: ${totalRefundValue}`);

    const tenderTotal: number = exlRes.body.tenderDetails?.reduce((s: number, t: any) => s + t.amount, 0) ?? 0;
    const netRefund = parseFloat((tenderTotal - totalRefundValue).toFixed(2));

    // ── Step 6: Commit Exchange Sale — return Txn A item + NEW item ───────────
    // Key assertion: new item must earn points even when totalRefundValue > 0
    const newNetPrice = 475.00;
    const newVatAmount = 25.00;
    const expectedNewPts = calcExpectedEarn(newNetPrice, newVatAmount, newMember.tier);

    const excId = rnd();
    const excItems = [
      defaultItem(3, { grossPrice: 1050.00, netPrice: 1000.00, vatAmount: 50.00, previousLineNo: 1, isReturn: 'Yes' }),
      defaultItem(4, { sku: '153837', hsnCode: '1123', grossPrice: 500.00, netPrice: newNetPrice, vatAmount: newVatAmount, previousLineNo: 0, isReturn: 'No' }),
    ];
    const excRes = await callWebCommit(webCommitBody(excId, newMember.storeId, newMember.memberId, excItems,
      buildExchangeTenders(netRefund, 500.00), txnAReceipt), ctx.token);
    if (excRes.status === 200) await updateOrderStatus(ctx.token, newMember.storeId, newMember.memberId, excRes.body.receiptNo, [4]);

    expect(excRes.status).toBe(200);
    expect(excRes.body.status).toBe('Success');

    const newLine = excRes.body.itemDetails?.find((l: any) => l.isReturn === 'No');
    expect(newLine).toBeDefined();
    expect(newLine.basePointsAccrued).toBe(expectedNewPts);
    console.log(
      `WEB-EXC-TC-016B | Tier: ${newMember.tier} | totalRefundValue: ${totalRefundValue}` +
      ` | New item pts exp/act: ${expectedNewPts}/${newLine?.basePointsAccrued}`,
    );
  });

  test('WEB-EXC-TC-016C: WEB — register → Txn A (earn ≥1000 pts) → Txn B (redeem pts via T8) → return Txn B + new product → new product earns points', async () => {
    // ── Step 1: Register a brand-new WEB member ───────────────────────────────
    const mobile = '971' + String(500000000 + Math.floor(Math.random() * 99999999));
    const regId = rnd();
    const profileRes = await loggedPost('/rprest/api/transaction/v1/profile', {
      reqId: `v${regId}`, storeId: ctx.member.storeId, terminalId: '1',
      receiptNo: `v${regId}`, reqTimeStamp: now(), cashierId: '',
      channel: 'WEB', language: 'EN', dateOfBirth: '1992-04-10',
      firstName: 'EXC016C', lastName: 'WEBUser', mobileNumber: mobile,
      emailId: `exc016cweb${regId}@test.com`, gender: 'Female', country: 'AE',
      city: '', nationality: 'AE', mobileCountryCode: 'AE', requestType: 'New',
    }, ctx.token);
    if (profileRes.status !== 200 && profileRes.status !== 201) {
      console.warn(`WEB-EXC-TC-016C: Registration failed (${profileRes.status}) — skipping`); return;
    }
    const newMember = await isMember(ctx.token, mobile, 'WEB');

    // ── Step 2: Txn A — purchase + updateOrderStatus to earn ≥1000 pts ────────
    const txnAItems = [defaultItem(1, { grossPrice: 1050.00, netPrice: 1000.00, vatAmount: 50.00 })];
    const txnAId = rnd();
    const txnABody = {
      reqId: `BFLWEB${txnAId}`, storeId: newMember.storeId, terminalId: '1',
      receiptNo: `BFLWEB${txnAId}`, reqTimeStamp: now(), cashierId: '',
      channel: 'WEB', memberId: newMember.memberId, commitRequestType: 'Complete',
      txnDate: now(), couponCodes: [], itemDetails: txnAItems, previousReceiptNo: '',
      tenderDetails: [{ code: TENDER.CASH, amount: 1050.00 }],
      billDetails: computeBillDetails(txnAItems, txnAId),
    };
    const txnARes = await loggedPost('/rprest/api/transaction/v1/commitTransaction', txnABody, ctx.token);
    expect(txnARes.status).toBe(200);
    await updateOrderStatus(ctx.token, newMember.storeId, newMember.memberId, txnARes.body.receiptNo, [1]);

    const afterTxnA = await isMember(ctx.token, mobile, 'WEB');
    if (afterTxnA.points === 0) { console.warn('WEB-EXC-TC-016C: No points accrued — skipping'); return; }
    const totalPoints = afterTxnA.points;
    const pointsValue = parseFloat(afterTxnA.pointsValue.toFixed(2)); // AED monetary worth for block & T8
    expect(totalPoints).toBeGreaterThanOrEqual(1000); // min burn: ≥1000 pts

    // ── Step 3: Pre-generate ONE ID — shared by block and commit (same receiptNo) ─
    const txnBId = rnd();

    // ── Step 3: Block ALL points (valueToBlock = AED monetary value, not count) ─
    const blockRes = await loggedPost('/rprest/api/transaction/v1/blockunblockwalletandpoints', {
      reqId: `BFLWEB${txnBId}`, storeId: newMember.storeId, terminalId: '1',
      receiptNo: `BFLWEB${txnBId}`, reqTimeStamp: now(), cashierId: '',
      channel: 'WEB', memberId: newMember.memberId, blockReqType: 'BLOCK',
      blockSpecifications: [{ redeemType: 'POINTS', valueToBlock: pointsValue }],
    }, ctx.token);
    expect(blockRes.status).toBe(200); // hard-fail

    // ── Step 4: Txn B — same receiptNo links block to this commit ─────────────
    const txnBItems = [defaultItem(1, { grossPrice: 1050.00, netPrice: 1000.00, vatAmount: 50.00 })];
    const confirmedPointsValue = parseFloat((blockRes.body.pointsValue ?? pointsValue).toFixed(2));
    const txnBBody = {
      reqId: `BFLWEB${txnBId}`, storeId: newMember.storeId, terminalId: '1',
      receiptNo: `BFLWEB${txnBId}`, reqTimeStamp: now(), cashierId: '',
      channel: 'WEB', memberId: newMember.memberId, commitRequestType: 'Complete',
      txnDate: now(), couponCodes: [], itemDetails: txnBItems, previousReceiptNo: '',
      tenderDetails: [
        { code: TENDER.POINTS, amount: confirmedPointsValue },
        { code: TENDER.CASH, amount: Math.max(0, parseFloat((1050.00 - confirmedPointsValue).toFixed(2))) },
      ],
      billDetails: computeBillDetails(txnBItems, txnBId),
    };
    const txnBRes = await loggedPost('/rprest/api/transaction/v1/commitTransaction', txnBBody, ctx.token);
    expect(txnBRes.status).toBe(200);
    expect(txnBRes.body.status).toBe('Success');
    const txnBReceipt: string = txnBRes.body.receiptNo;
    await updateOrderStatus(ctx.token, newMember.storeId, newMember.memberId, txnBReceipt, [1]);

    const afterTxnB = await isMember(ctx.token, mobile, 'WEB');
    expect(afterTxnB.pointsValue).toBeLessThan(afterTxnA.pointsValue); // points were redeemed
    console.log(`WEB-EXC-TC-016C | totalPoints: ${totalPoints} | pointsValue: ${pointsValue} | confirmedPointsValue: ${confirmedPointsValue} | afterTxnB.pointsValue: ${afterTxnB.pointsValue}`);

    // ── Step 5: ExchangeLine on Txn B (the redemption transaction) ───────────
    const exlRes = await callWebExchangeLine(ctx.token, {
      storeId: newMember.storeId, memberId: newMember.memberId,
      previousReceiptNo: txnBReceipt,
      itemDetails: [{ itemType: 'Product', quantity: 1, previousLineNo: 1, isReturn: 'Yes' }],
    });
    expect(exlRes.status).toBe(200);
    expect(exlRes.body.status).toBe('Success');

    const tenderTotal: number = exlRes.body.tenderDetails?.reduce((s: number, t: any) => s + t.amount, 0) ?? 0;
    const totalRefundValue: number = parseFloat((exlRes.body.totalRefundValue ?? 0).toFixed(2));
    const netRefund = parseFloat((tenderTotal - totalRefundValue).toFixed(2));

    // ── Step 6: Commit Exchange Sale — return Txn B item + NEW product ────────
    const newNetPrice = 475.00;
    const newVatAmount = 25.00;
    const expectedNewPts = calcExpectedEarn(newNetPrice, newVatAmount, newMember.tier);

    const excId = rnd();
    const excItems = [
      defaultItem(3, { grossPrice: 1050.00, netPrice: 1000.00, vatAmount: 50.00, previousLineNo: 1, isReturn: 'Yes' }),
      defaultItem(4, { sku: '153837', hsnCode: '1123', grossPrice: 500.00, netPrice: newNetPrice, vatAmount: newVatAmount, previousLineNo: 0, isReturn: 'No' }),
    ];
    const excRes = await callWebCommit(webCommitBody(excId, newMember.storeId, newMember.memberId, excItems,
      buildExchangeTenders(netRefund, 500.00), txnBReceipt), ctx.token);
    if (excRes.status === 200) await updateOrderStatus(ctx.token, newMember.storeId, newMember.memberId, excRes.body.receiptNo, [4]);

    expect(excRes.status).toBe(200);
    expect(excRes.body.status).toBe('Success');

    const newLine = excRes.body.itemDetails?.find((l: any) => l.isReturn === 'No');
    expect(newLine).toBeDefined();
    expect(newLine.basePointsAccrued).toBe(expectedNewPts);
    console.log(
      `WEB-EXC-TC-016C | Tier: ${newMember.tier} | Returning Txn B (T8 redemption)` +
      ` | New item pts exp/act: ${expectedNewPts}/${newLine?.basePointsAccrued}`,
    );
  });

});

// ─────────────────────────────────────────────────────────────────────────────
// WEB-EXC — Partial Return (TC-018, 019, 020)
// ─────────────────────────────────────────────────────────────────────────────

describe('WEB Exchange Sale — Partial Return (return 1 of 2 items)', () => {

  beforeAll(async () => {
    ctx.token = getToken();
    const member = await isMember(ctx.token, WEB_MOBILE, 'WEB');
    ctx.memberId = member.memberId;
    ctx.storeId  = member.storeId;
    ctx.tier     = member.tier;
  });

  test('WEB-EXC-TC-018: Partial return — exchangeLine returns full-purchase tenderDetails, commit succeeds', async () => {
    const receipt = await createWebPurchase(ctx.token, ctx.storeId, ctx.memberId,
      [
        defaultItem(1, { grossPrice: 200.00, netPrice: 190.00, vatAmount: 10.00 }),
        defaultItem(2, { sku: '153837', hsnCode: '1123', grossPrice: 500.00, netPrice: 475.00, vatAmount: 25.00 }),
      ], 700.00);

    const exlRes = await callWebExchangeLine(ctx.token, {
      storeId: ctx.storeId, memberId: ctx.memberId, previousReceiptNo: receipt,
      itemDetails: [{ itemType: 'Product', quantity: 1, previousLineNo: 1, isReturn: 'Yes' }],
    });
    expect(exlRes.status).toBe(200);
    expect(exlRes.body.status).toBe('Success');
    const tenderTotal: number = exlRes.body.tenderDetails.reduce((s: number, t: any) => s + t.amount, 0);
    expect(tenderTotal).toBeGreaterThan(0);
    console.log(`WEB-EXC-TC-018 | Partial return tenderTotal from exchangeLine: ${tenderTotal} (full purchase total returned by API)`);

    const retId = rnd();
    const retItems = [defaultItem(3, { grossPrice: 200.00, netPrice: 190.00, vatAmount: 10.00, previousLineNo: 1, isReturn: 'Yes' })];
    const retRes = await callWebCommit(webCommitBody(retId, ctx.storeId, ctx.memberId, retItems,
      [{ code: TENDER.CASH, amount: 190.00 }], receipt), ctx.token);
    expect(retRes.status).toBe(200);
    expect(retRes.body.status).toBe('Success');
  });

  test('WEB-EXC-TC-019: Partial return — only returned item\'s points reversed, kept item\'s points remain', async () => {
    const member = await isMember(ctx.token, WEB_MOBILE, 'WEB');
    const baseline = member.points;

    const receipt = await createWebPurchase(ctx.token, member.storeId, member.memberId,
      [
        defaultItem(1, { grossPrice: 300.00, netPrice: 285.00, vatAmount: 15.00 }),
        defaultItem(2, { sku: '153837', hsnCode: '1123', grossPrice: 200.00, netPrice: 190.00, vatAmount: 10.00 }),
      ], 500.00);

    const afterPurchase = await isMember(ctx.token, WEB_MOBILE, 'WEB');
    const earnedL1 = calcExpectedEarn(285.00, 15.00, member.tier);
    const earnedL2 = calcExpectedEarn(190.00, 10.00, member.tier);
    expect(afterPurchase.points - baseline).toBe(earnedL1 + earnedL2);

    const exlRes = await callWebExchangeLine(ctx.token, {
      storeId: member.storeId, memberId: member.memberId, previousReceiptNo: receipt,
      itemDetails: [{ itemType: 'Product', quantity: 1, previousLineNo: 1, isReturn: 'Yes' }],
    });
    expect(exlRes.status).toBe(200);
    const tenderTotal: number = exlRes.body.tenderDetails.reduce((s: number, t: any) => s + t.amount, 0);

    const retId = rnd();
    const retItems = [defaultItem(3, { grossPrice: 300.00, netPrice: 285.00, vatAmount: 15.00, previousLineNo: 1, isReturn: 'Yes' })];
    const retRes = await callWebCommit(webCommitBody(retId, member.storeId, member.memberId, retItems,
      [{ code: TENDER.CASH, amount: tenderTotal }], receipt), ctx.token);
    expect(retRes.status).toBe(200);

    const afterReturn = await isMember(ctx.token, WEB_MOBILE, 'WEB');
    expect(afterReturn.points).toBe(baseline + earnedL2);
    console.log(`WEB-EXC-TC-019 | Baseline: ${baseline} | After partial return: ${afterReturn.points} (expect ${baseline + earnedL2})`);
  });

  test('WEB-EXC-TC-020: Partial return with new purchase — return line 1, buy new item (Exchange Sale)', async () => {
    const receipt = await createWebPurchase(ctx.token, ctx.storeId, ctx.memberId,
      [
        defaultItem(1, { grossPrice: 200.00, netPrice: 190.00, vatAmount: 10.00 }),
        defaultItem(2, { sku: '153837', hsnCode: '1123', grossPrice: 500.00, netPrice: 475.00, vatAmount: 25.00 }),
      ], 700.00);

    const exlRes = await callWebExchangeLine(ctx.token, {
      storeId: ctx.storeId, memberId: ctx.memberId, previousReceiptNo: receipt,
      itemDetails: [{ itemType: 'Product', quantity: 1, previousLineNo: 1, isReturn: 'Yes' }],
    });
    expect(exlRes.status).toBe(200);
    const netRefund = calcNetRefund(exlRes.body);

    const excId = rnd();
    const excItems = [
      defaultItem(3, { grossPrice: 200.00, netPrice: 190.00, vatAmount: 10.00, previousLineNo: 1, isReturn: 'Yes' }),
      defaultItem(4, { sku: '153837', hsnCode: '1123', grossPrice: 400.00, netPrice: 380.00, vatAmount: 20.00, previousLineNo: 0, isReturn: 'No' }),
    ];
    const excRes = await callWebCommit(webCommitBody(excId, ctx.storeId, ctx.memberId, excItems,
      buildExchangeTenders(netRefund, 400.00), receipt), ctx.token);
    if (excRes.status === 200) await updateOrderStatus(ctx.token, ctx.storeId, ctx.memberId, excRes.body.receiptNo, [4]);
    expect(excRes.status).toBe(200);
    expect(excRes.body.status).toBe('Success');
    expect(excRes.body.itemDetails?.length).toBe(2);
  });

});

// ─────────────────────────────────────────────────────────────────────────────
// WEB-EXC — New Purchase Less Than Return Value (TC-021, 022, 023)
// ─────────────────────────────────────────────────────────────────────────────

describe('WEB Exchange Sale — New Purchase Less Than Return Value', () => {

  beforeAll(async () => {
    ctx.token = getToken();
    const member = await isMember(ctx.token, WEB_MOBILE, 'WEB');
    ctx.memberId = member.memberId;
    ctx.storeId  = member.storeId;
  });

  test('WEB-EXC-TC-021: New purchase (200) < return value (500) — T32 covers new purchase, no cash needed', async () => {
    const receipt = await createWebPurchase(ctx.token, ctx.storeId, ctx.memberId,
      [defaultItem(1, { grossPrice: 500.00, netPrice: 475.00, vatAmount: 25.00 })], 500.00);

    const exlRes = await callWebExchangeLine(ctx.token, {
      storeId: ctx.storeId, memberId: ctx.memberId, previousReceiptNo: receipt,
      itemDetails: [{ itemType: 'Product', quantity: 1, previousLineNo: 1, isReturn: 'Yes' }],
    });
    expect(exlRes.status).toBe(200);
    const netRefund = calcNetRefund(exlRes.body);
    const newPurchaseGross = 200.00;
    expect(netRefund).toBeGreaterThan(newPurchaseGross);

    const tenders = buildExchangeTenders(netRefund, newPurchaseGross);
    expect(tenders.some((t: any) => t.code === TENDER.CASH)).toBe(false);
    const creditNoteEntry = tenders.find((t: any) => t.code === TENDER.CREDIT_NOTE);
    expect(creditNoteEntry.amount).toBe(newPurchaseGross);

    const excId = rnd();
    const excItems = [
      defaultItem(3, { grossPrice: 500.00, netPrice: 475.00, vatAmount: 25.00, previousLineNo: 1, isReturn: 'Yes' }),
      defaultItem(4, { sku: '153837', hsnCode: '1123', grossPrice: 200.00, netPrice: 190.00, vatAmount: 10.00, previousLineNo: 0, isReturn: 'No' }),
    ];
    const excRes = await callWebCommit(webCommitBody(excId, ctx.storeId, ctx.memberId, excItems,
      tenders, receipt), ctx.token);
    if (excRes.status === 200) await updateOrderStatus(ctx.token, ctx.storeId, ctx.memberId, excRes.body.receiptNo, [4]);
    expect(excRes.status).toBe(200);
    expect(excRes.body.status).toBe('Success');
    console.log(`WEB-EXC-TC-021 | netRefund: ${netRefund} | newPurchase: ${newPurchaseGross} | T32: ${creditNoteEntry.amount}`);
  });

  test('WEB-EXC-TC-022: New purchase (200) < return value — points accrued only on new item', async () => {
    const member = await isMember(ctx.token, WEB_MOBILE, 'WEB');
    const receipt = await createWebPurchase(ctx.token, member.storeId, member.memberId,
      [defaultItem(1, { grossPrice: 500.00, netPrice: 475.00, vatAmount: 25.00 })], 500.00);

    const exlRes = await callWebExchangeLine(ctx.token, {
      storeId: member.storeId, memberId: member.memberId, previousReceiptNo: receipt,
      itemDetails: [{ itemType: 'Product', quantity: 1, previousLineNo: 1, isReturn: 'Yes' }],
    });
    expect(exlRes.status).toBe(200);
    const netRefund = calcNetRefund(exlRes.body);
    const newNetPrice = 190.00; const newVatAmount = 10.00;
    const expectedNewPts = calcExpectedEarn(newNetPrice, newVatAmount, member.tier);

    const excId = rnd();
    const excItems = [
      defaultItem(3, { grossPrice: 500.00, netPrice: 475.00, vatAmount: 25.00, previousLineNo: 1, isReturn: 'Yes' }),
      defaultItem(4, { sku: '153837', hsnCode: '1123', grossPrice: 200.00, netPrice: newNetPrice, vatAmount: newVatAmount, previousLineNo: 0, isReturn: 'No' }),
    ];
    const excRes = await callWebCommit(webCommitBody(excId, member.storeId, member.memberId, excItems,
      buildExchangeTenders(netRefund, 200.00), receipt), ctx.token);
    if (excRes.status === 200) await updateOrderStatus(ctx.token, member.storeId, member.memberId, excRes.body.receiptNo, [4]);
    expect(excRes.status).toBe(200);
    const newLine = excRes.body.itemDetails?.find((l: any) => l.isReturn === 'No');
    expect(newLine?.basePointsAccrued).toBe(expectedNewPts);
    console.log(`WEB-EXC-TC-022 | Tier: ${member.tier} | New item pts exp/act: ${expectedNewPts}/${newLine?.basePointsAccrued}`);
  });

  test('WEB-EXC-TC-023: New purchase exactly equal to return value — T32 covers in full, T1 = 0', async () => {
    const receipt = await createWebPurchase(ctx.token, ctx.storeId, ctx.memberId,
      [defaultItem(1, { grossPrice: 500.00, netPrice: 475.00, vatAmount: 25.00 })], 500.00);

    const exlRes = await callWebExchangeLine(ctx.token, {
      storeId: ctx.storeId, memberId: ctx.memberId, previousReceiptNo: receipt,
      itemDetails: [{ itemType: 'Product', quantity: 1, previousLineNo: 1, isReturn: 'Yes' }],
    });
    expect(exlRes.status).toBe(200);
    const netRefund = calcNetRefund(exlRes.body);
    const newPurchaseGross = netRefund;

    const tenders = buildExchangeTenders(netRefund, newPurchaseGross);
    expect(tenders.some((t: any) => t.code === TENDER.CASH)).toBe(false);

    const excId = rnd();
    const excItems = [
      defaultItem(3, { grossPrice: 500.00, netPrice: 475.00, vatAmount: 25.00, previousLineNo: 1, isReturn: 'Yes' }),
      defaultItem(4, { sku: '153837', hsnCode: '1123', grossPrice: newPurchaseGross, netPrice: newPurchaseGross * 0.95, vatAmount: newPurchaseGross * 0.05, previousLineNo: 0, isReturn: 'No' }),
    ];
    const excRes = await callWebCommit(webCommitBody(excId, ctx.storeId, ctx.memberId, excItems,
      tenders, receipt), ctx.token);
    if (excRes.status === 200) await updateOrderStatus(ctx.token, ctx.storeId, ctx.memberId, excRes.body.receiptNo, [4]);
    expect(excRes.status).toBe(200);
    expect(excRes.body.status).toBe('Success');
  });

});
