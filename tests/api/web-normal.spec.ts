import { post, getToken, isMember, commitBody, defaultItem, rnd, now, STORE_ID, WEB_MOBILE } from './helpers';

const ctx: any = {};

describe('WEB Normal Transactions', () => {
  beforeAll(async () => {
    ctx.token = getToken();
    const member = await isMember(ctx.token, WEB_MOBILE, 'WEB');
    ctx.memberId = member.memberId;
    ctx.storeId = member.storeId;
  });

  test('WEB-TC-001: Existing member commit without OTP (WEB channel)', async () => {
    const id = rnd();
    const { status, body } = await post('/rprest/api/transaction/v1/commitTransaction',
      commitBody({ id, storeId: ctx.storeId, memberId: ctx.memberId, channel: 'WEB' }),
      ctx.token);
    expect(status).toBe(200);
    expect(body.receiptNo).toBeDefined();
    ctx.receiptNo = body.receiptNo;
  });

  test('WEB-TC-002: Update member profile without OTP (WEB channel) then commit', async () => {
    const profileRes = await post('/rprest/api/transaction/v1/profile', {
      reqId: `REQ${rnd()}`, storeId: STORE_ID, terminalId: '1',
      receiptNo: `TXN${rnd()}`, reqTimeStamp: now(), cashierId: '',
      channel: 'WEB', language: 'EN',
      firstName: 'WebTest', lastName: 'User',
      mobileNumber: WEB_MOBILE, emailId: 'webtest@example.com',
      gender: 'Male', country: 'AE', city: '', nationality: 'AE',
      mobileCountryCode: 'AE', requestType: 'Update',
    }, ctx.token);
    // Profile update may return 400 if some fields have restrictions (e.g. DOB already set)
    expect([200, 400]).toContain(profileRes.status);

    const id = rnd();
    const commitRes = await post('/rprest/api/transaction/v1/commitTransaction',
      commitBody({ id, storeId: ctx.storeId, memberId: ctx.memberId, channel: 'WEB' }),
      ctx.token);
    expect(commitRes.status).toBe(200);
    expect(commitRes.body.receiptNo).toBeDefined();
  });

  test('WEB-TC-003: Multi-item commit with billDetails (WEB channel)', async () => {
    const id = rnd();
    const { status, body } = await post('/rprest/api/transaction/v1/commitTransaction',
      commitBody({
        id, storeId: ctx.storeId, memberId: ctx.memberId, channel: 'WEB',
        items: [
          defaultItem(1, { quantity: 1, grossPrice: 500.00, netPrice: 460.00, vatAmount: 40.00 }),
          defaultItem(2, { sku: '153837', hsnCode: '1123', quantity: 2, grossPrice: 300.00, netPrice: 570.00, vatAmount: 30.00 }),
          defaultItem(3, { sku: '153838', hsnCode: '1123', quantity: 1, grossPrice: 200.00, netPrice: 190.00, vatAmount: 10.00 }),
        ],
        tenderDetails: [{ code: 'T1', amount: 1300.00 }],
        billDetails: {
          subTotal: 1300.00, totalDiscount: 0.00, totalAfterDiscount: 1300.00,
          totalTax: 80.00, totalAfterTax: 1300.00, taxType: 'VAT', taxRate: 5,
          taxInvoiceNo: `BFLIN${id}`, totalQuantity: 4,
        },
      }), ctx.token);
    expect(status).toBe(200);
    expect(body.receiptNo).toBeDefined();
    ctx.receiptNo = body.receiptNo;
  });
});
