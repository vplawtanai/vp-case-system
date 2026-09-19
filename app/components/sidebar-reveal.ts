export function revealActiveNavigation(container: HTMLElement, reducedMotion: boolean) {
 const active = container.querySelector<HTMLElement>('[aria-current="page"]');
 if (!active || !active.getClientRects().length) return;
 const box = container.getBoundingClientRect(), item = active.getBoundingClientRect();
 const delta = item.top < box.top + 8 ? item.top - box.top - 8 : item.bottom > box.bottom - 8 ? item.bottom - box.bottom + 8 : 0;
 if (delta) container.scrollTo({ top: container.scrollTop + delta, behavior: reducedMotion ? "instant" : "smooth" });
}
