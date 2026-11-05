import React, { useState, useMemo } from 'react';
import { 
  Package, 
  Plus, 
  Search, 
  AlertTriangle, 
  Tag, 
  Edit3, 
  Trash2, 
  Sun, 
  Zap, 
  BatteryCharging, 
  Layers, 
  Cable,
  Scan,
  Printer,
  History,
  ArrowDownLeft,
  ArrowUpRight,
  X,
  TrendingUp,
  ShoppingBag,
  Users
} from 'lucide-react';
import { ProductItem, ProductCategory, ShopSettings, UserRole, Invoice } from '../../types/solar';
import { formatCurrency } from '../../utils/formatters';
import { getAllCategories, getCategoryLabel } from '../../utils/categories';
import { ProductSalesHistoryModal, isInvoiceItemMatch } from './ProductSalesHistoryModal';

interface InventoryListProps {
  products: ProductItem[];
  settings: ShopSettings;
  invoices?: Invoice[];
  onOpenProductEditor: (product?: ProductItem, prefillCode?: string) => void;
  onDeleteProduct: (id: string) => void;
  onUpdateStock: (id: string, newStock: number) => void;
  onOpenBarcodeScanner?: (mode?: 'STOCK_IN' | 'STOCK_OUT' | 'LOG' | 'LABELS') => void;
  onViewInvoice?: (invoice: Invoice) => void;
  currentRole?: UserRole;
}

export const InventoryList: React.FC<InventoryListProps> = ({
  products,
  settings,
  invoices = [],
  onOpenProductEditor,
  onDeleteProduct,
  onUpdateStock,
  onOpenBarcodeScanner,
  onViewInvoice,
  currentRole = 'OWNER',
}) => {
  const isPartner = currentRole === 'PARTNER';
  const [searchTerm, setSearchTerm] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string>('ALL');
  const [productToDelete, setProductToDelete] = useState<ProductItem | null>(null);
  const [selectedProductForSales, setSelectedProductForSales] = useState<ProductItem | null>(null);

  // Compute sales analytics for each product
  const productSalesStats = React.useMemo(() => {
    const stats: Record<string, { soldQty: number; revenue: number; buyersCount: number }> = {};
    products.forEach((p) => {
      stats[p.id] = { soldQty: 0, revenue: 0, buyersCount: 0 };
    });

    if (!invoices || invoices.length === 0) return stats;

    const buyersMap: Record<string, Set<string>> = {};
    products.forEach((p) => {
      buyersMap[p.id] = new Set<string>();
    });

    invoices.forEach((inv) => {
      if (!inv.items || inv.items.length === 0) return;
      inv.items.forEach((item) => {
        products.forEach((p) => {
          if (isInvoiceItemMatch(item, p)) {
            stats[p.id].soldQty += Number(item.quantity) || 0;
            stats[p.id].revenue += Number(item.total) || 0;
            if (inv.customerId || inv.customerName) {
              buyersMap[p.id].add((inv.customerId || inv.customerName).trim().toLowerCase());
            }
          }
        });
      });
    });

    products.forEach((p) => {
      stats[p.id].buyersCount = buyersMap[p.id]?.size || 0;
    });

    return stats;
  }, [products, invoices]);

  const filteredProducts = products.filter((p) => {
    const matchesSearch =
      p.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      p.brand.toLowerCase().includes(searchTerm.toLowerCase()) ||
      p.code.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (p.barcode && p.barcode.toLowerCase().includes(searchTerm.toLowerCase())) ||
      p.specs.toLowerCase().includes(searchTerm.toLowerCase());

    const matchesCategory = categoryFilter === 'ALL' || p.category === categoryFilter;
    return matchesSearch && matchesCategory;
  });

  const totalStockItems = products.reduce((acc, p) => acc + (p.category !== 'SERVICES_LABOR' ? p.stockQty : 0), 0);
  const totalAssetValue = products.reduce((acc, p) => acc + (p.category !== 'SERVICES_LABOR' ? p.stockQty * p.costPrice : 0), 0);
  const totalPotentialRetail = products.reduce((acc, p) => acc + (p.category !== 'SERVICES_LABOR' ? p.stockQty * p.sellingPrice : 0), 0);
  const lowStockCount = products.filter((p) => p.category !== 'SERVICES_LABOR' && p.stockQty <= p.minStockAlert).length;

  const dynamicCategories = getAllCategories(settings);
  const categoryFilterList = [
    { id: 'ALL', label: 'All Equipment' },
    ...dynamicCategories.map(c => ({ id: c.id, label: c.label }))
  ];

  // Group filtered products by category for per-category valuation & subtotaling
  const groupedByCategory = useMemo(() => {
    const groups: {
      category: string;
      label: string;
      products: ProductItem[];
      totalStock: number;
      costValuation: number;
      retailValuation: number;
      soldQty: number;
      revenue: number;
    }[] = [];

    const catMap = new Map<string, ProductItem[]>();

    filteredProducts.forEach((p) => {
      const cat = p.category || 'ACCESSORIES';
      if (!catMap.has(cat)) {
        catMap.set(cat, []);
      }
      catMap.get(cat)!.push(p);
    });

    // Standard ordered categories
    const standardOrder = dynamicCategories.map((c) => c.id);

    standardOrder.forEach((catId) => {
      const prods = catMap.get(catId);
      if (prods && prods.length > 0) {
        const totalStock = prods.reduce((sum, p) => sum + (p.category !== 'SERVICES_LABOR' ? (Number(p.stockQty) || 0) : 0), 0);
        const costValuation = prods.reduce((sum, p) => sum + (p.category !== 'SERVICES_LABOR' ? (Number(p.stockQty) || 0) * (Number(p.costPrice) || 0) : 0), 0);
        const retailValuation = prods.reduce((sum, p) => sum + (p.category !== 'SERVICES_LABOR' ? (Number(p.stockQty) || 0) * (Number(p.sellingPrice) || 0) : 0), 0);
        const soldQty = prods.reduce((sum, p) => sum + (productSalesStats[p.id]?.soldQty || 0), 0);
        const revenue = prods.reduce((sum, p) => sum + (productSalesStats[p.id]?.revenue || 0), 0);

        groups.push({
          category: catId,
          label: getCategoryLabel(catId as ProductCategory),
          products: prods,
          totalStock,
          costValuation,
          retailValuation,
          soldQty,
          revenue,
        });
        catMap.delete(catId);
      }
    });

    // Any remaining custom categories
    catMap.forEach((prods, catId) => {
      const totalStock = prods.reduce((sum, p) => sum + (p.category !== 'SERVICES_LABOR' ? (Number(p.stockQty) || 0) : 0), 0);
      const costValuation = prods.reduce((sum, p) => sum + (p.category !== 'SERVICES_LABOR' ? (Number(p.stockQty) || 0) * (Number(p.costPrice) || 0) : 0), 0);
      const retailValuation = prods.reduce((sum, p) => sum + (p.category !== 'SERVICES_LABOR' ? (Number(p.stockQty) || 0) * (Number(p.sellingPrice) || 0) : 0), 0);
      const soldQty = prods.reduce((sum, p) => sum + (productSalesStats[p.id]?.soldQty || 0), 0);
      const revenue = prods.reduce((sum, p) => sum + (productSalesStats[p.id]?.revenue || 0), 0);

      groups.push({
        category: catId,
        label: getCategoryLabel(catId as ProductCategory),
        products: prods,
        totalStock,
        costValuation,
        retailValuation,
        soldQty,
        revenue,
      });
    });

    return groups;
  }, [filteredProducts, dynamicCategories, productSalesStats]);

  // Overall totals for all currently filtered products
  const filteredCostValuation = useMemo(() => {
    return filteredProducts.reduce((sum, p) => sum + (p.category !== 'SERVICES_LABOR' ? (Number(p.stockQty) || 0) * (Number(p.costPrice) || 0) : 0), 0);
  }, [filteredProducts]);

  const filteredRetailValuation = useMemo(() => {
    return filteredProducts.reduce((sum, p) => sum + (p.category !== 'SERVICES_LABOR' ? (Number(p.stockQty) || 0) * (Number(p.sellingPrice) || 0) : 0), 0);
  }, [filteredProducts]);

  const filteredTotalStock = useMemo(() => {
    return filteredProducts.reduce((sum, p) => sum + (p.category !== 'SERVICES_LABOR' ? (Number(p.stockQty) || 0) : 0), 0);
  }, [filteredProducts]);

  const filteredSoldQty = useMemo(() => {
    return filteredProducts.reduce((sum, p) => sum + (productSalesStats[p.id]?.soldQty || 0), 0);
  }, [filteredProducts, productSalesStats]);

  const filteredRevenue = useMemo(() => {
    return filteredProducts.reduce((sum, p) => sum + (productSalesStats[p.id]?.revenue || 0), 0);
  }, [filteredProducts, productSalesStats]);

  // Category valuation lookup for category pills
  const categoryValuationMap = useMemo(() => {
    const map = new Map<string, number>();
    products.forEach((p) => {
      if (p.category !== 'SERVICES_LABOR') {
        const cat = p.category || 'ACCESSORIES';
        const current = map.get(cat) || 0;
        map.set(cat, current + (Number(p.stockQty) || 0) * (Number(p.costPrice) || 0));
      }
    });
    return map;
  }, [products]);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-lg font-bold tracking-tight text-slate-900 sm:text-xl flex items-center gap-2">
            <span>Solar Equipment & Warehouse Inventory</span>
          </h1>
          <p className="text-xs text-slate-500">
            Scan material barcodes to Add stock or Dispatch equipment for solar projects.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {onOpenBarcodeScanner && (
            <>
              {/* Scan Barcode Hub Action */}
              <button
                type="button"
                onClick={() => onOpenBarcodeScanner('STOCK_IN')}
                className="flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-bold text-white shadow-xs hover:bg-emerald-700 transition-colors cursor-pointer"
                title="Scan Barcodes to Receive or Dispatch Material"
              >
                <Scan className="h-4 w-4" />
                <span>📷 Scan Barcode (In / Out)</span>
              </button>

              <button
                type="button"
                onClick={() => onOpenBarcodeScanner('LABELS')}
                className="flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-50 transition-colors cursor-pointer shadow-2xs"
                title="Print Code-128 Barcode Stickers"
              >
                <Printer className="h-3.5 w-3.5 text-slate-500" />
                <span>Print Labels</span>
              </button>

              <button
                type="button"
                onClick={() => onOpenBarcodeScanner('LOG')}
                className="flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-50 transition-colors cursor-pointer shadow-2xs"
                title="View All Scan Logs & History"
              >
                <History className="h-3.5 w-3.5 text-blue-600" />
                <span>Scan Logs</span>
              </button>
            </>
          )}

          <button
            type="button"
            onClick={() => onOpenProductEditor()}
            className="flex items-center gap-1.5 rounded-lg bg-amber-400 px-3 py-1.5 text-xs font-bold text-slate-900 shadow-xs hover:bg-amber-500 transition-colors cursor-pointer"
          >
            <Plus className="h-3.5 w-3.5" />
            <span>+ Add Solar SKU</span>
          </button>
        </div>
      </div>

      {/* Stats row */}
      <div className={`grid grid-cols-1 gap-3 ${isPartner ? 'sm:grid-cols-3' : 'sm:grid-cols-4'}`}>
        {!isPartner && (
          <div className="rounded-lg border border-slate-200 bg-white p-3 shadow-xs">
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Stock Valuation (Cost)</p>
            <p className="mt-0.5 text-xl font-bold text-slate-900">
              {formatCurrency(totalAssetValue, settings.currency, settings.currencyPosition)}
            </p>
            <p className="text-[11px] text-slate-500 mt-0.5">Warehouse hardware asset</p>
          </div>
        )}

        <div className="rounded-lg border border-slate-200 bg-white p-3 shadow-xs">
          <p className="text-[10px] font-bold uppercase tracking-wider text-emerald-700">Retail Sales Potential</p>
          <p className="mt-0.5 text-xl font-bold text-emerald-700">
            {formatCurrency(totalPotentialRetail, settings.currency, settings.currencyPosition)}
          </p>
          <p className="text-[11px] text-slate-500 mt-0.5">Expected turnover</p>
        </div>

        <div className="rounded-lg border border-slate-200 bg-white p-3 shadow-xs">
          <p className="text-[10px] font-bold uppercase tracking-wider text-slate-600">Hardware Units in Stock</p>
          <p className="mt-0.5 text-xl font-bold text-slate-900">{totalStockItems} Units</p>
          <p className="text-[11px] text-slate-500 mt-0.5">{products.length} registered SKUs</p>
        </div>

        <div className="rounded-lg border border-slate-200 bg-white p-3 shadow-xs">
          <p className="text-[10px] font-bold uppercase tracking-wider text-amber-700">Low Stock Alerts</p>
          <p className="mt-0.5 text-xl font-bold text-amber-700">{lowStockCount} Items</p>
          <p className="text-[11px] text-slate-500 mt-0.5">Below reorder threshold</p>
        </div>
      </div>

      {/* Category Pills Filter */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
        {categoryFilterList.map((cat) => {
          const isActive = categoryFilter === cat.id;
          const catValuation = cat.id === 'ALL' ? totalAssetValue : (categoryValuationMap.get(cat.id) || 0);

          return (
            <button
              key={cat.id}
              type="button"
              onClick={() => setCategoryFilter(cat.id)}
              className={`flex items-center gap-1.5 whitespace-nowrap rounded-lg px-2.5 py-1 text-xs font-semibold transition-all cursor-pointer ${
                isActive
                  ? 'bg-amber-400 text-slate-900 font-bold shadow-xs'
                  : 'border border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
              }`}
            >
              <Tag className="h-3 w-3" />
              <span>{cat.label}</span>
              {catValuation > 0 && !isPartner && (
                <span className={`text-[10px] font-mono px-1.5 py-0.2 rounded-full font-bold ${
                  isActive ? 'bg-slate-900 text-amber-300' : 'bg-slate-100 text-slate-600'
                }`}>
                  {formatCurrency(catValuation, settings.currency, settings.currencyPosition)}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Search Input Bar */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between rounded-lg border border-slate-200 bg-white p-2.5 shadow-xs">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search equipment by name, brand, model, SKU code..."
            className="w-full rounded border border-slate-200 bg-slate-50 pl-8 pr-3 py-1 text-xs text-slate-900 placeholder-slate-400 focus:bg-white focus:border-amber-500 focus:outline-none"
          />
        </div>
      </div>

      {/* Product Table */}
      <div className="rounded-lg border border-slate-200 bg-white shadow-xs overflow-hidden">
        {filteredProducts.length === 0 ? (
          <div className="flex flex-col items-center justify-center p-10 text-center">
            <Package className="h-10 w-10 text-slate-300 mb-2" />
            <p className="text-xs font-bold text-slate-700">No solar items found</p>
            <p className="text-[11px] text-slate-500 mt-0.5">Click "+ Add Solar SKU" to create catalog hardware.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 sticky top-0 border-b border-slate-200 text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                <tr>
                  <th className="py-2.5 px-3">Equipment SKU & Brand</th>
                  <th className="py-2.5 px-3">Category</th>
                  {!isPartner && <th className="py-2.5 px-3 text-right">Cost Price</th>}
                  <th className="py-2.5 px-3 text-right">Selling Price</th>
                  <th className="py-2.5 px-3 text-center">Stock / Reorder</th>
                  <th className="py-2.5 px-3 text-center">Sales (Sold & Buyers)</th>
                  <th className="py-2.5 px-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {groupedByCategory.map((group) => {
                  return (
                    <React.Fragment key={group.category}>
                      {/* Category Header Row (when viewing all categories or multiple groups) */}
                      {categoryFilter === 'ALL' && (
                        <tr className="bg-slate-100/90 border-t-2 border-b border-slate-300">
                          <td colSpan={isPartner ? 6 : 7} className="py-2 px-3">
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-2">
                                <Tag className="h-3.5 w-3.5 text-amber-600" />
                                <span className="font-extrabold text-slate-900 text-xs uppercase tracking-wider">
                                  {group.label}
                                </span>
                                <span className="text-[10px] font-bold bg-white border border-slate-200 text-slate-700 px-2 py-0.5 rounded-full">
                                  {group.products.length} {group.products.length === 1 ? 'Product SKU' : 'Product SKUs'}
                                </span>
                              </div>
                              <div className="flex items-center gap-3 text-xs">
                                {!isPartner && (
                                  <span className="text-[11px] text-slate-600">
                                    Stock Asset Value:{' '}
                                    <strong className="font-mono text-slate-900 font-bold">
                                      {formatCurrency(group.costValuation, settings.currency, settings.currencyPosition)}
                                    </strong>
                                  </span>
                                )}
                                <span className="text-[11px] text-slate-600">
                                  In Stock:{' '}
                                  <strong className="font-mono text-slate-900 font-bold">
                                    {group.totalStock} Units
                                  </strong>
                                </span>
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}

                      {/* Product Rows in this Category */}
                      {group.products.map((p) => {
                        const isLow = p.category !== 'SERVICES_LABOR' && p.stockQty <= p.minStockAlert;
                        const stats = productSalesStats[p.id] || { soldQty: 0, revenue: 0, buyersCount: 0 };

                        return (
                          <tr key={p.id} className="hover:bg-slate-50/80 transition-colors">
                            {/* Name & Brand */}
                            <td className="py-2 px-3">
                              <div className="flex items-center gap-1.5">
                                <span className="font-bold text-slate-900">{p.name}</span>
                              </div>
                              <p className="text-[10px] text-slate-500">
                                {p.brand} • <span className="font-mono">{p.code}</span> {p.specs ? `• ${p.specs}` : ''}
                              </p>
                            </td>

                            {/* Category */}
                            <td className="py-2 px-3">
                              <span className="text-[10px] font-semibold bg-slate-100 text-slate-700 px-1.5 py-0.5 rounded border border-slate-200">
                                {getCategoryLabel(p.category)}
                              </span>
                            </td>

                            {/* Cost (Owner Only) */}
                            {!isPartner && (
                              <td className="py-2 px-3 text-right font-medium text-slate-600 font-mono">
                                {formatCurrency(p.costPrice, settings.currency, settings.currencyPosition)}
                              </td>
                            )}

                            {/* Selling Price */}
                            <td className="py-2 px-3 text-right font-bold text-slate-900 font-mono">
                              {formatCurrency(p.sellingPrice, settings.currency, settings.currencyPosition)}
                            </td>

                            {/* Stock Qty Controls */}
                            <td className="py-2 px-3 text-center">
                              {p.category === 'SERVICES_LABOR' ? (
                                <span className="text-[10px] text-slate-400">Service SKU</span>
                              ) : (
                                <div className="flex items-center justify-center gap-1.5">
                                  <button
                                    type="button"
                                    onClick={() => onUpdateStock(p.id, Math.max(0, p.stockQty - 1))}
                                    className="h-5 w-5 rounded bg-slate-100 text-slate-700 hover:bg-slate-200 flex items-center justify-center text-xs font-bold"
                                  >
                                    -
                                  </button>
                                  <span className={`font-mono font-bold px-1.5 ${isLow ? 'text-rose-600 bg-rose-50 rounded' : 'text-slate-900'}`}>
                                    {p.stockQty} {p.unit}
                                  </span>
                                  <button
                                    type="button"
                                    onClick={() => onUpdateStock(p.id, p.stockQty + 1)}
                                    className="h-5 w-5 rounded bg-slate-100 text-slate-700 hover:bg-slate-200 flex items-center justify-center text-xs font-bold"
                                  >
                                    +
                                  </button>
                                  {isLow && (
                                    <span title="Low stock alert" className="text-amber-500">
                                      <AlertTriangle className="h-3 w-3" />
                                    </span>
                                  )}
                                </div>
                              )}
                            </td>

                            {/* Sales Sold & Buyers Stats */}
                            <td className="py-2 px-3 text-center">
                              <button
                                type="button"
                                onClick={() => setSelectedProductForSales(p)}
                                className="inline-flex flex-col items-center justify-center p-1 rounded-lg border border-slate-200 bg-slate-50 hover:bg-amber-50 hover:border-amber-300 transition-all cursor-pointer group w-full max-w-[130px]"
                                title={`View Date-Wise & Customer-Wise Sales for ${p.name}`}
                              >
                                <div className="flex items-center gap-1 font-mono font-bold text-xs text-slate-900 group-hover:text-amber-900">
                                  <TrendingUp className="h-3 w-3 text-emerald-600 shrink-0" />
                                  <span>{stats.soldQty} {p.unit}</span>
                                </div>
                                <span className="text-[9px] text-slate-500 group-hover:text-amber-800">
                                  {stats.buyersCount} {stats.buyersCount === 1 ? 'Client' : 'Clients'} • {formatCurrency(stats.revenue, settings.currency, settings.currencyPosition)}
                                </span>
                              </button>
                            </td>

                            {/* Actions */}
                            <td className="py-2 px-3 text-right">
                              <div className="flex items-center justify-end gap-1">
                                <button
                                  type="button"
                                  onClick={() => setSelectedProductForSales(p)}
                                  className="rounded p-1 text-emerald-600 hover:bg-emerald-50 transition-colors"
                                  title="View Sales History (Date-Wise & Customer-Wise)"
                                >
                                  <TrendingUp className="h-3.5 w-3.5" />
                                </button>

                                {onOpenBarcodeScanner && (
                                  <button
                                    type="button"
                                    onClick={() => onOpenBarcodeScanner('LABELS')}
                                    className="rounded p-1 text-amber-600 hover:bg-amber-50"
                                    title="Print Barcode Label"
                                  >
                                    <Printer className="h-3.5 w-3.5" />
                                  </button>
                                )}

                                <button
                                  type="button"
                                  onClick={() => onOpenProductEditor(p)}
                                  className="rounded p-1 text-slate-500 hover:bg-slate-100 hover:text-slate-900"
                                  title="Edit Product"
                                >
                                  <Edit3 className="h-3.5 w-3.5" />
                                </button>

                                <button
                                  type="button"
                                  onClick={() => setProductToDelete(p)}
                                  className="rounded p-1 text-rose-500 hover:bg-rose-50"
                                  title="Delete Product"
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}

                      {/* --- END OF CATEGORY: TOTAL STOCK VALUATION ROW --- */}
                      <tr className="bg-gradient-to-r from-amber-100/70 via-amber-50 to-slate-100/90 border-t-2 border-b-2 border-amber-300 font-bold text-slate-900 shadow-2xs">
                        <td className="py-3 px-3">
                          <div className="flex items-center gap-2">
                            <div className="flex h-6 w-6 items-center justify-center rounded-md bg-amber-400 text-slate-950 font-black text-xs shadow-2xs shrink-0">
                              Σ
                            </div>
                            <div>
                              <span className="font-black text-slate-950 text-xs block tracking-tight">
                                Total {group.label} Stock Valuation
                              </span>
                              <span className="text-[10px] text-slate-500 font-medium">
                                Category Total • {group.products.length} {group.products.length === 1 ? 'SKU' : 'SKUs'}
                              </span>
                            </div>
                          </div>
                        </td>

                        <td className="py-3 px-3">
                          <span className="inline-block text-[10px] font-extrabold bg-amber-200/90 text-amber-950 px-2 py-0.5 rounded border border-amber-300">
                            {group.label}
                          </span>
                        </td>

                        {!isPartner && (
                          <td className="py-3 px-3 text-right">
                            <div className="text-[9px] uppercase font-bold text-slate-500 tracking-wider">Cost Valuation</div>
                            <div className="font-mono font-black text-slate-950 text-xs sm:text-sm">
                              {formatCurrency(group.costValuation, settings.currency, settings.currencyPosition)}
                            </div>
                          </td>
                        )}

                        <td className="py-3 px-3 text-right">
                          <div className="text-[9px] uppercase font-bold text-emerald-700 tracking-wider">Retail Valuation</div>
                          <div className="font-mono font-black text-emerald-800 text-xs sm:text-sm">
                            {formatCurrency(group.retailValuation, settings.currency, settings.currencyPosition)}
                          </div>
                        </td>

                        <td className="py-3 px-3 text-center">
                          <div className="text-[9px] uppercase font-bold text-slate-500 tracking-wider">Total Stock</div>
                          <span className="inline-block font-mono font-black text-slate-950 bg-white border border-amber-300 px-2 py-0.5 rounded text-xs shadow-2xs">
                            {group.totalStock} Units
                          </span>
                        </td>

                        <td className="py-3 px-3 text-center">
                          <div className="text-[9px] uppercase font-bold text-slate-500 tracking-wider">Category Sales</div>
                          <div className="font-mono font-bold text-slate-800 text-[11px]">
                            {group.soldQty} Sold • {formatCurrency(group.revenue, settings.currency, settings.currencyPosition)}
                          </div>
                        </td>

                        <td className="py-3 px-3 text-right">
                          {!isPartner && group.retailValuation > group.costValuation && (
                            <div>
                              <div className="text-[9px] uppercase font-bold text-emerald-600 tracking-wider">Est. Margin</div>
                              <span className="text-[11px] font-mono font-extrabold text-emerald-700">
                                +{formatCurrency(group.retailValuation - group.costValuation, settings.currency, settings.currencyPosition)}
                              </span>
                            </div>
                          )}
                        </td>
                      </tr>
                    </React.Fragment>
                  );
                })}
              </tbody>

              {/* Grand Total Valuation Footer across all categories */}
              {groupedByCategory.length > 1 && (
                <tfoot className="bg-slate-900 text-white font-bold border-t-2 border-slate-700">
                  <tr>
                    <td className="py-3 px-3">
                      <div className="flex items-center gap-2">
                        <div className="flex h-6 w-6 items-center justify-center rounded-md bg-amber-400 text-slate-950 font-black text-xs shrink-0">
                          ★
                        </div>
                        <div>
                          <span className="text-white font-extrabold text-xs block">
                            GRAND TOTAL (ALL CATEGORIES)
                          </span>
                          <span className="text-[10px] text-slate-400 font-normal">
                            {filteredProducts.length} Total Hardware SKUs
                          </span>
                        </div>
                      </div>
                    </td>
                    <td className="py-3 px-3">
                      <span className="text-[10px] bg-slate-800 text-amber-400 px-2 py-0.5 rounded border border-slate-700 font-bold">
                        {groupedByCategory.length} Categories
                      </span>
                    </td>
                    {!isPartner && (
                      <td className="py-3 px-3 text-right font-mono font-black text-white text-xs sm:text-sm">
                        <div className="text-[9px] uppercase text-slate-400 font-semibold">Total Cost Asset</div>
                        {formatCurrency(filteredCostValuation, settings.currency, settings.currencyPosition)}
                      </td>
                    )}
                    <td className="py-3 px-3 text-right font-mono font-black text-emerald-400 text-xs sm:text-sm">
                      <div className="text-[9px] uppercase text-emerald-400/80 font-semibold">Total Retail Potential</div>
                      {formatCurrency(filteredRetailValuation, settings.currency, settings.currencyPosition)}
                    </td>
                    <td className="py-3 px-3 text-center">
                      <div className="text-[9px] uppercase text-slate-400 font-semibold">Total Units</div>
                      <span className="font-mono font-black text-slate-900 bg-amber-400 px-2 py-0.5 rounded text-xs">
                        {filteredTotalStock} Units
                      </span>
                    </td>
                    <td className="py-3 px-3 text-center text-[11px] font-mono text-slate-200">
                      <div className="text-[9px] uppercase text-slate-400 font-semibold">Total Sales</div>
                      {filteredSoldQty} Sold • {formatCurrency(filteredRevenue, settings.currency, settings.currencyPosition)}
                    </td>
                    <td className="py-3 px-3 text-right">
                      {!isPartner && filteredRetailValuation > filteredCostValuation && (
                        <div>
                          <div className="text-[9px] uppercase text-emerald-400 font-semibold">Est. Margin</div>
                          <span className="font-mono text-emerald-300 text-xs font-black">
                            +{formatCurrency(filteredRetailValuation - filteredCostValuation, settings.currency, settings.currencyPosition)}
                          </span>
                        </div>
                      )}
                    </td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        )}
      </div>

      {/* Delete Product Confirmation Modal */}
      {productToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-xs">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl border border-slate-200 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-start gap-4">
              <div className="rounded-full bg-rose-100 p-3 text-rose-600 shrink-0">
                <AlertTriangle className="h-6 w-6" />
              </div>
              <div className="flex-1">
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-bold text-slate-900">
                    Delete Product?
                  </h3>
                  <button
                    onClick={() => setProductToDelete(null)}
                    className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
                  >
                    <X className="h-5 w-5" />
                  </button>
                </div>

                <div className="mt-3 rounded-xl bg-slate-50 border border-slate-200/80 p-3 text-xs space-y-1.5 text-slate-600">
                  <div className="flex justify-between">
                    <span className="text-slate-500">Name:</span>
                    <span className="font-semibold text-slate-800">{productToDelete.name}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">SKU / Code:</span>
                    <span className="font-mono text-slate-700">{productToDelete.code}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Current Stock:</span>
                    <span className="font-bold text-slate-900">
                      {productToDelete.stockQty} {productToDelete.unit}
                    </span>
                  </div>
                </div>

                <p className="mt-3 text-xs text-slate-500 leading-relaxed">
                  Are you sure you want to delete &quot;{productToDelete.name}&quot;? This item will be removed from your catalog.
                </p>

                <div className="mt-6 flex items-center justify-end gap-3">
                  <button
                    type="button"
                    onClick={() => setProductToDelete(null)}
                    className="rounded-xl px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      onDeleteProduct(productToDelete.id);
                      setProductToDelete(null);
                    }}
                    className="flex items-center gap-1.5 rounded-xl bg-rose-600 px-4 py-2 text-xs font-semibold text-white shadow-sm hover:bg-rose-700 active:scale-95 transition-all"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    Yes, Delete Product
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Product Sales History Modal (Date-Wise and Name-Wise) */}
      <ProductSalesHistoryModal
        isOpen={Boolean(selectedProductForSales)}
        onClose={() => setSelectedProductForSales(null)}
        product={selectedProductForSales}
        invoices={invoices}
        settings={settings}
        onViewInvoice={onViewInvoice}
        currentRole={currentRole}
      />
    </div>
  );
};
