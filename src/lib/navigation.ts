
export const navigate = (path: string) => {
    // Safe navigation wrapper that works in both Web and Tauri
    window.history.pushState({}, '', path);
    window.dispatchEvent(new PopStateEvent('popstate'));
};
