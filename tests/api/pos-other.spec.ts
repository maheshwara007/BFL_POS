import { post, getToken, isMember, commitBody, rnd, now, STORE_ID, POS_MOBILE } from './helpers';

const ctx: any = {};

describe('POS Other APIs', () => {
  beforeAll(async () => {
    ctx.token = getToken();
    const member = await isMember(ctx.token, POS_MOBILE, 'POS');
    ctx.memberId = member.memberId;
    ctx.storeId = member.storeId;
  });

  test('POS-TC-015: Load wallet balance from gift card', async () => {
    const id = rnd();
    const { status, body } = await post('/rprest/api/transaction/v1/loadwalletfromgiftcard', {
      reqId: `BFLIL${id}`, storeId: ctx.storeId, terminalId: '1',
      receiptNo: `BFLIL${id}`, reqTimeStamp: now(), cashierId: 'EMP001',
      channel: 'POS', memberId: ctx.memberId,
      cardNumber: '0318127326939103',
      pinCode: 4395,
      gencode: 1220001,
    }, ctx.token);
    expect([200, 400, 422]).toContain(status);
    if (status === 200) {
      expect(body).toBeDefined();
    }
  });

  test('POS-TC-016: Get wallet transaction history (walletledger)', async () => {
    const { status, body } = await post('/rprest/api/transaction/v1/walletledger', {
      reqId: `REQ${rnd()}`, storeId: ctx.storeId, terminalId: '1', reqTimeStamp: now(),
      channel: 'POS', memberId: ctx.memberId,
      fromDate: '', toDate: '', page: 0, pageSize: 10, txnType: '',
    }, ctx.token);
    expect(status).toBe(200);
    expect(body).toBeDefined();
  });

  test('POS-TC-017: Calculate points for cart items', async () => {
    const { status, body } = await post('/rprest/api/transaction/v1/calculatePointsForCartItems', {
      reqId: `REQ${rnd()}`, storeId: ctx.storeId, memberId: ctx.memberId,
      channel: 'POS', omniChannel: 'APP',
      cartItems: [
        {
          itemId: 1, quantity: 1, price: 500.00,
          concept: 'BFL', brand: 'ADIDAS',
          department: 'BFL MEN SHOES', division: 'SHOES',
          discount: 0.00, taxType: 'VAT',
        },
      ],
      billDetails: {
        subTotal: 500.00, totalDiscount: 0.00, totalAfterDiscount: 500.00,
        totalTax: 25.00, totalAfterTax: 500.00, taxType: 'VAT', taxRate: 5,
        totalQuantity: 1,
      },
    }, ctx.token);
    expect(status).toBe(200);
    expect(body).toBeDefined();
  });
});
