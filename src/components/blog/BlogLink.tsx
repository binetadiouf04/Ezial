import type { MouseEvent, ReactNode } from 'react';
import { useApp } from '@/store/AppContext';
import { routeFromHref } from './blogShared';

// A real <a href> (crawlable, opens in a new tab with Cmd/Ctrl-click) that
// navigates inside the app on a plain click.
export default function BlogLink({
  href, className, children, ariaLabel, tabIndex, ariaHidden, ariaCurrent,
}: {
  href: string;
  className?: string;
  children: ReactNode;
  ariaLabel?: string;
  tabIndex?: number;
  ariaHidden?: boolean;
  ariaCurrent?: 'page';
}) {
  const { navigate } = useApp();
  const onClick = (e: MouseEvent<HTMLAnchorElement>) => {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    e.preventDefault();
    navigate(routeFromHref(href));
  };
  return (
    <a href={href} onClick={onClick} className={className} aria-label={ariaLabel} tabIndex={tabIndex} aria-hidden={ariaHidden || undefined} aria-current={ariaCurrent}>
      {children}
    </a>
  );
}
