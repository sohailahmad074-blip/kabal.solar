import React, { useState, useMemo } from 'react';
import {
  Package,
  Calendar,
  Users,
  Search,
  DollarSign,
  TrendingUp,
  FileText,
  Printer,
  Share2,
  Phone,
  MapPin,
  ExternalLink,
  ChevronDown,
  ChevronUp,
  Filter,
  ArrowUpDown,
  CheckCircle2,
  Clock,
  AlertCircle,
  X,
  MessageCircle,
  ShoppingBag
} from 'lucide-react';
import { ProductItem, Invoice, InvoiceItem, ShopSettings, UserRole } from '../../types/solar';
import { Modal } from '../common/Modal';
import { Badge } from '../common/Badge';
import { formatCurrency, formatDate } from '../../utils/formatters';
import { openWhatsApp, formatWhatsAppNumber } from '../../utils/sendDirect';

interface ProductSalesHistoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  product: ProductItem | null;
  invoices: Invoice[];
  settings: ShopSettings;
  onViewInvoice?: (invoice: Invoice) => void;
  currentRole?: UserRole;
}

export interface ProductSaleRecord {
  id: string;
  invoiceId: string;
  invoiceNumber: string;
  invoiceType: string;
  date: string;
  customerId?: string;
  customerName: string;
  customerPhone?: string;
  customerCity?: string;
  quantity: number;
  unit: string;
  unitPrice: number;
  discountPercent?: number;
  total: number;
  invoiceStatus: string;
  invoiceGrandTotal: number;
  invoicePaidAmount: number;
  invoiceBalanceDue: number;
  invoiceObj: Invoice;
}

export interface CustomerSalesSummary {
  customerId?: string;
  customerName: string;
  customerPhone?: string;
  customerCity?: string;
  totalQuantity: number;
  unit: string;
  totalAmount: number;
  invoicesCount: number;
  firstDate: string;
  lastDate: string;
  sales: ProductSaleRecord[];
}

export function isInvoiceItemMatch(item: InvoiceItem, product: ProductItem): boolean {
  if (!item || !product) return false;

  // Direct ID or SKU Code Match
  if (item.productId && (item.productId === product.id || item.productId === product.code)) {
    return true;
  }

  const itemDesc = (item.description || '').trim().toLowerCase();
  const prodName = (product.name || '').trim().toLowerCase();
  const prodCode = (product.code || '').trim().toLowerCase();
  const prodModel = (product.model || '').trim().toLowerCase();

  if (!itemDesc) return false;
  if (itemDesc === prodName) return true;
  if (prodCode && itemDesc.includes(prodCode)) return true;
  if (prodModel && prodModel.length > 3 && itemDesc.includes(prodModel)) return true;
  if (prodName.length > 5 && (itemDesc.includes(prodName) || prodName.includes(itemDesc))) return true;

  return false;
}

export const ProductSalesHistoryModal: React.FC<ProductSalesHistoryModalProps> = ({
  isOpen,
  onClose,
  product,
  invoices,
  settings,
  onViewInvoice,
  currentRole = 'OWNER',
}) => {
  const isPartner = currentRole === 'PARTNER';
  const [activeTab, setActiveTab] = useState<'DATE_WISE' | 'NAME_WISE'>('DATE_WISE');
  const [searchTerm, setSearchTerm] = useState('');
  const [dateFilter, setDateFilter] = useState<'ALL' | 'THIS_MONTH' | 'LAST_30_DAYS' | 'THIS_YEAR'>('ALL');
  const [sortOrder, setSortOrder] = useState<'DESC' | 'ASC'>('DESC');
  const [expandedCustomerNames, setExpandedCustomerNames] = useState<Record<string, boolean>>({});

  // 1. Extract all sales of this product across all invoices
  const allProductSales = useMemo(() => {
    if (!product) return [];

    const sales: ProductSaleRecord[] = [];

    invoices.forEach((inv) => {
      // Commercial invoices (exclude unconfirmed proposals by default or include all)
      if (!inv.items || inv.items.length === 0) return;

      inv.items.forEach((item, itemIdx) => {
        if (isInvoiceItemMatch(item, product)) {
          sales.push({
            id: `${inv.id}-${item.id || itemIdx}`,
            invoiceId: inv.id,
            invoiceNumber: inv.invoiceNumber,
            invoiceType: inv.type,
            date: inv.date,
            customerId: inv.customerId,
            customerName: inv.customerName || 'Walk-in Customer',
            customerPhone: inv.customerPhone,
            customerCity: inv.customerCity,
            quantity: Number(item.quantity) || 0,
            unit: item.unit || product.unit || 'Units',
            unitPrice: Number(item.unitPrice) || 0,
            discountPercent: Number(item.discountPercent) || 0,
            total: Number(item.total) || 0,
            invoiceStatus: inv.status,
            invoiceGrandTotal: Number(inv.grandTotal) || 0,
            invoicePaidAmount: Number(inv.paidAmount) || 0,
            invoiceBalanceDue: Number(inv.balanceDue) || 0,
            invoiceObj: inv,
          });
        }
      });
    });

    return sales;
  }, [product, invoices]);

  // 2. Apply filters (search & date)
  const filteredSales = useMemo(() => {
    let result = [...allProductSales];

    // Date range filter
    if (dateFilter !== 'ALL') {
      const now = new Date();
      result = result.filter((s) => {
        const saleDate = new Date(s.date);
        if (dateFilter === 'THIS_MONTH') {
          return saleDate.getFullYear() === now.getFullYear() && saleDate.getMonth() === now.getMonth();
        }
        if (dateFilter === 'LAST_30_DAYS') {
          const thirtyDaysAgo = new Date();
          thirtyDaysAgo.setDate(now.getDate() - 30);
          return saleDate >= thirtyDaysAgo;
        }
        if (dateFilter === 'THIS_YEAR') {
          return saleDate.getFullYear() === now.getFullYear();
        }
        return true;
      });
    }

    // Search term filter
    if (searchTerm.trim()) {
      const term = searchTerm.toLowerCase();
      result = result.filter(
        (s) =>
          s.customerName.toLowerCase().includes(term) ||
          s.invoiceNumber.toLowerCase().includes(term) ||
          (s.customerCity && s.customerCity.toLowerCase().includes(term)) ||
          (s.customerPhone && s.customerPhone.includes(term)) ||
          s.date.includes(term)
      );
    }

    // Sort order
    result.sort((a, b) => {
      const timeA = new Date(a.date).getTime();
      const timeB = new Date(b.date).getTime();
      return sortOrder === 'DESC' ? timeB - timeA : timeA - timeB;
    });

    return result;
  }, [allProductSales, searchTerm, dateFilter, sortOrder]);

  // 3. Name-Wise (Customer-Wise) Grouping
  const customerSalesGroups = useMemo(() => {
    const groupsMap: Record<string, CustomerSalesSummary> = {};

    filteredSales.forEach((sale) => {
      const key = (sale.customerId || sale.customerName).trim().toLowerCase();
      if (!groupsMap[key]) {
        groupsMap[key] = {
          customerId: sale.customerId,
          customerName: sale.customerName,
          customerPhone: sale.customerPhone,
          customerCity: sale.customerCity,
          totalQuantity: 0,
          unit: sale.unit,
          totalAmount: 0,
          invoicesCount: 0,
          firstDate: sale.date,
          lastDate: sale.date,
          sales: [],
        };
      }

      const g = groupsMap[key];
      g.totalQuantity += sale.quantity;
      g.totalAmount += sale.total;
      g.invoicesCount += 1;
      g.sales.push(sale);

      if (new Date(sale.date) < new Date(g.firstDate)) g.firstDate = sale.date;
      if (new Date(sale.date) > new Date(g.lastDate)) g.lastDate = sale.date;
    });

    // Sort name-wise groups by highest quantity or total spend
    return Object.values(groupsMap).sort((a, b) => b.totalQuantity - a.totalQuantity);
  }, [filteredSales]);

  // Overall statistics
  const totalSoldUnits = allProductSales.reduce((acc, s) => acc + s.quantity, 0);
  const totalRevenue = allProductSales.reduce((acc, s) => acc + s.total, 0);
  const filteredSoldUnits = filteredSales.reduce((acc, s) => acc + s.quantity, 0);
  const filteredRevenue = filteredSales.reduce((acc, s) => acc + s.total, 0);
  const uniqueCustomerCount = new Set(allProductSales.map((s) => s.customerId || s.customerName.toLowerCase())).size;
  const avgSellingPrice = totalSoldUnits > 0 ? totalRevenue / totalSoldUnits : (product?.sellingPrice || 0);

  const toggleCustomerExpand = (key: string) => {
    setExpandedCustomerNames((prev) => ({
      ...prev,
      [key]: !prev[key],
    }));
  };

  const handlePrint = () => {
    window.print();
  };

  const handleShareWhatsApp = () => {
    if (!product) return;

    let text = `*SOLAR EQUIPMENT SALES REPORT - ${settings.shopName}*\n\n` +
      `📦 *Product:* ${product.name}\n` +
      `🏷️ *SKU / Code:* ${product.code} (${product.brand})\n` +
      `🏢 *Warehouse Stock:* ${product.stockQty} ${product.unit}\n` +
      `📊 *Total Units Sold:* ${totalSoldUnits} ${product.unit}\n` +
      `💰 *Total Revenue Generated:* ${formatCurrency(totalRevenue, settings.currency, settings.currencyPosition)}\n` +
      `👥 *Total Unique Buyers:* ${uniqueCustomerCount} Clients\n\n` +
      `━━━━━━━━━━━━━━━━━━━\n` +
      `*TOP BUYERS (NAME-WISE):*\n`;

    customerSalesGroups.slice(0, 5).forEach((cust, i) => {
      text += `${i + 1}. *${cust.customerName}*: ${cust.totalQuantity} ${cust.unit} (${formatCurrency(cust.totalAmount, settings.currency, settings.currencyPosition)})\n`;
    });

    text += `\n📞 ${settings.shopName}: ${settings.phone}`;
    openWhatsApp(settings.phone || '', text);
  };

  if (!isOpen || !product) return null;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={`Sales Breakdown: ${product.name}`}
      subtitle={`Code: ${product.code} • Brand: ${product.brand} • In Stock: ${product.stockQty} ${product.unit}`}
      maxWidth="5xl"
    >
      <div className="space-y-4 text-xs">
        {/* Top Product Performance KPI Banner */}
        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
          <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-2xs">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1">
              <ShoppingBag className="h-3 w-3 text-amber-500" />
              Total Units Sold
            </span>
            <p className="mt-1 text-xl font-black text-slate-900 font-mono">
              {totalSoldUnits} <span className="text-xs font-semibold text-slate-500">{product.unit}</span>
            </p>
            <p className="text-[10px] text-slate-500 mt-0.5">
              Across {allProductSales.length} invoice line items
            </p>
          </div>

          <div className="rounded-xl border border-emerald-200 bg-emerald-50/50 p-3 shadow-2xs">
            <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-800 flex items-center gap-1">
              <TrendingUp className="h-3 w-3 text-emerald-600" />
              Total Sales Revenue
            </span>
            <p className="mt-1 text-xl font-black text-emerald-700 font-mono">
              {formatCurrency(totalRevenue, settings.currency, settings.currencyPosition)}
            </p>
            <p className="text-[10px] text-emerald-700 mt-0.5">
              Avg: {formatCurrency(avgSellingPrice, settings.currency, settings.currencyPosition)} / {product.unit}
            </p>
          </div>

          <div className="rounded-xl border border-blue-200 bg-blue-50/50 p-3 shadow-2xs">
            <span className="text-[10px] font-bold uppercase tracking-wider text-blue-800 flex items-center gap-1">
              <Users className="h-3 w-3 text-blue-600" />
              Unique Solar Clients
            </span>
            <p className="mt-1 text-xl font-black text-blue-900 font-mono">
              {uniqueCustomerCount} <span className="text-xs font-semibold text-blue-700">Buyers</span>
            </p>
            <p className="text-[10px] text-blue-600 mt-0.5">
              Distinct customer accounts
            </p>
          </div>

          <div className="rounded-xl border border-amber-200 bg-amber-50/50 p-3 shadow-2xs">
            <span className="text-[10px] font-bold uppercase tracking-wider text-amber-900 flex items-center gap-1">
              <Package className="h-3 w-3 text-amber-600" />
              Remaining Stock
            </span>
            <p className="mt-1 text-xl font-black text-amber-950 font-mono">
              {product.stockQty} <span className="text-xs font-semibold text-amber-800">{product.unit}</span>
            </p>
            <p className="text-[10px] text-amber-700 mt-0.5">
              Reorder threshold: {product.minStockAlert} {product.unit}
            </p>
          </div>
        </div>

        {/* View Switcher Tabs & Filter Bar */}
        <div className="rounded-xl border border-slate-200 bg-slate-50/80 p-2.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
          {/* Tab Selector: DATE-WISE vs NAME-WISE */}
          <div className="inline-flex rounded-lg bg-slate-200/70 p-0.5 border border-slate-300">
            <button
              type="button"
              onClick={() => setActiveTab('DATE_WISE')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-bold transition-all cursor-pointer ${
                activeTab === 'DATE_WISE'
                  ? 'bg-white text-slate-900 shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Calendar className="h-3.5 w-3.5 text-amber-500" />
              <span>📅 Date-Wise Sales Log ({filteredSales.length})</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('NAME_WISE')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-bold transition-all cursor-pointer ${
                activeTab === 'NAME_WISE'
                  ? 'bg-white text-slate-900 shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Users className="h-3.5 w-3.5 text-blue-500" />
              <span>👤 Name-Wise Clients ({customerSalesGroups.length})</span>
            </button>
          </div>

          {/* Quick Actions (Print / WhatsApp) */}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleShareWhatsApp}
              className="flex items-center gap-1 rounded bg-emerald-600 px-2.5 py-1 text-xs font-bold text-white hover:bg-emerald-700 shadow-2xs transition-colors cursor-pointer"
              title="Share item sales summary via WhatsApp"
            >
              <Share2 className="h-3 w-3" />
              <span>WhatsApp</span>
            </button>

            <button
              type="button"
              onClick={handlePrint}
              className="flex items-center gap-1 rounded border border-slate-300 bg-white px-2.5 py-1 text-xs font-bold text-slate-700 hover:bg-slate-100 shadow-2xs transition-colors cursor-pointer"
              title="Print item sales breakdown"
            >
              <Printer className="h-3 w-3 text-slate-500" />
              <span>Print</span>
            </button>
          </div>
        </div>

        {/* Filter Toolbar: Search, Date Filter, Sort */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          {/* Search Input */}
          <div className="relative flex-1">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search by customer name, phone, city, or invoice #..."
              className="w-full rounded-lg border border-slate-200 bg-white pl-8 pr-3 py-1.5 text-xs text-slate-900 placeholder-slate-400 focus:border-amber-500 focus:outline-none"
            />
            {searchTerm && (
              <button
                type="button"
                onClick={() => setSearchTerm('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
              >
                <X className="h-3 w-3" />
              </button>
            )}
          </div>

          <div className="flex items-center gap-2">
            {/* Date Range Selector */}
            <select
              value={dateFilter}
              onChange={(e) => setDateFilter(e.target.value as any)}
              className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 focus:border-amber-500 focus:outline-none cursor-pointer"
            >
              <option value="ALL">All Time</option>
              <option value="THIS_MONTH">This Month</option>
              <option value="LAST_30_DAYS">Last 30 Days</option>
              <option value="THIS_YEAR">This Year</option>
            </select>

            {/* Sort Order Toggle */}
            <button
              type="button"
              onClick={() => setSortOrder(sortOrder === 'DESC' ? 'ASC' : 'DESC')}
              className="flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-colors cursor-pointer"
              title="Toggle date sorting order"
            >
              <ArrowUpDown className="h-3 w-3 text-slate-500" />
              <span>{sortOrder === 'DESC' ? 'Newest First' : 'Oldest First'}</span>
            </button>
          </div>
        </div>

        {/* ========================================================================= */}
        {/* VIEW 1: DATE-WISE SALES TABLE                                             */}
        {/* ========================================================================= */}
        {activeTab === 'DATE_WISE' && (
          <div className="rounded-xl border border-slate-200 bg-white shadow-2xs overflow-hidden">
            {filteredSales.length === 0 ? (
              <div className="p-8 text-center text-slate-400 space-y-1">
                <Calendar className="h-8 w-8 mx-auto text-slate-300" />
                <p className="font-bold text-slate-700 text-xs">No sales recorded for this item</p>
                <p className="text-[11px] text-slate-500">
                  {searchTerm || dateFilter !== 'ALL'
                    ? 'No sales matched your search or date filter.'
                    : 'When this product is sold on an invoice, chronological records will appear here.'}
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto max-h-[420px]">
                <table className="w-full text-left text-xs border-collapse">
                  <thead className="bg-slate-100 text-[10px] font-bold text-slate-600 uppercase border-b border-slate-200 sticky top-0 z-10">
                    <tr>
                      <th className="py-2.5 px-3">Date</th>
                      <th className="py-2.5 px-3">To Whom Sold (Customer)</th>
                      <th className="py-2.5 px-3">Invoice #</th>
                      <th className="py-2.5 px-3 text-center">Quantity Sold</th>
                      <th className="py-2.5 px-3 text-right">Unit Rate</th>
                      <th className="py-2.5 px-3 text-right">Total Amount</th>
                      <th className="py-2.5 px-3 text-center">Invoice Status</th>
                      <th className="py-2.5 px-3 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredSales.map((sale) => (
                      <tr key={sale.id} className="hover:bg-slate-50/80 transition-colors">
                        {/* Date */}
                        <td className="py-2 px-3 font-medium text-slate-700 whitespace-nowrap align-top">
                          {formatDate(sale.date)}
                        </td>

                        {/* To Whom Sold */}
                        <td className="py-2 px-3 align-top">
                          <p className="font-bold text-slate-900 text-xs">{sale.customerName}</p>
                          <div className="flex items-center gap-2 text-[10px] text-slate-500 mt-0.5">
                            {sale.customerPhone && (
                              <span className="flex items-center gap-0.5">
                                <Phone className="h-2.5 w-2.5 text-slate-400" />
                                {sale.customerPhone}
                              </span>
                            )}
                            {sale.customerCity && (
                              <span className="flex items-center gap-0.5">
                                <MapPin className="h-2.5 w-2.5 text-slate-400" />
                                {sale.customerCity}
                              </span>
                            )}
                          </div>
                        </td>

                        {/* Invoice Number */}
                        <td className="py-2 px-3 font-mono font-bold text-slate-900 align-top whitespace-nowrap">
                          {sale.invoiceNumber}
                          <span className="block text-[9px] font-normal text-slate-500">
                            {sale.invoiceType}
                          </span>
                        </td>

                        {/* Quantity Sold */}
                        <td className="py-2 px-3 text-center align-top whitespace-nowrap">
                          <span className="font-bold text-amber-800 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded font-mono">
                            {sale.quantity} {sale.unit}
                          </span>
                        </td>

                        {/* Unit Rate */}
                        <td className="py-2 px-3 text-right font-mono text-slate-600 align-top whitespace-nowrap">
                          {formatCurrency(sale.unitPrice, settings.currency, settings.currencyPosition)}
                          {sale.discountPercent && sale.discountPercent > 0 ? (
                            <span className="block text-[9px] text-amber-700">
                              (-{sale.discountPercent}%)
                            </span>
                          ) : null}
                        </td>

                        {/* Total Amount */}
                        <td className="py-2 px-3 text-right font-mono font-bold text-slate-900 align-top whitespace-nowrap">
                          {formatCurrency(sale.total, settings.currency, settings.currencyPosition)}
                        </td>

                        {/* Invoice Status */}
                        <td className="py-2 px-3 text-center align-top whitespace-nowrap">
                          <Badge status={sale.invoiceStatus as any} size="sm" />
                        </td>

                        {/* Action */}
                        <td className="py-2 px-3 text-right align-top whitespace-nowrap">
                          <div className="flex items-center justify-end gap-1.5">
                            {sale.customerPhone && (
                              <button
                                type="button"
                                onClick={() => openWhatsApp(sale.customerPhone!, `Salam ${sale.customerName}, regarding your purchase of ${product.name} (Invoice #${sale.invoiceNumber}).`)}
                                className="p-1 rounded text-emerald-600 hover:bg-emerald-50"
                                title="WhatsApp Customer"
                              >
                                <MessageCircle className="h-3.5 w-3.5" />
                              </button>
                            )}
                            {onViewInvoice && (
                              <button
                                type="button"
                                onClick={() => {
                                  onClose();
                                  onViewInvoice(sale.invoiceObj);
                                }}
                                className="flex items-center gap-0.5 text-amber-700 hover:text-amber-900 font-bold text-[10px] bg-amber-50 hover:bg-amber-100 px-1.5 py-0.5 rounded border border-amber-200 transition-colors cursor-pointer"
                                title="Open full invoice document"
                              >
                                <ExternalLink className="h-2.5 w-2.5" />
                                <span>Invoice</span>
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="bg-slate-100 font-bold text-slate-900 border-t-2 border-slate-300">
                    <tr>
                      <td colSpan={3} className="py-2.5 px-3 uppercase text-[10px] tracking-wider text-right">
                        Filtered Totals:
                      </td>
                      <td className="py-2.5 px-3 text-center font-mono font-black text-amber-900">
                        {filteredSoldUnits} {product.unit}
                      </td>
                      <td className="py-2.5 px-3" />
                      <td className="py-2.5 px-3 text-right font-mono font-black text-slate-900">
                        {formatCurrency(filteredRevenue, settings.currency, settings.currencyPosition)}
                      </td>
                      <td colSpan={2} />
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </div>
        )}

        {/* ========================================================================= */}
        {/* VIEW 2: NAME-WISE (CUSTOMER-WISE) SUMMARY TABLE                           */}
        {/* ========================================================================= */}
        {activeTab === 'NAME_WISE' && (
          <div className="rounded-xl border border-slate-200 bg-white shadow-2xs overflow-hidden">
            {customerSalesGroups.length === 0 ? (
              <div className="p-8 text-center text-slate-400 space-y-1">
                <Users className="h-8 w-8 mx-auto text-slate-300" />
                <p className="font-bold text-slate-700 text-xs">No client purchase records found</p>
                <p className="text-[11px] text-slate-500">
                  {searchTerm
                    ? 'No customer matched your search filter.'
                    : 'Customer-wise summaries will be compiled as items are invoiced.'}
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto max-h-[420px]">
                <table className="w-full text-left text-xs border-collapse">
                  <thead className="bg-slate-100 text-[10px] font-bold text-slate-600 uppercase border-b border-slate-200 sticky top-0 z-10">
                    <tr>
                      <th className="py-2.5 px-3">Customer Name & Contact</th>
                      <th className="py-2.5 px-3 text-center">Invoices Logged</th>
                      <th className="py-2.5 px-3 text-center">Total Quantity Bought</th>
                      <th className="py-2.5 px-3 text-right">Total Revenue Value</th>
                      <th className="py-2.5 px-3">Date Range</th>
                      <th className="py-2.5 px-3 text-right">Invoices Breakdown</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {customerSalesGroups.map((group) => {
                      const groupKey = (group.customerId || group.customerName).toLowerCase();
                      const isExpanded = Boolean(expandedCustomerNames[groupKey]);

                      return (
                        <React.Fragment key={groupKey}>
                          <tr
                            onClick={() => toggleCustomerExpand(groupKey)}
                            className={`cursor-pointer transition-colors ${
                              isExpanded ? 'bg-amber-50/50' : 'hover:bg-slate-50/80'
                            }`}
                          >
                            {/* Customer Name & Info */}
                            <td className="py-2.5 px-3">
                              <div className="flex items-center gap-2">
                                <div className="h-7 w-7 rounded-full bg-amber-100 text-amber-900 font-bold flex items-center justify-center text-xs shrink-0 border border-amber-200">
                                  {group.customerName.charAt(0).toUpperCase()}
                                </div>
                                <div>
                                  <p className="font-bold text-slate-900 text-xs flex items-center gap-1.5">
                                    <span>{group.customerName}</span>
                                    {group.sales.length > 1 && (
                                      <span className="text-[9px] font-semibold bg-blue-100 text-blue-800 px-1.5 py-0.2 rounded">
                                        Repeat Client
                                      </span>
                                    )}
                                  </p>
                                  <div className="flex items-center gap-2 text-[10px] text-slate-500 mt-0.5">
                                    {group.customerPhone && (
                                      <span className="flex items-center gap-0.5">
                                        <Phone className="h-2.5 w-2.5" />
                                        {group.customerPhone}
                                      </span>
                                    )}
                                    {group.customerCity && (
                                      <span className="flex items-center gap-0.5">
                                        <MapPin className="h-2.5 w-2.5" />
                                        {group.customerCity}
                                      </span>
                                    )}
                                  </div>
                                </div>
                              </div>
                            </td>

                            {/* Invoices Count */}
                            <td className="py-2.5 px-3 text-center font-mono font-semibold text-slate-700">
                              <span className="bg-slate-100 px-2 py-0.5 rounded border border-slate-200">
                                {group.invoicesCount} {group.invoicesCount === 1 ? 'Bill' : 'Bills'}
                              </span>
                            </td>

                            {/* Total Qty Bought */}
                            <td className="py-2.5 px-3 text-center">
                              <span className="font-mono font-black text-amber-900 bg-amber-100/70 border border-amber-200 px-2.5 py-1 rounded text-xs">
                                {group.totalQuantity} {group.unit}
                              </span>
                            </td>

                            {/* Total Spend */}
                            <td className="py-2.5 px-3 text-right font-mono font-bold text-emerald-700">
                              {formatCurrency(group.totalAmount, settings.currency, settings.currencyPosition)}
                            </td>

                            {/* Date Range */}
                            <td className="py-2.5 px-3 text-slate-600 text-[11px]">
                              {group.firstDate === group.lastDate ? (
                                <span>{formatDate(group.firstDate)}</span>
                              ) : (
                                <span>{formatDate(group.firstDate)} → {formatDate(group.lastDate)}</span>
                              )}
                            </td>

                            {/* Expand / Details Toggle */}
                            <td className="py-2.5 px-3 text-right">
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  toggleCustomerExpand(groupKey);
                                }}
                                className="inline-flex items-center gap-1 text-[11px] font-bold text-amber-800 bg-amber-50 hover:bg-amber-100 border border-amber-200 px-2 py-0.5 rounded transition-colors cursor-pointer"
                              >
                                <span>{isExpanded ? 'Hide' : 'View Invoices'}</span>
                                {isExpanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                              </button>
                            </td>
                          </tr>

                          {/* Expanded Invoices for this customer */}
                          {isExpanded && (
                            <tr className="bg-slate-50/90 border-b border-slate-200">
                              <td colSpan={6} className="p-3">
                                <div className="rounded-lg bg-white border border-slate-200 p-2.5 shadow-2xs space-y-1.5">
                                  <div className="flex items-center justify-between pb-1 border-b border-slate-100">
                                    <h4 className="text-[11px] font-bold text-slate-800 flex items-center gap-1">
                                      <FileText className="h-3 w-3 text-amber-500" />
                                      <span>All Purchase Orders by {group.customerName} for {product.name}</span>
                                    </h4>
                                    <span className="text-[10px] font-semibold text-slate-500">
                                      {group.sales.length} Purchases Total
                                    </span>
                                  </div>

                                  <div className="space-y-1">
                                    {group.sales.map((itemSale) => (
                                      <div
                                        key={itemSale.id}
                                        className="flex items-center justify-between p-1.5 rounded bg-slate-50 border border-slate-200/60 text-xs hover:bg-slate-100/70 transition-colors"
                                      >
                                        <div className="flex items-center gap-3">
                                          <span className="font-mono font-bold text-slate-900">
                                            #{itemSale.invoiceNumber}
                                          </span>
                                          <span className="text-slate-500 text-[11px]">
                                            {formatDate(itemSale.date)}
                                          </span>
                                          <Badge status={itemSale.invoiceStatus as any} size="sm" />
                                        </div>

                                        <div className="flex items-center gap-3">
                                          <span className="font-mono font-bold text-amber-800 bg-amber-100/80 px-2 py-0.5 rounded text-[11px]">
                                            Qty: {itemSale.quantity} {itemSale.unit}
                                          </span>
                                          <span className="font-mono text-slate-600 text-[11px]">
                                            @{formatCurrency(itemSale.unitPrice, settings.currency, settings.currencyPosition)}
                                          </span>
                                          <span className="font-mono font-bold text-slate-900">
                                            = {formatCurrency(itemSale.total, settings.currency, settings.currencyPosition)}
                                          </span>

                                          {onViewInvoice && (
                                            <button
                                              type="button"
                                              onClick={() => {
                                                onClose();
                                                onViewInvoice(itemSale.invoiceObj);
                                              }}
                                              className="text-[10px] font-bold text-amber-700 hover:text-amber-900 underline ml-2 cursor-pointer"
                                            >
                                              Open Invoice
                                            </button>
                                          )}
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              </td>
                            </tr>
                          )}
                        </React.Fragment>
                      );
                    })}
                  </tbody>
                  <tfoot className="bg-slate-100 font-bold text-slate-900 border-t-2 border-slate-300">
                    <tr>
                      <td className="py-2.5 px-3 uppercase text-[10px] tracking-wider">
                        Total {customerSalesGroups.length} Customer Accounts
                      </td>
                      <td className="py-2.5 px-3 text-center">
                        {customerSalesGroups.reduce((acc, g) => acc + g.invoicesCount, 0)} Bills
                      </td>
                      <td className="py-2.5 px-3 text-center font-mono font-black text-amber-900">
                        {filteredSoldUnits} {product.unit}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono font-black text-emerald-800">
                        {formatCurrency(filteredRevenue, settings.currency, settings.currencyPosition)}
                      </td>
                      <td colSpan={2} />
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </div>
        )}

        {/* Modal Footer */}
        <div className="flex items-center justify-between pt-3 border-t border-slate-200">
          <p className="text-[11px] text-slate-500">
            Real-time sales tracking compiled from commercial invoices.
          </p>

          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-slate-200 bg-white px-4 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-colors cursor-pointer"
          >
            Close
          </button>
        </div>
      </div>
    </Modal>
  );
};
