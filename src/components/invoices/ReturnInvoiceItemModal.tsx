import React, { useState } from 'react';
import { 
  RotateCcw, 
  X, 
  Package, 
  CheckCircle2, 
  AlertTriangle,
  ArrowRight,
  Sparkles
} from 'lucide-react';
import { Invoice, InvoiceItem, ProductItem, ShopSettings } from '../../types/solar';
import { formatCurrency } from '../../utils/formatters';

interface ReturnInvoiceItemModalProps {
  isOpen: boolean;
  onClose: () => void;
  invoice: Invoice | null;
  products: ProductItem[];
  settings: ShopSettings;
  onConfirmReturn: (
    invoiceId: string,
    returns: Array<{
      itemId: string;
      productId?: string;
      description: string;
      returnQty: number;
      restockCostPrice: number;
      returnNotes: string;
    }>
  ) => void;
}

export const ReturnInvoiceItemModal: React.FC<ReturnInvoiceItemModalProps> = ({
  isOpen,
  onClose,
  invoice,
  products,
  settings,
  onConfirmReturn,
}) => {
  if (!isOpen || !invoice) return null;

  // Initialize return quantities and notes for each item in the invoice
  const [returnMap, setReturnMap] = useState<Record<string, { qty: number; notes: string }>>(() => {
    const map: Record<string, { qty: number; notes: string }> = {};
    invoice.items.forEach((item) => {
      map[item.id] = { qty: 0, notes: '' };
    });
    return map;
  });

  React.useEffect(() => {
    if (invoice && isOpen) {
      const map: Record<string, { qty: number; notes: string }> = {};
      invoice.items.forEach((item) => {
        map[item.id] = { qty: 0, notes: '' };
      });
      setReturnMap(map);
      setReturnError(null);
    }
  }, [invoice?.id, isOpen]);

  const [returnError, setReturnError] = useState<string | null>(null);

  // Helper to get matching product from catalog
  const getProduct = (item: InvoiceItem) => {
    if (item.productId) {
      const p = products.find((prod) => prod.id === item.productId);
      if (p) return p;
    }
    return products.find(
      (prod) => prod.name.trim().toLowerCase() === item.description.trim().toLowerCase()
    );
  };

  const handleQtyChange = (itemId: string, maxQty: number, value: number) => {
    const safeQty = Math.max(0, Math.min(maxQty, Number(value) || 0));
    setReturnMap((prev) => ({
      ...prev,
      [itemId]: {
        ...prev[itemId],
        qty: safeQty,
      },
    }));
    setReturnError(null);
  };

  const handleNotesChange = (itemId: string, notes: string) => {
    setReturnMap((prev) => ({
      ...prev,
      [itemId]: {
        ...prev[itemId],
        notes,
      },
    }));
  };

  // Quick fill return all available for an item
  const handleReturnAll = (itemId: string, maxQty: number) => {
    setReturnMap((prev) => ({
      ...prev,
      [itemId]: {
        ...prev[itemId],
        qty: maxQty,
      },
    }));
    setReturnError(null);
  };

  const totalItemsToReturn = Object.values(returnMap).reduce((sum, val) => sum + (val.qty || 0), 0);

  // Calculate refunded amount
  const totalRefundAmount = invoice.items.reduce((sum, item) => {
    const returnQty = returnMap[item.id]?.qty || 0;
    if (returnQty <= 0) return sum;
    const unitPriceAfterDiscount = item.quantity > 0 ? (item.total / item.quantity) : item.unitPrice;
    return sum + (returnQty * unitPriceAfterDiscount);
  }, 0);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setReturnError(null);

    const itemsToReturn = invoice.items
      .filter((item) => (returnMap[item.id]?.qty || 0) > 0)
      .map((item) => {
        const prod = getProduct(item);
        return {
          itemId: item.id,
          productId: prod?.id || item.productId,
          description: item.description,
          returnQty: returnMap[item.id].qty,
          restockCostPrice: prod?.costPrice || item.costPrice || 0,
          returnNotes: returnMap[item.id].notes.trim() || 'Customer Returned to Stock',
        };
      });

    if (itemsToReturn.length === 0) {
      setReturnError('Please enter a return quantity of at least 1 unit for at least one item.');
      return;
    }

    onConfirmReturn(invoice.id, itemsToReturn);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs overflow-y-auto">
      <div className="w-full max-w-2xl rounded-2xl bg-white shadow-2xl border border-slate-200 overflow-hidden animate-in fade-in zoom-in-95 duration-150 my-6">
        {/* Modal Header */}
        <div className="flex items-center justify-between bg-slate-900 px-6 py-4 text-white">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-400 text-slate-900 shadow-xs font-bold">
              <RotateCcw className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                Process Item Return & Restock
                <span className="text-[10px] font-mono bg-amber-400/20 text-amber-300 border border-amber-400/30 px-2 py-0.5 rounded-full">
                  #{invoice.invoiceNumber}
                </span>
              </h2>
              <p className="text-xs text-slate-400">
                Customer: <strong className="text-white">{invoice.customerName}</strong> • Restores returned items back into warehouse stock
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

        {/* Modal Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4 max-h-[75vh] overflow-y-auto">
          {returnError && (
            <div className="rounded-xl bg-rose-50 border border-rose-200 p-3 text-xs text-rose-700 flex items-center gap-2 font-medium">
              <AlertTriangle className="h-4 w-4 shrink-0 text-rose-500" />
              <span>{returnError}</span>
            </div>
          )}

          <div className="rounded-xl border border-amber-200 bg-amber-50/70 p-3.5 text-xs text-amber-950 flex items-start gap-2.5">
            <Package className="h-4 w-4 text-amber-700 shrink-0 mt-0.5" />
            <div>
              <p className="font-bold">Automated Warehouse Stock Restoration</p>
              <p className="text-[11px] text-amber-800 mt-0.5 leading-relaxed">
                When you process a return, the returned quantity is automatically added back to warehouse inventory stock, an audit stock movement (IN - Return) is recorded, and the invoice item quantity & total are updated accordingly.
              </p>
            </div>
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between text-xs font-bold text-slate-700 px-1">
              <span>Invoice Line Items</span>
              <span className="text-slate-500 font-normal">Select quantity to return & restock</span>
            </div>

            {invoice.items.map((item, idx) => {
              const matchedProduct = getProduct(item);
              const alreadyReturned = Number(item.returnedQty) || 0;
              const maxReturnable = Math.max(0, Number(item.quantity) || 0);
              const currentReturnQty = returnMap[item.id]?.qty || 0;
              const currentNotes = returnMap[item.id]?.notes || '';
              const unitPrice = item.quantity > 0 ? (item.total / item.quantity) : item.unitPrice;

              return (
                <div
                  key={item.id || idx}
                  className={`rounded-xl border p-3.5 transition-all text-xs space-y-2.5 ${
                    currentReturnQty > 0
                      ? 'border-amber-400 bg-amber-50/40 shadow-xs'
                      : 'border-slate-200 bg-white hover:border-slate-300'
                  }`}
                >
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-slate-900 text-sm">{item.description}</span>
                        {matchedProduct ? (
                          <span className="text-[9px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200 px-1.5 py-0.2 rounded">
                            📦 Restocks to SKU: {matchedProduct.code}
                          </span>
                        ) : (
                          <span className="text-[9px] font-bold bg-slate-100 text-slate-600 border border-slate-200 px-1.5 py-0.2 rounded">
                            Manual Item
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-slate-500 mt-0.5">
                        Invoiced Qty: <strong className="text-slate-700">{item.quantity} {item.unit}</strong> @ {formatCurrency(unitPrice, settings.currency, settings.currencyPosition)} each
                        {alreadyReturned > 0 && (
                          <span className="text-amber-700 font-semibold ml-2">
                            ({alreadyReturned} {item.unit} previously returned)
                          </span>
                        )}
                        {matchedProduct && (
                          <span className="text-slate-600 ml-2">
                            • Current Stock: <strong className="font-mono">{matchedProduct.stockQty} {matchedProduct.unit}</strong>
                          </span>
                        )}
                      </p>
                    </div>

                    {/* Return Qty Control */}
                    <div className="flex items-center gap-2 shrink-0">
                      <div className="flex items-center gap-1">
                        <label className="text-[10px] font-bold text-slate-500">Return Qty:</label>
                        <input
                          type="number"
                          step="any"
                          min="0"
                          max={maxReturnable}
                          value={currentReturnQty || ''}
                          placeholder="0"
                          onChange={(e) => handleQtyChange(item.id, maxReturnable, parseFloat(e.target.value) || 0)}
                          className="w-20 rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs font-bold text-slate-900 text-center focus:border-amber-500 focus:outline-none font-mono"
                        />
                        <span className="text-[11px] text-slate-500 font-medium">{item.unit}</span>
                      </div>

                      {maxReturnable > 0 && (
                        <button
                          type="button"
                          onClick={() => handleReturnAll(item.id, maxReturnable)}
                          className="px-2 py-1 text-[10px] font-bold text-amber-800 bg-amber-100 hover:bg-amber-200 rounded-md transition-colors cursor-pointer"
                          title="Return whole item quantity"
                        >
                          All ({maxReturnable})
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Return Notes when returning item */}
                  {currentReturnQty > 0 && (
                    <div className="pt-2 border-t border-slate-200/70 flex flex-col sm:flex-row sm:items-center gap-2">
                      <input
                        type="text"
                        value={currentNotes}
                        onChange={(e) => handleNotesChange(item.id, e.target.value)}
                        placeholder="Reason for return (e.g. Customer cancelled 2 panels, defective exchange, surplus)..."
                        className="flex-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs text-slate-800 placeholder-slate-400 focus:border-amber-500 focus:outline-none"
                      />
                      <span className="text-[11px] font-bold text-emerald-700 whitespace-nowrap font-mono">
                        Restocks: +{currentReturnQty} {item.unit}
                      </span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Return Impact Summary */}
          {totalItemsToReturn > 0 && (
            <div className="rounded-xl bg-slate-900 text-white p-4 text-xs space-y-2 shadow-md">
              <div className="flex items-center justify-between text-slate-300">
                <span>Items Being Returned to Warehouse:</span>
                <span className="font-mono font-bold text-amber-400 text-sm">
                  +{totalItemsToReturn} Units
                </span>
              </div>
              <div className="flex items-center justify-between text-slate-300">
                <span>Total Invoice Value Reduction / Refund:</span>
                <span className="font-mono font-bold text-white text-sm">
                  - {formatCurrency(totalRefundAmount, settings.currency, settings.currencyPosition)}
                </span>
              </div>
              <div className="border-t border-slate-800 pt-2 flex items-center justify-between text-xs text-slate-400">
                <span>Warehouse Inventory Impact:</span>
                <span className="text-emerald-400 font-semibold flex items-center gap-1">
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  Stock immediately restored & movement logged
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
              disabled={totalItemsToReturn === 0}
              className={`flex items-center gap-2 rounded-xl px-5 py-2 text-xs font-bold transition-all cursor-pointer shadow-sm ${
                totalItemsToReturn > 0
                  ? 'bg-amber-400 text-slate-950 hover:bg-amber-500'
                  : 'bg-slate-200 text-slate-400 cursor-not-allowed'
              }`}
            >
              <RotateCcw className="h-4 w-4" />
              <span>Confirm Return & Restock to Inventory</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
