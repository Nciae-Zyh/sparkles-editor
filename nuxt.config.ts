// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  modules: [
    '@nuxt/eslint',
    '@nuxt/ui',
    '@nuxthub/core',
    '@nuxt/content',
    '@nuxt/a11y',
    '@nuxt/hints',
    '@nuxt/image'
  ],

  devtools: {
    enabled: true
  },

  css: ['~/assets/css/main.css'],

  content: {
    ignores: [
      '**/*.txt',
      '**/sql_dump.*'
    ]
  },

  ui: {
    experimental: {
      componentDetection: true
    }
  },

  runtimeConfig: {
    public: {
      partykitHost: ''
    }
  },

  compatibilityDate: '2025-01-15',

  nitro: {
    prerender: {
      crawlLinks: true,
      ignore: [
        '/__nuxt_content/content/sql_dump.txt'
      ]
    }
  },

  hub: {
    blob: true
  },

  vite: {
    optimizeDeps: {
      include: [
        '@nuxt/ui > prosemirror-state',
        '@nuxt/ui > prosemirror-tables',
        '@nuxt/ui > prosemirror-view',
        'yjs',
        'y-partykit/provider'
      ]
    }
  },

  eslint: {
    config: {
      stylistic: {
        commaDangle: 'never',
        braceStyle: '1tbs'
      }
    }
  }
})
