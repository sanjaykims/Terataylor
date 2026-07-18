import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// Hearth tokens are the source of truth (src/index.css). Tailwind is enabled
// for the learning components' layout utilities, with its palette remapped to
// Hearth tokens via the @theme block in index.css.
export default defineConfig({
  plugins: [react(), tailwindcss()],
})
