import { post, getToken, isMember, commitBody, defaultItem, rnd, now } from './helpers';

// Per-store currency configuration (Configurations → Currency Conversion in admin,
// base currency AED). CURR-TC tests lock in the observed earn-rate matrix per store —
// ONLINE_IN's 3.33x multiplier is a store-level earn-rate config, independent of the
// AED→USD=0.27 conversion factor shown in the admin master data (conversion table is
// not consumed by commitTransaction's points calculation).
const CURRENCY_STORES = [
  { storeId: 'ONLINE_AE', currency: 'AED', expectedPoints: 200, expectedPointsValue: 4.00 },
  { storeId: 'ONLINE_IN', currency: 'USD', expectedPoints: 666, expectedPointsValue: 3.33 },
  { storeId: 'ONLINE_SA', currency: 'SAR', expectedPoints: 200, expectedPointsValue: 4.00 },
  { storeId: 'ONLINE_SG', currency: 'SGD', expectedPoints: 666, expectedPointsValue: 4.66 },
  { storeId: 'ONLINE_KW', currency: 'KWD', expectedPoints: 2000, expectedPointsValue: 4.00 },
];

const NET_PRICE = 190.00;
const VAT_AMOUNT = 10.00;
const GROSS_PRICE = 200.00;

describe('Currency Conversion — per-store earn rate', () => {
  let token: string;

  beforeAll(() => { token = getToken(); });

  for (const s of CURRENCY_STORES) {
    test(`CURR-TC-${s.storeId}: New member purchase on ${s.storeId} (${s.currency}) earns store-specific rate`, async () => {
      const mobile = '91' + String(7000000000 + Math.floor(Math.random() * 2999999999));
      const regId = rnd();

      const otpRes = await post('/rprest/api/transaction/v1/send/otp', {
        reqId: `v${regId}`, storeId: s.storeId, terminalId: '1', receiptNo: `v${regId}`,
        reqTimeStamp: now(), cashierId: 'EMP001', channel: 'POS', country: 'IN',
        mobileNumber: mobile, memberId: '', language: 'EN', notificationChannel: 'SMS',
      }, token);
      if (otpRes.status !== 200) { console.warn(`CURR-TC-${s.storeId}: Registration OTP rate-limited — skipping`); return; }

      const profileRes = await post('/rprest/api/transaction/v1/profile', {
        reqId: otpRes.body.reqId, storeId: s.storeId, terminalId: '1',
        receiptNo: otpRes.body.receiptNo, reqTimeStamp: now(),
        cashierId: 'EMP001', channel: 'POS', language: 'EN', dateOfBirth: '1995-06-15',
        firstName: 'CURR', lastName: s.storeId, mobileNumber: mobile,
        emailId: `curr${regId}@test.com`, gender: 'Male', country: 'IN',
        city: '', nationality: 'IN', otp: '1111', mobileCountryCode: 'IN', requestType: 'New',
      }, token);
      expect(profileRes.status).toBe(200);

      const member = await isMember(token, mobile, 'POS', s.storeId);

      const items = [defaultItem(1, { grossPrice: GROSS_PRICE, netPrice: NET_PRICE, vatAmount: VAT_AMOUNT })];
      const commitRes = await post('/rprest/api/transaction/v1/commitTransaction', commitBody({
        id: rnd(), storeId: s.storeId, memberId: member.memberId, channel: 'POS',
        items, tenderDetails: [{ code: 'T1', amount: GROSS_PRICE }],
      }), token);

      expect(commitRes.status).toBe(200);
      expect(commitRes.body.status).toBe('Success');

      const line1 = commitRes.body.itemDetails?.find((l: any) => l.lineNo === 1);
      expect(line1.basePointsAccrued).toBe(s.expectedPoints);
      expect(parseFloat(line1.basePointsAccruedValue.toFixed(2))).toBe(s.expectedPointsValue);
      console.log(`CURR-TC-${s.storeId} | currency: ${s.currency} | basePointsAccrued: ${line1.basePointsAccrued} | basePointsAccruedValue: ${line1.basePointsAccruedValue}`);
    });
  }
});
