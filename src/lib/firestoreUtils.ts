import { Timestamp, writeBatch, type DocumentData, type DocumentReference, type Unsubscribe } from 'firebase/firestore';
import { db } from './firebase';

/**
 * Resolve with the first value emitted by a Firestore listener.
 *
 * Used as a React Query `queryFn` next to a long-lived `onSnapshot` listener on
 * the same query. Firestore shares the underlying watch target between
 * identical listeners, so this does not cost extra document reads (unlike
 * calling `getDocs` and then also subscribing).
 */
export function firstSnapshot<T>(
    subscribe: (next: (value: T) => void, error: (err: Error) => void) => Unsubscribe
): Promise<T> {
    return new Promise<T>((resolve, reject) => {
        let settled = false;
        let unsubscribe: Unsubscribe | null = null;
        const finish = () => {
            settled = true;
            unsubscribe?.();
        };
        unsubscribe = subscribe(
            (value) => {
                if (settled) return;
                finish();
                resolve(value);
            },
            (err) => {
                if (settled) return;
                finish();
                reject(err);
            }
        );
        if (settled) unsubscribe();
    });
}

export const toIso = (value: unknown, fallback: string | null = new Date().toISOString()): string | null =>
    value instanceof Timestamp ? value.toDate().toISOString() : fallback;

type BatchOp =
    | { type: 'update'; ref: DocumentReference; data: DocumentData }
    | { type: 'delete'; ref: DocumentReference };

// Firestore batches are limited to 500 operations.
const BATCH_LIMIT = 450;

/** Commit many writes using as few batches as possible (atomic per chunk). */
export async function commitInChunks(ops: BatchOp[]): Promise<void> {
    const commits: Promise<void>[] = [];
    for (let i = 0; i < ops.length; i += BATCH_LIMIT) {
        const batch = writeBatch(db);
        for (const op of ops.slice(i, i + BATCH_LIMIT)) {
            if (op.type === 'update') batch.update(op.ref, op.data);
            else batch.delete(op.ref);
        }
        commits.push(batch.commit());
    }
    await Promise.all(commits);
}

/** JSON.stringify with sorted object keys, so key order does not affect equality. */
export function stableStringify(value: unknown): string {
    return JSON.stringify(value, (_key, val) => {
        if (val && typeof val === 'object' && !Array.isArray(val)) {
            return Object.keys(val)
                .sort()
                .reduce<Record<string, unknown>>((acc, k) => {
                    acc[k] = (val as Record<string, unknown>)[k];
                    return acc;
                }, {});
        }
        return val;
    });
}
