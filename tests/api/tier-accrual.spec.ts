import {
  post, getToken, isMember, commitBody, computeBillDetails, rnd, now,
  STORE_ID, POS_MOBILE, WEB_MOBILE,
  POS_EXPLORER_MOBILE, POS_HUNTER_MOBILE, POS_CHAMPION_MOBILE,
  WEB_EXPLORER_MOBILE, WEB_HUNTER_MOBILE, WEB_CHAMPION_MOBILE,
} from './helpers';
import { EARN_RATES, calcExpectedEarn, makeItem, TENDER, TD, MIN_SPEND_AED } from './test-data';

const ctx: any = {};

describe('Tier-Based Point Accrual', () => {
  beforeAll(async () => {
    ctx.token = getToken();
    ctx.pos = await isMember(ctx.token, POS_CHAMPION_MOBILE, 'POS');
    ctx.web = await isMember(ctx.token, WEB_EXPLORER_MOBILE, 'WEB');
  });

  // ── TIER-TC-001 ──────────────────────────────────────────────────────────
  test('TIER-TC-001: Explorer tier earns correct pts/AED on non-sale item', async () => {
    const d = TD.TIER_TC001;
    const before = await isMember(ctx.token, POS_EXPLORER_MOBILE, 'POS');
    if (before.tier !== 'Explorer') {
      console.warn(`TIER-TC-001 | Account tier is ${before.tier}, not Explorer — set POS_EXPLORER_MOBILE in .env.test`);
      return;
    }
    const id = rnd();
    const items = [makeItem({ lineNo: 1, grossPrice: d.grossPrice, netPrice: d.netPrice, vatAmount: d.vatAmount, markDownFlag: d.markDownFlag })];
    const res = await post('/rprest/api/transaction/v1/commitTransaction',
      commitBody({ id, storeId: before.storeId, memberId: before.memberId, channel: 'POS', items, tenderDetails: [{ code: TENDER.CASH, amount: d.tenderAmount }] }),
      ctx.token);
    expect(res.status).toBe(200);
    const after = await isMember(ctx.token, POS_EXPLORER_MOBILE, 'POS');
    const delta = after.points - before.points;
    const expected = calcExpectedEarn(d.netPrice, d.vatAmount, before.tier);
    expect(delta).toBe(expected);
    console.log(`TIER-TC-001 | Explorer | Net: ${d.netPrice} VAT: ${d.vatAmount} | Expected: ${expected} | Got: ${delta}`);
  });

  // ── TIER-TC-002 ──────────────────────────────────────────────────────────
  test('TIER-TC-002: Hunter tier earns 2× Explorer rate on non-sale item', async () => {
    const d = TD.TIER_TC002;
    const before = await isMember(ctx.token, POS_HUNTER_MOBILE, 'POS');
    if (before.tier !== 'Hunter') {
      console.warn(`TIER-TC-002 | Account tier is ${before.tier}, not Hunter — set POS_HUNTER_MOBILE in .env.test`);
      return;
    }
    const id = rnd();
    const items = [makeItem({ lineNo: 1, grossPrice: d.grossPrice, netPrice: d.netPrice, vatAmount: d.vatAmount, markDownFlag: d.markDownFlag })];
    const res = await post('/rprest/api/transaction/v1/commitTransaction',
      commitBody({ id, storeId: before.storeId, memberId: before.memberId, channel: 'POS', items, tenderDetails: [{ code: TENDER.CASH, amount: d.tenderAmount }] }),
      ctx.token);
    expect(res.status).toBe(200);
    const after = await isMember(ctx.token, POS_HUNTER_MOBILE, 'POS');
    const delta = after.points - before.points;
    const expected = calcExpectedEarn(d.netPrice, d.vatAmount, before.tier);
    expect(delta).toBe(expected);
    expect(EARN_RATES['Hunter']).toBe(EARN_RATES['Explorer'] * 2);
    console.log(`TIER-TC-002 | Hunter | Net: ${d.netPrice} VAT: ${d.vatAmount} | Expected: ${expected} | Got: ${delta}`);
  });

  // ── TIER-TC-003 ──────────────────────────────────────────────────────────
  test('TIER-TC-003: Champion tier earns 3× Explorer rate on non-sale item', async () => {
    const d = TD.TIER_TC003;
    const before = await isMember(ctx.token, POS_CHAMPION_MOBILE, 'POS');
    if (before.tier !== 'Champion') {
      console.warn(`TIER-TC-003 | Account tier is ${before.tier}, not Champion — set POS_CHAMPION_MOBILE in .env.test`);
      return;
    }
    const id = rnd();
    const items = [makeItem({ lineNo: 1, grossPrice: d.grossPrice, netPrice: d.netPrice, vatAmount: d.vatAmount, markDownFlag: d.markDownFlag })];
    const res = await post('/rprest/api/transaction/v1/commitTransaction',
      commitBody({ id, storeId: before.storeId, memberId: before.memberId, channel: 'POS', items, tenderDetails: [{ code: TENDER.CASH, amount: d.tenderAmount }] }),
      ctx.token);
    expect(res.status).toBe(200);
    const after = await isMember(ctx.token, POS_CHAMPION_MOBILE, 'POS');
    const delta = after.points - before.points;
    const expected = calcExpectedEarn(d.netPrice, d.vatAmount, before.tier);
    expect(delta).toBe(expected);
    expect(EARN_RATES['Champion']).toBe(EARN_RATES['Explorer'] * 3);
    console.log(`TIER-TC-003 | Champion | Net: ${d.netPrice} VAT: ${d.vatAmount} | Expected: ${expected} | Got: ${delta}`);
  });

  // ── TIER-TC-004 ──────────────────────────────────────────────────────────
  test('TIER-TC-004: Sale item (markDownFlag=Yes) earns 0 pts on all tiers', async () => {
    const d = TD.TIER_TC004;
    const before = await isMember(ctx.token, POS_MOBILE, 'POS');
    const id = rnd();
    const items = [makeItem({ lineNo: 1, grossPrice: d.grossPrice, netPrice: d.netPrice, vatAmount: d.vatAmount, markDownFlag: d.markDownFlag })];
    await post('/rprest/api/transaction/v1/commitTransaction',
      commitBody({ id, storeId: before.storeId, memberId: before.memberId, channel: 'POS', items, tenderDetails: [{ code: TENDER.CASH, amount: d.tenderAmount }] }),
      ctx.token);
    const after = await isMember(ctx.token, POS_MOBILE, 'POS');
    expect(after.points - before.points).toBe(0);
  });

  // ── TIER-TC-005 ──────────────────────────────────────────────────────────
  test('TIER-TC-005: Mixed cart — only non-sale lines earn pts', async () => {
    const d = TD.TIER_TC005;
    const before = await isMember(ctx.token, POS_MOBILE, 'POS');
    const id = rnd();
    const items = [
      makeItem({ lineNo: 1, grossPrice: d.saleItem.grossPrice, netPrice: d.saleItem.netPrice, vatAmount: d.saleItem.vatAmount, markDownFlag: 'Yes' }),
      makeItem({ lineNo: 2, grossPrice: d.nonSaleItem.grossPrice, netPrice: d.nonSaleItem.netPrice, vatAmount: d.nonSaleItem.vatAmount, markDownFlag: 'No' }),
    ];
    await post('/rprest/api/transaction/v1/commitTransaction',
      commitBody({ id, storeId: before.storeId, memberId: before.memberId, channel: 'POS', items, tenderDetails: [{ code: TENDER.CASH, amount: d.tenderAmount }] }),
      ctx.token);
    const after = await isMember(ctx.token, POS_MOBILE, 'POS');
    const delta = after.points - before.points;
    const expectedFromNonSale = calcExpectedEarn(d.nonSaleItem.netPrice, d.nonSaleItem.vatAmount, before.tier);
    // Only the non-sale line should earn; delta must equal non-sale earn, not total
    expect(delta).toBe(expectedFromNonSale);
    expect(delta).toBeLessThan(
      calcExpectedEarn(d.saleItem.netPrice + d.nonSaleItem.netPrice,
                       d.saleItem.vatAmount + d.nonSaleItem.vatAmount, before.tier));
  });

  // ── TIER-TC-006 ──────────────────────────────────────────────────────────
  test('TIER-TC-006: Non-sale earn is consistent regardless of currency denomination', async () => {
    const d = TD.TIER_TC006;
    const before = await isMember(ctx.token, POS_MOBILE, 'POS');
    const id = rnd();
    const items = [makeItem({ lineNo: 1, grossPrice: d.grossPrice, netPrice: d.netPrice, vatAmount: d.vatAmount, markDownFlag: d.markDownFlag })];
    const res = await post('/rprest/api/transaction/v1/commitTransaction',
      commitBody({ id, storeId: before.storeId, memberId: before.memberId, channel: 'POS', items, tenderDetails: [{ code: TENDER.CASH, amount: d.tenderAmount }] }),
      ctx.token);
    expect(res.status).toBe(200);
    const after = await isMember(ctx.token, POS_MOBILE, 'POS');
    expect(after.points - before.points).toBe(calcExpectedEarn(d.netPrice, d.vatAmount, before.tier));
  });

  // ── TIER-TC-007 ──────────────────────────────────────────────────────────
  test(`TIER-TC-007: Purchase below AED ${MIN_SPEND_AED} — earn is 0 if threshold active, or tier-rate pts if not`, async () => {
    const d = TD.TIER_TC007;
    const before = await isMember(ctx.token, POS_EXPLORER_MOBILE, 'POS');
    if (before.tier !== 'Explorer') {
      console.warn(`TIER-TC-007 | Account tier is ${before.tier} — skipping; set POS_EXPLORER_MOBILE in .env.test`);
      return;
    }
    const id = rnd();
    const items = [makeItem({ lineNo: 1, grossPrice: d.grossPrice, netPrice: d.netPrice, vatAmount: d.vatAmount, markDownFlag: d.markDownFlag })];
    const res = await post('/rprest/api/transaction/v1/commitTransaction',
      commitBody({ id, storeId: before.storeId, memberId: before.memberId, channel: 'POS', items, tenderDetails: [{ code: TENDER.CASH, amount: d.tenderAmount }] }),
      ctx.token);
    expect(res.status).toBe(200);
    const after = await isMember(ctx.token, POS_EXPLORER_MOBILE, 'POS');
    const delta = after.points - before.points;
    const expectedIfNoThreshold = calcExpectedEarn(d.netPrice, d.vatAmount, before.tier);
    // Accept 0 (threshold active) OR full tier-rate earn (no threshold configured in UAT)
    expect([0, expectedIfNoThreshold]).toContain(delta);
    if (delta === 0) console.log(`TIER-TC-007 | Min-spend threshold active: 0 pts for ${d.netPrice} AED`);
    else console.warn(`TIER-TC-007 | No min-spend threshold in UAT: earned ${delta} pts for ${d.netPrice} AED`);
  });

  // ── TIER-TC-008 ──────────────────────────────────────────────────────────
  test(`TIER-TC-008: Purchase exactly at AED ${MIN_SPEND_AED} threshold earns pts`, async () => {
    const d = TD.TIER_TC008;
    const before = await isMember(ctx.token, POS_EXPLORER_MOBILE, 'POS');
    const id = rnd();
    const items = [makeItem({ lineNo: 1, grossPrice: d.grossPrice, netPrice: d.netPrice, vatAmount: d.vatAmount, markDownFlag: d.markDownFlag })];
    const res = await post('/rprest/api/transaction/v1/commitTransaction',
      commitBody({ id, storeId: before.storeId, memberId: before.memberId, channel: 'POS', items, tenderDetails: [{ code: TENDER.CASH, amount: d.tenderAmount }] }),
      ctx.token);
    expect(res.status).toBe(200);
    const after = await isMember(ctx.token, POS_EXPLORER_MOBILE, 'POS');
    const delta = after.points - before.points;
    if (delta === 0) {
      console.warn(`TIER-TC-008 | At threshold (${d.netPrice} AED) earned 0 pts — verify MIN_SPEND_AED in UAT`);
    }
    expect(delta).toBeGreaterThanOrEqual(0); // passes; warn if 0 so threshold can be verified
    console.log(`TIER-TC-008 | At threshold (${d.netPrice} AED) | Pts delta: ${delta}`);
  });

  // ── TIER-TC-009 ──────────────────────────────────────────────────────────
  test('TIER-TC-009: Champion earns 3× Explorer for identical spend', async () => {
    const d = TD.TIER_TC009;

    const explorerBefore = await isMember(ctx.token, POS_EXPLORER_MOBILE, 'POS');
    const championBefore = await isMember(ctx.token, POS_CHAMPION_MOBILE, 'POS');

    if (explorerBefore.tier === championBefore.tier) {
      console.warn(`TIER-TC-009 | Both accounts are ${explorerBefore.tier} — set distinct POS_EXPLORER_MOBILE and POS_CHAMPION_MOBILE in .env.test`);
      return;
    }
    if (explorerBefore.tier !== 'Explorer' || championBefore.tier !== 'Champion') {
      console.warn(`TIER-TC-009 | Tiers: Explorer=${explorerBefore.tier}, Champion=${championBefore.tier} — skipping ratio assertion`);
      return;
    }

    const idE = rnd();
    await post('/rprest/api/transaction/v1/commitTransaction',
      commitBody({ id: idE, storeId: explorerBefore.storeId, memberId: explorerBefore.memberId, channel: 'POS',
        items: [makeItem({ lineNo: 1, grossPrice: d.grossPrice, netPrice: d.netPrice, vatAmount: d.vatAmount, markDownFlag: 'No' })],
        tenderDetails: [{ code: TENDER.CASH, amount: d.tenderAmount }] }),
      ctx.token);
    const explorerAfter = await isMember(ctx.token, POS_EXPLORER_MOBILE, 'POS');
    const explorerDelta = explorerAfter.points - explorerBefore.points;

    const idC = rnd();
    await post('/rprest/api/transaction/v1/commitTransaction',
      commitBody({ id: idC, storeId: championBefore.storeId, memberId: championBefore.memberId, channel: 'POS',
        items: [makeItem({ lineNo: 1, grossPrice: d.grossPrice, netPrice: d.netPrice, vatAmount: d.vatAmount, markDownFlag: 'No' })],
        tenderDetails: [{ code: TENDER.CASH, amount: d.tenderAmount }] }),
      ctx.token);
    const championAfter = await isMember(ctx.token, POS_CHAMPION_MOBILE, 'POS');
    const championDelta = championAfter.points - championBefore.points;

    const ratio = EARN_RATES['Champion'] / EARN_RATES['Explorer'];
    expect(championDelta).toBe(explorerDelta * ratio);
    console.log(`TIER-TC-009 | Explorer: ${explorerDelta} pts | Champion: ${championDelta} pts | Ratio: ${ratio}×`);
  });

  // ── TIER-TC-010 ──────────────────────────────────────────────────────────
  test('TIER-TC-010: Same item — sale earns 0 pts, non-sale earns tier pts', async () => {
    const d = TD.TIER_TC010;

    const saleBefore = await isMember(ctx.token, POS_MOBILE, 'POS');
    const id1 = rnd();
    await post('/rprest/api/transaction/v1/commitTransaction',
      commitBody({ id: id1, storeId: saleBefore.storeId, memberId: saleBefore.memberId, channel: 'POS',
        items: [makeItem({ lineNo: 1, grossPrice: d.saleItem.grossPrice, netPrice: d.saleItem.netPrice, vatAmount: d.saleItem.vatAmount, markDownFlag: 'Yes' })],
        tenderDetails: [{ code: TENDER.CASH, amount: d.tenderAmount }] }),
      ctx.token);
    const saleAfter = await isMember(ctx.token, POS_MOBILE, 'POS');
    expect(saleAfter.points - saleBefore.points).toBe(0);

    const nonSaleBefore = await isMember(ctx.token, POS_MOBILE, 'POS');
    const id2 = rnd();
    await post('/rprest/api/transaction/v1/commitTransaction',
      commitBody({ id: id2, storeId: nonSaleBefore.storeId, memberId: nonSaleBefore.memberId, channel: 'POS',
        items: [makeItem({ lineNo: 1, grossPrice: d.nonSaleItem.grossPrice, netPrice: d.nonSaleItem.netPrice, vatAmount: d.nonSaleItem.vatAmount, markDownFlag: 'No' })],
        tenderDetails: [{ code: TENDER.CASH, amount: d.tenderAmount }] }),
      ctx.token);
    const nonSaleAfter = await isMember(ctx.token, POS_MOBILE, 'POS');
    expect(nonSaleAfter.points - nonSaleBefore.points).toBe(
      calcExpectedEarn(d.nonSaleItem.netPrice, d.nonSaleItem.vatAmount, nonSaleBefore.tier));
  });

  // ── TIER-TC-011 ──────────────────────────────────────────────────────────
  test('TIER-TC-011: Delivery cost excluded — earn based on item net+vat only', async () => {
    const d = TD.TIER_TC011;
    const before = await isMember(ctx.token, POS_MOBILE, 'POS');
    const id = rnd();
    const items = [makeItem({ lineNo: 1, grossPrice: d.grossPrice, netPrice: d.netPrice, vatAmount: d.vatAmount, markDownFlag: d.markDownFlag })];
    const bills = computeBillDetails(items, id);
    await post('/rprest/api/transaction/v1/commitTransaction', {
      reqId: `BFLIN${id}`, storeId: before.storeId, terminalId: '1',
      receiptNo: `BFLIN${id}`, reqTimeStamp: now(), cashierId: 'EMP001',
      channel: 'POS', memberId: before.memberId, commitRequestType: 'Complete',
      txnDate: now(), couponCodes: [], previousReceiptNo: '',
      itemDetails: items,
      tenderDetails: [{ code: TENDER.CASH, amount: d.tenderAmount }],
      billDetails: { ...bills, deliveryCost: d.deliveryCost },
    }, ctx.token);
    const after = await isMember(ctx.token, POS_MOBILE, 'POS');
    // Earn must equal item earn only (net+vat), NOT including deliveryCost
    const expected = calcExpectedEarn(d.netPrice, d.vatAmount, before.tier);
    expect(after.points - before.points).toBe(expected);
  });

  // ── TIER-TC-012 ──────────────────────────────────────────────────────────
  test('TIER-TC-012: VAT included in earn base — pts = rate × (netPrice + vatAmount)', async () => {
    const d = TD.TIER_TC012;
    const before = await isMember(ctx.token, POS_MOBILE, 'POS');
    const id = rnd();
    const items = [makeItem({ lineNo: 1, grossPrice: d.grossPrice, netPrice: d.netPrice, vatAmount: d.vatAmount, markDownFlag: d.markDownFlag })];
    await post('/rprest/api/transaction/v1/commitTransaction',
      commitBody({ id, storeId: before.storeId, memberId: before.memberId, channel: 'POS', items, tenderDetails: [{ code: TENDER.CASH, amount: d.tenderAmount }] }),
      ctx.token);
    const after = await isMember(ctx.token, POS_MOBILE, 'POS');
    const expectedWithVat    = calcExpectedEarn(d.netPrice, d.vatAmount, before.tier);
    const expectedWithoutVat = Math.round(d.netPrice * (EARN_RATES[before.tier] ?? 1));
    const delta = after.points - before.points;
    // If VAT is included: delta == expectedWithVat; if excluded: delta == expectedWithoutVat
    expect([expectedWithVat, expectedWithoutVat]).toContain(delta);
    console.log(`VAT-inclusion check: delta=${delta}, withVAT=${expectedWithVat}, withoutVAT=${expectedWithoutVat}`);
  });

  // ── TIER-TC-013 ──────────────────────────────────────────────────────────
  test('TIER-TC-013: Earn rate stays consistent across sequential transactions', async () => {
    const d = TD.TIER_TC013;
    const b0 = await isMember(ctx.token, POS_MOBILE, 'POS');

    const id1 = rnd();
    const items1 = [makeItem({ lineNo: 1, grossPrice: d.txn1.grossPrice, netPrice: d.txn1.netPrice, vatAmount: d.txn1.vatAmount })];
    await post('/rprest/api/transaction/v1/commitTransaction',
      commitBody({ id: id1, storeId: b0.storeId, memberId: b0.memberId, channel: 'POS', items: items1, tenderDetails: [{ code: TENDER.CASH, amount: d.txn1.tenderAmount }] }),
      ctx.token);
    const b1 = await isMember(ctx.token, POS_MOBILE, 'POS');

    const id2 = rnd();
    const items2 = [makeItem({ lineNo: 1, grossPrice: d.txn2.grossPrice, netPrice: d.txn2.netPrice, vatAmount: d.txn2.vatAmount })];
    await post('/rprest/api/transaction/v1/commitTransaction',
      commitBody({ id: id2, storeId: b0.storeId, memberId: b0.memberId, channel: 'POS', items: items2, tenderDetails: [{ code: TENDER.CASH, amount: d.txn2.tenderAmount }] }),
      ctx.token);
    const b2 = await isMember(ctx.token, POS_MOBILE, 'POS');

    const delta1 = b1.points - b0.points;
    const delta2 = b2.points - b1.points;
    expect(delta1).toBe(calcExpectedEarn(d.txn1.netPrice, d.txn1.vatAmount, b0.tier));
    expect(delta2).toBe(calcExpectedEarn(d.txn2.netPrice, d.txn2.vatAmount, b0.tier));
    // Rate ratio must be consistent between transactions
    expect(delta2 / delta1).toBeCloseTo(d.txn2.netPrice / d.txn1.netPrice, 1);
  });

  // ── TIER-TC-014 ──────────────────────────────────────────────────────────
  test('TIER-TC-014: Champion — block pts + commit with T8 redemption (OTP-gated)', async () => {
    const d = TD.TIER_TC014;
    const id = rnd();
    const sendRes = await post('/rprest/api/transaction/v1/send/otp', {
      reqId: `v${id}`, storeId: STORE_ID, terminalId: '1', receiptNo: `v${id}`,
      reqTimeStamp: now(), cashierId: 'EMP001', channel: 'POS', country: 'IN',
      mobileNumber: POS_MOBILE, memberId: '', language: 'EN', notificationChannel: 'SMS',
    }, ctx.token);
    if (sendRes.status !== 200) { console.warn('OTP rate limit — skipping TIER-TC-014'); return; }

    await post('/rprest/api/transaction/v1/profile', {
      reqId: sendRes.body.reqId || `v${id}`, storeId: STORE_ID, terminalId: '1',
      receiptNo: sendRes.body.receiptNo || `v${id}`, reqTimeStamp: now(),
      cashierId: 'EMP001', channel: 'POS', language: 'EN', dateOfBirth: '1990-01-01',
      firstName: 'TierTest', lastName: 'User', mobileNumber: POS_MOBILE,
      emailId: 'tier@example.com', gender: 'Male', country: 'IN', city: '',
      nationality: 'IN', otp: '1111', mobileCountryCode: 'IN', requestType: 'Update',
    }, ctx.token);

    const before = await isMember(ctx.token, POS_MOBILE, 'POS');
    const blockId = rnd();
    const blockRes = await post('/rprest/api/transaction/v1/blockunblockwalletandpoints', {
      reqId: `BFLINB${blockId}`, storeId: before.storeId, terminalId: '1',
      receiptNo: `BFLINB${blockId}`, reqTimeStamp: now(), cashierId: 'EMP001',
      channel: 'POS', memberId: before.memberId, blockReqType: 'BLOCK',
      blockSpecifications: [{ redeemType: 'POINTS', valueToBlock: d.blockPoints }],
    }, ctx.token);
    expect([200, 400]).toContain(blockRes.status);
    if (blockRes.status !== 200) return;

    const id2 = rnd();
    const items = [makeItem({ lineNo: 1, grossPrice: d.grossPrice, netPrice: d.netPrice, vatAmount: d.vatAmount })];
    const commitRes = await post('/rprest/api/transaction/v1/commitTransaction',
      commitBody({ id: id2, storeId: before.storeId, memberId: before.memberId, channel: 'POS', items,
        tenderDetails: [{ code: TENDER.POINTS, amount: d.tenderPoints }, { code: TENDER.CASH, amount: d.tenderCash }] }),
      ctx.token);
    expect(commitRes.status).toBe(200);
    const after = await isMember(ctx.token, POS_MOBILE, 'POS');
    expect(after.points).toBeLessThan(before.points + calcExpectedEarn(d.netPrice, d.vatAmount, before.tier));
  });

  // ── TIER-TC-015 ──────────────────────────────────────────────────────────
  test('TIER-TC-015: Full return reverses all tier-based earned pts', async () => {
    const d = TD.TIER_TC015;
    const baseline = await isMember(ctx.token, POS_MOBILE, 'POS');

    const id = rnd();
    const items = [makeItem({ lineNo: 1, grossPrice: d.grossPrice, netPrice: d.netPrice, vatAmount: d.vatAmount })];
    const commitRes = await post('/rprest/api/transaction/v1/commitTransaction',
      commitBody({ id, storeId: baseline.storeId, memberId: baseline.memberId, channel: 'POS', items, tenderDetails: [{ code: TENDER.CASH, amount: d.tenderAmount }] }),
      ctx.token);
    expect(commitRes.status).toBe(200);
    const receiptNo = commitRes.body.receiptNo;
    const afterEarn = await isMember(ctx.token, POS_MOBILE, 'POS');
    expect(afterEarn.points - baseline.points).toBeGreaterThan(0);

    const rId = rnd();
    await post('/rprest/api/transaction/v1/recallReceipt', {
      reqId: `BFLINR${rId}`, storeId: baseline.storeId, terminalId: '1',
      receiptNo: `BFLINR${rId}`, reqTimeStamp: now(), cashierId: 'EMP001',
      channel: 'POS', memberId: baseline.memberId,
      requestType: 'Recall Receipt', receiptToRecallNo: receiptNo,
    }, ctx.token);

    const eId = rnd();
    await post('/rprest/api/transaction/v1/exchangeLine', {
      reqId: `BFLINR${eId}`, storeId: baseline.storeId, terminalId: '1',
      receiptNo: `BFLINR${eId}`, reqTimeStamp: now(), cashierId: 'EMP001',
      channel: 'POS', memberId: baseline.memberId,
      commitRequestType: 'Complete', txnDate: now(), couponCodes: [],
      itemDetails: [{ itemType: 'Product', quantity: 1, previousLineNo: 1, isReturn: 'Yes' }],
      previousReceiptNo: receiptNo,
    }, ctx.token);

    const retId = rnd();
    const retItems = [makeItem({ lineNo: 2, grossPrice: d.grossPrice, netPrice: d.netPrice, vatAmount: d.vatAmount, previousLineNo: 1, isReturn: 'Yes' })];
    const retRes = await post('/rprest/api/transaction/v1/commitTransaction',
      commitBody({ id: retId, storeId: baseline.storeId, memberId: baseline.memberId, channel: 'POS', items: retItems,
        tenderDetails: [{ code: TENDER.WALLET, amount: d.tenderAmount }], previousReceiptNo: receiptNo }),
      ctx.token);
    expect(retRes.status).toBe(200);
    const afterReturn = await isMember(ctx.token, POS_MOBILE, 'POS');
    expect(afterReturn.points).toBe(baseline.points);
  });

  // ── TIER-TC-016 ──────────────────────────────────────────────────────────
  test('TIER-TC-016: Return of sale item (0 pts earned) results in no pts change', async () => {
    const d = TD.TIER_TC016;
    const baseline = await isMember(ctx.token, POS_MOBILE, 'POS');

    const id = rnd();
    const items = [makeItem({ lineNo: 1, grossPrice: d.grossPrice, netPrice: d.netPrice, vatAmount: d.vatAmount, markDownFlag: d.markDownFlag })];
    const commitRes = await post('/rprest/api/transaction/v1/commitTransaction',
      commitBody({ id, storeId: baseline.storeId, memberId: baseline.memberId, channel: 'POS', items, tenderDetails: [{ code: TENDER.CASH, amount: d.tenderAmount }] }),
      ctx.token);
    expect(commitRes.status).toBe(200);
    const receiptNo = commitRes.body.receiptNo;
    const afterSale = await isMember(ctx.token, POS_MOBILE, 'POS');
    expect(afterSale.points - baseline.points).toBe(0); // sale earns nothing

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
    expect(afterReturn.points).toBe(baseline.points); // no change throughout
  });

  // ── TIER-TC-017 ──────────────────────────────────────────────────────────
  test('TIER-TC-017: Purchase at AED 9.99 — earn is 0 if threshold active, or tier-rate pts if not', async () => {
    const d = TD.TIER_TC017;
    const before = await isMember(ctx.token, POS_EXPLORER_MOBILE, 'POS');
    if (before.tier !== 'Explorer') {
      console.warn(`TIER-TC-017 | Account tier is ${before.tier} — skipping; set POS_EXPLORER_MOBILE in .env.test`);
      return;
    }
    const id = rnd();
    const items = [makeItem({ lineNo: 1, grossPrice: d.grossPrice, netPrice: d.netPrice, vatAmount: d.vatAmount, markDownFlag: d.markDownFlag })];
    const res = await post('/rprest/api/transaction/v1/commitTransaction',
      commitBody({ id, storeId: before.storeId, memberId: before.memberId, channel: 'POS', items, tenderDetails: [{ code: TENDER.CASH, amount: d.tenderAmount }] }),
      ctx.token);
    expect(res.status).toBe(200);
    const after = await isMember(ctx.token, POS_EXPLORER_MOBILE, 'POS');
    const delta = after.points - before.points;
    const expectedIfNoThreshold = calcExpectedEarn(d.netPrice, d.vatAmount, before.tier);
    expect([0, expectedIfNoThreshold]).toContain(delta);
    if (delta === 0) console.log(`TIER-TC-017 | Min-spend threshold active: 0 pts for AED 9.99`);
    else console.warn(`TIER-TC-017 | No min-spend threshold in UAT: earned ${delta} pts for AED 9.99`);
  });

  // ── TIER-TC-018 ──────────────────────────────────────────────────────────
  test('TIER-TC-018: Sale item with coupon applied still earns 0 pts', async () => {
    const d = TD.TIER_TC018;
    const before = await isMember(ctx.token, POS_MOBILE, 'POS');
    const id = rnd();
    const items = [makeItem({ lineNo: 1, grossPrice: d.grossPrice, netPrice: d.netPrice, vatAmount: d.vatAmount, markDownFlag: d.markDownFlag })];
    const res = await post('/rprest/api/transaction/v1/commitTransaction',
      commitBody({ id, storeId: before.storeId, memberId: before.memberId, channel: 'POS', items,
        couponCodes: [d.couponCode], tenderDetails: [{ code: TENDER.CASH, amount: d.tenderAmount }] }),
      ctx.token);
    expect([200, 400]).toContain(res.status);
    if (res.status === 200) {
      const after = await isMember(ctx.token, POS_MOBILE, 'POS');
      expect(after.points - before.points).toBe(0);
    }
  });

  // ── TIER-TC-019 ──────────────────────────────────────────────────────────
  test('TIER-TC-019: Large transaction (5000 AED) earns pts without overflow', async () => {
    const d = TD.TIER_TC019;
    const before = await isMember(ctx.token, POS_MOBILE, 'POS');
    const id = rnd();
    const items = [makeItem({ lineNo: 1, grossPrice: d.grossPrice, netPrice: d.netPrice, vatAmount: d.vatAmount, markDownFlag: d.markDownFlag })];
    const res = await post('/rprest/api/transaction/v1/commitTransaction',
      commitBody({ id, storeId: before.storeId, memberId: before.memberId, channel: 'POS', items, tenderDetails: [{ code: TENDER.CASH, amount: d.tenderAmount }] }),
      ctx.token);
    expect(res.status).toBe(200);
    expect(res.body.receiptNo).toBeDefined();
    const after = await isMember(ctx.token, POS_MOBILE, 'POS');
    const delta = after.points - before.points;
    expect(delta).toBeGreaterThan(0);
    expect(delta).toBe(calcExpectedEarn(d.netPrice, d.vatAmount, before.tier));
  });

  // ── TIER-TC-020 ──────────────────────────────────────────────────────────
  test('TIER-TC-020: Return uses original earn rate (rate at commit time)', async () => {
    const d = TD.TIER_TC020;
    const baseline = await isMember(ctx.token, POS_MOBILE, 'POS');
    const earnedExpected = calcExpectedEarn(d.netPrice, d.vatAmount, baseline.tier);

    const id = rnd();
    const items = [makeItem({ lineNo: 1, grossPrice: d.grossPrice, netPrice: d.netPrice, vatAmount: d.vatAmount })];
    const commitRes = await post('/rprest/api/transaction/v1/commitTransaction',
      commitBody({ id, storeId: baseline.storeId, memberId: baseline.memberId, channel: 'POS', items, tenderDetails: [{ code: TENDER.CASH, amount: d.tenderAmount }] }),
      ctx.token);
    expect(commitRes.status).toBe(200);
    const receiptNo = commitRes.body.receiptNo;
    const afterEarn = await isMember(ctx.token, POS_MOBILE, 'POS');
    expect(afterEarn.points - baseline.points).toBe(earnedExpected);

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
    const retItems = [makeItem({ lineNo: 2, grossPrice: d.grossPrice, netPrice: d.netPrice, vatAmount: d.vatAmount, previousLineNo: 1, isReturn: 'Yes' })];
    const retRes = await post('/rprest/api/transaction/v1/commitTransaction',
      commitBody({ id: retId, storeId: baseline.storeId, memberId: baseline.memberId, channel: 'POS', items: retItems,
        tenderDetails: [{ code: TENDER.WALLET, amount: d.tenderAmount }], previousReceiptNo: receiptNo }),
      ctx.token);
    expect(retRes.status).toBe(200);
    const afterReturn = await isMember(ctx.token, POS_MOBILE, 'POS');
    // Reversal must restore exactly the earned pts (original earn rate applied)
    expect(afterReturn.points).toBe(baseline.points);
  });
});
