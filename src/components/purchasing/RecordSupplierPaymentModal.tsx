import React, { useState, useEffect, useMemo } from 'react';
import { 
  X, 
  DollarSign, 
  Building2, 
  FileText, 
  Calendar, 
  CreditCard, 
  CheckCircle2, 
  AlertCircle,
  ArrowRight,
  Sparkles
} from 'lucide-react';
import { Supplier, PurchaseOrder, PaymentMethod, ShopSettings, SupplierPaymentRecord } from '../../types/solar';
import { formatCurrency, formatDate } from '../../utils/formatters';

interface RecordSupplierPaymentModalProps {
  isOpen: boolean;
  onClose: () => void;
  suppliers: Supplier[];
  purchaseOrders: PurchaseOrder[];
  settings: ShopSettings;
  initialSupplier?: Supplier | null;
  initialPO?: PurchaseOrder | null;
  onSavePayment: (
    payment: {
      supplierId: string;
      supplierName: string;
      poId?: string;
      poNumber?: string;
      amount: number;
      method: PaymentMethod;
      referenceNo: string;
      notes: string;
      date: string;
      applyFIFO: boolean;
    }
  ) => void;
}

export const RecordSupplierPaymentModal: React.FC<RecordSupplierPaymentModalProps> = ({
  isOpen,
  onClose,
  suppliers,
  purchaseOrders,
  settings,
  initialSupplier,
  initialPO,
  onSavePayment,
}) => {
  const [selectedSupplierId, setSelectedSupplierId] = useState<string>('');
  const [selectedPoId, setSelectedPoId] = useState<string>('');
  const [applyMode, setApplyMode] = useState<'FIFO' | 'SPECIFIC_PO'>('FIFO');
  const [amount, setAmount] = useState<string>('');
  const [method, setMethod] = useState<PaymentMethod>('BANK_TRANSFER');
  const [date, setDate] = useState<string>(() => new Date().toISOString().split('T')[0]);
  const [referenceNo, setReferenceNo] = useState<string>('');
  const [notes, setNotes] = useState<string>('');
  const [validationError, setValidationError] = useState<string | null>(null);

  // Initialize or reset when modal opens or initial props change
  useEffect(() => {
    if (isOpen) {
      const targetSupplier = initialSupplier || (initialPO ? suppliers.find(s => s.id === initialPO.supplierId) : null) || suppliers[0];
      const suppId = targetSupplier?.id || '';
      setSelectedSupplierId(suppId);

      if (initialPO) {
        setSelectedPoId(initialPO.id);
        setApplyMode('SPECIFIC_PO');
        setAmount(String(initialPO.balanceDue > 0 ? initialPO.balanceDue : initialPO.grandTotal));
        setReferenceNo(initialPO.poNumber ? `Payment for ${initialPO.poNumber}` : '');
      } else if (targetSupplier) {
        setSelectedPoId('');
        setApplyMode('FIFO');
        // Pre-fill with supplier's outstanding balance if > 0
        const outstanding = Number(targetSupplier.totalOutstanding) || 0;
        setAmount(outstanding > 0 ? String(outstanding) : '');
        setReferenceNo('');
      } else {
        setSelectedPoId('');
        setApplyMode('FIFO');
        setAmount('');
        setReferenceNo('');
      }

      setDate(new Date().toISOString().split('T')[0]);
      setMethod('BANK_TRANSFER');
      setNotes('');
      setValidationError(null);
    }
  }, [isOpen, initialSupplier, initialPO, suppliers]);

  const currentSupplier = useMemo(() => {
    return suppliers.find((s) => s.id === selectedSupplierId) || null;
  }, [suppliers, selectedSupplierId]);

  // Unpaid or partially paid POs for the selected supplier
  const supplierPOs = useMemo(() => {
    if (!selectedSupplierId) return [];
    return purchaseOrders.filter((po) => po.supplierId === selectedSupplierId);
  }, [purchaseOrders, selectedSupplierId]);

  const unpaidPOs = useMemo(() => {
    return supplierPOs
      .filter((po) => (Number(po.balanceDue) || 0) > 0)
      .sort((a, b) => {
        const timeA = new Date(a.orderDate || a.date || a.createdAt || 0).getTime();
        const timeB = new Date(b.orderDate || b.date || b.createdAt || 0).getTime();
        return timeA - timeB; // FIFO order
      });
  }, [supplierPOs]);

  // Calculate live supplier outstanding dues
  const liveSupplierDues = useMemo(() => {
    if (!currentSupplier) return 0;
    const poDues = unpaidPOs.reduce((sum, po) => sum + (Number(po.balanceDue) || 0), 0);
    return Math.max(poDues, Number(currentSupplier.totalOutstanding) || 0);
  }, [currentSupplier, unpaidPOs]);

  const targetPO = useMemo(() => {
    if (applyMode !== 'SPECIFIC_PO' || !selectedPoId) return null;
    return supplierPOs.find((po) => po.id === selectedPoId) || null;
  }, [applyMode, selectedPoId, supplierPOs]);

  // Handle supplier change
  const handleSupplierChange = (newSupId: string) => {
    setSelectedSupplierId(newSupId);
    setSelectedPoId('');
    const sup = suppliers.find((s) => s.id === newSupId);
    if (sup) {
      const pendingPOs = purchaseOrders.filter((po) => po.supplierId === newSupId && (Number(po.balanceDue) || 0) > 0);
      const dues = pendingPOs.reduce((acc, p) => acc + (Number(p.balanceDue) || 0), 0) || sup.totalOutstanding || 0;
      setAmount(dues > 0 ? String(dues) : '');
    }
  };

  const handleSelectPO = (po: PurchaseOrder) => {
    setSelectedPoId(po.id);
    setApplyMode('SPECIFIC_PO');
    setAmount(String(po.balanceDue > 0 ? po.balanceDue : po.grandTotal));
    setReferenceNo(`Ref: ${po.poNumber}`);
  };

  const handleQuickAmount = (val: number) => {
    setAmount(String(Math.max(0, Math.round(val * 100) / 100)));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setValidationError(null);

    if (!selectedSupplierId || !currentSupplier) {
      setValidationError('Please select a supplier.');
      return;
    }

    const payAmount = Number(amount);
    if (isNaN(payAmount) || payAmount <= 0) {
      setValidationError('Please enter a valid payment amount greater than zero.');
      return;
    }

    if (applyMode === 'SPECIFIC_PO' && !selectedPoId) {
      setValidationError('Please select a specific purchase order or switch to FIFO mode.');
      return;
    }

    onSavePayment({
      supplierId: currentSupplier.id,
      supplierName: currentSupplier.companyName || currentSupplier.name,
      poId: applyMode === 'SPECIFIC_PO' ? selectedPoId : undefined,
      poNumber: targetPO?.poNumber,
      amount: payAmount,
      method,
      referenceNo: referenceNo.trim(),
      notes: notes.trim(),
      date,
      applyFIFO: applyMode === 'FIFO',
    });

    onClose();
  };

  if (!isOpen) return null;

  const numAmount = Number(amount) || 0;
  const remainingDuesAfterPayment = Math.max(0, liveSupplierDues - numAmount);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs overflow-y-auto">
      <div className="w-full max-w-xl rounded-2xl bg-white shadow-2xl border border-slate-200 overflow-hidden animate-in fade-in zoom-in-95 duration-150 my-6">
        {/* Modal Header */}
        <div className="flex items-center justify-between bg-slate-900 px-6 py-4 text-white">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-400 text-slate-900 shadow-xs font-bold">
              <DollarSign className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                Record Supplier Payment
                <span className="text-[10px] font-semibold bg-amber-400/20 text-amber-300 border border-amber-400/30 px-2 py-0.5 rounded-full">
                  Equipment Procurement
                </span>
              </h2>
              <p className="text-xs text-slate-400">
                Pay solar panel, inverter, or battery distributors & clear procurement dues.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-800 hover:text-white transition-colors cursor-pointer"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Modal Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4 max-h-[80vh] overflow-y-auto">
          {validationError && (
            <div className="rounded-xl bg-rose-50 border border-rose-200 p-3 text-xs text-rose-700 flex items-center gap-2 font-medium">
              <AlertCircle className="h-4 w-4 shrink-0 text-rose-500" />
              <span>{validationError}</span>
            </div>
          )}

          {/* Supplier Selector */}
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">
              Select Supplier / Distributor <span className="text-rose-500">*</span>
            </label>
            <div className="relative">
              <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <select
                value={selectedSupplierId}
                onChange={(e) => handleSupplierChange(e.target.value)}
                className="w-full rounded-xl border border-slate-200 bg-white pl-9 pr-3 py-2 text-xs font-semibold text-slate-900 focus:border-amber-500 focus:outline-none shadow-2xs"
                required
              >
                {suppliers.length === 0 && <option value="">No suppliers registered</option>}
                {suppliers.map((sup) => (
                  <option key={sup.id} value={sup.id}>
                    {sup.companyName || sup.name} (Outstanding: {formatCurrency(sup.totalOutstanding || 0, settings.currency, settings.currencyPosition)})
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Supplier Live Financial Summary Banner */}
          {currentSupplier && (
            <div className="rounded-xl border border-slate-200 bg-gradient-to-r from-slate-50 to-amber-50/40 p-3 text-xs">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="font-bold text-slate-900">{currentSupplier.companyName || currentSupplier.name}</p>
                  <p className="text-[11px] text-slate-500">
                    Contact: {currentSupplier.contactPerson || currentSupplier.name} • 📞 {currentSupplier.phone}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Current Balance Due</p>
                  <p className="text-base font-extrabold text-rose-600 font-mono">
                    {formatCurrency(liveSupplierDues, settings.currency, settings.currencyPosition)}
                  </p>
                </div>
              </div>

              {/* Quick settlement buttons */}
              {liveSupplierDues > 0 && (
                <div className="mt-2.5 pt-2 border-t border-slate-200/80 flex flex-wrap items-center gap-1.5">
                  <span className="text-[10px] font-bold text-slate-500">Quick Fill:</span>
                  <button
                    type="button"
                    onClick={() => handleQuickAmount(liveSupplierDues)}
                    className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-800 hover:bg-amber-200 transition-colors cursor-pointer"
                  >
                    Full Balance ({formatCurrency(liveSupplierDues, settings.currency, settings.currencyPosition)})
                  </button>
                  <button
                    type="button"
                    onClick={() => handleQuickAmount(liveSupplierDues / 2)}
                    className="px-2 py-0.5 rounded text-[10px] font-medium bg-slate-100 text-slate-700 hover:bg-slate-200 transition-colors cursor-pointer"
                  >
                    50%
                  </button>
                  <button
                    type="button"
                    onClick={() => handleQuickAmount(liveSupplierDues * 0.25)}
                    className="px-2 py-0.5 rounded text-[10px] font-medium bg-slate-100 text-slate-700 hover:bg-slate-200 transition-colors cursor-pointer"
                  >
                    25%
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Allocation Mode: FIFO Auto-Deduction vs Specific Purchase Order */}
          <div className="space-y-2">
            <label className="block text-xs font-bold text-slate-700">
              Payment Allocation Mode
            </label>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <button
                type="button"
                onClick={() => setApplyMode('FIFO')}
                className={`p-2.5 rounded-xl border text-left transition-all cursor-pointer ${
                  applyMode === 'FIFO'
                    ? 'border-amber-500 bg-amber-50/70 text-slate-900 shadow-2xs font-bold'
                    : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                }`}
              >
                <div className="flex items-center gap-1.5 text-xs font-bold text-slate-900">
                  <Sparkles className="h-3.5 w-3.5 text-amber-600" />
                  <span>FIFO Auto-Deduct</span>
                </div>
                <p className="text-[10px] font-normal text-slate-500 mt-1 leading-snug">
                  Deducts from oldest unpaid purchase orders first, then clears newer orders.
                </p>
              </button>

              <button
                type="button"
                onClick={() => setApplyMode('SPECIFIC_PO')}
                className={`p-2.5 rounded-xl border text-left transition-all cursor-pointer ${
                  applyMode === 'SPECIFIC_PO'
                    ? 'border-amber-500 bg-amber-50/70 text-slate-900 shadow-2xs font-bold'
                    : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                }`}
              >
                <div className="flex items-center gap-1.5 text-xs font-bold text-slate-900">
                  <FileText className="h-3.5 w-3.5 text-blue-600" />
                  <span>Specific Purchase Order</span>
                </div>
                <p className="text-[10px] font-normal text-slate-500 mt-1 leading-snug">
                  Apply payment directly against a specific shipment / PO number.
                </p>
              </button>
            </div>
          </div>

          {/* Specific PO Selection if enabled */}
          {applyMode === 'SPECIFIC_PO' && (
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Select Purchase Order <span className="text-rose-500">*</span>
              </label>
              {supplierPOs.length === 0 ? (
                <div className="rounded-xl border border-dashed border-slate-200 p-3 text-center text-xs text-slate-500">
                  No purchase orders logged for this supplier yet.
                </div>
              ) : (
                <div className="space-y-1.5 max-h-40 overflow-y-auto rounded-xl border border-slate-200 p-1.5 bg-slate-50">
                  {supplierPOs.map((po) => {
                    const isSelected = selectedPoId === po.id;
                    const isFullyPaid = (Number(po.balanceDue) || 0) <= 0;
                    return (
                      <div
                        key={po.id}
                        onClick={() => handleSelectPO(po)}
                        className={`flex items-center justify-between p-2 rounded-lg cursor-pointer transition-all text-xs ${
                          isSelected
                            ? 'bg-amber-100/80 border border-amber-300 font-bold'
                            : 'bg-white hover:bg-slate-100 border border-slate-200/60'
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <FileText className={`h-4 w-4 ${isSelected ? 'text-amber-700' : 'text-slate-400'}`} />
                          <div>
                            <span className="font-bold text-slate-900">{po.poNumber}</span>
                            <span className="text-[10px] text-slate-500 ml-2">
                              {formatDate(po.orderDate || po.date || '')}
                            </span>
                          </div>
                        </div>

                        <div className="flex items-center gap-3">
                          <div className="text-right">
                            <span className="text-[10px] text-slate-400 block">
                              Total: {formatCurrency(po.grandTotal, settings.currency, settings.currencyPosition)}
                            </span>
                            <span className={`text-[11px] font-mono font-bold ${isFullyPaid ? 'text-emerald-600' : 'text-rose-600'}`}>
                              {isFullyPaid ? 'Paid in Full' : `Due: ${formatCurrency(po.balanceDue, settings.currency, settings.currencyPosition)}`}
                            </span>
                          </div>
                          {isSelected && <CheckCircle2 className="h-4 w-4 text-amber-600 shrink-0" />}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* Unpaid POs Preview under FIFO mode */}
          {applyMode === 'FIFO' && unpaidPOs.length > 0 && (
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs space-y-1.5">
              <div className="flex items-center justify-between text-[11px] font-bold text-slate-700">
                <span>Oldest Unpaid POs ({unpaidPOs.length})</span>
                <span className="text-amber-700 font-normal">Deductions apply in this order:</span>
              </div>
              <div className="space-y-1 max-h-28 overflow-y-auto pr-1">
                {unpaidPOs.map((po, index) => (
                  <div key={po.id} className="flex items-center justify-between text-[11px] bg-white p-1.5 rounded border border-slate-200/60">
                    <span className="text-slate-800 font-medium">
                      #{index + 1}. <strong className="font-bold">{po.poNumber}</strong> ({formatDate(po.orderDate || po.date || '')})
                    </span>
                    <span className="font-mono font-bold text-rose-600">
                      {formatCurrency(po.balanceDue, settings.currency, settings.currencyPosition)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Payment Amount & Payment Date */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Payment Amount <span className="text-rose-500">*</span>
              </label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 font-bold text-slate-400 text-xs">
                  {settings.currency}
                </span>
                <input
                  type="number"
                  step="any"
                  min="0.01"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="0.00"
                  className="w-full rounded-xl border border-slate-200 bg-white pl-8 pr-3 py-2 text-sm font-bold text-slate-900 focus:border-amber-500 focus:outline-none shadow-2xs font-mono"
                  required
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Payment Date <span className="text-rose-500">*</span>
              </label>
              <div className="relative">
                <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                <input
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 bg-white pl-9 pr-3 py-2 text-xs font-semibold text-slate-900 focus:border-amber-500 focus:outline-none shadow-2xs"
                  required
                />
              </div>
            </div>
          </div>

          {/* Payment Method & Reference */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Payment Method <span className="text-rose-500">*</span>
              </label>
              <div className="relative">
                <CreditCard className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                <select
                  value={method}
                  onChange={(e) => setMethod(e.target.value as PaymentMethod)}
                  className="w-full rounded-xl border border-slate-200 bg-white pl-9 pr-3 py-2 text-xs font-semibold text-slate-900 focus:border-amber-500 focus:outline-none shadow-2xs"
                  required
                >
                  <option value="BANK_TRANSFER">Bank Wire / Online Transfer</option>
                  <option value="CHEQUE">Bank Cheque / Pay Order</option>
                  <option value="CASH">Cash in Hand</option>
                  <option value="CREDIT_CARD">Credit / Debit Card</option>
                  <option value="ONLINE">Other Online Payment</option>
                </select>
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Cheque / Bank Reference #
              </label>
              <input
                type="text"
                value={referenceNo}
                onChange={(e) => setReferenceNo(e.target.value)}
                placeholder="e.g. Cheque # 889210 or Bank Wire Ref"
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-900 placeholder-slate-400 focus:border-amber-500 focus:outline-none shadow-2xs"
              />
            </div>
          </div>

          {/* Notes */}
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">
              Payment Remarks & Notes
            </label>
            <textarea
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="e.g. Paid for 20x 585W Longi panels & 12kW Deye inverter shipment."
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-900 placeholder-slate-400 focus:border-amber-500 focus:outline-none shadow-2xs resize-none"
            />
          </div>

          {/* Calculation impact review */}
          {numAmount > 0 && currentSupplier && (
            <div className="rounded-xl bg-slate-900 text-white p-3.5 text-xs space-y-1.5 shadow-md">
              <div className="flex items-center justify-between text-slate-300">
                <span>Previous Supplier Dues:</span>
                <span className="font-mono font-medium">
                  {formatCurrency(liveSupplierDues, settings.currency, settings.currencyPosition)}
                </span>
              </div>
              <div className="flex items-center justify-between text-amber-400 font-semibold">
                <span>Deduction / Payment Amount:</span>
                <span className="font-mono">
                  - {formatCurrency(numAmount, settings.currency, settings.currencyPosition)}
                </span>
              </div>
              <div className="border-t border-slate-800 pt-1.5 flex items-center justify-between text-sm font-extrabold text-white">
                <span>New Outstanding Balance:</span>
                <span className={`font-mono ${remainingDuesAfterPayment === 0 ? 'text-emerald-400' : 'text-amber-400'}`}>
                  {formatCurrency(remainingDuesAfterPayment, settings.currency, settings.currencyPosition)}
                  {remainingDuesAfterPayment === 0 && ' (Cleared! 🎉)'}
                </span>
              </div>
            </div>
          )}

          {/* Modal Actions */}
          <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-slate-200">
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="flex items-center gap-2 rounded-xl bg-amber-400 px-5 py-2 text-xs font-bold text-slate-950 shadow-sm hover:bg-amber-500 transition-all cursor-pointer"
            >
              <CheckCircle2 className="h-4 w-4" />
              <span>Confirm Supplier Payment</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
