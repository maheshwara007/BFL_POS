import { post, getToken, isMember, commitBody, rnd, now, POS_MOBILE } from './helpers';
import { calcExpectedEarn, makeItem, TENDER, TD } from './test-data';

const ctx: any = {};

describe('Return & Point Reversal', () => {
  beforeAll(async () => {
    ctx.token = getToken();
    ctx.member = await isMember(ctx.token, POS_MOBILE, 'POS');
  });

  async function doRecallAndExchange(token: string, storeId: string, memberId: number, receiptNo: string, returnLines: Array<{ previousLineNo: number; quantity: number }>) {
    const rId = rnd();
    await post('/rprest/api/transaction/v1/recallReceipt', {
      reqId: `BFLINR${rId}`, storeId, terminalId: '1',
      receiptNo: `BFLINR${rId}`, reqTimeStamp: now(), cashierId: 'EMP001',
      channel: 'POS', memberId, requestType: 'Recall Receipt', receiptToRecallNo: receiptNo,
    }, token);
    const eId = rnd();
    await post('/rprest/api/transaction/v1/exchangeLine', {
      reqId: `BFLINR${eId}`, storeId, terminalId: '1',
      receiptNo: `BFLINR${eId}`, reqTimeStamp: now(), cashierId: 'EMP001',
      channel: 'POS', memberId, commitRequestType: 'Complete', txnDate: now(), couponCodes: [],
      itemDetails: returnLines.map(l => ({ itemType: 'Product', quantity: l.quantity, previousLineNo: l.previousLineNo, isReturn: 'Yes' })),
      previousReceiptNo: receiptNo,
    }, token);
  }

  // ── RVRSL-TC-001 ─────────────────────────────────────────────────────────
  test('RVRSL-TC-001: Full return — all earned pts reversed, balance restored to pre-commit level', async () => {
    const d = TD.RVRSL_TC001;
    const baseline = await isMember(ctx.token, POS_MOBILE, 'POS');

    // Commit to earn pts
    const id = rnd();
    const items = [makeItem({ lineNo: 1, grossPrice: d.grossPrice, netPrice: d.netPrice, vatAmount: d.vatAmount })];
    const commitRes = await post('/rprest/api/transaction/v1/commitTransaction',
      commitBody({ id, storeId: baseline.storeId, memberId: baseline.memberId, channel: 'POS', items, tenderDetails: [{ code: TENDER.CASH, amount: d.tenderAmount }] }),
      ctx.token);
    expect(commitRes.status).toBe(200);
    const receiptNo = commitRes.body.receiptNo;
    const afterEarn = await isMember(ctx.token, POS_MOBILE, 'POS');
    const earned = afterEarn.points - baseline.points;
    expect(earned).toBe(calcExpectedEarn(d.netPrice, d.vatAmount, baseline.tier));

    // Full return
    await doRecallAndExchange(ctx.token, baseline.storeId, baseline.memberId, receiptNo, [{ previousLineNo: 1, quantity: 1 }]);
    const retId = rnd();
    const retItems = [makeItem({ lineNo: 2, grossPrice: d.grossPrice, netPrice: d.netPrice, vatAmount: d.vatAmount, previousLineNo: 1, isReturn: 'Yes' })];
    const retRes = await post('/rprest/api/transaction/v1/commitTransaction',
      commitBody({ id: retId, storeId: baseline.storeId, memberId: baseline.memberId, channel: 'POS', items: retItems,
        tenderDetails: [{ code: TENDER.WALLET, amount: d.tenderAmount }], previousReceiptNo: receiptNo }),
      ctx.token);
    expect(retRes.status).toBe(200);
    const afterReturn = await isMember(ctx.token, POS_MOBILE, 'POS');
    expect(afterReturn.points).toBe(baseline.points);
    console.log(`RVRSL-TC-001 | Earned: ${earned} | After return: ${afterReturn.points} (should == baseline ${baseline.points})`);
  });

  // ── RVRSL-TC-002 ─────────────────────────────────────────────────────────
  test('RVRSL-TC-002: Partial return — only returned line pts reversed, other line pts retained', async () => {
    const d = TD.RVRSL_TC002;
    const baseline = await isMember(ctx.token, POS_MOBILE, 'POS');

    // Commit 2-item transaction
    const id = rnd();
    const items = [
      makeItem({ lineNo: 1, grossPrice: d.item1.grossPrice, netPrice: d.item1.netPrice, vatAmount: d.item1.vatAmount }),
      makeItem({ lineNo: 2, grossPrice: d.item2.grossPrice, netPrice: d.item2.netPrice, vatAmount: d.item2.vatAmount }),
    ];
    const commitRes = await post('/rprest/api/transaction/v1/commitTransaction',
      commitBody({ id, storeId: baseline.storeId, memberId: baseline.memberId, channel: 'POS', items, tenderDetails: [{ code: TENDER.CASH, amount: d.tenderAmount }] }),
      ctx.token);
    expect(commitRes.status).toBe(200);
    const receiptNo = commitRes.body.receiptNo;
    const afterCommit = await isMember(ctx.token, POS_MOBILE, 'POS');
    const totalEarned = afterCommit.points - baseline.points;
    const earnedL1 = calcExpectedEarn(d.item1.netPrice, d.item1.vatAmount, baseline.tier);
    const earnedL2 = calcExpectedEarn(d.item2.netPrice, d.item2.vatAmount, baseline.tier);
    expect(totalEarned).toBe(earnedL1 + earnedL2);

    // Return only line 1
    await doRecallAndExchange(ctx.token, baseline.storeId, baseline.memberId, receiptNo, [{ previousLineNo: 1, quantity: 1 }]);
    const retId = rnd();
    const retItems = [makeItem({ lineNo: 3, grossPrice: d.item1.grossPrice, netPrice: d.item1.netPrice, vatAmount: d.item1.vatAmount, previousLineNo: 1, isReturn: 'Yes' })];
    const retRes = await post('/rprest/api/transaction/v1/commitTransaction',
      commitBody({ id: retId, storeId: baseline.storeId, memberId: baseline.memberId, channel: 'POS', items: retItems,
        tenderDetails: [{ code: TENDER.WALLET, amount: d.returnTenderAmount }], previousReceiptNo: receiptNo }),
      ctx.token);
    expect(retRes.status).toBe(200);
    const afterPartialReturn = await isMember(ctx.token, POS_MOBILE, 'POS');
    // Only L1 pts reversed; L2 pts retained
    expect(afterPartialReturn.points).toBe(baseline.points + earnedL2);
    console.log(`RVRSL-TC-002 | EarnedL1: ${earnedL1} EarnedL2: ${earnedL2} | After partial return: ${afterPartialReturn.points} (baseline+L2=${baseline.points + earnedL2})`);
  });

  // ── RVRSL-TC-003 ─────────────────────────────────────────────────────────
  test('RVRSL-TC-003: Return reverses both pts earned and TW01 wallet deducted', async () => {
    const d = TD.RVRSL_TC003;
    const id = rnd();

    const sendRes = await post('/rprest/api/transaction/v1/send/otp', {
      reqId: `v${id}`, storeId: ctx.member.storeId, terminalId: '1', receiptNo: `v${id}`,
      reqTimeStamp: now(), cashierId: 'EMP001', channel: 'POS', country: 'IN',
      mobileNumber: POS_MOBILE, memberId: '', language: 'EN', notificationChannel: 'SMS',
    }, ctx.token);
    if (sendRes.status !== 200) { console.warn('OTP rate limit — skipping RVRSL-TC-003'); return; }

    await post('/rprest/api/transaction/v1/profile', {
      reqId: sendRes.body.reqId || `v${id}`, storeId: ctx.member.storeId, terminalId: '1',
      receiptNo: sendRes.body.receiptNo || `v${id}`, reqTimeStamp: now(),
      cashierId: 'EMP001', channel: 'POS', language: 'EN', dateOfBirth: '1990-01-01',
      firstName: 'RvrslTest', lastName: 'User', mobileNumber: POS_MOBILE,
      emailId: 'rvrsl@example.com', gender: 'Male', country: 'IN', city: '',
      nationality: 'IN', otp: '1111', mobileCountryCode: 'IN', requestType: 'Update',
    }, ctx.token);

    const baseline = await isMember(ctx.token, POS_MOBILE, 'POS');

    const blockId = rnd();
    const blockRes = await post('/rprest/api/transaction/v1/blockunblockwalletandpoints', {
      reqId: `BFLINB${blockId}`, storeId: baseline.storeId, terminalId: '1',
      receiptNo: `BFLINB${blockId}`, reqTimeStamp: now(), cashierId: 'EMP001',
      channel: 'POS', memberId: baseline.memberId, blockReqType: 'BLOCK',
      blockSpecifications: [{ redeemType: 'WALLET_BALANCE', valueToBlock: d.blockWallet }],
    }, ctx.token);
    expect([200, 400]).toContain(blockRes.status);
    if (blockRes.status !== 200) { console.warn('Insufficient wallet — skipping RVRSL-TC-003'); return; }

    const id2 = rnd();
    const items = [makeItem({ lineNo: 1, grossPrice: d.grossPrice, netPrice: d.netPrice, vatAmount: d.vatAmount })];
    const commitRes = await post('/rprest/api/transaction/v1/commitTransaction',
      commitBody({ id: id2, storeId: baseline.storeId, memberId: baseline.memberId, channel: 'POS', items,
        tenderDetails: [{ code: TENDER.WALLET, amount: d.tenderWallet }, { code: TENDER.CASH, amount: d.tenderCash }] }),
      ctx.token);
    expect(commitRes.status).toBe(200);
    const receiptNo = commitRes.body.receiptNo;

    await doRecallAndExchange(ctx.token, baseline.storeId, baseline.memberId, receiptNo, [{ previousLineNo: 1, quantity: 1 }]);
    const retId = rnd();
    const retItems = [makeItem({ lineNo: 2, grossPrice: d.grossPrice, netPrice: d.netPrice, vatAmount: d.vatAmount, previousLineNo: 1, isReturn: 'Yes' })];
    const retRes = await post('/rprest/api/transaction/v1/commitTransaction',
      commitBody({ id: retId, storeId: baseline.storeId, memberId: baseline.memberId, channel: 'POS', items: retItems,
        tenderDetails: [{ code: TENDER.WALLET, amount: d.tenderWallet }, { code: TENDER.CASH, amount: d.tenderCash }],
        previousReceiptNo: receiptNo }),
      ctx.token);
    expect(retRes.status).toBe(200);
    const afterReturn = await isMember(ctx.token, POS_MOBILE, 'POS');
    expect(afterReturn.points).toBe(baseline.points);
    expect(afterReturn.walletBalance).toBe(baseline.walletBalance);
    console.log(`RVRSL-TC-003 | Pts: ${baseline.points}→${afterReturn.points} | Wallet: ${baseline.walletBalance}→${afterReturn.walletBalance}`);
  });

  // ── RVRSL-TC-004 ─────────────────────────────────────────────────────────
  test('RVRSL-TC-004: Double return prevention — second attempt on same receipt is rejected', async () => {
    const d = TD.RVRSL_TC004;
    const baseline = await isMember(ctx.token, POS_MOBILE, 'POS');

    const id = rnd();
    const items = [makeItem({ lineNo: 1, grossPrice: d.grossPrice, netPrice: d.netPrice, vatAmount: d.vatAmount })];
    const commitRes = await post('/rprest/api/transaction/v1/commitTransaction',
      commitBody({ id, storeId: baseline.storeId, memberId: baseline.memberId, channel: 'POS', items, tenderDetails: [{ code: TENDER.CASH, amount: d.tenderAmount }] }),
      ctx.token);
    expect(commitRes.status).toBe(200);
    const receiptNo = commitRes.body.receiptNo;

    // First return
    await doRecallAndExchange(ctx.token, baseline.storeId, baseline.memberId, receiptNo, [{ previousLineNo: 1, quantity: 1 }]);
    const ret1Id = rnd();
    const retItems = [makeItem({ lineNo: 2, grossPrice: d.grossPrice, netPrice: d.netPrice, vatAmount: d.vatAmount, previousLineNo: 1, isReturn: 'Yes' })];
    const ret1 = await post('/rprest/api/transaction/v1/commitTransaction',
      commitBody({ id: ret1Id, storeId: baseline.storeId, memberId: baseline.memberId, channel: 'POS', items: retItems,
        tenderDetails: [{ code: TENDER.WALLET, amount: d.tenderAmount }], previousReceiptNo: receiptNo }),
      ctx.token);
    expect(ret1.status).toBe(200);
    const afterFirstReturn = await isMember(ctx.token, POS_MOBILE, 'POS');
    expect(afterFirstReturn.points).toBe(baseline.points);

    // Second return attempt on same receipt — system should prevent double reversal
    await doRecallAndExchange(ctx.token, baseline.storeId, baseline.memberId, receiptNo, [{ previousLineNo: 1, quantity: 1 }]);
    const ret2Id = rnd();
    const ret2 = await post('/rprest/api/transaction/v1/commitTransaction',
      commitBody({ id: ret2Id, storeId: baseline.storeId, memberId: baseline.memberId, channel: 'POS', items: retItems,
        tenderDetails: [{ code: TENDER.WALLET, amount: d.tenderAmount }], previousReceiptNo: receiptNo }),
      ctx.token);
    // API may return 200 (idempotent) or 4xx (rejected) — either is acceptable;
    // the critical invariant is that the pts balance does NOT change a second time
    expect([200, 400, 409, 422]).toContain(ret2.status);
    const afterSecondAttempt = await isMember(ctx.token, POS_MOBILE, 'POS');
    expect(afterSecondAttempt.points).toBe(afterFirstReturn.points);
    console.log(`RVRSL-TC-004 | Second return status: ${ret2.status} | Pts after: ${afterSecondAttempt.points} (must == ${afterFirstReturn.points})`);
  });
});
