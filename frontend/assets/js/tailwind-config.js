tailwind.config = {
  theme: {
    extend: {
      colors: {
        base: '#070705',
        panel: '#3e4b51',
        muted: '#6f737e',
        accent: '#89a09a',
        light: '#c1c0ae',
        danger: '#d8a796',
      },
      fontFamily: {
        sans: ['Manrope', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        display: ['"Instrument Serif"', 'Georgia', 'serif'],
      },
      boxShadow: {
        cinema: '0 40px 120px -40px rgba(0, 0, 0, 0.95)',
        glow: '0 0 0 1px rgba(137, 160, 154, 0.18), 0 24px 80px -32px rgba(137, 160, 154, 0.25)',
      },
      keyframes: {
        'fade-up': {
          '0%': { opacity: '0', transform: 'translateY(14px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        'fade-in': {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        'scale-in': {
          '0%': { opacity: '0', transform: 'scale(0.97) translateY(10px)' },
          '100%': { opacity: '1', transform: 'scale(1) translateY(0)' },
        },
      },
      animation: {
        'fade-up': 'fade-up 0.7s cubic-bezier(0.22, 1, 0.36, 1) both',
        'fade-in': 'fade-in 0.4s ease-out both',
        'scale-in': 'scale-in 0.35s cubic-bezier(0.22, 1, 0.36, 1) both',
      },
    },
  },
};
