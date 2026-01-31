import { Component, ReactNode } from 'react';

interface Props {
    children: ReactNode;
}

interface State {
    hasError: boolean;
    error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
    constructor(props: Props) {
        super(props);
        this.state = { hasError: false, error: null };
    }

    static getDerivedStateFromError(error: Error): State {
        return { hasError: true, error };
    }

    componentDidCatch(error: Error, errorInfo: any) {
        console.error('ErrorBoundary caught an error:', error, errorInfo);
    }

    render() {
        if (this.state.hasError) {
            return (
                <div className="h-screen flex flex-col items-center justify-center bg-app-bg p-6 text-center">
                    <div className="w-16 h-16 bg-red-500/20 rounded-2xl flex items-center justify-center mb-6">
                        <span className="text-2xl">⚠️</span>
                    </div>
                    <h2 className="text-2xl font-black text-app-text mb-2">Application Crash</h2>
                    <p className="text-app-muted mb-6 max-w-md mx-auto">
                        Leo encountered a critical error. The details below might help identify the issue.
                    </p>
                    <pre className="text-xs font-mono bg-app-surface border border-red-500/20 p-6 rounded-2xl text-red-500 overflow-auto max-w-2xl w-full text-left mb-8 shadow-xl">
                        {this.state.error?.message}
                    </pre>
                    <button
                        onClick={() => window.location.reload()}
                        className="px-8 py-3 bg-app-primary text-white rounded-2xl font-bold hover:bg-app-primary-hover transition-all shadow-lg shadow-app-primary/20 scale-100 hover:scale-105 active:scale-95"
                    >
                        Force Reload Leo
                    </button>
                </div>
            );
        }

        return this.props.children;
    }
}
