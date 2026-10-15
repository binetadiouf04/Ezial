import { useState, useEffect, useCallback } from 'react';
import {
  fetchPushCampaigns, createPushCampaign, deletePushCampaign, sendPushCampaignNow,
  countMarketingPushRecipients, type PushCampaign, type CampaignStatus,
} from '@/lib/supabaseAdminPushCampaigns';
import { Loader2, AlertCircle, Megaphone, Plus, X, Send, Trash2, Clock } from 'lucide-react';

const statusLabels: Record<CampaignStatus, string> = {
  draft: 'Brouillon',
  scheduled: 'Programmée',
  sending: 'Envoi en cours',
  sent: 'Envoyée',
  failed: 'Échec',
};

const statusStyles: Record<CampaignStatus, string> = {
  draft: 'bg-ink/5 text-ink/50',
  scheduled: 'bg-champagne/30 text-ink/70',
  sending: 'bg-champagne/40 text-ink/70',
  sent: 'bg-green-50 text-green-700',
  failed: 'bg-burgundy/10 text-burgundy',
};

function formatDateTime(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export default function AdminPushCampaigns() {
  const [campaigns, setCampaigns] = useState<PushCampaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [showComposer, setShowComposer] = useState(false);
  const [acting, setActing] = useState<string | null>(null);
  const [sendError, setSendError] = useState<{ id: string; message: string } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError('');
    try {
      setCampaigns(await fetchPushCampaigns());
    } catch {
      setLoadError('Impossible de charger les campagnes. Réessayez.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const handleSendNow = async (id: string) => {
    setActing(id);
    setSendError(null);
    const result = await sendPushCampaignNow(id);
    setActing(null);
    if (result.error) setSendError({ id, message: result.error });
    void load();
  };

  const handleDelete = async (id: string) => {
    setActing(id);
    const result = await deletePushCampaign(id);
    setActing(null);
    if (!result.error) setCampaigns((prev) => prev.filter((c) => c.id !== id));
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-semibold text-ink">Notifications promotionnelles</h1>
          <p className="text-sm text-ink/55 mt-1">Envoyées uniquement aux clients ayant accepté les notifications promotionnelles.</p>
        </div>
        {!showComposer && (
          <button onClick={() => setShowComposer(true)} className="btn-primary flex items-center gap-1.5">
            <Plus size={16} /> Nouvelle campagne
          </button>
        )}
      </div>

      {showComposer && (
        <Composer
          onCancel={() => setShowComposer(false)}
          onCreated={() => { setShowComposer(false); void load(); }}
        />
      )}

      {loadError && (
        <p className="flex items-start gap-1.5 rounded-lg bg-burgundy/5 p-3 text-sm text-burgundy">
          <AlertCircle size={15} className="mt-0.5 flex-shrink-0" /> {loadError}
        </p>
      )}

      {loading ? (
        <div className="card p-10 text-center"><Loader2 size={20} className="mx-auto animate-spin text-ink/30" /></div>
      ) : campaigns.length === 0 ? (
        <div className="card p-8 text-center"><Megaphone size={28} className="mx-auto text-ink/20" /><p className="mt-3 text-sm text-ink/45">Aucune campagne pour le moment.</p></div>
      ) : (
        <div className="space-y-3">
          {campaigns.map((c) => (
            <div key={c.id} className="card p-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-ink">{c.title}</p>
                  <p className="text-sm text-ink/65 mt-0.5">{c.body}</p>
                  {c.clickUrl && <p className="text-xs text-ink/40 mt-1 font-mono">→ {c.clickUrl}</p>}
                </div>
                <span className={`flex-shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold ${statusStyles[c.status]}`}>{statusLabels[c.status]}</span>
              </div>

              <div className="mt-3 flex flex-wrap items-center gap-3 border-t border-line pt-3 text-xs text-ink/50">
                {c.status === 'scheduled' && c.scheduledAt && <span className="flex items-center gap-1"><Clock size={12} /> Programmée pour le {formatDateTime(c.scheduledAt)}</span>}
                {c.status === 'sent' && c.sentAt && (
                  <span>Envoyée le {formatDateTime(c.sentAt)} — {c.recipientCount} destinataire{c.recipientCount > 1 ? 's' : ''}, {c.successCount} réussi{c.successCount > 1 ? 's' : ''}{c.errorCount > 0 ? `, ${c.errorCount} erreur${c.errorCount > 1 ? 's' : ''}` : ''}</span>
                )}
                {c.status === 'failed' && c.errorMessage && <span className="text-burgundy">Erreur : {c.errorMessage}</span>}
              </div>

              <div className="mt-3 flex items-center gap-4">
                {(c.status === 'draft' || c.status === 'scheduled') && (
                  <button onClick={() => void handleSendNow(c.id)} disabled={acting === c.id} className="flex items-center gap-1.5 text-xs font-medium text-burgundy hover:underline">
                    <Send size={13} /> Envoyer maintenant
                  </button>
                )}
                {c.status !== 'sending' && (
                  <button onClick={() => void handleDelete(c.id)} disabled={acting === c.id} className="flex items-center gap-1.5 text-xs font-medium text-ink/40 hover:text-burgundy">
                    <Trash2 size={13} /> Supprimer
                  </button>
                )}
              </div>
              {sendError?.id === c.id && (
                <p className="mt-2 text-xs text-burgundy">
                  Envoi impossible : {sendError.message}. Si l'erreur mentionne une fonction introuvable, la fonction Edge send-push-campaign n'est probablement pas encore déployée.
                </p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Composer({ onCancel, onCreated }: { onCancel: () => void; onCreated: () => void }) {
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [clickUrl, setClickUrl] = useState('');
  const [scheduledAt, setScheduledAt] = useState('');
  const [recipientCount, setRecipientCount] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => { countMarketingPushRecipients().then(setRecipientCount); }, []);

  const submit = async (sendNow: boolean) => {
    if (!title.trim() || !body.trim()) { setError('Le titre et le message sont obligatoires.'); return; }
    if (clickUrl.trim() && !clickUrl.trim().startsWith('/')) { setError('La destination doit être un chemin commençant par / (ex. /promo).'); return; }
    setError('');
    setSaving(true);
    const result = await createPushCampaign({
      title: title.trim(),
      body: body.trim(),
      clickUrl: clickUrl.trim(),
      scheduledAt: scheduledAt ? new Date(scheduledAt).toISOString() : null,
    });
    if (result.error || !result.id) { setSaving(false); setError(result.error ?? "Impossible de créer la campagne."); return; }
    if (sendNow && !scheduledAt) {
      await sendPushCampaignNow(result.id);
    }
    setSaving(false);
    onCreated();
  };

  return (
    <div className="card p-5 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-ink">Nouvelle campagne</h2>
        <button onClick={onCancel}><X size={18} className="text-ink/40" /></button>
      </div>

      <div>
        <label className="block text-xs font-medium text-ink/60 mb-1.5">Titre</label>
        <input className="input-field" placeholder="Nouvelle collection disponible !" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={80} />
      </div>
      <div>
        <label className="block text-xs font-medium text-ink/60 mb-1.5">Message</label>
        <textarea className="input-field" rows={3} placeholder="Découvrez les nouveautés de la semaine…" value={body} onChange={(e) => setBody(e.target.value)} maxLength={200} />
      </div>
      <div>
        <label className="block text-xs font-medium text-ink/60 mb-1.5">Destination au clic (facultatif)</label>
        <input className="input-field font-mono text-sm" placeholder="/promo" value={clickUrl} onChange={(e) => setClickUrl(e.target.value)} />
        <p className="mt-1 text-xs text-ink/40">Exemples : /promo, /categorie/mode, /produit/xxxx. Laissez vide pour ouvrir l'accueil.</p>
      </div>
      <div>
        <label className="block text-xs font-medium text-ink/60 mb-1.5">Programmer l'envoi (facultatif)</label>
        <input type="datetime-local" className="input-field" value={scheduledAt} onChange={(e) => setScheduledAt(e.target.value)} />
        <p className="mt-1 text-xs text-ink/40">Laissez vide pour envoyer immédiatement ou garder en brouillon.</p>
      </div>

      <p className="text-xs text-ink/50">
        {recipientCount === null ? 'Calcul du nombre de destinataires…' : `${recipientCount} client${recipientCount > 1 ? 's' : ''} actuellement abonné${recipientCount > 1 ? 's' : ''} aux notifications promotionnelles recevront cette campagne.`}
      </p>

      {error && <p className="text-sm text-burgundy">{error}</p>}

      <div className="flex flex-wrap gap-3">
        <button onClick={() => void submit(false)} disabled={saving} className="btn-outline">
          {scheduledAt ? 'Programmer' : 'Enregistrer en brouillon'}
        </button>
        {!scheduledAt && (
          <button onClick={() => void submit(true)} disabled={saving} className="btn-primary flex items-center gap-1.5">
            {saving ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />} Envoyer maintenant
          </button>
        )}
      </div>
    </div>
  );
}
