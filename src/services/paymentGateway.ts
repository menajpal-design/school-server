type VerifyPaymentInput = {
  trxId?: string;
  amount?: number;
  senderNumber?: string;
  gateway?: string;
};

export const verifyGatewayPayment = async (input: VerifyPaymentInput) => {
  const verifyUrl = process.env.PAYMENT_GATEWAY_VERIFY_URL;
  const apiKey = process.env.PAYMENT_GATEWAY_API_KEY;
  if (!verifyUrl || !apiKey || !input.trxId) {
    return { configured: Boolean(verifyUrl && apiKey), verified: false, status: 'pending', message: 'Payment gateway verification is not configured.' };
  }

  try {
    const response = await fetch(verifyUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
        'x-api-key': apiKey,
      },
      body: JSON.stringify({
        trxId: input.trxId,
        transactionId: input.trxId,
        amount: input.amount,
        senderNumber: input.senderNumber,
        gateway: input.gateway || 'bkash',
      }),
    });
    const data: any = await response.json().catch(() => ({}));
    const verified = response.ok && (data.verified === true || data.success === true || data.status === 'success' || data.status === 'verified');
    return { configured: true, verified, status: verified ? 'verified' : 'failed', data, message: data.message || (verified ? 'Payment verified' : 'Payment verification failed') };
  } catch (error: any) {
    return { configured: true, verified: false, status: 'failed', message: error?.message || 'Payment verification failed' };
  }
};
