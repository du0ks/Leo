import type { ReactNode } from 'react';
import { FamilyDrawer, DrawerHeader } from '../ui/rareui/FamilyDrawer';

/** Settings as a bottom sheet on touch layouts (lazy-loaded). */
export default function SettingsDrawer({
    open,
    onOpenChange,
    children,
}: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    children: ReactNode;
}) {
    return (
        <FamilyDrawer open={open} onOpenChange={onOpenChange} viewKey="settings" title="Settings">
            <DrawerHeader title="Settings" />
            <div className="-mt-4">{children}</div>
        </FamilyDrawer>
    );
}
