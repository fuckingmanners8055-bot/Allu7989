import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import express from 'express';
import type { Request, Response } from 'express';

interface StoredShareRecord {
  id: string;
  itemKind: 'password' | 'pdf' | 'excel' | 'record' | 'link';
  hasPasscode: boolean;
  salt?: string;
  iv: string;
  ciphertext: string;
  revokeTokenHash: string;
  createdAt: number;
  expiresAt: number;
  maxViews: number | null;
  viewCount: number;
}

interface StoredShortUrlRecord {
  slug: string;
  destinationUrl: string;
  revokeTokenHash: string;
  createdAt: number;
  expiresAt: number | null;
  clicks: number;
}

const PORT = Number(process.env.PORT) || 3000;
const SHARE_DIR = path.resolve(process.cwd(), '.vault-shares');
const URL_DIR = path.resolve(process.cwd(), '.vault-urls');
const SHARE_ID_REGEX = /^[A-Za-z0-9_-]{12,32}$/;
const SHORT_SLUG_REGEX = /^[A-Za-z0-9][A-Za-z0-9_-]{1,39}$/;
const RESERVED_SLUGS = new Set(['api', 'assets', 'src', 'u', 'dist', 'favicon']);
const ALLOWED_KINDS = new Set(['password', 'pdf', 'excel', 'record', 'link']);
const MAX_CIPHERTEXT_CHARS = 40 * 1024 * 1024; // Supports encrypted PDFs up to ~25 MB

function resolveShareFilePath(shareId: string): string | null {
  if (!SHARE_ID_REGEX.test(shareId)) {
    return null;
  }
  const resolved = path.resolve(SHARE_DIR, `${shareId}.json`);
  if (!resolved.startsWith(SHARE_DIR + path.sep)) {
    return null;
  }
  return resolved;
}

function resolveShortUrlFilePath(slug: string): string | null {
  const normalized = slug.toLowerCase();
  if (!SHORT_SLUG_REGEX.test(normalized) || RESERVED_SLUGS.has(normalized)) {
    return null;
  }
  const resolved = path.resolve(URL_DIR, `${normalized}.json`);
  if (!resolved.startsWith(URL_DIR + path.sep)) {
    return null;
  }
  return resolved;
}

function parseSafeHttpUrl(rawUrl: unknown): string | null {
  if (typeof rawUrl !== 'string') return null;
  const trimmed = rawUrl.trim();
  if (!trimmed || trimmed.length > 4096) return null;
  const candidate = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  try {
    const parsed = new URL(candidate);
    if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
      return parsed.toString();
    }
    return null;
  } catch {
    return null;
  }
}

function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token, 'utf8').digest('hex');
}

function safeEqualHex(aHex: string, bHex: string): boolean {
  const aBuf = Buffer.from(aHex, 'utf8');
  const bBuf = Buffer.from(bHex, 'utf8');
  if (aBuf.length !== bBuf.length) {
    return false;
  }
  return crypto.timingSafeEqual(aBuf, bBuf);
}

async function ensureShareDir(): Promise<void> {
  await fs.mkdir(SHARE_DIR, { recursive: true });
  await fs.mkdir(URL_DIR, { recursive: true });
}

async function cleanupExpiredShares(): Promise<void> {
  try {
    await ensureShareDir();
    const now = Date.now();

    const shareEntries = await fs.readdir(SHARE_DIR);
    await Promise.all(
      shareEntries
        .filter((name) => name.endsWith('.json'))
        .map(async (name) => {
          const fullPath = path.resolve(SHARE_DIR, name);
          if (!fullPath.startsWith(SHARE_DIR + path.sep)) return;
          try {
            const raw = await fs.readFile(fullPath, 'utf8');
            const parsed = JSON.parse(raw) as Partial<StoredShareRecord>;
            if (
              typeof parsed.expiresAt !== 'number' ||
              now > parsed.expiresAt ||
              (typeof parsed.maxViews === 'number' &&
                typeof parsed.viewCount === 'number' &&
                parsed.viewCount >= parsed.maxViews)
            ) {
              await fs.unlink(fullPath).catch(() => undefined);
            }
          } catch {
            await fs.unlink(fullPath).catch(() => undefined);
          }
        })
    );

    const urlEntries = await fs.readdir(URL_DIR);
    await Promise.all(
      urlEntries
        .filter((name) => name.endsWith('.json'))
        .map(async (name) => {
          const fullPath = path.resolve(URL_DIR, name);
          if (!fullPath.startsWith(URL_DIR + path.sep)) return;
          try {
            const raw = await fs.readFile(fullPath, 'utf8');
            const parsed = JSON.parse(raw) as Partial<StoredShortUrlRecord>;
            if (typeof parsed.expiresAt === 'number' && now > parsed.expiresAt) {
              await fs.unlink(fullPath).catch(() => undefined);
            }
          } catch {
            await fs.unlink(fullPath).catch(() => undefined);
          }
        })
    );
  } catch {
    // ignore background cleanup errors
  }
}

async function startServer(): Promise<void> {
  await ensureShareDir();
  await cleanupExpiredShares();

  const cleanupTimer = setInterval(() => {
    void cleanupExpiredShares();
  }, 15 * 60 * 1000);
  cleanupTimer.unref();

  const app = express();
  app.set('trust proxy', 1);
  app.disable('x-powered-by');
  app.use(express.json({ limit: '42mb' }));

  app.get('/api/health', (_req: Request, res: Response) => {
    res.json({ ok: true });
  });

  app.post('/api/shares', async (req: Request, res: Response) => {
    try {
      const body = req.body as Record<string, unknown> | undefined;
      if (!body || typeof body !== 'object') {
        res.status(400).json({ error: 'Invalid request payload.' });
        return;
      }

      const itemKind = body.itemKind;
      const hasPasscode = body.hasPasscode;
      const iv = body.iv;
      const ciphertext = body.ciphertext;
      const salt = body.salt;
      const expiresInHoursRaw = body.expiresInHours;
      const maxViewsRaw = body.maxViews;

      if (typeof itemKind !== 'string' || !ALLOWED_KINDS.has(itemKind)) {
        res.status(400).json({ error: 'Unsupported shared item type.' });
        return;
      }
      if (typeof hasPasscode !== 'boolean') {
        res.status(400).json({ error: 'Invalid passcode flag.' });
        return;
      }
      if (typeof iv !== 'string' || iv.length < 8 || iv.length > 64) {
        res.status(400).json({ error: 'Invalid encryption IV.' });
        return;
      }
      if (
        typeof ciphertext !== 'string' ||
        ciphertext.length < 8 ||
        ciphertext.length > MAX_CIPHERTEXT_CHARS
      ) {
        res.status(400).json({ error: 'Encrypted payload size is out of bounds.' });
        return;
      }
      if (hasPasscode) {
        if (typeof salt !== 'string' || salt.length < 8 || salt.length > 64) {
          res.status(400).json({ error: 'Passcode salt is required.' });
          return;
        }
      } else if (salt !== undefined && salt !== null) {
        if (typeof salt !== 'string' || salt.length > 64) {
          res.status(400).json({ error: 'Invalid salt parameter.' });
          return;
        }
      }

      const expiresInHours =
        typeof expiresInHoursRaw === 'number' && Number.isFinite(expiresInHoursRaw)
          ? Math.min(720, Math.max(1, Math.round(expiresInHoursRaw)))
          : 24;

      let maxViews: number | null = null;
      if (maxViewsRaw !== null && maxViewsRaw !== undefined) {
        if (
          typeof maxViewsRaw !== 'number' ||
          !Number.isInteger(maxViewsRaw) ||
          maxViewsRaw < 1 ||
          maxViewsRaw > 100
        ) {
          res.status(400).json({ error: 'maxViews must be null or an integer between 1 and 100.' });
          return;
        }
        maxViews = maxViewsRaw;
      }

      const id = crypto.randomBytes(12).toString('base64url');
      const revokeToken = crypto.randomBytes(24).toString('base64url');
      const filePath = resolveShareFilePath(id);
      if (!filePath) {
        res.status(500).json({ error: 'Failed to allocate share ID.' });
        return;
      }

      const now = Date.now();
      const expiresAt = now + expiresInHours * 60 * 60 * 1000;

      const record: StoredShareRecord = {
        id,
        itemKind: itemKind as StoredShareRecord['itemKind'],
        hasPasscode,
        salt: typeof salt === 'string' ? salt : undefined,
        iv,
        ciphertext,
        revokeTokenHash: hashToken(revokeToken),
        createdAt: now,
        expiresAt,
        maxViews,
        viewCount: 0,
      };

      await ensureShareDir();
      await fs.writeFile(filePath, JSON.stringify(record), 'utf8');

      res.status(201).json({
        id,
        revokeToken,
        createdAt: now,
        expiresAt,
        maxViews,
      });
    } catch (err) {
      console.error('Error creating share link:', err);
      res.status(500).json({ error: 'Unable to create share link.' });
    }
  });

  app.get('/api/shares/:id', async (req: Request, res: Response) => {
    try {
      const shareId = req.params.id;
      const filePath = resolveShareFilePath(shareId);
      if (!filePath) {
        res.status(400).json({ error: 'Invalid share link identifier.' });
        return;
      }

      let raw: string;
      try {
        raw = await fs.readFile(filePath, 'utf8');
      } catch {
        res.status(404).json({ error: 'Share link was not found or has already expired.' });
        return;
      }

      const record = JSON.parse(raw) as StoredShareRecord;
      const now = Date.now();

      if (now > record.expiresAt) {
        await fs.unlink(filePath).catch(() => undefined);
        res.status(404).json({ error: 'This share link has expired.' });
        return;
      }

      if (record.maxViews !== null && record.viewCount >= record.maxViews) {
        await fs.unlink(filePath).catch(() => undefined);
        res.status(404).json({ error: 'This share link has reached its maximum view limit.' });
        return;
      }

      const nextViewCount = record.viewCount + 1;
      const viewsRemaining =
        record.maxViews === null ? null : Math.max(0, record.maxViews - nextViewCount);

      if (record.maxViews !== null && nextViewCount >= record.maxViews) {
        await fs.unlink(filePath).catch(() => undefined);
      } else {
        const updated: StoredShareRecord = {
          ...record,
          viewCount: nextViewCount,
        };
        await fs.writeFile(filePath, JSON.stringify(updated), 'utf8');
      }

      res.json({
        id: record.id,
        itemKind: record.itemKind,
        hasPasscode: record.hasPasscode,
        salt: record.salt,
        iv: record.iv,
        ciphertext: record.ciphertext,
        createdAt: record.createdAt,
        expiresAt: record.expiresAt,
        maxViews: record.maxViews,
        viewsRemaining,
      });
    } catch (err) {
      console.error('Error reading share link:', err);
      res.status(500).json({ error: 'Failed to load shared item.' });
    }
  });

  app.delete('/api/shares/:id', async (req: Request, res: Response) => {
    try {
      const shareId = req.params.id;
      const filePath = resolveShareFilePath(shareId);
      if (!filePath) {
        res.status(400).json({ error: 'Invalid share link identifier.' });
        return;
      }

      const authHeader = req.headers.authorization || '';
      const token = authHeader.startsWith('Bearer ')
        ? authHeader.slice('Bearer '.length).trim()
        : '';

      if (!token) {
        res.status(401).json({ error: 'Revocation token is required.' });
        return;
      }

      let raw: string;
      try {
        raw = await fs.readFile(filePath, 'utf8');
      } catch {
        res.status(404).json({ error: 'Share link not found.' });
        return;
      }

      const record = JSON.parse(raw) as StoredShareRecord;
      const providedHash = hashToken(token);
      if (!safeEqualHex(providedHash, record.revokeTokenHash)) {
        res.status(403).json({ error: 'Invalid revocation token.' });
        return;
      }

      await fs.unlink(filePath).catch(() => undefined);
      res.json({ revoked: true });
    } catch (err) {
      console.error('Error revoking share link:', err);
      res.status(500).json({ error: 'Failed to revoke share link.' });
    }
  });

  app.post('/api/urls', async (req: Request, res: Response) => {
    try {
      const body = req.body as Record<string, unknown> | undefined;
      if (!body || typeof body !== 'object') {
        res.status(400).json({ error: 'Invalid request payload.' });
        return;
      }

      const destinationUrl = parseSafeHttpUrl(body.destinationUrl);
      if (!destinationUrl) {
        res.status(400).json({ error: 'Enter a valid http:// or https:// destination URL.' });
        return;
      }

      const customSlugRaw = typeof body.slug === 'string' ? body.slug.trim().toLowerCase() : '';
      let slug: string;
      if (customSlugRaw) {
        if (!SHORT_SLUG_REGEX.test(customSlugRaw) || RESERVED_SLUGS.has(customSlugRaw)) {
          res.status(400).json({
            error: 'Alias must be 2–40 characters using letters, numbers, hyphens, or underscores.',
          });
          return;
        }
        slug = customSlugRaw;
      } else {
        slug = `u${crypto.randomBytes(4).toString('hex')}`;
      }

      const filePath = resolveShortUrlFilePath(slug);
      if (!filePath) {
        res.status(400).json({ error: 'Invalid URL alias.' });
        return;
      }

      const now = Date.now();
      let expiresAt: number | null = null;
      if (body.expiresInHours !== null && body.expiresInHours !== undefined) {
        const hrs = Number(body.expiresInHours);
        if (!Number.isFinite(hrs) || hrs < 1 || hrs > 8760) {
          res.status(400).json({ error: 'Expiration must be between 1 and 8760 hours.' });
          return;
        }
        expiresAt = now + Math.round(hrs) * 60 * 60 * 1000;
      }

      await ensureShareDir();

      // Check collision if existing and not expired
      try {
        const existingRaw = await fs.readFile(filePath, 'utf8');
        const existing = JSON.parse(existingRaw) as Partial<StoredShortUrlRecord>;
        if (!existing.expiresAt || now <= existing.expiresAt) {
          res.status(409).json({
            error: `The alias "${slug}" is already in use. Choose another alias.`,
          });
          return;
        }
      } catch {
        // file does not exist -> available
      }

      const revokeToken = crypto.randomBytes(24).toString('base64url');
      const record: StoredShortUrlRecord = {
        slug,
        destinationUrl,
        revokeTokenHash: hashToken(revokeToken),
        createdAt: now,
        expiresAt,
        clicks: 0,
      };

      await fs.writeFile(filePath, JSON.stringify(record), 'utf8');
      res.status(201).json({
        slug,
        destinationUrl,
        revokeToken,
        createdAt: now,
        expiresAt,
      });
    } catch (err) {
      console.error('Error creating short URL:', err);
      res.status(500).json({ error: 'Unable to create URL.' });
    }
  });

  app.delete('/api/urls/:slug', async (req: Request, res: Response) => {
    try {
      const slug = req.params.slug;
      const filePath = resolveShortUrlFilePath(slug);
      if (!filePath) {
        res.status(400).json({ error: 'Invalid URL alias.' });
        return;
      }

      const authHeader = req.headers.authorization || '';
      const token = authHeader.startsWith('Bearer ')
        ? authHeader.slice('Bearer '.length).trim()
        : '';

      if (!token) {
        res.status(401).json({ error: 'Revocation token is required.' });
        return;
      }

      let raw: string;
      try {
        raw = await fs.readFile(filePath, 'utf8');
      } catch {
        res.status(404).json({ error: 'Short URL not found.' });
        return;
      }

      const record = JSON.parse(raw) as StoredShortUrlRecord;
      if (!safeEqualHex(hashToken(token), record.revokeTokenHash)) {
        res.status(403).json({ error: 'Invalid revocation token.' });
        return;
      }

      await fs.unlink(filePath).catch(() => undefined);
      res.json({ revoked: true });
    } catch (err) {
      console.error('Error revoking short URL:', err);
      res.status(500).json({ error: 'Failed to revoke short URL.' });
    }
  });

  app.get('/u/:slug', async (req: Request, res: Response) => {
    try {
      const filePath = resolveShortUrlFilePath(req.params.slug);
      if (!filePath) {
        res.status(404).type('text/plain').send('Short URL not found.');
        return;
      }

      let raw: string;
      try {
        raw = await fs.readFile(filePath, 'utf8');
      } catch {
        res.status(404).type('text/plain').send('Short URL not found or expired.');
        return;
      }

      const record = JSON.parse(raw) as StoredShortUrlRecord;
      if (record.expiresAt !== null && Date.now() > record.expiresAt) {
        await fs.unlink(filePath).catch(() => undefined);
        res.status(404).type('text/plain').send('This short URL has expired.');
        return;
      }

      const safeTarget = parseSafeHttpUrl(record.destinationUrl);
      if (!safeTarget) {
        res.status(400).type('text/plain').send('Invalid destination URL.');
        return;
      }

      const updated: StoredShortUrlRecord = {
        ...record,
        clicks: (record.clicks || 0) + 1,
      };
      await fs.writeFile(filePath, JSON.stringify(updated), 'utf8').catch(() => undefined);
      res.redirect(302, safeTarget);
    } catch {
      res.status(500).type('text/plain').send('Failed to resolve short URL.');
    }
  });

  // Never let unknown /api/* requests fall through to SPA HTML
  app.use('/api', (_req: Request, res: Response) => {
    res.status(404).json({ error: 'API endpoint not found.' });
  });

  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req: Request, res: Response) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server listening on http://0.0.0.0:${PORT}`);
  });
}

void startServer();
