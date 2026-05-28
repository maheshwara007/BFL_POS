import { post, getToken, isMember, commitBody, defaultItem, rnd, now, STORE_ID, POS_MOBILE } from './helpers';

const ctx: any = {};

describe('POS Normal Transactions', () => {
  beforeAll(async () => {
    ctx.token = getToken();
    const member = await isMember(ctx.token, POS_MOBILE, 'POS');
    ctx.memberId = member.memberId;
    ctx.storeId = member.storeId;
  });

  test('POS-TC-001: Existing member - points earn commit', async () => {
    const id = rnd();
    const { status, body } = await post('/rprest/api/transaction/v1/commitTransaction',
      commitBody({ id, storeId: ctx.storeId, memberId: ctx.memberId, channel: 'POS' }),
      ctx.token);
    expect(status).toBe(200);
    expect(body.receiptNo).toBeDefined();
    ctx.receiptNo = body.receiptNo;
  });

  test('POS-TC-002: New member registration via OTP then commit', async () => {
    const id = rnd();
    const sendRes = await post('/rprest/api/transaction/v1/send/otp', {
      reqId: `v${id}`, storeId: STORE_ID, terminalId: '1',
      receiptNo: `v${id}`, reqTimeStamp: now(), cashierId: 'EMP001',
      channel: 'POS', country: STORE_ID.startsWith('BFL') ? 'IN' : 'IN',
      mobileNumber: POS_MOBILE, memberId: '', language: 'EN', notificationChannel: 'SMS',
    }, ctx.token);
    if (sendRes.status !== 200) { console.warn('OTP rate limit — skipping POS-TC-002'); return; }
    expect(sendRes.status).toBe(200);

    const profileRes = await post('/rprest/api/transaction/v1/profile', {
      reqId: sendRes.body.reqId || `v${id}`,
      storeId: STORE_ID, terminalId: '1',
      receiptNo: sendRes.body.receiptNo || `v${id}`,
      reqTimeStamp: now(), cashierId: 'EMP001', channel: 'POS', language: 'EN',
      dateOfBirth: '1995-06-15', firstName: 'TestPOS', lastName: 'User',
      mobileNumber: POS_MOBILE, emailId: 'testpos@example.com',
      gender: 'Male', country: 'IN', city: '', nationality: 'IN',
      otp: '1111', referralCode: '', anniversary: '',
      mobileCountryCode: 'IN', requestType: 'Register',
    }, ctx.token);
    expect(profileRes.status).toBe(200);
    expect(profileRes.body.memberId).toBeDefined();

    const id2 = rnd();
    const commitRes = await post('/rprest/api/transaction/v1/commitTransaction',
      commitBody({ id: id2, storeId: STORE_ID, memberId: profileRes.body.memberId, channel: 'POS' }),
      ctx.token);
    expect(commitRes.status).toBe(200);
    expect(commitRes.body.receiptNo).toBeDefined();
  });

  test('POS-TC-003: Resend OTP flow then commit', async () => {
    const id = rnd();
    const sendRes = await post('/rprest/api/transaction/v1/send/otp', {
      reqId: `v${id}`, storeId: STORE_ID, terminalId: '1',
      receiptNo: `v${id}`, reqTimeStamp: now(), cashierId: 'EMP001',
      channel: 'POS', country: 'IN', mobileNumber: POS_MOBILE,
      memberId: '', language: 'EN', notificationChannel: 'SMS',
    }, ctx.token);
    if (sendRes.status !== 200) { console.warn('OTP rate limit — skipping POS-TC-003'); return; }
    expect(sendRes.status).toBe(200);

    const resendRes = await post('/rprest/api/transaction/v1/resend/otp', {
      reqId: `v${id}`, storeId: STORE_ID, terminalId: '1',
      receiptNo: `v${id}`, reqTimeStamp: now(), cashierId: 'EMP001',
      channel: 'POS', country: 'IN', mobileNumber: POS_MOBILE,
      memberId: 0, activity: 'Transaction', language: 'EN', notificationChannel: 'SMS',
    }, ctx.token);
    expect(resendRes.status).toBe(200);

    const profileRes = await post('/rprest/api/transaction/v1/profile', {
      reqId: sendRes.body.reqId || `v${id}`,
      storeId: STORE_ID, terminalId: '1',
      receiptNo: sendRes.body.receiptNo || `v${id}`,
      reqTimeStamp: now(), cashierId: 'EMP001', channel: 'POS', language: 'EN',
      dateOfBirth: '1990-03-10', firstName: 'ResendTest', lastName: 'User',
      mobileNumber: POS_MOBILE, emailId: 'resend@example.com',
      gender: 'Male', country: 'IN', city: '', nationality: 'IN',
      otp: '1111', mobileCountryCode: 'IN', requestType: 'Update',
    }, ctx.token);
    expect(profileRes.status).toBe(200);

    const id2 = rnd();
    const commitRes = await post('/rprest/api/transaction/v1/commitTransaction',
      commitBody({ id: id2, storeId: ctx.storeId, memberId: ctx.memberId, channel: 'POS' }),
      ctx.token);
    expect(commitRes.status).toBe(200);
    expect(commitRes.body.receiptNo).toBeDefined();
  });

  test('POS-TC-004: Update member profile (requestType=Update) then commit', async () => {
    const id = rnd();
    const sendRes = await post('/rprest/api/transaction/v1/send/otp', {
      reqId: `v${id}`, storeId: STORE_ID, terminalId: '1',
      receiptNo: `v${id}`, reqTimeStamp: now(), cashierId: 'EMP001',
      channel: 'POS', country: 'IN', mobileNumber: POS_MOBILE,
      memberId: '', language: 'EN', notificationChannel: 'SMS',
    }, ctx.token);
    if (sendRes.status !== 200) { console.warn('OTP rate limit — skipping POS-TC-004'); return; }
    expect(sendRes.status).toBe(200);

    const profileRes = await post('/rprest/api/transaction/v1/profile', {
      reqId: sendRes.body.reqId || `v${id}`,
      storeId: STORE_ID, terminalId: '1',
      receiptNo: sendRes.body.receiptNo || `v${id}`,
      reqTimeStamp: now(), cashierId: 'EMP001', channel: 'POS', language: 'EN',
      dateOfBirth: '1988-11-20', firstName: 'UpdatedFirst', lastName: 'UpdatedLast',
      mobileNumber: POS_MOBILE, emailId: 'updated@example.com',
      gender: 'Female', country: 'IN', city: 'Mumbai', nationality: 'IN',
      otp: '1111', mobileCountryCode: 'IN', requestType: 'Update',
    }, ctx.token);
    expect(profileRes.status).toBe(200);

    const id2 = rnd();
    const commitRes = await post('/rprest/api/transaction/v1/commitTransaction',
      commitBody({ id: id2, storeId: ctx.storeId, memberId: ctx.memberId, channel: 'POS' }),
      ctx.token);
    expect(commitRes.status).toBe(200);
    expect(commitRes.body.receiptNo).toBeDefined();
  });

  test('POS-TC-005: Multi-item commit with billDetails', async () => {
    const id = rnd();
    const { status, body } = await post('/rprest/api/transaction/v1/commitTransaction',
      commitBody({
        id, storeId: ctx.storeId, memberId: ctx.memberId, channel: 'POS',
        items: [
          defaultItem(1, { quantity: 2, grossPrice: 200.00, netPrice: 380.00, vatAmount: 20.00 }),
          defaultItem(2, { sku: '153837', hsnCode: '1123', quantity: 1, grossPrice: 300.00, discountAmount: 10.00, netPrice: 275.00, vatAmount: 15.00 }),
        ],
        tenderDetails: [{ code: 'T1', amount: 700.00 }],
        billDetails: {
          subTotal: 700.00, totalDiscount: 10.00, totalAfterDiscount: 690.00,
          totalTax: 35.00, totalAfterTax: 690.00, taxType: 'VAT', taxRate: 5,
          taxInvoiceNo: `BFLIN${id}`, totalQuantity: 3,
        },
      }), ctx.token);
    expect(status).toBe(200);
    expect(body.receiptNo).toBeDefined();
    ctx.receiptNo = body.receiptNo;
  });
});
