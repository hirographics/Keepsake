// Tells the app you just tried a technique. Kept tiny so any tool can call it
// without pulling in the rewards code.
export const tried = id => window.dispatchEvent(new CustomEvent('keepsake-tried', { detail: id }));
