import React from 'react';
import { Search, UploadCloud, RefreshCw, Sparkles, CheckCircle2 } from 'lucide-react';

interface HeaderProps {
  searchQuery: string;
  setSearchQuery: (q: string) => void;
  onOpenImport: () => void;
  onRefresh: () => void;
  isRefreshing?: boolean;
}

export const Header: React.FC<HeaderProps> = ({
  searchQuery,
  setSearchQuery,
  onOpenImport,
  onRefresh,
  isRefreshing = false,
}) => {
  return (
    <header className="h-16 border-b border-[#1C232D] bg-[#0C0F13]/90 backdrop-blur-md px-8 flex items-center justify-between sticky top-0 z-20">
      {/* Global Search */}
      <div className="relative w-96">
        <Search className="w-4 h-4 text-[#8C98A9] absolute left-3.5 top-1/2 -translate-y-1/2" />
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search leads by business, handle, niche, or city..."
          className="w-full bg-[#141A22] border border-[#1E2734] rounded-lg pl-10 pr-4 py-2 text-sm text-[#F4F1EA] placeholder-[#64748B] focus:outline-none focus:border-[#2F7EF2] focus:ring-1 focus:ring-[#2F7EF2] transition-all"
        />
      </div>

      {/* Action Buttons */}
      <div className="flex items-center gap-3">
        <button
          onClick={onRefresh}
          disabled={isRefreshing}
          className="p-2 text-[#C3CAD6] hover:text-[#F4F1EA] hover:bg-[#141A22] rounded-lg border border-[#1E2734] transition-colors"
          title="Refresh Data"
        >
          <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin text-[#2F7EF2]' : ''}`} />
        </button>

        <button
          onClick={onOpenImport}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-[#2F7EF2] hover:bg-[#2568cc] text-white text-xs font-semibold tracking-wide shadow-md shadow-[#2F7EF2]/20 transition-all cursor-pointer"
        >
          <UploadCloud className="w-4 h-4" />
          Import Conversations
        </button>
      </div>
    </header>
  );
};
