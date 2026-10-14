import React, { useState, useEffect } from 'react';
import { 
  GitBranch, 
  Github, 
  ExternalLink, 
  Check, 
  Copy, 
  Download, 
  AlertCircle, 
  CheckCircle2, 
  Terminal, 
  Key, 
  Sparkles, 
  HelpCircle,
  FolderGit2,
  Globe,
  Loader2
} from 'lucide-react';
import { Modal } from '../common/Modal';

interface GitHubStatus {
  initialized: boolean;
  branch?: string;
  latestCommit?: {
    hash: string;
    author: string;
    email: string;
    message: string;
    date: string;
  };
  remoteOrigin?: string | null;
  hasUncommittedChanges?: boolean;
}

interface GitHubPublishModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const GitHubPublishModal: React.FC<GitHubPublishModalProps> = ({
  isOpen,
  onClose,
}) => {
  const isVercelHost = typeof window !== 'undefined' && window.location.hostname.includes('vercel.app');
  const [activeTab, setActiveTab] = useState<'DIRECT' | 'COMMANDS' | 'DOWNLOAD'>(() => (isVercelHost ? 'DOWNLOAD' : 'DIRECT'));
  const [repoOwner, setRepoOwner] = useState('sohailahmad074-blip');
  const [repoName, setRepoName] = useState('kabal-solar');
  const [personalAccessToken, setPersonalAccessToken] = useState(() => {
    try {
      return localStorage.getItem('solarcraft_github_pat') || '';
    } catch {
      return '';
    }
  });
  const [saveTokenLocally, setSaveTokenLocally] = useState(true);
  const [commitMessage, setCommitMessage] = useState('feat: update SolarCraft ERP latest release');
  const [showToken, setShowToken] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);

  const [isLoadingStatus, setIsLoadingStatus] = useState(false);
  const [gitStatus, setGitStatus] = useState<GitHubStatus | null>(null);
  const [isDownloading, setIsDownloading] = useState(false);

  const [isPublishing, setIsPublishing] = useState(false);
  const [publishResult, setPublishResult] = useState<{
    success: boolean;
    repoUrl?: string;
    pagesUrl?: string;
    commitHash?: string;
    message?: string;
    error?: string;
    details?: string;
  } | null>(null);

  const [copiedCmd, setCopiedCmd] = useState(false);

  // Fetch Git repository state on open
  useEffect(() => {
    if (isOpen) {
      fetchGitStatus();
      setValidationError(null);
    }
  }, [isOpen]);

  const fetchGitStatus = async () => {
    setIsLoadingStatus(true);
    try {
      const res = await fetch('/api/github/status');
      if (res.ok) {
        const data = await res.json();
        setGitStatus(data);
        if (data.remoteOrigin) {
          // Try parsing existing remote origin
          const match = data.remoteOrigin.match(/github\.com[/:]([^/]+)\/([^/.]+)/);
          if (match) {
            setRepoOwner(match[1]);
            setRepoName(match[2]);
          }
        }
      }
    } catch (e) {
      console.error('Failed to load git status:', e);
    } finally {
      setIsLoadingStatus(false);
    }
  };

  const handlePublish = async (e: React.FormEvent) => {
    e.preventDefault();
    setValidationError(null);

    if (!repoOwner.trim() || !repoName.trim()) {
      setValidationError('Please enter both your GitHub username and repository name.');
      return;
    }

    if (!personalAccessToken.trim()) {
      setValidationError('Please enter your GitHub Personal Access Token (PAT). Click the link "1. Open GitHub Token Page" above to generate it in seconds.');
      return;
    }

    // Save token if requested
    try {
      if (saveTokenLocally && personalAccessToken.trim()) {
        localStorage.setItem('solarcraft_github_pat', personalAccessToken.trim());
      } else if (!saveTokenLocally) {
        localStorage.removeItem('solarcraft_github_pat');
      }
    } catch {}

    setIsPublishing(true);
    setPublishResult(null);

    try {
      const res = await fetch('/api/github/publish', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          repoOwner: repoOwner.trim(),
          repoName: repoName.trim(),
          personalAccessToken: personalAccessToken.trim(),
          commitMessage: commitMessage.trim(),
        }),
      });

      const text = await res.text();
      let data: any;
      try {
        data = JSON.parse(text);
      } catch {
        data = {
          success: false,
          error: res.status === 404 
            ? 'Publishing API endpoint is not available on this static deployment host (e.g. Vercel). Please run 1-Click Deploy from your main AI Studio workspace or use the Terminal / Zip tabs.' 
            : `Server returned non-JSON response (${res.status})`,
          details: text.length > 200 ? text.substring(0, 197) + '...' : text || 'Could not parse response from server.',
        };
      }
      setPublishResult(data);

      if (data.success) {
        // Refresh local status
        fetchGitStatus();
      }
    } catch (err: any) {
      setPublishResult({
        success: false,
        error: 'Network connection error',
        details: err.message || 'Could not connect to publishing server.',
      });
    } finally {
      setIsPublishing(false);
    }
  };

  const handleDownloadArchive = async (format: 'zip' | 'tar.gz') => {
    setIsDownloading(true);
    const filename = `solarcraft-erp-latest.${format === 'zip' ? 'zip' : 'tar.gz'}`;
    try {
      let res = await fetch(`/api/github/download-source?format=${format}`);
      if (!res.ok) {
        // Fallback to static public file (e.g. when hosted on Vercel)
        res = await fetch(`/${filename}`);
      }
      if (!res.ok) {
        throw new Error(`Server returned ${res.status}: ${res.statusText}`);
      }
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      setTimeout(() => {
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
      }, 200);
    } catch (err: any) {
      console.warn('Direct blob download failed, falling back to direct static file:', err);
      window.location.href = `/${filename}`;
    } finally {
      setIsDownloading(false);
    }
  };

  const cleanOwner = repoOwner.trim() || 'your-username';
  const cleanRepo = repoName.trim() || 'solarcraft-erp';
  const cliCommands = `# 1. Add your GitHub repository as remote
git remote add origin https://github.com/${cleanOwner}/${cleanRepo}.git

# 2. Set default branch to main
git branch -M main

# 3. Push your code & GitHub Actions workflow
git push -u origin main`;

  const copyToClipboard = () => {
    navigator.clipboard.writeText(cliCommands);
    setCopiedCmd(true);
    setTimeout(() => setCopiedCmd(false), 2000);
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} size="xl">
      <div className="p-6">
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-slate-200">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-slate-900 text-white flex items-center justify-center shadow-md">
              <Github className="h-6 w-6" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
                Deploy & Publish to GitHub
                <span className="text-[10px] bg-emerald-100 text-emerald-800 font-bold px-2 py-0.5 rounded-full border border-emerald-300">
                  Ready for CI/CD
                </span>
              </h2>
              <p className="text-xs text-slate-500">
                Publish SolarCraft ERP with automated GitHub Actions & GitHub Pages deployment
              </p>
            </div>
          </div>
        </div>

        {/* Git Repository Status Card */}
        <div className="mt-4 bg-slate-50 border border-slate-200 rounded-xl p-3 flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-2">
            <FolderGit2 className="h-4 w-4 text-slate-600" />
            <span className="text-slate-500">Branch:</span>
            <span className="font-mono font-bold text-slate-800 bg-white px-2 py-0.5 rounded border border-slate-200">
              {gitStatus?.branch || 'main'}
            </span>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-slate-500">Latest Commit:</span>
            <span className="font-mono text-slate-700 bg-white px-2 py-0.5 rounded border border-slate-200 truncate max-w-[200px]" title={gitStatus?.latestCommit?.message}>
              {gitStatus?.latestCommit?.hash ? gitStatus.latestCommit.hash.substring(0, 7) : 'Initial'} - {gitStatus?.latestCommit?.message || 'Ready'}
            </span>
          </div>

          <div className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
            <span className="font-semibold text-emerald-700">Repository Initialized</span>
          </div>
        </div>

        {/* Tab Selection */}
        <div className="flex border-b border-slate-200 mt-4 text-xs font-bold">
          <button
            type="button"
            onClick={() => setActiveTab('DIRECT')}
            className={`pb-2.5 px-4 border-b-2 flex items-center gap-2 transition-all cursor-pointer ${
              activeTab === 'DIRECT'
                ? 'border-slate-900 text-slate-900'
                : 'border-transparent text-slate-400 hover:text-slate-600'
            }`}
          >
            <Sparkles className="h-4 w-4 text-amber-500" />
            <span>1-Click Deploy (Direct)</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('COMMANDS')}
            className={`pb-2.5 px-4 border-b-2 flex items-center gap-2 transition-all cursor-pointer ${
              activeTab === 'COMMANDS'
                ? 'border-slate-900 text-slate-900'
                : 'border-transparent text-slate-400 hover:text-slate-600'
            }`}
          >
            <Terminal className="h-4 w-4 text-blue-500" />
            <span>Terminal CLI Commands</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('DOWNLOAD')}
            className={`pb-2.5 px-4 border-b-2 flex items-center gap-2 transition-all cursor-pointer ${
              activeTab === 'DOWNLOAD'
                ? 'border-slate-900 text-slate-900'
                : 'border-transparent text-slate-400 hover:text-slate-600'
            }`}
          >
            <Download className="h-4 w-4 text-emerald-600" />
            <span>Source Code Archive</span>
          </button>
        </div>

        {/* Tab 1: Direct 1-Click Publish */}
        {activeTab === 'DIRECT' && (
          <form onSubmit={handlePublish} className="mt-4 space-y-4 text-xs">
            {validationError && (
              <div className="bg-amber-50 border border-amber-300 rounded-xl p-3 text-amber-950 flex items-start gap-2 animate-in fade-in duration-200">
                <AlertCircle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
                <div className="text-xs">
                  <strong>Notice:</strong> {validationError}
                </div>
              </div>
            )}

            {publishResult?.success && (
              <div className="bg-emerald-50 border border-emerald-300 rounded-xl p-4 text-emerald-950 space-y-2 animate-in fade-in duration-200">
                <div className="flex items-center gap-2 text-emerald-800 font-bold text-sm">
                  <CheckCircle2 className="h-5 w-5 text-emerald-600" />
                  <span>Successfully Published to GitHub!</span>
                </div>
                <p className="text-xs text-emerald-800">
                  Your code, README documentation, and automated GitHub Pages workflow were pushed to branch <strong>main</strong>.
                </p>

                <div className="pt-2 flex flex-wrap gap-2">
                  <a
                    href={publishResult.repoUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-900 text-white font-bold rounded-lg hover:bg-slate-800 text-xs shadow-xs"
                  >
                    <Github className="h-3.5 w-3.5" />
                    <span>View GitHub Repository</span>
                    <ExternalLink className="h-3 w-3" />
                  </a>

                  <a
                    href={`${publishResult.repoUrl}/settings/pages`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 text-white font-bold rounded-lg hover:bg-emerald-700 text-xs shadow-xs"
                  >
                    <Globe className="h-3.5 w-3.5" />
                    <span>Activate GitHub Pages in Settings</span>
                    <ExternalLink className="h-3 w-3" />
                  </a>
                </div>

                <div className="mt-3 p-2.5 bg-emerald-100/70 border border-emerald-300/80 rounded-lg text-[11px] text-emerald-900">
                  <strong>How to view your live website:</strong> In your GitHub repo, go to <strong>Settings ➔ Pages</strong>, select <strong>Source: GitHub Actions</strong>. GitHub will automatically deploy your live app in ~60 seconds!
                </div>
              </div>
            )}

            {publishResult && !publishResult.success && (
              <div className="bg-rose-50 border border-rose-300 rounded-xl p-4 text-rose-950 space-y-1 animate-in fade-in duration-200">
                <div className="flex items-center gap-2 text-rose-800 font-bold text-sm">
                  <AlertCircle className="h-5 w-5 text-rose-600" />
                  <span>Deployment Failed</span>
                </div>
                <p className="text-xs text-rose-800">{publishResult.error}</p>
                {publishResult.details && (
                  <pre className="mt-2 p-2 bg-rose-100/70 rounded text-[11px] font-mono text-rose-900 overflow-x-auto whitespace-pre-wrap">
                    {publishResult.details}
                  </pre>
                )}
                <p className="text-[11px] text-rose-700 pt-1">
                  💡 Tip: Make sure the repository exists on GitHub, and your Personal Access Token has the <strong>repo</strong> permission checked.
                </p>
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-slate-700 font-bold mb-1">
                  GitHub Username / Organization <span className="text-rose-500">*</span>
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 font-mono">@</span>
                  <input
                    type="text"
                    required
                    value={repoOwner}
                    onChange={(e) => setRepoOwner(e.target.value)}
                    placeholder="e.g. sohailahmad074"
                    className="w-full pl-7 pr-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-slate-900 focus:border-slate-900 font-mono text-xs"
                  />
                </div>
              </div>

              <div>
                <label className="block text-slate-700 font-bold mb-1">
                  Repository Name <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={repoName}
                  onChange={(e) => setRepoName(e.target.value)}
                  placeholder="solarcraft-erp"
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-slate-900 focus:border-slate-900 font-mono text-xs"
                />
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-slate-700 font-bold flex items-center gap-1.5">
                  <Key className="h-3.5 w-3.5 text-amber-500" />
                  <span>GitHub Personal Access Token (PAT)</span>
                </label>
                <a
                  href="https://github.com/settings/tokens/new?scopes=repo&description=SolarCraft+ERP+Deploy"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-600 hover:text-blue-800 font-bold flex items-center gap-1 text-[11px] bg-blue-50 px-2 py-0.5 rounded border border-blue-200 hover:bg-blue-100 transition-colors"
                >
                  <span>1. Open GitHub Token Page</span>
                  <ExternalLink className="h-3 w-3" />
                </a>
              </div>

              {/* Step-by-step guide for generating the token on GitHub */}
              <div className="mb-2 p-3 bg-amber-50/80 border border-amber-200 rounded-lg text-[11px] text-amber-900 space-y-2">
                <div className="font-bold text-amber-950 flex items-center gap-1.5">
                  <AlertCircle className="h-3.5 w-3.5 text-amber-600" />
                  <span>Seeing the "New personal access token (classic)" page on GitHub?</span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-1">
                  <div className="bg-white p-2 rounded border border-amber-200/80">
                    <div className="font-bold text-slate-800 text-[10px] uppercase tracking-wider text-amber-700">Step 1</div>
                    <p className="mt-0.5 text-slate-700">Scroll down to the <strong>very bottom</strong> of that GitHub page.</p>
                  </div>
                  <div className="bg-white p-2 rounded border border-amber-200/80">
                    <div className="font-bold text-slate-800 text-[10px] uppercase tracking-wider text-amber-700">Step 2</div>
                    <p className="mt-0.5 text-slate-700">Click the green button: <strong className="text-emerald-700">"Generate token"</strong>.</p>
                  </div>
                  <div className="bg-white p-2 rounded border border-amber-200/80">
                    <div className="font-bold text-slate-800 text-[10px] uppercase tracking-wider text-amber-700">Step 3</div>
                    <p className="mt-0.5 text-slate-700">Copy the code starting with <strong className="font-mono text-emerald-800">ghp_...</strong> and paste it below.</p>
                  </div>
                </div>
              </div>

              <div className="relative">
                <input
                  type={showToken ? 'text' : 'password'}
                  value={personalAccessToken}
                  onChange={(e) => setPersonalAccessToken(e.target.value)}
                  placeholder="ghp_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
                  className="w-full pl-3 pr-16 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-slate-900 focus:border-slate-900 font-mono text-xs"
                />
                <button
                  type="button"
                  onClick={() => setShowToken(!showToken)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 px-2 py-1 text-[10px] text-slate-500 hover:text-slate-800 font-bold rounded cursor-pointer"
                >
                  {showToken ? 'Hide' : 'Show'}
                </button>
              </div>

              <div className="mt-2 flex items-center justify-between text-[11px]">
                <label className="flex items-center gap-1.5 cursor-pointer text-slate-600 font-medium">
                  <input
                    type="checkbox"
                    checked={saveTokenLocally}
                    onChange={(e) => setSaveTokenLocally(e.target.checked)}
                    className="rounded border-slate-300 text-slate-900 focus:ring-slate-900"
                  />
                  <span>Save token on this device for future 1-click publishing</span>
                </label>
                <span className="text-slate-400">
                  {personalAccessToken ? 'Token loaded' : 'No token entered'}
                </span>
              </div>
            </div>

            <div>
              <label className="block text-slate-700 font-semibold mb-1">
                Release Commit Message
              </label>
              <input
                type="text"
                value={commitMessage}
                onChange={(e) => setCommitMessage(e.target.value)}
                placeholder="feat: latest SolarCraft ERP updates"
                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-slate-900 focus:border-slate-900 text-xs"
              />
            </div>

            <div className="pt-2 flex items-center justify-between">
              <div className="text-[11px] text-slate-500">
                Destination: <strong className="text-slate-800">https://github.com/{cleanOwner}/{cleanRepo}</strong>
              </div>

              <button
                type="submit"
                disabled={isPublishing || !repoOwner.trim() || !repoName.trim()}
                className="px-5 py-2.5 bg-slate-900 hover:bg-slate-800 text-white font-bold rounded-lg shadow-sm flex items-center gap-2 cursor-pointer transition-all disabled:opacity-50"
              >
                {isPublishing ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin text-amber-400" />
                    <span>Deploying & Pushing...</span>
                  </>
                ) : (
                  <>
                    <Github className="h-4 w-4" />
                    <span>Deploy to GitHub Now</span>
                  </>
                )}
              </button>
            </div>
          </form>
        )}

        {/* Tab 2: Terminal / CLI */}
        {activeTab === 'COMMANDS' && (
          <div className="mt-4 space-y-4 text-xs">
            <p className="text-slate-600">
              Prefer working in your local terminal? Run these exact commands in your project root folder to link and push your code:
            </p>

            <div className="relative bg-slate-900 text-slate-100 rounded-xl p-4 font-mono text-xs leading-relaxed border border-slate-800">
              <button
                type="button"
                onClick={copyToClipboard}
                className="absolute top-3 right-3 px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded text-[11px] font-sans font-bold flex items-center gap-1.5 transition-colors cursor-pointer border border-slate-700"
              >
                {copiedCmd ? (
                  <>
                    <Check className="h-3.5 w-3.5 text-emerald-400" />
                    <span className="text-emerald-300">Copied!</span>
                  </>
                ) : (
                  <>
                    <Copy className="h-3.5 w-3.5" />
                    <span>Copy Commands</span>
                  </>
                )}
              </button>
              <pre className="overflow-x-auto whitespace-pre">
                {cliCommands}
              </pre>
            </div>

            <div className="bg-blue-50 border border-blue-200 rounded-xl p-3.5 text-blue-950 space-y-2">
              <div className="font-bold flex items-center gap-1.5 text-blue-900">
                <Globe className="h-4 w-4 text-blue-600" />
                <span>Automated GitHub Pages Deployment Included</span>
              </div>
              <p className="text-[11px] text-blue-800">
                The repository already has <code>.github/workflows/deploy.yml</code> committed. Once you push:
              </p>
              <ol className="list-decimal list-inside space-y-1 text-[11px] text-blue-900 pl-1 font-medium">
                <li>Go to your repository ➔ <strong>Settings</strong> ➔ <strong>Pages</strong></li>
                <li>Under <strong>Source</strong>, select <strong>GitHub Actions</strong></li>
                <li>Your app will be automatically published at <code>https://{cleanOwner}.github.io/{cleanRepo}/</code></li>
              </ol>
            </div>
          </div>
        )}

        {/* Tab 3: Download Clean Source Archive */}
        {activeTab === 'DOWNLOAD' && (
          <div className="mt-4 space-y-4 text-xs">
            <div className="p-3 bg-blue-50 border border-blue-200 rounded-xl text-blue-900 text-[11px] flex items-start gap-2">
              <Sparkles className="h-4 w-4 text-blue-600 shrink-0 mt-0.5" />
              <div>
                <strong>Notice:</strong> Please make sure you are in the <strong>Google AI Studio tab</strong> (Remix SolarCraft ERP) when clicking download. On static Vercel links like <code>kabal-solar.vercel.app</code>, the server archive generator is not running until deployed.
              </div>
            </div>

            <p className="text-slate-600">
              Download a clean, production-ready source code bundle of SolarCraft ERP. You can drag and drop this archive onto GitHub, or unzip it to work on your computer.
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="border border-slate-200 rounded-xl p-3 bg-slate-50 flex flex-col justify-between gap-3">
                <div className="space-y-1">
                  <div className="font-bold text-slate-800 flex items-center gap-1.5">
                    <Download className="h-4 w-4 text-emerald-600" />
                    <span>Windows / Mac ZIP Bundle</span>
                  </div>
                  <p className="text-[11px] text-slate-500">
                    <code>solarcraft-erp-latest.zip</code> — Easiest for Windows, Mac & GitHub Uploads.
                  </p>
                </div>

                <button
                  type="button"
                  disabled={isDownloading}
                  onClick={() => handleDownloadArchive('zip')}
                  className="w-full px-3 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-bold rounded-lg shadow-xs flex items-center justify-center gap-2 cursor-pointer transition-colors text-center"
                >
                  {isDownloading ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin text-white" />
                      <span>Preparing Download...</span>
                    </>
                  ) : (
                    <>
                      <Download className="h-4 w-4" />
                      <span>Download .ZIP</span>
                    </>
                  )}
                </button>
              </div>

              <div className="border border-slate-200 rounded-xl p-3 bg-slate-50 flex flex-col justify-between gap-3">
                <div className="space-y-1">
                  <div className="font-bold text-slate-800 flex items-center gap-1.5">
                    <Download className="h-4 w-4 text-slate-700" />
                    <span>Linux / TAR.GZ Bundle</span>
                  </div>
                  <p className="text-[11px] text-slate-500">
                    <code>solarcraft-erp-latest.tar.gz</code> — Standard Linux/Unix compressed tarball.
                  </p>
                </div>

                <button
                  type="button"
                  disabled={isDownloading}
                  onClick={() => handleDownloadArchive('tar.gz')}
                  className="w-full px-3 py-2 bg-slate-800 hover:bg-slate-900 disabled:opacity-50 text-white font-bold rounded-lg shadow-xs flex items-center justify-center gap-2 cursor-pointer transition-colors text-center"
                >
                  {isDownloading ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin text-white" />
                      <span>Preparing Download...</span>
                    </>
                  ) : (
                    <>
                      <Download className="h-4 w-4" />
                      <span>Download .TAR.GZ</span>
                    </>
                  )}
                </button>
              </div>
            </div>

            <div className="p-3 bg-amber-50 border border-amber-300 rounded-xl text-amber-950 text-xs space-y-2">
              <div className="font-bold flex items-center gap-1.5 text-amber-900">
                <AlertCircle className="h-4 w-4 text-amber-600 shrink-0" />
                <span>Important Note on GitHub Web Upload:</span>
              </div>
              <p className="text-[11px] leading-relaxed text-amber-900">
                GitHub&apos;s website (&ldquo;Add file ➔ Upload files&rdquo;) <strong>does not upload subfolders like <code>src/</code></strong> when dragged into a web browser. To update your GitHub repository and trigger Vercel deployment:
              </p>
              <ul className="text-[11px] list-disc list-inside space-y-1 text-amber-900 pl-1">
                <li><strong>Recommended (1-Click):</strong> Switch to the <strong>&ldquo;1-Click Deploy&rdquo;</strong> tab in this modal inside your AI Studio workspace with a GitHub Personal Access Token.</li>
                <li><strong>Using GitHub Desktop:</strong> Clone your repo <code>sohailahmad074-blip/kabal-solar</code>, extract the ZIP into that folder, and click <em>Commit & Push</em>.</li>
                <li><strong>Using Git Bash / Terminal:</strong> Extract the ZIP, open terminal in that folder, and run:
                  <code className="block mt-1 p-1.5 bg-amber-100 rounded font-mono text-[10px] select-all">git init && git add -A && git commit -m &quot;update&quot; && git branch -M main && git remote add origin https://github.com/sohailahmad074-blip/kabal-solar.git && git push -u origin main --force</code>
                </li>
              </ul>
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="mt-6 pt-4 border-t border-slate-200 flex items-center justify-between text-xs">
          <span className="text-slate-400">
            SolarCraft ERP • Production Build
          </span>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-lg transition-colors cursor-pointer"
          >
            Close
          </button>
        </div>
      </div>
    </Modal>
  );
};
