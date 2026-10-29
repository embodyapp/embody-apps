import { taskStatuses } from './presentation/model.js';

/** App-owned drag enhancement. Drops submit the same declared GenUI form as keyboard controls. */
export function enableBoardDragging(container: HTMLElement): () => void {
  const doc = container.ownerDocument;
  const hint = doc.createElement('p');
  hint.id = 'board-interaction-hint'; hint.setAttribute('role', 'status');
  hint.setAttribute('aria-live', 'polite');
  const instructions = 'Drag cards between columns. Scroll sideways for more statuses, or use Move to and Save status.';
  hint.textContent = instructions;
  container.before(hint);
  const lifetime = new AbortController();
  const options = { signal: lifetime.signal };
  let dragged: HTMLElement | null = null;
  let activeForm: HTMLFormElement | null = null;
  let firstRoot: Element | null = null;
  let ready = false;
  const initial = new WeakMap<HTMLSelectElement, string>();
  const taskSelect = (card: Element) => card.querySelector<HTMLSelectElement>('select[data-genui-id^="status-"]');
  const submit = (form: HTMLFormElement) => form.querySelector<HTMLButtonElement>('button');
  let scrollFrame = 0;
  let scrollBoard: HTMLElement | null = null;
  let scrollSpeed = 0;
  function stopScroll() {
    cancelAnimationFrame(scrollFrame); scrollFrame = 0; scrollBoard = null; scrollSpeed = 0;
  }
  function scrollWhileDragging() {
    if (!dragged || !scrollBoard?.isConnected || !scrollSpeed) { stopScroll(); return; }
    scrollBoard.scrollLeft += scrollSpeed;
    scrollFrame = requestAnimationFrame(scrollWhileDragging);
  }
  function sync() {
    const root = container.querySelector('.genui-view');
    if (root && hint.parentElement !== root) root.prepend(hint);
    if (root && !firstRoot) {
      firstRoot = root;
      // Prime the standard controller's refresh input with this result's project/page.
      // Its default input is {}, which would otherwise widen a scoped board after a move.
      queueMicrotask(() => container.querySelector<HTMLButtonElement>('.genui-view > section > [role="group"] > button')?.click());
    } else if (root && root !== firstRoot) ready = true;
    if (activeForm && !activeForm.isConnected) activeForm = null;
    const columns = container.querySelectorAll<HTMLElement>('.genui-columns > section');
    const board = container.querySelector<HTMLElement>('.genui-columns');
    if (board) {
      board.tabIndex = 0; board.setAttribute('role', 'region');
      board.setAttribute('aria-label', 'Status columns. Scroll horizontally to see more statuses.');
    }
    columns.forEach((column, index) => { column.dataset.boardStatus = taskStatuses[index]; });
    container.querySelectorAll<HTMLSelectElement>('select[data-genui-id^="status-"]').forEach(select => {
      const card = select.closest('section')!;
      const form = select.closest('form')!;
      if (!card.querySelector('details')) {
        const details = doc.createElement('details');
        const summary = doc.createElement('summary'); summary.textContent = 'Task details';
        details.append(summary);
        for (const child of Array.from(card.children)) {
          if (child !== form && !child.matches('h1,h2,h3,h4,h5,h6')) details.append(child);
        }
        card.insertBefore(details, form);
      }
      if (!initial.has(select)) initial.set(select, select.value);
      card.draggable = true; card.dataset.boardCard = select.dataset.genuiId!.slice('status-'.length);
      card.setAttribute('aria-description', 'Drag to another column, or use the Move to control.');
      form.inert = !ready || (activeForm !== null && form !== activeForm);
      const reason = form.querySelector<HTMLInputElement>('input[data-genui-id^="reason-"]');
      if (reason?.parentElement) reason.parentElement.hidden = select.value !== 'canceled';
    });
  }
  function lock(form: HTMLFormElement) {
    activeForm = form; sync();
  }
  container.addEventListener('change', event => {
    if (!(event.target instanceof HTMLSelectElement) || !event.target.matches('select[data-genui-id^="status-"]')) return;
    lock(event.target.closest('form')!);
  }, options);
  container.addEventListener('input', event => {
    if (event.target instanceof HTMLInputElement && event.target.matches('input[data-genui-id^="reason-"]')) lock(event.target.closest('form')!);
  }, options);
  container.addEventListener('dragstart', event => {
    const source = event.target instanceof Element ? event.target.closest<HTMLElement>('[data-board-card]') : null;
    const form = source?.querySelector('form');
    const target = event.target as Element;
    if (!ready || !source || !form || !submit(form) || submit(form)!.disabled || (activeForm && activeForm !== form) || target.closest('input,select,button,textarea,summary')) {
      event.preventDefault(); return;
    }
    dragged = source;
    event.dataTransfer?.setData('text/plain', source.dataset.boardCard!);
    if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move';
    source.classList.add('board-dragging');
  }, options);
  function clearDrop() { container.querySelectorAll('.board-drop-target').forEach(el => el.classList.remove('board-drop-target')); }
  container.addEventListener('dragover', event => {
    const board = container.querySelector<HTMLElement>('.genui-columns');
    if (dragged && board) {
      const bounds = board.getBoundingClientRect();
      const inside = event.clientY >= bounds.top && event.clientY <= bounds.bottom && event.clientX >= bounds.left && event.clientX <= bounds.right;
      scrollSpeed = inside ? (event.clientX > bounds.right - 48 ? 10 : event.clientX < bounds.left + 48 ? -10 : 0) : 0;
      scrollBoard = board;
      if (scrollSpeed && !scrollFrame) scrollFrame = requestAnimationFrame(scrollWhileDragging);
      if (!scrollSpeed) stopScroll();
    }
    const column = event.target instanceof Element ? event.target.closest<HTMLElement>('[data-board-status]') : null;
    if (!dragged || !column) return;
    event.preventDefault(); clearDrop(); column.classList.add('board-drop-target');
    if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';
  }, options);
  container.addEventListener('drop', event => {
    stopScroll();
    const column = event.target instanceof Element ? event.target.closest<HTMLElement>('[data-board-status]') : null;
    const card = dragged; dragged = null; clearDrop(); card?.classList.remove('board-dragging');
    if (!card || !column || !card.isConnected) return;
    event.preventDefault();
    const select = taskSelect(card)!;
    const status = column.dataset.boardStatus!;
    const form = select.closest('form')!;
    if (submit(form)?.disabled || (initial.get(select) === status && select.value === status)) return;
    select.value = status; select.dispatchEvent(new Event('change', { bubbles: true }));
    const reason = form.querySelector<HTMLInputElement>('input[data-genui-id^="reason-"]')!;
    if (status === 'canceled' && !reason.value.trim()) {
      hint.textContent = 'Enter a cancellation reason on this card, then choose Save status.';
      reason.focus(); return;
    }
    submit(form)!.click();
  }, options);
  container.addEventListener('dragend', () => {
    stopScroll();
    dragged?.classList.remove('board-dragging'); dragged = null; clearDrop();
  }, options);
  container.addEventListener('dragleave', event => {
    if (!(event.relatedTarget instanceof Node) || !container.contains(event.relatedTarget)) stopScroll();
  }, options);
  const observer = new MutationObserver(() => {
    const wasEditing = activeForm !== null;
    sync();
    if (wasEditing && !activeForm) hint.textContent = `Board refreshed. ${instructions}`;
  });
  observer.observe(container, { childList: true, subtree: true }); sync();
  return () => { stopScroll(); lifetime.abort(); observer.disconnect(); hint.remove(); };
}
