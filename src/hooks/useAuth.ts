import { useState, useEffect } from 'react';
import {
    onAuthStateChanged,
    signInWithEmailAndPassword,
    createUserWithEmailAndPassword,
    sendEmailVerification,
    sendPasswordResetEmail,
    signOut as firebaseSignOut,
    User,
    AuthError
} from 'firebase/auth';
import { doc, setDoc } from 'firebase/firestore';
import { auth, db } from '../lib/firebase';

// Convert Firebase error codes to user-friendly messages
function getAuthErrorMessage(error: AuthError): string {
    switch (error.code) {
        // Email errors
        case 'auth/invalid-email':
            return 'Please enter a valid email address.';
        case 'auth/email-already-in-use':
            return 'This email is already registered. Try signing in instead.';
        case 'auth/user-not-found':
            return 'No account found with this email. Please sign up first.';

        // Password errors
        case 'auth/weak-password':
            return 'Password must be at least 8 characters, including uppercase, number, and special character.';
        case 'auth/wrong-password':
            return 'Incorrect password. Please try again.';

        // Account errors
        case 'auth/user-disabled':
            return 'This account has been disabled. Contact support for help.';
        case 'auth/too-many-requests':
            return 'Too many failed attempts. Please wait a moment and try again.';

        // Network errors
        case 'auth/network-request-failed':
            return 'Network error. Please check your internet connection.';

        // Credential errors
        case 'auth/invalid-credential':
            return 'Invalid email or password. Please check and try again.';

        // Default fallback
        default:
            return 'Something went wrong. Please try again.';
    }
}

// HIGH-4: Strong password validation
function validatePasswordStrength(password: string): string | null {
    if (password.length < 8) return 'Password must be at least 8 characters long.';
    if (!/[A-Z]/.test(password)) return 'Password must contain at least one uppercase letter.';
    if (!/[0-9]/.test(password)) return 'Password must contain at least one number.';
    if (!/[^A-Za-z0-9]/.test(password)) return 'Password must contain at least one special character.';
    return null;
}

export function useAuth() {
    const [user, setUser] = useState<User | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const unsubscribe = onAuthStateChanged(auth, (firebaseUser: User | null) => {
            setUser(firebaseUser);
            setLoading(false);
        });

        return () => unsubscribe();
    }, []);

    const signIn = async (email: string, password: string) => {
        try {
            const { user } = await signInWithEmailAndPassword(auth, email, password);

            // Check if email is verified
            if (!user.emailVerified) {
                await firebaseSignOut(auth);
                throw new Error('Please verify your email before signing in. Check your inbox for the verification link.');
            }
        } catch (error) {
            // Re-throw our custom errors as-is
            if (error instanceof Error && !('code' in error)) {
                throw error;
            }
            // Convert Firebase errors to friendly messages
            throw new Error(getAuthErrorMessage(error as AuthError));
        }
    };

    const signUp = async (email: string, password: string) => {
        // HIGH-4: Validate password strength before sending to Firebase
        const passwordError = validatePasswordStrength(password);
        if (passwordError) {
            throw new Error(passwordError);
        }

        try {
            const { user } = await createUserWithEmailAndPassword(auth, email, password);

            // Send verification email
            await sendEmailVerification(user);

            // Create user profile in Firestore (LOW-2: no redundant email storage)
            await setDoc(doc(db, 'users', user.uid), {
                displayName: null,
                createdAt: new Date(),
                darkMode: true,
                themeColor: 'yellow',
            });

            // Sign out until verified
            await firebaseSignOut(auth);

            return 'Verification email sent! Please check your inbox.';
        } catch (error) {
            // Convert Firebase errors to friendly messages
            throw new Error(getAuthErrorMessage(error as AuthError));
        }
    };

    const signOut = async () => {
        await firebaseSignOut(auth);
    };

    const resetPassword = async (email: string) => {
        try {
            await sendPasswordResetEmail(auth, email);
            return 'Password reset email sent! Please check your inbox.';
        } catch (error) {
            throw new Error(getAuthErrorMessage(error as AuthError));
        }
    };

    return {
        user,
        session: user, // For backwards compatibility
        loading,
        isAuthenticated: !!user && user.emailVerified,
        signIn,
        signUp,
        signOut,
        resetPassword,
    };
}
