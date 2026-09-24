import React from 'react';
import { FolderGit2, ExternalLink, CheckCircle, Zap } from 'lucide-react';
import { PortfolioProjectItem } from '../../types';
import { Badge } from '../common/Badge';

interface PortfolioManagerProps {
  projects: PortfolioProjectItem[];
}

export const PortfolioManager: React.FC<PortfolioManagerProps> = ({ projects }) => {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-bold text-[#F4F1EA] flex items-center gap-2">
          <FolderGit2 className="w-5 h-5 text-[#2F7EF2]" />
          Verified D Web Studio Portfolio Case Studies
        </h2>
        <p className="text-xs text-[#8C98A9] mt-0.5">
          These verified case studies ground the AI portfolio matching engine. The AI will strictly match leads to one of these 8 categories or output NO_MATCH.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {projects.map((p) => (
          <div
            key={p.id}
            className="p-5 rounded-xl bg-[#0E131A] border border-[#1C232D] space-y-3 hover:border-[#2F7EF2]/40 transition-colors flex flex-col justify-between"
          >
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Badge type="niche" value={p.category} />
                {p.liveUrl && (
                  <a
                    href={p.liveUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="text-xs text-[#2F7EF2] hover:underline flex items-center gap-1 font-semibold"
                  >
                    Demo Link <ExternalLink className="w-3 h-3" />
                  </a>
                )}
              </div>

              <h3 className="text-base font-bold text-[#F4F1EA]">{p.title}</h3>
              <p className="text-xs text-[#C3CAD6] leading-relaxed">{p.description}</p>
            </div>

            <div className="space-y-2 pt-2 border-t border-[#1C232D]">
              {p.results && (
                <div className="text-xs font-mono text-[#7EE787] bg-[#152E20]/40 p-2.5 rounded-lg border border-[#238636]/30">
                  <span className="font-bold">Verified Result: </span>
                  {p.results}
                </div>
              )}

              {p.technologies && (
                <div className="text-[11px] text-[#8C98A9]">
                  <span className="font-semibold text-[#A0AEC0]">Tech Stack: </span>
                  {p.technologies}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
