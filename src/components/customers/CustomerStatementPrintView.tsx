import React, { useRef, useState, useMemo } from 'react';
import {
  Printer,
  ArrowLeft,
  Sun,
  MapPin,
  Phone,
  Mail,
  Zap,
  Calendar,
  FileSpreadsheet,
  CheckCircle2,
  AlertCircle,
  Download,
  Share2,
  Package,
  Layers,
  ChevronDown,
  ChevronUp,
  Receipt,
  CreditCard,
  DollarSign,
  Info
} from 'lucide-react';
import { Customer, Invoice, InvoiceItem, ShopSettings } from '../../types/solar';
import { formatCurrency, formatDate } from '../../utils/formatters';
import { openWhatsApp } from '../../utils/sendDirect';
import { phoneMatches, nameMatches } from '../../utils/reconciliation';

interface CustomerStatementPrintViewProps {
  customer: Customer;
  invoices: Invoice[];
  settings: ShopSettings;
  onBack: () => void;
}

export interface UnifiedLedgerRow {
  id: string;
  date: string;
  timestamp: number;
  entryType: 'INVOICE' | 'PAYMENT' | 'QUOTATION';
  docNumber: string;
  referenceNo?: string;
  title: string;
  items?: InvoiceItem[];
  paymentMethod?: string;
  paymentNotes?: string;
  recordedBy?: string;
  debit: number; // Invoice billed amount
  credit: number; // Payment made
  discount?: number; // Settlement discount granted
  runningBalance: number;
  status?: string;
  solarCapacityKw?: number;
  invoiceId?: string;
}

export const CustomerStatementPrintView: React.FC<CustomerStatementPrintViewProps> = ({
  customer,
  invoices,
  settings,
  onBack,
}) => {
  const printContainerRef = useRef<HTMLDivElement>(null);
  const [viewMode, setViewMode] = useState<'UNIFIED_DATE_WISE' | 'GROUPED'>('UNIFIED_DATE_WISE');
  const [expandProductDetails, setExpandProductDetails] = useState<boolean>(true);
  const [includeQuotations, setIncludeQuotations] = useState<boolean>(false);

  const customerInvoices = useMemo(() => {
    return invoices.filter((i) => 
      i.customerId === customer.id ||
      (customer.phone && i.customerPhone && phoneMatches(customer.phone, i.customerPhone)) ||
      (customer.name && i.customerName && nameMatches(customer.name, i.customerName))
    );
  }, [invoices, customer]);
  
  // Sort invoices chronologically
  const sortedInvoices = useMemo(() => {
    return [...customerInvoices].sort(
      (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
    );
  }, [customerInvoices]);

  // Commercial invoices (not quotations) represent billed obligations
  const actualInvoices = useMemo(() => {
    return sortedInvoices.filter((inv) => inv.type !== 'QUOTATION');
  }, [sortedInvoices]);

  const totalInvoiced = actualInvoices.length > 0
    ? actualInvoices.reduce((sum, inv) => sum + (Number(inv.grandTotal) || 0), 0)
    : (Number(customer.totalInvoiced) || 0);

  const totalPaid = actualInvoices.length > 0
    ? actualInvoices.reduce((sum, inv) => sum + (Number(inv.paidAmount) || 0), 0)
    : (Number(customer.totalPaid) || 0);

  const totalBalanceDue = actualInvoices.length > 0
    ? actualInvoices.reduce((sum, inv) => sum + (Number(inv.balanceDue) || 0), 0)
    : (Number(customer.balanceDue) || 0);

  // Extract all individual payment transactions strictly date-wise
  const allPayments = useMemo(() => {
    const list: Array<{
      id: string;
      date: string;
      amount: number;
      method: string;
      referenceNo?: string;
      notes?: string;
      recordedBy?: string;
      discount?: number;
      invoiceNumber: string;
      invoiceType: string;
      invoiceId: string;
    }> = [];

    sortedInvoices.forEach((inv) => {
      if (inv.payments && inv.payments.length > 0) {
        inv.payments.forEach((p, idx) => {
          list.push({
            id: p.id || `pay-${inv.id}-${idx}`,
            date: p.date || inv.date,
            amount: Number(p.amount) || 0,
            method: p.method,
            referenceNo: p.referenceNo || (p as any).referenceNumber,
            notes: p.notes,
            recordedBy: p.recordedBy || (p as any).receivedBy,
            discount: Number(p.discount) || 0,
            invoiceNumber: inv.invoiceNumber,
            invoiceType: inv.type,
            invoiceId: inv.id,
          });
        });
      } else if (inv.type !== 'QUOTATION' && (Number(inv.paidAmount) || 0) > 0) {
        list.push({
          id: `pay-direct-${inv.id}`,
          date: inv.date,
          amount: Number(inv.paidAmount) || 0,
          method: 'CASH',
          notes: 'Advance / settlement on invoice issuance',
          invoiceNumber: inv.invoiceNumber,
          invoiceType: inv.type,
          invoiceId: inv.id,
        });
      }
    });

    return list.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  }, [sortedInvoices]);

  // Build the complete Unified Chronological Date-Wise Ledger
  const unifiedLedgerEntries: UnifiedLedgerRow[] = useMemo(() => {
    const rawEntries: UnifiedLedgerRow[] = [];

    // 1. Invoices
    sortedInvoices.forEach((inv) => {
      const isQuote = inv.type === 'QUOTATION';
      if (!isQuote || includeQuotations) {
        rawEntries.push({
          id: `inv-${inv.id}`,
          date: inv.date,
          timestamp: new Date(inv.date || 0).getTime(),
          entryType: isQuote ? 'QUOTATION' : 'INVOICE',
          docNumber: inv.invoiceNumber,
          title: isQuote ? `Quotation Proposal #${inv.invoiceNumber}` : `Tax Invoice #${inv.invoiceNumber}`,
          items: inv.items || [],
          solarCapacityKw: inv.projectSystemCapacityKw || (inv as any).systemCapacityKw,
          debit: isQuote ? 0 : (Number(inv.grandTotal) || 0),
          credit: 0,
          status: inv.status,
          invoiceId: inv.id,
          runningBalance: 0,
        });
      }

      // 2. Payments recorded on this invoice
      if (inv.payments && inv.payments.length > 0) {
        inv.payments.forEach((p, pIdx) => {
          rawEntries.push({
            id: `pay-${inv.id}-${p.id || pIdx}`,
            date: p.date || inv.date,
            timestamp: new Date(p.date || inv.date || 0).getTime() + 1, // order after invoice on same date
            entryType: 'PAYMENT',
            docNumber: p.referenceNo ? `REC-${p.referenceNo}` : `REC-INV#${inv.invoiceNumber}`,
            referenceNo: p.referenceNo || (p as any).referenceNumber,
            title: `Payment Received (Agst #${inv.invoiceNumber})`,
            paymentMethod: p.method,
            paymentNotes: p.notes,
            recordedBy: p.recordedBy || (p as any).receivedBy,
            debit: 0,
            credit: Number(p.amount) || 0,
            discount: Number(p.discount) || 0,
            invoiceId: inv.id,
            runningBalance: 0,
          });
        });
      } else if (inv.type !== 'QUOTATION' && (Number(inv.paidAmount) || 0) > 0) {
        rawEntries.push({
          id: `pay-init-${inv.id}`,
          date: inv.date,
          timestamp: new Date(inv.date || 0).getTime() + 1,
          entryType: 'PAYMENT',
          docNumber: `REC-INV#${inv.invoiceNumber}`,
          title: `Payment Received on Invoice #${inv.invoiceNumber}`,
          paymentMethod: 'CASH',
          paymentNotes: 'Initial payment recorded on creation',
          debit: 0,
          credit: Number(inv.paidAmount) || 0,
          invoiceId: inv.id,
          runningBalance: 0,
        });
      }
    });

    // Sort strictly date-wise
    rawEntries.sort((a, b) => {
      if (a.timestamp !== b.timestamp) {
        return a.timestamp - b.timestamp;
      }
      // Same date: Invoices first, Payments second
      if (a.entryType === 'INVOICE' && b.entryType === 'PAYMENT') return -1;
      if (a.entryType === 'PAYMENT' && b.entryType === 'INVOICE') return 1;
      return 0;
    });

    // Compute Running Balance chronologically
    let balance = 0;
    rawEntries.forEach((entry) => {
      if (entry.entryType === 'INVOICE') {
        balance += entry.debit;
      } else if (entry.entryType === 'PAYMENT') {
        balance -= (entry.credit + (entry.discount || 0));
      }
      entry.runningBalance = balance;
    });

    return rawEntries;
  }, [sortedInvoices, includeQuotations]);

  const handlePrint = () => {
    window.print();
  };

  const handleShareWhatsApp = () => {
    let text = `*CUSTOMER ACCOUNT LEDGER & STATEMENT - ${settings.shopName}*\n\n` +
      `👤 *Client:* ${customer.name}\n`;
    if (customer.installedCapacityKw) {
      text += `⚡ *Solar System:* ${customer.installedCapacityKw} kW (${(customer.systemType || 'Solar PV').replace(/_/g, ' ')})\n`;
    }
    text += `📊 *Total Billed:* ${formatCurrency(totalInvoiced, settings.currency, settings.currencyPosition)}\n` +
      `✅ *Total Paid:* ${formatCurrency(totalPaid, settings.currency, settings.currencyPosition)}\n` +
      `🔴 *Net Balance Due:* ${formatCurrency(totalBalanceDue, settings.currency, settings.currencyPosition)}\n\n` +
      `━━━━━━━━━━━━━━━━━━━\n` +
      `*CHRONOLOGICAL LEDGER SUMMARY:*\n`;

    unifiedLedgerEntries.forEach((entry, idx) => {
      const dateStr = formatDate(entry.date);
      if (entry.entryType === 'INVOICE') {
        const itemNames = (entry.items || []).map(it => `${it.quantity}x ${it.description}`).slice(0, 3).join(', ');
        const extraCount = (entry.items || []).length > 3 ? ` (+${(entry.items || []).length - 3} more)` : '';
        text += `\n📄 *${dateStr}* - Inv #${entry.docNumber} (+${formatCurrency(entry.debit, settings.currency, settings.currencyPosition)})\n`;
        if (itemNames) {
          text += `   📦 Products: ${itemNames}${extraCount}\n`;
        }
        text += `   ⚖️ Balance: ${formatCurrency(entry.runningBalance, settings.currency, settings.currencyPosition)}\n`;
      } else if (entry.entryType === 'PAYMENT') {
        text += `\n💰 *${dateStr}* - Payment Recv (-${formatCurrency(entry.credit, settings.currency, settings.currencyPosition)})\n`;
        text += `   Via ${entry.paymentMethod?.replace(/_/g, ' ')}${entry.referenceNo ? ` • Ref: ${entry.referenceNo}` : ''}\n`;
        text += `   ⚖️ Balance: ${formatCurrency(entry.runningBalance, settings.currency, settings.currencyPosition)}\n`;
      }
    });

    if (settings.bankAccountNumber || settings.bankName) {
      text += `\n━━━━━━━━━━━━━━━━━━━\n*Bank Settlement Details:*\n` +
        (settings.bankName ? `Bank: ${settings.bankName}\n` : '') +
        (settings.bankAccountTitle ? `Title: ${settings.bankAccountTitle}\n` : '') +
        (settings.bankAccountNumber ? `A/C: ${settings.bankAccountNumber}\n` : '') +
        (settings.ibanOrSwift ? `IBAN: ${settings.ibanOrSwift}\n` : '');
    }

    text += `\n📞 ${settings.shopName}: ${settings.phone}`;
    
    openWhatsApp(customer.whatsapp || customer.phone || '', text);
  };

  return (
    <div className="space-y-4 text-xs">
      {/* Top Action & View Switcher Bar (Hidden in Print) */}
      <div className="no-print rounded-xl border border-slate-200 bg-white p-3.5 shadow-xs space-y-3">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <button
            type="button"
            onClick={onBack}
            className="flex items-center gap-1.5 text-xs font-semibold text-slate-700 bg-slate-50 border border-slate-200 px-3 py-1.5 rounded-lg hover:bg-slate-100 transition-colors cursor-pointer"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            <span>Back to Solar Clients</span>
          </button>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={handleShareWhatsApp}
              className="flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3.5 py-1.5 text-xs font-bold text-white hover:bg-emerald-700 shadow-xs transition-colors cursor-pointer"
              title="Send client full ledger breakdown with items and payments on WhatsApp"
            >
              <Share2 className="h-3.5 w-3.5" />
              <span>Share Ledger via WhatsApp</span>
            </button>

            <button
              type="button"
              onClick={handlePrint}
              className="flex items-center gap-1.5 rounded-lg bg-amber-400 px-4 py-1.5 text-xs font-bold text-slate-900 hover:bg-amber-500 shadow-xs transition-colors cursor-pointer"
              title="Print official customer statement or save as PDF"
            >
              <Printer className="h-3.5 w-3.5" />
              <span>Print / Save as PDF</span>
            </button>
          </div>
        </div>

        {/* View Mode & Product Detail Controls */}
        <div className="pt-2 border-t border-slate-100 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
              Ledger Presentation:
            </span>
            <div className="inline-flex rounded-lg bg-slate-100 p-0.5 border border-slate-200">
              <button
                type="button"
                onClick={() => setViewMode('UNIFIED_DATE_WISE')}
                className={`px-3 py-1 rounded-md text-xs font-bold transition-all cursor-pointer ${
                  viewMode === 'UNIFIED_DATE_WISE'
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                📅 Unified Date-Wise Ledger
              </button>
              <button
                type="button"
                onClick={() => setViewMode('GROUPED')}
                className={`px-3 py-1 rounded-md text-xs font-bold transition-all cursor-pointer ${
                  viewMode === 'GROUPED'
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                📂 Grouped (Invoices & Payments)
              </button>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <label className="flex items-center gap-1.5 cursor-pointer text-xs font-medium text-slate-700 select-none">
              <input
                type="checkbox"
                checked={expandProductDetails}
                onChange={(e) => setExpandProductDetails(e.target.checked)}
                className="rounded border-slate-300 text-amber-500 focus:ring-amber-400 h-3.5 w-3.5"
              />
              <span>Show Product Breakdown</span>
            </label>

            <label className="flex items-center gap-1.5 cursor-pointer text-xs font-medium text-slate-700 select-none">
              <input
                type="checkbox"
                checked={includeQuotations}
                onChange={(e) => setIncludeQuotations(e.target.checked)}
                className="rounded border-slate-300 text-amber-500 focus:ring-amber-400 h-3.5 w-3.5"
              />
              <span>Include Quotations</span>
            </label>
          </div>
        </div>
      </div>

      {/* Printable Customer Ledger Document */}
      <div
        ref={printContainerRef}
        className="mx-auto max-w-4xl rounded-lg border border-slate-200 bg-white p-6 sm:p-9 text-slate-900 shadow-sm printable-document"
        style={{ color: '#0f172a' }}
      >
        {/* Header Section */}
        <div className="flex flex-col sm:flex-row justify-between gap-4 border-b-2 border-slate-900 pb-5">
          {/* Company Brand */}
          <div className="space-y-1 max-w-md">
            <div className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-400 text-slate-950 font-bold shadow-xs">
                <Sun className="h-5 w-5" />
              </div>
              <div>
                <h1 className="text-lg font-black tracking-tight text-slate-900">
                  {settings.shopName}
                </h1>
                <p className="text-[10px] font-bold text-amber-700 uppercase tracking-wider">
                  {settings.tagline}
                </p>
              </div>
            </div>

            <div className="pt-1.5 text-xs text-slate-600 space-y-0.5">
              <p className="flex items-center gap-1">
                <MapPin className="h-3 w-3 text-slate-400 shrink-0" />
                <span>{settings.address}, {settings.city}</span>
              </p>
              <p className="flex items-center gap-1">
                <Phone className="h-3 w-3 text-slate-400 shrink-0" />
                <span>{settings.phone}</span>
                <span className="mx-1">•</span>
                <Mail className="h-3 w-3 text-slate-400 shrink-0" />
                <span>{settings.email}</span>
              </p>
              {settings.taxRegistrationNumber && (
                <p className="text-[10px] font-bold text-slate-700">
                  NTN / Tax ID: {settings.taxRegistrationNumber}
                </p>
              )}
            </div>
          </div>

          {/* Statement Document Meta */}
          <div className="sm:text-right space-y-1">
            <span className="inline-block rounded bg-amber-100 px-3 py-1 text-[11px] font-extrabold uppercase tracking-wider text-amber-950 border border-amber-300">
              CUSTOMER ACCOUNT & TRANSACTION LEDGER
            </span>
            <p className="text-xs font-mono font-bold text-slate-700 pt-1">
              Statement Date: {new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })}
            </p>
            <p className="text-[11px] text-slate-500">
              Account ID: <span className="font-mono font-bold text-slate-800">{customer.id.toUpperCase()}</span>
            </p>
          </div>
        </div>

        {/* Client & Solar Site Profile Banner */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 py-4 border-b border-slate-200">
          {/* Customer Details */}
          <div className="bg-slate-50 rounded-lg p-3.5 border border-slate-200 space-y-1.5">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
              Client & Billing Information
            </span>
            <h2 className="text-base font-bold text-slate-900">{customer.name}</h2>
            <div className="space-y-1 text-xs text-slate-700">
              <p className="flex items-center gap-1.5">
                <Phone className="h-3.5 w-3.5 text-slate-400" />
                <span className="font-semibold">{customer.phone}</span>
                {customer.whatsapp && (
                  <span className="text-[10px] text-emerald-700 font-medium bg-emerald-100/80 px-1.5 py-0.5 rounded">
                    WA: {customer.whatsapp}
                  </span>
                )}
              </p>
              {customer.email && (
                <p className="flex items-center gap-1.5 text-slate-600">
                  <Mail className="h-3.5 w-3.5 text-slate-400" />
                  <span>{customer.email}</span>
                </p>
              )}
              <p className="flex items-start gap-1.5 text-slate-700">
                <MapPin className="h-3.5 w-3.5 text-slate-400 mt-0.5 shrink-0" />
                <span>{customer.address ? `${customer.address}, ${customer.city}` : customer.city || 'Installation Site'}</span>
              </p>
              {customer.nationalIdOrTax && (
                <p className="text-[11px] text-slate-600 font-mono">
                  CNIC / NTN: {customer.nationalIdOrTax}
                </p>
              )}
            </div>
          </div>

          {/* Solar Plant Specifications */}
          <div className="bg-amber-50/60 rounded-lg p-3.5 border border-amber-200 space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold uppercase tracking-wider text-amber-900">
                Solar Power Plant Profile
              </span>
              <span className="text-[10px] font-semibold bg-amber-200/80 text-amber-950 px-2 py-0.5 rounded">
                {(customer.customerType || 'RESIDENTIAL').replace(/_/g, ' ')}
              </span>
            </div>

            <div className="space-y-1 text-xs text-slate-800">
              <div className="flex justify-between py-0.5 border-b border-amber-200/60">
                <span className="text-slate-600">Installed Capacity:</span>
                <span className="font-bold text-amber-800">
                  {customer.installedCapacityKw ? `${customer.installedCapacityKw} kW DC Array` : 'Custom Solar System'}
                </span>
              </div>
              <div className="flex justify-between py-0.5 border-b border-amber-200/60">
                <span className="text-slate-600">System Architecture:</span>
                <span className="font-semibold text-slate-800">
                  {customer.systemType ? customer.systemType.replace(/_/g, ' ') : 'Turnkey Setup'}
                </span>
              </div>
              <div className="flex justify-between py-0.5 border-b border-amber-200/60">
                <span className="text-slate-600">Inverter S/N:</span>
                <span className="font-mono font-medium text-slate-800">
                  {customer.inverterSerial || 'On Record / Commissioned'}
                </span>
              </div>
              {customer.consumerNumber && (
                <div className="flex justify-between py-0.5">
                  <span className="text-slate-600">Utility Consumer #:</span>
                  <span className="font-mono font-bold text-slate-900">
                    {customer.consumerNumber}
                  </span>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Account Financial Overview Cards */}
        <div className="grid grid-cols-3 gap-3 my-4">
          <div className="p-3 rounded-lg border border-slate-200 bg-white">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
              Lifetime Total Invoiced
            </span>
            <p className="mt-0.5 text-lg font-black text-slate-900">
              {formatCurrency(totalInvoiced, settings.currency, settings.currencyPosition)}
            </p>
            <p className="text-[10px] text-slate-500">{actualInvoices.length} Commercial Invoices</p>
          </div>

          <div className="p-3 rounded-lg border border-emerald-200 bg-emerald-50/50">
            <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-800">
              Total Amount Received
            </span>
            <p className="mt-0.5 text-lg font-black text-emerald-700">
              {formatCurrency(totalPaid, settings.currency, settings.currencyPosition)}
            </p>
            <p className="text-[10px] text-emerald-700">{allPayments.length} Payment Receipts Cleared</p>
          </div>

          <div className={`p-3 rounded-lg border ${totalBalanceDue > 0 ? 'border-rose-200 bg-rose-50/50' : 'border-slate-200 bg-white'}`}>
            <span className={`text-[10px] font-bold uppercase tracking-wider ${totalBalanceDue > 0 ? 'text-rose-700' : 'text-slate-500'}`}>
              Net Outstanding Balance
            </span>
            <p className={`mt-0.5 text-lg font-black ${totalBalanceDue > 0 ? 'text-rose-600' : 'text-emerald-600'}`}>
              {formatCurrency(totalBalanceDue, settings.currency, settings.currencyPosition)}
            </p>
            <p className="text-[10px] text-slate-500">
              {totalBalanceDue > 0 ? 'Pending Settlement' : 'All Dues Fully Cleared'}
            </p>
          </div>
        </div>

        {/* PRIMARY VIEW: UNIFIED CHRONOLOGICAL DATE-WISE LEDGER */}
        {viewMode === 'UNIFIED_DATE_WISE' ? (
          <div className="my-5 space-y-2">
            <div className="flex items-center justify-between pb-1.5 border-b-2 border-slate-900">
              <h3 className="font-extrabold text-slate-900 uppercase text-xs tracking-wider flex items-center gap-1.5">
                <FileSpreadsheet className="h-4 w-4 text-amber-600" />
                <span>Date-Wise Account Ledger (Invoices, Products & Payments)</span>
              </h3>
              <span className="text-[10px] text-slate-500 font-semibold">
                {unifiedLedgerEntries.length} Chronological Entries
              </span>
            </div>

            {unifiedLedgerEntries.length === 0 ? (
              <p className="text-center py-6 text-slate-400 text-xs italic">
                No invoices or payment transactions recorded for this client yet.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="bg-slate-100 text-[10px] font-bold text-slate-700 uppercase border-b border-slate-300">
                      <th className="py-2.5 px-2.5 w-24">Date</th>
                      <th className="py-2.5 px-2.5 w-32">Document / Ref</th>
                      <th className="py-2.5 px-2.5 w-20">Type</th>
                      <th className="py-2.5 px-2.5">Products of Invoice & Particulars</th>
                      <th className="py-2.5 px-2.5 text-right w-24">Billed (Debit)</th>
                      <th className="py-2.5 px-2.5 text-right w-24">Paid (Credit)</th>
                      <th className="py-2.5 px-2.5 text-right w-28">Balance Due</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {unifiedLedgerEntries.map((row) => {
                      const isInvoice = row.entryType === 'INVOICE';
                      const isPayment = row.entryType === 'PAYMENT';
                      const isQuote = row.entryType === 'QUOTATION';

                      return (
                        <tr
                          key={row.id}
                          className={`transition-colors ${
                            isPayment
                              ? 'bg-emerald-50/20 hover:bg-emerald-50/40'
                              : isQuote
                              ? 'bg-blue-50/20 hover:bg-blue-50/40'
                              : 'hover:bg-slate-50'
                          }`}
                        >
                          {/* Date */}
                          <td className="py-2.5 px-2.5 font-medium text-slate-800 align-top whitespace-nowrap">
                            {formatDate(row.date)}
                          </td>

                          {/* Document Number / Reference */}
                          <td className="py-2.5 px-2.5 font-mono align-top">
                            <span className="font-bold text-slate-900 block">
                              {row.docNumber}
                            </span>
                            {row.referenceNo && row.referenceNo !== row.docNumber && (
                              <span className="text-[10px] text-slate-500 block truncate">
                                Ref: {row.referenceNo}
                              </span>
                            )}
                          </td>

                          {/* Transaction Type Badge */}
                          <td className="py-2.5 px-2.5 align-top">
                            <span
                              className={`text-[9px] font-extrabold px-1.5 py-0.5 rounded uppercase tracking-wider block text-center ${
                                isPayment
                                  ? 'bg-emerald-100 text-emerald-900 border border-emerald-200'
                                  : isQuote
                                  ? 'bg-blue-100 text-blue-900 border border-blue-200'
                                  : 'bg-slate-100 text-slate-800 border border-slate-300'
                              }`}
                            >
                              {row.entryType}
                            </span>
                          </td>

                          {/* Products of Invoice & Payment Particulars */}
                          <td className="py-2.5 px-2.5 align-top">
                            {/* CASE A: INVOICE OR QUOTATION -> SHOW FULL PRODUCT BREAKDOWN */}
                            {(isInvoice || isQuote) && (
                              <div className="space-y-1">
                                {row.solarCapacityKw && (
                                  <div className="inline-flex items-center gap-1 text-[10px] font-bold text-amber-800 bg-amber-100/70 px-1.5 py-0.5 rounded border border-amber-200 mb-1">
                                    <Zap className="h-3 w-3" />
                                    <span>{row.solarCapacityKw} kW Solar Array Installation</span>
                                  </div>
                                )}

                                {row.items && row.items.length > 0 ? (
                                  expandProductDetails ? (
                                    <div className="space-y-1">
                                      {row.items.map((item, idx) => (
                                        <div
                                          key={item.id || idx}
                                          className="text-xs flex items-start justify-between gap-2 bg-slate-50/80 p-1.5 rounded border border-slate-200/60"
                                        >
                                          <div className="min-w-0">
                                            <p className="font-semibold text-slate-900">
                                              <span className="font-bold text-amber-700 mr-1">
                                                {item.quantity} {item.unit || 'Pcs'}
                                              </span>
                                              <span>{item.description}</span>
                                            </p>
                                            {(item.brand || item.specs || item.serialNumbers) && (
                                              <p className="text-[10px] text-slate-500 font-mono">
                                                {[
                                                  item.brand,
                                                  item.specs,
                                                  item.serialNumbers ? `S/N: ${item.serialNumbers}` : ''
                                                ].filter(Boolean).join(' • ')}
                                              </p>
                                            )}
                                          </div>
                                          <div className="text-right shrink-0 font-mono text-[11px]">
                                            <span className="text-slate-500 text-[10px]">
                                              @{formatCurrency(item.unitPrice, settings.currency, settings.currencyPosition)}
                                            </span>
                                            <p className="font-bold text-slate-900">
                                              {formatCurrency(item.total, settings.currency, settings.currencyPosition)}
                                            </p>
                                          </div>
                                        </div>
                                      ))}
                                    </div>
                                  ) : (
                                    <div className="text-xs text-slate-700">
                                      <p className="font-medium text-slate-800">
                                        {row.items.map(it => `${it.quantity} ${it.unit || 'x'} ${it.description}`).join(' • ')}
                                      </p>
                                    </div>
                                  )
                                ) : (
                                  <p className="text-slate-500 italic text-[11px]">
                                    General Balance Settlement / Services
                                  </p>
                                )}
                              </div>
                            )}

                            {/* CASE B: PAYMENT MADE DATE WISE */}
                            {isPayment && (
                              <div className="space-y-0.5 text-xs">
                                <div className="flex items-center gap-1.5 font-bold text-emerald-800">
                                  <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
                                  <span>Payment Received via {row.paymentMethod?.replace(/_/g, ' ') || 'Cash / Bank'}</span>
                                </div>
                                <div className="text-[11px] text-slate-600 flex flex-wrap gap-x-2">
                                  {row.referenceNo && <span>Cheque/Txn: <strong className="font-mono text-slate-800">{row.referenceNo}</strong></span>}
                                  {row.recordedBy && <span>Officer: {row.recordedBy}</span>}
                                  {row.discount && row.discount > 0 ? (
                                    <span className="text-amber-700 font-semibold">
                                      (Discount / Waiver: {formatCurrency(row.discount, settings.currency, settings.currencyPosition)})
                                    </span>
                                  ) : null}
                                </div>
                                {row.paymentNotes && (
                                  <p className="text-[10px] text-slate-500 italic">
                                    &ldquo;{row.paymentNotes}&rdquo;
                                  </p>
                                )}
                              </div>
                            )}
                          </td>

                          {/* Debit (Invoiced) */}
                          <td className="py-2.5 px-2.5 text-right font-mono font-bold align-top whitespace-nowrap">
                            {row.debit > 0 ? (
                              <span className="text-slate-900">
                                + {formatCurrency(row.debit, settings.currency, settings.currencyPosition)}
                              </span>
                            ) : (
                              <span className="text-slate-300 font-normal">—</span>
                            )}
                          </td>

                          {/* Credit (Payment Made) */}
                          <td className="py-2.5 px-2.5 text-right font-mono font-bold align-top whitespace-nowrap">
                            {row.credit > 0 ? (
                              <span className="text-emerald-700">
                                - {formatCurrency(row.credit, settings.currency, settings.currencyPosition)}
                              </span>
                            ) : (
                              <span className="text-slate-300 font-normal">—</span>
                            )}
                          </td>

                          {/* Running Balance Due */}
                          <td className="py-2.5 px-2.5 text-right font-mono font-black align-top whitespace-nowrap">
                            {isQuote ? (
                              <span className="text-slate-400 text-[11px] font-normal">— (Quote)</span>
                            ) : (
                              <span className={row.runningBalance > 0 ? 'text-rose-600' : 'text-emerald-600'}>
                                {formatCurrency(row.runningBalance, settings.currency, settings.currencyPosition)}
                              </span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot>
                    <tr className="bg-slate-100 font-black text-slate-900 border-t-2 border-slate-900">
                      <td colSpan={4} className="py-3 px-2.5 text-right uppercase text-[10px] tracking-wider">
                        Net Account Totals & Balance:
                      </td>
                      <td className="py-3 px-2.5 text-right font-mono text-slate-900">
                        {formatCurrency(totalInvoiced, settings.currency, settings.currencyPosition)}
                      </td>
                      <td className="py-3 px-2.5 text-right font-mono text-emerald-700">
                        {formatCurrency(totalPaid, settings.currency, settings.currencyPosition)}
                      </td>
                      <td className="py-3 px-2.5 text-right font-mono text-sm">
                        <span className={totalBalanceDue > 0 ? 'text-rose-600' : 'text-emerald-600'}>
                          {formatCurrency(totalBalanceDue, settings.currency, settings.currencyPosition)}
                        </span>
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </div>
        ) : (
          /* GROUPED VIEW: INVOICES WITH PRODUCTS + PAYMENTS SEPARATE */
          <div className="space-y-6">
            {/* Section 1: Invoices with Itemized Products */}
            <div className="my-5 space-y-2">
              <div className="flex items-center justify-between pb-1 border-b-2 border-slate-900">
                <h3 className="font-extrabold text-slate-900 uppercase text-xs tracking-wider flex items-center gap-1.5">
                  <FileSpreadsheet className="h-4 w-4 text-amber-600" />
                  <span>1. Invoices & Products Ledger</span>
                </h3>
                <span className="text-[10px] text-slate-500 font-semibold">
                  {sortedInvoices.length} Invoices
                </span>
              </div>

              {sortedInvoices.length === 0 ? (
                <p className="text-center py-4 text-slate-400 text-xs italic">
                  No invoices or quotations have been created for this client yet.
                </p>
              ) : (
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="bg-slate-100 text-[10px] font-bold text-slate-700 uppercase border-b border-slate-200">
                      <th className="py-2 px-2.5">Date</th>
                      <th className="py-2 px-2.5">Document #</th>
                      <th className="py-2 px-2.5">Products of Invoice</th>
                      <th className="py-2 px-2.5 text-right">Invoiced Amount</th>
                      <th className="py-2 px-2.5 text-right">Paid</th>
                      <th className="py-2 px-2.5 text-right">Balance Due</th>
                      <th className="py-2 px-2.5 text-center">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {sortedInvoices.map((inv) => (
                      <tr key={inv.id} className="hover:bg-slate-50">
                        <td className="py-2.5 px-2.5 font-medium text-slate-700 align-top whitespace-nowrap">
                          {formatDate(inv.date)}
                        </td>
                        <td className="py-2.5 px-2.5 font-mono font-bold text-slate-900 align-top">
                          {inv.invoiceNumber}
                          <span className={`block mt-1 text-[9px] font-semibold px-1.5 py-0.5 rounded text-center ${
                            inv.type === 'QUOTATION'
                              ? 'bg-blue-50 text-blue-800 border border-blue-200'
                              : 'text-slate-600 bg-slate-100'
                          }`}>
                            {inv.type === 'QUOTATION' ? 'Quotation (Est.)' : inv.type}
                          </span>
                        </td>
                        {/* Products of Invoice */}
                        <td className="py-2.5 px-2.5 align-top">
                          <div className="space-y-1">
                            {inv.items && inv.items.length > 0 ? (
                              inv.items.map((item, idx) => (
                                <div key={item.id || idx} className="text-xs flex items-center justify-between gap-2 border-b border-slate-100 pb-0.5 last:border-b-0">
                                  <span className="text-slate-800">
                                    <strong className="text-amber-800 mr-1">{item.quantity} {item.unit || 'x'}</strong>
                                    {item.description}
                                  </span>
                                  <span className="font-mono text-slate-500 text-[11px] shrink-0">
                                    {formatCurrency(item.total, settings.currency, settings.currencyPosition)}
                                  </span>
                                </div>
                              ))
                            ) : (
                              <span className="text-slate-400 italic">No item details</span>
                            )}
                          </div>
                        </td>
                        <td className="py-2.5 px-2.5 text-right font-bold text-slate-900 align-top">
                          {formatCurrency(inv.grandTotal, settings.currency, settings.currencyPosition)}
                        </td>
                        <td className="py-2.5 px-2.5 text-right font-medium text-emerald-700 align-top">
                          {inv.type === 'QUOTATION' ? '—' : formatCurrency(inv.paidAmount, settings.currency, settings.currencyPosition)}
                        </td>
                        <td className="py-2.5 px-2.5 text-right font-bold align-top">
                          {inv.type === 'QUOTATION' ? (
                            <span className="text-slate-400 font-normal text-[11px]">— (Quote)</span>
                          ) : (
                            <span className="text-rose-600">
                              {formatCurrency(inv.balanceDue, settings.currency, settings.currencyPosition)}
                            </span>
                          )}
                        </td>
                        <td className="py-2.5 px-2.5 text-center align-top">
                          <span className={`text-[9px] font-extrabold px-2 py-0.5 rounded uppercase tracking-wider ${
                            inv.type === 'QUOTATION'
                              ? 'bg-blue-100 text-blue-900'
                              : inv.status === 'PAID'
                              ? 'bg-emerald-100 text-emerald-900'
                              : inv.status === 'PARTIAL'
                              ? 'bg-amber-100 text-amber-900'
                              : 'bg-rose-100 text-rose-900'
                          }`}>
                            {inv.type === 'QUOTATION' ? 'PROPOSAL' : inv.status}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="bg-slate-100/80 font-black text-slate-900 border-t-2 border-slate-900">
                      <td colSpan={3} className="py-2 px-2.5 text-right uppercase text-[10px] tracking-wider">
                        Total Account Balance:
                      </td>
                      <td className="py-2 px-2.5 text-right">
                        {formatCurrency(totalInvoiced, settings.currency, settings.currencyPosition)}
                      </td>
                      <td className="py-2 px-2.5 text-right text-emerald-700">
                        {formatCurrency(totalPaid, settings.currency, settings.currencyPosition)}
                      </td>
                      <td className="py-2 px-2.5 text-right text-rose-600">
                        {formatCurrency(totalBalanceDue, settings.currency, settings.currencyPosition)}
                      </td>
                      <td className="py-2 px-2.5" />
                    </tr>
                  </tfoot>
                </table>
              )}
            </div>

            {/* Section 2: Detailed Payment Receipts Ledger (Date Wise) */}
            {allPayments.length > 0 && (
              <div className="my-5 space-y-2">
                <div className="flex items-center justify-between pb-1 border-b-2 border-slate-900">
                  <h3 className="font-extrabold text-slate-900 uppercase text-xs tracking-wider flex items-center gap-1.5">
                    <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                    <span>2. Payments Made (Date-Wise Receipts)</span>
                  </h3>
                  <span className="text-[10px] text-slate-500 font-semibold">
                    {allPayments.length} Transactions
                  </span>
                </div>

                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="bg-slate-100 text-[10px] font-bold text-slate-700 uppercase border-b border-slate-200">
                      <th className="py-2 px-2.5">Date</th>
                      <th className="py-2 px-2.5">Against Invoice</th>
                      <th className="py-2 px-2.5">Payment Method</th>
                      <th className="py-2 px-2.5">Reference / Cheque #</th>
                      <th className="py-2 px-2.5">Notes</th>
                      <th className="py-2 px-2.5 text-right">Amount Received</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {allPayments.map((p, idx) => (
                      <tr key={p.id || idx} className="hover:bg-slate-50">
                        <td className="py-2 px-2.5 font-medium text-slate-700">{formatDate(p.date)}</td>
                        <td className="py-2 px-2.5 font-mono font-bold text-slate-900">{p.invoiceNumber}</td>
                        <td className="py-2 px-2.5">
                          <span className="text-[10px] font-semibold text-slate-700 bg-slate-100 px-1.5 py-0.5 rounded">
                            {p.method.replace(/_/g, ' ')}
                          </span>
                        </td>
                        <td className="py-2 px-2.5 font-mono text-[11px] text-slate-600">
                          {p.referenceNo || '—'}
                        </td>
                        <td className="py-2 px-2.5 text-[11px] text-slate-600">
                          {p.notes || '—'}
                        </td>
                        <td className="py-2 px-2.5 text-right font-bold text-emerald-700">
                          + {formatCurrency(p.amount, settings.currency, settings.currencyPosition)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="bg-emerald-50/80 font-black text-emerald-950 border-t-2 border-emerald-800">
                      <td colSpan={5} className="py-2 px-2.5 text-right uppercase text-[10px] tracking-wider">
                        Total Collections Received:
                      </td>
                      <td className="py-2 px-2.5 text-right text-emerald-800 text-sm">
                        {formatCurrency(totalPaid, settings.currency, settings.currencyPosition)}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </div>
        )}

        {/* Bank & Payment Settlement Instructions */}
        {(settings.bankAccountNumber || settings.bankName || settings.bankDetails) && totalBalanceDue > 0 && (
          <div className="mt-5 p-3.5 rounded-lg border border-slate-200 bg-slate-50 space-y-1">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-600">
              Official Bank Settlement Account
            </span>
            <p className="text-xs text-slate-800 font-mono whitespace-pre-line leading-relaxed">
              {typeof settings.bankDetails === 'string'
                ? settings.bankDetails
                : [
                    settings.bankName ? `Bank: ${settings.bankName}` : '',
                    settings.bankAccountTitle ? `Title: ${settings.bankAccountTitle}` : '',
                    settings.bankAccountNumber ? `A/C: ${settings.bankAccountNumber}` : '',
                    settings.ibanOrSwift ? `IBAN: ${settings.ibanOrSwift}` : ''
                  ].filter(Boolean).join('\n')}
            </p>
          </div>
        )}

        {/* Signatures & Verification Footer */}
        <div className="mt-10 pt-6 border-t border-slate-300 grid grid-cols-2 gap-8 text-center text-xs">
          <div>
            <div className="h-10 border-b border-dashed border-slate-400 mx-auto w-48 mb-1" />
            <p className="font-bold text-slate-800">{customer.name}</p>
            <p className="text-[10px] text-slate-500">Client / Site Authorized Signatory</p>
          </div>

          <div>
            <div className="h-10 border-b border-dashed border-slate-400 mx-auto w-48 mb-1" />
            <p className="font-bold text-slate-800">{settings.shopName}</p>
            <p className="text-[10px] text-slate-500">Authorized Accounts & Solar Engineering Dept.</p>
          </div>
        </div>

        <div className="mt-6 text-center text-[10px] text-slate-400 pt-2 border-t border-slate-100">
          This document is a computerized account statement & customer record generated by {settings.shopName}.
        </div>
      </div>
    </div>
  );
};
