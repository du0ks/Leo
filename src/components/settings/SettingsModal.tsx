import { ActionIcon, Divider, Group, Modal, SimpleGrid, Stack, Switch, Text } from '@mantine/core';
import { Check, Moon, Sun } from 'lucide-react';
import { useUIStore, ThemeColor } from '../../stores/uiStore';
import { useUserSettings } from '../../hooks/useUserSettings';
import clsx from 'clsx';


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
            <Stack gap="xl" py="md">
                {/* Appearance Section */}
                <section>
                    <Text size="sm" fw={600} c="dimmed" tt="uppercase" mb="md" lts="0.05em">
                        Appearance
                    </Text>

                    <Group justify="space-between" mb="lg">
                        <Group gap="sm">
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

                {/* User Info / Other settings could go here */}
                <section className="flex flex-col items-center">
                    <img src="/leo.png" alt="Leo" className="w-8 h-8 object-contain mb-2 opacity-30 grayscale hover:grayscale-0 hover:opacity-100 transition-all cursor-help" />
                    <Text size="xs" c="dimmed" ta="center">
                        Leo Version 0.1.0 • Privacy First Notes
                    </Text>
                </section>
            </Stack>
        </Modal>
    );
}
