// https://nuxt.com/docs/api/configuration/nuxt-config
import { generateI18n } from './scripts/generateI18n'

export default defineNuxtConfig({
  modules: [
    '@nuxt/eslint',
    '@nuxt/ui',
    '@nuxthub/core',
    '@nuxt/content',
    '@nuxt/a11y',
    '@nuxt/hints',
    '@nuxt/image',
    '@nuxtjs/i18n',
    'nuxt-vue3-google-signin',
    '@nuxtjs/device',
    '@pinia/nuxt',
    'pinia-plugin-persistedstate/nuxt'
  ],
  ssr: true,

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
    googleClientId: '',
    googleClientSecret: '',
    sessionSecret: 'your-secret-key-change-in-production',
    xiaomiAiApiKey: '', // 小米 AI API Key
    xiaomiAiApiUrl: 'https://api.xiaomimimo.com/v1', // 小米 AI API 地址
    public: {
      googleClientId: '',
      siteUrl: 'https://sparkles-editor.com'
    }
  },

  compatibilityDate: '2026-02-26',

  nitro: {
    preset: 'cloudflare_module',
    cloudflare: {
      deployConfig: true,
      wrangler: {
        name: 'sparkles-editor',
        d1_databases: [
          {
            binding: 'DB',
            database_name: 'sparkles-db',
            database_id: 'c5841703-0ca7-40ad-81a8-b263c3434f76'
          }
        ],
        r2_buckets: [
          {
            binding: 'BLOB',
            bucket_name: 'sparkles-r2'
          }
        ],
        observability: {
          enabled: false,
          logs: {
            enabled: true,
            head_sampling_rate: 1,
            invocation_logs: true
          }
        }
      }
    }, // prerender: {
    //   crawlLinks: true,
    //   ignore: [
    //     '/__nuxt_content/content/sql_dump.txt'
    //   ]
    // }
    prerender: {
      autoSubfolderIndex: false,
      crawlLinks: true,
      ignore: [
        '/__nuxt_content/content/sql_dump.txt'
      ]
    }
  },

  hub: {
    blob: true
  },

  hooks: {
    'build:before': async () => {
      try {
        await generateI18n()
        console.log(`✔ generate i18n config success`)
      } catch (error) {
        console.log('update previewProducts.ts failed!', error)
      }
    }
  },

  eslint: {
    config: {
      stylistic: {
        commaDangle: 'never',
        braceStyle: '1tbs'
      }
    }
  },

  googleSignIn: {
    clientId: '463658926746-1nb91dmr6eouqq2h7gvvgcmvpmdn53fk.apps.googleusercontent.com'
  },

  i18n: {
    defaultLocale: 'en',
    locales: [
      {
        code: 'zh',
        iso: 'zh-CN',
        name: '中文'
      },
      {
        code: 'en',
        iso: 'en-US',
        name: 'English'
      }
    ],
    detectBrowserLanguage: false
  }
})
