import React, { useState, useEffect } from 'react';
import {
  UploadCloud,
  FileArchive,
  MessageCircle,
  PhoneCall,
  CheckCircle2,
  AlertCircle,
  FolderOpen,
  RefreshCw,
  Clock,
  ArrowRight,
} from 'lucide-react';
import { api } from '../../lib/api';
import { ImportItem } from '../../types';

interface ImportManagerProps {
  onImportCompleted: () => void;
}

export const ImportManager: React.FC<ImportManagerProps> = ({ onImportCompleted }) => {
  const [activeTab, setActiveTab] = useState<'instagram' | 'whatsapp' | 'calls' | 'history'>('instagram');
  const [imports, setImports] = useState<ImportItem[]>([]);
  const [folderStatus, setFolderStatus] = useState<{
    folderPath: string;
    zipFiles: string[];
    hasZip: boolean;
  } | null>(null);

  const [isProcessing, setIsProcessing] = useState(false);
  const [importNotice, setImportNotice] = useState<{ type: 'success' | 'error'; message: string; details?: any } | null>(null);

  // Instagram upload state
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  // WhatsApp state
  const [waText, setWaText] = useState('');
  const [waTitle, setWaTitle] = useState('');

  // Call state
  const [callTranscript, setCallTranscript] = useState('');
  const [callTitle, setCallTitle] = useState('');
  const [callNotes, setCallNotes] = useState('');
  const [durationMinutes, setDurationMinutes] = useState(25);

  const loadData = async () => {
    try {
      const [history, folder] = await Promise.all([
        api.getImports(),
        api.checkInstagramFolder(),
      ]);
      setImports(history);
      setFolderStatus(folder);
    } catch (err) {
      console.error('Error loading import status:', err);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleInstagramImport = async (useFolderZip = false) => {
    try {
      setIsProcessing(true);
      setImportNotice(null);
      const res = await api.importInstagramZip(useFolderZip ? undefined : selectedFile || undefined);
      setImportNotice({
        type: 'success',
        message: 'Instagram import processed successfully!',
        details: res.data,
      });
      setSelectedFile(null);
      await loadData();
      onImportCompleted();
    } catch (err: any) {
      setImportNotice({
        type: 'error',
        message: err?.message || 'Instagram import failed',
      });
    } finally {
      setIsProcessing(false);
    }
  };

  const handleWhatsAppImport = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!waText.trim()) return;

    try {
      setIsProcessing(true);
      setImportNotice(null);
      const res = await api.importWhatsApp(waText, waTitle || undefined);
      setImportNotice({
        type: 'success',
        message: 'WhatsApp conversation imported and analyzed!',
        details: res.data,
      });
      setWaText('');
      setWaTitle('');
      await loadData();
      onImportCompleted();
    } catch (err: any) {
      setImportNotice({
        type: 'error',
        message: err?.message || 'WhatsApp import failed',
      });
    } finally {
      setIsProcessing(false);
    }
  };

  const handleCallImport = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!callTranscript.trim()) return;

    try {
      setIsProcessing(true);
      setImportNotice(null);
      const res = await api.importCall(callTranscript, {
        title: callTitle || undefined,
        callNotes: callNotes || undefined,
        durationMinutes,
      });
      setImportNotice({
        type: 'success',
        message: 'Discovery call transcript imported and intelligence generated!',
        details: res.data,
      });
      setCallTranscript('');
      setCallTitle('');
      setCallNotes('');
      await loadData();
      onImportCompleted();
    } catch (err: any) {
      setImportNotice({
        type: 'error',
        message: err?.message || 'Call import failed',
      });
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Tab Selector */}
      <div className="flex border-b border-[#1C232D] gap-8">
        <button
          onClick={() => setActiveTab('instagram')}
          className={`py-3 text-xs font-semibold tracking-wide border-b-2 flex items-center gap-2 transition-all ${
            activeTab === 'instagram'
              ? 'border-[#2F7EF2] text-[#6FB2FF]'
              : 'border-transparent text-[#8C98A9] hover:text-[#C3CAD6]'
          }`}
        >
          <FileArchive className="w-4 h-4" />
          Instagram Data Export (.ZIP)
        </button>
        <button
          onClick={() => setActiveTab('whatsapp')}
          className={`py-3 text-xs font-semibold tracking-wide border-b-2 flex items-center gap-2 transition-all ${
            activeTab === 'whatsapp'
              ? 'border-[#2F7EF2] text-[#6FB2FF]'
              : 'border-transparent text-[#8C98A9] hover:text-[#C3CAD6]'
          }`}
        >
          <MessageCircle className="w-4 h-4" />
          WhatsApp Chat Export (.TXT)
        </button>
        <button
          onClick={() => setActiveTab('calls')}
          className={`py-3 text-xs font-semibold tracking-wide border-b-2 flex items-center gap-2 transition-all ${
            activeTab === 'calls'
              ? 'border-[#2F7EF2] text-[#6FB2FF]'
              : 'border-transparent text-[#8C98A9] hover:text-[#C3CAD6]'
          }`}
        >
          <PhoneCall className="w-4 h-4" />
          Discovery Call Transcripts
        </button>
        <button
          onClick={() => setActiveTab('history')}
          className={`py-3 text-xs font-semibold tracking-wide border-b-2 flex items-center gap-2 transition-all ml-auto ${
            activeTab === 'history'
              ? 'border-[#2F7EF2] text-[#6FB2FF]'
              : 'border-transparent text-[#8C98A9] hover:text-[#C3CAD6]'
          }`}
        >
          <Clock className="w-4 h-4" />
          Import History ({imports.length})
        </button>
      </div>

      {/* Result Notice */}
      {importNotice && (
        <div
          className={`p-4 rounded-xl border flex items-start gap-3 text-xs ${
            importNotice.type === 'success'
              ? 'bg-[#12241A] border-[#238636] text-[#7EE787]'
              : 'bg-[#2E1618] border-[#5A2B2F] text-[#FF8E8E]'
          }`}
        >
          {importNotice.type === 'success' ? (
            <CheckCircle2 className="w-5 h-5 shrink-0 text-[#7EE787]" />
          ) : (
            <AlertCircle className="w-5 h-5 shrink-0 text-[#FF8E8E]" />
          )}
          <div className="space-y-1">
            <div className="font-bold">{importNotice.message}</div>
            {importNotice.details && (
              <div className="font-mono text-[11px] text-[#A0AEC0]">
                {importNotice.details.conversationCount !== undefined && (
                  <span>
                    Discovered: {importNotice.details.filesDiscovered} files | Convos: {importNotice.details.conversationCount} | Leads Created: {importNotice.details.leadsCreated}
                  </span>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 1: INSTAGRAM EXPORT */}
      {activeTab === 'instagram' && (
        <div className="space-y-6">
          {/* Method 1: Local Folder Detection */}
          <div className="p-5 rounded-xl bg-[#0E131A] border border-[#1C232D] space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-[#F4F1EA] flex items-center gap-2">
                  <FolderOpen className="w-4 h-4 text-[#2F7EF2]" />
                  Local Export Directory Scanner
                </h3>
                <p className="text-xs text-[#8C98A9] mt-0.5">
                  Drop your downloaded Instagram data export ZIP directly into{' '}
                  <code className="bg-[#141A22] text-[#93C5FD] px-1.5 py-0.5 rounded font-mono">
                    data/instagram/export/
                  </code>
                </p>
              </div>
              <button
                onClick={loadData}
                className="p-1.5 text-[#8C98A9] hover:text-white rounded-lg border border-[#1E2734]"
                title="Rescan Folder"
              >
                <RefreshCw className="w-3.5 h-3.5" />
              </button>
            </div>

            {folderStatus?.hasZip ? (
              <div className="p-3.5 rounded-lg bg-[#141F2D] border border-[#2F7EF2]/40 flex items-center justify-between">
                <div>
                  <div className="text-xs font-semibold text-[#6FB2FF] flex items-center gap-1.5">
                    <CheckCircle2 className="w-4 h-4 text-[#7EE787]" />
                    Detected ZIP File: {folderStatus.zipFiles[0]}
                  </div>
                  <p className="text-[11px] text-[#8C98A9] mt-0.5">
                    Ready to extract, parse, normalize, and extract qualified leads.
                  </p>
                </div>
                <button
                  onClick={() => handleInstagramImport(true)}
                  disabled={isProcessing}
                  className="px-4 py-2 rounded-lg bg-[#2F7EF2] hover:bg-[#2568cc] text-white text-xs font-semibold shadow-md shadow-[#2F7EF2]/20 disabled:opacity-50 cursor-pointer"
                >
                  {isProcessing ? 'Processing...' : 'Run Pipeline on Detected ZIP'}
                </button>
              </div>
            ) : (
              <div className="p-3.5 rounded-lg bg-[#12171F] border border-[#1E2734] text-xs text-[#8C98A9]">
                No ZIP files currently found in <code className="text-[#C3CAD6]">data/instagram/export/</code>. You can drop a ZIP file into that folder or use the direct upload below.
              </div>
            )}
          </div>

          {/* Method 2: Direct File Upload */}
          <div className="p-5 rounded-xl bg-[#0E131A] border border-[#1C232D] space-y-4">
            <h3 className="text-sm font-bold text-[#F4F1EA] flex items-center gap-2">
              <UploadCloud className="w-4 h-4 text-[#2F7EF2]" />
              Direct Upload Instagram Export ZIP
            </h3>

            <div className="border-2 border-dashed border-[#1E2734] hover:border-[#2F7EF2]/50 rounded-xl p-8 text-center transition-colors">
              <FileArchive className="w-10 h-10 text-[#2F7EF2] mx-auto mb-2 opacity-80" />
              <p className="text-xs font-semibold text-[#F4F1EA]">
                {selectedFile ? selectedFile.name : 'Select or drop your Instagram export ZIP file'}
              </p>
              <p className="text-[11px] text-[#8C98A9] mt-1">
                Accepts official Meta / Instagram data download archives (up to 100MB).
              </p>

              <input
                type="file"
                accept=".zip"
                id="ig-zip-input"
                className="hidden"
                onChange={(e) => {
                  if (e.target.files?.[0]) setSelectedFile(e.target.files[0]);
                }}
              />
              <label
                htmlFor="ig-zip-input"
                className="mt-4 inline-block px-4 py-2 rounded-lg bg-[#141A22] hover:bg-[#1E2734] text-[#C3CAD6] hover:text-[#F4F1EA] text-xs font-semibold border border-[#1E2734] cursor-pointer"
              >
                Browse ZIP File
              </label>
            </div>

            {selectedFile && (
              <button
                onClick={() => handleInstagramImport(false)}
                disabled={isProcessing}
                className="w-full py-2.5 rounded-lg bg-[#2F7EF2] hover:bg-[#2568cc] text-white text-xs font-semibold shadow-md shadow-[#2F7EF2]/20 disabled:opacity-50 cursor-pointer"
              >
                {isProcessing ? 'Extracting & Analyzing...' : `Upload & Process ${selectedFile.name}`}
              </button>
            )}
          </div>
        </div>
      )}

      {/* TAB 2: WHATSAPP EXPORT */}
      {activeTab === 'whatsapp' && (
        <form onSubmit={handleWhatsAppImport} className="p-5 rounded-xl bg-[#0E131A] border border-[#1C232D] space-y-4">
          <div>
            <h3 className="text-sm font-bold text-[#F4F1EA] flex items-center gap-2">
              <MessageCircle className="w-4 h-4 text-[#2F7EF2]" />
              Import WhatsApp Conversation
            </h3>
            <p className="text-xs text-[#8C98A9] mt-0.5">
              Paste the exported WhatsApp chat text. Standard timestamp formats like <code className="font-mono text-[#93C5FD]">[DD/MM/YYYY, HH:MM:SS] Sender: Message</code> are recognized automatically.
            </p>
          </div>

          <div>
            <label className="block text-xs font-semibold text-[#8C98A9] mb-1">
              Contact or Business Title (Optional)
            </label>
            <input
              type="text"
              value={waTitle}
              onChange={(e) => setWaTitle(e.target.value)}
              placeholder="e.g. Osteria Bistro WhatsApp Inbound"
              className="w-full bg-[#141A22] border border-[#1E2734] rounded-lg px-3 py-2 text-xs text-[#F4F1EA] focus:outline-none focus:border-[#2F7EF2]"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-[#8C98A9] mb-1">
              Chat Log Transcript
            </label>
            <textarea
              rows={8}
              value={waText}
              onChange={(e) => setWaText(e.target.value)}
              placeholder={`[14/03/2025, 10:14:02] Elena Rossi: Hi D Web Studio, we love your restaurant designs.\n[14/03/2025, 10:15:10] D Web Studio: Hey Elena! Thanks for reaching out. What kind of website are you looking to create?\n[14/03/2025, 10:16:45] Elena Rossi: We need an online menu with reservation booking for our Italian bistro.`}
              className="w-full bg-[#141A22] border border-[#1E2734] rounded-lg p-3 text-xs text-[#F4F1EA] font-mono placeholder-[#64748B] focus:outline-none focus:border-[#2F7EF2]"
            />
          </div>

          <button
            type="submit"
            disabled={isProcessing || !waText.trim()}
            className="px-5 py-2.5 rounded-lg bg-[#2F7EF2] hover:bg-[#2568cc] text-white text-xs font-semibold shadow-md shadow-[#2F7EF2]/20 disabled:opacity-50 cursor-pointer"
          >
            {isProcessing ? 'Analyzing WhatsApp...' : 'Import & Analyze WhatsApp Chat'}
          </button>
        </form>
      )}

      {/* TAB 3: CALL TRANSCRIPTS */}
      {activeTab === 'calls' && (
        <form onSubmit={handleCallImport} className="p-5 rounded-xl bg-[#0E131A] border border-[#1C232D] space-y-4">
          <div>
            <h3 className="text-sm font-bold text-[#F4F1EA] flex items-center gap-2">
              <PhoneCall className="w-4 h-4 text-[#2F7EF2]" />
              Import Discovery Call Transcript
            </h3>
            <p className="text-xs text-[#8C98A9] mt-0.5">
              Paste speaker turns from meeting tools or client notes. Identifies objections, pricing signals, and next actions.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-[#8C98A9] mb-1">
                Call Title / Client Name
              </label>
              <input
                type="text"
                value={callTitle}
                onChange={(e) => setCallTitle(e.target.value)}
                placeholder="e.g. David Vance Executive Discovery Call"
                className="w-full bg-[#141A22] border border-[#1E2734] rounded-lg px-3 py-2 text-xs text-[#F4F1EA] focus:outline-none focus:border-[#2F7EF2]"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-[#8C98A9] mb-1">
                Call Duration (Minutes)
              </label>
              <input
                type="number"
                value={durationMinutes}
                onChange={(e) => setDurationMinutes(parseInt(e.target.value, 10) || 20)}
                className="w-full bg-[#141A22] border border-[#1E2734] rounded-lg px-3 py-2 text-xs text-[#F4F1EA] focus:outline-none focus:border-[#2F7EF2]"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-[#8C98A9] mb-1">
              Speaker Transcript
            </label>
            <textarea
              rows={8}
              value={callTranscript}
              onChange={(e) => setCallTranscript(e.target.value)}
              placeholder={`Host: Thanks for joining the call today.\nClient: Hi, we run an executive coaching consultancy and need to replace our old Squarespace site.\nHost: What is your primary conversion goal for the new platform?\nClient: Booking $5,000 executive advisory packages without back-and-forth emails.`}
              className="w-full bg-[#141A22] border border-[#1E2734] rounded-lg p-3 text-xs text-[#F4F1EA] font-mono placeholder-[#64748B] focus:outline-none focus:border-[#2F7EF2]"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-[#8C98A9] mb-1">
              Sales Operator Notes (Optional)
            </label>
            <input
              type="text"
              value={callNotes}
              onChange={(e) => setCallNotes(e.target.value)}
              placeholder="e.g. Decision maker wants launch before Q3 summit."
              className="w-full bg-[#141A22] border border-[#1E2734] rounded-lg px-3 py-2 text-xs text-[#F4F1EA] focus:outline-none focus:border-[#2F7EF2]"
            />
          </div>

          <button
            type="submit"
            disabled={isProcessing || !callTranscript.trim()}
            className="px-5 py-2.5 rounded-lg bg-[#2F7EF2] hover:bg-[#2568cc] text-white text-xs font-semibold shadow-md shadow-[#2F7EF2]/20 disabled:opacity-50 cursor-pointer"
          >
            {isProcessing ? 'Analyzing Call...' : 'Process & Generate Intelligence'}
          </button>
        </form>
      )}

      {/* TAB 4: IMPORT HISTORY */}
      {activeTab === 'history' && (
        <div className="rounded-xl border border-[#1C232D] bg-[#0C0F13] overflow-hidden">
          <table className="w-full text-left text-xs text-[#C3CAD6]">
            <thead className="bg-[#0E131A] text-[#8C98A9] uppercase font-mono text-[11px] border-b border-[#1C232D]">
              <tr>
                <th className="py-3 px-4">Source & File</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4">Files Discovered</th>
                <th className="py-3 px-4">Conversations</th>
                <th className="py-3 px-4">Messages</th>
                <th className="py-3 px-4">Leads Extracted</th>
                <th className="py-3 px-4">Date</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#18202B]">
              {imports.map((imp) => (
                <tr key={imp.id} className="hover:bg-[#121820]">
                  <td className="py-3 px-4">
                    <div className="font-semibold text-[#F4F1EA]">{imp.fileName}</div>
                    <div className="text-[10px] font-mono text-[#8C98A9]">{imp.source}</div>
                  </td>
                  <td className="py-3 px-4">
                    <span
                      className={`font-mono text-[10px] px-2 py-0.5 rounded ${
                        imp.status === 'COMPLETED'
                          ? 'bg-[#152E20] text-[#7EE787]'
                          : imp.status === 'FAILED'
                          ? 'bg-[#2E1618] text-[#FF8E8E]'
                          : 'bg-[#141A22] text-[#6FB2FF]'
                      }`}
                    >
                      {imp.status}
                    </span>
                  </td>
                  <td className="py-3 px-4 font-mono">{imp.filesDiscovered || '-'}</td>
                  <td className="py-3 px-4 font-mono">{imp.conversationCount}</td>
                  <td className="py-3 px-4 font-mono">{imp.messageCount}</td>
                  <td className="py-3 px-4 font-mono font-bold text-[#6FB2FF]">{imp.leadCount}</td>
                  <td className="py-3 px-4 text-[#8C98A9]">
                    {new Date(imp.createdAt).toLocaleDateString()}
                  </td>
                </tr>
              ))}
              {imports.length === 0 && (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-[#8C98A9]">
                    No imports recorded yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};
