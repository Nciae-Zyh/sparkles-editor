// 生成文档 ID（客户端版本，兼容浏览器）
export function generateDocumentId(): string {
  const array = new Uint8Array(16)
  crypto.getRandomValues(array)
  return Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('')
}
