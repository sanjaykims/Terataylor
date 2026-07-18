import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Hearth uses plain CSS custom properties (no Tailwind).
export default defineConfig({
  plugins: [react()],
})
