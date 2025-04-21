import crypto from 'crypto';

export const verifyMoonPaySignature = (payload, signature) => {
  try {
    const secret = process.env.MOONPAY_WEBHOOK_SECRET;
    const hmac = crypto.createHmac('sha256', secret);
    const calculatedSignature = hmac
      .update(JSON.stringify(payload))
      .digest('hex');

    return crypto.timingSafeEqual(
      Buffer.from(signature),
      Buffer.from(calculatedSignature)
    );
  } catch (error) {
    console.error('Error verifying MoonPay signature:', error);
    return false;
  }
}; 