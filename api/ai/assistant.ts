import { GoogleGenAI } from '@google/genai';

const STOP_WORDS = new Set([
  'what', 'is', 'the', 'of', 'in', 'how', 'many', 'much', 'quantity', 'qty',
  'stock', 'stocks', 'available', 'balance', 'price', 'prices', 'rate', 'rates',
  'cost', 'costs', 'give', 'me', 'show', 'tell', 'detail', 'details', 'check',
  'ka', 'ki', 'ke', 'ko', 'se', 'par', 'pe', 'kitna', 'kitne', 'kitni', 'hai',
  'hain', 'batao', 'karo', 'dekh', 'dekho', 'kya', 'do', 'we', 'have', 'our',
  'store', 'shop', 'item', 'items', 'product', 'products', 'bataen', 'karein',
  'please', 'plz', 'sir', 'a', 'an', 'and', 'for', 'with', 'about'
]);

export default async function handler(req: any, res: any) {
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
  );

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    const { prompt, history = [], context = {} } = req.body || {};
    if (!prompt) {
      return res.status(400).json({ error: 'Prompt is required' });
    }

    const {
      shopName = 'SolarCraft ERP',
      currency = 'PKR',
      customers = [],
      products = [],
      invoices = [],
    } = context;

    const totalDues = customers.reduce((sum: number, c: any) => sum + (Number(c.balanceDue) || 0), 0);
    const totalBilled = customers.reduce((sum: number, c: any) => sum + (Number(c.totalInvoiced) || 0), 0);
    const totalCollected = customers.reduce((sum: number, c: any) => sum + (Number(c.totalPaid) || 0), 0);

    const q = prompt.toLowerCase().trim();
    const cleanTokens = q.replace(/[^a-z0-9\s\.\-]/g, ' ').split(/\s+/).filter(Boolean);
    const searchTerms = cleanTokens.filter((token: string) => !STOP_WORDS.has(token) && token.length > 1);

    // Score products based on search terms
    const scoredProducts = products
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

    const matchedProducts = scoredProducts.slice(0, 15).map((item: any) => item.product);

    let reply = '';

    if (process.env.GEMINI_API_KEY) {
      try {
        const geminiClient = new GoogleGenAI({
          apiKey: process.env.GEMINI_API_KEY,
          httpOptions: {
            headers: {
              'User-Agent': 'aistudio-build',
            },
          },
        });

        const relevantProductsText = matchedProducts.length > 0
          ? matchedProducts.map((p: any) => `• ${p.name} [SKU: ${p.code}]: In Stock = ${p.stockQty} ${p.unit || 'Pcs'} | Price = ${currency} ${p.sellingPrice} | Brand = ${p.brand || 'N/A'}`).join('\n')
          : products.slice(0, 15).map((p: any) => `• ${p.name} [SKU: ${p.code}]: In Stock = ${p.stockQty} ${p.unit || 'Pcs'} | Price = ${currency} ${p.sellingPrice}`).join('\n');

        const systemInstruction = `You are "SolarCraft Copilot", an elite AI Business & Solar Engineering Assistant for a solar contractor in Pakistan.

LIVE ERP REAL-TIME DATABASE FACTS:
- Shop Name: ${shopName}
- Currency: ${currency}
- Total Outstanding Balance (Dues from Clients): ${currency} ${totalDues.toLocaleString()}
- Total Products in Catalog: ${products.length} SKUs

RELEVANT INVENTORY PRODUCTS MATCHING USER QUERY:
${relevantProductsText}

RULES:
1. When asked about product stock or quantities (e.g. "ARM panel quantity"), report the EXACT available stock count, SKU, and unit selling price from the matching products above.
2. If multiple variants match (e.g. different wattages), list each variant with its quantity and the total combined quantity.
3. Be direct, professional, and accurate. Use markdown formatting.`;

        const contents: any[] = [];
        if (Array.isArray(history) && history.length > 0) {
          for (const item of history.slice(-6)) {
            contents.push({
              role: item.role === 'model' || item.role === 'assistant' ? 'model' : 'user',
              parts: [{ text: item.parts?.[0]?.text || item.text || '' }],
            });
          }
        }
        contents.push({
          role: 'user',
          parts: [{ text: prompt }],
        });

        const genRes = await geminiClient.models.generateContent({
          model: 'gemini-3.8-flash',
          contents,
          config: {
            systemInstruction,
            temperature: 0.2,
          },
        });

        reply = genRes.text || '';
      } catch (geminiErr) {
        console.warn('Gemini API call error in Vercel function:', geminiErr);
      }
    }

    if (!reply) {
      // 1. Matched products query
      if (matchedProducts.length > 0) {
        const totalQty = matchedProducts.reduce((sum: number, p: any) => sum + (p.stockQty || 0), 0);
        const isPanel = matchedProducts.some((p: any) => p.category === 'SOLAR_PANELS' || (p.name || '').toLowerCase().includes('panel'));
        const unitLabel = matchedProducts[0]?.unit || (isPanel ? 'Panels' : 'Pcs');

        reply = `### 📦 **Inventory Stock Results** (${matchedProducts.length} matching item${matchedProducts.length > 1 ? 's' : ''})\n\n`;

        if (matchedProducts.length > 1) {
          reply += `• **Total Stock Available:** **${totalQty.toLocaleString()} ${unitLabel}**\n\n` +
            `**Detailed Item Breakdown:**\n\n`;

          matchedProducts.forEach((p: any, idx: number) => {
            const isLow = p.stockQty <= (p.minStockAlert || 5);
            reply += `${idx + 1}. **${p.name}**\n` +
              `   • SKU Code: \`${p.code}\`\n` +
              `   • In Stock: **${p.stockQty} ${p.unit || 'Pcs'}** ${isLow ? '⚠️ *(Low Stock)*' : '✅ *(Available)*'}\n` +
              `   • Selling Price: **${currency} ${p.sellingPrice.toLocaleString()}**` +
              (p.brand ? ` | Brand: *${p.brand}*` : '') +
              `\n\n`;
          });
        } else {
          const p = matchedProducts[0];
          const isLow = p.stockQty <= (p.minStockAlert || 5);
          reply += `• **Product:** **${p.name}**\n` +
            `• **SKU Code:** \`${p.code}\`\n` +
            `• **Available Stock:** **${p.stockQty} ${p.unit || 'Pcs'}** ${isLow ? '⚠️ *(Low Stock Alert)*' : '✅ *(In Stock)*'}\n` +
            `• **Selling Price:** **${currency} ${p.sellingPrice.toLocaleString()}**\n` +
            (p.costPrice ? `• **Cost Price:** ${currency} ${p.costPrice.toLocaleString()}\n` : '') +
            (p.brand ? `• **Brand:** ${p.brand}\n` : '') +
            (p.specs ? `• **Specifications:** ${p.specs}\n` : '');
        }
      } else {
        // 2. Customer match
        const matchedCustomer = customers.find((c: any) =>
          (c.name && q.includes(c.name.toLowerCase())) ||
          (c.name && c.name.toLowerCase().split(' ').some((word: string) => word.length > 3 && q.includes(word)))
        );

        if (matchedCustomer) {
          const due = Number(matchedCustomer.balanceDue) || 0;
          reply = `### 👤 Client Account: **${matchedCustomer.name}**\n\n` +
            `• **Total Billed:** ${currency} ${(Number(matchedCustomer.totalInvoiced) || 0).toLocaleString()}\n` +
            `• **Total Paid:** ${currency} ${(Number(matchedCustomer.totalPaid) || 0).toLocaleString()}\n` +
            `• **Current Pending Balance:** ${due <= 0 ? '✅ **0.00 (Cleared)**' : `🔴 **${currency} ${due.toLocaleString()}**`}`;
        } else if (q.includes('kw') || q.includes('size') || q.includes('calc') || q.includes('package')) {
          reply = `### ☀️ **10kW Turnkey Solar Package Sizing**\n\n` +
            `• **Solar PV Panels:** 17x 585W TOPCon N-Type Tier-1 Panels\n` +
            `• **Inverter:** 10kW 3-Phase Dual-MPPT Hybrid / On-Grid\n` +
            `• **Estimated Monthly Generation:** ~1,250 - 1,350 Units (kWh)\n` +
            `• **Net-Metering:** Eligible for Green Meter under NEPRA guidelines!`;
        } else {
          reply = `### ⚡ **SolarCraft Copilot**\n\n` +
            `Connected to your live database (${products.length} products, ${customers.length} clients).\n` +
            `Try asking: *"ARM panel quantity"*, *"Sajjad Ustaz balance"*, or *"10kW solar package"*.`;
        }
      }
    }

    return res.status(200).json({ reply, source: process.env.GEMINI_API_KEY ? 'gemini' : 'local' });
  } catch (error: any) {
    return res.status(500).json({ error: error.message || 'Internal Server Error' });
  }
}
