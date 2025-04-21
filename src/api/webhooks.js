import express from 'express';
import moonpayService from '../services/moonpayService';
import { verifyMoonPaySignature } from '../utils/moonpay';

const router = express.Router();

router.post('/moonpay', async (req, res) => {
  try {
    // Verify the webhook signature
    const signature = req.headers['x-moonpay-signature'];
    const isValid = verifyMoonPaySignature(req.body, signature);

    if (!isValid) {
      return res.status(401).json({ error: 'Invalid signature' });
    }

    // Handle the webhook
    const result = await moonpayService.handleWebhook(req.body);

    if (result.success) {
      res.status(200).json({ message: result.message });
    } else {
      res.status(400).json({ error: result.message });
    }
  } catch (error) {
    console.error('Error processing MoonPay webhook:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router; 