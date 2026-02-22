import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { doc, getDoc, setDoc, deleteField } from 'firebase/firestore';
import { db, auth } from '../lib/firebase';

export interface UserProfile {
    pin_code?: string;
}

export function useProfile() {
    const userId = auth.currentUser?.uid;

    return useQuery({
        queryKey: ['profile', userId],
        queryFn: async (): Promise<UserProfile | null> => {
            if (!userId) return null;
            const docRef = doc(db, 'users', userId);
            const docSnap = await getDoc(docRef);

            if (!docSnap.exists()) return null;
            return docSnap.data() as UserProfile;
        },
        enabled: !!userId,
    });
}

export function useUpdatePin() {
    const queryClient = useQueryClient();
    const userId = auth.currentUser?.uid;

    return useMutation({
        mutationFn: async (pin: string | null) => {
            if (!userId) throw new Error('Not authenticated');

            const docRef = doc(db, 'users', userId);
            if (pin) {
                await setDoc(docRef, { pin_code: pin }, { merge: true });
            } else {
                await setDoc(docRef, { pin_code: deleteField() }, { merge: true });
            }
            return pin;
        },
        onSuccess: (newPin) => {
            if (userId) {
                queryClient.setQueryData(['profile', userId], (old: any) => ({
                    ...old,
                    pin_code: newPin || undefined
                }));
            }
        },
    });
}
