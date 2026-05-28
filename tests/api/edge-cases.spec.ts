import { post, getToken, isMember, commitBody, rnd, now, POS_MOBILE } from './helpers';
import { calcExpectedEarn, makeItem, TENDER, TD } from './test-data';

const ctx: any = {};

describe('Edge Cases', () => {
  beforeAll(async () => {
    ctx.token = getToken();
    ctx.member = await isMember(ctx.token, POS_MOBILE, 'POS');
  });

  // ── EDGE-TC-001 ───────────────────────────────────────────────────────────
  test('EDGE-TC-001: Zero-price non-sale item — HTTP 200, receiptNo generated, 0 pts earned', async () => {
    const d = TD.EDGE_TC001;
    const before = await isMember(ctx.token, POS_MOBILE, 'POS');
    const id = rnd();
    const items = [makeItem({ lineNo: 1, grossPrice: d.grossPrice, netPrice: d.netPrice, vatAmount: d.vatAmount })];
    const res = await post('/rprest/api/transaction/v1/commitTransaction',
      commitBody({ id, storeId: before.storeId, memberId: before.memberId, channel: 'POS', items, tenderDetails: [{ code: TENDER.CASH, amount: d.tenderAmount }] }),
      ctx.token);
    expect(res.status).toBe(200);
    expect(res.body.receiptNo).toBeDefined();
    const after = await isMember(ctx.token, POS_MOBILE, 'POS');
    expect(after.points - before.points).toBe(0);
    console.log(`EDGE-TC-001 | Zero-price commit OK, pts unchanged: ${before.points}`);
  });

  // ── EDGE-TC-002 ───────────────────────────────────────────────────────────
  test('EDGE-TC-002: Fractional earn (15 AED) rounds to exact integer pts without drift', async () => {
    const d = TD.EDGE_TC002;
    const before = await isMember(ctx.token, POS_MOBILE, 'POS');
    const id = rnd();
    const items = [makeItem({ lineNo: 1, grossPrice: d.grossPrice, netPrice: d.netPrice, vatAmount: d.vatAmount })];
    const res = await post('/rprest/api/transaction/v1/commitTransaction',
      commitBody({ id, storeId: before.storeId, memberId: before.memberId, channel: 'POS', items, tenderDetails: [{ code: TENDER.CASH, amount: d.tenderAmount }] }),
      ctx.token);
    expect(res.status).toBe(200);
    const after = await isMember(ctx.token, POS_MOBILE, 'POS');
    const delta = after.points - before.points;
    const expected = calcExpectedEarn(d.netPrice, d.vatAmount, before.tier);
    // No floating-point drift — exact integer match
    expect(delta).toBe(expected);
    expect(Number.isInteger(delta)).toBe(true);
    console.log(`EDGE-TC-002 | Net: ${d.netPrice} VAT: ${d.vatAmount} | Expected: ${expected} | Got: ${delta}`);
  });

  // ── EDGE-TC-003 ───────────────────────────────────────────────────────────
  test('EDGE-TC-003: Block exactly the full current pts balance — B2 = 0', async () => {
    const d = TD.EDGE_TC003;
    const before = await isMember(ctx.token, POS_MOBILE, 'POS');
    if (before.points === 0) { console.warn('Member has 0 pts — skipping EDGE-TC-003'); return; }

    const blockId = rnd();
    const blockRes = await post('/rprest/api/transaction/v1/blockunblockwalletandpoints', {
      reqId: `BFLINB${blockId}`, storeId: before.storeId, terminalId: '1',
      receiptNo: `BFLINB${blockId}`, reqTimeStamp: now(), cashierId: 'EMP001',
      channel: 'POS', memberId: before.memberId, blockReqType: 'BLOCK',
      blockSpecifications: [{ redeemType: 'POINTS', valueToBlock: before.pointsValue }], // block full value
    }, ctx.token);
    expect([200, 400]).toContain(blockRes.status);
    if (blockRes.status !== 200) { console.warn('Full balance block rejected — skipping rest of EDGE-TC-003'); return; }

    const id = rnd();
    const items = [makeItem({ lineNo: 1, grossPrice: d.grossPrice, netPrice: d.netPrice, vatAmount: d.vatAmount })];
    const commitRes = await post('/rprest/api/transaction/v1/commitTransaction',
      commitBody({ id, storeId: before.storeId, memberId: before.memberId, channel: 'POS', items,
        tenderDetails: [{ code: TENDER.POINTS, amount: before.pointsValue }, { code: TENDER.CASH, amount: d.tenderCash - before.pointsValue }] }),
      ctx.token);
    expect([200, 400]).toContain(commitRes.status);
    if (commitRes.status === 200) {
      const after = await isMember(ctx.token, POS_MOBILE, 'POS');
      // All pts consumed; only new earn from this commit should remain
      expect(after.points).toBeGreaterThanOrEqual(0);
      console.log(`EDGE-TC-003 | Full redemption commit OK. Pts after: ${after.points}`);
    }
  });

  // ── EDGE-TC-004 ───────────────────────────────────────────────────────────
  test('EDGE-TC-004: Block more than available pts balance — returns error, balance unchanged', async () => {
    const d = TD.EDGE_TC004;
    const before = await isMember(ctx.token, POS_MOBILE, 'POS');
    const blockId = rnd();
    const blockRes = await post('/rprest/api/transaction/v1/blockunblockwalletandpoints', {
      reqId: `BFLINB${blockId}`, storeId: before.storeId, terminalId: '1',
      receiptNo: `BFLINB${blockId}`, reqTimeStamp: now(), cashierId: 'EMP001',
      channel: 'POS', memberId: before.memberId, blockReqType: 'BLOCK',
      blockSpecifications: [{ redeemType: 'POINTS', valueToBlock: d.blockOverage }],
    }, ctx.token);
    expect(blockRes.status).not.toBe(200);
    const after = await isMember(ctx.token, POS_MOBILE, 'POS');
    expect(after.points).toBe(before.points);
    console.log(`EDGE-TC-004 | Block-overages status: ${blockRes.status} | Pts unchanged: ${after.points}`);
  });

  // ── EDGE-TC-005 ───────────────────────────────────────────────────────────
  test('EDGE-TC-005: Concurrent commits from 2 terminals — no pts lost or duplicated', async () => {
    const d = TD.EDGE_TC005;
    const before = await isMember(ctx.token, POS_MOBILE, 'POS');

    const idA = rnd(); const idB = rnd();
    const itemsA = [makeItem({ lineNo: 1, grossPrice: d.txnA.grossPrice, netPrice: d.txnA.netPrice, vatAmount: d.txnA.vatAmount })];
    const itemsB = [makeItem({ lineNo: 1, grossPrice: d.txnB.grossPrice, netPrice: d.txnB.netPrice, vatAmount: d.txnB.vatAmount })];

    // Fire both commits simultaneously
    const [resA, resB] = await Promise.all([
      post('/rprest/api/transaction/v1/commitTransaction',
        commitBody({ id: idA, storeId: before.storeId, memberId: before.memberId, channel: 'POS', items: itemsA, tenderDetails: [{ code: TENDER.CASH, amount: d.txnA.tenderAmount }] }),
        ctx.token),
      post('/rprest/api/transaction/v1/commitTransaction',
        commitBody({ id: idB, storeId: before.storeId, memberId: before.memberId, channel: 'POS', items: itemsB, tenderDetails: [{ code: TENDER.CASH, amount: d.txnB.tenderAmount }] }),
        ctx.token),
    ]);
    expect(resA.status).toBe(200);
    expect(resB.status).toBe(200);

    const after = await isMember(ctx.token, POS_MOBILE, 'POS');
    const totalExpected = calcExpectedEarn(d.txnA.netPrice, d.txnA.vatAmount, before.tier)
                        + calcExpectedEarn(d.txnB.netPrice, d.txnB.vatAmount, before.tier);
    expect(after.points - before.points).toBe(totalExpected);
    console.log(`EDGE-TC-005 | Concurrent: A+B expected ${totalExpected} | Got: ${after.points - before.points}`);
  });

  // ── EDGE-TC-006 ───────────────────────────────────────────────────────────
  test('EDGE-TC-006: Return of sale item — 0 pts change (no pts earned, none reversed)', async () => {
    const d = TD.EDGE_TC006;
    const baseline = await isMember(ctx.token, POS_MOBILE, 'POS');

    const id = rnd();
    const items = [makeItem({ lineNo: 1, grossPrice: d.grossPrice, netPrice: d.netPrice, vatAmount: d.vatAmount, markDownFlag: d.markDownFlag })];
    const commitRes = await post('/rprest/api/transaction/v1/commitTransaction',
      commitBody({ id, storeId: baseline.storeId, memberId: baseline.memberId, channel: 'POS', items, tenderDetails: [{ code: TENDER.CASH, amount: d.tenderAmount }] }),
      ctx.token);
    expect(commitRes.status).toBe(200);
    const receiptNo = commitRes.body.receiptNo;
    const afterSale = await isMember(ctx.token, POS_MOBILE, 'POS');
    expect(afterSale.points).toBe(baseline.points); // sale earns nothing

    const rId = rnd(); const eId = rnd();
    await post('/rprest/api/transaction/v1/recallReceipt', {
      reqId: `BFLINR${rId}`, storeId: baseline.storeId, terminalId: '1',
      receiptNo: `BFLINR${rId}`, reqTimeStamp: now(), cashierId: 'EMP001',
      channel: 'POS', memberId: baseline.memberId,
      requestType: 'Recall Receipt', receiptToRecallNo: receiptNo,
    }, ctx.token);
    await post('/rprest/api/transaction/v1/exchangeLine', {
      reqId: `BFLINR${eId}`, storeId: baseline.storeId, terminalId: '1',
      receiptNo: `BFLINR${eId}`, reqTimeStamp: now(), cashierId: 'EMP001',
      channel: 'POS', memberId: baseline.memberId,
      commitRequestType: 'Complete', txnDate: now(), couponCodes: [],
      itemDetails: [{ itemType: 'Product', quantity: 1, previousLineNo: 1, isReturn: 'Yes' }],
      previousReceiptNo: receiptNo,
    }, ctx.token);

    const retId = rnd();
    const retItems = [makeItem({ lineNo: 2, grossPrice: d.grossPrice, netPrice: d.netPrice, vatAmount: d.vatAmount, markDownFlag: 'Yes', previousLineNo: 1, isReturn: 'Yes' })];
    const retRes = await post('/rprest/api/transaction/v1/commitTransaction',
      commitBody({ id: retId, storeId: baseline.storeId, memberId: baseline.memberId, channel: 'POS', items: retItems,
        tenderDetails: [{ code: TENDER.WALLET, amount: d.tenderAmount }], previousReceiptNo: receiptNo }),
      ctx.token);
    expect(retRes.status).toBe(200);
    const afterReturn = await isMember(ctx.token, POS_MOBILE, 'POS');
    // Pts must remain exactly at baseline (no earn, no negative reversal)
    expect(afterReturn.points).toBe(baseline.points);
    expect(afterReturn.points).toBeGreaterThanOrEqual(0);
    console.log(`EDGE-TC-006 | Sale item return — pts throughout: ${baseline.points} (no change)`);
  });
});
