import { post, getToken, isMember, commitBody, defaultItem, computeBillDetails, rnd, now, WEB_MOBILE } from './helpers';

const ctx: any = {};

describe('WEB Return / Order Status', () => {
  beforeAll(async () => {
    ctx.token = getToken();
    const member = await isMember(ctx.token, WEB_MOBILE, 'WEB');
    ctx.memberId = member.memberId;
    ctx.storeId = member.storeId;

    const id = rnd();
    const commitRes = await post('/rprest/api/transaction/v1/commitTransaction',
      commitBody({
        id, storeId: ctx.storeId, memberId: ctx.memberId, channel: 'WEB',
        items: [
          defaultItem(1, { quantity: 1, grossPrice: 300.00, netPrice: 285.00, vatAmount: 15.00 }),
          defaultItem(2, { sku: '153837', hsnCode: '1123', quantity: 1, grossPrice: 200.00, netPrice: 190.00, vatAmount: 10.00 }),
        ],
        tenderDetails: [{ code: 'T1', amount: 500.00 }],
      }), ctx.token);
    ctx.originalReceiptNo = commitRes.body.receiptNo;
  });

  test('WEB-TC-007: Full return (WEB channel)', async () => {
    const id = rnd();
    const recallRes = await post('/rprest/api/transaction/v1/recallReceipt', {
      reqId: `BFLINR${id}`, storeId: ctx.storeId, terminalId: '1',
      receiptNo: `BFLINR${id}`, reqTimeStamp: now(), cashierId: '',
      channel: 'WEB', memberId: ctx.memberId,
      requestType: 'Recall Receipt', receiptToRecallNo: ctx.originalReceiptNo,
    }, ctx.token);
    expect(recallRes.status).toBe(200);

    const exchId = rnd();
    await post('/rprest/api/transaction/v1/exchangeLine', {
      reqId: `BFLINR${exchId}`, storeId: ctx.storeId, terminalId: '1',
      receiptNo: `BFLINR${exchId}`, reqTimeStamp: now(), cashierId: '',
      channel: 'WEB', memberId: ctx.memberId,
      commitRequestType: 'Complete', txnDate: now(), couponCodes: [],
      itemDetails: [
        { itemType: 'Product', quantity: 1, previousLineNo: 1, isReturn: 'Yes' },
        { itemType: 'Product', quantity: 1, previousLineNo: 2, isReturn: 'Yes' },
      ],
      previousReceiptNo: ctx.originalReceiptNo,
    }, ctx.token);

    const retId = rnd();
    const retItems = [
      defaultItem(3, { quantity: 1, grossPrice: 300.00, netPrice: 285.00, vatAmount: 15.00, previousLineNo: 1, isReturn: 'Yes' }),
      defaultItem(4, { sku: '153837', hsnCode: '1123', quantity: 1, grossPrice: 200.00, netPrice: 190.00, vatAmount: 10.00, previousLineNo: 2, isReturn: 'Yes' }),
    ];
    const returnRes = await post('/rprest/api/transaction/v1/commitTransaction', {
      reqId: `BFLIN${retId}`, storeId: ctx.storeId, terminalId: '1',
      receiptNo: `BFLIN${retId}`, reqTimeStamp: now(), cashierId: '',
      channel: 'WEB', memberId: ctx.memberId,
      commitRequestType: 'Complete', txnDate: now(), couponCodes: [],
      itemDetails: retItems,
      previousReceiptNo: ctx.originalReceiptNo,
      tenderDetails: [{ code: 'TW01', amount: 500.00 }],
      billDetails: computeBillDetails(retItems, retId),
    }, ctx.token);
    expect(returnRes.status).toBe(200);
    expect(returnRes.body.receiptNo).toBeDefined();
  });

  test('WEB-TC-008: Update order status to Delivered (WEB channel)', async () => {
    const id = rnd();
    const commitRes = await post('/rprest/api/transaction/v1/commitTransaction',
      commitBody({
        id, storeId: ctx.storeId, memberId: ctx.memberId, channel: 'WEB',
        items: [defaultItem(1), defaultItem(2, { sku: '153837', hsnCode: '1123' })],
        tenderDetails: [{ code: 'T1', amount: 1000.00 }],
      }), ctx.token);
    expect(commitRes.status).toBe(200);
    const receiptNo = commitRes.body.receiptNo;

    const statusId = rnd();
    const updateRes = await post('/rprest/api/transaction/v1/upadteOrderStatus', {
      reqId: `BFLINU${statusId}`, storeId: ctx.storeId, terminalId: '1',
      receiptNo: `BFLINU${statusId}`, reqTimeStamp: now(), cashierId: '',
      channel: 'WEB', memberId: ctx.memberId,
      previousReceiptNo: receiptNo,
      updateOrderStatusItemDetails: [
        { lineItemNo: 1, orderStatus: 'Delivered' },
        { lineItemNo: 2, orderStatus: 'Delivered' },
      ],
    }, ctx.token);
    expect(updateRes.status).toBe(200);
  });
});
