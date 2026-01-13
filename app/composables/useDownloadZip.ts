import JSZip from 'jszip'

/**
 * 从 markdown 内容中提取所有图片 URL
 */
function extractImageUrls(markdown: string): string[] {
  const imageRegex = /!\[.*?\]\((.*?)\)/g
  const urls: string[] = []
  let match

  while ((match = imageRegex.exec(markdown)) !== null) {
    const url = match[1]
    // 排除 data URL 和外部链接（如果以 http:// 或 https:// 开头但不是本地的）
    if (!url.startsWith('data:') && (url.startsWith('/') || url.startsWith('http://') || url.startsWith('https://'))) {
      urls.push(url)
    }
  }

  return [...new Set(urls)] // 去重
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
 * 替换 markdown 中的图片路径为本地路径（使用映射表）
 */
function replaceImagePathsWithMap(markdown: string, imageMap: Map<string, string>): string {
  let result = markdown
  const imagesDir = 'images'

  imageMap.forEach((fileName, url) => {
    const localPath = `${imagesDir}/${fileName}`
    // 替换所有匹配的图片 URL
    result = result.replace(new RegExp(`!\\[.*?\\]\\(${escapeRegex(url)}\\)`, 'g'), (match) => {
      return match.replace(url, localPath)
    })
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

      // 提取所有图片 URL
      const imageUrls = extractImageUrls(markdown)

      // 创建 images 目录
      const imagesFolder = zip.folder('images')
      const usedFileNames = new Set<string>()

      // 下载所有图片并添加到 zip，同时记录文件名映射
      const imageMap = new Map<string, string>() // 原始 URL -> 本地文件名
      const imagePromises = imageUrls.map(async (url, index) => {
        try {
          const { blob, contentType } = await fetchImageAsBlob(url)
          const fileName = getImageFileName(url, index, usedFileNames, contentType)
          imageMap.set(url, fileName)
          imagesFolder?.file(fileName, blob)
        } catch (error) {
          console.error(`Failed to download image ${url}:`, error)
          // 继续处理其他图片，不中断整个流程
        }
      })

      await Promise.all(imagePromises)

      // 替换 markdown 中的图片路径为本地路径
      const updatedMarkdown = replaceImagePathsWithMap(markdown, imageMap)

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
