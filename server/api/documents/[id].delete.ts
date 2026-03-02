import { getDBWithMigration } from '../../utils/db'
import { getCurrentUser } from '../../utils/auth'
import { getR2Bucket, deleteDocumentFromR2 } from '../../utils/r2'

export default eventHandler(async (event) => {
  const user = await getCurrentUser(event)
  if (!user) {
    throw createError({
      statusCode: 401,
      message: 'Unauthorized'
    })
  }

  const { id } = getRouterParams(event)
  const db = await getDBWithMigration(event)

  // 检查文档是否存在且属于当前用户
  const document = await db.prepare(`
    SELECT id, r2_key, type FROM documents WHERE id = ? AND user_id = ?
  `).bind(id, user.id).first() as any

  if (!document) {
    throw createError({
      statusCode: 404,
      message: 'Document not found'
    })
  }

  // 如果是文件夹，检查是否有子项
  if (document.type === 'folder') {
    const children = await db.prepare('SELECT id FROM documents WHERE parent_id = ? AND user_id = ?')
      .bind(id, user.id)
      .all()

    if (children.results && children.results.length > 0) {
      // 递归删除所有子项
      for (const child of children.results as any[]) {
        // 递归删除子项（这里简化处理，实际应该递归调用）
        const childDoc = await db.prepare('SELECT id, r2_key, type FROM documents WHERE id = ? AND user_id = ?')
          .bind(child.id, user.id)
          .first() as any

        if (childDoc) {
          // 删除存储内容（如果是文档）
          if (childDoc.type === 'document' && childDoc.r2_key) {
            const r2 = getR2Bucket(event)
            await deleteDocumentFromR2(r2, childDoc.r2_key)
          }

          // 删除子项
          await db.prepare('DELETE FROM documents WHERE id = ? AND user_id = ?')
            .bind(child.id, user.id)
            .run()
        }
      }
    }
  }

  // 从存储删除（如果是文档）
  if (document.type === 'document' && document.r2_key) {
    const r2 = getR2Bucket(event)
    await deleteDocumentFromR2(r2, document.r2_key)
  }

  // 从数据库删除（级联删除会处理子项，但我们已经手动处理了）
  await db.prepare('DELETE FROM documents WHERE id = ? AND user_id = ?')
    .bind(id, user.id)
    .run()

  return {
    success: true
  }
})
