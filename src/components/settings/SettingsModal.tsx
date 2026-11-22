import { ActionIcon, Divider, Group, Modal, SimpleGrid, Slider, Stack, Switch, Text } from '@mantine/core';
import { Check, Moon, Sparkles, Sun } from 'lucide-react';
import { useUIStore, ThemeColor } from '../../stores/uiStore';
import { useUserSettings } from '../../hooks/useUserSettings';
import clsx from 'clsx';
import { useMediaQuery, MOBILE_QUERY } from '../../hooks/useMediaQuery';
import { lazy, Suspense } from 'react';

const SettingsDrawer = lazy(() => import('./SettingsDrawer'));


const THEME_COLORS: { name: ThemeColor; color: string }[] = [
    { name: 'blue', color: '#3b82f6' },
    { name: 'red', color: '#ef4444' },
    { name: 'yellow', color: '#eab308' },
    { name: 'green', color: '#22c55e' },
    { name: 'grey', color: '#64748b' },
    { name: 'black', color: '#171717' },
    { name: 'purple', color: '#a855f7' },
    { name: 'pink', color: '#ec4899' },
];

export function SettingsModal() {
    const {
        settingsOpen,
        setSettingsOpen,
        darkMode,
        setDarkMode,
        themeColor,
        setThemeColor
    } = useUIStore();

    const { updateSettings } = useUserSettings();

    const handleDarkModeChange = (checked: boolean) => {
        setDarkMode(checked);
        updateSettings.mutate({ darkMode: checked });
    };

    const handleThemeColorChange = (color: ThemeColor) => {
        setThemeColor(color);
        updateSettings.mutate({ themeColor: color });
    };

    const isMobile = useMediaQuery(MOBILE_QUERY);
    const edgeLight = useUIStore((s) => s.edgeLight);
    const setEdgeLight = useUIStore((s) => s.setEdgeLight);
    const hoverGrain = useUIStore((s) => s.hoverGrain);
    const setHoverGrain = useUIStore((s) => s.setHoverGrain);
    const paperGrain = useUIStore((s) => s.paperGrain);
    const setPaperGrain = useUIStore((s) => s.setPaperGrain);
    const pct = (v: number) => (v === 0 ? 'Off' : `${Math.round(v * 100)}%`);

    const content = (
        <Stack gap="xl" py="md">
            {/* Appearance Section */}
            <section>
                <Text size="sm" fw={600} c="dimmed" tt="uppercase" mb="md" lts="0.05em">
                    Appearance
                </Text>

                <Group justify="space-between" mb="lg" wrap="nowrap">
                    <Group gap="sm" wrap="nowrap">
                        <div className="p-2 rounded-lg bg-app-accent-bg text-app-primary">
                            {darkMode ? <Moon size={20} /> : <Sun size={20} />}
                        </div>
                        <div>
                            <Text size="sm" fw={500}>Dark Mode</Text>
                            <Text size="xs" c="dimmed">Switch between dark and light themes</Text>
                        </div>
                    </Group>
                    <Switch
                        checked={darkMode}
                        onChange={(event) => handleDarkModeChange(event.currentTarget.checked)}
                        size="md"
                        color="var(--primary)"
                        aria-label="Dark mode"
                    />
                </Group>

                <Divider mb="lg" color="var(--border)" />

                <Text size="sm" fw={500} mb="sm">Accent Color</Text>
                <SimpleGrid cols={4} spacing="md">
                    {THEME_COLORS.map(({ name, color }) => (
                        <Stack key={name} align="center" gap={4}>
                            <ActionIcon
                                variant="filled"
                                size="xl"
                                radius="md"
                                onClick={() => handleThemeColorChange(name)}
                                aria-label={`${name} accent`}
                                aria-pressed={themeColor === name}
                                className={clsx(
                                    "transition-all duration-200 ring-offset-2 ring-offset-app-surface",
                                    themeColor === name && "ring-2 ring-app-primary scale-110"
                                )}
                                style={{ backgroundColor: color }}
                            >
                                {themeColor === name && <Check size={20} />}
                            </ActionIcon>
                            <Text size="xs" tt="capitalize" fw={500} c={themeColor === name ? 'var(--primary)' : 'dimmed'}>
                                {name}
                            </Text>
                        </Stack>
                    ))}
                </SimpleGrid>
            </section>

            {/* Effects: paper texture everywhere; mouse effects on desktop only */}
            <section>
                <Text size="sm" fw={600} c="dimmed" tt="uppercase" mb="md" lts="0.05em">
                    Effects
                </Text>

                <Group justify="space-between" mb={6} wrap="nowrap">
                    <Text size="sm" fw={500} id="paper-grain-label">Paper texture</Text>
                    <Text size="xs" c="dimmed">{pct(paperGrain)}</Text>
                </Group>
                <Slider
                    aria-labelledby="paper-grain-label"
                    min={0}
                    max={100}
                    step={5}
                    value={Math.round(paperGrain * 100)}
                    onChange={(v) => setPaperGrain(v / 100)}
                    label={(v) => (v === 0 ? 'Off' : `${v}%`)}
                    color="var(--primary)"
                    size="sm"
                />
                <Text size="xs" c="dimmed" mt={6} mb={isMobile ? 0 : 'lg'}>A faint, permanent grain behind your notes.</Text>

            {!isMobile && (
                <>
                    <Group justify="space-between" mb="lg" wrap="nowrap">
                        <Group gap="sm" wrap="nowrap">
                            <div className="p-2 rounded-lg bg-app-accent-bg text-app-primary">
                                <Sparkles size={20} />
                            </div>
                            <div>
                                <Text size="sm" fw={500}>Edge light</Text>
                                <Text size="xs" c="dimmed">Light up the title, editor menus, code blocks and images near the mouse</Text>
                            </div>
                        </Group>
                        <Switch
                            checked={edgeLight}
                            onChange={(event) => setEdgeLight(event.currentTarget.checked)}
                            size="md"
                            color="var(--primary)"
                            aria-label="Edge light"
                        />
                    </Group>

                    <Group justify="space-between" mb={6} wrap="nowrap">
                        <Text size="sm" fw={500} id="hover-grain-label">Hover grain</Text>
                        <Text size="xs" c="dimmed">{pct(hoverGrain)}</Text>
                    </Group>
                    <Slider
                        aria-labelledby="hover-grain-label"
                        min={0}
                        max={100}
                        step={5}
                        value={Math.round(hoverGrain * 100)}
                        onChange={(v) => setHoverGrain(v / 100)}
                        label={(v) => (v === 0 ? 'Off' : `${v}%`)}
                        color="var(--primary)"
                        size="sm"
                    />
                    <Text size="xs" c="dimmed" mt={6}>Texture on buttons and list items under the mouse. Drag to 0 to turn off.</Text>
                </>
            )}
            </section>

            <section className="flex flex-col items-center">
                <img src="/leo.png" alt="" className="w-8 h-8 object-contain mb-2 opacity-30" />
                <Text size="xs" c="dimmed" ta="center">
                    Leo Version 0.1.0 • Privacy First Notes
                </Text>
                <Text size="xs" c="dimmed" ta="center" mt={4}>
                    Some UI components by{' '}
                    <a href="https://rareui.com" target="_blank" rel="noopener noreferrer" className="underline hover:text-app-primary">
                        Rare UI
                    </a>
                </Text>
            </section>
        </Stack>
    );

    if (isMobile) {
        if (!settingsOpen) return null;
        return (
            <Suspense fallback={null}>
                <SettingsDrawer open={settingsOpen} onOpenChange={setSettingsOpen}>
                    {content}
                </SettingsDrawer>
            </Suspense>
        );
    }

    return (
        <Modal
            opened={settingsOpen}
            onClose={() => setSettingsOpen(false)}
            title={<Text size="lg" fw={700}>Settings</Text>}
            centered
            size="md"
            radius="lg"
            overlayProps={{
                backgroundOpacity: 0.55,
                blur: 3,
            }}
            styles={{
                content: {
                    backgroundColor: 'var(--surface)',
                    color: 'var(--text)',
                    border: '1px solid var(--border)',
                },
                header: {
                    backgroundColor: 'var(--surface)',
                    color: 'var(--text)',
                    borderBottom: '1px solid var(--border)',
                },
                close: {
                    color: 'var(--muted)',
                    '&:hover': {
                        backgroundColor: 'var(--accent-bg)',
                    }
                }
            }}
        >
            {content}
        </Modal>
    );
}
