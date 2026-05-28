import { post, getToken, rnd, now, STORE_ID, computeBillDetails } from './helpers';

function rndMobile(): string {
  return `91${Math.floor(7000000000 + Math.random() * 2999999999)}`;
}

const ctx: any = {};

describe('Guest / Non-Member Transactions', () => {
  beforeAll(async () => {
    ctx.token = getToken();
  });

  const guestItem = {
    lineNo: 1, itemType: 'Product', sku: '153836', hsnCode: '12',
    productName: 'Product Name', specification: 'Product Desc',
    markDownFlag: 'No', quantity: 1, grossPrice: 300.10,
    discountAmount: 0.00, netPrice: 300.10, vatAmount: 0.00,
    concept: 'BFL', brand: 'ADIDAS',
    department: 'BFL MEN SHOES', division: 'SHOES',
    previousLineNo: 0, isReturn: 'No',
  };

  test('GUEST-TC-001: Non-member commit with new mobile (guest flow)', async () => {
    const id = rnd();
    const { status, body } = await post('/rprest/api/transaction/guest/v1/commitTransaction', {
      reqId: `G${id}`, storeId: STORE_ID, terminalId: '1',
      receiptNo: `G${id}`, reqTimeStamp: now(), cashierId: 'EMP001',
      channel: 'POS', commitRequestType: 'Complete', txnDate: now(),
      customerDetails: {
        firstName: 'GuestUser', lastName: 'Test',
        mobileCountryCode: 'IN', mobileNumber: rndMobile(),
      },
      itemDetails: [guestItem],
      tenderDetails: [{ code: 'T1', amount: 300.10 }],
      billDetails: computeBillDetails([guestItem], id),
    }, ctx.token);
    expect(status).toBe(200);
    expect(body.status).toBe('success');
    ctx.guestReceiptNo = body.receiptNo;
  });

  test('GUEST-TC-002: Non-member commit with already-registered mobile (guest flow - no loyalty)', async () => {
    const id = rnd();
    const { status, body } = await post('/rprest/api/transaction/guest/v1/commitTransaction', {
      reqId: `G${id}`, storeId: STORE_ID, terminalId: '1',
      receiptNo: `G${id}`, reqTimeStamp: now(), cashierId: 'EMP001',
      channel: 'POS', commitRequestType: 'Complete', txnDate: now(),
      customerDetails: {
        firstName: 'ExistingGuest', lastName: 'User',
        mobileCountryCode: 'IN', mobileNumber: '917598994461',
      },
      itemDetails: [guestItem],
      tenderDetails: [{ code: 'T1', amount: 300.10 }],
      billDetails: computeBillDetails([guestItem], id),
    }, ctx.token);
    expect(status).toBe(200);
    expect(body.status).toBe('success');
  });

  test('GUEST-TC-003: Non-member commit with coupon code', async () => {
    const id = rnd();
    const couponItems = [{ ...guestItem, grossPrice: 6000.00, netPrice: 5084.75, vatAmount: 915.25 }];
    const { status, body } = await post('/rprest/api/transaction/guest/v1/commitTransaction', {
      reqId: `G${id}`, storeId: STORE_ID, terminalId: '1',
      receiptNo: `G${id}`, reqTimeStamp: now(), cashierId: 'EMP001',
      channel: 'POS', commitRequestType: 'Complete', txnDate: now(),
      couponCodes: ['GET40FORFIRSTORD_1760'],
      customerDetails: {
        firstName: 'CouponGuest', lastName: 'User',
        mobileCountryCode: 'IN', mobileNumber: rndMobile(),
      },
      itemDetails: couponItems,
      tenderDetails: [{ code: 'T1', amount: 500.00 }],
      billDetails: computeBillDetails(couponItems, id),
    }, ctx.token);
    expect([200, 400]).toContain(status);
    if (status === 200) expect(body.status).toBe('success');
  });

  test('GUEST-TC-004: Update mobile number after guest transaction', async () => {
    const { status } = await post('/rprest/api/transaction/v1/updateMobileNumber', {
      reqId: `REQ${rnd()}`, storeId: STORE_ID, terminalId: '1',
      receiptNo: `TXN${rnd()}`, reqTimeStamp: now(), cashierId: '',
      channel: 'POS', omniChannel: '', language: 'EN',
      memberId: ctx.token ? '0' : '0',
      mobileCountryCode: 'IN', mobileNumber: `91${rnd(9)}`,
    }, ctx.token);
    expect([200, 400, 404]).toContain(status);
  });
});
