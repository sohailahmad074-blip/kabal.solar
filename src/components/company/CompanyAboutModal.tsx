import React, { useState } from 'react';
import { 
  Award, 
  ShieldCheck, 
  Sun, 
  Building2, 
  CheckCircle2, 
  Edit3, 
  Save, 
  X, 
  FileText, 
  Phone, 
  Mail, 
  MapPin, 
  Zap, 
  TrendingUp, 
  Layers,
  Sparkles,
  ExternalLink
} from 'lucide-react';
import { ShopSettings } from '../../types/solar';

interface CompanyAboutModalProps {
  isOpen?: boolean;
  onClose?: () => void;
  settings: ShopSettings;
  onSaveSettings: (updated: ShopSettings) => void;
  asModal?: boolean;
}

export const CompanyAboutModal: React.FC<CompanyAboutModalProps> = ({
  isOpen = true,
  onClose,
  settings,
  onSaveSettings,
  asModal = false,
}) => {
  const profile = settings.companyProfile || {
    tagline: 'Premier Solar EPC Contractor & Tier-1 Photovoltaic Equipment Importer',
    establishedYear: '2019',
    ntnNumber: settings.taxRegistrationNumber || '7829104-5',
    strnNumber: '3277876123456',
    aedbCategory: 'AEDB Certified Solar Vendor (Category V2 / C-3)',
    pecRegistration: 'PEC License: C-5 / Solar & Renewable Energy EPC',
    authorizedDistributor: ['Longi Solar', 'Jinko Solar TOPCon', 'Growatt', 'Inverex', 'Deye Hybrid', 'Canadian Solar', 'Knox'],
    completedProjectsKw: 2450,
    residentialProjectsCount: 140,
    commercialProjectsCount: 38,
    officeAddress: settings.address || 'Main Commercial Boulevard, Solar Hub',
    warehouseAddress: 'Central Logistics Depot, Gate 3, Industrial Estate',
    aboutDescription: 'SolarCraft Engineering is a premier turnkey renewable energy contractor delivering Tier-1 PV solar plants, 3-phase net-metering approvals, industrial rooftops, and hybrid backup systems with 25-year performance warranties.',
    warrantyCommitment: 'Official 12-Year Product Replacement & 25-Year 85% Linear Output Guarantee directly backed by tier-1 manufacturers. 5-Year full replacement on hybrid inverters.',
    netMeteringGuarantees: '100% Guaranteed Green Meter processing with DISCO (LESCO / GEPCO / MEPCO / IESCO / FESCO / K-Electric) from feasibility survey to grid commissioning.',
    includeInQuotations: true,
    includeInStatements: false,
  };

  const [isEditing, setIsEditing] = useState(false);
  const [formData, setFormData] = useState(profile);
  const [saveFeedback, setSaveFeedback] = useState<string | null>(null);

  if (asModal && !isOpen) return null;

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    const updatedSettings: ShopSettings = {
      ...settings,
      companyProfile: formData,
    };
    onSaveSettings(updatedSettings);
    setIsEditing(false);
    setSaveFeedback('✅ Company credentials & profile updated successfully!');
    setTimeout(() => setSaveFeedback(null), 3500);
  };

  const content = (
    <div className="space-y-5">
      {/* Hero Header Card */}
      <div className="rounded-2xl bg-gradient-to-r from-slate-950 via-slate-900 to-amber-950 p-6 text-white shadow-md relative overflow-hidden">
        <div className="absolute right-0 top-0 w-80 h-80 bg-amber-500/10 rounded-full blur-3xl pointer-events-none" />

        <div className="relative z-10 flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-2 max-w-2xl">
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-amber-400/20 text-amber-300 border border-amber-400/30">
              <Award className="h-3.5 w-3.5" />
              <span>{profile.aedbCategory || 'AEDB Approved Solar Vendor'}</span>
            </div>

            <h1 className="text-2xl font-black tracking-tight text-white sm:text-3xl">
              {settings.shopName || 'SolarCraft Engineering'}
            </h1>
            <p className="text-sm font-medium text-amber-200/90">
              {profile.tagline || settings.tagline}
            </p>
            <p className="text-xs text-slate-300 leading-relaxed pt-1">
              {profile.aboutDescription}
            </p>
          </div>

          <div className="flex items-center gap-2">
            {!isEditing ? (
              <button
                type="button"
                onClick={() => setIsEditing(true)}
                className="flex items-center gap-1.5 rounded-xl bg-amber-400 px-3.5 py-2 text-xs font-bold text-slate-950 hover:bg-amber-300 transition-colors shadow-xs cursor-pointer"
              >
                <Edit3 className="h-3.5 w-3.5" />
                <span>Edit Credentials</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={() => setIsEditing(false)}
                className="flex items-center gap-1.5 rounded-xl bg-white/10 hover:bg-white/20 px-3.5 py-2 text-xs font-bold text-white transition-colors cursor-pointer"
              >
                <X className="h-3.5 w-3.5" />
                <span>Cancel</span>
              </button>
            )}

            {asModal && onClose && (
              <button
                type="button"
                onClick={onClose}
                className="p-2 rounded-xl bg-white/10 hover:bg-rose-500/20 hover:text-rose-300 text-slate-300 transition-colors cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>

        {/* Milestone Stats Bar */}
        <div className="mt-6 pt-5 border-t border-slate-800 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="rounded-xl bg-white/5 border border-white/10 p-3">
            <span className="text-[10px] uppercase font-bold text-slate-400">Total Installed</span>
            <p className="text-xl font-black text-amber-400 font-mono">
              {(profile.completedProjectsKw || 2450).toLocaleString()} kW+
            </p>
            <span className="text-[10px] text-slate-300">Clean Grid PV</span>
          </div>

          <div className="rounded-xl bg-white/5 border border-white/10 p-3">
            <span className="text-[10px] uppercase font-bold text-slate-400">Residential Sites</span>
            <p className="text-xl font-black text-emerald-400 font-mono">
              {profile.residentialProjectsCount || 140}+
            </p>
            <span className="text-[10px] text-slate-300">Homes Energized</span>
          </div>

          <div className="rounded-xl bg-white/5 border border-white/10 p-3">
            <span className="text-[10px] uppercase font-bold text-slate-400">Commercial / Mills</span>
            <p className="text-xl font-black text-blue-400 font-mono">
              {profile.commercialProjectsCount || 38}+
            </p>
            <span className="text-[10px] text-slate-300">Industrial Rooftops</span>
          </div>

          <div className="rounded-xl bg-white/5 border border-white/10 p-3">
            <span className="text-[10px] uppercase font-bold text-slate-400">Experience</span>
            <p className="text-xl font-black text-amber-300 font-mono">
              {new Date().getFullYear() - parseInt(profile.establishedYear || '2019')} Years
            </p>
            <span className="text-[10px] text-slate-300">Since {profile.establishedYear || '2019'}</span>
          </div>
        </div>
      </div>

      {saveFeedback && (
        <div className="rounded-xl bg-emerald-50 border border-emerald-300 p-3 text-xs font-bold text-emerald-800 animate-fadeIn">
          {saveFeedback}
        </div>
      )}

      {/* VIEW MODE */}
      {!isEditing ? (
        <div className="space-y-5">
          {/* Official Engineering Certifications & Licenses Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-3 shadow-2xs">
              <h2 className="text-xs font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
                <ShieldCheck className="h-4 w-4 text-emerald-600" />
                Government Certifications & EPC Licenses
              </h2>

              <div className="space-y-2.5 text-xs">
                <div className="flex items-start justify-between border-b border-slate-100 pb-2">
                  <span className="text-slate-500">AEDB Status:</span>
                  <span className="font-bold text-slate-900 text-right">
                    {profile.aedbCategory || 'AEDB Certified Vendor (Cat V2/C-3)'}
                  </span>
                </div>

                <div className="flex items-start justify-between border-b border-slate-100 pb-2">
                  <span className="text-slate-500">PEC Registration:</span>
                  <span className="font-bold text-slate-900 text-right font-mono">
                    {profile.pecRegistration || 'PEC License: C-5 / Solar EPC'}
                  </span>
                </div>

                <div className="flex items-start justify-between border-b border-slate-100 pb-2">
                  <span className="text-slate-500">National Tax (NTN):</span>
                  <span className="font-bold text-slate-900 text-right font-mono">
                    {profile.ntnNumber || settings.taxRegistrationNumber || '7829104-5'}
                  </span>
                </div>

                <div className="flex items-start justify-between">
                  <span className="text-slate-500">Sales Tax (STRN):</span>
                  <span className="font-bold text-slate-900 text-right font-mono">
                    {profile.strnNumber || '3277876123456'}
                  </span>
                </div>
              </div>
            </div>

            <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-3 shadow-2xs">
              <h2 className="text-xs font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
                <Zap className="h-4 w-4 text-amber-500" />
                Authorized Tier-1 Distributorships
              </h2>

              <p className="text-[11px] text-slate-500">
                Official procurement and factory-backed warranties directly imported from top manufacturers:
              </p>

              <div className="flex flex-wrap gap-2">
                {(profile.authorizedDistributor || ['Longi Solar', 'Jinko Solar', 'Growatt', 'Inverex', 'Deye', 'Canadian Solar']).map((dist, idx) => (
                  <span 
                    key={idx}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-slate-100 text-slate-800 border border-slate-200"
                  >
                    <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                    <span>{dist}</span>
                  </span>
                ))}
              </div>
            </div>
          </div>

          {/* Warranty & Net-Metering Commitments */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="rounded-xl border border-emerald-200 bg-emerald-50/50 p-4 space-y-2 shadow-2xs">
              <div className="flex items-center gap-2 text-emerald-950 font-bold text-xs">
                <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                <span>Standard Warranty Commitments</span>
              </div>
              <p className="text-xs text-slate-700 leading-relaxed">
                {profile.warrantyCommitment}
              </p>
            </div>

            <div className="rounded-xl border border-blue-200 bg-blue-50/50 p-4 space-y-2 shadow-2xs">
              <div className="flex items-center gap-2 text-blue-950 font-bold text-xs">
                <Sun className="h-4 w-4 text-blue-600" />
                <span>Net-Metering (Green Meter) Guarantee</span>
              </div>
              <p className="text-xs text-slate-700 leading-relaxed">
                {profile.netMeteringGuarantees}
              </p>
            </div>
          </div>

          {/* Office & Logistics Facilities */}
          <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-2 text-xs shadow-2xs">
            <span className="font-bold text-slate-700 flex items-center gap-1">
              <MapPin className="h-3.5 w-3.5 text-amber-600" />
              Corporate Headquarters & Logistics Depot:
            </span>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-slate-600 pt-1">
              <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-200">
                <span className="font-bold text-slate-800 block">Main EPC Office:</span>
                <span>{profile.officeAddress || settings.address}</span>
              </div>
              <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-200">
                <span className="font-bold text-slate-800 block">Central Logistics Warehouse:</span>
                <span>{profile.warehouseAddress || 'Industrial Area Depot'}</span>
              </div>
            </div>
          </div>
        </div>
      ) : (
        /* EDIT FORM */
        <form onSubmit={handleSave} className="rounded-xl border border-slate-200 bg-white p-5 space-y-4 shadow-sm text-xs">
          <div className="flex items-center justify-between border-b border-slate-200 pb-2">
            <h2 className="font-bold text-sm text-slate-900">Edit Company Profile & Licenses</h2>
            <span className="text-[11px] text-slate-500">Updates will sync to all client quotations</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-[10px] font-bold text-slate-700 uppercase">Brand Tagline</label>
              <input
                type="text"
                value={formData.tagline || ''}
                onChange={(e) => setFormData({ ...formData, tagline: e.target.value })}
                className="mt-1 w-full rounded-lg border border-slate-300 p-2 text-xs"
              />
            </div>

            <div>
              <label className="text-[10px] font-bold text-slate-700 uppercase">Established Year</label>
              <input
                type="text"
                value={formData.establishedYear || ''}
                onChange={(e) => setFormData({ ...formData, establishedYear: e.target.value })}
                className="mt-1 w-full rounded-lg border border-slate-300 p-2 text-xs"
              />
            </div>

            <div>
              <label className="text-[10px] font-bold text-slate-700 uppercase">AEDB Vendor Category</label>
              <input
                type="text"
                value={formData.aedbCategory || ''}
                onChange={(e) => setFormData({ ...formData, aedbCategory: e.target.value })}
                placeholder="e.g. AEDB Certified Vendor (Category V2 / C-3)"
                className="mt-1 w-full rounded-lg border border-slate-300 p-2 text-xs"
              />
            </div>

            <div>
              <label className="text-[10px] font-bold text-slate-700 uppercase">PEC License Number</label>
              <input
                type="text"
                value={formData.pecRegistration || ''}
                onChange={(e) => setFormData({ ...formData, pecRegistration: e.target.value })}
                placeholder="e.g. PEC License: C-5 / Solar & Renewable Energy EPC"
                className="mt-1 w-full rounded-lg border border-slate-300 p-2 text-xs"
              />
            </div>

            <div>
              <label className="text-[10px] font-bold text-slate-700 uppercase">National Tax (NTN)</label>
              <input
                type="text"
                value={formData.ntnNumber || ''}
                onChange={(e) => setFormData({ ...formData, ntnNumber: e.target.value })}
                className="mt-1 w-full rounded-lg border border-slate-300 p-2 text-xs"
              />
            </div>

            <div>
              <label className="text-[10px] font-bold text-slate-700 uppercase">Sales Tax (STRN)</label>
              <input
                type="text"
                value={formData.strnNumber || ''}
                onChange={(e) => setFormData({ ...formData, strnNumber: e.target.value })}
                className="mt-1 w-full rounded-lg border border-slate-300 p-2 text-xs"
              />
            </div>

            <div>
              <label className="text-[10px] font-bold text-slate-700 uppercase">Total Completed kW Capacity</label>
              <input
                type="number"
                value={formData.completedProjectsKw || 0}
                onChange={(e) => setFormData({ ...formData, completedProjectsKw: Number(e.target.value) || 0 })}
                className="mt-1 w-full rounded-lg border border-slate-300 p-2 text-xs"
              />
            </div>

            <div>
              <label className="text-[10px] font-bold text-slate-700 uppercase">Authorized Tier-1 Brands (Comma separated)</label>
              <input
                type="text"
                value={(formData.authorizedDistributor || []).join(', ')}
                onChange={(e) => setFormData({ 
                  ...formData, 
                  authorizedDistributor: e.target.value.split(',').map((s) => s.trim()).filter(Boolean) 
                })}
                placeholder="Longi, Jinko, Growatt, Inverex, Deye"
                className="mt-1 w-full rounded-lg border border-slate-300 p-2 text-xs"
              />
            </div>
          </div>

          <div>
            <label className="text-[10px] font-bold text-slate-700 uppercase">Company Overview / Introduction</label>
            <textarea
              rows={3}
              value={formData.aboutDescription || ''}
              onChange={(e) => setFormData({ ...formData, aboutDescription: e.target.value })}
              className="mt-1 w-full rounded-lg border border-slate-300 p-2 text-xs"
            />
          </div>

          <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-200">
            <button
              type="button"
              onClick={() => setIsEditing(false)}
              className="px-4 py-2 rounded-lg border border-slate-300 text-xs font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="flex items-center gap-1.5 px-5 py-2 rounded-lg bg-amber-400 text-slate-950 font-bold text-xs hover:bg-amber-500 shadow-xs cursor-pointer"
            >
              <Save className="h-4 w-4" />
              <span>Save & Sync Profile</span>
            </button>
          </div>
        </form>
      )}
    </div>
  );

  if (asModal) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-slate-900/60 backdrop-blur-xs overflow-y-auto animate-fadeIn">
        <div className="w-full max-w-4xl max-h-[92vh] overflow-y-auto rounded-2xl bg-white p-5 shadow-2xl border border-slate-200">
          {content}
        </div>
      </div>
    );
  }

  return content;
};
