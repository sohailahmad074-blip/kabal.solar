import React, { useState, useMemo } from 'react';
import { 
  Plus, 
  Search, 
  ShoppingCart, 
  Truck, 
  Building2, 
  FileText, 
  Trash2, 
  Edit3, 
  Users, 
  AlertCircle, 
  X,
  DollarSign,
  CreditCard,
  CheckCircle2,
  Clock,
  History
} from 'lucide-react';
import { PurchaseOrder, Supplier, ShopSettings, ProductItem, SupplierPaymentRecord } from '../../types/solar';
import { Badge } from '../common/Badge';
import { formatCurrency, formatDate } from '../../utils/formatters';

interface PurchasingListProps {
  purchaseOrders: PurchaseOrder[];
  suppliers: Supplier[];
  products: ProductItem[];
  settings: ShopSettings;
  onOpenPOEditor: (po?: PurchaseOrder) => void;
  onOpenSupplierModal: (supplier?: Supplier) => void;
  onOpenSupplierPayment?: (supplier?: Supplier, po?: PurchaseOrder) => void;
  onReceivePO: (po: PurchaseOrder) => void;
  onDeletePO: (id: string) => void;
}

export const PurchasingList: React.FC<PurchasingListProps> = ({
  purchaseOrders,
  suppliers,
  settings,
  onOpenPOEditor,
  onOpenSupplierModal,
  onOpenSupplierPayment,
  onReceivePO,
  onDeletePO,
}) => {
  const [activeSubTab, setActiveSubTab] = useState<'ORDERS' | 'SUPPLIERS' | 'PAYMENTS'>('ORDERS');
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [paymentFilter, setPaymentFilter] = useState<string>('ALL');
  const [poToDelete, setPoToDelete] = useState<PurchaseOrder | null>(null);

  const filteredPOs = purchaseOrders.filter((po) => {
    const matchesSearch =
      po.poNumber.toLowerCase().includes(searchTerm.toLowerCase()) ||
      po.supplierName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (po.trackingNo && po.trackingNo.toLowerCase().includes(searchTerm.toLowerCase()));

    const matchesStatus = statusFilter === 'ALL' || po.status === statusFilter;
    const matchesPayment = paymentFilter === 'ALL' || (po.paymentStatus || 'UNPAID') === paymentFilter;
    return matchesSearch && matchesStatus && matchesPayment;
  });

  const filteredSuppliers = suppliers.filter((s) => {
    return (
      s.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      s.companyName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      s.city.toLowerCase().includes(searchTerm.toLowerCase())
    );
  });

  // Calculate live financial totals
  const totalPurchases = purchaseOrders.reduce((acc, po) => acc + (Number(po.grandTotal) || 0), 0);
  const totalPaidToSuppliers = purchaseOrders.reduce((acc, po) => acc + (Number(po.paidAmount) || 0), 0);
  
  // Total pending dues across POs & supplier ledgers
  const totalSupplierDues = useMemo(() => {
    const poDues = purchaseOrders.reduce((acc, po) => acc + (Number(po.balanceDue) || 0), 0);
    const supplierDues = suppliers.reduce((acc, s) => acc + (Number(s.totalOutstanding) || 0), 0);
    return Math.max(poDues, supplierDues);
  }, [purchaseOrders, suppliers]);

  const pendingOrders = purchaseOrders.filter((po) => po.status === 'ORDERED' || po.status === 'DRAFT').length;

  // Aggregate all logged supplier payments for Payment History tab
  const allSupplierPayments = useMemo(() => {
    const list: Array<{
      id: string;
      date: string;
      supplierName: string;
      poNumber?: string;
      amount: number;
      method: string;
      referenceNo?: string;
      notes?: string;
      recordedBy?: string;
    }> = [];

    // From PO payment histories
    purchaseOrders.forEach((po) => {
      (po.payments || []).forEach((p) => {
        list.push({
          id: p.id,
          date: p.date,
          supplierName: po.supplierName,
          poNumber: po.poNumber,
          amount: p.amount,
          method: p.method,
          referenceNo: p.referenceNo || p.referenceNumber,
          notes: p.notes,
          recordedBy: p.recordedBy || p.receivedBy,
        });
      });
    });

    // From Supplier direct payment ledgers
    suppliers.forEach((s) => {
      (s.payments || []).forEach((sp) => {
        // avoid duplicates if already captured via poId
        if (!list.some((existing) => existing.id === sp.id)) {
          list.push({
            id: sp.id,
            date: sp.date,
            supplierName: s.companyName || s.name,
            poNumber: sp.poNumber,
            amount: sp.amount,
            method: sp.method,
            referenceNo: sp.referenceNo,
            notes: sp.notes,
            recordedBy: sp.recordedBy,
          });
        }
      });
    });

    return list.sort((a, b) => new Date(b.date || 0).getTime() - new Date(a.date || 0).getTime());
  }, [purchaseOrders, suppliers]);

  const filteredPayments = allSupplierPayments.filter((p) => {
    return (
      p.supplierName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (p.poNumber && p.poNumber.toLowerCase().includes(searchTerm.toLowerCase())) ||
      (p.referenceNo && p.referenceNo.toLowerCase().includes(searchTerm.toLowerCase()))
    );
  });

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-lg font-bold tracking-tight text-slate-900 sm:text-xl flex items-center gap-2">
            Solar Equipment Purchasing & Suppliers
            {totalSupplierDues > 0 && (
              <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-rose-100 text-rose-800 border border-rose-200">
                Dues: {formatCurrency(totalSupplierDues, settings.currency, settings.currencyPosition)}
              </span>
            )}
          </h1>
          <p className="text-xs text-slate-500">
            Procure Tier-1 solar panels, inverters, LiFePO4 batteries, record vendor payments, and track distributor balances.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {onOpenSupplierPayment && (
            <button
              type="button"
              onClick={() => onOpenSupplierPayment()}
              className="flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-bold text-white shadow-xs hover:bg-emerald-700 transition-colors cursor-pointer"
            >
              <DollarSign className="h-3.5 w-3.5" />
              <span>+ Record Payment</span>
            </button>
          )}

          <button
            type="button"
            onClick={() => onOpenSupplierModal()}
            className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-colors cursor-pointer shadow-2xs"
          >
            <Users className="h-3.5 w-3.5 text-slate-500" />
            <span>+ Add Supplier</span>
          </button>

          <button
            type="button"
            onClick={() => onOpenPOEditor()}
            className="flex items-center gap-1.5 rounded-lg bg-amber-400 px-3 py-1.5 text-xs font-bold text-slate-900 shadow-xs hover:bg-amber-500 transition-colors cursor-pointer"
          >
            <Plus className="h-3.5 w-3.5" />
            <span>+ Purchase Order</span>
          </button>
        </div>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-xl border border-slate-200 bg-white p-3.5 shadow-xs">
          <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Total Procurement</p>
          <p className="mt-0.5 text-xl font-bold text-slate-900 font-mono">
            {formatCurrency(totalPurchases, settings.currency, settings.currencyPosition)}
          </p>
          <p className="text-[11px] text-slate-500 mt-0.5">{purchaseOrders.length} POs logged</p>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-3.5 shadow-xs">
          <p className="text-[10px] font-bold uppercase tracking-wider text-emerald-700">Total Paid to Vendors</p>
          <p className="mt-0.5 text-xl font-bold text-emerald-700 font-mono">
            {formatCurrency(totalPaidToSuppliers, settings.currency, settings.currencyPosition)}
          </p>
          <p className="text-[11px] text-slate-500 mt-0.5">Cleared via bank & cheques</p>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-3.5 shadow-xs">
          <div className="flex items-center justify-between">
            <p className="text-[10px] font-bold uppercase tracking-wider text-rose-700">Outstanding Supplier Dues</p>
            {onOpenSupplierPayment && totalSupplierDues > 0 && (
              <button
                type="button"
                onClick={() => onOpenSupplierPayment()}
                className="text-[10px] font-bold text-rose-700 bg-rose-100 hover:bg-rose-200 px-1.5 py-0.5 rounded cursor-pointer transition-colors"
              >
                Pay Now →
              </button>
            )}
          </div>
          <p className="mt-0.5 text-xl font-bold text-rose-600 font-mono">
            {formatCurrency(totalSupplierDues, settings.currency, settings.currencyPosition)}
          </p>
          <p className="text-[11px] text-slate-500 mt-0.5">
            {totalSupplierDues === 0 ? 'All supplier dues cleared! 🎉' : 'Pending payable balances'}
          </p>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-3.5 shadow-xs">
          <p className="text-[10px] font-bold uppercase tracking-wider text-amber-700">Pending In-Transit</p>
          <p className="mt-0.5 text-xl font-bold text-amber-700">{pendingOrders} Orders</p>
          <p className="text-[11px] text-slate-500 mt-0.5">Awaiting warehouse delivery</p>
        </div>
      </div>

      {/* Sub tabs switcher */}
      <div className="flex border-b border-slate-200 gap-4 text-xs font-semibold">
        <button
          type="button"
          onClick={() => setActiveSubTab('ORDERS')}
          className={`pb-2 flex items-center gap-1.5 transition-colors border-b-2 cursor-pointer ${
            activeSubTab === 'ORDERS'
              ? 'border-amber-500 text-slate-900 font-bold'
              : 'border-transparent text-slate-500 hover:text-slate-700'
          }`}
        >
          <ShoppingCart className="h-3.5 w-3.5" />
          <span>Purchase Orders ({purchaseOrders.length})</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveSubTab('SUPPLIERS')}
          className={`pb-2 flex items-center gap-1.5 transition-colors border-b-2 cursor-pointer ${
            activeSubTab === 'SUPPLIERS'
              ? 'border-amber-500 text-slate-900 font-bold'
              : 'border-transparent text-slate-500 hover:text-slate-700'
          }`}
        >
          <Building2 className="h-3.5 w-3.5" />
          <span>Supplier Directory ({suppliers.length})</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveSubTab('PAYMENTS')}
          className={`pb-2 flex items-center gap-1.5 transition-colors border-b-2 cursor-pointer ${
            activeSubTab === 'PAYMENTS'
              ? 'border-amber-500 text-slate-900 font-bold'
              : 'border-transparent text-slate-500 hover:text-slate-700'
          }`}
        >
          <History className="h-3.5 w-3.5" />
          <span>Payment History ({allSupplierPayments.length})</span>
        </button>
      </div>

      {/* Search and Filters Bar */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between rounded-xl border border-slate-200 bg-white p-2.5 shadow-xs">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder={
              activeSubTab === 'ORDERS'
                ? 'Search PO #, supplier, tracking #...'
                : activeSubTab === 'SUPPLIERS'
                ? 'Search vendor company, contact name, city...'
                : 'Search payment history by supplier, PO #, ref #...'
            }
            className="w-full rounded-lg border border-slate-200 bg-slate-50 pl-8 pr-3 py-1.5 text-xs text-slate-900 placeholder-slate-400 focus:bg-white focus:border-amber-500 focus:outline-none"
          />
        </div>

        {activeSubTab === 'ORDERS' && (
          <div className="flex items-center gap-2">
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-700 focus:border-amber-500 focus:outline-none cursor-pointer"
            >
              <option value="ALL">All Delivery Statuses</option>
              <option value="ORDERED">Ordered / In Transit</option>
              <option value="RECEIVED">Received & Stocked</option>
              <option value="DRAFT">Draft</option>
              <option value="CANCELLED">Cancelled</option>
            </select>

            <select
              value={paymentFilter}
              onChange={(e) => setPaymentFilter(e.target.value)}
              className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-700 focus:border-amber-500 focus:outline-none cursor-pointer"
            >
              <option value="ALL">All Payment Statuses</option>
              <option value="PAID">Paid in Full</option>
              <option value="PARTIAL">Partially Paid</option>
              <option value="UNPAID">Unpaid Dues</option>
            </select>
          </div>
        )}
      </div>

      {/* TAB 1: PURCHASE ORDERS LIST */}
      {activeSubTab === 'ORDERS' && (
        <div className="rounded-xl border border-slate-200 bg-white shadow-xs overflow-hidden">
          {filteredPOs.length === 0 ? (
            <div className="flex flex-col items-center justify-center p-10 text-center">
              <ShoppingCart className="h-10 w-10 text-slate-300 mb-2" />
              <p className="text-xs font-bold text-slate-700">No purchase orders found</p>
              <p className="text-[11px] text-slate-500 mt-0.5">Create your first equipment PO to receive hardware stock.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 sticky top-0 border-b border-slate-200 text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                  <tr>
                    <th className="py-2.5 px-3">PO # / Date</th>
                    <th className="py-2.5 px-3">Distributor / Supplier</th>
                    <th className="py-2.5 px-3">Items & Qty</th>
                    <th className="py-2.5 px-3 text-right">Order Cost & Dues</th>
                    <th className="py-2.5 px-3 text-center">Payment Status</th>
                    <th className="py-2.5 px-3 text-center">Order Status</th>
                    <th className="py-2.5 px-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredPOs.map((po) => {
                    const balanceDue = Number(po.balanceDue) || 0;
                    const isFullyPaid = balanceDue <= 0;
                    const paymentStatus = po.paymentStatus || (isFullyPaid ? 'PAID' : (po.paidAmount > 0 ? 'PARTIAL' : 'UNPAID'));

                    return (
                      <tr key={po.id} className="hover:bg-slate-50/80 transition-colors">
                        <td className="py-2.5 px-3">
                          <div className="flex items-center gap-1.5">
                            <FileText className="h-3.5 w-3.5 text-blue-500" />
                            <span className="font-bold text-slate-900">{po.poNumber}</span>
                          </div>
                          <span className="text-[10px] text-slate-400 block mt-0.5">
                            {formatDate(po.orderDate || po.date || '')}
                          </span>
                        </td>

                        <td className="py-2.5 px-3">
                          <p className="font-semibold text-slate-900">{po.supplierName}</p>
                          {po.trackingNo && (
                            <p className="text-[10px] text-slate-500 flex items-center gap-1 mt-0.5">
                              <Truck className="h-3 w-3 text-slate-400" />
                              <span>Trk: {po.trackingNo}</span>
                            </p>
                          )}
                        </td>

                        <td className="py-2.5 px-3">
                          <p className="font-medium text-slate-800 truncate max-w-[200px]">
                            {po.items[0]?.name || po.items[0]?.description || 'Hardware items'}
                          </p>
                          <p className="text-[10px] text-slate-400">
                            {po.items.length} line item(s) • Total Qty: {po.items.reduce((acc, i) => acc + i.quantity, 0)}
                          </p>
                        </td>

                        <td className="py-2.5 px-3 text-right">
                          <p className="font-bold text-slate-900 font-mono">
                            {formatCurrency(po.grandTotal, settings.currency, settings.currencyPosition)}
                          </p>
                          <div className="text-[10px] mt-0.5 flex items-center justify-end gap-1">
                            {balanceDue > 0 ? (
                              <span className="font-mono text-rose-600 font-bold">
                                Due: {formatCurrency(balanceDue, settings.currency, settings.currencyPosition)}
                              </span>
                            ) : (
                              <span className="text-emerald-600 font-medium">Cleared</span>
                            )}
                          </div>
                        </td>

                        <td className="py-2.5 px-3 text-center">
                          <span
                            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold ${
                              paymentStatus === 'PAID'
                                ? 'bg-emerald-100 text-emerald-800'
                                : paymentStatus === 'PARTIAL'
                                ? 'bg-amber-100 text-amber-800'
                                : 'bg-rose-100 text-rose-800'
                            }`}
                          >
                            {paymentStatus === 'PAID' ? 'PAID' : paymentStatus === 'PARTIAL' ? 'PARTIAL' : 'UNPAID'}
                          </span>
                        </td>

                        <td className="py-2.5 px-3 text-center">
                          <Badge status={po.status} size="sm" />
                        </td>

                        <td className="py-2.5 px-3 text-right">
                          <div className="flex items-center justify-end gap-1">
                            {onOpenSupplierPayment && balanceDue > 0 && (
                              <button
                                type="button"
                                onClick={() => {
                                  const targetSup = suppliers.find((s) => s.id === po.supplierId);
                                  onOpenSupplierPayment(targetSup, po);
                                }}
                                className="rounded-md px-2 py-1 text-[10px] font-bold text-emerald-800 bg-emerald-50 border border-emerald-300 hover:bg-emerald-100 transition-colors flex items-center gap-1 cursor-pointer"
                                title="Record payment for this purchase order"
                              >
                                <DollarSign className="h-3 w-3" />
                                <span>Pay</span>
                              </button>
                            )}

                            {po.status !== 'RECEIVED' && (
                              <button
                                type="button"
                                onClick={() => onReceivePO(po)}
                                className="rounded-md px-2 py-1 text-[10px] font-bold text-blue-700 bg-blue-50 border border-blue-200 hover:bg-blue-100 transition-colors cursor-pointer"
                                title="Mark as Received & Increase Inventory"
                              >
                                Receive
                              </button>
                            )}

                            <button
                              type="button"
                              onClick={() => onOpenPOEditor(po)}
                              className="rounded-md p-1 text-slate-500 hover:bg-slate-100 hover:text-slate-900 cursor-pointer"
                              title="Edit PO"
                            >
                              <Edit3 className="h-3.5 w-3.5" />
                            </button>

                            <button
                              type="button"
                              onClick={() => setPoToDelete(po)}
                              className="rounded-md p-1 text-rose-500 hover:bg-rose-50 cursor-pointer"
                              title="Delete PO"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* TAB 2: SUPPLIER DIRECTORY */}
      {activeSubTab === 'SUPPLIERS' && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {filteredSuppliers.map((sup) => {
            // Live dues calculated from POs or sup.totalOutstanding
            const pendingPOs = purchaseOrders.filter(
              (po) => po.supplierId === sup.id && (Number(po.balanceDue) || 0) > 0
            );
            const poDues = pendingPOs.reduce((sum, po) => sum + (Number(po.balanceDue) || 0), 0);
            const dues = Math.max(poDues, Number(sup.totalOutstanding) || 0);

            return (
              <div
                key={sup.id}
                className="rounded-xl border border-slate-200 bg-white p-4 shadow-xs space-y-3 hover:border-slate-300 transition-all flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-start justify-between">
                    <div>
                      <h3 className="font-bold text-slate-900 text-sm">{sup.companyName}</h3>
                      <p className="text-[11px] text-slate-600">Contact: {sup.name}</p>
                    </div>
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => onOpenSupplierModal(sup)}
                        className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 cursor-pointer"
                        title="Edit Supplier"
                      >
                        <Edit3 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>

                  <div className="mt-2 space-y-0.5 text-[11px] text-slate-600">
                    <p>📞 {sup.phone}</p>
                    {sup.email && <p>✉️ {sup.email}</p>}
                    <p>📍 {sup.city}{sup.country ? `, ${sup.country}` : ''}</p>
                  </div>

                  <div className="flex flex-wrap gap-1 pt-2 mt-2 border-t border-slate-100">
                    {(sup.categoriesSupplied || sup.suppliedCategories || []).map((cat) => (
                      <span key={cat} className="text-[9px] font-semibold bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded">
                        {(cat || '').replace(/_/g, ' ')}
                      </span>
                    ))}
                  </div>
                </div>

                {/* Financial Summary & Actions */}
                <div className="pt-2 border-t border-slate-100 space-y-2">
                  <div className="flex justify-between items-center text-xs">
                    <span className="text-slate-500 text-[10px]">Total Procured:</span>
                    <span className="font-bold text-slate-900 font-mono">
                      {formatCurrency(sup.totalPurchasedAmount ?? sup.totalPurchased ?? 0, settings.currency, settings.currencyPosition)}
                    </span>
                  </div>

                  <div className="flex justify-between items-center text-xs">
                    <span className="text-slate-500 text-[10px]">Balance Due / Payable:</span>
                    <span className={`font-mono font-bold ${dues > 0 ? 'text-rose-600' : 'text-emerald-600'}`}>
                      {formatCurrency(dues, settings.currency, settings.currencyPosition)}
                    </span>
                  </div>

                  {onOpenSupplierPayment && (
                    <button
                      type="button"
                      onClick={() => onOpenSupplierPayment(sup)}
                      className={`w-full mt-1.5 flex items-center justify-center gap-1.5 py-1.5 px-3 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                        dues > 0
                          ? 'bg-amber-400 text-slate-950 hover:bg-amber-500 shadow-2xs'
                          : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                      }`}
                    >
                      <DollarSign className="h-3.5 w-3.5" />
                      <span>{dues > 0 ? `Pay Supplier (${formatCurrency(dues, settings.currency, settings.currencyPosition)})` : 'Record Payment / Advance'}</span>
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* TAB 3: SUPPLIER PAYMENT HISTORY */}
      {activeSubTab === 'PAYMENTS' && (
        <div className="rounded-xl border border-slate-200 bg-white shadow-xs overflow-hidden">
          {filteredPayments.length === 0 ? (
            <div className="flex flex-col items-center justify-center p-10 text-center">
              <History className="h-10 w-10 text-slate-300 mb-2" />
              <p className="text-xs font-bold text-slate-700">No supplier payments recorded yet</p>
              <p className="text-[11px] text-slate-500 mt-0.5">
                Payments made to equipment suppliers and distributors will appear here.
              </p>
              {onOpenSupplierPayment && (
                <button
                  type="button"
                  onClick={() => onOpenSupplierPayment()}
                  className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-emerald-700 cursor-pointer"
                >
                  <DollarSign className="h-3.5 w-3.5" />
                  <span>Record First Payment</span>
                </button>
              )}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 sticky top-0 border-b border-slate-200 text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                  <tr>
                    <th className="py-2.5 px-3">Date</th>
                    <th className="py-2.5 px-3">Supplier / Distributor</th>
                    <th className="py-2.5 px-3">Reference / Order #</th>
                    <th className="py-2.5 px-3">Payment Method</th>
                    <th className="py-2.5 px-3">Notes & Details</th>
                    <th className="py-2.5 px-3 text-right">Amount Paid</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredPayments.map((p) => (
                    <tr key={p.id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="py-2.5 px-3 font-medium text-slate-900 whitespace-nowrap">
                        {formatDate(p.date)}
                      </td>
                      <td className="py-2.5 px-3 font-bold text-slate-900">
                        {p.supplierName}
                      </td>
                      <td className="py-2.5 px-3">
                        {p.poNumber ? (
                          <span className="inline-flex items-center gap-1 font-semibold text-blue-700 bg-blue-50 px-2 py-0.5 rounded text-[11px]">
                            <FileText className="h-3 w-3" />
                            {p.poNumber}
                          </span>
                        ) : p.referenceNo ? (
                          <span className="text-slate-700 font-mono text-[11px]">{p.referenceNo}</span>
                        ) : (
                          <span className="text-slate-400 italic">FIFO General Settlement</span>
                        )}
                      </td>
                      <td className="py-2.5 px-3 text-slate-700">
                        <span className="text-[11px] bg-slate-100 px-2 py-0.5 rounded font-medium">
                          {(p.method || 'BANK_TRANSFER').replace(/_/g, ' ')}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 text-slate-600 max-w-xs truncate">
                        {p.notes || '—'}
                      </td>
                      <td className="py-2.5 px-3 text-right font-extrabold text-emerald-700 font-mono text-sm whitespace-nowrap">
                        {formatCurrency(p.amount, settings.currency, settings.currencyPosition)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Delete PO Confirmation Modal */}
      {poToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-xs">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl border border-slate-200 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-start gap-4">
              <div className="rounded-full bg-rose-100 p-3 text-rose-600 shrink-0">
                <AlertCircle className="h-6 w-6" />
              </div>
              <div className="flex-1">
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-bold text-slate-900">
                    Delete PO #{poToDelete.poNumber}?
                  </h3>
                  <button
                    onClick={() => setPoToDelete(null)}
                    className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 cursor-pointer"
                  >
                    <X className="h-5 w-5" />
                  </button>
                </div>

                <div className="mt-3 rounded-xl bg-slate-50 border border-slate-200/80 p-3 text-xs space-y-1.5 text-slate-600">
                  <div className="flex justify-between">
                    <span className="text-slate-500">Supplier:</span>
                    <span className="font-semibold text-slate-800">{poToDelete.supplierName}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Order Date:</span>
                    <span>{formatDate(poToDelete.orderDate)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Total:</span>
                    <span className="font-bold text-slate-900 font-mono">
                      {formatCurrency(poToDelete.grandTotal, settings.currency, settings.currencyPosition)}
                    </span>
                  </div>
                </div>

                <p className="mt-3 text-xs text-rose-600 font-medium">
                  This purchase order will be permanently deleted.
                </p>

                <div className="mt-5 flex items-center justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setPoToDelete(null)}
                    className="rounded-lg border border-slate-300 bg-white px-3.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      onDeletePO(poToDelete.id);
                      setPoToDelete(null);
                    }}
                    className="rounded-lg bg-rose-600 px-4 py-1.5 text-xs font-bold text-white hover:bg-rose-700 cursor-pointer"
                  >
                    Delete PO
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
