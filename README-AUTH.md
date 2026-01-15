# 认证和文档管理功能说明

## 功能概述

本项目已集成以下功能：

1. **用户认证系统**
   - 邮箱密码注册/登录
   - Google OAuth 登录（需要配置）
   - 会话管理

2. **文档管理**
   - 文档保存到 Cloudflare R2
   - 文档列表查看
   - 文档编辑和删除
   - 文档元数据存储在 Cloudflare D1

3. **移动端优化**
   - 响应式布局
   - 触摸友好的按钮尺寸
   - 优化的移动端工具栏

## 配置步骤

### 1. Cloudflare D1 数据库配置

1. 在 Cloudflare Dashboard 创建 D1 数据库
2. 在 `nuxt.config.ts` 中更新数据库 ID：

```typescript
d1_databases: [
  {
    binding: 'DB',
    database_name: 'sparkles-db',
    database_id: 'your-database-id-here' // 替换为实际的数据库 ID
  }
]
```

3. 本地开发时，在 `wrangler.toml` 中添加：

```toml
[[d1_databases]]
binding = "DB"
database_name = "sparkles-db"
database_id = "your-database-id-here"
```

### 2. Cloudflare R2 配置

R2 存储桶已在 `nuxt.config.ts` 中配置为 `sparkles-r2`。确保：
- 在 Cloudflare Dashboard 中创建了名为 `sparkles-r2` 的 R2 存储桶
- 绑定的名称是 `BLOB`

### 3. Google OAuth 配置

本项目使用 `nuxt-vue3-google-signin` 模块和 `useCodeClient` 模式实现 Google 登录。

#### 3.1 创建 Google OAuth 应用

1. 访问 [Google Cloud Console](https://console.cloud.google.com/)
2. 创建新项目或选择现有项目
3. 启用 Google+ API
4. 创建 OAuth 2.0 客户端 ID（Web 应用类型）
5. 添加授权重定向 URI：
   - 开发环境：`http://localhost:3000`
   - 生产环境：`https://your-domain.com`
   
   **注意**：使用 `useCodeClient` 时，redirect_uri 应该是应用的根 URL，而不是 callback URL。

#### 3.2 安装模块

模块已通过以下命令安装：

```bash
pnpm add nuxt-vue3-google-signin
```

#### 3.3 配置模块

在 `nuxt.config.ts` 中已配置：

```typescript
modules: [
  // ... 其他模块
  'nuxt-vue3-google-signin'
],

googleSignIn: {
  clientId: process.env.GOOGLE_CLIENT_ID || ''
}
```

#### 3.4 更新环境变量

在 `.env` 文件中添加：

```env
GOOGLE_CLIENT_ID=your-google-client-id
GOOGLE_CLIENT_SECRET=your-google-client-secret
```

#### 3.5 工作原理

1. 用户点击"使用 Google 登录"按钮
2. `useCodeClient` 触发 Google OAuth 流程
3. 用户授权后，Google 返回 authorization code
4. 前端将 code 发送到 `/api/auth/google/code`
5. 后端使用 code 交换 access token
6. 使用 access token 获取用户信息
7. 创建或更新用户，建立会话

### 4. 会话密钥配置

在生产环境中，设置 `SESSION_SECRET` 环境变量：

```env
SESSION_SECRET=your-very-secure-random-secret-key
```

## 数据库初始化

数据库表会在首次 API 调用时自动创建。如果需要手动初始化，可以运行：

```bash
wrangler d1 execute sparkles-db --file=./schema.sql
```

## API 端点

### 认证相关

- `POST /api/auth/register` - 用户注册
- `POST /api/auth/login` - 用户登录
- `POST /api/auth/logout` - 用户登出
- `GET /api/auth/me` - 获取当前用户信息
- `POST /api/auth/google` - Google OAuth 登录

### 文档相关

- `GET /api/documents` - 获取文档列表
- `GET /api/documents/:id` - 获取文档详情
- `POST /api/documents` - 创建新文档
- `PUT /api/documents/:id` - 更新文档
- `DELETE /api/documents/:id` - 删除文档

## 使用说明

1. **注册/登录**：点击右上角"登录"按钮
2. **创建文档**：在编辑器中编写内容，点击"保存文档"按钮
3. **查看文档**：点击"我的文档"查看所有保存的文档
4. **编辑文档**：在文档列表中点击文档进行编辑
5. **删除文档**：在文档列表中点击删除按钮

## 组件结构

### 认证组件
- `app/components/auth/AuthModal.vue` - 登录/注册模态框

### 文档组件
- `app/components/documents/DocumentList.vue` - 文档列表
- `app/components/documents/SaveDocumentButton.vue` - 保存文档按钮

### Composables
- `app/composables/useAuth.ts` - 认证相关逻辑
- `app/composables/useDocuments.ts` - 文档管理逻辑

## 安全注意事项

1. **密码加密**：使用 SHA-256 哈希（生产环境建议使用 bcrypt）
2. **会话管理**：使用 HTTP-only cookies
3. **CORS**：确保正确配置 CORS 策略
4. **输入验证**：所有用户输入都应进行验证和清理

## 待完善功能

1. 完整的 Google OAuth 集成
2. 密码重置功能
3. 邮箱验证
4. 文档分享功能
5. 文档版本控制
6. 更安全的会话管理（JWT）
