# GatewayFlow Developer Integration Guide

Merchant integration made easy

Follow these steps to connect another domain or website to GatewayFlow.

Gateway host: https://payment-gateway-server-ten.vercel.app
Widget script: https://payment-gateway-server-ten.vercel.app/widget.js

## Copy-paste starter code

Insert the hosted widget and a Pay button. For plain HTML:

```html
<script>
  window.GATEWAY_WIDGET_URL = "https://payment-gateway-server-ten.vercel.app";
</script>
<script src="https://payment-gateway-server-ten.vercel.app/widget.js"></script>

<button
  onclick="GatewayWidget.open({
    apiKey: 'your_website_api_key',
    domain: 'your-merchant-domain.com',
    amount: 500,
    callback: 'https://your-merchant-site.com/payment-return',
    onComplete: (result) => console.log('payment complete', result)
  })"
>
  Pay Now
</button>
```

For Next.js/React (recommended to load the hosted script via `next/script`):

```jsx
function PayButton() {
  return (
    <button
      onClick={() => {
        window.GatewayWidget.open({
          apiKey: process.env.NEXT_PUBLIC_GATEWAY_API_KEY,
          domain: 'your-merchant-domain.com',
          amount: 500,
          callback: 'https://your-merchant-site.com/payment-return',
          onComplete: (result) => console.log(result)
        });
      }}
    >
      Pay Now
    </button>
  );
}
```

> Note: This repo hardcodes the widget host directly in code and does not require a widget URL environment variable.

### Recommended popup payload

```js
{
  amount: 500,
  callback: 'https://your-merchant-site.com/payment-return',
  orderId: 'ORD-1001',
  customerName: 'John Doe',
  customerPhone: '0179007328',
  onComplete: (result) => { console.log(result); }
}
```

## Important rules

- API Keys: Keep website API keys server-side. Use them from your server when verifying payments.
- Website credentials: Use the keys from your server or checkout popup integration. Customer payment verification sends payer number, amount, order ID, and payment time.
- Open a brand with a matching gateway payment reference to unlock API keys.

## Integration checklist

Live links:

- Merchant portal: https://gateway-client-rho.vercel.app/
- Portal route map: https://gateway-client-rho.vercel.app/portal

This guide is written for merchants and developers who want to embed GatewayFlow into another website, verify payments automatically, and manage plans, domains, and staff users from the portal.

### 1. What the flow looks like

1. Your website shows a Pay button.
2. The button opens the GatewayFlow popup.
3. The customer selects bKash, Nagad, Rocket, or another configured wallet.
4. The Android app forwards the payment SMS to the gateway server.
5. The gateway server matches sender number, amount, and time.
6. Your website receives the result through callback, popup completion, or server polling.

### 2. What you need before integrating

- A GatewayFlow server URL (example: `https://payment-gateway-server-ten.vercel.app`).
- A website API key from the merchant portal.
- A callback URL on your own domain.
- The hosted `widget.js` script from your gateway server.

### 3. Merchant portal route map

Refer to the portal routes for direct links to sections. Common sections include `/portal`, `/portal/transactions`, `/portal/payment-link`, `/portal/devices`, `/portal/payment-settings`, `/portal/brands`, and developer docs at `/portal/developer-docs`.

### 4. Add the popup widget to your site

See the Copy-paste starter code above. Ensure you restrict callback URLs to approved domains in the portal.

### 5. Merchant payment verification API

Use this API when your server needs to verify a payment for a specific domain.

Request:

```
POST /api/merchant/verify
X-API-Key: website_api_key
Content-Type: application/json
```

Body example:

```json
{
  "domain": "school.example.com",
  "payer_number": "0179007328",
  "amount": 500,
  "order_id": "ORD-1001",
  "payment_time": "2026-05-19T12:30:00+06:00"
}
```

Rules:

- No customer payment reference is needed.
- The server matches `payer_number + amount + payment_time`.
- The request must use the website API key assigned to the domain.

### 6. Common server routes

| Method | Route | Purpose |
| --- | --- | --- |
| POST | /api/payment/gateway/initiate | Start a popup payment session |
| POST | /api/payment/gateway/verify-sms | Verify Android SMS payload |
| GET  | /api/payment/gateway/status/:paymentId | Check payment status |
| POST | /api/payment/gateway/cancel/:paymentId | Cancel a pending payment |
| POST | /api/merchant/verify | Verify a merchant payment by domain |

### 7. Subscription, domain, and user model

GatewayFlow supports multi-website setup. One client can buy a plan, add domains, and create staff users. Each domain can collect payments separately using the popup widget and the domain's API key.

Suggested workflow:

1. Admin creates or activates the client.
2. Admin grants download permission and subscription access.
3. Client adds domains from the portal.
4. Client creates staff users.
5. Each website uses the popup widget and its API key.

### 8. Security notes

- Never expose admin credentials in frontend code.
- Keep API keys server-side or in the dashboard only.
- Restrict callback URLs to approved domains.
- Validate amount, phone number, and payment time before accepting a payment.
- Keep one gateway host URL per environment: development, staging, and production.

### 9. Troubleshooting

- **Validation Errors:** If the checkout popup does not open and displays an alert:
  - `Gateway API key is required`: Make sure `apiKey` is provided in the options object and is not empty.
  - `Valid merchant domain is required`: Verify the `domain` option is set correctly.
  - `API key is not allowed for this domain`: Confirm that the domain matches your brand's configured domain in the merchant portal and that you are using the corresponding live API key.
- If a popup does not open without any alert message, check the browser's popup blocker settings.
- If a popup does not open, confirm `window.GATEWAY_WIDGET_URL` or the script source is set correctly.
- If verification fails, compare sender number formatting and the exact amount.
- If a portal route looks blank after refresh, use the portal route directly (e.g., `/portal/transactions`).

### 10. Example merchant page

```html
<script>
  window.GATEWAY_WIDGET_URL = "https://payment-gateway-server-ten.vercel.app";
</script>
<script src="https://payment-gateway-server-ten.vercel.app/widget.js"></script>
<button onclick="GatewayWidget.open({
  apiKey: 'your_website_api_key',
  domain: 'your-merchant-domain.com',
  amount: 500,
  callback: 'https://your-merchant-site.com/return'
})">Pay Now</button>
```

---

File created: docs/GATEWAYFLOW_INTEGRATION.md

## 11. সাশ্রয়ী (Economical) পেমেন্ট অপশন

এই সেকশনটি এমন merchants-এর জন্য যারা লো-ফি অথবা কম অপারেশনাল খরচে পেমেন্ট সংগ্রহ করতে চায়। মূল ধারণা হচ্ছে: কস্ট কমাতে সরাসরি ওয়ালেট ব্যবহার, ব্যাচ-ভেরিফিকেশন এবং সার্ভার-সাইড ভেরিফিকেশনকে প্রাধান্য দেওয়া।

- কোন ক্ষেত্রে ব্যবহার করবেন: ছোট ট্রানজ্যাকশান, সাবস্ক্রিপশন ফি, বা যেখানে ট্রানজ্যাকশন ফি কম রাখা প্রয়োজন।
- কীভাবে কাজ করে (সারাংশ):
  - পপআপ থেকে গ্রাহক ওয়ালেট বেছে নেয় (bKash/Nagad/Rocket)।
  - Android অ্যাপ এ এসএমএস সংগ্রহ করে গেটওয়ে সার্ভারে ফরওয়ার্ড করে।
  - সার্ভার ব্যাচ/পুলিংয়ে এসএমএস মিলায় এবং একবারে একাধিক রিকোয়েস্ট ভেরিফাই করে অপারেশনাল খরচ কমায়।

Best practices (সংশ্লিষ্ট টিপস):

- ওয়ালেট নির্বাচন সীমাবদ্ধ করুন — শুধুমাত্র সস্তা/কম ফি অপশনগুলো দেখান (`preferredMethods: ['bkash','nagad']`)।
- round amounts আর সংক্ষিপ্ত orderId ব্যবহার করুন যাতে matching সহজ হয় এবং মিস-ম্যাচ কমে।
- সার্ভার-সাইড ভেরিফিকেশন ব্যবহার করুন — ক্লায়েন্ট থেকে শুধু `orderId` পাঠান, সার্ভার API-কে একবারে ভেরিফাই করান।
- ব্যাচ ভেরিফিকেশন: gateway সার্ভার থেকে সময়ভিত্তিক SMS/ট্রানজ্যাকশন সেট ফেচ করে একসাথে মিল করুন, যাতে প্রতি-ট্রানজ্যাকশনে আলাদা ম্যানুয়াল চেক না করতে হয়।
- webhook/notify ব্যবহার করুন: যদি গেটওয়ে সার্ভার `webhook` বা `push` দেয়, সেটা ব্যবহার করে আপনার সার্ভার অন-the-fly আপডেট নিন — পুলিং-কমিয়ে খরচ কমবে।

সংক্ষিপ্ত কোড উদাহরণ (পপআপ থেকে 'preferredMethods' পাঠানো):

```html
<script src="https://payment-gateway-server-ten.vercel.app/widget.js"></script>
<button onclick="GatewayWidget.open({
  apiKey: 'your_website_api_key',
  domain: 'your-merchant-domain.com',
  amount: 250,
  preferredMethods: ['bkash','nagad'],
  callback: 'https://your-merchant-site.com/payment-return',
  orderId: 'ORD-ECON-1001',
  onComplete: (r) => console.log('done', r)
})">Pay Low-Fee</button>
```

Server-side verify (economical flow): সার্ভার থেকে `_merchant/verify` এ রিকোয়েস্ট পাঠিয়ে নিধারিত মিল (payer_number + amount + payment_time) চেক করুন — ব্যাচ পদ্ধতিতে করে নিলে API কল সংখ্যা কমে। উদাহরণ:

```http
POST /api/merchant/verify
X-API-Key: website_api_key
Content-Type: application/json

{
  "domain": "school.example.com",
  "payer_number": "0179007328",
  "amount": 250,
  "order_id": "ORD-ECON-1001",
  "payment_time": "2026-05-19T12:30:00+06:00"
}
```

নিরাপত্তা ও রেকমেন্ডেশন:

- ব্যাচ ভেরিফিকেশন চালানোর সময় টাইম-রেঞ্জ সীমাবদ্ধ রাখুন (উদাহরণ: ±2 মিনিট) যাতে মিস-অ্যাসাইনমেন্ট কমে।
- অ্যাপ/গেটওয়ে থেকে আসা এসএমএসের ফরম্যাট ভ্যারিয়েন্স হ্যান্ডেল করুন (ফোন নম্বর নর্মালাইজেশন)।
- পেমেন্ট রেকর্ডিংয়ের আগে সার্ভার-সাইডে `amount` এবং `orderId` ভ্যালিডেট করুন।

এই অপশনটি ইউজারদের জন্য খরচ কার্যকর করার লক্ষ্য রাখে — আপনি চাইলে আমি `client` পেজে একটি আলাদা "Low-fee" বোতাম যোগ করে demo করে দিতে পারি।
