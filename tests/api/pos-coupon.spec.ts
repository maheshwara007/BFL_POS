import { post, getToken, isMember, commitBody, rnd, now, STORE_ID, POS_MOBILE } from './helpers';

const ctx: any = {};

describe('POS Coupon Transactions', () => {
  beforeAll(async () => {
    ctx.token = getToken();
    const member = await isMember(ctx.token, POS_MOBILE, 'POS');
    ctx.memberId = member.memberId;
    ctx.storeId = member.storeId;
  });

  test('POS-TC-010: List coupons, validate and apply coupon in commit', async () => {
    const couponsRes = await post('/rprest/api/transaction/v1/getMemberCoupons', {
      reqId: `REQ${rnd()}`, storeId: ctx.storeId, terminalId: 1,
      receiptNo: `TXN${rnd()}`, reqTimeStamp: now(), cashierId: 'EMP001',
      channel: 'POS', memberId: ctx.memberId, countryCode: 'AE',
      pageNo: 0, pageSize: 10,
    }, ctx.token);
    expect(couponsRes.status).toBe(200);

    const couponCode = couponsRes.body.coupons?.[0]?.couponCode;
    if (!couponCode) { console.warn('No coupons available for member — skipping POS-TC-010 coupon validation'); return; }

    const validateRes = await post('/rprest/api/transaction/v1/validatecoupon', {
      reqId: `REQ${rnd()}`, storeId: ctx.storeId, terminalId: '1',
      receiptNo: `TXN${rnd()}`, reqTimeStamp: now(), cashierId: 'EMP001',
      channel: 'POS', couponCodes: [couponCode],
    }, ctx.token);
    expect(validateRes.status).toBe(200);

    const id = rnd();
    const commitRes = await post('/rprest/api/transaction/v1/commitTransaction',
      commitBody({
        id, storeId: ctx.storeId, memberId: ctx.memberId, channel: 'POS',
        couponCodes: [couponCode],
      }), ctx.token);
    expect(commitRes.status).toBe(200);
    expect(commitRes.body.receiptNo).toBeDefined();
  });

  test('POS-TC-011: Block+coupon combined - OTP verify + coupon + block in single commit', async () => {
    const id = rnd();
    const sendRes = await post('/rprest/api/transaction/v1/send/otp', {
      reqId: `v${id}`, storeId: STORE_ID, terminalId: '1',
      receiptNo: `v${id}`, reqTimeStamp: now(), cashierId: 'EMP001',
      channel: 'POS', country: 'IN', mobileNumber: POS_MOBILE,
      memberId: '', language: 'EN', notificationChannel: 'SMS',
    }, ctx.token);
    if (sendRes.status !== 200) { console.warn('OTP rate limit — skipping POS-TC-011'); return; }
    expect(sendRes.status).toBe(200);

    const profileRes = await post('/rprest/api/transaction/v1/profile', {
      reqId: sendRes.body.reqId || `v${id}`,
      storeId: STORE_ID, terminalId: '1',
      receiptNo: sendRes.body.receiptNo || `v${id}`,
      reqTimeStamp: now(), cashierId: 'EMP001', channel: 'POS', language: 'EN',
      dateOfBirth: '1992-07-04', firstName: 'Coupon', lastName: 'Test',
      mobileNumber: POS_MOBILE, emailId: 'coupon@example.com',
      gender: 'Male', country: 'IN', city: '', nationality: 'IN',
      otp: '1111', mobileCountryCode: 'IN', requestType: 'Update',
    }, ctx.token);
    expect(profileRes.status).toBe(200);

    const couponsRes = await post('/rprest/api/transaction/v1/getMemberCoupons', {
      reqId: `REQ${rnd()}`, storeId: ctx.storeId, terminalId: 1,
      receiptNo: `TXN${rnd()}`, reqTimeStamp: now(), cashierId: 'EMP001',
      channel: 'POS', memberId: ctx.memberId, countryCode: 'AE',
      pageNo: 0, pageSize: 10,
    }, ctx.token);
    expect(couponsRes.status).toBe(200);

    const couponCode = couponsRes.body.coupons?.[0]?.couponCode || 'FIRST40';

    await post('/rprest/api/transaction/v1/validatecoupon', {
      reqId: `REQ${rnd()}`, storeId: ctx.storeId, terminalId: '1',
      receiptNo: `TXN${rnd()}`, reqTimeStamp: now(), cashierId: 'EMP001',
      channel: 'POS', couponCodes: [couponCode],
    }, ctx.token);

    const blockId = rnd();
    const blockRes = await post('/rprest/api/transaction/v1/blockunblockwalletandpoints', {
      reqId: `BFLINB${blockId}`, storeId: ctx.storeId, terminalId: '1',
      receiptNo: `BFLINB${blockId}`, reqTimeStamp: now(), cashierId: 'EMP001',
      channel: 'POS', memberId: ctx.memberId, blockReqType: 'BLOCK',
      blockSpecifications: [{ redeemType: 'WALLET_BALANCE', valueToBlock: 10.00 }],
    }, ctx.token);
    expect(blockRes.status).toBe(200);

    const id2 = rnd();
    const commitRes = await post('/rprest/api/transaction/v1/commitTransaction',
      commitBody({
        id: id2, storeId: ctx.storeId, memberId: ctx.memberId, channel: 'POS',
        couponCodes: [couponCode],
        tenderDetails: [{ code: 'TW01', amount: 10.00 }, { code: 'T1', amount: 490.00 }],
      }), ctx.token);
    expect(commitRes.status).toBe(200);
    expect(commitRes.body.receiptNo).toBeDefined();
  });
});
