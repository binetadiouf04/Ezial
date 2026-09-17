import AdminBlog from './AdminBlog';

// Hero and "À découvrir" management removed from the Admin per explicit
// request — those sections are now only ever changed through development,
// not from this page. The Home itself is untouched (still reads
// hero_slides/home_discover_tiles when present, falling back to its
// hardcoded defaults otherwise — see HomePage.tsx), and the Blog below is
// unchanged.
export default function AdminContent() {
  return (
    <div className="space-y-6">
      <h1 className="font-display text-2xl font-semibold text-ink">Contenu</h1>

      <div>
        <h2 className="text-sm font-semibold text-ink mb-3">Blog</h2>
        <AdminBlog />
      </div>
    </div>
  );
}
