import React, { useState, useEffect } from 'react';
import {
  BrainCircuit,
  Plus,
  Filter,
  ShieldCheck,
  AlertCircle,
  Tag,
  CheckCircle2,
  Trash2,
  ArrowRight,
  Sparkles,
} from 'lucide-react';
import { api } from '../../lib/api';
import { LearningItem, CorrectionItem } from '../../types';
import { Badge } from '../common/Badge';

export const LearningsManager: React.FC = () => {
  const [learnings, setLearnings] = useState<LearningItem[]>([]);
  const [corrections, setCorrections] = useState<CorrectionItem[]>([]);
  const [activeTab, setActiveTab] = useState<'learnings' | 'corrections'>('learnings');
  const [typeFilter, setTypeFilter] = useState('ALL');
  const [nicheFilter, setNicheFilter] = useState('ALL');
  const [isAdding, setIsAdding] = useState(false);

  // Form state
  const [newLearning, setNewLearning] = useState('');
  const [newType, setNewType] = useState('OBJECTION_PATTERN');
  const [newAppliesTo, setNewAppliesTo] = useState('All');
  const [newEvidence, setNewEvidence] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const loadData = async () => {
    try {
      const [lList, cList] = await Promise.all([
        api.getLearnings(typeFilter, nicheFilter),
        api.getCorrections(),
      ]);
      setLearnings(lList);
      setCorrections(cList);
    } catch (err) {
      console.error('Error fetching learnings:', err);
    }
  };

  useEffect(() => {
    loadData();
  }, [typeFilter, nicheFilter]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newLearning.trim()) return;

    try {
      setIsSubmitting(true);
      await api.createLearning({
        learning: newLearning,
        type: newType,
        appliesTo: newAppliesTo,
        confidence: 'HIGH',
        evidence: newEvidence ? [newEvidence] : [],
      });
      setNewLearning('');
      setNewEvidence('');
      setIsAdding(false);
      await loadData();
    } catch (err) {
      console.error('Error creating learning:', err);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Bar */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-[#F4F1EA] flex items-center gap-2">
            <BrainCircuit className="w-5 h-5 text-[#2F7EF2]" />
            Sales Intelligence & Persistent Memory
          </h2>
          <p className="text-xs text-[#8C98A9] mt-0.5">
            Structured objection patterns, pricing signals, and human corrections that dynamically inform AI prompt context.
          </p>
        </div>

        <button
          onClick={() => setIsAdding(!isAdding)}
          className="flex items-center gap-2 px-3.5 py-2 rounded-lg bg-[#2F7EF2] hover:bg-[#2568cc] text-white text-xs font-semibold shadow-md shadow-[#2F7EF2]/20 transition-all cursor-pointer"
        >
          <Plus className="w-4 h-4" />
          {isAdding ? 'Close Form' : 'Add New Learning'}
        </button>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-[#1C232D] gap-6">
        <button
          onClick={() => setActiveTab('learnings')}
          className={`py-2.5 text-xs font-semibold tracking-wide border-b-2 transition-all ${
            activeTab === 'learnings'
              ? 'border-[#2F7EF2] text-[#6FB2FF]'
              : 'border-transparent text-[#8C98A9] hover:text-[#C3CAD6]'
          }`}
        >
          Active Knowledge Memory ({learnings.length})
        </button>
        <button
          onClick={() => setActiveTab('corrections')}
          className={`py-2.5 text-xs font-semibold tracking-wide border-b-2 transition-all ${
            activeTab === 'corrections'
              ? 'border-[#2F7EF2] text-[#6FB2FF]'
              : 'border-transparent text-[#8C98A9] hover:text-[#C3CAD6]'
          }`}
        >
          Human Corrections Audit ({corrections.length})
        </button>
      </div>

      {/* Add Form Drawer */}
      {isAdding && (
        <form onSubmit={handleCreate} className="p-5 rounded-xl bg-[#0E131A] border border-[#1C232D] space-y-4">
          <h3 className="text-sm font-bold text-[#F4F1EA]">Add Structured Sales Rule / Pattern</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-[#8C98A9] mb-1">Learning Type</label>
              <select
                value={newType}
                onChange={(e) => setNewType(e.target.value)}
                className="w-full bg-[#141A22] border border-[#1E2734] rounded-lg px-3 py-2 text-xs text-[#F4F1EA] focus:outline-none focus:border-[#2F7EF2]"
              >
                <option value="OBJECTION_PATTERN">OBJECTION_PATTERN</option>
                <option value="PRICING_SIGNAL">PRICING_SIGNAL</option>
                <option value="NICHE_BEHAVIOR">NICHE_BEHAVIOR</option>
                <option value="SUCCESS_FACTOR">SUCCESS_FACTOR</option>
                <option value="REJECTION_REASON">REJECTION_REASON</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#8C98A9] mb-1">Applies To Niche</label>
              <select
                value={newAppliesTo}
                onChange={(e) => setNewAppliesTo(e.target.value)}
                className="w-full bg-[#141A22] border border-[#1E2734] rounded-lg px-3 py-2 text-xs text-[#F4F1EA] focus:outline-none focus:border-[#2F7EF2]"
              >
                <option value="All">All Niches</option>
                <option value="Gym">Gym</option>
                <option value="Restaurant">Restaurant</option>
                <option value="Salon">Salon</option>
                <option value="Coaching">Coaching</option>
                <option value="Local business">Local business</option>
                <option value="Service business">Service business</option>
                <option value="Creator">Creator</option>
                <option value="Startup">Startup</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-[#8C98A9] mb-1">Structured Rule / Insight</label>
            <textarea
              rows={3}
              value={newLearning}
              onChange={(e) => setNewLearning(e.target.value)}
              placeholder="e.g. When consulting boutique gyms, offering a trial membership funnel demo results in higher response rates than sending generic pricing."
              className="w-full bg-[#141A22] border border-[#1E2734] rounded-lg p-3 text-xs text-[#F4F1EA] placeholder-[#64748B] focus:outline-none focus:border-[#2F7EF2]"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-[#8C98A9] mb-1">Verbatim Evidence Quote (Optional)</label>
            <input
              type="text"
              value={newEvidence}
              onChange={(e) => setNewEvidence(e.target.value)}
              placeholder="e.g. Can we see how trial passes work on phones?"
              className="w-full bg-[#141A22] border border-[#1E2734] rounded-lg px-3 py-2 text-xs text-[#F4F1EA] focus:outline-none focus:border-[#2F7EF2]"
            />
          </div>

          <button
            type="submit"
            disabled={isSubmitting || !newLearning.trim()}
            className="px-4 py-2 rounded-lg bg-[#2F7EF2] hover:bg-[#2568cc] text-white text-xs font-semibold disabled:opacity-50 cursor-pointer"
          >
            {isSubmitting ? 'Saving...' : 'Save Learning to Memory Engine'}
          </button>
        </form>
      )}

      {/* TAB 1: ACTIVE LEARNINGS */}
      {activeTab === 'learnings' && (
        <div className="space-y-4">
          {/* Filters */}
          <div className="flex items-center gap-3 p-3 rounded-lg bg-[#0E131A] border border-[#1C232D]">
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-[#8C98A9]">Type:</span>
              <select
                value={typeFilter}
                onChange={(e) => setTypeFilter(e.target.value)}
                className="bg-[#141A22] border border-[#1E2734] rounded-lg px-2.5 py-1 text-xs text-[#F4F1EA]"
              >
                <option value="ALL">ALL TYPES</option>
                <option value="OBJECTION_PATTERN">OBJECTION_PATTERN</option>
                <option value="PRICING_SIGNAL">PRICING_SIGNAL</option>
                <option value="NICHE_BEHAVIOR">NICHE_BEHAVIOR</option>
                <option value="SUCCESS_FACTOR">SUCCESS_FACTOR</option>
                <option value="REJECTION_REASON">REJECTION_REASON</option>
              </select>
            </div>

            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-[#8C98A9]">Niche:</span>
              <select
                value={nicheFilter}
                onChange={(e) => setNicheFilter(e.target.value)}
                className="bg-[#141A22] border border-[#1E2734] rounded-lg px-2.5 py-1 text-xs text-[#F4F1EA]"
              >
                <option value="ALL">ALL NICHES</option>
                <option value="Gym">Gym</option>
                <option value="Restaurant">Restaurant</option>
                <option value="Salon">Salon</option>
                <option value="Coaching">Coaching</option>
                <option value="Local business">Local business</option>
                <option value="Service business">Service business</option>
                <option value="Creator">Creator</option>
                <option value="Startup">Startup</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {learnings.map((item) => (
              <div
                key={item.id}
                className="p-4 rounded-xl bg-[#0E131A] border border-[#1C232D] space-y-3 hover:border-[#2F7EF2]/40 transition-colors"
              >
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-mono uppercase px-2 py-0.5 rounded bg-[#182333] text-[#6FB2FF] border border-[#2F7EF2]/30">
                    {item.type}
                  </span>
                  <span className="text-xs text-[#8C98A9] font-medium">
                    Applies to: <span className="text-[#C3CAD6]">{item.appliesTo}</span>
                  </span>
                </div>

                <p className="text-xs text-[#F4F1EA] leading-relaxed">
                  {item.learning}
                </p>

                {item.evidence && (
                  <div className="p-2.5 rounded bg-[#0C0F13] border-l-2 border-[#2F7EF2] text-[11px] text-[#A0AEC0] italic font-mono">
                    "{typeof item.evidence === 'string' ? JSON.parse(item.evidence)[0] || item.evidence : item.evidence}"
                  </div>
                )}

                <div className="flex items-center justify-between text-[11px] text-[#718096] pt-1">
                  <span>Source: {item.source}</span>
                  <span>Confidence: {item.confidence}</span>
                </div>
              </div>
            ))}
          </div>

          {learnings.length === 0 && (
            <div className="p-12 text-center text-[#8C98A9]">
              No structured learnings found for this filter.
            </div>
          )}
        </div>
      )}

      {/* TAB 2: CORRECTIONS AUDIT */}
      {activeTab === 'corrections' && (
        <div className="rounded-xl border border-[#1C232D] bg-[#0C0F13] overflow-hidden">
          <table className="w-full text-left text-xs text-[#C3CAD6]">
            <thead className="bg-[#0E131A] text-[#8C98A9] uppercase font-mono text-[11px] border-b border-[#1C232D]">
              <tr>
                <th className="py-3 px-4">Lead</th>
                <th className="py-3 px-4">Field</th>
                <th className="py-3 px-4">Original AI Output</th>
                <th className="py-3 px-4">Human Correction</th>
                <th className="py-3 px-4">User Reason (Memory Training)</th>
                <th className="py-3 px-4">Date</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#18202B]">
              {corrections.map((c) => (
                <tr key={c.id} className="hover:bg-[#121820]">
                  <td className="py-3 px-4 font-semibold text-[#F4F1EA]">
                    {c.lead?.businessName || 'Lead'}
                  </td>
                  <td className="py-3 px-4 font-mono text-[#8C98A9]">{c.field}</td>
                  <td className="py-3 px-4 font-mono text-[#FF8E8E] line-through">
                    {c.originalValue}
                  </td>
                  <td className="py-3 px-4 font-mono text-[#7EE787] font-bold">
                    {c.correctedValue}
                  </td>
                  <td className="py-3 px-4 max-w-sm text-[#C3CAD6] italic">
                    "{c.userReason || 'Direct human override'}"
                  </td>
                  <td className="py-3 px-4 text-[#8C98A9]">
                    {new Date(c.createdAt).toLocaleDateString()}
                  </td>
                </tr>
              ))}
              {corrections.length === 0 && (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-[#8C98A9]">
                    No human corrections recorded yet. All AI evaluations are operating on baseline rules.
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
