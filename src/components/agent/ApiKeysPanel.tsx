import React, { useCallback, useEffect, useState } from 'react';
import { KeyRound, Save, RefreshCw, ShieldCheck, Eye, EyeOff } from 'lucide-react';
import { api } from '../../lib/api';
import { VaultKeyStatus } from '../../types';
const PLACEHOLDER: Record<string, string> = {
  GEMINI_API_KEY: 'AIza... free key',
  META_PAGE_ACCESS_TOKEN: 'EAA... Page token',
  META_PAGE_ID: '1234567890 Page ID',
  META_APP_SECRET: 'Meta App secret',
  META_WEBHOOK_VERIFY_TOKEN: 'Khud koi string chuno',
  MESSAGING_PROVIDER: 'instagram ya dry_run',
};
export const ApiKeysPanel: React.FC<{ onSaved?: () => void }> = ({ onSaved }) => {
  const [keys, setKeys] = useState<VaultKeyStatus[]>([]);
  const [values, setValues] = useState<Record<string, string>>({});
  const [show, setShow] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const load = useCallback(async () => {
    try {
      setErr(null);
      setKeys((await api.getVaultStatus()).keys);
    } catch (e: any) { setErr(e?.message || 'Keys status nahi mila.'); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);
  const save = async () => {
    const filled = Object.fromEntries(Object.entries(values).filter(([, v]) => v.trim()));
    if (Object.keys(filled).length === 0) { setErr('Pehle koi key paste karo, phir Save dabao.'); return; }
    try {
      setBusy(true); setErr(null); setMsg(null);
      const res = await api.saveVaultSecrets(filled);
      setKeys(res.keys); setValues({});
      setMsg(`Ho gaya — saved: ${res.saved.join(', ')}. Restart nahi chahiye.`);
      onSaved?.();
    } catch (e: any) { setErr(e?.message || 'Save fail.'); }
    finally { setBusy(false); }
  };
  if (loading) return <div className="p-4 text-xs text-[#8C98A9]">Keys loading…</div>;
  return (
    <div className="rounded-2xl bg-[#0E131A] border border-[#1C232D] p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <KeyRound className="w-4 h-4 text-[#2F7EF2]" />
          <h4 className="text-xs font-bold text-[#F4F1EA] uppercase tracking-wider">API Keys — yahin se dalo</h4>
        </div>
        <button onClick={load} className="text-[11px] text-[#6FB2FF] flex items-center gap-1 hover:underline cursor-pointer">
          <RefreshCw className="w-3 h-3" /> Refresh
        </button>
      </div>
      <p className="text-[11px] text-[#8C98A9]">Paste karo → Save dabao → done. Encrypted save, restart par khoyti nahi.</p>
      {err && <div className="px-3 py-2 rounded-lg bg-[#2E1A1A] border border-[#5A2A2A] text-[11px] text-[#FFB4B4]">{err}</div>}
      {msg && <div className="px-3 py-2 rounded-lg bg-[#152E20] border border-[#2A5A34] text-[11px] text-[#7EE787]">{msg}</div>}
      <div className="space-y-2">
        {keys.map((k) => (
          <div key={k.name} className="px-3 py-2.5 rounded-xl bg-[#12171F] border border-[#1E2734] space-y-1.5">
            <div className="flex items-center justify-between gap-2">
              <code className="text-[10px] font-mono text-[#6FB2FF] break-all">{k.name}</code>
              <span className={`text-[9px] font-mono font-bold px-1.5 py-0.5 rounded border shrink-0 ${k.set ? 'text-[#7EE787] bg-[#152E20] border-[#2A5A34]' : 'text-[#FFD166] bg-[#2E2815] border-[#5A4A20]'}`}>{k.set ? `SAVED (${k.source})` : 'NOT SET'}</span>
            </div>
            <p className="text-[10px] text-[#8C98A9]">{k.purpose}</p>
            <div className="flex gap-1.5">
              <input type={show[k.name] ? 'text' : 'password'} value={values[k.name] ?? ''}
                onChange={(e) => setValues((p) => ({ ...p, [k.name]: e.target.value }))}
                placeholder={k.set ? 'Saved hai — badalna ho to nayi paste karo' : (PLACEHOLDER[k.name] ?? 'Paste…')}
                autoComplete="off" spellCheck={false}
                className="flex-1 min-w-0 bg-[#0C0F13] border border-[#252F3C] rounded-lg px-2.5 py-1.5 text-xs text-[#F4F1EA] placeholder-[#5A6675] focus:outline-none focus:border-[#2F7EF2] font-mono" />
              <button onClick={() => setShow((p) => ({ ...p, [k.name]: !p[k.name] }))} className="px-2 rounded-lg bg-[#141A22] border border-[#252F3C] text-[#8C98A9] hover:text-[#F4F1EA] cursor-pointer">{show[k.name] ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}</button>
            </div>
          </div>
        ))}
      </div>
      <button onClick={save} disabled={busy} className="w-full py-2.5 rounded-xl bg-[#2F7EF2] hover:bg-[#2568cc] text-white text-xs font-bold flex items-center justify-center gap-2 disabled:opacity-50 cursor-pointer">
        <Save className="w-3.5 h-3.5" /> {busy ? 'Saving…' : 'Save Keys — AI turant use karegi'}
      </button>
      <p className="text-[10px] text-[#5A6675] flex items-center gap-1.5"><ShieldCheck className="w-3 h-3 text-[#2F7EF2]" /> Encrypted vault — Git me kabhi nahi jati, restart par safe.</p>
    </div>
  );
};
