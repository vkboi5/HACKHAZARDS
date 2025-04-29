import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import { nodePolyfills } from 'vite-plugin-node-polyfills'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  // Load env file based on `mode` in the current directory
  const env = loadEnv(mode, process.cwd())
  
  // Expose only VITE_ prefixed environment variables
  const processEnvValues = {}
  for (const [key, val] of Object.entries(env)) {
    if (key.startsWith('VITE_')) {
      processEnvValues[key] = val
    }
  }

  return {
    plugins: [
      react(),
      nodePolyfills({
        // Explicitly enable all polyfills we need
        include: [
          'buffer', 
          'process', 
          'util', 
          'stream', 
          'assert', 
          'crypto', 
          'path', 
          'os', 
          'http', 
          'https',
          'events',
          'url',
          'punycode',
          'querystring',
          'string_decoder',
          'zlib'
        ],
        // Enable specific globals
        globals: {
          Buffer: true,
          global: true,
          process: true,
        },
        // Enable node: protocol imports
        protocolImports: true,
      }),
    ],
    define: {
      // Only expose VITE_ prefixed env variables
      'process.env': processEnvValues,
    },
    // Add resolve.alias for older packages that might require it
    resolve: {
      alias: {
        stream: 'vite-plugin-node-polyfills/shims/stream',
        util: 'vite-plugin-node-polyfills/shims/util',
        buffer: 'vite-plugin-node-polyfills/shims/buffer'
      }
    },
    optimizeDeps: {
      esbuildOptions: {
        // Needed for OpenLogin/Web3Auth
        define: {
          global: 'globalThis'
        }
      }
    }
  }
})
