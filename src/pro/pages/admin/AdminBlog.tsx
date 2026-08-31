import { useState } from 'react';
import { usePro } from '../../ProContext';
import { formatDate } from '../../data';
import { StatusChip } from '../../components/StatusChip';
import { Search, Plus, Eye, Pencil, Trash2, Send, EyeOff, CalendarClock, X } from 'lucide-react';
import SmartImage from '@/components/SmartImage';

type Tab = 'all' | 'draft' | 'published' | 'scheduled';

const tabLabels: Record<Tab, string> = { all: 'Tous les articles', draft: 'Brouillons', published: 'Publiés', scheduled: 'Programmés' };

const blogStatusLabels: Record<string, string> = { draft: 'Brouillon', scheduled: 'Programmé', published: 'Publié', unpublished: 'Dépublié' };

export default function AdminBlog() {
  const { blogPosts, navigate, deleteBlogPost, publishBlogPost, unpublishBlogPost, scheduleBlogPost } = usePro();
  const [tab, setTab] = useState<Tab>('all');
  const [search, setSearch] = useState('');
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [scheduling, setScheduling] = useState<string | null>(null);
  const [scheduleDate, setScheduleDate] = useState('');

  const filtered = blogPosts
    .filter((p) => {
      if (tab === 'draft') return p.status === 'draft';
      if (tab === 'published') return p.status === 'published';
      if (tab === 'scheduled') return p.status === 'scheduled';
      return true;
    })
    .filter((p) => !search.trim() || p.title.toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => (a.publishDate < b.publishDate ? 1 : -1));

  const openSchedule = (id: string) => {
    setScheduling(id);
    setScheduleDate(new Date().toISOString().split('T')[0]);
  };

  const confirmSchedule = () => {
    if (!scheduling || !scheduleDate) return;
    scheduleBlogPost(scheduling, scheduleDate);
    setScheduling(null);
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h1 className="font-display text-2xl font-semibold text-ink">Blog</h1>
        <button onClick={() => navigate('/admin/blog/nouveau')} className="btn-primary flex items-center gap-1.5 text-sm">
          <Plus size={16} /> <span className="hidden sm:inline">Nouvel article</span>
        </button>
      </div>

      <div className="relative">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink/30" />
        <input className="input-field pl-9" placeholder="Rechercher un article" value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>

      <div className="flex gap-2 overflow-x-auto no-scrollbar">
        {(Object.keys(tabLabels) as Tab[]).map((t) => (
          <button key={t} onClick={() => setTab(t)} className={`flex-shrink-0 whitespace-nowrap rounded-lg px-4 py-2 text-sm font-medium transition-colors ${tab === t ? 'bg-burgundy text-white' : 'bg-white border border-line text-ink/60'}`}>
            {tabLabels[t]}
          </button>
        ))}
      </div>

      <div className="space-y-3">
        {filtered.length === 0 ? (
          <div className="card p-8 text-center">
            <p className="text-sm text-ink/45">Aucun article.</p>
          </div>
        ) : (
          filtered.map((post) => (
            <div key={post.id} className="card p-4 flex flex-col sm:flex-row gap-3 sm:items-center">
              <SmartImage src={post.coverImage} alt="" className="h-16 w-full sm:w-24 rounded-lg object-cover flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-ink truncate">{post.title}</p>
                <p className="text-xs text-ink/45 mt-0.5">{post.category} · {post.author} · {formatDate(post.publishDate)}</p>
                <div className="mt-1.5"><StatusChip status={post.status} label={blogStatusLabels[post.status]} /></div>
              </div>
              <div className="flex items-center gap-1 flex-wrap flex-shrink-0">
                <button onClick={() => navigate(`/admin/blog/apercu/${post.id}`)} className="rounded-lg p-2 text-ink/40 hover:bg-cream hover:text-ink transition-colors" title="Prévisualiser"><Eye size={16} /></button>
                <button onClick={() => navigate(`/admin/blog/modifier/${post.id}`)} className="rounded-lg p-2 text-ink/40 hover:bg-cream hover:text-ink transition-colors" title="Modifier"><Pencil size={16} /></button>
                {post.status !== 'published' && (
                  <button onClick={() => publishBlogPost(post.id)} className="rounded-lg p-2 text-green-600 hover:bg-green-50 transition-colors" title="Publier"><Send size={16} /></button>
                )}
                {post.status === 'published' && (
                  <button onClick={() => unpublishBlogPost(post.id)} className="rounded-lg p-2 text-orange-600 hover:bg-orange-50 transition-colors" title="Dépublier"><EyeOff size={16} /></button>
                )}
                {post.status !== 'scheduled' && (
                  <button onClick={() => openSchedule(post.id)} className="rounded-lg p-2 text-ink/40 hover:bg-cream hover:text-ink transition-colors" title="Programmer une publication"><CalendarClock size={16} /></button>
                )}
                <button onClick={() => setConfirmDelete(post.id)} className="rounded-lg p-2 text-red-500 hover:bg-red-50 transition-colors" title="Supprimer"><Trash2 size={16} /></button>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Schedule modal */}
      {scheduling && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4" onClick={() => setScheduling(null)}>
          <div className="card max-w-sm w-full p-6" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-display text-lg font-semibold text-ink">Programmer la publication</h3>
              <button onClick={() => setScheduling(null)}><X size={18} className="text-ink/40" /></button>
            </div>
            <label className="block text-xs font-medium text-ink/60 mb-1.5">Date de publication</label>
            <input type="date" className="input-field" value={scheduleDate} onChange={(e) => setScheduleDate(e.target.value)} />
            <div className="flex gap-3 mt-5">
              <button onClick={() => setScheduling(null)} className="btn-outline flex-1">Annuler</button>
              <button onClick={confirmSchedule} disabled={!scheduleDate} className="btn-primary flex-1 disabled:opacity-40">Programmer</button>
            </div>
          </div>
        </div>
      )}

      {/* Delete confirmation */}
      {confirmDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4" onClick={() => setConfirmDelete(null)}>
          <div className="card max-w-sm w-full p-6" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-display text-lg font-semibold text-ink">Supprimer l'article</h3>
              <button onClick={() => setConfirmDelete(null)}><X size={18} className="text-ink/40" /></button>
            </div>
            <p className="text-sm text-ink/55 mb-5">Cette action est définitive. Voulez-vous continuer ?</p>
            <div className="flex gap-3">
              <button onClick={() => setConfirmDelete(null)} className="btn-outline flex-1">Retour</button>
              <button onClick={() => { deleteBlogPost(confirmDelete); setConfirmDelete(null); }} className="flex-1 rounded-lg bg-red-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-red-700 transition-colors">Supprimer</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
