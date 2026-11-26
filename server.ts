import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import express from 'express';
import type { PushSubscription } from 'web-push';

const require = createRequire(import.meta.url);
const webpush = require('web-push') as typeof import('web-push');

interface StoredPushDevice {
  deviceId: string;
  staffId: string;
  staffName: string;
  subscription: PushSubscription;
  notificationChannel: 'website_only' | 'mobile_and_website';
  updatedAt: number;
}

interface ScheduledPushAlert {
  key: string;
  deviceId: string;
  staffId: string;
  alertId: string;
  type: 'appointment' | 'shift_start' | 'shift_end' | 'test';
  title: string;
  body: string;
  tag: string;
  url: string;
  view: string;
  appointmentId?: string;
  triggerAtMs: number;
  sentAtMs?: number;
  requireInteraction?: boolean;
}

interface PushStoreData {
  vapidKeys: {
    publicKey: string;
    privateKey: string;
  };
  devices: Record<string, StoredPushDevice>;
  alerts: Record<string, ScheduledPushAlert>;
}

interface IncomingPendingAlert {
  alertId: string;
  type: 'appointment' | 'shift_start' | 'shift_end';
  title: string;
  body: string;
  tag: string;
  view?: string;
  url?: string;
  appointmentId?: string;
  triggerAtMs: number;
}

let dataDir = path.resolve(process.cwd(), '.data');
const VAPID_SUBJECT = process.env.VAPID_SUBJECT || 'mailto:muhammed.shlkamy@gmail.com';
const PORT = Number(process.env.PORT) || 3000;

function getStorePath(): string {
  return path.join(dataDir, 'push-store.json');
}

function ensureDataDir(): boolean {
  try {
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }
    return true;
  } catch {
    try {
      dataDir = path.join(os.tmpdir(), 'clinicflow-push-data');
      if (!fs.existsSync(dataDir)) {
        fs.mkdirSync(dataDir, { recursive: true });
      }
      return true;
    } catch {
      return false;
    }
  }
}

function loadOrCreateStore(): PushStoreData {
  ensureDataDir();
  const storePath = getStorePath();
  const envPub = (process.env.VAPID_PUBLIC_KEY || '').trim();
  const envPriv = (process.env.VAPID_PRIVATE_KEY || '').trim();

  let store: PushStoreData | null = null;
  if (fs.existsSync(storePath)) {
    try {
      const raw = fs.readFileSync(storePath, 'utf-8');
      const parsed = JSON.parse(raw) as Partial<PushStoreData>;
      if (parsed && parsed.vapidKeys?.publicKey && parsed.vapidKeys?.privateKey) {
        store = {
          vapidKeys: parsed.vapidKeys,
          devices: parsed.devices || {},
          alerts: parsed.alerts || {}
        };
      }
    } catch (err) {
      console.warn('[PushStore] Failed to parse existing store, recreating:', err);
    }
  }

  if (!store) {
    const generated =
      envPub && envPriv
        ? { publicKey: envPub, privateKey: envPriv }
        : webpush.generateVAPIDKeys();
    store = {
      vapidKeys: generated,
      devices: {},
      alerts: {}
    };
    persistStore(store);
  } else if (envPub && envPriv && (store.vapidKeys.publicKey !== envPub || store.vapidKeys.privateKey !== envPriv)) {
    store.vapidKeys = { publicKey: envPub, privateKey: envPriv };
    persistStore(store);
  }

  return store;
}

let store: PushStoreData = loadOrCreateStore();
let persistTimer: NodeJS.Timeout | null = null;

function persistStore(target: PushStoreData = store): void {
  try {
    if (!ensureDataDir()) return;
    fs.writeFileSync(getStorePath(), JSON.stringify(target, null, 2), 'utf-8');
  } catch (err) {
    console.warn('[PushStore] Failed to write store:', err);
  }
}

function schedulePersist(): void {
  if (persistTimer) return;
  persistTimer = setTimeout(() => {
    persistTimer = null;
    persistStore();
  }, 400);
}

webpush.setVapidDetails(
  VAPID_SUBJECT,
  store.vapidKeys.publicKey,
  store.vapidKeys.privateKey
);

function isValidSubscription(sub: unknown): sub is PushSubscription {
  if (!sub || typeof sub !== 'object') return false;
  const candidate = sub as Partial<PushSubscription>;
  return (
    typeof candidate.endpoint === 'string' &&
    candidate.endpoint.startsWith('https://') &&
    Boolean(candidate.keys) &&
    typeof candidate.keys?.p256dh === 'string' &&
    typeof candidate.keys?.auth === 'string'
  );
}

async function deliverPushAlert(device: StoredPushDevice, alert: ScheduledPushAlert): Promise<{ ok: boolean; gone?: boolean; error?: string }> {
  const payload = JSON.stringify({
    title: alert.title,
    body: alert.body,
    icon: '/pwa-192x192.png',
    badge: '/pwa-192x192.png',
    tag: alert.tag,
    url: alert.url || '/?view=staff_alerts',
    view: alert.view || 'staff_alerts',
    appointmentId: alert.appointmentId || null,
    alertType: alert.type,
    requireInteraction: alert.requireInteraction ?? true,
    renotify: true,
    vibrate: [300, 120, 300, 120, 450],
    timestamp: Date.now()
  });

  try {
    await webpush.sendNotification(device.subscription, payload, {
      TTL: 60 * 60 * 12,
      urgency: 'high'
    });
    return { ok: true };
  } catch (err: unknown) {
    const statusCode = (err as { statusCode?: number })?.statusCode;
    const msg = err instanceof Error ? err.message : String(err);
    if (statusCode === 404 || statusCode === 410) {
      return { ok: false, gone: true, error: msg };
    }
    return { ok: false, error: msg };
  }
}

let isTickRunning = false;

async function processDuePushAlerts(): Promise<void> {
  if (isTickRunning) return;
  isTickRunning = true;
  try {
    const now = Date.now();
    let changed = false;

    // Prune sent or expired alerts older than 48 hours
    const pruneCutoff = now - 48 * 60 * 60 * 1000;
    for (const [key, alert] of Object.entries(store.alerts)) {
      if ((alert.sentAtMs && alert.sentAtMs < pruneCutoff) || alert.triggerAtMs < pruneCutoff) {
        delete store.alerts[key];
        changed = true;
      }
    }

    const dueAlerts = Object.values(store.alerts).filter(
      a => !a.sentAtMs && a.triggerAtMs <= now
    );

    for (const alert of dueAlerts) {
      const device = store.devices[alert.deviceId];
      if (!device) {
        delete store.alerts[alert.key];
        changed = true;
        continue;
      }

      if (alert.type !== 'test' && device.notificationChannel !== 'mobile_and_website') {
        delete store.alerts[alert.key];
        changed = true;
        continue;
      }

      // Mark sent optimistically to prevent duplicate sends across ticks
      alert.sentAtMs = now;
      changed = true;

      const res = await deliverPushAlert(device, alert);
      if (res.gone) {
        delete store.devices[device.deviceId];
        for (const [k, a] of Object.entries(store.alerts)) {
          if (a.deviceId === device.deviceId) {
            delete store.alerts[k];
          }
        }
      } else if (!res.ok) {
        console.warn(`[WebPush] Failed to send alert ${alert.key}:`, res.error);
      }
    }

    if (changed) {
      schedulePersist();
    }
  } finally {
    isTickRunning = false;
  }
}

setInterval(() => {
  void processDuePushAlerts();
}, 5000);

async function startServer(): Promise<void> {
  const app = express();
  app.use(express.json({ limit: '1mb' }));

  const readBuildVersion = (): { buildId: string; builtAt: string | null } => {
    try {
      const versionPath = path.resolve(process.cwd(), 'dist', 'version.json');
      if (fs.existsSync(versionPath)) {
        const parsed = JSON.parse(fs.readFileSync(versionPath, 'utf-8')) as {
          buildId?: string;
          builtAt?: string;
        };
        if (parsed?.buildId) {
          return { buildId: parsed.buildId, builtAt: parsed.builtAt || null };
        }
      }
    } catch {}
    return { buildId: 'dev', builtAt: null };
  };

  app.get('/api/health', (_req, res) => {
    const version = readBuildVersion();
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.json({
      ok: true,
      buildId: version.buildId,
      builtAt: version.builtAt,
      devices: Object.keys(store.devices).length,
      pendingAlerts: Object.values(store.alerts).filter(a => !a.sentAtMs).length
    });
  });

  app.get('/api/version', (_req, res) => {
    const version = readBuildVersion();
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.json(version);
  });

  app.get('/api/push/vapid-public-key', (_req, res) => {
    res.json({ publicKey: store.vapidKeys.publicKey });
  });

  app.get('/api/push/status', (req, res) => {
    const deviceId = String(req.query.deviceId || '').trim();
    const device = deviceId ? store.devices[deviceId] : undefined;
    const pendingForDevice = deviceId
      ? Object.values(store.alerts).filter(a => a.deviceId === deviceId && !a.sentAtMs)
      : [];
    res.json({
      subscribed: Boolean(device),
      pendingCount: pendingForDevice.length,
      hasTestScheduled: pendingForDevice.some(a => a.type === 'test')
    });
  });

  app.post('/api/push/subscribe', (req, res) => {
    const { deviceId, staffId, staffName, subscription, notificationChannel } = req.body || {};
    if (typeof deviceId !== 'string' || !deviceId.trim()) {
      res.status(400).json({ ok: false, error: 'Missing deviceId' });
      return;
    }
    if (!isValidSubscription(subscription)) {
      res.status(400).json({ ok: false, error: 'Invalid push subscription' });
      return;
    }
    const cleanId = deviceId.trim().slice(0, 128);
    store.devices[cleanId] = {
      deviceId: cleanId,
      staffId: typeof staffId === 'string' ? staffId : 'unknown',
      staffName: typeof staffName === 'string' ? staffName : 'موظف',
      subscription,
      notificationChannel: notificationChannel === 'website_only' ? 'website_only' : 'mobile_and_website',
      updatedAt: Date.now()
    };
    schedulePersist();
    res.json({ ok: true, deviceId: cleanId });
  });

  app.post('/api/push/unsubscribe', (req, res) => {
    const { deviceId } = req.body || {};
    if (typeof deviceId === 'string' && deviceId.trim()) {
      const cleanId = deviceId.trim();
      delete store.devices[cleanId];
      for (const [k, a] of Object.entries(store.alerts)) {
        if (a.deviceId === cleanId) {
          delete store.alerts[k];
        }
      }
      schedulePersist();
    }
    res.json({ ok: true });
  });

  app.post('/api/push/resolve-alert', (req, res) => {
    const { appointmentId } = req.body || {};
    if (typeof appointmentId === 'string' && appointmentId.trim()) {
      const targetId = appointmentId.trim();
      let removed = 0;
      for (const [k, a] of Object.entries(store.alerts)) {
        if (a.appointmentId === targetId && !a.sentAtMs) {
          delete store.alerts[k];
          removed++;
        }
      }
      if (removed > 0) {
        schedulePersist();
      }
      res.json({ ok: true, removed });
      return;
    }
    res.json({ ok: true, removed: 0 });
  });

  app.post('/api/push/sync', (req, res) => {
    const {
      deviceId,
      staffId,
      staffName,
      subscription,
      notificationChannel,
      pendingAlerts,
      resolvedAppointmentIds
    } = req.body || {};

    if (typeof deviceId !== 'string' || !deviceId.trim()) {
      res.status(400).json({ ok: false, error: 'Missing deviceId' });
      return;
    }

    const cleanId = deviceId.trim().slice(0, 128);
    const existingDevice = store.devices[cleanId];
    if (isValidSubscription(subscription)) {
      store.devices[cleanId] = {
        deviceId: cleanId,
        staffId: typeof staffId === 'string' ? staffId : existingDevice?.staffId || 'unknown',
        staffName: typeof staffName === 'string' ? staffName : existingDevice?.staffName || 'موظف',
        subscription,
        notificationChannel: notificationChannel === 'website_only' ? 'website_only' : 'mobile_and_website',
        updatedAt: Date.now()
      };
    } else if (existingDevice) {
      existingDevice.staffId = typeof staffId === 'string' ? staffId : existingDevice.staffId;
      existingDevice.staffName = typeof staffName === 'string' ? staffName : existingDevice.staffName;
      existingDevice.notificationChannel =
        notificationChannel === 'website_only' ? 'website_only' : 'mobile_and_website';
      existingDevice.updatedAt = Date.now();
    }

    // Cancel resolved appointments across ALL subscribed devices so closed phones don't get stale alerts
    if (Array.isArray(resolvedAppointmentIds) && resolvedAppointmentIds.length > 0) {
      const resolvedSet = new Set(resolvedAppointmentIds.map(id => String(id)));
      for (const [k, a] of Object.entries(store.alerts)) {
        if (a.appointmentId && resolvedSet.has(a.appointmentId) && !a.sentAtMs) {
          delete store.alerts[k];
        }
      }
    }

    const device = store.devices[cleanId];
    if (!device) {
      schedulePersist();
      res.json({ ok: true, synced: 0, subscribed: false });
      return;
    }

    const incoming: IncomingPendingAlert[] = Array.isArray(pendingAlerts) ? pendingAlerts : [];
    const incomingKeys = new Set<string>();

    if (device.notificationChannel === 'mobile_and_website') {
      for (const item of incoming) {
        if (!item || typeof item.alertId !== 'string' || typeof item.triggerAtMs !== 'number') continue;
        const key = `${cleanId}::${item.alertId}`;
        incomingKeys.add(key);
        const existing = store.alerts[key];
        // Preserve sentAtMs if the exact same alert and trigger time were already delivered
        const alreadySentSameTrigger =
          existing?.sentAtMs && Math.abs(existing.triggerAtMs - item.triggerAtMs) < 30_000;
        store.alerts[key] = {
          key,
          deviceId: cleanId,
          staffId: device.staffId,
          alertId: item.alertId,
          type: item.type,
          title: item.title,
          body: item.body,
          tag: item.tag,
          url: item.url || '/?view=staff_alerts',
          view: item.view || 'staff_alerts',
          appointmentId: item.appointmentId,
          triggerAtMs: item.triggerAtMs,
          sentAtMs: alreadySentSameTrigger ? existing.sentAtMs : undefined,
          requireInteraction: true
        };
      }
    }

    // Remove outdated non-test alerts for this device that are no longer pending
    for (const [k, a] of Object.entries(store.alerts)) {
      if (a.deviceId === cleanId && a.type !== 'test' && !incomingKeys.has(k)) {
        if (!a.sentAtMs || a.triggerAtMs < Date.now() - 24 * 60 * 60 * 1000) {
          delete store.alerts[k];
        }
      }
    }

    schedulePersist();
    const activeCount = Object.values(store.alerts).filter(
      a => a.deviceId === cleanId && !a.sentAtMs
    ).length;
    res.json({ ok: true, synced: activeCount, subscribed: true });
  });

  app.post('/api/push/schedule-test', (req, res) => {
    const { deviceId, staffId, staffName, subscription, delayMs, triggerAtMs } = req.body || {};
    if (typeof deviceId !== 'string' || !deviceId.trim()) {
      res.status(400).json({ ok: false, error: 'Missing deviceId' });
      return;
    }
    const cleanId = deviceId.trim().slice(0, 128);
    if (isValidSubscription(subscription)) {
      store.devices[cleanId] = {
        deviceId: cleanId,
        staffId: typeof staffId === 'string' ? staffId : store.devices[cleanId]?.staffId || 'unknown',
        staffName: typeof staffName === 'string' ? staffName : store.devices[cleanId]?.staffName || 'موظف',
        subscription,
        notificationChannel: store.devices[cleanId]?.notificationChannel || 'mobile_and_website',
        updatedAt: Date.now()
      };
    }

    const device = store.devices[cleanId];
    if (!device) {
      res.status(400).json({ ok: false, error: 'Device is not subscribed to Web Push yet' });
      return;
    }

    const safeDelay = Math.max(1000, Math.min(5 * 60 * 1000, Number(delayMs) || 60_000));
    const targetTrigger =
      typeof triggerAtMs === 'number' && triggerAtMs > Date.now()
        ? triggerAtMs
        : Date.now() + safeDelay;

    const alertId = `test_1m_${targetTrigger}`;
    const key = `${cleanId}::${alertId}`;

    // Remove previous unsent test alerts for this device
    for (const [k, a] of Object.entries(store.alerts)) {
      if (a.deviceId === cleanId && a.type === 'test' && !a.sentAtMs) {
        delete store.alerts[k];
      }
    }

    store.alerts[key] = {
      key,
      deviceId: cleanId,
      staffId: device.staffId,
      alertId,
      type: 'test',
      title: 'إشعار تجريبي — تنبيهات الموظف',
      body: 'تم وصول الإشعار التجريبي بنجاح حتى والموقع مغلق!',
      tag: `clinicflow_test_${targetTrigger}`,
      url: '/?view=staff_alerts',
      view: 'staff_alerts',
      triggerAtMs: targetTrigger,
      requireInteraction: true
    };
    schedulePersist();
    res.json({ ok: true, triggerAtMs: targetTrigger });
  });

  app.post('/api/push/send-now', async (req, res) => {
    const { deviceId, staffId, staffName, subscription } = req.body || {};
    if (typeof deviceId !== 'string' || !deviceId.trim()) {
      res.status(400).json({ ok: false, error: 'Missing deviceId' });
      return;
    }
    const cleanId = deviceId.trim().slice(0, 128);
    if (isValidSubscription(subscription)) {
      store.devices[cleanId] = {
        deviceId: cleanId,
        staffId: typeof staffId === 'string' ? staffId : store.devices[cleanId]?.staffId || 'unknown',
        staffName: typeof staffName === 'string' ? staffName : store.devices[cleanId]?.staffName || 'موظف',
        subscription,
        notificationChannel: store.devices[cleanId]?.notificationChannel || 'mobile_and_website',
        updatedAt: Date.now()
      };
      schedulePersist();
    }
    const device = store.devices[cleanId];
    if (!device) {
      res.status(400).json({ ok: false, error: 'Device not subscribed' });
      return;
    }

    const result = await deliverPushAlert(device, {
      key: `${cleanId}::instant_${Date.now()}`,
      deviceId: cleanId,
      staffId: device.staffId,
      alertId: `instant_${Date.now()}`,
      type: 'test',
      title: 'إشعار فوري — Dr Shlkamy',
      body: 'إشعارات الخلفية متصلة وتعمل بنجاح على هذا الجهاز.',
      tag: `clinicflow_instant_${Date.now()}`,
      url: '/?view=staff_alerts',
      view: 'staff_alerts',
      triggerAtMs: Date.now(),
      requireInteraction: true
    });

    if (result.gone) {
      delete store.devices[cleanId];
      schedulePersist();
      res.status(410).json({ ok: false, gone: true, error: 'Push subscription expired' });
      return;
    }
    if (!result.ok) {
      res.status(502).json({ ok: false, error: result.error || 'Failed to send push notification' });
      return;
    }
    res.json({ ok: true });
  });

  app.post('/api/push/notify-staff', async (req, res) => {
    const { targetStaffIds, alertId, title, body, url, view } = req.body || {};
    if (!Array.isArray(targetStaffIds) || targetStaffIds.length === 0 || typeof alertId !== 'string' || typeof title !== 'string') {
      res.status(400).json({ ok: false, error: 'Invalid payload' });
      return;
    }
    const targetSet = new Set(targetStaffIds.map(id => String(id)));
    const cleanAlertId = alertId.trim().slice(0, 128);
    let sentCount = 0;
    const now = Date.now();

    for (const device of Object.values(store.devices)) {
      if (!targetSet.has(device.staffId)) continue;
      if (device.notificationChannel !== 'mobile_and_website') continue;
      const key = `${device.deviceId}::${cleanAlertId}`;
      if (store.alerts[key]?.sentAtMs) continue;

      const alertEntry: ScheduledPushAlert = {
        key,
        deviceId: device.deviceId,
        staffId: device.staffId,
        alertId: cleanAlertId,
        type: 'shift_end',
        title: title.slice(0, 160),
        body: typeof body === 'string' ? body.slice(0, 320) : '',
        tag: `clinicflow_${cleanAlertId}`,
        url: typeof url === 'string' ? url : '/?view=attendance',
        view: typeof view === 'string' ? view : 'attendance',
        triggerAtMs: now,
        requireInteraction: true
      };

      const result = await deliverPushAlert(device, alertEntry);
      if (result.gone) {
        delete store.devices[device.deviceId];
      } else if (result.ok) {
        alertEntry.sentAtMs = now;
        store.alerts[key] = alertEntry;
        sentCount++;
      }
    }

    if (sentCount > 0) {
      schedulePersist();
    }
    res.json({ ok: true, sentCount });
  });

  // Always serve HTML entry, Service Worker, version metadata, and manifests with no-cache so published updates propagate immediately
  app.use((req, res, next) => {
    if (
      req.path === '/' ||
      req.path === '/index.html' ||
      req.path === '/sw.js' ||
      req.path === '/version.json' ||
      req.path === '/manifest.webmanifest' ||
      req.path === '/manifest.json'
    ) {
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
    }
    next();
  });

  const distPath = path.resolve(process.cwd(), 'dist');
  const isDevCommand =
    process.env.npm_lifecycle_event === 'dev' ||
    process.execArgv.some(arg => arg.includes('tsx')) ||
    process.argv.some(arg => arg.includes('tsx'));
  const isProduction =
    process.env.NODE_ENV === 'production' ||
    (!isDevCommand && fs.existsSync(distPath));

  if (!isProduction) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa'
    });
    app.use(vite.middlewares);
  } else {
    app.use(
      express.static(distPath, {
        index: false,
        setHeaders: (res, filePath) => {
          if (filePath.endsWith('index.html') || filePath.endsWith('sw.js') || filePath.endsWith('version.json')) {
            res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
            res.setHeader('Pragma', 'no-cache');
            res.setHeader('Expires', '0');
          }
        }
      })
    );
    app.use((req, res, next) => {
      if ((req.method !== 'GET' && req.method !== 'HEAD') || req.path.startsWith('/api/')) {
        return next();
      }
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`[ClinicFlow Server] Listening on http://0.0.0.0:${PORT} (mode: ${isProduction ? 'production' : 'development'})`);
  });
}

void startServer();
