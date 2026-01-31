import { useState } from 'react';
import { useAuth } from '../../hooks/useAuth';
import { Sparkles, ArrowRight, Mail, Lock, Loader2 } from 'lucide-react';

export function LoginForm() {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [isSignUp, setIsSignUp] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const { signIn, signUp, loading } = useAuth();

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);

        try {
            if (isSignUp) {
                await signUp(email, password);
            } else {
                await signIn(email, password);
            }
        } catch (err) {
            setError(err instanceof Error ? err.message : 'An error occurred');
        }
    };

    return (
        <div className="min-h-screen flex items-center justify-center bg-app-bg px-4 transition-colors duration-500">
            <div className="w-full max-w-md">
                {/* Brand Header */}
                <div className="text-center mb-8">
                    <div className="inline-flex items-center justify-center p-3 mb-4 rounded-2xl bg-app-accent-bg glow-accent">
                        <Sparkles className="w-8 h-8 text-app-primary" />
                    </div>
                    <h1 className="text-3xl font-bold tracking-tight text-app-text mb-2 translate-y-0 transition-all">
                        Leo Notes
                    </h1>
                    <p className="text-app-muted">
                        Capture your thoughts, style your world.
                    </p>
                </div>

                {/* Card */}
                <div className="glass-panel p-8 rounded-2xl shadow-xl backdrop-blur-xl border border-app-border bg-app-surface/50">
                    <form onSubmit={handleSubmit} className="space-y-5">
                        {error && (
                            <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/20 text-red-500 text-sm animate-fade-in flex items-center gap-2">
                                <span className="w-1.5 h-1.5 rounded-full bg-red-500"></span>
                                {error}
                            </div>
                        )}

                        <div className="space-y-4">
                            <div className="relative group">
                                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-app-muted group-focus-within:text-app-primary transition-colors" />
                                <input
                                    type="email"
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                    placeholder="Email address"
                                    className="w-full pl-10 pr-4 py-3 bg-app-bg border border-app-border rounded-xl text-app-text placeholder:text-app-muted focus:outline-none focus:ring-2 focus:ring-app-primary/50 focus:border-app-primary transition-all"
                                    required
                                />
                            </div>

                            <div className="relative group">
                                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-app-muted group-focus-within:text-app-primary transition-colors" />
                                <input
                                    type="password"
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    placeholder="Password"
                                    className="w-full pl-10 pr-4 py-3 bg-app-bg border border-app-border rounded-xl text-app-text placeholder:text-app-muted focus:outline-none focus:ring-2 focus:ring-app-primary/50 focus:border-app-primary transition-all"
                                    required
                                />
                            </div>
                        </div>

                        <button
                            type="submit"
                            disabled={loading}
                            className="w-full relative overflow-hidden group py-3.5 px-4 bg-app-primary hover:bg-app-primary-hover text-white rounded-xl font-medium transition-all shadow-lg shadow-app-primary/25 disabled:opacity-50 disabled:cursor-not-allowed active:scale-[0.98]"
                        >
                            <div className="flex items-center justify-center gap-2 relative z-10">
                                {loading ? (
                                    <Loader2 className="w-5 h-5 animate-spin" />
                                ) : (
                                    <>
                                        <span>{isSignUp ? 'Create Account' : 'Sign In'}</span>
                                        <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
                                    </>
                                )}
                            </div>
                        </button>
                    </form>

                    <div className="mt-6 text-center">
                        <button
                            onClick={() => setIsSignUp(!isSignUp)}
                            className="text-sm text-app-muted hover:text-app-primary transition-colors font-medium"
                        >
                            {isSignUp ? 'Already have an account? Sign in' : "Don't have an account? Sign up"}
                        </button>
                    </div>
                </div>

                {/* Footer */}
                <p className="text-center text-xs text-app-muted mt-8 opacity-60">
                    Privacy First • End-to-End Encrypted • Open Source
                </p>
            </div>
        </div>
    );
}
