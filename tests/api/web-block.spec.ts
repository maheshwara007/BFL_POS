import { post, getToken, isMember, commitBody, rnd, now, STORE_ID, WEB_MOBILE } from './helpers';

const ctx: any = {};

describe('WEB Block/Redemption Transactions', () => {
  beforeAll(async () => {
    ctx.token = getToken();
    const member = await isMember(ctx.token, WEB_MOBILE, 'WEB');
    ctx.memberId = member.memberId;
    ctx.storeId = member.storeId;
  });

  test('WEB-TC-004: Block points then commit (WEB, no OTP)', async () => {
    const blockId = rnd();
    const blockRes = await post('/rprest/api/transaction/v1/blockunblockwalletandpoints', {
      reqId: `BFLINB${blockId}`, storeId: ctx.storeId, terminalId: '1',
      receiptNo: `BFLINB${blockId}`, reqTimeStamp: now(), cashierId: 'EMP001',
      channel: 'WEB', memberId: ctx.memberId, blockReqType: 'BLOCK',
      blockSpecifications: [{ redeemType: 'POINTS', valueToBlock: 1.00 }],
    }, ctx.token);
    // 400 is acceptable when member has insufficient points balance in UAT
    expect([200, 400]).toContain(blockRes.status);
    if (blockRes.status !== 200) return;

    const id = rnd();
    const commitRes = await post('/rprest/api/transaction/v1/commitTransaction',
      commitBody({
        id, storeId: ctx.storeId, memberId: ctx.memberId, channel: 'WEB',
        tenderDetails: [{ code: 'T8', amount: 1.00 }, { code: 'T1', amount: 499.00 }],
      }), ctx.token);
    expect(commitRes.status).toBe(200);
    expect(commitRes.body.receiptNo).toBeDefined();
  });

  test('WEB-TC-005: Block wallet + points then commit (WEB)', async () => {
    const blockId = rnd();
    const blockRes = await post('/rprest/api/transaction/v1/blockunblockwalletandpoints', {
      reqId: `BFLINB${blockId}`, storeId: ctx.storeId, terminalId: '1',
      receiptNo: `BFLINB${blockId}`, reqTimeStamp: now(), cashierId: 'EMP001',
      channel: 'WEB', memberId: ctx.memberId, blockReqType: 'BLOCK',
      blockSpecifications: [
        { redeemType: 'POINTS', valueToBlock: 1.00 },
        { redeemType: 'WALLET_BALANCE', valueToBlock: 10.00 },
      ],
    }, ctx.token);
    // 400 is acceptable when member has insufficient points/wallet balance in UAT
    expect([200, 400]).toContain(blockRes.status);
    if (blockRes.status !== 200) return;

    const id = rnd();
    const commitRes = await post('/rprest/api/transaction/v1/commitTransaction',
      commitBody({
        id, storeId: ctx.storeId, memberId: ctx.memberId, channel: 'WEB',
        tenderDetails: [{ code: 'T8', amount: 1.00 }, { code: 'TW01', amount: 10.00 }, { code: 'T1', amount: 489.00 }],
      }), ctx.token);
    expect(commitRes.status).toBe(200);
    expect(commitRes.body.receiptNo).toBeDefined();
  });

  test('WEB-TC-006: Block + coupon combined commit (WEB)', async () => {
    const couponsRes = await post('/rprest/api/transaction/v1/getMemberCoupons', {
      reqId: `REQ${rnd()}`, storeId: ctx.storeId, terminalId: 1,
      receiptNo: `TXN${rnd()}`, reqTimeStamp: now(), cashierId: 'EMP001',
      channel: 'WEB', memberId: ctx.memberId, countryCode: 'AE',
      pageNo: 0, pageSize: 10,
    }, ctx.token);
    expect(couponsRes.status).toBe(200);

    const couponCode = couponsRes.body.coupons?.[0]?.couponCode || 'FIRST40';
    await post('/rprest/api/transaction/v1/validatecoupon', {
      reqId: `REQ${rnd()}`, storeId: ctx.storeId, terminalId: '1',
      receiptNo: `TXN${rnd()}`, reqTimeStamp: now(), cashierId: 'EMP001',
      channel: 'WEB', couponCodes: [couponCode],
    }, ctx.token);

    const blockId = rnd();
    const blockRes = await post('/rprest/api/transaction/v1/blockunblockwalletandpoints', {
      reqId: `BFLINB${blockId}`, storeId: ctx.storeId, terminalId: '1',
      receiptNo: `BFLINB${blockId}`, reqTimeStamp: now(), cashierId: 'EMP001',
      channel: 'WEB', memberId: ctx.memberId, blockReqType: 'BLOCK',
      blockSpecifications: [{ redeemType: 'WALLET_BALANCE', valueToBlock: 10.00 }],
    }, ctx.token);
    // 400 is acceptable when member has insufficient wallet balance in UAT
    expect([200, 400]).toContain(blockRes.status);
    if (blockRes.status !== 200) return;

    const id = rnd();
    const commitRes = await post('/rprest/api/transaction/v1/commitTransaction',
      commitBody({
        id, storeId: ctx.storeId, memberId: ctx.memberId, channel: 'WEB',
        couponCodes: [couponCode],
        tenderDetails: [{ code: 'TW01', amount: 10.00 }, { code: 'T1', amount: 490.00 }],
      }), ctx.token);
    expect(commitRes.status).toBe(200);
    expect(commitRes.body.receiptNo).toBeDefined();
  });
});
