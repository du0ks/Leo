/** @type {import('tailwindcss').Config} */
export default {
    content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
    darkMode: 'class',
    theme: {
        extend: {
            fontFamily: {
                sans: ['Inter', 'system-ui', 'sans-serif'],
            },
            colors: {
                // Custom dark theme colors
                dark: {
                    bg: '#0f172a',
                    surface: '#1e293b',
                    border: '#334155',
                    text: '#f1f5f9',
                    muted: '#94a3b8',
                },
            },
        },
    },
    plugins: [],
}
