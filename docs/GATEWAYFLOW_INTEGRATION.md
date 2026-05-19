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
    amount: 500,
    callback: 'https://your-merchant-site.com/payment-return',
    onComplete: (result) => console.log('payment complete', result)
  })"
>
  Pay Now
</button>
```

For Next.js/React (recommended to load the hosted script via `next/script`):

```
NEXT_PUBLIC_PAYMENT_WIDGET_URL=https://payment-gateway-server-ten.vercel.app
```

```jsx
function PayButton() {
  return (
    <button
      onClick={() => {
        window.GatewayWidget.open({
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

- If a popup does not open, confirm `window.GATEWAY_WIDGET_URL` or the script source is set correctly.
- If verification fails, compare sender number formatting and the exact amount.
- If a portal route looks blank after refresh, use the portal route directly (e.g., `/portal/transactions`).

### 10. Example merchant page

```html
<script>
  window.GATEWAY_WIDGET_URL = "https://payment-gateway-server-ten.vercel.app";
</script>
<script src="https://payment-gateway-server-ten.vercel.app/widget.js"></script>
<button onclick="GatewayWidget.open({ amount: 500, callback: 'https://your-merchant-site.com/return' })">Pay Now</button>
```

---

File created: docs/GATEWAYFLOW_INTEGRATION.md
