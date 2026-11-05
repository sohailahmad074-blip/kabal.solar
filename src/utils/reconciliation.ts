import { Customer, Invoice } from '../types/solar';

export interface ReconciliationResult {
  reconciledCustomers: Customer[];
  reconciledInvoices: Invoice[];
  discrepancyFound: boolean;
  discrepancyAmount: number;
  stats: {
    totalBilled: number;
    totalPaid: number;
    totalBalanceDue: number;
    commercialInvoicesCount: number;
    quotationsCount: number;
    createdCustomersCount: number;
    relinkedInvoicesCount: number;
    previousCustomerBilled: number;
    previousCustomerPaid: number;
    previousCustomerBalance: number;
  };
}

export function normalizePhone(phone?: string): string {
  if (!phone) return '';
  return phone.replace(/\D/g, '');
}

export function phoneMatches(p1?: string, p2?: string): boolean {
  if (!p1 || !p2) return false;
  const d1 = normalizePhone(p1);
  const d2 = normalizePhone(p2);
  if (!d1 || !d2) return false;
  if (d1 === d2) return true;
  const minLen = Math.min(d1.length, d2.length);
  if (minLen >= 7) {
    const checkLen = Math.min(minLen, 9);
    return d1.slice(-checkLen) === d2.slice(-checkLen);
  }
  return false;
}

export function normalizeName(name?: string): string {
  if (!name) return '';
  return name
    .toLowerCase()
    .replace(/[^\w\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function nameMatches(n1?: string, n2?: string): boolean {
  if (!n1 || !n2) return false;
  const norm1 = normalizeName(n1);
  const norm2 = normalizeName(n2);
  if (!norm1 || !norm2) return false;
  if (norm1 === norm2) return true;
  if (norm1.length >= 4 && norm2.length >= 4) {
    if (norm1.startsWith(norm2) || norm2.startsWith(norm1)) return true;
  }
  return false;
}

/**
 * Reconciles Customers and Invoices so that:
 * 1. Every commercial invoice is linked to an authoritative Customer profile (by customerId, phone, or name).
 * 2. Any invoice whose customer does not exist in the Customer CRM is automatically registered with contact details.
 * 3. Every customer's totalInvoiced, totalPaid, and balanceDue fields are strictly computed from commercial invoices (excluding quotations).
 * 4. Invoice balanceDue fields are strictly audited: balanceDue = max(0, grandTotal - paidAmount).
 * 5. The grand sum of customer balances and total billed matches the invoice totals down to 0.00.
 */
export function reconcileCustomersAndInvoices(
  rawCustomers: Customer[] = [],
  rawInvoices: Invoice[] = []
): ReconciliationResult {
  const customers: Customer[] = (rawCustomers || []).map((c) => ({ ...c }));
  const invoices: Invoice[] = (rawInvoices || []).map((i) => ({ ...i }));

  const prevCustomerBilled = Math.round(customers.reduce((acc, c) => acc + (Number(c.totalInvoiced) || 0), 0) * 100) / 100;
  const prevCustomerPaid = Math.round(customers.reduce((acc, c) => acc + (Number(c.totalPaid) || 0), 0) * 100) / 100;
  const prevCustomerBalance = Math.round(customers.reduce((acc, c) => acc + (Number(c.balanceDue) || 0), 0) * 100) / 100;

  let createdCustomersCount = 0;
  let relinkedInvoicesCount = 0;

  // 1. Audit and sanitize individual invoice totals
  invoices.forEach((inv) => {
    const isQuotation = inv.type === 'QUOTATION';
    const grandTotal = Number(inv.grandTotal) || 0;
    const paidAmount = Number(inv.paidAmount) || 0;
    const settlementDiscount = Number(inv.settlementDiscountTotal) || 0;
    const correctedBalance = isQuotation ? 0 : Math.max(0, Math.round((grandTotal - paidAmount - settlementDiscount) * 100) / 100);
    inv.balanceDue = correctedBalance;
    if (isQuotation) {
      inv.status = 'UNPAID';
    } else if ((paidAmount + settlementDiscount) >= grandTotal && grandTotal > 0) {
      inv.status = 'PAID';
    } else if (paidAmount > 0 || settlementDiscount > 0) {
      inv.status = 'PARTIAL';
    } else {
      inv.status = 'UNPAID';
    }
  });

  // 2. Establish linking: ensure every invoice points to a legitimate Customer
  invoices.forEach((inv) => {
    let matchedCust = customers.find((c) => c.id && c.id === inv.customerId);

    // If no match by ID, attempt matching by clean phone number
    if (!matchedCust && inv.customerPhone) {
      matchedCust = customers.find((c) => phoneMatches(c.phone || c.whatsapp, inv.customerPhone));
    }

    // If still no match, attempt matching by normalized name
    if (!matchedCust && inv.customerName) {
      matchedCust = customers.find((c) => nameMatches(c.name, inv.customerName));
    }

    if (matchedCust) {
      if (inv.customerId !== matchedCust.id) {
        inv.customerId = matchedCust.id;
        relinkedInvoicesCount++;
      }
    } else {
      // Create and register missing Customer record in CRM so their ledger is tracked
      const newCustId = inv.customerId && inv.customerId.trim().length > 3
        ? inv.customerId
        : `cust-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
      
      const newCustomer: Customer = {
        id: newCustId,
        name: (inv.customerName || '').trim() || `Client ${inv.invoiceNumber}`,
        customerType: 'RESIDENTIAL',
        phone: (inv.customerPhone || '').trim(),
        whatsapp: (inv.customerPhone || '').trim(),
        email: (inv.customerEmail || '').trim(),
        address: (inv.customerAddress || inv.installationAddress || '').trim(),
        city: (inv.customerCity || '').trim(),
        installedCapacityKw: Number(inv.projectSystemCapacityKw) || 0,
        totalInvoiced: 0,
        totalPaid: 0,
        balanceDue: 0,
        createdAt: inv.createdAt || new Date().toISOString(),
        updatedAt: inv.updatedAt || new Date().toISOString(),
      };

      inv.customerId = newCustId;
      customers.push(newCustomer);
      createdCustomersCount++;
    }
  });

  // 3. Strict Mathematical Recomputation:
  // Quotations are non-binding estimates; only commercial invoices represent actual billed debits & dues.
  const commercialInvoices = invoices.filter((i) => i.type !== 'QUOTATION');
  const quotations = invoices.filter((i) => i.type === 'QUOTATION');

  const reconciledCustomers = customers.map((cust) => {
    const custInvoices = commercialInvoices.filter((i) => 
      i.customerId === cust.id ||
      (i.customerPhone && (cust.phone || cust.whatsapp) && phoneMatches(cust.phone || cust.whatsapp, i.customerPhone)) ||
      (i.customerName && cust.name && nameMatches(cust.name, i.customerName))
    );

    const totalInvoiced = custInvoices.reduce((sum, i) => sum + (Number(i.grandTotal) || 0), 0);
    const totalPaid = custInvoices.reduce((sum, i) => sum + (Number(i.paidAmount) || 0), 0);
    const balanceDue = custInvoices.reduce((sum, i) => sum + (Number(i.balanceDue) || 0), 0);

    // Pick up installed capacity from invoice if customer profile has 0
    let installedCapacityKw = Number(cust.installedCapacityKw) || 0;
    if (!installedCapacityKw) {
      const invWithCapacity = custInvoices.find((i) => Number(i.projectSystemCapacityKw) > 0);
      if (invWithCapacity) {
        installedCapacityKw = Number(invWithCapacity.projectSystemCapacityKw);
      }
    }

    return {
      ...cust,
      installedCapacityKw: Math.round(installedCapacityKw * 100) / 100,
      totalInvoiced: Math.round(totalInvoiced * 100) / 100,
      totalPaid: Math.round(totalPaid * 100) / 100,
      balanceDue: Math.round(balanceDue * 100) / 100,
      updatedAt: new Date().toISOString(),
    };
  });

  const totalBilled = Math.round(commercialInvoices.reduce((sum, i) => sum + (Number(i.grandTotal) || 0), 0) * 100) / 100;
  const totalPaid = Math.round(commercialInvoices.reduce((sum, i) => sum + (Number(i.paidAmount) || 0), 0) * 100) / 100;
  const totalBalanceDue = Math.round(commercialInvoices.reduce((sum, i) => sum + (Number(i.balanceDue) || 0), 0) * 100) / 100;

  const discrepancyAmount = Math.abs(totalBalanceDue - prevCustomerBalance) + Math.abs(totalBilled - prevCustomerBilled);
  const discrepancyFound = createdCustomersCount > 0 || relinkedInvoicesCount > 0 || discrepancyAmount > 0.05;

  return {
    reconciledCustomers,
    reconciledInvoices: invoices,
    discrepancyFound,
    discrepancyAmount: Math.round(discrepancyAmount * 100) / 100,
    stats: {
      totalBilled,
      totalPaid,
      totalBalanceDue,
      commercialInvoicesCount: commercialInvoices.length,
      quotationsCount: quotations.length,
      createdCustomersCount,
      relinkedInvoicesCount,
      previousCustomerBilled: prevCustomerBilled,
      previousCustomerPaid: prevCustomerPaid,
      previousCustomerBalance: prevCustomerBalance,
    },
  };
}
