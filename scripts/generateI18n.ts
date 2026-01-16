import fs from 'fs'
import path from 'path'

/**
 * 将字符串转换为小驼峰命名法 (camelCase)。
 * 例如:
 * - 'my-file-name' -> 'myFileName'
 * * @param fileName 要转换的字符串（例如文件名）。
 * @returns 转换后的驼峰命名字符串。
 */
function toCamelCase(fileName: string): string {
  // 1. 使用正则表达式匹配分隔符（- 或 _）以及它们后面的第一个字母。
  const camel = fileName.replace(/[-_]+([a-z])/ig, (_, char) => {
    return char.toUpperCase()
  })

  // 2. 确保第一个字母是小写的。
  if (camel.length === 0) {
    return ''
  }

  // 提取首字母并转为小写，然后拼接剩余部分。
  return camel.charAt(0).toLowerCase() + camel.slice(1)
}

/**
 * 递归读取目录下的所有文件，并返回相对于 baseDir 的相对路径。
 * @param baseDir 基础目录 (e.g., i18n/locales/en)
 * @param currentDir 当前扫描的目录 (初始时等于 baseDir)
 * @param relativePath 递归中使用的相对路径 (初始为空字符串)
 * @returns 文件相对于 baseDir 的路径数组
 */
function readFilesRecursively(baseDir: string, currentDir: string, relativePath: string = ''): string[] {
  let results: string[] = []
  const items = fs.readdirSync(currentDir)

  for (const item of items) {
    const fullPath = path.join(currentDir, item)
    const stat = fs.statSync(fullPath)

    // 构造新的相对路径
    const newRelativePath = relativePath ? path.join(relativePath, item) : item

    if (stat.isDirectory()) {
      // 递归进入子目录
      results = results.concat(readFilesRecursively(baseDir, fullPath, newRelativePath))
    } else if (stat.isFile() && item.endsWith('.json')) {
      // 仅收集 JSON 文件
      results.push(newRelativePath)
    }
  }
  return results
}

export const generateI18n = async () => {
  const i18nDir = path.join(process.cwd(), 'i18n')
  const languagesDir = path.join(i18nDir, 'locales')

  const files: Record<string, string[]> = {}

  const languages = fs.readdirSync(languagesDir)
    .filter(name => fs.statSync(path.join(languagesDir, name)).isDirectory())

  // 核心优化点：使用递归函数
  for (const language of languages) {
    const languageDir = path.join(languagesDir, language)

    // 获取相对于 languageDir 的所有 JSON 文件相对路径
    const languageFiles = readFilesRecursively(languageDir, languageDir)

    if (languageFiles.length > 0) {
      files[language] = languageFiles
    }
  }

  // 用于存储每个语言的导入变量名数组
  const languageArrays: Record<string, string[]> = {}

  // A. 构造 Import 语句部分
  const importStatements = Object.keys(files).flatMap((language) => {
    // 初始化数组
    languageArrays[language] = []

    // 确保 files[language] 存在
    const languageFiles = files[language]
    if (!languageFiles) return []

    return languageFiles.map((relativePath) => {
      // 相对路径作为文件名的一部分，用于生成唯一变量名
      const baseName = relativePath.split('.').slice(0, -1).join('.')

      // 使用 language + 相对路径（替换掉 / 或 \ 为 _）来生成唯一的变量名
      const uniqueKey = baseName.replace(/[/\\]/g, '_')
      const varName = toCamelCase(`${language}_${uniqueKey}`)

      // 将生成的变量名存储到对应的语言数组中
      const langArray = languageArrays[language]
      if (langArray) {
        langArray.push(varName)
      }

      // 导入路径需要正确地指向相对于 i18n.config.ts 的位置
      const importPath = `./locales/${language}/${relativePath}`

      // 使用分号结束导入语句
      return `import ${varName} from '${importPath}';`
    })
  }).join('\n')

  // C. 构造语言模块数组对象导出部分
  const languageModuleObjectContent = Object.keys(languageArrays).map((language) => {
    const langArray = languageArrays[language]
    if (!langArray) return ''
    const arrayContent = langArray.join(', ')
    // 键是语言代码，值是该语言对应的模块变量名数组
    // 使用 2 个空格缩进
    return `  '${language}': [${arrayContent}] as const,`
  }).join('\n')

  const languageModuleObjectExport = `
/**
 * 导出包含所有语言模块变量名数组的对象。
 * 用于运行时动态合并。
 */
const LanguageModuleArrays = {
${languageModuleObjectContent}
} as const;
`

  // D. 组合最终文件内容
  // 假定 defineI18nConfig 需要从 '@nuxtjs/i18n/runtime' 导入
  const i18nFileContent = `import { merge } from 'lodash-es';

${importStatements}

// 自定义合并函数，用于递归地将文件数组合并到对应的语言键下
const mergeAllLanguage = (arr: any[], language?: string) => {
  const temp = {};

  if (language) {
    arr.forEach(item => {
      const itemTemp = {};
      itemTemp[language] = item;
      merge(temp, itemTemp);
    });
  } else {
    arr.forEach(item => {
      merge(temp, item);
    });
  }
  return temp;
};

${languageModuleObjectExport.trim()}

// 动态构建最终的 messages 对象
const messages = mergeAllLanguage(
  Object.keys(LanguageModuleArrays).map((key: string) => {
    return mergeAllLanguage(LanguageModuleArrays[key as keyof typeof LanguageModuleArrays], key);
  })
);

export default defineI18nConfig(() => ({
  legacy: false,
  locale: 'zh',
  fallbackLocale: 'en',
  messages: messages,
}));
`

  fs.writeFileSync(path.join(i18nDir, 'i18n.config.ts'), i18nFileContent)
  console.log(`✅ 成功生成 i18n 配置到 ${path.join(i18nDir, 'i18n.config.ts')}`)
}

// 如果直接运行此脚本
if (import.meta.url === `file://${process.argv[1]}`) {
  generateI18n().catch(console.error)
}
