import React, { useState, useMemo } from 'react';
import { 
  MessageSquare, 
  Send, 
  Copy, 
  Check, 
  Bot, 
  Clock, 
  User, 
  FileText, 
  Sun, 
  ShieldCheck, 
  DollarSign, 
  CheckCircle2, 
  Smartphone, 
  Sparkles,
  Zap,
  Tag,
  ArrowRight,
  ExternalLink,
  Globe,
  Terminal,
  Server,
  HelpCircle
} from 'lucide-react';
import { Customer, Invoice, ProductItem, ShopSettings } from '../../types/solar';
import { formatCurrency, formatDate } from '../../utils/formatters';
import { openWhatsApp } from '../../utils/sendDirect';

interface WhatsAppBotSuiteProps {
  customers: Customer[];
  invoices: Invoice[];
  products: ProductItem[];
  settings: ShopSettings;
  onOpenRecordPayment?: (inv: Invoice, cust?: Customer) => void;
  onOpenEstimator?: () => void;
}

export type BotTriggerType = 
  | 'BALANCE_INQUIRY' 
  | 'QUOTATION_REQUEST' 
  | 'PAYMENT_RECEIVED' 
  | 'NET_METERING_UPDATE' 
  | 'WARRANTY_VERIFICATION' 
  | 'URDU_STATEMENT';

export const WhatsAppBotSuite: React.FC<WhatsAppBotSuiteProps> = ({
  customers,
  invoices,
  products,
  settings,
  onOpenRecordPayment,
  onOpenEstimator,
}) => {
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>(customers[0]?.id || '');
  const [triggerType, setTriggerType] = useState<BotTriggerType>('BALANCE_INQUIRY');
  const [systemSizeKw, setSystemSizeKw] = useState<number>(10);
  const [customNote, setCustomNote] = useState<string>('');
  const [copied, setCopied] = useState<boolean>(false);
  const [activeSubTab, setActiveSubTab] = useState<'GENERATOR' | 'SIMULATOR' | 'RULES' | 'DEPLOYMENT'>('GENERATOR');
  const [copiedWebhook, setCopiedWebhook] = useState<boolean>(false);
  const [copiedToken, setCopiedToken] = useState<boolean>(false);

  const selectedCustomer = useMemo(() => {
    return customers.find((c) => c.id === selectedCustomerId) || customers[0] || null;
  }, [customers, selectedCustomerId]);

  // Customer commercial invoices (unpaid sorted FIFO)
  const customerUnpaidInvoices = useMemo(() => {
    if (!selectedCustomer) return [];
    return invoices
      .filter((i) => i.customerId === selectedCustomer.id && i.type !== 'QUOTATION' && (i.balanceDue || 0) > 0)
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  }, [invoices, selectedCustomer]);

  // Generate Automated WhatsApp Message based on trigger
  const generatedMessage = useMemo(() => {
    const shop = settings.shopName || 'SolarCraft Systems';
    const currency = settings.currency;
    const pos = settings.currencyPosition;
    const custName = selectedCustomer?.name || 'Valued Client';
    const balanceStr = formatCurrency(selectedCustomer?.balanceDue || 0, currency, pos);
    const billedStr = formatCurrency(selectedCustomer?.totalInvoiced || 0, currency, pos);
    const paidStr = formatCurrency(selectedCustomer?.totalPaid || 0, currency, pos);

    // 1. BALANCE INQUIRY
    if (triggerType === 'BALANCE_INQUIRY') {
      let msg = `⚡ *${shop}* - Automated Account Balance Reply\n`;
      msg += `━━━━━━━━━━━━━━━━━━━━━\n\n`;
      msg += `Respected *${custName}*,\n\n`;
      msg += `Here is your requested real-time solar client ledger summary:\n\n`;
      msg += `📊 *ACCOUNT OVERVIEW:*\n`;
      msg += `• Total Project Cost Billed: ${billedStr}\n`;
      msg += `• Total Cleared to Date: ${paidStr}\n`;
      msg += `• 🔴 *Current Outstanding Dues: ${balanceStr}*\n\n`;

      if (customerUnpaidInvoices.length > 0) {
        msg += `📑 *Pending Invoices (Oldest First):*\n`;
        customerUnpaidInvoices.forEach((inv, idx) => {
          msg += `  ${idx + 1}. #${inv.invoiceNumber} (${formatDate(inv.date)}): ${formatCurrency(inv.balanceDue, currency, pos)}\n`;
        });
        msg += `\n`;
      }

      if (settings.bankAccountNumber) {
        msg += `🏦 *BANK TRANSFER DETAILS:*\n`;
        msg += `• Bank: *${settings.bankName}*\n`;
        msg += `• Account Title: *${settings.bankAccountTitle}*\n`;
        msg += `• Account Number: *${settings.bankAccountNumber}*\n`;
        if (settings.ibanOrSwift) msg += `• IBAN: *${settings.ibanOrSwift}*\n`;
        msg += `\n`;
      }

      if (customNote) {
        msg += `📝 *Note:* ${customNote}\n\n`;
      }

      msg += `Please reply with the payment screenshot once transferred so we can issue your official computerized receipt.\n\n`;
      msg += `Thank you for choosing *${shop}*! ☀️\n📞 *Helpdesk:* ${settings.phone}`;
      return msg;
    }

    // 2. QUOTATION REQUEST
    if (triggerType === 'QUOTATION_REQUEST') {
      const panelCount = Math.ceil((systemSizeKw * 1000) / 585);
      const estCost = Math.round(systemSizeKw * 105000);

      let msg = `☀️ *${shop}* - Turnkey Solar System Quotation\n`;
      msg += `━━━━━━━━━━━━━━━━━━━━━\n\n`;
      msg += `Dear *${custName}*,\n\n`;
      msg += `Thank you for inquiring about our high-efficiency solar solutions. Here is the estimated turnkey proposal for a *${systemSizeKw} kW On-Grid Solar PV System*:\n\n`;
      msg += `📋 *HARDWARE & ENGINEERING SPECIFICATIONS:*\n`;
      msg += `• *Solar PV Panels:* ${panelCount}x Tier-1 585W TOPCon N-Type Bifacial Mono Panels (Longi / Jinko)\n`;
      msg += `• *Inverter:* ${Math.ceil(systemSizeKw)} kW 3-Phase Dual MPPT On-Grid Inverter with Wi-Fi Monitoring\n`;
      msg += `• *Structure:* Elevated HDGI / Aluminum Customized Rooftop Mounting Frames\n`;
      msg += `• *Protection:* AC/DC Breakers, SPDs, Class-A Isolator & Pure Copper Earth Bores\n`;
      msg += `• *Cables:* 4mm / 6mm Tinned Double-Insulated Solar PV DC Wire\n\n`;
      msg += `⚡ *ESTIMATED PERFORMANCE:*\n`;
      msg += `• Average Monthly Units: ~${Math.round(systemSizeKw * 125)} to ${Math.round(systemSizeKw * 135)} kWh/month\n`;
      msg += `• Estimated Monthly Bill Savings: ${formatCurrency(Math.round(systemSizeKw * 125 * 62), currency, pos)}\n`;
      msg += `• 💰 *Estimated Turnkey Price:* ~${formatCurrency(estCost, currency, pos)}\n\n`;
      msg += `🛡️ *WARRANTIES:* 12-Year Product Warranty, 25-Year 85% Power Output Warranty, 5-Year Inverter Replacement.\n\n`;
      msg += `Would you like us to schedule an on-site rooftop survey? Reply to confirm!\n📞 ${settings.phone}`;
      return msg;
    }

    // 3. PAYMENT RECEIVED CONFIRMATION
    if (triggerType === 'PAYMENT_RECEIVED') {
      let msg = `🧾 *${shop}* - Payment Received Acknowledgment\n`;
      msg += `━━━━━━━━━━━━━━━━━━━━━\n\n`;
      msg += `Dear *${custName}*,\n\n`;
      msg += `We have successfully received and verified your payment. Thank you! ☀️\n\n`;
      msg += `📋 *TRANSACTION DETAILS:*\n`;
      msg += `• Customer Name: *${custName}*\n`;
      msg += `• Date Verified: ${formatDate(new Date().toISOString().split('T')[0])}\n`;
      msg += `• Current Total Paid: ${paidStr}\n`;
      msg += `• *Remaining Balance Due:* *${balanceStr}*\n\n`;
      if ((selectedCustomer?.balanceDue || 0) <= 0) {
        msg += `🏆 *STATUS:* ✅ **ACCOUNT 100% PAID IN FULL & CLEARED!** 🎉\n\n`;
      } else {
        msg += `⚡ *NEXT STEP:* Material dispatch and installation phase are proceeding as scheduled.\n\n`;
      }
      msg += `Best Regards,\n*${shop}*\n📞 ${settings.phone}`;
      return msg;
    }

    // 4. NET-METERING UPDATE
    if (triggerType === 'NET_METERING_UPDATE') {
      let msg = `⚡ *${shop}* - Green Meter / Net-Metering Status Update\n`;
      msg += `━━━━━━━━━━━━━━━━━━━━━\n\n`;
      msg += `Dear *${custName}*,\n\n`;
      msg += `This is an official update regarding your Green Meter Net-Metering application with the electric utility:\n\n`;
      msg += `• Reference / Consumer ID: ${selectedCustomer?.consumerNumber || 'In Process'}\n`;
      msg += `• System Capacity: ${selectedCustomer?.installedCapacityKw || systemSizeKw} kW (3-Phase)\n`;
      msg += `• Current DISCO Status: *Feasibility Approved & Meter Testing Stage*\n\n`;
      msg += `🔧 Our liaison engineer is handling the terminal inspection and safety clearance. The two-way bidirectional meter installation will be finalized shortly.\n\n`;
      msg += `Thank you for choosing clean solar energy! ☀️\n*${shop}* | 📞 ${settings.phone}`;
      return msg;
    }

    // 5. WARRANTY VERIFICATION
    if (triggerType === 'WARRANTY_VERIFICATION') {
      let msg = `🛡️ *${shop}* - Official Solar Warranty Certificate\n`;
      msg += `━━━━━━━━━━━━━━━━━━━━━\n\n`;
      msg += `Client: *${custName}*\n`;
      msg += `Site Address: ${selectedCustomer?.address || 'On Record'}\n\n`;
      msg += `Your manufacturer-backed hardware warranties are fully registered and active:\n\n`;
      msg += `1. *Tier-1 Solar Panels:* 12-Year Material & Craftsmanship, 25-Year 85% Linear Power Output\n`;
      msg += `2. *Solar Inverter:* 5-Year Full Replacement Guarantee\n`;
      msg += `3. *Installation & Workmanship:* 1-Year Free Comprehensive Support & Tightening\n\n`;
      msg += `For any maintenance or warranty assistance, our engineering team is available 6 days a week.\n📞 ${settings.phone}`;
      return msg;
    }

    // 6. URDU STATEMENT
    let msg = `☀️ *${shop}* (سولر سسٹمز کھاتہ تفصیل)\n`;
    msg += `━━━━━━━━━━━━━━━━━━━━━\n\n`;
    msg += `السلام علیکم محترم *${custName}* صاحب!\n\n`;
    msg += `یہ میسج آپ کے سولر پراجیکٹ کے بقیہ بیلنس (Dues) اور کھاتے کی موجودہ صورتحال کے لیے بھیجا جا رہا ہے۔\n\n`;
    msg += `📊 *کھاتے کا خلاصہ (Ledger Details):*\n`;
    msg += `• کُل انوائس رقم (Total Cost): ${billedStr}\n`;
    msg += `• موصول شدہ رقم (Paid): ${paidStr}\n`;
    msg += `• 🔴 *بقایا واجب الادا رقم (Remaining Balance):* *${balanceStr}*\n\n`;

    if (settings.bankAccountNumber) {
      msg += `🏦 *بینک اکاؤنٹ تفصیلات برائے ادائیگی:*\n`;
      msg += `• بینک: *${settings.bankName}*\n`;
      msg += `• اکاؤنٹ نام: *${settings.bankAccountTitle}*\n`;
      msg += `• اکاؤنٹ نمبر: *${settings.bankAccountNumber}*\n`;
      if (settings.ibanOrSwift) msg += `• IBAN: *${settings.ibanOrSwift}*\n`;
      msg += `\n`;
    }

    msg += `ادائیگی کے بعد ٹرانزیکشن رسید شیئر فرمائیں تاکہ رسید جاری کی جا سکے۔ شکریہ!\n`;
    msg += `📞 رابطہ نمبر: ${settings.phone}`;
    return msg;
  }, [triggerType, selectedCustomer, systemSizeKw, customNote, customerUnpaidInvoices, settings]);

  const handleCopyMessage = () => {
    navigator.clipboard.writeText(generatedMessage);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleSendWhatsApp = () => {
    const phone = selectedCustomer?.phone || selectedCustomer?.whatsapp;
    if (phone) {
      openWhatsApp(phone, generatedMessage);
    } else {
      openWhatsApp('', generatedMessage);
    }
  };

  return (
    <div className="space-y-4">
      {/* Top Banner */}
      <div className="rounded-2xl bg-gradient-to-r from-emerald-900 via-emerald-800 to-slate-900 p-5 text-white shadow-sm flex flex-wrap items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <div className="h-9 w-9 rounded-xl bg-emerald-400/20 border border-emerald-400/30 flex items-center justify-center text-emerald-300">
              <Bot className="h-5 w-5" />
            </div>
            <h1 className="text-lg font-black text-white">WhatsApp CRM & Auto-Reply Bot Suite</h1>
            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/20 text-emerald-200 border border-emerald-400/30">
              Auto-Dispatch Ready
            </span>
          </div>
          <p className="text-xs text-emerald-100 max-w-2xl">
            Auto-generate tailored WhatsApp replies for client balance inquiries, quotation sizing, payment confirmations, and Net-Metering updates.
          </p>
        </div>

        {/* Sub-tabs */}
        <div className="flex items-center gap-1 bg-white/10 p-1 rounded-xl backdrop-blur-xs">
          <button
            type="button"
            onClick={() => setActiveSubTab('GENERATOR')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
              activeSubTab === 'GENERATOR' ? 'bg-white text-emerald-950 shadow-xs' : 'text-white hover:bg-white/10'
            }`}
          >
            💬 Bot Generator
          </button>
          <button
            type="button"
            onClick={() => setActiveSubTab('SIMULATOR')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
              activeSubTab === 'SIMULATOR' ? 'bg-white text-emerald-950 shadow-xs' : 'text-white hover:bg-white/10'
            }`}
          >
            📱 Phone Simulator
          </button>
          <button
            type="button"
            onClick={() => setActiveSubTab('RULES')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
              activeSubTab === 'RULES' ? 'bg-white text-emerald-950 shadow-xs' : 'text-white hover:bg-white/10'
            }`}
          >
            ⚙️ Auto-Rules
          </button>
          <button
            type="button"
            onClick={() => setActiveSubTab('DEPLOYMENT')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1 ${
              activeSubTab === 'DEPLOYMENT' ? 'bg-amber-400 text-slate-950 shadow-xs' : 'text-amber-200 hover:bg-white/10'
            }`}
          >
            <Sparkles className="h-3 w-3" />
            <span>🚀 Deployment Guide</span>
          </button>
        </div>
      </div>

      {/* VIEW 1: GENERATOR */}
      {activeSubTab === 'GENERATOR' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
          {/* Controls Column */}
          <div className="lg:col-span-5 space-y-4">
            <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-3.5 shadow-2xs">
              <h2 className="text-xs font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
                <User className="h-3.5 w-3.5 text-emerald-600" />
                Select Client & Context
              </h2>

              <div>
                <label className="text-[11px] font-bold text-slate-700">Choose Customer:</label>
                <select
                  value={selectedCustomerId}
                  onChange={(e) => setSelectedCustomerId(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-900 focus:border-emerald-500 focus:outline-none"
                >
                  {customers.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} ({c.phone || 'No phone'}) - {formatCurrency(c.balanceDue || 0, settings.currency, settings.currencyPosition)} Dues
                    </option>
                  ))}
                </select>
              </div>

              {selectedCustomer && (
                <div className="rounded-lg bg-emerald-50/60 border border-emerald-200 p-2.5 text-xs space-y-1">
                  <div className="flex items-center justify-between font-bold text-emerald-950">
                    <span>{selectedCustomer.name}</span>
                    <span className="font-mono text-rose-600">
                      {formatCurrency(selectedCustomer.balanceDue || 0, settings.currency, settings.currencyPosition)} Due
                    </span>
                  </div>
                  <div className="text-[11px] text-slate-600 flex items-center justify-between">
                    <span>Phone: {selectedCustomer.phone || 'N/A'}</span>
                    <span>{customerUnpaidInvoices.length} Unpaid Invoices</span>
                  </div>
                </div>
              )}

              <div>
                <label className="text-[11px] font-bold text-slate-700">Trigger / Response Template:</label>
                <div className="mt-1 grid grid-cols-1 gap-1.5">
                  {[
                    { id: 'BALANCE_INQUIRY', label: '🔴 Customer asks for Balance & Dues', desc: 'Full ledger summary, unpaid invoices & bank IBAN' },
                    { id: 'QUOTATION_REQUEST', label: '☀️ Solar System Quotation Inquiry', desc: 'Turnkey sizing with panel count & inverter' },
                    { id: 'PAYMENT_RECEIVED', label: '🧾 Payment Received Acknowledgment', desc: 'Confirms cleared funds and remaining milestone' },
                    { id: 'NET_METERING_UPDATE', label: '⚡ Green Meter DISCO Application Status', desc: 'WAPDA/LESCO net-metering progress' },
                    { id: 'WARRANTY_VERIFICATION', label: '🛡️ Warranty & Hardware Certificate', desc: '25-yr performance & 5-yr inverter warranty' },
                    { id: 'URDU_STATEMENT', label: '🇵🇰 Urdu / Roman Urdu کھاتہ میسج', desc: 'Urdu language payment and ledger notice' },
                  ].map((t) => (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => setTriggerType(t.id as BotTriggerType)}
                      className={`text-left p-2.5 rounded-lg border transition-all cursor-pointer ${
                        triggerType === t.id
                          ? 'border-emerald-500 bg-emerald-50/80 text-emerald-950 font-bold shadow-2xs'
                          : 'border-slate-200 bg-white hover:bg-slate-50 text-slate-700'
                      }`}
                    >
                      <div className="text-xs font-bold">{t.label}</div>
                      <div className="text-[10px] text-slate-500 mt-0.5">{t.desc}</div>
                    </button>
                  ))}
                </div>
              </div>

              {triggerType === 'QUOTATION_REQUEST' && (
                <div>
                  <label className="text-[11px] font-bold text-slate-700">Quotation System Size (kW):</label>
                  <div className="flex items-center gap-1.5 mt-1">
                    {[3, 5, 7, 10, 15, 20].map((kw) => (
                      <button
                        key={kw}
                        type="button"
                        onClick={() => setSystemSizeKw(kw)}
                        className={`flex-1 py-1 text-xs font-bold rounded border transition-colors cursor-pointer ${
                          systemSizeKw === kw
                            ? 'bg-amber-400 text-slate-900 border-amber-500 shadow-2xs'
                            : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                        }`}
                      >
                        {kw}kW
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div>
                <label className="text-[11px] font-bold text-slate-700">Custom Remarks / Special Note (Optional):</label>
                <input
                  type="text"
                  value={customNote}
                  onChange={(e) => setCustomNote(e.target.value)}
                  placeholder="e.g. Inverter arriving Tuesday; structure fabrication complete"
                  className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs text-slate-800 focus:border-emerald-500 focus:outline-none"
                />
              </div>
            </div>
          </div>

          {/* Generated Message Preview Column */}
          <div className="lg:col-span-7 space-y-4">
            <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-3 shadow-2xs">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Smartphone className="h-4 w-4 text-emerald-600" />
                  <span className="font-bold text-xs text-slate-900">
                    Live WhatsApp Dispatch Preview
                  </span>
                </div>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={handleCopyMessage}
                    className="flex items-center gap-1 text-[11px] font-bold text-slate-700 bg-slate-100 hover:bg-slate-200 px-2.5 py-1 rounded-lg transition-colors cursor-pointer"
                  >
                    {copied ? <Check className="h-3 w-3 text-emerald-600" /> : <Copy className="h-3 w-3" />}
                    <span>{copied ? 'Copied!' : 'Copy'}</span>
                  </button>
                  <button
                    type="button"
                    onClick={handleSendWhatsApp}
                    className="flex items-center gap-1 text-[11px] font-bold text-white bg-emerald-600 hover:bg-emerald-700 px-3 py-1 rounded-lg transition-colors shadow-xs cursor-pointer"
                  >
                    <Send className="h-3 w-3" />
                    <span>Send on WhatsApp</span>
                  </button>
                </div>
              </div>

              {/* Message Screen */}
              <div className="rounded-xl bg-[#EFEAE2] p-3.5 border border-slate-300 shadow-inner">
                <div className="max-w-xl mx-auto bg-white rounded-lg p-3.5 shadow-sm text-xs text-slate-900 whitespace-pre-wrap font-sans leading-relaxed border-l-4 border-emerald-500">
                  {generatedMessage}
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2 pt-2 text-[11px] text-slate-500">
                <span>
                  Destination Phone:{' '}
                  <strong className="text-slate-800">
                    {selectedCustomer?.phone || selectedCustomer?.whatsapp || 'Direct Browser Prompt'}
                  </strong>
                </span>
                {customerUnpaidInvoices.length > 0 && onOpenRecordPayment && (
                  <button
                    type="button"
                    onClick={() => onOpenRecordPayment(customerUnpaidInvoices[0], selectedCustomer || undefined)}
                    className="text-emerald-700 font-bold hover:underline cursor-pointer"
                  >
                    $ Clear Customer Dues (FIFO)...
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* VIEW 2: PHONE SIMULATOR */}
      {activeSubTab === 'SIMULATOR' && (
        <div className="max-w-2xl mx-auto rounded-2xl border border-slate-300 bg-slate-900 p-3 sm:p-5 shadow-2xl">
          <div className="bg-[#121b22] text-white rounded-xl p-3 flex items-center justify-between border-b border-slate-800">
            <div className="flex items-center gap-2.5">
              <div className="h-9 w-9 rounded-full bg-emerald-600 flex items-center justify-center font-bold text-white text-xs">
                {selectedCustomer?.name ? selectedCustomer.name[0] : 'S'}
              </div>
              <div>
                <p className="font-bold text-xs text-white">{selectedCustomer?.name || 'Customer'}</p>
                <p className="text-[10px] text-emerald-400">Online • SolarCraft WhatsApp Bot</p>
              </div>
            </div>
            <span className="text-[10px] text-slate-400 font-mono">Live Simulator</span>
          </div>

          <div className="bg-[#0b141a] p-4 min-h-[380px] max-h-[460px] overflow-y-auto space-y-3">
            {/* Customer Question */}
            <div className="flex justify-start">
              <div className="bg-[#202c33] text-white rounded-lg p-2.5 max-w-[80%] text-xs shadow-xs">
                <p className="font-semibold text-emerald-400 text-[10px]">Customer Inbound</p>
                <p className="mt-0.5">
                  {triggerType === 'BALANCE_INQUIRY' && 'Assalam-o-Alaikum! Please share my current outstanding balance and account statement.'}
                  {triggerType === 'QUOTATION_REQUEST' && `Hello, I need a quotation for a ${systemSizeKw}kW solar system with Tier-1 panels.`}
                  {triggerType === 'PAYMENT_RECEIVED' && 'I have transferred the payment via online banking. Please verify.'}
                  {triggerType === 'NET_METERING_UPDATE' && 'What is the update on my green meter net-metering application?'}
                  {triggerType === 'WARRANTY_VERIFICATION' && 'Can you please confirm my solar panels and inverter warranty?'}
                  {triggerType === 'URDU_STATEMENT' && 'السلام علیکم! برائے مہربانی کھاتے کا بقیہ بیلنس بتائیں۔'}
                </p>
                <span className="text-[9px] text-slate-400 block text-right mt-1">10:42 AM</span>
              </div>
            </div>

            {/* Bot Automated Reply */}
            <div className="flex justify-end">
              <div className="bg-[#005c4b] text-white rounded-lg p-2.5 max-w-[85%] text-xs shadow-xs whitespace-pre-wrap leading-relaxed">
                <div className="flex items-center justify-between text-[10px] text-emerald-200 border-b border-emerald-600 pb-1 mb-1">
                  <span className="font-bold">⚡ SolarCraft Auto-Bot</span>
                  <span>Instant Reply</span>
                </div>
                {generatedMessage}
                <span className="text-[9px] text-emerald-200 block text-right mt-1">10:42 AM ✓✓</span>
              </div>
            </div>
          </div>

          <div className="p-3 bg-[#202c33] rounded-b-xl flex items-center justify-between gap-2">
            <span className="text-xs text-slate-300">Test different questions using the Trigger Selector in the Generator tab!</span>
            <button
              type="button"
              onClick={handleSendWhatsApp}
              className="bg-emerald-500 hover:bg-emerald-600 text-slate-950 font-bold px-3 py-1.5 rounded-lg text-xs transition-colors flex items-center gap-1.5 cursor-pointer"
            >
              <Send className="h-3 w-3" />
              <span>Launch Live WhatsApp</span>
            </button>
          </div>
        </div>
      )}

      {/* VIEW 3: AUTO-REPLY RULES */}
      {activeSubTab === 'RULES' && (
        <div className="rounded-xl border border-slate-200 bg-white p-5 space-y-4 shadow-2xs">
          <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
            <Bot className="h-4 w-4 text-emerald-600" />
            <span>Configured Auto-Reply Triggers & Business Hours</span>
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="rounded-lg border border-slate-200 p-3 bg-slate-50 space-y-1">
              <span className="text-[10px] font-bold uppercase text-slate-500">Business Hours</span>
              <p className="font-bold text-xs text-slate-900">09:00 AM - 08:00 PM (PKT)</p>
              <p className="text-[10px] text-slate-500">Mon - Sat (Friday Jummah break 1:00-2:30 PM)</p>
            </div>
            <div className="rounded-lg border border-slate-200 p-3 bg-slate-50 space-y-1">
              <span className="text-[10px] font-bold uppercase text-slate-500">Instant Balance Trigger</span>
              <p className="font-bold text-xs text-emerald-700">Keyword: "Balance", "Baqaya", "Bill"</p>
              <p className="text-[10px] text-slate-500">Auto-calculates customer dues with FIFO cascade</p>
            </div>
            <div className="rounded-lg border border-slate-200 p-3 bg-slate-50 space-y-1">
              <span className="text-[10px] font-bold uppercase text-slate-500">Linked Bank Transfer</span>
              <p className="font-bold text-xs text-slate-900">{settings.bankName || 'Bank Transfer'}</p>
              <p className="text-[10px] text-slate-500 font-mono">A/C: {settings.bankAccountNumber || 'Configured in Settings'}</p>
            </div>
          </div>
        </div>
      )}

      {/* VIEW 4: DEPLOYMENT GUIDE */}
      {activeSubTab === 'DEPLOYMENT' && (
        <div className="space-y-4">
          {/* Header Card */}
          <div className="rounded-xl border border-emerald-200 bg-emerald-50/70 p-4 sm:p-5 shadow-2xs">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <span className="text-[10px] font-black uppercase tracking-wider text-emerald-800 bg-emerald-200/80 px-2.5 py-0.5 rounded-full">
                  Deployment Architectures
                </span>
                <h2 className="text-base font-black text-slate-900 mt-1 flex items-center gap-2">
                  <Server className="h-5 w-5 text-emerald-600" />
                  <span>How to Deploy Your WhatsApp CRM & Auto-Reply Bot</span>
                </h2>
                <p className="text-xs text-slate-600 mt-0.5">
                  Choose the best method for your solar business: from instant zero-setup mobile dispatch to full 24/7 cloud automation.
                </p>
              </div>

              <div className="flex items-center gap-2">
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-emerald-600 text-white shadow-xs">
                  <span className="h-2 w-2 rounded-full bg-white animate-ping" />
                  Backend Server Active
                </span>
              </div>
            </div>

            {/* Live Webhook Endpoints Box */}
            <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-3 pt-3 border-t border-emerald-200/60">
              <div className="bg-white rounded-lg p-3 border border-emerald-300/80 space-y-1">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-bold text-slate-700 flex items-center gap-1.5">
                    <Globe className="h-3.5 w-3.5 text-emerald-600" />
                    <span>Your Live Webhook URL (Meta Cloud API / Gateway):</span>
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      const url = `${typeof window !== 'undefined' ? window.location.origin : ''}/api/whatsapp/webhook`;
                      navigator.clipboard.writeText(url);
                      setCopiedWebhook(true);
                      setTimeout(() => setCopiedWebhook(false), 2000);
                    }}
                    className="text-[11px] font-bold text-emerald-700 hover:text-emerald-900 flex items-center gap-1 cursor-pointer bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200"
                  >
                    {copiedWebhook ? <Check className="h-3 w-3 text-emerald-600" /> : <Copy className="h-3 w-3" />}
                    <span>{copiedWebhook ? 'Copied!' : 'Copy URL'}</span>
                  </button>
                </div>
                <p className="font-mono text-xs text-slate-900 bg-slate-50 p-1.5 rounded border border-slate-200 break-all select-all">
                  {typeof window !== 'undefined' ? `${window.location.origin}/api/whatsapp/webhook` : '/api/whatsapp/webhook'}
                </p>
                <p className="text-[10px] text-slate-500">Supports Meta Verification GET handshake and POST message events.</p>
              </div>

              <div className="bg-white rounded-lg p-3 border border-emerald-300/80 space-y-1">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-bold text-slate-700 flex items-center gap-1.5">
                    <ShieldCheck className="h-3.5 w-3.5 text-emerald-600" />
                    <span>Webhook Verification Token:</span>
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      navigator.clipboard.writeText('solarcraft_bot_token');
                      setCopiedToken(true);
                      setTimeout(() => setCopiedToken(false), 2000);
                    }}
                    className="text-[11px] font-bold text-emerald-700 hover:text-emerald-900 flex items-center gap-1 cursor-pointer bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200"
                  >
                    {copiedToken ? <Check className="h-3 w-3 text-emerald-600" /> : <Copy className="h-3 w-3" />}
                    <span>{copiedToken ? 'Copied!' : 'Copy Token'}</span>
                  </button>
                </div>
                <p className="font-mono text-xs text-slate-900 bg-slate-50 p-1.5 rounded border border-slate-200 select-all font-bold">
                  solarcraft_bot_token
                </p>
                <p className="text-[10px] text-slate-500">Paste this into Meta Developer Dashboard Verify Token field.</p>
              </div>
            </div>
          </div>

          {/* 4 Deployment Pathways Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Pathway 1 */}
            <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-3 shadow-2xs hover:border-emerald-400 transition-all">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <span className="text-[10px] font-black uppercase tracking-wider text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-full">
                    Method 1 • Zero Setup (Instant)
                  </span>
                  <h3 className="text-sm font-bold text-slate-900 mt-1">In-App Click & Send (Active Now)</h3>
                </div>
                <span className="text-[10px] font-bold text-emerald-600 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-md">
                  100% Free
                </span>
              </div>
              <p className="text-xs text-slate-600 leading-relaxed">
                Already live across all screens! Open any customer, invoice, or the <strong>Bot Generator</strong> tab, choose the trigger, and click <strong>"Send on WhatsApp"</strong>.
              </p>
              <ul className="text-xs text-slate-700 space-y-1.5 list-disc pl-4">
                <li>Deep-links directly into <strong>WhatsApp Desktop</strong>, <strong>WhatsApp Web</strong>, or <strong>WhatsApp Mobile App</strong>.</li>
                <li>Zero Meta API fees, zero phone approvals, zero risk of spam bans.</li>
                <li>Automatically populates recipient phone number and FIFO ledger statement.</li>
              </ul>
              <div className="pt-2 border-t border-slate-100 flex items-center justify-between">
                <span className="text-[11px] text-slate-500 font-medium">Recommended for: Daily shop operations</span>
                <button
                  type="button"
                  onClick={() => setActiveSubTab('GENERATOR')}
                  className="text-xs font-bold text-emerald-700 hover:text-emerald-800 flex items-center gap-1 cursor-pointer"
                >
                  <span>Open Generator</span>
                  <ArrowRight className="h-3 w-3" />
                </button>
              </div>
            </div>

            {/* Pathway 2 */}
            <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-3 shadow-2xs hover:border-emerald-400 transition-all">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <span className="text-[10px] font-black uppercase tracking-wider text-blue-700 bg-blue-100 px-2 py-0.5 rounded-full">
                    Method 2 • Zero Code (Automated)
                  </span>
                  <h3 className="text-sm font-bold text-slate-900 mt-1">WhatsApp Business App "Quick Replies"</h3>
                </div>
                <span className="text-[10px] font-bold text-blue-600 bg-blue-50 border border-blue-200 px-2 py-0.5 rounded-md">
                  Free & Official
                </span>
              </div>
              <p className="text-xs text-slate-600 leading-relaxed">
                Use WhatsApp Business App’s built-in shortcuts to reply in under 2 seconds right from your personal or business smartphone:
              </p>
              <ol className="text-xs text-slate-700 space-y-1.5 list-decimal pl-4">
                <li>Install the free <strong>WhatsApp Business</strong> app on your Android or iPhone.</li>
                <li>Go to <strong>Settings &gt; Business Tools &gt; Quick Replies</strong>.</li>
                <li>Add shortcut <code className="bg-slate-100 px-1 rounded font-bold text-blue-800">/balance</code> and paste our generated balance statement.</li>
                <li>Add shortcut <code className="bg-slate-100 px-1 rounded font-bold text-blue-800">/quote10</code> and paste our 10kW turnkey quote.</li>
                <li>Add shortcut <code className="bg-slate-100 px-1 rounded font-bold text-blue-800">/bank</code> for your bank transfer details.</li>
              </ol>
              <div className="pt-2 border-t border-slate-100 flex items-center justify-between">
                <span className="text-[11px] text-slate-500 font-medium">When client texts, just type <strong>/</strong> to reply!</span>
                <button
                  type="button"
                  onClick={() => {
                    setActiveSubTab('GENERATOR');
                    handleCopyMessage();
                  }}
                  className="text-xs font-bold text-blue-700 hover:text-blue-800 flex items-center gap-1 cursor-pointer"
                >
                  <span>Copy Templates</span>
                  <Copy className="h-3 w-3" />
                </button>
              </div>
            </div>

            {/* Pathway 3 */}
            <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-3 shadow-2xs hover:border-emerald-400 transition-all">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <span className="text-[10px] font-black uppercase tracking-wider text-purple-700 bg-purple-100 px-2 py-0.5 rounded-full">
                    Method 3 • 24/7 Cloud Bot
                  </span>
                  <h3 className="text-sm font-bold text-slate-900 mt-1">Official Meta WhatsApp Cloud API</h3>
                </div>
                <span className="text-[10px] font-bold text-purple-600 bg-purple-50 border border-purple-200 px-2 py-0.5 rounded-md">
                  Server Webhook
                </span>
              </div>
              <p className="text-xs text-slate-600 leading-relaxed">
                Runs automatically in the background on our live Cloud Run server. Whenever a customer sends a message containing *"balance"*, *"bill"*, or *"quote"*, the server queries the database and sends the response automatically.
              </p>
              <ol className="text-xs text-slate-700 space-y-1.5 list-decimal pl-4">
                <li>Create a free developer account at <strong>developers.facebook.com</strong>.</li>
                <li>Create an App &gt; Select <strong>Other &gt; Business</strong> &gt; Add <strong>WhatsApp</strong>.</li>
                <li>Go to <strong>Configuration &gt; Edit Callback URL</strong>:
                  <div className="mt-1 text-[11px] font-mono bg-slate-100 p-1 rounded">
                    URL: {typeof window !== 'undefined' ? `${window.location.origin}/api/whatsapp/webhook` : '/api/whatsapp/webhook'}<br />
                    Token: solarcraft_bot_token
                  </div>
                </li>
                <li>Subscribe to the <code className="bg-slate-100 px-1 rounded font-bold text-purple-800">messages</code> field.</li>
              </ol>
              <div className="pt-2 border-t border-slate-100 flex items-center justify-between">
                <span className="text-[11px] text-slate-500 font-medium">Auto-replies even when your PC is closed</span>
                <span className="text-xs font-bold text-purple-700 flex items-center gap-1">
                  <span>Server Ready</span>
                  <Check className="h-3 w-3 text-emerald-600" />
                </span>
              </div>
            </div>

            {/* Pathway 4 */}
            <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-3 shadow-2xs hover:border-emerald-400 transition-all">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <span className="text-[10px] font-black uppercase tracking-wider text-amber-700 bg-amber-100 px-2 py-0.5 rounded-full">
                    Method 4 • QR Gateway
                  </span>
                  <h3 className="text-sm font-bold text-slate-900 mt-1">Scan-and-Run Node Gateway (Baileys / Whapi)</h3>
                </div>
                <span className="text-[10px] font-bold text-amber-600 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-md">
                  No Meta Verification
                </span>
              </div>
              <p className="text-xs text-slate-600 leading-relaxed">
                Connect your existing Pakistan WhatsApp number (e.g. Jazz / Zong / Ufone SIM) by scanning a QR code once, without needing a registered Meta Business Account:
              </p>
              <ul className="text-xs text-slate-700 space-y-1.5 list-disc pl-4">
                <li>Uses open-source Node.js WhatsApp Web protocols (Baileys or whatsapp-web.js) or gateways like Whapi/GreenAPI.</li>
                <li>Listens for incoming messages and relays them directly to <code className="bg-slate-100 px-1 rounded text-slate-800 font-mono">POST /api/whatsapp/webhook</code>.</li>
                <li>Replies from your actual phone number so customers recognize you immediately.</li>
              </ul>
              <div className="pt-2 border-t border-slate-100 flex items-center justify-between">
                <span className="text-[11px] text-slate-500 font-medium">Great for existing SIM numbers</span>
                <span className="text-xs font-bold text-amber-700">Optional Add-on</span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
