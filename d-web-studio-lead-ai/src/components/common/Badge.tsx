import React from 'react';
import { LeadStatus, LeadIntent, QualificationStatus } from '../../types';

interface BadgeProps {
  type?: 'status' | 'intent' | 'qualification' | 'confidence' | 'niche' | 'source';
  value: string;
  className?: string;
}

export const Badge: React.FC<BadgeProps> = ({ type = 'status', value, className = '' }) => {
  let style = 'bg-[#1C232D] text-[#C3CAD6] border-[#2A3441]';

  if (type === 'intent') {
    switch (value as LeadIntent) {
      case 'INTERESTED':
        style = 'bg-[#2F7EF2]/15 text-[#6FB2FF] border-[#2F7EF2]/40';
        break;
      case 'POSSIBLY_INTERESTED':
        style = 'bg-[#2F7EF2]/10 text-[#96C5FF] border-[#2F7EF2]/25';
        break;
      case 'NEUTRAL':
        style = 'bg-[#1A222D] text-[#A0AEC0] border-[#2A3648]';
        break;
      case 'NOT_INTERESTED':
        style = 'bg-[#2B1B1D] text-[#FF8E8E] border-[#5A2B2F]';
        break;
      case 'NO_RESPONSE':
        style = 'bg-[#181D24] text-[#8692A6] border-[#262F3D]';
        break;
      default:
        style = 'bg-[#14181F] text-[#718096] border-[#222936]';
    }
  } else if (type === 'status') {
    switch (value as LeadStatus) {
      case 'QUALIFIED':
      case 'INTERESTED':
      case 'CLOSED':
        style = 'bg-[#2F7EF2]/20 text-[#6FB2FF] border-[#2F7EF2]/50 font-semibold';
        break;
      case 'NEW':
        style = 'bg-[#18263E] text-[#93C5FD] border-[#1E3A8A]/60';
        break;
      case 'RESEARCHING':
      case 'DRAFTED':
      case 'SENT':
      case 'REPLIED':
        style = 'bg-[#1A2533] text-[#C3CAD6] border-[#2F7EF2]/30';
        break;
      case 'REJECTED':
        style = 'bg-[#2B1B1D] text-[#FF8E8E] border-[#5A2B2F]';
        break;
      case 'HANDOFF':
        style = 'bg-[#1F2C3F] text-[#6FB2FF] border-[#3B82F6]/40';
        break;
      default:
        style = 'bg-[#161B22] text-[#A0AEC0] border-[#2B3545]';
    }
  } else if (type === 'qualification') {
    switch (value as QualificationStatus) {
      case 'QUALIFIED':
        style = 'bg-[#152E20] text-[#7EE787] border-[#238636]/60';
        break;
      case 'DISQUALIFIED':
        style = 'bg-[#2B1B1D] text-[#FF8E8E] border-[#5A2B2F]';
        break;
      case 'PENDING_INFO':
        style = 'bg-[#1C232D] text-[#C3CAD6] border-[#2E3B4E]';
        break;
    }
  } else if (type === 'confidence') {
    switch (value.toUpperCase()) {
      case 'HIGH':
        style = 'bg-[#2F7EF2]/15 text-[#6FB2FF] border-[#2F7EF2]/40';
        break;
      case 'MEDIUM':
        style = 'bg-[#1C2533] text-[#C3CAD6] border-[#2E3C4E]';
        break;
      case 'LOW':
        style = 'bg-[#171B22] text-[#8C98A9] border-[#262E3B]';
        break;
    }
  } else if (type === 'source') {
    style = 'bg-[#141A22] text-[#A2B1C6] border-[#242F3D] font-mono text-xs';
  } else if (type === 'niche') {
    style = 'bg-[#151D28] text-[#D1D8E3] border-[#273445] text-xs font-medium';
  }

  return (
    <span
      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border tracking-wide ${style} ${className}`}
    >
      {value}
    </span>
  );
};
