import { useState, useEffect } from 'react';
import {
    onAuthStateChanged,
    signInWithEmailAndPassword,
    createUserWithEmailAndPassword,
    sendEmailVerification,
    signOut as firebaseSignOut,
    User
} from 'firebase/auth';
import { doc, setDoc } from 'firebase/firestore';
import { auth, db } from '../lib/firebase';

export function useAuth() {
    const [user, setUser] = useState<User | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const unsubscribe = onAuthStateChanged(auth, (user) => {
            setUser(user);
            setLoading(false);
        });

        return () => unsubscribe();
    }, []);

    const signIn = async (email: string, password: string) => {
        const { user } = await signInWithEmailAndPassword(auth, email, password);

        // Check if email is verified
        if (!user.emailVerified) {
            await firebaseSignOut(auth);
            throw new Error('Please verify your email before signing in. Check your inbox for the verification link.');
        }
    };

    const signUp = async (email: string, password: string) => {
        const { user } = await createUserWithEmailAndPassword(auth, email, password);

        // Send verification email
        await sendEmailVerification(user);

        // Create user profile in Firestore
        await setDoc(doc(db, 'users', user.uid), {
            email: user.email,
            displayName: null,
            createdAt: new Date(),
            darkMode: true,
            themeColor: 'blue',
        });

        // Sign out until verified
        await firebaseSignOut(auth);

        return 'Verification email sent! Please check your inbox.';
    };

    const signOut = async () => {
        await firebaseSignOut(auth);
    };

    return {
        user,
        session: user, // For backwards compatibility
        loading,
        isAuthenticated: !!user && user.emailVerified,
        signIn,
        signUp,
        signOut,
    };
}
