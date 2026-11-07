import { ChevronLeft, ChevronRight } from 'lucide-react';
import BlogLink from './BlogLink';
import { withPage } from './blogShared';

// Previous / next links (real hrefs: /blog/?page=2) for lists over one page.
export default function BlogPagination({ basePath, page, totalPages }: { basePath: string; page: number; totalPages: number }) {
  if (totalPages <= 1) return null;
  return (
    <nav aria-label="Pagination" className="mt-10 flex items-center justify-center gap-3">
      {page > 1 ? (
        <BlogLink href={withPage(basePath, page - 1)} className="btn-outline px-4 py-2.5">
          <ChevronLeft size={16} /> Précédent
        </BlogLink>
      ) : <span className="w-[118px]" aria-hidden="true" />}
      <span className="text-sm text-ink/55">Page {page} sur {totalPages}</span>
      {page < totalPages ? (
        <BlogLink href={withPage(basePath, page + 1)} className="btn-outline px-4 py-2.5">
          Suivant <ChevronRight size={16} />
        </BlogLink>
      ) : <span className="w-[118px]" aria-hidden="true" />}
    </nav>
  );
}
