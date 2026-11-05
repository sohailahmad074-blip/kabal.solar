import React, { useState, useEffect, useMemo } from 'react';
import { 
  DollarSign, 
  CheckCircle2, 
  CreditCard, 
  Tag, 
  MessageSquare, 
  Send, 
  Percent, 
  Sparkles, 
  ShieldCheck, 
  ChevronDown, 
  Copy, 
  Check, 
  Layers, 
  ArrowDownRight, 
  Calendar, 
  Clock, 
  User, 
  FileText,
  HelpCircle
} from 'lucide-react';
import confetti from 'canvas-confetti';
import { Invoice, PaymentMethod, ShopSettings, PaymentReceiptMessageType, Customer } from '../../types/solar';
import { Modal } from '../common/Modal';
import { formatCurrency, formatDate } from '../../utils/formatters';
import { buildPaymentReceivedReceiptMessage, openWhatsApp, PaymentReceiptDetails } from '../../utils/sendDirect';
import { phoneMatches, nameMatches } from '../../utils/reconciliation';

interface RecordPaymentModalProps {
  isOpen: boolean;
  onClose: () => void;
  invoice: Invoice | null;
  customer?: Customer | null;
  invoices?: Invoice[];
  customers?: Customer[];
  settings: ShopSettings;
  onSavePayment: (
    invoiceId: string, 
    amount: number, 
    method: PaymentMethod, 
    referenceNo: string, 
    notes: string,
    discount?: number,
    options?: {
      applyMode?: 'FIFO_ALL_INVOICES' | 'SPECIFIC_INVOICE';
      customerId?: string;
    }
  ) => void;
}

export const RecordPaymentModal: React.FC<RecordPaymentModalProps> = ({
  isOpen,
  onClose,
  invoice,
  customer,
  invoices = [],
  customers = [],
  settings,
  onSavePayment,
}) => {
  if (!invoice) return null;

  // 1. Locate Authoritative Target Customer
  const targetCustomer = useMemo(() => {
    if (customer) return customer;
    if (!customers || customers.length === 0) return null;
    return (
      customers.find((c) => c.id === invoice.customerId) ||
      (invoice.customerPhone ? customers.find((c) => phoneMatches(c.phone || c.whatsapp, invoice.customerPhone)) : null) ||
      (invoice.customerName ? customers.find((c) => nameMatches(c.name, invoice.customerName)) : null) ||
      null
    );
  }, [customer, invoice, customers]);

  // 2. Locate all unpaid commercial invoices for this customer sorted chronologically (FIFO: oldest first)
  const customerUnpaidInvoicesFIFO = useMemo(() => {
    if (!invoices || invoices.length === 0) {
      return invoice.balanceDue > 0 ? [invoice] : [];
    }

    const filtered = invoices.filter((inv) => {
      if (inv.type === 'QUOTATION') return false;
      if (targetCustomer) {
        return (
          inv.customerId === targetCustomer.id ||
          (inv.customerPhone && (targetCustomer.phone || targetCustomer.whatsapp) && phoneMatches(targetCustomer.phone || targetCustomer.whatsapp, inv.customerPhone)) ||
          (inv.customerName && targetCustomer.name && nameMatches(targetCustomer.name, inv.customerName))
        );
      }
      return (
        inv.customerId === invoice.customerId ||
        (inv.customerPhone && invoice.customerPhone && phoneMatches(inv.customerPhone, invoice.customerPhone)) ||
        (inv.customerName && invoice.customerName && nameMatches(inv.customerName, invoice.customerName))
      );
    });

    const unpaid = filtered.filter((inv) => (Number(inv.balanceDue) || 0) > 0);

    // If target invoice isn't in list for any reason, ensure it is included
    if (invoice.balanceDue > 0 && !unpaid.some((inv) => inv.id === invoice.id)) {
      unpaid.push(invoice);
    }

    // Sort chronologically ascending (oldest invoice date first)
    return unpaid.sort((a, b) => {
      const timeA = new Date(a.date || a.createdAt || 0).getTime();
      const timeB = new Date(b.date || b.createdAt || 0).getTime();
      if (timeA !== timeB) return timeA - timeB;
      return (a.invoiceNumber || '').localeCompare(b.invoiceNumber || '');
    });
  }, [invoices, targetCustomer, invoice]);

  // 3. Customer Total Outstanding Balance
  const customerTotalBalance = useMemo(() => {
    if (customerUnpaidInvoicesFIFO.length > 0) {
      return Math.round(customerUnpaidInvoicesFIFO.reduce((sum, inv) => sum + (Number(inv.balanceDue) || 0), 0) * 100) / 100;
    }
    if (targetCustomer && typeof targetCustomer.balanceDue === 'number' && targetCustomer.balanceDue > 0) {
      return targetCustomer.balanceDue;
    }
    return invoice.balanceDue || 0;
  }, [customerUnpaidInvoicesFIFO, targetCustomer, invoice]);

  const hasMultipleInvoices = customerUnpaidInvoicesFIFO.length > 1;

  // Settlement Mode: Defaults to FIFO_ALL_INVOICES when multiple invoices exist or opened from customer list
  const [settlementMode, setSettlementMode] = useState<'FIFO_ALL_INVOICES' | 'SPECIFIC_INVOICE'>(
    customer || hasMultipleInvoices ? 'FIFO_ALL_INVOICES' : 'SPECIFIC_INVOICE'
  );

  const [amount, setAmount] = useState<number>(
    customer || hasMultipleInvoices ? customerTotalBalance : invoice.balanceDue
  );
  const [discount, setDiscount] = useState<number>(0);
  const [method, setMethod] = useState<PaymentMethod>('BANK_TRANSFER');
  const [referenceNo, setReferenceNo] = useState('');
  const [notes, setNotes] = useState('Payment collection & clearance');
  const [sendWhatsAppReceipt, setSendWhatsAppReceipt] = useState<boolean>(true);
  const [receiptType, setReceiptType] = useState<PaymentReceiptMessageType>('OFFICIAL_RECEIPT');
  const [showMessagePreview, setShowMessagePreview] = useState<boolean>(false);
  const [copiedReceipt, setCopiedReceipt] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Sync state whenever invoice, customer or isOpen changes
  useEffect(() => {
    if (isOpen) {
      const useFifo = Boolean(customer || customerUnpaidInvoicesFIFO.length > 1);
      setSettlementMode(useFifo ? 'FIFO_ALL_INVOICES' : 'SPECIFIC_INVOICE');
      const initialAmt = useFifo ? customerTotalBalance : invoice.balanceDue;
      setAmount(initialAmt);
      setDiscount(0);
      setMethod('BANK_TRANSFER');
      setReferenceNo('');
      setNotes(useFifo ? 'Customer balance FIFO clearance' : 'Invoice payment settlement');
      setReceiptType(initialAmt <= 0 ? 'FULL_SETTLEMENT' : 'OFFICIAL_RECEIPT');
      setErrorMessage(null);
    }
  }, [isOpen, invoice, customer, customerTotalBalance, customerUnpaidInvoicesFIFO.length]);

  // Handle switching settlement mode
  const handleSwitchSettlementMode = (mode: 'FIFO_ALL_INVOICES' | 'SPECIFIC_INVOICE') => {
    setSettlementMode(mode);
    setDiscount(0);
    if (mode === 'FIFO_ALL_INVOICES') {
      setAmount(customerTotalBalance);
      setNotes('Customer balance FIFO clearance');
    } else {
      setAmount(invoice.balanceDue);
      setNotes(`Payment settlement for Invoice ${invoice.invoiceNumber}`);
    }
  };

  // Active target balance
  const activeTargetBalance = settlementMode === 'FIFO_ALL_INVOICES' ? customerTotalBalance : invoice.balanceDue;
  const totalSettled = Number(((amount || 0) + (discount || 0)).toFixed(2));
  const remainingDue = Math.max(0, Number((activeTargetBalance - totalSettled).toFixed(2)));
  const isSettlingInFull = remainingDue === 0 && totalSettled > 0;

  // Auto-switch template to FULL_SETTLEMENT if cleared
  useEffect(() => {
    if (isSettlingInFull) {
      setReceiptType('FULL_SETTLEMENT');
    } else if (receiptType === 'FULL_SETTLEMENT') {
      setReceiptType('OFFICIAL_RECEIPT');
    }
  }, [isSettlingInFull]);

  // Live FIFO Allocation Plan
  const fifoAllocationPlan = useMemo(() => {
    let remPay = Math.max(0, amount || 0);
    let remDisc = Math.max(0, discount || 0);

    return customerUnpaidInvoicesFIFO.map((inv, index) => {
      const due = Number(inv.balanceDue) || 0;

      // Allocate settlement discount first
      const discAlloc = Math.min(remDisc, due);
      remDisc = Number((remDisc - discAlloc).toFixed(2));
      const dueAfterDisc = Number((due - discAlloc).toFixed(2));

      // Allocate cash payment
      const payAlloc = Math.min(remPay, dueAfterDisc);
      remPay = Number((remPay - payAlloc).toFixed(2));

      const totalDeducted = Number((discAlloc + payAlloc).toFixed(2));
      const newDue = Math.max(0, Number((due - totalDeducted).toFixed(2)));
      const isPaidInFull = newDue === 0 && totalDeducted > 0;
      const isPartial = newDue > 0 && totalDeducted > 0;

      const productSnippet = inv.items && inv.items.length > 0
        ? inv.items.map(it => `${it.quantity}x ${it.description}`).slice(0, 2).join(', ') + (inv.items.length > 2 ? ` +${inv.items.length - 2} more` : '')
        : 'Solar hardware & services';

      return {
        invoice: inv,
        order: index + 1,
        date: inv.date,
        invoiceNumber: inv.invoiceNumber,
        productSnippet,
        originalDue: due,
        discAlloc,
        payAlloc,
        totalDeducted,
        newDue,
        isPaidInFull,
        isPartial,
        isUnchanged: totalDeducted === 0,
      };
    });
  }, [customerUnpaidInvoicesFIFO, amount, discount]);

  // Quick discount helper
  const handleApplyQuickDiscount = (discVal: number) => {
    const validDisc = Math.min(activeTargetBalance, Math.max(0, discVal));
    setDiscount(validDisc);
    setAmount(Math.max(0, Number((activeTargetBalance - validDisc).toFixed(2))));
  };

  // Preview message with FIFO allocations
  const previewReceiptMessage = useMemo(() => {
    const fifoAllocations = settlementMode === 'FIFO_ALL_INVOICES'
      ? fifoAllocationPlan
          .filter(a => a.totalDeducted > 0)
          .map(a => ({
            invoiceNumber: a.invoiceNumber,
            allocatedAmount: a.totalDeducted,
            settledInFull: a.isPaidInFull,
          }))
      : undefined;

    const receiptDetails: PaymentReceiptDetails = {
      amount: amount || 0,
      discount: discount || 0,
      method,
      referenceNo,
      notes,
      customerTotalBalanceBefore: customerTotalBalance,
      customerTotalBalanceAfter: settlementMode === 'FIFO_ALL_INVOICES' ? remainingDue : undefined,
      fifoAllocations,
    };

    return buildPaymentReceivedReceiptMessage(
      {
        ...invoice,
        customerName: targetCustomer?.name || invoice.customerName,
        customerPhone: targetCustomer?.phone || invoice.customerPhone,
        paidAmount: invoice.paidAmount + (amount || 0),
        balanceDue: settlementMode === 'FIFO_ALL_INVOICES' ? remainingDue : Math.max(0, invoice.balanceDue - totalSettled),
      },
      receiptDetails,
      settings,
      receiptType
    );
  }, [
    invoice, 
    targetCustomer, 
    amount, 
    discount, 
    method, 
    referenceNo, 
    notes, 
    customerTotalBalance, 
    remainingDue, 
    settlementMode, 
    fifoAllocationPlan, 
    totalSettled, 
    settings, 
    receiptType
  ]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    if (amount <= 0 && discount <= 0) {
      setErrorMessage('Please enter a payment amount or a settlement discount.');
      return;
    }

    onSavePayment(
      invoice.id, 
      amount, 
      method, 
      referenceNo, 
      notes, 
      discount,
      {
        applyMode: settlementMode,
        customerId: targetCustomer?.id || invoice.customerId,
      }
    );

    if (isSettlingInFull) {
      try {
        confetti({
          particleCount: 65,
          spread: 70,
          origin: { y: 0.6 },
          colors: ['#10b981', '#f59e0b', '#3b82f6', '#fbbf24'],
        });
      } catch {
        // ignore
      }
    }

    // Auto-dispatch WhatsApp receipt if enabled
    const recipientPhone = targetCustomer?.phone || targetCustomer?.whatsapp || invoice.customerPhone;
    if (sendWhatsAppReceipt && recipientPhone) {
      openWhatsApp(recipientPhone, previewReceiptMessage);
    }

    onClose();
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={
        settlementMode === 'FIFO_ALL_INVOICES'
          ? "Receive Payment & Deduct Older Invoices First (FIFO)"
          : "Record Invoice Payment & Grant Discount"
      }
      subtitle={`Client: ${targetCustomer?.name || invoice.customerName} • Total Outstanding CRM Balance: ${formatCurrency(customerTotalBalance, settings.currency, settings.currencyPosition)}`}
      maxWidth="xl"
    >
      <form onSubmit={handleSubmit} className="space-y-4 text-xs">
        
        {/* SETTLEMENT SCOPE SELECTOR TABS */}
        <div className="rounded-xl border border-slate-200 bg-slate-100/80 p-1.5 flex flex-wrap gap-1.5 shadow-2xs">
          <button
            type="button"
            onClick={() => handleSwitchSettlementMode('FIFO_ALL_INVOICES')}
            className={`flex-1 min-w-[200px] flex items-center justify-center gap-2 py-2 px-3 rounded-lg font-bold text-xs transition-all cursor-pointer ${
              settlementMode === 'FIFO_ALL_INVOICES'
                ? 'bg-emerald-600 text-white shadow-xs'
                : 'bg-white text-slate-700 hover:bg-slate-50 border border-slate-200'
            }`}
          >
            <Sparkles className="h-4 w-4 text-amber-300" />
            <div className="text-left">
              <div className="leading-tight font-black flex items-center gap-1.5">
                <span>Customer Total Balance (FIFO Cascade)</span>
                {hasMultipleInvoices && (
                  <span className={`text-[9px] px-1.5 py-0.2 rounded font-mono ${settlementMode === 'FIFO_ALL_INVOICES' ? 'bg-emerald-800 text-emerald-100' : 'bg-slate-200 text-slate-700'}`}>
                    {customerUnpaidInvoicesFIFO.length} Invoices
                  </span>
                )}
              </div>
              <div className={`text-[10px] font-mono font-medium ${settlementMode === 'FIFO_ALL_INVOICES' ? 'text-emerald-100' : 'text-slate-500'}`}>
                Total Pending: {formatCurrency(customerTotalBalance, settings.currency, settings.currencyPosition)}
              </div>
            </div>
          </button>

          <button
            type="button"
            onClick={() => handleSwitchSettlementMode('SPECIFIC_INVOICE')}
            className={`flex-1 min-w-[200px] flex items-center justify-center gap-2 py-2 px-3 rounded-lg font-bold text-xs transition-all cursor-pointer ${
              settlementMode === 'SPECIFIC_INVOICE'
                ? 'bg-slate-900 text-white shadow-xs'
                : 'bg-white text-slate-700 hover:bg-slate-50 border border-slate-200'
            }`}
          >
            <FileText className="h-4 w-4 text-amber-400" />
            <div className="text-left">
              <div className="leading-tight font-black">
                Single Invoice Only ({invoice.invoiceNumber})
              </div>
              <div className={`text-[10px] font-mono font-medium ${settlementMode === 'SPECIFIC_INVOICE' ? 'text-slate-300' : 'text-slate-500'}`}>
                Invoice Due: {formatCurrency(invoice.balanceDue, settings.currency, settings.currencyPosition)}
              </div>
            </div>
          </button>
        </div>

        {/* ACTIVE BALANCE OVERVIEW CARD */}
        <div className="rounded-xl border border-slate-200 bg-gradient-to-r from-slate-50 to-emerald-50/40 p-3.5 space-y-2.5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1">
                <User className="h-3 w-3 text-slate-400" />
                Customer Account
              </span>
              <p className="font-bold text-sm text-slate-900">
                {targetCustomer?.name || invoice.customerName}
                {targetCustomer?.phone && (
                  <span className="ml-2 font-mono text-xs font-normal text-slate-500">
                    ({targetCustomer.phone})
                  </span>
                )}
              </p>
            </div>

            <div className="text-right">
              <span className="text-[10px] font-bold uppercase tracking-wider text-rose-700">
                {settlementMode === 'FIFO_ALL_INVOICES' ? 'Total CRM Pending Balance' : `Balance for ${invoice.invoiceNumber}`}
              </span>
              <p className="text-xl font-black text-rose-600 font-mono">
                {formatCurrency(activeTargetBalance, settings.currency, settings.currencyPosition)}
              </p>
            </div>
          </div>

          {/* Quick settlement action buttons */}
          <div className="flex flex-wrap items-center justify-between gap-1.5 pt-2 border-t border-slate-200/80">
            <span className="text-[10px] text-slate-600 font-medium flex items-center gap-1">
              <Clock className="h-3 w-3 text-amber-600" />
              {settlementMode === 'FIFO_ALL_INVOICES'
                ? `FIFO Mode: Payment will clear oldest invoices first until amount is exhausted.`
                : `Applying payment exclusively to Invoice #${invoice.invoiceNumber}.`}
            </span>

            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => {
                  setAmount(activeTargetBalance);
                  setDiscount(0);
                }}
                className="rounded bg-emerald-100 hover:bg-emerald-200 text-emerald-800 border border-emerald-300 px-2 py-0.5 text-[10px] font-bold transition-colors cursor-pointer"
              >
                Pay Full Balance ({formatCurrency(activeTargetBalance, settings.currency, settings.currencyPosition)})
              </button>
              {activeTargetBalance > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    setAmount(Math.round(activeTargetBalance / 2));
                    setDiscount(0);
                  }}
                  className="rounded bg-slate-100 hover:bg-slate-200 text-slate-700 px-2 py-0.5 text-[10px] font-bold transition-colors cursor-pointer"
                >
                  50% Half
                </button>
              )}
            </div>
          </div>
        </div>

        {/* PAYMENT AMOUNT & SETTLEMENT DISCOUNT INPUTS */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {/* Cash / Received Amount */}
          <div>
            <label className="text-[10px] font-bold uppercase tracking-wider text-slate-700 flex items-center justify-between">
              <span className="flex items-center gap-1">
                <DollarSign className="h-3 w-3 text-emerald-600" />
                Cash / Payment Received *
              </span>
              <span className="text-emerald-700 font-mono font-normal">Amount ({settings.currency})</span>
            </label>
            <div className="relative mt-1">
              <input
                type="number"
                step="any"
                min="0"
                value={amount}
                onChange={(e) => setAmount(parseFloat(e.target.value) || 0)}
                className="w-full rounded-lg border border-emerald-400 bg-white px-3 py-2 text-base font-black text-emerald-700 focus:border-emerald-600 focus:outline-none font-mono shadow-2xs"
                required
              />
            </div>
            <p className="mt-0.5 text-[10px] text-slate-500">
              Actual payment received from client (will deduct oldest invoice first)
            </p>
          </div>

          {/* Settlement Discount / Waiver */}
          <div>
            <label className="text-[10px] font-bold uppercase tracking-wider text-amber-800 flex items-center justify-between">
              <span className="flex items-center gap-1">
                <Tag className="h-3 w-3 text-amber-600" />
                Settlement Discount / Waiver
              </span>
              <span className="text-amber-700 font-mono font-normal">Waived ({settings.currency})</span>
            </label>
            <div className="relative mt-1">
              <input
                type="number"
                step="any"
                min="0"
                value={discount}
                onChange={(e) => setDiscount(parseFloat(e.target.value) || 0)}
                className="w-full rounded-lg border border-amber-300 bg-amber-50/50 px-3 py-2 text-base font-black text-amber-900 focus:border-amber-500 focus:outline-none font-mono shadow-2xs"
                placeholder="0"
              />
            </div>

            {/* Quick Discount Presets */}
            <div className="mt-1 flex flex-wrap items-center gap-1">
              <span className="text-[9px] text-slate-400">Quick:</span>
              <button
                type="button"
                onClick={() => handleApplyQuickDiscount(500)}
                className="rounded bg-slate-100 px-1.5 py-0.5 text-[9px] font-bold text-slate-700 hover:bg-amber-100 hover:text-amber-800 transition-colors cursor-pointer"
              >
                +500
              </button>
              <button
                type="button"
                onClick={() => handleApplyQuickDiscount(1000)}
                className="rounded bg-slate-100 px-1.5 py-0.5 text-[9px] font-bold text-slate-700 hover:bg-amber-100 hover:text-amber-800 transition-colors cursor-pointer"
              >
                +1,000
              </button>
              <button
                type="button"
                onClick={() => handleApplyQuickDiscount(2000)}
                className="rounded bg-slate-100 px-1.5 py-0.5 text-[9px] font-bold text-slate-700 hover:bg-amber-100 hover:text-amber-800 transition-colors cursor-pointer"
              >
                +2,000
              </button>
              <button
                type="button"
                onClick={() => handleApplyQuickDiscount(5000)}
                className="rounded bg-slate-100 px-1.5 py-0.5 text-[9px] font-bold text-slate-700 hover:bg-amber-100 hover:text-amber-800 transition-colors cursor-pointer"
              >
                +5,000
              </button>
              {activeTargetBalance > 0 && (
                <>
                  <button
                    type="button"
                    onClick={() => handleApplyQuickDiscount(Math.round(activeTargetBalance * 0.05))}
                    className="rounded bg-amber-50 border border-amber-200 px-1.5 py-0.5 text-[9px] font-bold text-amber-900 hover:bg-amber-100 transition-colors cursor-pointer"
                    title="Waive 5% of balance"
                  >
                    5%
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const remainder = activeTargetBalance % 1000;
                      if (remainder > 0) handleApplyQuickDiscount(remainder);
                      else handleApplyQuickDiscount(1000);
                    }}
                    className="rounded bg-amber-100 px-1.5 py-0.5 text-[9px] font-bold text-amber-900 hover:bg-amber-200 transition-colors cursor-pointer"
                    title="Waive odd change to make round figure"
                  >
                    Round Change
                  </button>
                </>
              )}
              {discount > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    setDiscount(0);
                    setAmount(activeTargetBalance);
                  }}
                  className="rounded bg-rose-50 border border-rose-200 px-1.5 py-0.5 text-[9px] font-bold text-rose-700 hover:bg-rose-100 transition-colors cursor-pointer"
                >
                  Reset
                </button>
              )}
            </div>
          </div>
        </div>

        {/* FIFO DEDUCTION BREAKDOWN PLAN TABLE (OLDEST INVOICE FIRST) */}
        {settlementMode === 'FIFO_ALL_INVOICES' && (
          <div className="rounded-xl border border-emerald-300 bg-emerald-50/40 p-3 space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-1">
              <div className="flex items-center gap-1.5 text-emerald-950 font-bold text-xs">
                <Layers className="h-4 w-4 text-emerald-700" />
                <span>FIFO Deduction Waterfall (Oldest Invoices Cleared First)</span>
              </div>
              <span className="text-[10px] text-emerald-800 font-mono">
                {fifoAllocationPlan.length} Pending Invoices Sorted Chronologically
              </span>
            </div>

            <div className="overflow-x-auto rounded-lg border border-emerald-200 bg-white">
              <table className="w-full text-left text-[11px] border-collapse">
                <thead className="bg-emerald-100/70 text-emerald-950 font-bold border-b border-emerald-200">
                  <tr>
                    <th className="py-1.5 px-2.5">Priority / Date</th>
                    <th className="py-1.5 px-2">Invoice # & Products Sold</th>
                    <th className="py-1.5 px-2 text-right">Original Due</th>
                    <th className="py-1.5 px-2 text-right">Deducted Now</th>
                    <th className="py-1.5 px-2 text-right">New Balance</th>
                    <th className="py-1.5 px-2.5 text-center">Outcome</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-emerald-100">
                  {fifoAllocationPlan.map((item) => (
                    <tr 
                      key={item.invoice.id}
                      className={
                        item.isPaidInFull
                          ? 'bg-emerald-50/60'
                          : item.isPartial
                          ? 'bg-amber-50/50'
                          : 'bg-white text-slate-400'
                      }
                    >
                      <td className="py-2 px-2.5 whitespace-nowrap">
                        <span className="inline-flex items-center gap-1 font-bold text-slate-800">
                          <span className={`px-1.5 py-0.2 rounded text-[10px] font-mono font-bold ${
                            item.order === 1 
                              ? 'bg-rose-100 text-rose-800 border border-rose-300' 
                              : 'bg-slate-100 text-slate-700'
                          }`}>
                            #{item.order} {item.order === 1 ? '(Oldest)' : ''}
                          </span>
                        </span>
                        <div className="text-[10px] text-slate-500 font-mono flex items-center gap-0.5 mt-0.5">
                          <Calendar className="h-2.5 w-2.5 text-slate-400" />
                          {formatDate(item.date)}
                        </div>
                      </td>

                      <td className="py-2 px-2 max-w-xs">
                        <div className="font-bold text-slate-900 font-mono flex items-center gap-1">
                          {item.invoiceNumber}
                        </div>
                        <div className="text-[10px] text-slate-500 truncate" title={item.productSnippet}>
                          {item.productSnippet}
                        </div>
                      </td>

                      <td className="py-2 px-2 text-right font-mono font-semibold text-slate-700 whitespace-nowrap">
                        {formatCurrency(item.originalDue, settings.currency, settings.currencyPosition)}
                      </td>

                      <td className="py-2 px-2 text-right font-mono font-black whitespace-nowrap">
                        {item.totalDeducted > 0 ? (
                          <span className="text-emerald-700 bg-emerald-100 px-1.5 py-0.5 rounded border border-emerald-300">
                            -{formatCurrency(item.totalDeducted, settings.currency, settings.currencyPosition)}
                          </span>
                        ) : (
                          <span className="text-slate-300">0.00</span>
                        )}
                      </td>

                      <td className="py-2 px-2 text-right font-mono font-black whitespace-nowrap">
                        {item.newDue === 0 ? (
                          <span className="text-emerald-700">0.00</span>
                        ) : (
                          <span className="text-rose-600">
                            {formatCurrency(item.newDue, settings.currency, settings.currencyPosition)}
                          </span>
                        )}
                      </td>

                      <td className="py-2 px-2.5 text-center whitespace-nowrap">
                        {item.isPaidInFull ? (
                          <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-800 bg-emerald-100 px-2 py-0.5 rounded-full border border-emerald-300">
                            <Check className="h-3 w-3 text-emerald-600" />
                            Paid in Full
                          </span>
                        ) : item.isPartial ? (
                          <span className="inline-flex items-center gap-1 text-[10px] font-bold text-amber-800 bg-amber-100 px-2 py-0.5 rounded-full border border-amber-300">
                            <Clock className="h-3 w-3 text-amber-600" />
                            Partially Paid
                          </span>
                        ) : (
                          <span className="text-[10px] text-slate-400 font-medium">
                            Pending
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* LIVE SETTLEMENT CALCULATION BAR */}
        <div className={`rounded-xl border p-3 transition-colors ${
          isSettlingInFull 
            ? 'bg-emerald-50 border-emerald-300' 
            : 'bg-slate-50 border-slate-200'
        }`}>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 text-center">
            <div>
              <span className="text-[9px] font-bold uppercase text-slate-500">Collected Cash</span>
              <p className="text-xs font-bold text-slate-800 font-mono">
                {formatCurrency(amount, settings.currency, settings.currencyPosition)}
              </p>
            </div>
            <div>
              <span className="text-[9px] font-bold uppercase text-amber-700">Discount Waived</span>
              <p className="text-xs font-bold text-amber-700 font-mono">
                +{formatCurrency(discount, settings.currency, settings.currencyPosition)}
              </p>
            </div>
            <div>
              <span className="text-[9px] font-bold uppercase text-slate-500">Total Deducted</span>
              <p className="text-xs font-bold text-slate-900 font-mono">
                ={formatCurrency(totalSettled, settings.currency, settings.currencyPosition)}
              </p>
            </div>
            <div>
              <span className="text-[9px] font-bold uppercase text-slate-500">
                {settlementMode === 'FIFO_ALL_INVOICES' ? 'Customer Balance After' : 'Invoice Balance After'}
              </span>
              <p className={`text-xs font-black font-mono ${isSettlingInFull ? 'text-emerald-700' : 'text-rose-600'}`}>
                {isSettlingInFull ? '✅ ZERO DUE (CLEARED)' : formatCurrency(remainingDue, settings.currency, settings.currencyPosition)}
              </p>
            </div>
          </div>
        </div>

        {/* PAYMENT METHOD & REFERENCE */}
        <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
          <div>
            <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
              Payment Method
            </label>
            <select
              value={method}
              onChange={(e) => setMethod(e.target.value as PaymentMethod)}
              className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-800 focus:border-amber-500 focus:outline-none"
            >
              <option value="BANK_TRANSFER">Bank Wire / Transfer</option>
              <option value="CASH">Cash in Hand</option>
              <option value="CHEQUE">Bank Cheque</option>
              <option value="CREDIT_CARD">Credit / Debit Card</option>
              <option value="ONLINE">Online Portal</option>
            </select>
          </div>

          <div>
            <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
              Reference / Trx ID
            </label>
            <input
              type="text"
              value={referenceNo}
              onChange={(e) => setReferenceNo(e.target.value)}
              placeholder="e.g. Wire Ref #889910"
              className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-900 focus:border-amber-500 focus:outline-none"
            />
          </div>
        </div>

        {/* NOTES */}
        <div>
          <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
            Payment Notes / Remarks
          </label>
          <input
            type="text"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="e.g. Client cleared milestone via online transfer"
            className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-900 focus:border-amber-500 focus:outline-none"
          />
        </div>

        {/* WHATSAPP RECEIPT DISPATCH SUITE */}
        <div className="rounded-xl border border-emerald-200 bg-emerald-50/50 p-3 space-y-2.5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <MessageSquare className="h-4 w-4 text-emerald-700" />
              <span className="font-bold text-emerald-950">WhatsApp Official Payment Receipt:</span>
            </div>

            <label className="flex items-center gap-1.5 cursor-pointer">
              <input
                type="checkbox"
                checked={sendWhatsAppReceipt}
                onChange={(e) => setSendWhatsAppReceipt(e.target.checked)}
                className="rounded border-emerald-300 text-emerald-600 focus:ring-emerald-500"
              />
              <span className="text-[11px] font-bold text-emerald-900">Send on WhatsApp</span>
            </label>
          </div>

          {sendWhatsAppReceipt && (
            <div className="space-y-2">
              {/* Select Message Type */}
              <div className="flex flex-wrap gap-1.5">
                <button
                  type="button"
                  onClick={() => setReceiptType('OFFICIAL_RECEIPT')}
                  className={`px-2.5 py-1 rounded text-[10px] font-bold transition-all cursor-pointer ${
                    receiptType === 'OFFICIAL_RECEIPT'
                      ? 'bg-emerald-700 text-white shadow-xs'
                      : 'bg-white text-emerald-900 border border-emerald-200 hover:bg-emerald-100'
                  }`}
                >
                  🧾 Official Receipt
                </button>
                <button
                  type="button"
                  onClick={() => setReceiptType('FULL_SETTLEMENT')}
                  className={`px-2.5 py-1 rounded text-[10px] font-bold transition-all cursor-pointer ${
                    receiptType === 'FULL_SETTLEMENT'
                      ? 'bg-emerald-700 text-white shadow-xs'
                      : 'bg-white text-emerald-900 border border-emerald-200 hover:bg-emerald-100'
                  }`}
                >
                  🏆 100% Full Settled
                </button>
                <button
                  type="button"
                  onClick={() => setReceiptType('MILESTONE_CONFIRMED')}
                  className={`px-2.5 py-1 rounded text-[10px] font-bold transition-all cursor-pointer ${
                    receiptType === 'MILESTONE_CONFIRMED'
                      ? 'bg-emerald-700 text-white shadow-xs'
                      : 'bg-white text-emerald-900 border border-emerald-200 hover:bg-emerald-100'
                  }`}
                >
                  ⚡ Milestone Confirmed
                </button>
                <button
                  type="button"
                  onClick={() => setReceiptType('URDU_RECEIPT')}
                  className={`px-2.5 py-1 rounded text-[10px] font-bold transition-all cursor-pointer ${
                    receiptType === 'URDU_RECEIPT'
                      ? 'bg-emerald-700 text-white shadow-xs'
                      : 'bg-white text-emerald-900 border border-emerald-200 hover:bg-emerald-100'
                  }`}
                >
                  🇵🇰 Urdu وصولی رسید
                </button>
                <button
                  type="button"
                  onClick={() => setReceiptType('SHORT_RECEIPT')}
                  className={`px-2.5 py-1 rounded text-[10px] font-bold transition-all cursor-pointer ${
                    receiptType === 'SHORT_RECEIPT'
                      ? 'bg-emerald-700 text-white shadow-xs'
                      : 'bg-white text-emerald-900 border border-emerald-200 hover:bg-emerald-100'
                  }`}
                >
                  📱 Short SMS Receipt
                </button>
              </div>

              {/* Collapsible Message Preview & Copy */}
              <div className="pt-1">
                <div className="flex items-center justify-between">
                  <button
                    type="button"
                    onClick={() => setShowMessagePreview(!showMessagePreview)}
                    className="text-[10px] font-bold text-emerald-800 hover:text-emerald-950 flex items-center gap-1 cursor-pointer"
                  >
                    <ChevronDown className={`h-3 w-3 transition-transform ${showMessagePreview ? 'rotate-180' : ''}`} />
                    <span>{showMessagePreview ? 'Hide Receipt Preview' : 'Show Receipt Preview'}</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      navigator.clipboard.writeText(previewReceiptMessage);
                      setCopiedReceipt(true);
                      setTimeout(() => setCopiedReceipt(false), 2000);
                    }}
                    className="flex items-center gap-1 text-[10px] font-bold text-emerald-800 bg-white border border-emerald-200 px-2 py-0.5 rounded hover:bg-emerald-100 transition-colors cursor-pointer"
                  >
                    {copiedReceipt ? (
                      <>
                        <Check className="h-3 w-3 text-emerald-600" />
                        <span className="text-emerald-700 font-bold">Copied!</span>
                      </>
                    ) : (
                      <>
                        <Copy className="h-3 w-3" />
                        <span>Copy Receipt</span>
                      </>
                    )}
                  </button>
                </div>

                {showMessagePreview && (
                  <pre className="mt-1.5 max-h-40 overflow-y-auto whitespace-pre-wrap rounded-lg bg-white p-2.5 text-[10px] text-slate-800 font-mono border border-emerald-200 shadow-2xs leading-relaxed">
                    {previewReceiptMessage}
                  </pre>
                )}
              </div>
            </div>
          )}
        </div>

        {errorMessage && (
          <div className="rounded-lg bg-rose-50 border border-rose-200 px-3 py-2 text-xs text-rose-700 font-medium">
            {errorMessage}
          </div>
        )}

        {/* ACTION BUTTONS */}
        <div className="flex items-center justify-between border-t border-slate-200 pt-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded border border-slate-200 bg-white px-3.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-colors cursor-pointer"
          >
            Cancel
          </button>
          
          <div className="flex items-center gap-2">
            <button
              type="submit"
              className="flex items-center gap-1.5 rounded-lg bg-emerald-600 px-4 py-2 text-xs font-bold text-white hover:bg-emerald-700 shadow-xs transition-colors cursor-pointer"
            >
              <CheckCircle2 className="h-4 w-4" />
              <span>
                {settlementMode === 'FIFO_ALL_INVOICES' 
                  ? 'Confirm & Deduct Older Invoices First' 
                  : 'Confirm & Record Payment'}
              </span>
              {sendWhatsAppReceipt && <Send className="h-3 w-3 ml-0.5" />}
            </button>
          </div>
        </div>
      </form>
    </Modal>
  );
};
