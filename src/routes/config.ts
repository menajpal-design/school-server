import { Router, Request, Response } from 'express';
import { config } from '../config/config';
import { isDatabaseConnected } from '../config/database';

const router = Router();

/**
 * GET /api/config/endpoints
 * Get public configuration endpoints
 * This allows client apps to dynamically fetch server URLs
 */
router.get('/endpoints', (req: Request, res: Response) => {
  const cfg = config();
  
  return res.json({
    success: true,
    data: {
      serverUrl: cfg.staticServerUrl,
      apiBaseUrl: `${cfg.staticServerUrl}/api`,
      clientUrl: cfg.frontendUrl,
      mobileUrl: cfg.mobileUrl,
      androidUrl: cfg.androidUrl,
      allowedOrigins: cfg.allowedOrigins,
      environment: cfg.nodeEnv,
      timestamp: new Date().toISOString(),
    },
  });
});

/**
 * GET /api/config/status
 * Health check with configuration info
 */
router.get('/status', (req: Request, res: Response) => {
  const cfg = config();
  
  return res.json({
    success: true,
    data: {
      status: 'online',
      environment: cfg.nodeEnv,
      serverUrl: cfg.staticServerUrl,
      clientUrl: cfg.frontendUrl,
      androidUrl: cfg.androidUrl,
      databaseConnected: isDatabaseConnected(),
      features: {
        emailEnabled: cfg.emailEnabled,
        smsEnabled: cfg.smsEnabled,
      },
      timestamp: new Date().toISOString(),
    },
  });
});

export default router;
