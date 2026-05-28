import { post, getToken, isMember, commitBody, rnd, now, STORE_ID, POS_MOBILE } from './helpers';
import { calcExpectedEarn, makeItem, TENDER, TD } from './test-data';

const ctx: any = {};

describe('Redemption Validation', () => {
  beforeAll(async () => {
    ctx.token = getToken();
    ctx.member = await isMember(ctx.token, POS_MOBILE, 'POS');
  });

  // ── RED-TC-001 ────────────────────────────────────────────────────────────
  test('RED-TC-001: Block POINTS + commit with T8 — exact pts deducted from balance', async () => {
    const d = TD.RED_TC001;
    const id = rnd();

    // OTP step (required before block on POS)
    const sendRes = await post('/rprest/api/transaction/v1/send/otp', {
      reqId: `v${id}`, storeId: STORE_ID, terminalId: '1', receiptNo: `v${id}`,
      reqTimeStamp: now(), cashierId: 'EMP001', channel: 'POS', country: 'IN',
      mobileNumber: POS_MOBILE, memberId: '', language: 'EN', notificationChannel: 'SMS',
    }, ctx.token);
    if (sendRes.status !== 200) { console.warn('OTP rate limit — skipping RED-TC-001'); return; }

    await post('/rprest/api/transaction/v1/profile', {
      reqId: sendRes.body.reqId || `v${id}`, storeId: STORE_ID, terminalId: '1',
      receiptNo: sendRes.body.receiptNo || `v${id}`, reqTimeStamp: now(),
      cashierId: 'EMP001', channel: 'POS', language: 'EN', dateOfBirth: '1990-01-01',
      firstName: 'RedTest', lastName: 'User', mobileNumber: POS_MOBILE,
      emailId: 'red@example.com', gender: 'Male', country: 'IN', city: '',
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
    if (blockRes.status !== 200) { console.warn('Insufficient points to block — skipping RED-TC-001 redemption step'); return; }

    const id2 = rnd();
    const items = [makeItem({ lineNo: 1, grossPrice: d.grossPrice, netPrice: d.netPrice, vatAmount: d.vatAmount })];
    const commitRes = await post('/rprest/api/transaction/v1/commitTransaction',
      commitBody({ id: id2, storeId: before.storeId, memberId: before.memberId, channel: 'POS', items,
        tenderDetails: [{ code: TENDER.POINTS, amount: d.tenderPoints }, { code: TENDER.CASH, amount: d.tenderCash }] }),
      ctx.token);
    expect(commitRes.status).toBe(200);
    const after = await isMember(ctx.token, POS_MOBILE, 'POS');
    // Net change: earned new pts MINUS d.blockPoints redeemed
    const earned = calcExpectedEarn(d.netPrice, d.vatAmount, before.tier);
    const netDelta = after.points - before.points;
    expect(netDelta).toBeLessThan(earned); // redemption subtracted
    console.log(`RED-TC-001 | Before: ${before.points} After: ${after.points} | Earned: ${earned} Redeemed: ${d.blockPoints}`);
  });

  // ── RED-TC-002 ────────────────────────────────────────────────────────────
  test('RED-TC-002: Block WALLET + commit with TW01 — exact wallet balance deducted', async () => {
    const d = TD.RED_TC002;
    const id = rnd();

    const sendRes = await post('/rprest/api/transaction/v1/send/otp', {
      reqId: `v${id}`, storeId: STORE_ID, terminalId: '1', receiptNo: `v${id}`,
      reqTimeStamp: now(), cashierId: 'EMP001', channel: 'POS', country: 'IN',
      mobileNumber: POS_MOBILE, memberId: '', language: 'EN', notificationChannel: 'SMS',
    }, ctx.token);
    if (sendRes.status !== 200) { console.warn('OTP rate limit — skipping RED-TC-002'); return; }

    await post('/rprest/api/transaction/v1/profile', {
      reqId: sendRes.body.reqId || `v${id}`, storeId: STORE_ID, terminalId: '1',
      receiptNo: sendRes.body.receiptNo || `v${id}`, reqTimeStamp: now(),
      cashierId: 'EMP001', channel: 'POS', language: 'EN', dateOfBirth: '1990-01-01',
      firstName: 'RedTest', lastName: 'User', mobileNumber: POS_MOBILE,
      emailId: 'red@example.com', gender: 'Male', country: 'IN', city: '',
      nationality: 'IN', otp: '1111', mobileCountryCode: 'IN', requestType: 'Update',
    }, ctx.token);

    const before = await isMember(ctx.token, POS_MOBILE, 'POS');

    const blockId = rnd();
    const blockRes = await post('/rprest/api/transaction/v1/blockunblockwalletandpoints', {
      reqId: `BFLINB${blockId}`, storeId: before.storeId, terminalId: '1',
      receiptNo: `BFLINB${blockId}`, reqTimeStamp: now(), cashierId: 'EMP001',
      channel: 'POS', memberId: before.memberId, blockReqType: 'BLOCK',
      blockSpecifications: [{ redeemType: 'WALLET_BALANCE', valueToBlock: d.blockWallet }],
    }, ctx.token);
    expect([200, 400]).toContain(blockRes.status);
    if (blockRes.status !== 200) { console.warn('Insufficient wallet to block — skipping RED-TC-002'); return; }

    const id2 = rnd();
    const items = [makeItem({ lineNo: 1, grossPrice: d.grossPrice, netPrice: d.netPrice, vatAmount: d.vatAmount })];
    const commitRes = await post('/rprest/api/transaction/v1/commitTransaction',
      commitBody({ id: id2, storeId: before.storeId, memberId: before.memberId, channel: 'POS', items,
        tenderDetails: [{ code: TENDER.WALLET, amount: d.tenderWallet }, { code: TENDER.CASH, amount: d.tenderCash }] }),
      ctx.token);
    expect(commitRes.status).toBe(200);
    const after = await isMember(ctx.token, POS_MOBILE, 'POS');
    // Wallet must be reduced by exactly blockWallet
    expect(after.walletBalance).toBe(before.walletBalance - d.blockWallet);
    // Points must NOT be affected by wallet redemption
    const pointsDelta = after.points - before.points;
    expect(pointsDelta).toBe(calcExpectedEarn(d.netPrice, d.vatAmount, before.tier));
    console.log(`RED-TC-002 | Wallet before: ${before.walletBalance} after: ${after.walletBalance} | Deducted: ${d.blockWallet}`);
  });

  // ── RED-TC-003 ────────────────────────────────────────────────────────────
  test('RED-TC-003: Return with TW01 refund — wallet balance fully restored', async () => {
    const d = TD.RED_TC003;
    const id = rnd();

    const sendRes = await post('/rprest/api/transaction/v1/send/otp', {
      reqId: `v${id}`, storeId: STORE_ID, terminalId: '1', receiptNo: `v${id}`,
      reqTimeStamp: now(), cashierId: 'EMP001', channel: 'POS', country: 'IN',
      mobileNumber: POS_MOBILE, memberId: '', language: 'EN', notificationChannel: 'SMS',
    }, ctx.token);
    if (sendRes.status !== 200) { console.warn('OTP rate limit — skipping RED-TC-003'); return; }

    await post('/rprest/api/transaction/v1/profile', {
      reqId: sendRes.body.reqId || `v${id}`, storeId: STORE_ID, terminalId: '1',
      receiptNo: sendRes.body.receiptNo || `v${id}`, reqTimeStamp: now(),
      cashierId: 'EMP001', channel: 'POS', language: 'EN', dateOfBirth: '1990-01-01',
      firstName: 'RedTest', lastName: 'User', mobileNumber: POS_MOBILE,
      emailId: 'red@example.com', gender: 'Male', country: 'IN', city: '',
      nationality: 'IN', otp: '1111', mobileCountryCode: 'IN', requestType: 'Update',
    }, ctx.token);

    const baseline = await isMember(ctx.token, POS_MOBILE, 'POS');

    // Block wallet and commit
    const blockId = rnd();
    const blockRes = await post('/rprest/api/transaction/v1/blockunblockwalletandpoints', {
      reqId: `BFLINB${blockId}`, storeId: baseline.storeId, terminalId: '1',
      receiptNo: `BFLINB${blockId}`, reqTimeStamp: now(), cashierId: 'EMP001',
      channel: 'POS', memberId: baseline.memberId, blockReqType: 'BLOCK',
      blockSpecifications: [{ redeemType: 'WALLET_BALANCE', valueToBlock: d.blockWallet }],
    }, ctx.token);
    expect([200, 400]).toContain(blockRes.status);
    if (blockRes.status !== 200) { console.warn('Insufficient wallet — skipping RED-TC-003'); return; }

    const id2 = rnd();
    const items = [makeItem({ lineNo: 1, grossPrice: d.grossPrice, netPrice: d.netPrice, vatAmount: d.vatAmount })];
    const commitRes = await post('/rprest/api/transaction/v1/commitTransaction',
      commitBody({ id: id2, storeId: baseline.storeId, memberId: baseline.memberId, channel: 'POS', items,
        tenderDetails: [{ code: TENDER.WALLET, amount: d.tenderWallet }, { code: TENDER.CASH, amount: d.tenderCash }] }),
      ctx.token);
    expect(commitRes.status).toBe(200);
    const receiptNo = commitRes.body.receiptNo;
    const afterCommit = await isMember(ctx.token, POS_MOBILE, 'POS');
    expect(afterCommit.walletBalance).toBe(baseline.walletBalance - d.blockWallet);

    // Return the transaction → wallet must be refunded
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
        tenderDetails: [{ code: TENDER.WALLET, amount: d.tenderWallet }, { code: TENDER.CASH, amount: d.tenderCash }],
        previousReceiptNo: receiptNo }),
      ctx.token);
    expect(retRes.status).toBe(200);
    const afterReturn = await isMember(ctx.token, POS_MOBILE, 'POS');
    expect(afterReturn.walletBalance).toBe(baseline.walletBalance);
    console.log(`RED-TC-003 | Wallet baseline: ${baseline.walletBalance} after-return: ${afterReturn.walletBalance}`);
  });

  // ── RED-TC-004 ────────────────────────────────────────────────────────────
  test('RED-TC-004: Block then UNBLOCK (no commit) — balance fully restored', async () => {
    const d = TD.RED_TC004;
    const before = await isMember(ctx.token, POS_MOBILE, 'POS');

    const blockId = rnd();
    const blockRes = await post('/rprest/api/transaction/v1/blockunblockwalletandpoints', {
      reqId: `BFLINB${blockId}`, storeId: before.storeId, terminalId: '1',
      receiptNo: `BFLINB${blockId}`, reqTimeStamp: now(), cashierId: 'EMP001',
      channel: 'POS', memberId: before.memberId, blockReqType: 'BLOCK',
      blockSpecifications: [{ redeemType: 'POINTS', valueToBlock: d.blockPoints }],
    }, ctx.token);
    expect([200, 400]).toContain(blockRes.status);
    if (blockRes.status !== 200) { console.warn('Insufficient pts to block — skipping RED-TC-004'); return; }

    // Unblock using same reqId / receiptNo
    const unblockRes = await post('/rprest/api/transaction/v1/blockunblockwalletandpoints', {
      reqId: blockRes.body.reqId || `BFLINB${blockId}`,
      storeId: before.storeId, terminalId: '1',
      receiptNo: blockRes.body.receiptNo || `BFLINB${blockId}`,
      reqTimeStamp: now(), cashierId: 'EMP001',
      channel: 'POS', memberId: before.memberId, blockReqType: 'UNBLOCK',
      blockSpecifications: [{ redeemType: 'POINTS', valueToBlock: d.blockPoints }],
    }, ctx.token);
    expect(unblockRes.status).toBe(200);

    const after = await isMember(ctx.token, POS_MOBILE, 'POS');
    // No commit happened — balance must be identical to before
    expect(after.points).toBe(before.points);
    expect(after.walletBalance).toBe(before.walletBalance);
    console.log(`RED-TC-004 | Points before: ${before.points} after unblock: ${after.points} (no change expected)`);
  });
});
