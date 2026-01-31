import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { db, auth } from '../lib/firebase';
import { useUIStore, ThemeColor } from '../stores/uiStore';
import { useEffect } from 'react';

interface UserSettings {
    darkMode: boolean;
    themeColor: ThemeColor;
}

export function useUserSettings() {
    const queryClient = useQueryClient();
    const userId = auth.currentUser?.uid;
    const { setDarkMode, setThemeColor } = useUIStore();

    const { data: settings, isLoading } = useQuery({
        queryKey: ['settings', userId],
        queryFn: async (): Promise<UserSettings | null> => {
            if (!userId) return null;
            const docRef = doc(db, 'users', userId);
            const snapshot = await getDoc(docRef);
            if (snapshot.exists()) {
                const data = snapshot.data();
                return {
                    darkMode: data.darkMode ?? true,
                    themeColor: data.themeColor ?? 'blue',
                };
            }
            return null;
        },
        enabled: !!userId,
    });

    // Sync from Firestore to Zustand Store on load
    useEffect(() => {
        if (settings) {
            setDarkMode(settings.darkMode);
            setThemeColor(settings.themeColor);
        }
    }, [settings, setDarkMode, setThemeColor]);

    const updateSettings = useMutation({
        mutationFn: async (newSettings: Partial<UserSettings>) => {
            if (!userId) return;
            const docRef = doc(db, 'users', userId);
            await updateDoc(docRef, {
                ...newSettings,
                updatedAt: new Date(),
            });
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['settings', userId] });
        },
    });

    return { settings, isLoading, updateSettings };
}
