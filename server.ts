import express, { Request, Response } from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { execFile } from 'child_process';
import util from 'util';
import { GoogleGenAI } from '@google/genai';

const execFileAsync = util.promisify(execFile);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = Number(process.env.PORT) || 3000;
const DATA_FILE = path.join(__dirname, 'workspace-data.json');

// Initialize GoogleGenAI client for server-side AI Assistant
const geminiClient = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
  httpOptions: {
    headers: {
      'User-Agent': 'aistudio-build',
    },
  },
});

// Support large payloads for full ERP database state
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// In-memory workspace cache with disk fallback
interface DeviceInfo {
  deviceId: string;
  deviceType: 'Laptop' | 'Mobile' | 'Tablet';
  deviceName: string;
  lastSeen: number;
}

interface WorkspaceState {
  version: number;
  revision: number;
  updatedAt: string;
  updatedByDevice: string;
  settings?: any;
  products?: any[];
  customers?: any[];
  invoices?: any[];
  purchaseOrders?: any[];
  expenses?: any[];
  suppliers?: any[];
  stockMovements?: any[];
}

let activeWorkspace: WorkspaceState = {
  version: 2,
  revision: 1,
  updatedAt: new Date().toISOString(),
  updatedByDevice: 'Server-Init',
};

// Load initial state from disk if available
try {
  if (fs.existsSync(DATA_FILE)) {
    const raw = fs.readFileSync(DATA_FILE, 'utf-8');
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object') {
      activeWorkspace = parsed;
    }
  }
} catch (e) {
  console.warn('Could not read existing workspace-data.json:', e);
}

// Track connected devices
const connectedDevices = new Map<string, DeviceInfo>();

// Active Server-Sent Events (SSE) clients
const sseClients = new Set<Response>();

// Broadcast state update to all active SSE subscribers (e.g. mobile phones, laptop tabs)
function broadcastToClients(data: any, eventType: string = 'sync_update') {
  const payload = `event: ${eventType}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const client of sseClients) {
    try {
      client.write(payload);
    } catch {
      sseClients.delete(client);
    }
  }
}

// Clean up stale devices every 10 seconds
setInterval(() => {
  const now = Date.now();
  for (const [id, dev] of connectedDevices.entries()) {
    if (now - dev.lastSeen > 25000) {
      connectedDevices.delete(id);
    }
  }
}, 10000);

// Keep-alive ping for SSE connections every 15 seconds
setInterval(() => {
  for (const client of sseClients) {
    try {
      client.write(': ping\n\n');
    } catch {
      sseClients.delete(client);
    }
  }
}, 15000);

// API Routes

// 1. Get current workspace state & online devices
app.get('/api/sync/state', (_req: Request, res: Response) => {
  res.json({
    workspace: activeWorkspace,
    devices: Array.from(connectedDevices.values()),
    serverTime: new Date().toISOString(),
  });
});

// 2. Ultra-Fast Push: Called immediately by Laptop or Mobile on changes
app.post('/api/sync/push', (req: Request, res: Response) => {
  const body = req.body;
  if (!body) {
    return res.status(400).json({ error: 'Missing body' });
  }

  const incomingRevision = (activeWorkspace.revision || 0) + 1;
  const updatedAt = new Date().toISOString();
  const updatedByDevice = body.updatedByDevice || 'Unknown-Device';

  activeWorkspace = {
    ...activeWorkspace,
    ...body,
    revision: incomingRevision,
    updatedAt,
    updatedByDevice,
  };

  // If explicitly deleted invoice IDs were provided, purge them
  if (Array.isArray(body.deletedInvoiceIds) && body.deletedInvoiceIds.length > 0) {
    const delSet = new Set(body.deletedInvoiceIds);
    if (activeWorkspace.invoices) {
      activeWorkspace.invoices = activeWorkspace.invoices.filter((i: any) => !delSet.has(i.id));
    }
  }

  // Async save to disk for durability
  try {
    fs.writeFile(DATA_FILE, JSON.stringify(activeWorkspace), () => {});
  } catch (err) {
    console.warn('Could not persist to workspace-data.json:', err);
  }

  // Instantly broadcast to all connected devices (sub-second mobile sync)
  broadcastToClients({
    workspace: activeWorkspace,
    revision: incomingRevision,
    updatedAt,
    updatedByDevice,
  }, 'sync_update');

  return res.json({
    success: true,
    revision: incomingRevision,
    updatedAt,
  });
});

// 2b. Direct Invoice Deletion Endpoint
app.delete('/api/invoices/:id', (req: Request, res: Response) => {
  const { id } = req.params;
  const incomingRevision = (activeWorkspace.revision || 0) + 1;
  const updatedAt = new Date().toISOString();

  if (activeWorkspace.invoices) {
    activeWorkspace.invoices = activeWorkspace.invoices.filter((i: any) => i.id !== id);
  }

  activeWorkspace.revision = incomingRevision;
  activeWorkspace.updatedAt = updatedAt;

  try {
    fs.writeFile(DATA_FILE, JSON.stringify(activeWorkspace), () => {});
  } catch (err) {
    console.warn('Could not persist deletion to workspace-data.json:', err);
  }

  broadcastToClients({
    workspace: activeWorkspace,
    revision: incomingRevision,
    updatedAt,
    updatedByDevice: 'server-delete',
  }, 'sync_update');

  return res.json({
    success: true,
    deletedId: id,
    revision: incomingRevision,
  });
});

// 3. Server-Sent Events (SSE) Stream: Live 1-second continuous sync connection
app.get('/api/sync/stream', (req: Request, res: Response) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders?.();

  // Send initial state immediately upon connecting
  res.write(`event: initial_state\ndata: ${JSON.stringify(activeWorkspace)}\n\n`);

  sseClients.add(res);

  req.on('close', () => {
    sseClients.delete(res);
  });
});

// 4. Polling endpoint for fast 1-second heartbeat / fallback
app.get('/api/sync/poll', (req: Request, res: Response) => {
  const sinceRevision = parseInt(req.query.sinceRevision as string, 10) || 0;
  const currentRevision = activeWorkspace.revision || 0;

  res.json({
    hasUpdate: currentRevision > sinceRevision,
    revision: currentRevision,
    workspace: currentRevision > sinceRevision ? activeWorkspace : null,
    devices: Array.from(connectedDevices.values()),
    serverTime: new Date().toISOString(),
  });
});

// 5. Device Heartbeat & Presence
app.post('/api/sync/heartbeat', (req: Request, res: Response) => {
  const { deviceId, deviceType, deviceName } = req.body;
  if (deviceId) {
    connectedDevices.set(deviceId, {
      deviceId,
      deviceType: deviceType || 'Laptop',
      deviceName: deviceName || deviceId,
      lastSeen: Date.now(),
    });
  }

  res.json({
    success: true,
    devices: Array.from(connectedDevices.values()),
    currentRevision: activeWorkspace.revision || 0,
  });
});

// 6. Test Ping between paired devices
app.post('/api/sync/ping', (req: Request, res: Response) => {
  const { fromDevice, toDevice, message } = req.body;
  broadcastToClients({
    fromDevice,
    toDevice,
    message: message || 'Live Sync Ping',
    timestamp: new Date().toISOString(),
  }, 'ping_notification');

  res.json({ success: true, timestamp: new Date().toISOString() });
});

// =========================================================================
// WHATSAPP CLOUD API & CRM BOT WEBHOOK ENDPOINTS
// =========================================================================

// 1. WhatsApp Webhook Verification Handshake (Meta Cloud API / Business Platform)
app.get('/api/whatsapp/webhook', (req: Request, res: Response) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  const VERIFY_TOKEN = process.env.WHATSAPP_VERIFY_TOKEN || 'solarcraft_bot_token';

  if (mode === 'subscribe' && token === VERIFY_TOKEN) {
    console.log('✅ WhatsApp Webhook verified successfully by Meta!');
    return res.status(200).send(challenge);
  }

  return res.status(403).json({ error: 'Verification token mismatch' });
});

// 2. WhatsApp Inbound Message Listener & Auto-Responder
app.post('/api/whatsapp/webhook', async (req: Request, res: Response) => {
  // Always acknowledge immediately with 200 OK so Meta / Twilio does not retry
  res.status(200).json({ status: 'EVENT_RECEIVED' });

  try {
    const body = req.body;
    // Inspect if Meta WhatsApp Cloud API format
    const entry = body?.entry?.[0];
    const changes = entry?.changes?.[0];
    const value = changes?.value;
    const message = value?.messages?.[0];

    if (!message) {
      // Could be custom gateway or test ping
      return;
    }

    const fromNumber = message.from; // e.g. "923001234567"
    const messageText = message.text?.body || '';
    const shopSettings = activeWorkspace.settings || {};
    const currency = shopSettings.currency || 'PKR';
    const shopName = shopSettings.shopName || 'SolarCraft Systems';

    console.log(`📩 Incoming WhatsApp from ${fromNumber}: "${messageText}"`);

    // Match customer by phone number from live workspace database
    const customers = activeWorkspace.customers || [];
    const invoices = activeWorkspace.invoices || [];

    const matchedCustomer = customers.find((c: any) => {
      const cleanPhone = (c.phone || c.whatsapp || '').replace(/\D/g, '');
      const cleanFrom = fromNumber.replace(/\D/g, '');
      return cleanPhone && (cleanPhone.includes(cleanFrom) || cleanFrom.includes(cleanPhone));
    });

    let autoReply = '';

    const lower = messageText.toLowerCase();

    if (lower.includes('balance') || lower.includes('baqaya') || lower.includes('bill') || lower.includes('dues') || lower.includes('statement')) {
      if (matchedCustomer) {
        const balance = Number(matchedCustomer.balanceDue) || 0;
        const totalBilled = Number(matchedCustomer.totalInvoiced) || 0;
        const totalPaid = Number(matchedCustomer.totalPaid) || 0;
        const unpaidInvoices = invoices
          .filter((i: any) => i.customerId === matchedCustomer.id && i.type !== 'QUOTATION' && (i.balanceDue || 0) > 0)
          .sort((a: any, b: any) => new Date(a.date).getTime() - new Date(b.date).getTime());

        autoReply = `⚡ *${shopName}* - Account Statement\n\n` +
          `Respected *${matchedCustomer.name}*,\n\n` +
          `• Total Billed: ${currency} ${totalBilled.toLocaleString()}\n` +
          `• Total Paid: ${currency} ${totalPaid.toLocaleString()}\n` +
          `• 🔴 *Current Balance Due:* *${currency} ${balance.toLocaleString()}*\n\n`;

        if (unpaidInvoices.length > 0) {
          autoReply += `📑 *Pending Invoices (FIFO Oldest First):*\n`;
          unpaidInvoices.forEach((inv: any, idx: number) => {
            autoReply += `  ${idx + 1}. #${inv.invoiceNumber}: ${currency} ${(inv.balanceDue || 0).toLocaleString()}\n`;
          });
          autoReply += '\n';
        }

        if (shopSettings.bankAccountNumber) {
          autoReply += `🏦 *Payment Bank:*\n• ${shopSettings.bankName}\n• A/C: ${shopSettings.bankAccountNumber}\n• Title: ${shopSettings.bankAccountTitle || shopName}\n\n`;
        }
        autoReply += `📞 ${shopSettings.phone || ''}`;
      } else {
        autoReply = `⚡ *${shopName}* Support\n\nAssalam-o-Alaikum! We could not locate your phone number in our solar customer records. Please provide your Invoice # or Name so we can check your account ledger.`;
      }
    } else if (lower.includes('quote') || lower.includes('solar') || lower.includes('cost') || lower.includes('rate') || lower.includes('price')) {
      autoReply = `☀️ *${shopName}* - Turnkey Solar PV Solutions\n\n` +
        `We provide Tier-1 Solar PV Installations:\n` +
        `• *5kW Hybrid / On-Grid:* 8-9x 585W TOPCon Panels (~650 Units/month)\n` +
        `• *10kW 3-Phase Net-Metering:* 17x 585W TOPCon Panels (~1,300 Units/month)\n` +
        `• *15kW Commercial:* 26x 585W TOPCon Panels (~1,950 Units/month)\n\n` +
        `⭐ Includes 25-Year Panel Warranty, 5-Year Inverter Warranty & Green Meter Processing!\n` +
        `📞 Call our solar consultant: ${shopSettings.phone || ''}`;
    }

    // Log the auto-reply for monitoring
    if (autoReply) {
      console.log(`🤖 Auto-Reply drafted for ${fromNumber}:\n`, autoReply);
      // If META_ACCESS_TOKEN and PHONE_NUMBER_ID are provided in environment, send directly via Meta Graph API:
      if (process.env.WHATSAPP_ACCESS_TOKEN && process.env.WHATSAPP_PHONE_NUMBER_ID) {
        try {
          const metaUrl = `https://graph.facebook.com/v19.0/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`;
          await fetch(metaUrl, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${process.env.WHATSAPP_ACCESS_TOKEN}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              messaging_product: 'whatsapp',
              to: fromNumber,
              type: 'text',
              text: { body: autoReply },
            }),
          });
          console.log(`🚀 Meta Cloud API auto-reply successfully dispatched to ${fromNumber}`);
        } catch (dispatchErr) {
          console.error('Failed to dispatch via Meta API:', dispatchErr);
        }
      }
    }
  } catch (err) {
    console.error('Error handling WhatsApp webhook:', err);
  }
});

// 3. Status endpoint for the in-app WhatsApp Bot deployment widget
app.get('/api/whatsapp/status', (req: Request, res: Response) => {
  const host = req.get('host') || 'localhost:3000';
  const protocol = req.protocol === 'https' || req.get('x-forwarded-proto') === 'https' ? 'https' : 'http';
  const webhookUrl = `${protocol}://${host}/api/whatsapp/webhook`;

  res.json({
    status: 'ACTIVE',
    webhookUrl,
    verifyToken: process.env.WHATSAPP_VERIFY_TOKEN || 'solarcraft_bot_token',
    hasMetaAccessToken: Boolean(process.env.WHATSAPP_ACCESS_TOKEN),
    hasPhoneNumberId: Boolean(process.env.WHATSAPP_PHONE_NUMBER_ID),
    connectedCustomers: activeWorkspace.customers?.length || 0,
    serverTime: new Date().toISOString(),
  });
});

// Helper for local rule-based solar assistance if key is absent or offline
function generateLocalSolarAssistantResponse(prompt: string, ctx: any): string {
  const q = prompt.toLowerCase();
  const currency = ctx.currency || 'PKR';
  const customers = ctx.customers || [];
  const products = ctx.products || [];

  // 1. Customer queries (e.g. Sajjad, balance, due, debtor)
  const matchedCustomer = customers.find((c: any) => 
    (c.name && q.includes(c.name.toLowerCase())) ||
    (c.name && c.name.toLowerCase().split(' ').some((word: string) => word.length > 3 && q.includes(word))) ||
    (c.phone && q.includes(c.phone.replace(/\D/g, '')))
  );

  if (matchedCustomer) {
    const due = Number(matchedCustomer.balanceDue) || 0;
    const billed = Number(matchedCustomer.totalInvoiced) || 0;
    const paid = Number(matchedCustomer.totalPaid) || 0;
    const isCleared = due <= 0;

    return `### 👤 Client Account: **${matchedCustomer.name}**\n\n` +
      `• **Total Billed:** ${currency} ${billed.toLocaleString()}\n` +
      `• **Total Received (Paid):** ${currency} ${paid.toLocaleString()}\n` +
      `• **Current Pending Balance:** ${isCleared ? '✅ **0.00 (Cleared in Full)**' : `🔴 **${currency} ${due.toLocaleString()}**`}\n` +
      (matchedCustomer.phone ? `• **Contact Phone:** \`${matchedCustomer.phone}\`\n` : '') +
      (matchedCustomer.installedCapacityKw ? `• **Installed Solar System:** ${matchedCustomer.installedCapacityKw} kW\n` : '') +
      `\n💡 *Tip:* You can click **"$ Receive Pay"** in the Customer List or Customer 360° modal to clear dues using our FIFO oldest-first deduction plan.`;
  }

  // 2. Pending dues / overall balance summary
  if (q.includes('balance') || q.includes('baqaya') || q.includes('due') || q.includes('debt') || q.includes('receivable') || q.includes('recovery')) {
    const debtors = customers.filter((c: any) => (Number(c.balanceDue) || 0) > 0);
    let out = `### 📊 Store Receivables & Pending Dues Summary\n\n` +
      `• **Total Outstanding Balance:** 🔴 **${currency} ${(ctx.totalDues || 0).toLocaleString()}**\n` +
      `• **Total Amount Billed to Date:** ${currency} ${(ctx.totalBilled || 0).toLocaleString()}\n` +
      `• **Total Collections Received:** ${currency} ${(ctx.totalCollected || 0).toLocaleString()}\n\n`;

    if (debtors.length > 0) {
      out += `**Clients with Pending Balances:**\n`;
      debtors.slice(0, 5).forEach((d: any, idx: number) => {
        out += `${idx + 1}. **${d.name}:** ${currency} ${(Number(d.balanceDue) || 0).toLocaleString()} (Phone: ${d.phone || 'N/A'})\n`;
      });
      if (debtors.length > 5) {
        out += `*...and ${debtors.length - 5} more clients.*\n`;
      }
    } else {
      out += `✅ All client ledgers are 100% reconciled and cleared!\n`;
    }
    return out;
  }

  // 3. Stock / Inventory / Product Queries (e.g. "arm panel quantity", "arm power", "stock", "inverter")
  const STOP_WORDS_SET = new Set([
    'what', 'is', 'the', 'of', 'in', 'how', 'many', 'much', 'quantity', 'qty',
    'stock', 'stocks', 'available', 'balance', 'price', 'prices', 'rate', 'rates',
    'cost', 'costs', 'give', 'me', 'show', 'tell', 'detail', 'details', 'check',
    'ka', 'ki', 'ke', 'ko', 'se', 'par', 'pe', 'kitna', 'kitne', 'kitni', 'hai',
    'hain', 'batao', 'karo', 'dekh', 'dekho', 'kya', 'do', 'we', 'have', 'our'
  ]);
  const cleanTokens = q.replace(/[^a-z0-9\s\.\-]/g, ' ').split(/\s+/).filter(Boolean);
  const searchTerms = cleanTokens.filter((token: string) => !STOP_WORDS_SET.has(token) && token.length > 1);

  const isProductSearch = searchTerms.length > 0 || 
    q.includes('stock') || q.includes('inventory') || q.includes('quantity') || 
    q.includes('panel') || q.includes('inverter') || q.includes('battery');

  if (isProductSearch && products.length > 0) {
    const scored = products
      .map((p: any) => {
        const fullText = `${p.name || ''} ${p.brand || ''} ${p.model || ''} ${p.specs || ''} ${p.code || ''} ${p.category || ''}`.toLowerCase();
        let matchScore = 0;
        if (p.code && q.includes(p.code.toLowerCase())) matchScore += 100;

        for (const term of searchTerms) {
          if (fullText.includes(term)) {
            matchScore += 20;
            if ((p.name || '').toLowerCase().includes(term)) matchScore += 30;
            if ((p.brand || '').toLowerCase().includes(term)) matchScore += 30;
          }
        }

        if ((q.includes('panel') || q.includes('panels')) && p.category === 'SOLAR_PANELS') matchScore += 10;
        if ((q.includes('inverter') || q.includes('inverters')) && p.category === 'INVERTERS') matchScore += 10;
        if ((q.includes('battery') || q.includes('batteries')) && p.category === 'BATTERIES') matchScore += 10;

        return { product: p, score: matchScore };
      })
      .filter((item: any) => item.score > 0)
      .sort((a: any, b: any) => b.score - a.score);

    if (scored.length > 0) {
      const topMatches = scored.slice(0, 10).map((s: any) => s.product);
      const totalQty = topMatches.reduce((sum: number, p: any) => sum + (p.stockQty || 0), 0);
      const isPanel = topMatches.some((p: any) => p.category === 'SOLAR_PANELS' || (p.name || '').toLowerCase().includes('panel'));
      const unitLabel = topMatches[0]?.unit || (isPanel ? 'Panels' : 'Pcs');

      let out = `### 📦 **Inventory Stock Results** (${topMatches.length} matching item${topMatches.length > 1 ? 's' : ''})\n\n`;

      if (topMatches.length > 1) {
        out += `• **Total Stock Available:** **${totalQty.toLocaleString()} ${unitLabel}**\n\n` +
          `**Detailed Item Breakdown:**\n\n`;

        topMatches.forEach((p: any, idx: number) => {
          const isLow = p.stockQty <= (p.minStockAlert || 5);
          out += `${idx + 1}. **${p.name}**\n` +
            `   • SKU Code: \`${p.code}\`\n` +
            `   • In Stock: **${p.stockQty} ${p.unit || 'Pcs'}** ${isLow ? '⚠️ *(Low Stock)*' : '✅ *(Available)*'}\n` +
            `   • Selling Price: **${currency} ${Number(p.sellingPrice || 0).toLocaleString()}**` +
            (p.brand ? ` | Brand: *${p.brand}*` : '') +
            `\n\n`;
        });
      } else {
        const p = topMatches[0];
        const isLow = p.stockQty <= (p.minStockAlert || 5);
        out += `• **Product:** **${p.name}**\n` +
          `• **SKU Code:** \`${p.code}\`\n` +
          `• **Available Stock:** **${p.stockQty} ${p.unit || 'Pcs'}** ${isLow ? '⚠️ *(Low Stock Alert)*' : '✅ *(In Stock)*'}\n` +
          `• **Selling Price:** **${currency} ${Number(p.sellingPrice || 0).toLocaleString()}**\n` +
          (p.costPrice ? `• **Cost Price:** ${currency} ${Number(p.costPrice || 0).toLocaleString()}\n` : '') +
          (p.brand ? `• **Brand:** ${p.brand}\n` : '') +
          (p.specs ? `• **Specifications:** ${p.specs}\n` : '');
      }

      return out;
    }
  }

  // 4. Solar system sizing / calculation
  if (q.includes('kw') || q.includes('unit') || q.includes('sizing') || q.includes('bill') || q.includes('system') || q.includes('calc')) {
    const numbers = prompt.match(/\d+(\.\d+)?/g);
    const val = numbers ? parseFloat(numbers[0]) : 800;
    const isUnits = val > 40; // if > 40, likely units (kWh); else likely kW
    const targetUnits = isUnits ? val : val * 125;
    const recommendedKw = Math.round((targetUnits / 125) * 10) / 10;
    const panelCount = Math.ceil((recommendedKw * 1000) / 585);

    return `### ☀️ Solar System Sizing Calculation\n\n` +
      `Based on **${isUnits ? `${val} Units (kWh) / Month` : `${val} kW Desired Capacity`}** in Pakistan:\n\n` +
      `• **Recommended System Capacity:** **${recommendedKw} kW**\n` +
      `• **Solar PV Panels:** **${panelCount}x 585W TOPCon N-Type Tier-1 Panels** (Longi / Jinko)\n` +
      `• **Recommended Inverter:** **${Math.ceil(recommendedKw)}kW** Hybrid / On-Grid 3-Phase with Dual MPPT\n` +
      `• **Estimated Monthly Generation:** ~${Math.round(recommendedKw * 125)} to ${Math.round(recommendedKw * 135)} Units (kWh)\n` +
      `• **Net-Metering Feasibility:** ${recommendedKw >= 5 ? '✅ **Eligible for 3-Phase Net-Metering (Green Meter)**' : '⚠️ Single-Phase / Below 5kW standard threshold'}\n\n` +
      `💡 *Tip:* Use our **Solar System Sizer** tab in the sidebar for an instant turnkey quotation with automatic structure and labor pricing!`;
  }

  // Default helpful response
  return `### ⚡ SolarCraft Copilot\n\n` +
    `I can help you monitor and operate **${ctx.shopName || 'your solar shop'}** seamlessly:\n\n` +
    `1. **Customer Balances & Ledgers:** Ask *"What is Sajjad Ustaz balance?"* or *"Show pending dues"*\n` +
    `2. **Inventory & Panels Stock:** Ask *"How many 585W panels in stock?"* or *"Which items are low?"*\n` +
    `3. **Solar Sizing Calculations:** Ask *"Size a solar system for 850 units monthly bill"*\n` +
    `4. **Urdu / Roman Urdu Queries:** Ask *"Baqaya balance check karein"* or *"Solar system quotation"*`;
}

// 7. AI Assistant Endpoint (Powered by @google/genai and Solar ERP Knowledge)
app.post('/api/ai/assistant', async (req: Request, res: Response) => {
  try {
    const { prompt, history = [], context = {} } = req.body;
    if (!prompt || typeof prompt !== 'string') {
      return res.status(400).json({ error: 'Prompt is required' });
    }

    const {
      shopName = 'SolarCraft ERP',
      currency = 'PKR',
      customers = [],
      products = [],
      invoices = [],
      expenses = [],
    } = context;

    const totalDues = customers.reduce((sum: number, c: any) => sum + (Number(c.balanceDue) || 0), 0);
    const totalBilled = customers.reduce((sum: number, c: any) => sum + (Number(c.totalInvoiced) || 0), 0);
    const totalCollected = customers.reduce((sum: number, c: any) => sum + (Number(c.totalPaid) || 0), 0);

    const debtors = customers
      .filter((c: any) => (Number(c.balanceDue) || 0) > 0)
      .map((c: any) => `Customer: ${c.name} | Phone: ${c.phone || 'N/A'} | Balance Due: ${currency} ${(Number(c.balanceDue) || 0).toLocaleString()} | Total Billed: ${currency} ${(Number(c.totalInvoiced) || 0).toLocaleString()}`)
      .slice(0, 20)
      .join('\n');

    const lowStock = products
      .filter((p: any) => (p.stockQty || 0) <= (p.minStockAlert || 5))
      .map((p: any) => `${p.name} (${p.code}): Current Stock = ${p.stockQty} ${p.unit} (Min: ${p.minStockAlert})`)
      .slice(0, 15)
      .join('\n');

    const productCatalog = products
      .slice(0, 25)
      .map((p: any) => `${p.name} [${p.code}]: Stock = ${p.stockQty} ${p.unit} | Price = ${currency} ${p.sellingPrice} | Cost = ${currency} ${p.costPrice || 'N/A'}`)
      .join('\n');

    let reply = '';

    if (process.env.GEMINI_API_KEY) {
      try {
        const systemInstruction = `You are "SolarCraft Copilot", an elite AI Business & Solar Engineering Assistant for a solar energy contractor and retail shop in Pakistan.

LIVE ERP REAL-TIME DATABASE FACTS:
- Shop Name: ${shopName}
- Currency: ${currency}
- Total Outstanding Balance (Dues from Clients): ${currency} ${totalDues.toLocaleString()}
- Total Amount Billed: ${currency} ${totalBilled.toLocaleString()}
- Total Collections Received: ${currency} ${totalCollected.toLocaleString()}
- Total Registered Customers: ${customers.length}
- Total Product Inventory SKUs: ${products.length}
- Total Commercial Invoices: ${invoices.length}

TOP DEBTORS / PENDING CLIENT DUES:
${debtors || 'All customer accounts are clear with zero pending balances.'}

LOW STOCK ALERTS:
${lowStock || 'All inventory stock levels are healthy.'}

PRODUCT CATALOG SNAPSHOT:
${productCatalog || 'No products registered yet.'}

PAKISTAN SOLAR DOMAIN GUIDELINES:
1. Sizing formula: Average generation is ~4.0 to 4.5 units (kWh) per kW peak per day in Pakistan (~120-130 units/month).
   - 500 units/month -> ~4 kW system (~7 panels of 585W).
   - 800-1000 units/month -> ~7 kW to 8 kW system (~12-14 panels of 585W).
   - 1200+ units/month -> ~10 kW to 15 kW system.
2. Net-Metering: Allowed for 3-phase meters with sanctioned load >= 5kW under NEPRA regulations.
3. Multi-language: Respond naturally in whatever language the user uses: English, Urdu (اردو), or Roman Urdu (e.g. "Sajjad Ustaz ka kul baqaya 1,041,450 PKR hai").
4. Tone: Highly professional, direct, crisp, accurate. Use markdown bolding and bullet points. Never make up debtor figures; always use the live facts above.`;

        const contents: any[] = [];
        if (Array.isArray(history) && history.length > 0) {
          for (const item of history.slice(-6)) {
            if (item && item.parts && item.parts.length > 0) {
              contents.push({
                role: item.role === 'model' ? 'model' : 'user',
                parts: item.parts.map((p: any) => ({ text: String(p.text || '') })),
              });
            }
          }
        }
        contents.push({ role: 'user', parts: [{ text: prompt }] });

        const response = await geminiClient.models.generateContent({
          model: 'gemini-3.8-flash',
          contents,
          config: {
            systemInstruction,
          },
        });

        reply = response.text || '';
      } catch (geminiError: any) {
        console.warn('Gemini API call failed, falling back to local solar NLP engine:', geminiError?.message || geminiError);
      }
    }

    if (!reply) {
      reply = generateLocalSolarAssistantResponse(prompt, {
        shopName,
        currency,
        customers,
        products,
        invoices,
        expenses,
        totalDues,
        totalBilled,
        totalCollected,
        lowStock,
      });
    }

    res.json({
      success: true,
      reply,
      source: process.env.GEMINI_API_KEY ? 'gemini-3.8-flash' : 'local-engine',
    });
  } catch (error: any) {
    console.error('AI Assistant Error:', error);
    res.status(500).json({
      error: error.message || 'AI Assistant processing failed',
      reply: 'Sorry, I encountered an issue processing your query. Please try again.',
    });
  }
});

// 8. GitHub Deployment & Status Endpoints
app.get('/api/github/status', async (_req: Request, res: Response) => {
  try {
    const isGit = fs.existsSync(path.join(__dirname, '.git'));
    if (!isGit) {
      return res.json({ initialized: false });
    }

    let branch = 'main';
    try {
      const { stdout } = await execFileAsync('git', ['branch', '--show-current'], { cwd: __dirname });
      branch = stdout.trim() || 'main';
    } catch {
      // ignore
    }

    let latestCommit: { hash: string; author: string; email: string; message: string; date: string } | null = null;
    try {
      const { stdout } = await execFileAsync('git', ['log', '-1', '--format=%H|%an|%ae|%s|%cd'], { cwd: __dirname });
      const parts = stdout.trim().split('|');
      if (parts.length >= 5) {
        latestCommit = {
          hash: parts[0],
          author: parts[1],
          email: parts[2],
          message: parts[3],
          date: parts[4],
        };
      }
    } catch {
      // ignore
    }

    let remoteOrigin: string | null = null;
    try {
      const { stdout } = await execFileAsync('git', ['remote', 'get-url', 'origin'], { cwd: __dirname });
      // Sanitize any token from remote url before exposing
      remoteOrigin = stdout.trim().replace(/\/\/[^@]+@/, '//***@');
    } catch {
      // No remote origin yet
    }

    let hasUncommittedChanges = false;
    try {
      const { stdout } = await execFileAsync('git', ['status', '--porcelain'], { cwd: __dirname });
      hasUncommittedChanges = stdout.trim().length > 0;
    } catch {
      // ignore
    }

    res.json({
      initialized: true,
      branch,
      latestCommit,
      remoteOrigin,
      hasUncommittedChanges,
      serverTime: new Date().toISOString(),
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Failed to inspect git status' });
  }
});

app.post('/api/github/publish', async (req: Request, res: Response) => {
  try {
    const { repoOwner, repoName, personalAccessToken, commitMessage } = req.body;

    if (!repoOwner || !repoName) {
      return res.status(400).json({ error: 'GitHub Username/Organization and Repository Name are required.' });
    }

    const cleanOwner = String(repoOwner).trim().replace(/[^a-zA-Z0-9-]/g, '');
    const cleanRepo = String(repoName).trim().replace(/[^a-zA-Z0-9_.-]/g, '');

    if (!cleanOwner || !cleanRepo) {
      return res.status(400).json({ error: 'Invalid repository name or username format.' });
    }

    const token = personalAccessToken ? String(personalAccessToken).trim() : '';

    // 1. Ensure git repository is initialized
    if (!fs.existsSync(path.join(__dirname, '.git'))) {
      await execFileAsync('git', ['init'], { cwd: __dirname });
    }

    // 2. Ensure git config
    try {
      await execFileAsync('git', ['config', 'user.name', 'Sohail Ahmad'], { cwd: __dirname });
      await execFileAsync('git', ['config', 'user.email', 'sohailahmad074@gmail.com'], { cwd: __dirname });
    } catch {}

    // 3. Stage changes
    await execFileAsync('git', ['add', '-A'], { cwd: __dirname });

    // 4. Commit if needed
    let hasCommits = false;
    try {
      await execFileAsync('git', ['rev-parse', 'HEAD'], { cwd: __dirname });
      hasCommits = true;
    } catch {
      hasCommits = false;
    }

    const { stdout: statusOut } = await execFileAsync('git', ['status', '--porcelain'], { cwd: __dirname });
    if (!hasCommits || statusOut.trim().length > 0) {
      const msg = (commitMessage && String(commitMessage).trim()) || `feat: update SolarCraft ERP (${new Date().toLocaleDateString()})`;
      await execFileAsync('git', ['commit', '-m', msg], { cwd: __dirname });
    }

    // 5. Ensure branch is main
    try {
      await execFileAsync('git', ['branch', '-M', 'main'], { cwd: __dirname });
    } catch {}

    // Auto-attempt repository creation via GitHub API if token is provided
    if (token) {
      try {
        const repoCheck = await fetch(`https://api.github.com/repos/${cleanOwner}/${cleanRepo}`, {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Accept': 'application/vnd.github+json',
            'User-Agent': 'SolarCraft-ERP-Applet',
          },
        });
        if (repoCheck.status === 404) {
          await fetch('https://api.github.com/user/repos', {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${token}`,
              'Accept': 'application/vnd.github+json',
              'Content-Type': 'application/json',
              'User-Agent': 'SolarCraft-ERP-Applet',
            },
            body: JSON.stringify({
              name: cleanRepo,
              private: false,
              description: 'SolarCraft ERP & Solar Quotation System',
              auto_init: false,
            }),
          });
        }
      } catch {
        // Continue to git push attempt
      }
    }

    // 6. Set remote origin URL candidate formats to try
    const urlCandidates: string[] = [];
    if (!token) {
      urlCandidates.push(`https://github.com/${cleanOwner}/${cleanRepo}.git`);
    } else if (token.startsWith('github_pat_')) {
      urlCandidates.push(`https://x-access-token:${encodeURIComponent(token)}@github.com/${cleanOwner}/${cleanRepo}.git`);
      urlCandidates.push(`https://oauth2:${encodeURIComponent(token)}@github.com/${cleanOwner}/${cleanRepo}.git`);
      urlCandidates.push(`https://${encodeURIComponent(token)}@github.com/${cleanOwner}/${cleanRepo}.git`);
    } else {
      urlCandidates.push(`https://${encodeURIComponent(cleanOwner)}:${encodeURIComponent(token)}@github.com/${cleanOwner}/${cleanRepo}.git`);
      urlCandidates.push(`https://${encodeURIComponent(token)}@github.com/${cleanOwner}/${cleanRepo}.git`);
      urlCandidates.push(`https://oauth2:${encodeURIComponent(token)}@github.com/${cleanOwner}/${cleanRepo}.git`);
    }

    let lastError: any = null;
    let pushSuccess = false;
    let pushStdout = '';
    let pushStderr = '';

    for (const testUrl of urlCandidates) {
      try {
        try {
          await execFileAsync('git', ['remote', 'remove', 'origin'], { cwd: __dirname });
        } catch {}

        await execFileAsync('git', ['remote', 'add', 'origin', testUrl], { cwd: __dirname });
        const { stdout, stderr } = await execFileAsync('git', ['push', '-u', 'origin', 'main', '--force'], { cwd: __dirname });
        pushSuccess = true;
        pushStdout = stdout;
        pushStderr = stderr;
        break;
      } catch (err: any) {
        lastError = err;
      }
    }

    // Auto-recovery: If push was rejected because token lacks the 'workflow' scope for .github/workflows
    if (!pushSuccess && lastError && String(lastError.stderr || lastError.message || '').includes('workflow')) {
      try {
        await execFileAsync('git', ['rm', '-rf', '--cached', '.github'], { cwd: __dirname });
        await execFileAsync('git', ['commit', '-m', 'chore: omit github workflows to allow push with repo scope'], { cwd: __dirname });

        for (const testUrl of urlCandidates) {
          try {
            await execFileAsync('git', ['remote', 'set-url', 'origin', testUrl], { cwd: __dirname });
            const { stdout, stderr } = await execFileAsync('git', ['push', '-u', 'origin', 'main', '--force'], { cwd: __dirname });
            pushSuccess = true;
            pushStdout = stdout;
            pushStderr = stderr;
            break;
          } catch (retryErr: any) {
            lastError = retryErr;
          }
        }
      } catch {}
    }

    if (pushSuccess) {
      const repoUrl = `https://github.com/${cleanOwner}/${cleanRepo}`;
      const pagesUrl = `https://${cleanOwner.toLowerCase()}.github.io/${cleanRepo}/`;

      // Get latest commit hash
      const { stdout: logOut } = await execFileAsync('git', ['log', '-1', '--format=%H'], { cwd: __dirname });

      return res.json({
        success: true,
        repoUrl,
        pagesUrl,
        branch: 'main',
        commitHash: logOut.trim(),
        message: 'Successfully deployed and pushed to GitHub!',
        output: (pushStdout + ' ' + pushStderr).replace(new RegExp(token, 'g'), '***'),
      });
    } else {
      const rawStderr = String(lastError?.stderr || lastError?.message || '');
      const safeError = rawStderr.replace(new RegExp(token, 'g'), '***');

      let isRepoNotFound = false;
      let hint = 'Please check that the repository exists on GitHub and your token has "repo" permissions.';
      if (rawStderr.includes('Authentication failed') || rawStderr.includes('Invalid username or password') || rawStderr.includes('401')) {
        hint = 'GitHub authentication failed. Please double check that your Personal Access Token is correct and not expired.';
      } else if (rawStderr.includes('Repository not found') || rawStderr.includes('404')) {
        isRepoNotFound = true;
        hint = `Repository "${cleanOwner}/${cleanRepo}" was not found on GitHub. GitHub requires creating the repository first at https://github.com/new before pushing with a token.`;
      } else if (rawStderr.includes('workflow')) {
        hint = 'GitHub requires the "workflow" scope on your token to modify workflow files. We have excluded workflow files so you can push now, or you can edit your GitHub token and check the "workflow" permission checkbox.';
      } else if (rawStderr.includes('Permission to') && rawStderr.includes('denied to')) {
        if (token.startsWith('github_pat_')) {
          hint = `Permission denied for Fine-Grained token (github_pat_...). On GitHub, edit this token and check: 1) Under "Repository access", choose "All repositories" or select "${cleanRepo}". 2) Under "Permissions" ➔ "Repository permissions", set "Contents" to "Read and write". (Alternatively, generate a Classic Token with "repo" checked for effortless access).`;
        } else {
          hint = `Permission denied to repository "${cleanOwner}/${cleanRepo}". Check that your token was generated from account "${cleanOwner}" with the "repo" scope checked.`;
        }
      }

      return res.status(400).json({
        success: false,
        repoNotFound: isRepoNotFound,
        createRepoUrl: `https://github.com/new?name=${encodeURIComponent(cleanRepo)}&description=SolarCraft+ERP+System`,
        cleanOwner,
        cleanRepo,
        error: `Git Push Failed: ${hint}`,
        details: safeError,
      });
    }
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'An error occurred during GitHub deployment' });
  }
});

app.get('/api/github/download-source', async (req: Request, res: Response) => {
  try {
    const format = req.query.format === 'zip' ? 'zip' : 'tar.gz';
    const filename = `solarcraft-erp-latest.${format === 'zip' ? 'zip' : 'tar.gz'}`;
    const archivePath = path.join(__dirname, 'public', filename);

    if (fs.existsSync(archivePath)) {
      return res.download(archivePath, filename);
    }

    // Generate archive dynamically if not pre-built in public/
    const tempPath = path.join(__dirname, `solarcraft-temp.${format === 'zip' ? 'zip' : 'tar.gz'}`);
    await execFileAsync('git', ['archive', `--format=${format === 'zip' ? 'zip' : 'tar.gz'}`, '-o', tempPath, 'HEAD'], { cwd: __dirname });

    res.download(tempPath, filename, (err) => {
      try {
        if (fs.existsSync(tempPath)) {
          fs.unlinkSync(tempPath);
        }
      } catch {
        // ignore cleanup error
      }
      if (err) {
        console.error('Download error:', err);
      }
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Failed to generate source download archive' });
  }
});

// Mount Vite or Static Files
async function startServer() {
  const isProduction = process.env.NODE_ENV === 'production';

  if (!isProduction) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true, hmr: false },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req: Request, res: Response) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`SolarCraft ERP Server running at http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
});
