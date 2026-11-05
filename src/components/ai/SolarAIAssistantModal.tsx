import React, { useState, useEffect, useRef } from 'react';
import { 
  Sparkles, 
  Send, 
  Bot, 
  User, 
  X, 
  Mic, 
  MicOff, 
  Copy, 
  Check, 
  RefreshCw, 
  DollarSign, 
  Package, 
  Users, 
  Sun, 
  ArrowRight,
  Maximize2,
  Minimize2,
  Trash2
} from 'lucide-react';
import { ProductItem, Customer, Invoice, Expense, ShopSettings } from '../../types/solar';
import { formatCurrency } from '../../utils/formatters';
import { generateLocalSolarAssistantResponse } from '../../utils/solarCopilotEngine';

interface Message {
  id: string;
  role: 'user' | 'model';
  text: string;
  timestamp: string;
  action?: {
    type: 'VIEW_CUSTOMER' | 'VIEW_INVOICE' | 'VIEW_INVENTORY' | 'ESTIMATOR' | 'RECORD_PAYMENT';
    targetId?: string;
    label: string;
  };
}

interface SolarAIAssistantModalProps {
  isOpen: boolean;
  onClose: () => void;
  products: ProductItem[];
  customers: Customer[];
  invoices: Invoice[];
  expenses: Expense[];
  settings: ShopSettings;
  onNavigateToTab?: (tab: any) => void;
  onViewCustomer?: (cust: Customer) => void;
  onViewInvoice?: (inv: Invoice) => void;
  onOpenRecordPayment?: (inv: Invoice, cust?: Customer) => void;
}

export const SolarAIAssistantModal: React.FC<SolarAIAssistantModalProps> = ({
  isOpen,
  onClose,
  products,
  customers,
  invoices,
  expenses,
  settings,
  onNavigateToTab,
  onViewCustomer,
  onViewInvoice,
  onOpenRecordPayment,
}) => {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: 'welcome',
      role: 'model',
      text: `Hello! I am **SolarCraft Copilot**, your AI solar engineering and business assistant. ☀️\n\nI have real-time access to your store inventory, client ledgers, and pricing. How can I help you today?`,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    },
  ]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [isExpanded, setIsExpanded] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 150);
    }
  }, [isOpen]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isLoading]);

  if (!isOpen) return null;

  // Web Speech API Voice Recognition
  const handleToggleVoice = () => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      alert('Voice recognition is not supported in this browser. Please type your query.');
      return;
    }

    if (isListening) {
      setIsListening(false);
      return;
    }

    try {
      const recognition = new SpeechRecognition();
      recognition.lang = 'en-US';
      recognition.interimResults = false;
      recognition.maxAlternatives = 1;

      recognition.onstart = () => setIsListening(true);
      recognition.onend = () => setIsListening(false);
      recognition.onerror = () => setIsListening(false);

      recognition.onresult = (event: any) => {
        const transcript = event.results[0][0].transcript;
        if (transcript) {
          setInput(transcript);
        }
      };

      recognition.start();
    } catch {
      setIsListening(false);
    }
  };

  const handleSendMessage = async (customPrompt?: string) => {
    const promptToSend = (customPrompt || input).trim();
    if (!promptToSend || isLoading) return;

    const userMsg: Message = {
      id: `usr-${Date.now()}`,
      role: 'user',
      text: promptToSend,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };

    setMessages((prev) => [...prev, userMsg]);
    setInput('');
    setIsLoading(true);

    try {
      let replyText = '';
      let action: Message['action'];

      // 1. Attempt to query server-side endpoint if available
      try {
        const response = await fetch('/api/ai/assistant', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            prompt: promptToSend,
            history: messages.slice(-6).map((m) => ({
              role: m.role,
              parts: [{ text: m.text }],
            })),
            context: {
              shopName: settings.shopName,
              currency: settings.currency,
              customers: customers.map((c) => ({
                id: c.id,
                name: c.name,
                phone: c.phone || c.whatsapp,
                balanceDue: c.balanceDue,
                totalInvoiced: c.totalInvoiced,
                totalPaid: c.totalPaid,
                installedCapacityKw: c.installedCapacityKw,
                city: c.city,
              })),
              products: products.map((p) => ({
                id: p.id,
                code: p.code,
                name: p.name,
                stockQty: p.stockQty,
                minStockAlert: p.minStockAlert,
                sellingPrice: p.sellingPrice,
                costPrice: p.costPrice,
                unit: p.unit,
              })),
              invoices: invoices.map((i) => ({
                id: i.id,
                invoiceNumber: i.invoiceNumber,
                customerName: i.customerName,
                grandTotal: i.grandTotal,
                paidAmount: i.paidAmount,
                balanceDue: i.balanceDue,
                date: i.date,
              })),
              expenses: expenses.slice(-20),
              settings: {
                shopName: settings.shopName,
                currency: settings.currency,
                ownerName: settings.ownerName,
              },
            },
          }),
        });

        const contentType = response.headers.get('content-type') || '';
        if (response.ok && contentType.includes('application/json')) {
          const data = await response.json();
          if (
            data && 
            data.reply && 
            !data.reply.includes('Connected to live store data. You can query customer balances, stock levels')
          ) {
            replyText = data.reply;
          }
        }
      } catch (networkErr) {
        // Normal when deployed on static host (Vercel SPA) or offline
        console.warn('Backend assistant endpoint not responding, activating local solar engine:', networkErr);
      }

      // 2. Seamless local fallback if backend endpoint was unreachable or non-JSON (e.g. Vercel SPA)
      if (!replyText) {
        const localResult = generateLocalSolarAssistantResponse(promptToSend, {
          shopName: settings.shopName,
          currency: settings.currency,
          customers,
          products,
          invoices,
          expenses,
          settings,
        });
        replyText = localResult.reply;
        if (localResult.action) {
          action = localResult.action;
        }
      }

      // 3. Fallback action detection if none was set
      if (!action) {
        const qLower = promptToSend.toLowerCase();
        if (qLower.includes('sajjad') || qLower.includes('ustaz')) {
          const sajjad = customers.find((c) => c.name.toLowerCase().includes('sajjad'));
          if (sajjad) {
            action = {
              type: 'VIEW_CUSTOMER',
              targetId: sajjad.id,
              label: 'Open Sajjad Ustaz CRM Account',
            };
          }
        } else if (qLower.includes('stock') || qLower.includes('inventory')) {
          action = {
            type: 'VIEW_INVENTORY',
            label: 'View Stock Inventory Tab',
          };
        } else if (qLower.includes('size') || qLower.includes('quote') || qLower.includes('kw')) {
          action = {
            type: 'ESTIMATOR',
            label: 'Open Solar System Estimator',
          };
        }
      }

      const botMsg: Message = {
        id: `bot-${Date.now()}`,
        role: 'model',
        text: replyText,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        action,
      };

      setMessages((prev) => [...prev, botMsg]);
    } catch (err: any) {
      // In extreme case of error, still provide local result rather than ugly JSON failure
      const fallbackResult = generateLocalSolarAssistantResponse(promptToSend, {
        shopName: settings.shopName,
        currency: settings.currency,
        customers,
        products,
        invoices,
        expenses,
        settings,
      });

      setMessages((prev) => [
        ...prev,
        {
          id: `bot-${Date.now()}`,
          role: 'model',
          text: fallbackResult.reply,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          action: fallbackResult.action,
        },
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleCopyText = (id: string, text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleActionClick = (action: NonNullable<Message['action']>) => {
    if (action.type === 'VIEW_CUSTOMER' && action.targetId && onViewCustomer) {
      const cust = customers.find((c) => c.id === action.targetId);
      if (cust) {
        onViewCustomer(cust);
        onClose();
      }
    } else if (action.type === 'VIEW_INVENTORY' && onNavigateToTab) {
      onNavigateToTab('INVENTORY');
      onClose();
    } else if (action.type === 'ESTIMATOR' && onNavigateToTab) {
      onNavigateToTab('ESTIMATOR');
      onClose();
    } else if (action.type === 'RECORD_PAYMENT' && onOpenRecordPayment) {
      const cust = action.targetId ? customers.find((c) => c.id === action.targetId) : undefined;
      const unpaid = cust
        ? invoices.find((i) => i.customerId === cust.id && i.type !== 'QUOTATION' && (i.balanceDue || 0) > 0)
        : undefined;
      if (unpaid) {
        onOpenRecordPayment(unpaid, cust);
        onClose();
      }
    } else if (action.type === 'VIEW_INVOICE' && action.targetId && onViewInvoice) {
      const inv = invoices.find((i) => i.id === action.targetId || i.invoiceNumber === action.targetId);
      if (inv) {
        onViewInvoice(inv);
        onClose();
      }
    }
  };

  const quickPrompts = [
    'What is Sajjad Ustaz pending balance?',
    'Show low stock items & panel quantities',
    'Calculate 10kW On-Grid solar package for Pakistan',
    'Urdu: کسٹمرز کا کل بقایا بیلنس کتنا ہے؟',
    'What was our total billed and received revenue?',
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-xs animate-fadeIn">
      <div 
        className={`flex flex-col bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden transition-all duration-200 ${
          isExpanded ? 'w-full h-[94vh] max-w-5xl' : 'w-full max-w-2xl h-[650px] max-h-[90vh]'
        }`}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 bg-gradient-to-r from-slate-900 via-slate-800 to-amber-950 text-white">
          <div className="flex items-center gap-2.5">
            <div className="h-8 w-8 rounded-xl bg-amber-400/20 border border-amber-400/30 flex items-center justify-center text-amber-300">
              <Sparkles className="h-4 w-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-bold text-sm text-white">SolarCraft Copilot</span>
                <span className="px-1.5 py-0.2 rounded text-[9px] font-black uppercase tracking-wider bg-amber-400 text-slate-950 font-mono">
                  Gemini AI
                </span>
              </div>
              <p className="text-[10px] text-slate-300 font-medium">
                Live Store Intelligence • Customer Ledgers • Solar PV Sizing
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setIsExpanded(!isExpanded)}
              className="p-1.5 rounded-lg text-slate-300 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
              title={isExpanded ? 'Restore size' : 'Maximize window'}
            >
              {isExpanded ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
            </button>
            <button
              type="button"
              onClick={() => {
                setMessages([
                  {
                    id: 'welcome',
                    role: 'model',
                    text: `Chat cleared. Ready for your next query! ☀️`,
                    timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                  },
                ]);
              }}
              className="p-1.5 rounded-lg text-slate-300 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
              title="Clear conversation"
            >
              <Trash2 className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-lg text-slate-300 hover:text-white hover:bg-rose-500/20 hover:text-rose-300 transition-colors cursor-pointer"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Live Context Banner */}
        <div className="px-3.5 py-1.5 bg-slate-50 border-b border-slate-200 flex flex-wrap items-center justify-between gap-2 text-[10px] text-slate-500">
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-1 font-semibold text-slate-700">
              <Package className="h-3 w-3 text-amber-600" />
              {products.length} Products
            </span>
            <span className="flex items-center gap-1 font-semibold text-slate-700">
              <Users className="h-3 w-3 text-blue-600" />
              {customers.length} Clients
            </span>
            <span className="flex items-center gap-1 font-semibold text-rose-600">
              <DollarSign className="h-3 w-3 text-rose-500" />
              {customers.filter((c) => (c.balanceDue || 0) > 0).length} Unpaid
            </span>
          </div>
          <span className="font-mono text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200 font-bold">
            ● Live Cloud Synced
          </span>
        </div>

        {/* Messages Body */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3.5 bg-slate-50/50">
          {messages.map((msg) => {
            const isUser = msg.role === 'user';
            return (
              <div
                key={msg.id}
                className={`flex gap-2.5 max-w-[88%] ${isUser ? 'ml-auto flex-row-reverse' : ''}`}
              >
                <div
                  className={`h-7 w-7 rounded-lg shrink-0 flex items-center justify-center text-xs font-bold ${
                    isUser
                      ? 'bg-slate-900 text-white'
                      : 'bg-amber-400 text-slate-950 shadow-2xs'
                  }`}
                >
                  {isUser ? <User className="h-3.5 w-3.5" /> : <Bot className="h-4 w-4" />}
                </div>

                <div className="space-y-1 min-w-0">
                  <div
                    className={`rounded-2xl px-3.5 py-2.5 text-xs leading-relaxed shadow-2xs whitespace-pre-wrap ${
                      isUser
                        ? 'bg-slate-900 text-white rounded-tr-xs'
                        : 'bg-white text-slate-800 border border-slate-200 rounded-tl-xs'
                    }`}
                  >
                    {msg.text}

                    {msg.action && (
                      <div className="mt-2.5 pt-2 border-t border-slate-100 flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => msg.action && handleActionClick(msg.action)}
                          className="inline-flex items-center gap-1 text-[11px] font-bold text-slate-900 bg-amber-400 hover:bg-amber-500 px-2.5 py-1 rounded-lg transition-colors shadow-2xs cursor-pointer"
                        >
                          <span>{msg.action.label}</span>
                          <ArrowRight className="h-3 w-3" />
                        </button>
                      </div>
                    )}
                  </div>

                  <div className={`flex items-center gap-2 text-[9px] text-slate-400 ${isUser ? 'justify-end' : 'justify-start'}`}>
                    <span>{msg.timestamp}</span>
                    {!isUser && (
                      <button
                        type="button"
                        onClick={() => handleCopyText(msg.id, msg.text)}
                        className="hover:text-slate-600 transition-colors cursor-pointer flex items-center gap-0.5"
                      >
                        {copiedId === msg.id ? (
                          <>
                            <Check className="h-2.5 w-2.5 text-emerald-600" />
                            <span className="text-emerald-700 font-bold">Copied</span>
                          </>
                        ) : (
                          <>
                            <Copy className="h-2.5 w-2.5" />
                            <span>Copy</span>
                          </>
                        )}
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}

          {isLoading && (
            <div className="flex gap-2.5 max-w-[80%]">
              <div className="h-7 w-7 rounded-lg shrink-0 bg-amber-400 text-slate-950 flex items-center justify-center">
                <Bot className="h-4 w-4 animate-spin" />
              </div>
              <div className="rounded-2xl bg-white border border-slate-200 px-4 py-2.5 shadow-2xs text-xs text-slate-500 flex items-center gap-2">
                <div className="flex items-center gap-1">
                  <div className="h-2 w-2 rounded-full bg-amber-500 animate-bounce" style={{ animationDelay: '0ms' }} />
                  <div className="h-2 w-2 rounded-full bg-amber-500 animate-bounce" style={{ animationDelay: '150ms' }} />
                  <div className="h-2 w-2 rounded-full bg-amber-500 animate-bounce" style={{ animationDelay: '300ms' }} />
                </div>
                <span className="font-medium text-[11px]">Thinking & analyzing ERP facts...</span>
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Quick Suggestion Chips */}
        <div className="px-3.5 py-2 bg-white border-t border-slate-100 flex items-center gap-1.5 overflow-x-auto text-[10px]">
          <span className="font-bold text-slate-400 shrink-0">Quick:</span>
          {quickPrompts.map((q, idx) => (
            <button
              key={idx}
              type="button"
              onClick={() => handleSendMessage(q)}
              className="shrink-0 bg-slate-100 hover:bg-amber-100 hover:text-amber-950 text-slate-700 px-2.5 py-1 rounded-full transition-colors font-medium border border-slate-200/60 cursor-pointer"
            >
              {q}
            </button>
          ))}
        </div>

        {/* Input Footer */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleSendMessage();
          }}
          className="p-3 bg-white border-t border-slate-200 flex items-center gap-2"
        >
          <div className="relative flex-1">
            <input
              ref={inputRef}
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask anything: inventory stock, customer balance, Urdu, solar sizing..."
              className="w-full rounded-xl border border-slate-300 bg-slate-50 px-3.5 py-2 text-xs text-slate-900 focus:bg-white focus:border-amber-500 focus:outline-none transition-all pr-9 shadow-inner"
              disabled={isLoading}
            />

            <button
              type="button"
              onClick={handleToggleVoice}
              className={`absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded-md transition-colors cursor-pointer ${
                isListening
                  ? 'bg-rose-500 text-white animate-pulse'
                  : 'text-slate-400 hover:text-slate-700'
              }`}
              title={isListening ? 'Stop listening' : 'Speak using microphone'}
            >
              {isListening ? <MicOff className="h-3.5 w-3.5" /> : <Mic className="h-3.5 w-3.5" />}
            </button>
          </div>

          <button
            type="submit"
            disabled={!input.trim() || isLoading}
            className="flex items-center justify-center h-8 px-4 rounded-xl bg-amber-400 text-slate-950 font-bold text-xs hover:bg-amber-500 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-xs cursor-pointer gap-1.5"
          >
            <span>Ask</span>
            <Send className="h-3 w-3" />
          </button>
        </form>
      </div>
    </div>
  );
};
