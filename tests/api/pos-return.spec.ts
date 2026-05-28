import { post, getToken, isMember, commitBody, defaultItem, computeBillDetails, rnd, now, STORE_ID, POS_MOBILE } from './helpers';

const ctx: any = {};

describe('POS Return / Exchange Transactions', () => {
  beforeAll(async () => {
    ctx.token = getToken();
    const member = await isMember(ctx.token, POS_MOBILE, 'POS');
    ctx.memberId = member.memberId;
    ctx.storeId = member.storeId;

    // Create an initial transaction to return against
    const id = rnd();
    const commitRes = await post('/rprest/api/transaction/v1/commitTransaction',
      commitBody({
        id, storeId: ctx.storeId, memberId: ctx.memberId, channel: 'POS',
        items: [
          defaultItem(1, { quantity: 2, grossPrice: 200.00, netPrice: 380.00, vatAmount: 20.00 }),
          defaultItem(2, { sku: '153837', hsnCode: '1123', quantity: 1, grossPrice: 300.00, netPrice: 285.00, vatAmount: 15.00 }),
        ],
        tenderDetails: [{ code: 'T1', amount: 700.00 }],
      }), ctx.token);
    ctx.originalReceiptNo = commitRes.body.receiptNo;
    ctx.originalReqId = commitRes.body.reqId;
  });

  test('POS-TC-012: Full return - recallReceipt + exchangeLine + returnCommit', async () => {
    const id = rnd();
    const recallRes = await post('/rprest/api/transaction/v1/recallReceipt', {
      reqId: `BFLINR${id}`, storeId: ctx.storeId, terminalId: '1',
      receiptNo: `BFLINR${id}`, reqTimeStamp: now(), cashierId: 'EMP001',
      channel: 'POS', memberId: ctx.memberId,
      requestType: 'Recall Receipt', receiptToRecallNo: ctx.originalReceiptNo,
    }, ctx.token);
    expect(recallRes.status).toBe(200);

    const exchId = rnd();
    const exchRes = await post('/rprest/api/transaction/v1/exchangeLine', {
      reqId: `BFLINR${exchId}`, storeId: ctx.storeId, terminalId: '1',
      receiptNo: `BFLINR${exchId}`, reqTimeStamp: now(), cashierId: 'EMP001',
      channel: 'POS', memberId: ctx.memberId,
      commitRequestType: 'Complete', txnDate: now(), couponCodes: [],
      itemDetails: [
        { itemType: 'Product', quantity: 2, previousLineNo: 1, isReturn: 'Yes' },
        { itemType: 'Product', quantity: 1, previousLineNo: 2, isReturn: 'Yes' },
      ],
      previousReceiptNo: ctx.originalReceiptNo,
    }, ctx.token);
    expect(exchRes.status).toBe(200);

    const retId = rnd();
    const retItems = [
      defaultItem(3, { quantity: 2, grossPrice: 200.00, netPrice: 380.00, vatAmount: 20.00, previousLineNo: 1, isReturn: 'Yes' }),
      defaultItem(4, { sku: '153837', hsnCode: '1123', quantity: 1, grossPrice: 300.00, netPrice: 285.00, vatAmount: 15.00, previousLineNo: 2, isReturn: 'Yes' }),
    ];
    const returnRes = await post('/rprest/api/transaction/v1/commitTransaction', {
      reqId: `BFLIN${retId}`, storeId: ctx.storeId, terminalId: '1',
      receiptNo: `BFLIN${retId}`, reqTimeStamp: now(), cashierId: 'EMP001',
      channel: 'POS', memberId: ctx.memberId, commitRequestType: 'Complete',
      txnDate: now(), couponCodes: [],
      itemDetails: retItems,
      previousReceiptNo: ctx.originalReceiptNo,
      tenderDetails: [{ code: 'TW01', amount: 700.00 }],
      billDetails: computeBillDetails(retItems, retId),
    }, ctx.token);
    expect(returnRes.status).toBe(200);
    expect(returnRes.body.receiptNo).toBeDefined();
  });

  test('POS-TC-013: Partial return - only one line returned', async () => {
    // Create a fresh transaction to partially return
    const txnId = rnd();
    const commitRes = await post('/rprest/api/transaction/v1/commitTransaction',
      commitBody({
        id: txnId, storeId: ctx.storeId, memberId: ctx.memberId, channel: 'POS',
        items: [
          defaultItem(1, { quantity: 1, grossPrice: 200.00, netPrice: 190.00, vatAmount: 10.00 }),
          defaultItem(2, { sku: '153837', hsnCode: '1123', quantity: 1, grossPrice: 300.00, netPrice: 285.00, vatAmount: 15.00 }),
        ],
        tenderDetails: [{ code: 'T1', amount: 500.00 }],
      }), ctx.token);
    expect(commitRes.status).toBe(200);
    const partialReceiptNo = commitRes.body.receiptNo;

    const id = rnd();
    await post('/rprest/api/transaction/v1/recallReceipt', {
      reqId: `BFLINR${id}`, storeId: ctx.storeId, terminalId: '1',
      receiptNo: `BFLINR${id}`, reqTimeStamp: now(), cashierId: 'EMP001',
      channel: 'POS', memberId: ctx.memberId,
      requestType: 'Recall Receipt', receiptToRecallNo: partialReceiptNo,
    }, ctx.token);

    const exchId = rnd();
    await post('/rprest/api/transaction/v1/exchangeLine', {
      reqId: `BFLINR${exchId}`, storeId: ctx.storeId, terminalId: '1',
      receiptNo: `BFLINR${exchId}`, reqTimeStamp: now(), cashierId: 'EMP001',
      channel: 'POS', memberId: ctx.memberId,
      commitRequestType: 'Complete', txnDate: now(), couponCodes: [],
      itemDetails: [{ itemType: 'Product', quantity: 1, previousLineNo: 1, isReturn: 'Yes' }],
      previousReceiptNo: partialReceiptNo,
    }, ctx.token);

    const retId = rnd();
    const retItems2 = [
      defaultItem(3, { quantity: 1, grossPrice: 200.00, netPrice: 190.00, vatAmount: 10.00, previousLineNo: 1, isReturn: 'Yes' }),
    ];
    const returnRes = await post('/rprest/api/transaction/v1/commitTransaction', {
      reqId: `BFLIN${retId}`, storeId: ctx.storeId, terminalId: '1',
      receiptNo: `BFLIN${retId}`, reqTimeStamp: now(), cashierId: 'EMP001',
      channel: 'POS', memberId: ctx.memberId, commitRequestType: 'Complete',
      txnDate: now(), couponCodes: [],
      itemDetails: retItems2,
      previousReceiptNo: partialReceiptNo,
      tenderDetails: [{ code: 'TW01', amount: 190.00 }],
      billDetails: computeBillDetails(retItems2, retId),
    }, ctx.token);
    expect(returnRes.status).toBe(200);
    expect(returnRes.body.receiptNo).toBeDefined();
  });

  test('POS-TC-014: Update order status to Delivered', async () => {
    const id = rnd();
    const commitRes = await post('/rprest/api/transaction/v1/commitTransaction',
      commitBody({
        id, storeId: ctx.storeId, memberId: ctx.memberId, channel: 'POS',
        items: [defaultItem(1), defaultItem(2, { sku: '153837', hsnCode: '1123' })],
        tenderDetails: [{ code: 'T1', amount: 1000.00 }],
      }), ctx.token);
    expect(commitRes.status).toBe(200);
    const receiptNo = commitRes.body.receiptNo;

    const statusId = rnd();
    const updateRes = await post('/rprest/api/transaction/v1/upadteOrderStatus', {
      reqId: `BFLINU${statusId}`, storeId: ctx.storeId, terminalId: '1',
      receiptNo: `BFLINU${statusId}`, reqTimeStamp: now(), cashierId: 'EMP001',
      channel: 'POS', memberId: ctx.memberId,
      previousReceiptNo: receiptNo,
      updateOrderStatusItemDetails: [
        { lineItemNo: 1, orderStatus: 'Delivered' },
        { lineItemNo: 2, orderStatus: 'Delivered' },
      ],
    }, ctx.token);
    expect(updateRes.status).toBe(200);
  });
});
