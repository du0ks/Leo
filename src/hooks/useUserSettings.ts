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

    // Get current values from Zustand store (already loaded from localStorage - instant!)
    const { darkMode, themeColor, setDarkMode, setThemeColor } = useUIStore();

    // Background sync from Firestore - doesn't block UI
    const { data: settings } = useQuery({
        queryKey: ['settings', userId],
        queryFn: async (): Promise<UserSettings | null> => {
            if (!userId) return null;
            console.time('⚙️ Firestore Settings Fetch');
            const docRef = doc(db, 'users', userId);
            const snapshot = await getDoc(docRef);
            console.timeEnd('⚙️ Firestore Settings Fetch');
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
        // Don't refetch aggressively - we have local cache
        staleTime: 1000 * 60 * 5, // 5 minutes
        // Don't retry too much if offline
        retry: 1,
    });

    // Sync from Firestore to Zustand Store when data arrives (background)
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

    // Return immediately with Zustand values - NEVER block UI on Firestore
    return {
        settings: settings ?? { darkMode, themeColor },
        isLoading: false, // Never block - we always have cached settings
        updateSettings
    };
}
