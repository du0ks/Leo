import { useState } from 'react';
import { useAuth } from '../../hooks/useAuth';
import { ArrowRight, Mail, Lock, Loader2 } from 'lucide-react';

export function LoginForm() {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [isSignUp, setIsSignUp] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState<string | null>(null);

    const { signIn, signUp, loading } = useAuth();

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);
        setSuccess(null);

        try {
            if (isSignUp) {
                const message = await signUp(email, password);
                setSuccess(message);
                // Clear password but keep email for convenience? 
                setPassword('');
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
                <div className="text-center mb-10">
                    <div className="inline-flex items-center justify-center mb-2">
                        <img src="/leo.png" alt="Leo Logo" className="w-32 h-32 object-contain drop-shadow-2xl animate-float" />
                    </div>
                    <h1 className="text-5xl font-black tracking-tighter text-app-text mb-2 bg-gradient-to-r from-app-primary to-app-primary-hover bg-clip-text text-transparent">
                        Leo
                    </h1>
                    <p className="text-app-muted text-lg">
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

                        {success && (
                            <div className="p-4 rounded-xl bg-green-500/10 border border-green-500/20 text-green-600 text-sm animate-fade-in flex flex-col gap-1">
                                <div className="flex items-center gap-2 font-bold">
                                    <span className="w-1.5 h-1.5 rounded-full bg-green-500"></span>
                                    Success!
                                </div>
                                <p className="ml-3.5">{success}</p>
                            </div>
                        )}

                        <div className="space-y-4">
                            <div className="relative group">
                                <div className="absolute left-4 top-1/2 -translate-y-1/2 flex items-center justify-center pointer-events-none z-10">
                                    <Mail className="w-5 h-5 text-app-muted group-focus-within:text-app-primary transition-colors" />
                                </div>
                                <input
                                    type="email"
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                    placeholder="Email address"
                                    className="w-full !pl-12 pr-4 py-3.5 bg-app-bg border border-app-border rounded-xl text-app-text placeholder:text-app-muted focus:outline-none focus:ring-2 focus:ring-app-primary/50 focus:border-app-primary transition-all"
                                    required
                                />
                            </div>

                            <div className="relative group">
                                <div className="absolute left-4 top-1/2 -translate-y-1/2 flex items-center justify-center pointer-events-none z-10">
                                    <Lock className="w-5 h-5 text-app-muted group-focus-within:text-app-primary transition-colors" />
                                </div>
                                <input
                                    type="password"
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    placeholder="Password"
                                    className="w-full !pl-12 pr-4 py-3.5 bg-app-bg border border-app-border rounded-xl text-app-text placeholder:text-app-muted focus:outline-none focus:ring-2 focus:ring-app-primary/50 focus:border-app-primary transition-all"
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
                            onClick={() => {
                                setIsSignUp(!isSignUp);
                                setError(null);
                                setSuccess(null);
                            }}
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
