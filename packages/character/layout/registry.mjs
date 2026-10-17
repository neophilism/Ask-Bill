/** AB-065: semantic, version-pinned document geometry. No legal or animation authority. */
export class LayoutAnchorError extends Error {
  constructor(code) { super(code); this.code = code; this.name = 'LayoutAnchorError'; }
}
const invalid = code => { throw new LayoutAnchorError(code); };
const ID = /^[A-Za-z][A-Za-z0-9_-]{0,100}$/;
const VERSION = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,190}$/;
const elementId = provisionId => 'provision-' + provisionId;
const numeric = value => typeof value === 'number' && Number.isFinite(value);
function rectOf(element, win) {
  let rect;
  try { rect = element.getBoundingClientRect(); } catch { invalid('GEOMETRY_UNAVAILABLE'); }
  if (!rect || ![rect.x, rect.y, rect.width, rect.height].every(numeric) || rect.width < 0 || rect.height < 0 ||
      rect.width > 1000000 || rect.height > 1000000) invalid('INVALID_GEOMETRY');
  const scrollX = win?.scrollX ?? 0, scrollY = win?.scrollY ?? 0;
  if (![scrollX, scrollY].every(numeric)) invalid('INVALID_SCROLL');
  return Object.freeze({
    pageRect: Object.freeze({x:rect.x + scrollX, y:rect.y + scrollY, width:rect.width, height:rect.height}),
    viewportRect: Object.freeze({x:rect.x, y:rect.y, width:rect.width, height:rect.height}),
    visible: rect.width > 0 && rect.height > 0
  });
}
/**
 * A *trusted* reader supplies versionId. Neither a model nor user-provided cue may
 * provide selectors, coordinates or the source version. Coordinates are measured
 * fresh from native DOMRects; snapshots become stale on every layout event.
 */
export function createLayoutAnchorRegistry({root, versionId, windowRef, documentRef, observers = {}, onInvalidate, maxAnchors = 500} = {}) {
  if (!root || typeof root.contains !== 'function' || typeof root.querySelectorAll !== 'function') invalid('ROOT_REQUIRED');
  if (typeof versionId !== 'string' || !VERSION.test(versionId)) invalid('VERSION_REQUIRED');
  if (!Number.isSafeInteger(maxAnchors) || maxAnchors < 1 || maxAnchors > 1000) invalid('LIMIT_INVALID');
  if (onInvalidate !== undefined && typeof onInvalidate !== 'function') invalid('OBSERVER_INVALID');
  const win = windowRef ?? root.ownerDocument?.defaultView ?? null;
  const doc = documentRef ?? root.ownerDocument ?? null;
  const anchors = new Map(), disposers = [];
  let revision = 0, disposed = false;
  const alive = () => { if (disposed) invalid('REGISTRY_DISPOSED'); };
  const invalidate = reason => {
    alive();
    revision += 1;
    if (!Number.isSafeInteger(revision)) invalid('REVISION_EXHAUSTED');
    if (onInvalidate) onInvalidate(Object.freeze({versionId, revision, reason}));
    return revision;
  };
  const install = (target, name, listener) => {
    if (!target?.addEventListener || !target?.removeEventListener) return;
    target.addEventListener(name, listener, {passive:true});
    disposers.push(() => target.removeEventListener(name, listener));
  };
  const reason = name => () => { if (!disposed) invalidate(name); };
  const Resize = observers.ResizeObserver ?? win?.ResizeObserver;
  let resizeObserver;
  if (typeof Resize === 'function') {
    resizeObserver = new Resize(reason('resize-observer'));
    resizeObserver.observe(root);
    disposers.push(() => resizeObserver.disconnect());
  }
  const Mutation = observers.MutationObserver ?? win?.MutationObserver;
  if (typeof Mutation === 'function') {
    const observer = new Mutation(reason('dom-mutation'));
    observer.observe(root, {childList:true, subtree:true, attributes:true, attributeFilter:['class','style','hidden']});
    disposers.push(() => observer.disconnect());
  }
  install(win, 'resize', reason('window-resize'));
  install(win, 'scroll', reason('window-scroll'));
  install(win?.visualViewport, 'resize', reason('viewport-resize'));
  install(win?.visualViewport, 'scroll', reason('viewport-scroll'));
  install(doc?.fonts, 'loadingdone', reason('fonts'));
  const register = (provisionId, element) => {
    alive();
    if (typeof provisionId !== 'string' || !ID.test(provisionId)) invalid('PROVISION_INVALID');
    if (!element || typeof element.getBoundingClientRect !== 'function' || !root.contains(element) || element.id !== elementId(provisionId)) invalid('UNTRUSTED_ANCHOR');
    if (!anchors.has(provisionId) && anchors.size >= maxAnchors) invalid('ANCHOR_LIMIT');
    const previous = anchors.get(provisionId);
    if (previous === element) return revision;
    if (previous) resizeObserver?.unobserve(previous);
    anchors.set(provisionId, element);
    resizeObserver?.observe(element);
    return invalidate('register');
  };
  const collect = () => {
    alive();
    const sections = root.querySelectorAll('section[id^="provision-"]');
    if (!sections || sections.length > maxAnchors) invalid('ANCHOR_LIMIT');
    const candidates = [];
    for (const el of sections) {
      const id = el?.id?.startsWith('provision-') ? el.id.slice('provision-'.length) : null;
      if (!id || !ID.test(id) || candidates.some(pair => pair[0] === id)) invalid('PROVISION_INVALID');
      candidates.push([id, el]);
    }
    const next = new Set(candidates.map(([id]) => id));
    for (const [id, el] of anchors) if (!next.has(id)) {resizeObserver?.unobserve(el); anchors.delete(id);invalidate('remove');}
    for (const [id, el] of candidates) register(id, el);
    return Object.freeze(candidates.map(([id]) => id));
  };
  const measure = ({expectedRevision} = {}) => {
    alive();
    if (expectedRevision !== undefined && expectedRevision !== revision) invalid('STALE_LAYOUT_REVISION');
    const result = [];
    for (const [provisionId, element] of anchors) {
      if (!root.contains(element) || element.id !== elementId(provisionId)) invalid('DETACHED_ANCHOR');
      const geometry = rectOf(element, win);
      result.push(Object.freeze({versionId, provisionId, layoutRevision:revision, ...geometry}));
    }
    return Object.freeze({versionId, layoutRevision:revision, anchors:Object.freeze(result)});
  };
  const resolve = ({sourceVersionId, provisionId, expectedRevision} = {}) => {
    alive();
    if (sourceVersionId !== versionId) invalid('VERSION_MISMATCH');
    if (typeof provisionId !== 'string' || !ID.test(provisionId)) invalid('PROVISION_INVALID');
    if (expectedRevision !== undefined && expectedRevision !== revision) invalid('STALE_LAYOUT_REVISION');
    const element = anchors.get(provisionId);
    if (!element) invalid('ANCHOR_NOT_FOUND');
    if (!root.contains(element) || element.id !== elementId(provisionId)) invalid('DETACHED_ANCHOR');
    return Object.freeze({versionId, provisionId, layoutRevision:revision, ...rectOf(element, win)});
  };
  return Object.freeze({
    get versionId() { return versionId; }, get layoutRevision() { return revision; },
    register, collect, measure, resolve, invalidate,
    dispose() { if (disposed) return; disposed = true; for (const fn of disposers.reverse()) fn(); anchors.clear(); }
  });
}
