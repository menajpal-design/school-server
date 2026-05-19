type VerifyPaymentInput = {
  trxId?: string;
  amount?: number;
  senderNumber?: string;
  gateway?: string;
  orderId?: string;
  paymentTime?: string;
  domain?: string;
};

export const verifyGatewayPayment = async (input: VerifyPaymentInput) => {
  const verifyUrl = process.env.PAYMENT_GATEWAY_VERIFY_URL;
  const apiKey = process.env.PAYMENT_GATEWAY_API_KEY;
  if (!verifyUrl || !apiKey) {
    return { configured: false, verified: false, status: 'pending', message: 'Payment gateway verification is not configured.' };
  }

  try {
    const requestBody: any = {
      payer_number: input.senderNumber,
      amount: input.amount,
      order_id: input.orderId,
      payment_time: input.paymentTime,
      gateway: input.gateway || 'bkash',
    };

    if (input.domain || process.env.PAYMENT_GATEWAY_DOMAIN) {
      requestBody.domain = input.domain || process.env.PAYMENT_GATEWAY_DOMAIN;
    }

    if (input.trxId) {
      requestBody.transactionId = input.trxId;
      requestBody.trxId = input.trxId;
    }

    const response = await fetch(verifyUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': apiKey,
      },
      body: JSON.stringify(requestBody),
    });

    const data: any = await response.json().catch(() => ({}));
    const verified = response.ok && (data.verified === true || data.success === true || data.status === 'success' || data.status === 'verified');
    return {
      configured: true,
      verified,
      status: verified ? 'verified' : 'failed',
      data,
      message: data.message || (verified ? 'Payment verified' : 'Payment verification failed'),
    };
  } catch (error: any) {
    return { configured: true, verified: false, status: 'failed', message: error?.message || 'Payment verification failed' };
  }
};
