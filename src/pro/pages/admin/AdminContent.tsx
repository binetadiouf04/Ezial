import AdminBlog from './AdminBlog';

// Hero and "À découvrir" management removed from the Admin per explicit
// request — those sections are now only ever changed through development,
// not from this page. The Home itself is untouched (still reads
// hero_slides/home_discover_tiles when present, falling back to its
// hardcoded defaults otherwise — see HomePage.tsx), and the Blog below is
// unchanged.
export default function AdminContent() {
  // « Contenu » is the blog for now: render it directly (it has its own title).
  return <AdminBlog />;
}
