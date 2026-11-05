/**
 * SolarCraft Intelligent Client-Side Copilot Engine
 * 
 * High-accuracy NLP and real-time inventory matching engine.
 * Handles exact and fuzzy product lookups, customer ledgers (FIFO),
 * solar sizing engineering, and billing metrics across 600+ store SKUs.
 */

import { Customer, Invoice, ProductItem, ShopSettings, Expense } from '../types/solar';

export interface SolarCopilotContext {
  shopName?: string;
  currency?: string;
  customers: Customer[];
  products: ProductItem[];
  invoices: Invoice[];
  expenses?: Expense[];
  settings?: ShopSettings;
}

export interface CopilotResponse {
  reply: string;
  action?: {
    type: 'VIEW_CUSTOMER' | 'VIEW_INVOICE' | 'VIEW_INVENTORY' | 'ESTIMATOR' | 'RECORD_PAYMENT';
    targetId?: string;
    label: string;
  };
}

const STOP_WORDS = new Set([
  'what', 'is', 'the', 'of', 'in', 'how', 'many', 'much', 'quantity', 'qty',
  'stock', 'stocks', 'available', 'balance', 'price', 'prices', 'rate', 'rates',
  'cost', 'costs', 'give', 'me', 'show', 'tell', 'detail', 'details', 'check',
  'ka', 'ki', 'ke', 'ko', 'se', 'par', 'pe', 'kitna', 'kitne', 'kitni', 'hai',
  'hain', 'batao', 'karo', 'dekh', 'dekho', 'kya', 'do', 'we', 'have', 'our',
  'store', 'shop', 'item', 'items', 'product', 'products', 'bataen', 'karein',
  'please', 'plz', 'sir', 'a', 'an', 'and', 'for', 'with', 'about'
]);

export function generateLocalSolarAssistantResponse(
  prompt: string,
  ctx: SolarCopilotContext
): CopilotResponse {
  const rawPrompt = prompt.trim();
  const q = rawPrompt.toLowerCase();
  const currency = ctx.currency || ctx.settings?.currency || 'PKR';
  const customers = ctx.customers || [];
  const products = ctx.products || [];
  const invoices = ctx.invoices || [];

  const totalDues = customers.reduce((sum, c) => sum + (Number(c.balanceDue) || 0), 0);
  const totalBilled = customers.reduce((sum, c) => sum + (Number(c.totalInvoiced) || 0), 0);
  const totalCollected = customers.reduce((sum, c) => sum + (Number(c.totalPaid) || 0), 0);

  // Clean tokens from query
  const cleanTokens = q
    .replace(/[^a-z0-9\s\.\-]/g, ' ')
    .split(/\s+/)
    .filter(Boolean);

  // Distinctive search terms (non-stopwords)
  const searchTerms = cleanTokens.filter((token) => !STOP_WORDS.has(token) && token.length > 1);

  // =========================================================================
  // 1. SPECIFIC CUSTOMER SEARCH (e.g. "Sajjad Ustaz", "what is balance of Ali")
  // =========================================================================
  const matchedCustomer = customers.find((c) => {
    if (!c.name) return false;
    const nameLow = c.name.toLowerCase();
    if (q.includes(nameLow)) return true;

    // Word tokens in customer name
    const custWords = nameLow.split(/\s+/).filter((w) => w.length > 2);
    if (custWords.length > 0 && custWords.some((w) => q.includes(w))) return true;

    // Phone match
    if (c.phone) {
      const cleanPhone = c.phone.replace(/\D/g, '');
      if (cleanPhone.length >= 7 && q.includes(cleanPhone)) return true;
    }
    return false;
  });

  // Only prioritize customer if the query is not explicitly asking about a product or panel
  const isExplicitProductQuery = cleanTokens.some((t) =>
    ['panel', 'panels', 'inverter', 'inverters', 'battery', 'batteries', 'wire', 'cable', 'structure', 'arm', 'watt', 'kwp'].includes(t)
  );

  if (matchedCustomer && !isExplicitProductQuery) {
    const due = Number(matchedCustomer.balanceDue) || 0;
    const billed = Number(matchedCustomer.totalInvoiced) || 0;
    const paid = Number(matchedCustomer.totalPaid) || 0;
    const isCleared = due <= 0;

    const unpaidInvoices = invoices
      .filter((i) => i.customerId === matchedCustomer.id && i.type !== 'QUOTATION' && (i.balanceDue || 0) > 0)
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    let reply = `### 👤 Client Account: **${matchedCustomer.name}**\n\n` +
      `• **Total Project Billed:** ${currency} ${billed.toLocaleString()}\n` +
      `• **Total Received (Paid):** ${currency} ${paid.toLocaleString()}\n` +
      `• **Current Pending Balance:** ${isCleared ? '✅ **0.00 (Cleared in Full)**' : `🔴 **${currency} ${due.toLocaleString()}**`}\n` +
      (matchedCustomer.phone ? `• **Contact Phone:** \`${matchedCustomer.phone}\`\n` : '') +
      (matchedCustomer.installedCapacityKw ? `• **Installed Solar System:** ${matchedCustomer.installedCapacityKw} kW\n` : '') +
      (matchedCustomer.city ? `• **City / Site:** ${matchedCustomer.city}\n\n` : '\n');

    if (unpaidInvoices.length > 0) {
      reply += `📑 **Unpaid Invoices (FIFO Oldest-First Deductions):**\n`;
      unpaidInvoices.forEach((inv, idx) => {
        reply += `${idx + 1}. **Invoice #${inv.invoiceNumber}** (${inv.date}): Due **${currency} ${(inv.balanceDue || 0).toLocaleString()}** (Total: ${currency} ${inv.grandTotal.toLocaleString()})\n`;
      });
      reply += `\n💡 *Incoming payments will deduct sequentially starting from oldest invoice #${unpaidInvoices[0].invoiceNumber}.*`;
    }

    return {
      reply,
      action: {
        type: 'VIEW_CUSTOMER',
        targetId: matchedCustomer.id,
        label: `Open ${matchedCustomer.name}'s Account 360°`,
      },
    };
  }

  // =========================================================================
  // 2. PRODUCT & INVENTORY STOCK SEARCH (e.g. "arm panel quantity", "arm power", "longi 585w")
  // =========================================================================
  // Check if query is looking for hardware, product, brand, stock, or quantity
  const isInventoryQuery =
    searchTerms.length > 0 ||
    cleanTokens.some((t) =>
      ['stock', 'stocks', 'inventory', 'quantity', 'qty', 'rate', 'rates', 'price', 'panel', 'panels', 'inverter', 'inverters', 'battery', 'batteries', 'module', 'modules'].includes(t)
    );

  if (isInventoryQuery && products.length > 0) {
    // Score products based on keyword matching
    const scoredProducts = products
      .map((p) => {
        const fullText = `${p.name || ''} ${p.brand || ''} ${p.model || ''} ${p.specs || ''} ${p.code || ''} ${p.category || ''}`.toLowerCase();
        let matchScore = 0;

        // Exact code match
        if (p.code && q.includes(p.code.toLowerCase())) {
          matchScore += 100;
        }

        // Distinctive terms match
        for (const term of searchTerms) {
          if (term.length <= 1) continue;
          if (fullText.includes(term)) {
            matchScore += 15;
            // Higher weight if in product name or brand
            if ((p.name || '').toLowerCase().includes(term)) matchScore += 25;
            if ((p.brand || '').toLowerCase().includes(term)) matchScore += 30;
          }
        }

        // Category relevance bonus
        if ((q.includes('panel') || q.includes('panels') || q.includes('module')) && p.category === 'SOLAR_PANELS') {
          matchScore += 10;
        }
        if ((q.includes('inverter') || q.includes('inverters')) && p.category === 'INVERTERS') {
          matchScore += 10;
        }
        if ((q.includes('battery') || q.includes('batteries')) && p.category === 'BATTERIES') {
          matchScore += 10;
        }

        return { product: p, score: matchScore };
      })
      .filter((item) => item.score > 0)
      .sort((a, b) => b.score - a.score);

    // If we found matched products
    if (scoredProducts.length > 0) {
      const bestScore = scoredProducts[0].score;
      // Keep relevant matches (at least 35% of top score)
      const topMatches = scoredProducts
        .filter((item) => item.score >= Math.max(20, bestScore * 0.35))
        .map((item) => item.product);

      const totalQuantity = topMatches.reduce((sum, p) => sum + (p.stockQty || 0), 0);
      const totalStockValuation = topMatches.reduce((sum, p) => sum + (p.stockQty || 0) * (p.sellingPrice || 0), 0);

      const isPanel = topMatches.some((p) => p.category === 'SOLAR_PANELS' || (p.name || '').toLowerCase().includes('panel'));
      const unitLabel = topMatches[0]?.unit || (isPanel ? 'Panels' : 'Units');

      let reply = `### 📦 **Inventory Stock Results** (${topMatches.length} matching item${topMatches.length > 1 ? 's' : ''})\n\n`;

      if (topMatches.length > 1) {
        reply += `• **Total Stock Available:** **${totalQuantity.toLocaleString()} ${unitLabel}**\n` +
          `• **Total Retail Valuation:** ${currency} ${totalStockValuation.toLocaleString()}\n\n` +
          `**Detailed Item Breakdown:**\n\n`;

        topMatches.slice(0, 10).forEach((p, idx) => {
          const isLow = p.stockQty <= (p.minStockAlert || 5);
          const statusIcon = isLow ? '⚠️ Low Stock' : '✅ In Stock';
          reply += `${idx + 1}. **${p.name}**\n` +
            `   • SKU Code: \`${p.code}\`\n` +
            `   • Available Quantity: **${p.stockQty} ${p.unit || 'Pcs'}** (${statusIcon})\n` +
            `   • Selling Price: **${currency} ${p.sellingPrice.toLocaleString()}**` +
            (p.costPrice ? ` | Cost: ${currency} ${p.costPrice.toLocaleString()}` : '') +
            (p.brand ? ` | Brand: *${p.brand}*` : '') +
            `\n\n`;
        });

        if (topMatches.length > 10) {
          reply += `*...and ${topMatches.length - 10} more matching variants in inventory.*\n\n`;
        }
      } else {
        // Single exact product match
        const p = topMatches[0];
        const isLow = p.stockQty <= (p.minStockAlert || 5);
        reply += `• **Product Name:** **${p.name}**\n` +
          `• **SKU Code:** \`${p.code}\`\n` +
          `• **Current Stock Quantity:** **${p.stockQty} ${p.unit || 'Pcs'}** ${isLow ? '⚠️ *(Low Stock Alert)*' : '✅ *(Available)*'}\n` +
          `• **Selling Price:** **${currency} ${p.sellingPrice.toLocaleString()}**\n` +
          (p.costPrice ? `• **Cost Price:** ${currency} ${p.costPrice.toLocaleString()}\n` : '') +
          (p.brand ? `• **Brand:** ${p.brand}\n` : '') +
          (p.specs ? `• **Technical Specifications:** ${p.specs}\n` : '') +
          `• **Total Stock Value:** ${currency} ${(p.stockQty * p.sellingPrice).toLocaleString()}\n\n`;
      }

      reply += `💡 *All inventory counts are synced with your live store warehouse.*`;

      return {
        reply,
        action: {
          type: 'VIEW_INVENTORY',
          label: 'Open Inventory Management Tab',
        },
      };
    }
  }

  // =========================================================================
  // 3. SOLAR SYSTEM SIZING & SIZING QUOTES (e.g. "Calculate 10kW On-Grid solar package", "size for 800 units")
  // =========================================================================
  if (
    q.includes('kw') ||
    q.includes('unit') ||
    q.includes('units') ||
    q.includes('sizing') ||
    q.includes('package') ||
    q.includes('on-grid') ||
    q.includes('hybrid') ||
    q.includes('off-grid') ||
    q.includes('solar package')
  ) {
    const numbers = prompt.match(/\d+(\.\d+)?/g);
    let val = numbers ? parseFloat(numbers[0]) : 10;
    const isUnits = val > 40; // > 40 is monthly units (kWh), else kW capacity
    const recommendedKw = isUnits ? Math.round((val / 125) * 10) / 10 : val;
    const monthlyUnits = Math.round(recommendedKw * 125);
    const panelCount = Math.ceil((recommendedKw * 1000) / 585);
    const inverterKw = Math.ceil(recommendedKw);
    const estCostMin = Math.round(recommendedKw * 120000);
    const estCostMax = Math.round(recommendedKw * 145000);
    const monthlySavings = Math.round(monthlyUnits * 55); // ~55 PKR per unit in Pakistan

    const reply = `### ☀️ **${recommendedKw} kW Turnkey Solar PV Package** (Pakistan Specification)\n\n` +
      `Here is the complete engineering specification for a **${recommendedKw} kW** Solar System:\n\n` +
      `• **Solar PV Capacity:** **${recommendedKw} kW Peak**\n` +
      `• **Solar PV Panels:** **${panelCount}x 585W TOPCon N-Type Tier-1 Panels** (Longi / Jinko Solar / ARM)\n` +
      `• **Inverter:** **${inverterKw} kW 3-Phase Dual-MPPT Inverter** (Growatt / Inverex / Deye / Huawei)\n` +
      `• **Estimated Monthly Generation:** **~${monthlyUnits.toLocaleString()} to ${(monthlyUnits + 100).toLocaleString()} Units (kWh)**\n` +
      `• **Monthly Bill Savings:** **~${currency} ${monthlySavings.toLocaleString()} / Month**\n` +
      `• **Estimated Turnkey Cost:** **${currency} ${estCostMin.toLocaleString()} - ${estCostMax.toLocaleString()}** (including structure & AC/DC DB)\n` +
      `• **Net-Metering (Green Meter):** ${recommendedKw >= 5 ? '✅ **Fully Eligible for 3-Phase Net-Metering under NEPRA / DISCO regulations**' : '⚠️ Below 5kW standard 3-phase net-metering threshold'}\n` +
      `• **Warranty Coverage:** 12-Year Product Warranty, 25-Year 85% Linear Panel Output Guarantee.\n\n` +
      `💡 *Click below to open the Solar System Estimator and generate an official customer proposal!*`;

    return {
      reply,
      action: {
        type: 'ESTIMATOR',
        label: `Generate ${recommendedKw}kW Solar Proposal`,
      },
    };
  }

  // =========================================================================
  // 4. STORE RECEIVABLES & PENDING DUES SUMMARY ("balance", "baqaya", "dues", "debt", "debtors")
  // =========================================================================
  if (
    q.includes('balance') ||
    q.includes('baqaya') ||
    q.includes('due') ||
    q.includes('dues') ||
    q.includes('debt') ||
    q.includes('receivable') ||
    q.includes('recovery') ||
    q.includes('pending')
  ) {
    const debtors = customers
      .filter((c) => (Number(c.balanceDue) || 0) > 0)
      .sort((a, b) => (Number(b.balanceDue) || 0) - (Number(a.balanceDue) || 0));

    let reply = `### 📊 **Store Receivables & Account Ledger Summary**\n\n` +
      `• **Total Outstanding Receivables:** 🔴 **${currency} ${totalDues.toLocaleString()}**\n` +
      `• **Total Project Billings to Date:** ${currency} ${totalBilled.toLocaleString()}\n` +
      `• **Total Collections Received:** ${currency} ${totalCollected.toLocaleString()}\n` +
      `• **Clients with Pending Balances:** **${debtors.length} of ${customers.length} clients**\n\n`;

    if (debtors.length > 0) {
      reply += `**Top Pending Accounts:**\n`;
      debtors.slice(0, 6).forEach((d, idx) => {
        reply += `${idx + 1}. **${d.name}:** 🔴 **${currency} ${(Number(d.balanceDue) || 0).toLocaleString()}** (Billed: ${currency} ${(Number(d.totalInvoiced) || 0).toLocaleString()})\n`;
      });
      if (debtors.length > 6) {
        reply += `*...and ${debtors.length - 6} other clients with smaller balances.*\n`;
      }
    } else {
      reply += `✅ All client ledgers are 100% reconciled and cleared with 0 pending balance!\n`;
    }

    return {
      reply,
      action: debtors.length > 0 ? {
        type: 'VIEW_CUSTOMER',
        targetId: debtors[0].id,
        label: `View Largest Debtor: ${debtors[0].name}`,
      } : undefined,
    };
  }

  // =========================================================================
  // 5. URDU & ROMAN URDU INQUIRIES
  // =========================================================================
  if (
    q.includes('karein') ||
    q.includes('batao') ||
    q.includes('bataen') ||
    q.includes('kitna') ||
    q.includes('kitne') ||
    q.includes('urdu') ||
    q.includes('سولر')
  ) {
    return {
      reply: `### ⚡ **سولر کرافٹ اسسٹنٹ (SolarCraft Copilot)**\n\n` +
        `آپ لائیو سٹور ڈیٹا سے درج ذیل معلومات فوری حاصل کر سکتے ہیں:\n\n` +
        `1. **سولر پینل اور انورٹر کا سٹاک:** لکھیں *"ARM panel quantity"* یا *"Inverex 10kW stock"*\n` +
        `2. **گاہکوں کا بقایا کھاتہ:** لکھیں *"سجاد استاد کا بیلنس"* یا *"Sajjad Ustaz balance"*\n` +
        `3. **سولر سسٹم پیکیج سائزنگ:** لکھیں *"10kW On-Grid solar package"* یا *"800 units solar system"*\n` +
        `4. **کُل دکانداری بقایا جات:** لکھیں *"Total balance dues"*`,
      action: {
        type: 'VIEW_INVENTORY',
        label: 'سٹاک انوینٹری کھولیں (View Inventory)',
      },
    };
  }

  // =========================================================================
  // 6. DEFAULT INTENT-BASED GUIDANCE
  // =========================================================================
  // If the user typed search terms that didn't match directly, report what was searched
  const termsText = searchTerms.join(' ');
  return {
    reply: `### ⚡ **SolarCraft Copilot**\n\n` +
      (termsText ? `No direct product or client record matched *"**${termsText}**"*. \n\n` : '') +
      `Here is a summary of your live store data (**${ctx.shopName || 'SolarCraft ERP'}**):\n\n` +
      `• **Live Products in Catalog:** **${products.length} registered hardware items**\n` +
      `• **Registered Customers:** **${customers.length} clients**\n` +
      `• **Total Outstanding Receivables:** **${currency} ${totalDues.toLocaleString()}**\n\n` +
      `**Quick Questions You Can Ask:**\n` +
      `1. *"What is Sajjad Ustaz pending balance?"*\n` +
      `2. *"ARM panel quantity"* or *"ARM Power stock"*\n` +
      `3. *"Calculate 10kW On-Grid solar package for Pakistan"*\n` +
      `4. *"Show low stock items & panel quantities"*`,
    action: {
      type: 'VIEW_INVENTORY',
      label: 'Browse Complete 600+ Products',
    },
  };
}
