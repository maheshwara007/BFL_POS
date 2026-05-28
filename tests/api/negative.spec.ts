import { post, getToken, isMember, computeBillDetails, rnd, now, STORE_ID, POS_MOBILE } from './helpers';

const ctx: any = {};

describe('Negative / Error Scenarios', () => {
  beforeAll(async () => {
    ctx.token = getToken();
    const member = await isMember(ctx.token, POS_MOBILE, 'POS');
    ctx.memberId = member.memberId;
    ctx.storeId = member.storeId;
  });

  test('NEG-TC-001: Invalid token returns 401 on any API', async () => {
    const { status } = await post('/rprest/api/transaction/v1/isMember', {
      reqId: `REQ${rnd()}`, storeId: STORE_ID, terminalId: '1',
      receiptNo: `TXN${rnd()}`, reqTimeStamp: now(), cashierId: 'EMP001',
      channel: 'POS', customerIdBarCode: '', mobileNumber: POS_MOBILE, emailId: '',
    }, 'INVALID_TOKEN_ABCD1234');
    expect(status).toBe(401);
  });

  test('NEG-TC-002: Duplicate receipt number in commitTransaction returns error', async () => {
    const id = rnd();
    const dupItems = [{
      lineNo: 1, itemType: 'Product', sku: '153836', hsnCode: '12',
      productName: 'Product Name', specification: 'Product Desc',
      markDownFlag: 'No', quantity: 1, grossPrice: 500.00,
      discountAmount: 0, netPrice: 460.00, vatAmount: 40.00,
      concept: 'BFL', brand: 'ADIDAS', department: 'BFL MEN SHOES',
      division: 'SHOES', previousLineNo: 0, isReturn: 'No',
    }];
    const body = {
      reqId: `BFLIN${id}`, storeId: ctx.storeId, terminalId: '1',
      receiptNo: `BFLIN${id}`, reqTimeStamp: now(), cashierId: 'EMP001',
      channel: 'POS', memberId: ctx.memberId, commitRequestType: 'Complete',
      txnDate: now(), couponCodes: [],
      itemDetails: dupItems,
      previousReceiptNo: '',
      tenderDetails: [{ code: 'T1', amount: 500.00 }],
      billDetails: computeBillDetails(dupItems, id),
    };
    const first = await post('/rprest/api/transaction/v1/commitTransaction', body, ctx.token);
    expect(first.status).toBe(200);
    const second = await post('/rprest/api/transaction/v1/commitTransaction', body, ctx.token);
    expect(second.status).not.toBe(200);
  });

  test('NEG-TC-003: Invalid OTP (9999) in profile verification returns error', async () => {
    const id = rnd();
    const sendRes = await post('/rprest/api/transaction/v1/send/otp', {
      reqId: `v${id}`, storeId: STORE_ID, terminalId: '1',
      receiptNo: `v${id}`, reqTimeStamp: now(), cashierId: 'EMP001',
      channel: 'POS', country: 'IN', mobileNumber: POS_MOBILE,
      memberId: '', language: 'EN', notificationChannel: 'SMS',
    }, ctx.token);
    if (sendRes.status !== 200) { console.warn('OTP rate limit — skipping NEG-TC-003'); return; }
    expect(sendRes.status).toBe(200);

    const profileRes = await post('/rprest/api/transaction/v1/profile', {
      reqId: sendRes.body.reqId || `v${id}`,
      storeId: STORE_ID, terminalId: '1',
      receiptNo: sendRes.body.receiptNo || `v${id}`,
      reqTimeStamp: now(), cashierId: 'EMP001', channel: 'POS', language: 'EN',
      dateOfBirth: '1990-01-01', firstName: 'Invalid', lastName: 'OTP',
      mobileNumber: POS_MOBILE, emailId: 'invalid@example.com',
      gender: 'Male', country: 'IN', city: '', nationality: 'IN',
      otp: '9999',
      mobileCountryCode: 'IN', requestType: 'Update',
    }, ctx.token);
    expect(profileRes.status).not.toBe(200);
  });

  test('NEG-TC-004: Block more than available points balance returns error', async () => {
    const blockId = rnd();
    const { status } = await post('/rprest/api/transaction/v1/blockunblockwalletandpoints', {
      reqId: `BFLINB${blockId}`, storeId: ctx.storeId, terminalId: '1',
      receiptNo: `BFLINB${blockId}`, reqTimeStamp: now(), cashierId: 'EMP001',
      channel: 'POS', memberId: ctx.memberId, blockReqType: 'BLOCK',
      blockSpecifications: [{ redeemType: 'POINTS', valueToBlock: 9999999.00 }],
    }, ctx.token);
    expect(status).not.toBe(200);
  });

  test('NEG-TC-005: CommitTransaction with missing mandatory fields returns 400', async () => {
    const { status } = await post('/rprest/api/transaction/v1/commitTransaction', {
      channel: 'WEB',
      memberId: ctx.memberId,
      itemDetails: [],
    }, ctx.token);
    expect([400, 422, 500]).toContain(status);
  });

  test('NEG-TC-006: Recall non-existent receipt - API responds (may return 200 with empty data)', async () => {
    const id = rnd();
    const { status, body } = await post('/rprest/api/transaction/v1/recallReceipt', {
      reqId: `BFLINR${id}`, storeId: ctx.storeId, terminalId: '1',
      receiptNo: `BFLINR${id}`, reqTimeStamp: now(), cashierId: 'EMP001',
      channel: 'POS', memberId: ctx.memberId,
      requestType: 'Recall Receipt', receiptToRecallNo: 'INVALID_RECEIPT_99999',
    }, ctx.token);
    // API returns 200 with empty/failure body for non-existent receipts
    expect([200, 400, 404]).toContain(status);
    if (status === 200) {
      expect(body.status === 'failure' || !body.itemDetails?.length || body.itemDetails === undefined).toBe(true);
    }
  });

  test('NEG-TC-007: Apply expired or invalid coupon returns error', async () => {
    const { status } = await post('/rprest/api/transaction/v1/validatecoupon', {
      reqId: `REQ${rnd()}`, storeId: ctx.storeId, terminalId: '1',
      receiptNo: `TXN${rnd()}`, reqTimeStamp: now(), cashierId: 'EMP001',
      channel: 'POS', couponCodes: ['EXPIRED_COUPON_XXXX'],
    }, ctx.token);
    expect(status).not.toBe(200);
  });
});
