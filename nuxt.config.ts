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
    '@nuxtjs/i18n'
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

  compatibilityDate: '2025-07-15',

  nitro: {
    preset: 'cloudflare_module',
    cloudflare: {
      deployConfig: true,
      wrangler: {
        vars: {
          // 正式环境环境变量
        },
        r2_buckets: [
          {
            binding: 'BLOB',
            bucket_name: 'sparkles-r2'
          }
        ]
      }
    },
    // prerender: {
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

  vite: {
    optimizeDeps: {
      include: [
        '@nuxt/ui > prosemirror-state',
        '@nuxt/ui > prosemirror-tables',
        '@nuxt/ui > prosemirror-view'
      ]
    }
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
    detectBrowserLanguage: false,
  }
})
