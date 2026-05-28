import { post, getToken, isMember, rnd, now, WEB_MOBILE } from './helpers';

const ctx: any = {};

describe('WEB Other APIs', () => {
  beforeAll(async () => {
    ctx.token = getToken();
    const member = await isMember(ctx.token, WEB_MOBILE, 'WEB');
    ctx.memberId = member.memberId;
    ctx.storeId = member.storeId;
  });

  test('WEB-TC-009: Get member coupons (WEB channel)', async () => {
    const { status, body } = await post('/rprest/api/transaction/v1/getMemberCoupons', {
      reqId: `REQ${rnd()}`, storeId: ctx.storeId, terminalId: 1,
      receiptNo: `TXN${rnd()}`, reqTimeStamp: now(), cashierId: 'EMP001',
      channel: 'WEB', memberId: ctx.memberId,
      countryCode: 'AE', pageNo: 0, pageSize: 10,
    }, ctx.token);
    expect(status).toBe(200);
    expect(body).toBeDefined();
  });

  test('WEB-TC-010: Calculate points for cart items (WEB/APP)', async () => {
    const { status, body } = await post('/rprest/api/transaction/v1/calculatePointsForCartItems', {
      reqId: `REQ${rnd()}`, storeId: ctx.storeId, memberId: ctx.memberId,
      channel: 'WEB', omniChannel: 'APP',
      cartItems: [
        {
          itemId: 1, quantity: 1, price: 500.00,
          concept: 'BFL', brand: 'ADIDAS',
          department: 'BFL MEN SHOES', division: 'SHOES',
          discount: 0.00, taxType: 'VAT',
        },
        {
          itemId: 2, quantity: 2, price: 300.00,
          concept: 'BFL', brand: 'ADIDAS',
          department: 'BFL MEN SHOES', division: 'SHOES',
          discount: 10.00, taxType: 'VAT',
        },
      ],
      billDetails: {
        subTotal: 1100.00, totalDiscount: 10.00, totalAfterDiscount: 1090.00,
        totalTax: 55.00, totalAfterTax: 1090.00, taxType: 'VAT', taxRate: 5,
        totalQuantity: 3,
      },
    }, ctx.token);
    expect(status).toBe(200);
    expect(body).toBeDefined();
  });
});
