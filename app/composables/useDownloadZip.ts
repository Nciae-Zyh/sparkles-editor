import JSZip from 'jszip'

/**
 * 判断是否为内部链接（网站内的链接）
 */
function isInternalUrl(url: string): boolean {
  // 相对路径（以 / 开头）是内部链接
  if (url.startsWith('/')) {
    return true
  }

  // 检查是否是当前网站的链接
  if (url.startsWith('http://') || url.startsWith('https://')) {
    try {
      const urlObj = new URL(url)
      const currentOrigin = window.location.origin
      // 如果是当前网站的域名，则是内部链接
      return urlObj.origin === currentOrigin
    } catch {
      // URL 解析失败，视为外部链接
      return false
    }
  }

  // 其他情况视为外部链接
  return false
}

/**
 * 从 markdown 内容中提取所有图片 URL
 */
function extractImageUrls(markdown: string): Array<{ url: string, isInternal: boolean }> {
  const imageRegex = /!\[.*?\]\((.*?)\)/g
  const urls: Array<{ url: string, isInternal: boolean }> = []
  let match

  while ((match = imageRegex.exec(markdown)) !== null) {
    const url = match[1]
    // 排除 data URL
    if (!url.startsWith('data:')) {
      const isInternal = isInternalUrl(url)
      urls.push({ url, isInternal })
    }
  }

  // 去重
  const uniqueUrls = new Map<string, boolean>()
  for (const item of urls) {
    if (!uniqueUrls.has(item.url)) {
      uniqueUrls.set(item.url, item.isInternal)
    }
  }

  return Array.from(uniqueUrls.entries()).map(([url, isInternal]) => ({ url, isInternal }))
}

/**
 * 下载图片并转换为 Blob
 */
async function fetchImageAsBlob(url: string): Promise<{ blob: Blob, contentType?: string }> {
  try {
    // 如果是相对路径，转换为绝对路径
    const imageUrl = url.startsWith('/') ? `${window.location.origin}${url}` : url
    const response = await fetch(imageUrl, {
      mode: 'cors',
      credentials: 'omit'
    })
    if (!response.ok) {
      throw new Error(`Failed to fetch image: ${response.statusText}`)
    }
    const blob = await response.blob()
    const contentType = response.headers.get('content-type') || undefined
    return { blob, contentType }
  } catch (error) {
    console.error(`Error fetching image ${url}:`, error)
    throw error
  }
}

/**
 * 根据 MIME 类型获取文件扩展名
 */
function getExtensionFromMimeType(mimeType: string | undefined): string {
  if (!mimeType) return 'png'

  const mimeMap: Record<string, string> = {
    'image/jpeg': 'jpg',
    'image/jpg': 'jpg',
    'image/png': 'png',
    'image/gif': 'gif',
    'image/webp': 'webp',
    'image/svg+xml': 'svg',
    'image/bmp': 'bmp'
  }

  return mimeMap[mimeType.toLowerCase()] || 'png'
}

/**
 * 获取图片文件名
 */
function getImageFileName(url: string, index: number, usedNames: Set<string>, contentType?: string): string {
  // 尝试从 URL 中提取文件名
  const urlPath = url.split('?')[0] // 移除查询参数
  let fileName = urlPath.split('/').pop() || `image-${index + 1}`

  // 如果没有扩展名，根据 MIME 类型或使用默认扩展名
  if (!fileName.includes('.')) {
    const ext = getExtensionFromMimeType(contentType)
    fileName = `${fileName}.${ext}`
  }

  // 如果文件名已存在，添加索引后缀
  let finalFileName = fileName
  let counter = 1
  while (usedNames.has(finalFileName)) {
    const ext = fileName.substring(fileName.lastIndexOf('.'))
    const nameWithoutExt = fileName.substring(0, fileName.lastIndexOf('.'))
    finalFileName = `${nameWithoutExt}-${counter}${ext}`
    counter++
  }

  usedNames.add(finalFileName)
  return finalFileName
}

/**
 * 替换 markdown 中的图片路径
 * 内部链接替换为本地路径，外部链接保留原链接
 */
function replaceImagePaths(markdown: string, imageMap: Map<string, string>, internalUrls: Set<string>): string {
  let result = markdown
  const imagesDir = 'images'

  // 替换内部链接为本地路径
  imageMap.forEach((fileName, url) => {
    if (internalUrls.has(url)) {
      const localPath = `${imagesDir}/${fileName}`
      // 替换所有匹配的图片 URL
      result = result.replace(new RegExp(`!\\[.*?\\]\\(${escapeRegex(url)}\\)`, 'g'), (match) => {
        return match.replace(url, localPath)
      })
    }
    // 外部链接不替换，保留原链接
  })

  return result
}

/**
 * 转义正则表达式特殊字符
 */
function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * 下载编辑器内容为 ZIP 文件
 */
export function useDownloadZip() {
  const isDownloading = ref(false)

  async function downloadAsZip(markdown: string, filename = 'editor-content.zip') {
    if (isDownloading.value) {
      return
    }

    isDownloading.value = true

    try {
      const zip = new JSZip()

      // 提取所有图片 URL（区分内部和外部链接）
      const imageUrls = extractImageUrls(markdown)

      // 创建 images 目录
      const imagesFolder = zip.folder('images')
      const usedFileNames = new Set<string>()

      // 只下载内部链接的图片，外部链接保留原链接
      const imageMap = new Map<string, string>() // 原始 URL -> 本地文件名（仅内部链接）
      const internalUrls = new Set<string>() // 记录哪些是内部链接

      const imagePromises = imageUrls.map(async (item, index) => {
        const { url, isInternal } = item

        if (isInternal) {
          // 只下载内部链接的图片
          internalUrls.add(url)
          try {
            const { blob, contentType } = await fetchImageAsBlob(url)
            const fileName = getImageFileName(url, index, usedFileNames, contentType)
            imageMap.set(url, fileName)
            imagesFolder?.file(fileName, blob)
          } catch (error) {
            console.error(`Failed to download image ${url}:`, error)
            // 下载失败时，从内部链接列表中移除，保留原链接
            internalUrls.delete(url)
          }
        }
        // 外部链接不处理，保留原链接
      })

      await Promise.all(imagePromises)

      // 替换 markdown 中的图片路径：内部链接替换为本地路径，外部链接保留
      const updatedMarkdown = replaceImagePaths(markdown, imageMap, internalUrls)

      // 添加 markdown 文件到 zip
      zip.file('content.md', updatedMarkdown)

      // 生成 zip 文件
      const zipBlob = await zip.generateAsync({ type: 'blob' })

      // 创建下载链接
      const url = URL.createObjectURL(zipBlob)
      const link = document.createElement('a')
      link.href = url
      link.download = filename
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      URL.revokeObjectURL(url)
    } catch (error) {
      console.error('Error creating zip file:', error)
      throw error
    } finally {
      isDownloading.value = false
    }
  }

  return {
    downloadAsZip,
    isDownloading: readonly(isDownloading)
  }
}
