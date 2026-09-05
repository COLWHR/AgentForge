# 认证首页与双层管理员实现计划

> **面向 AI 代理的工作者：** 必需子技能：使用 `superpowers:subagent-driven-development`（推荐）或 `superpowers:executing-plans` 逐任务实现此计划。

**目标：** 让 AgentForge 在现有 React + Vite + FastAPI 架构里具备首页登录 / 注册入口、未登录强制拦截、平台管理员端、团队管理员端，以及清晰的用户可见性与不可见性规则。

**架构：** 保持当前 `AuthStore + React Router + FastAPI` 主链路不变，只补系统级角色与路由守卫。平台管理员使用独立系统权限，团队管理员继续使用 `TeamMember.role`。前端首页负责显式入口，受保护路由负责拦截，管理员端复用现有账户、团队、智能体和日志服务，不接外部后台框架。

**技术栈：** FastAPI、SQLAlchemy async、Pydantic、React Router、React、Vite、Zustand、Tailwind。

---

## 可见性规则

这部分先写进测试，再写进实现。

- 未登录用户只能看到：`/`、`/login`、`/register`、`/forgot-password`、`/reset-password`、`/p/:slug`。
- 登录用户只能看到自己团队内的工作台数据、个人资料、自己可访问的广场内容。
- 团队管理员只能看到本团队成员、团队资源、团队智能体、团队日志、团队额度。
- 平台管理员只能看到全局管理内容，不应被团队范围限制挡住。
- 任何人都不能通过前端菜单、直接路由或公开 API 看到别的团队的私有资源。
- 任何人都不能看到其他用户的密码、刷新 Token、内部密钥或未授权团队成员信息。

---

### 任务 1：后端系统角色与权限合同

**文件：**
- 修改：`backend/models/orm.py`
- 修改：`backend/models/schemas.py`
- 修改：`backend/services/account_service.py`
- 修改：`backend/services/token_service.py`
- 修改：`backend/api/dependencies.py`
- 修改：`backend/services/authorization_service.py`
- 修改：`backend/services/schema_migration_service.py`
- 修改：`tests/unit/test_account_auth_services.py`
- 修改：`tests/unit/test_auth.py`
- 新增：`tests/integration/test_admin_visibility.py`

**步骤：**
1. 先写失败测试，覆盖以下行为：

```python
async def test_session_exposes_platform_admin_flag():
    profile = await account_service.get_profile_for_auth(session, auth)
    assert profile.is_platform_admin is True


async def test_non_admin_cannot_access_admin_route(client, auth_headers):
    response = client.get("/admin/overview", headers=auth_headers)
    assert response.status_code == 403
```

2. 运行：

```bash
pytest tests/unit/test_account_auth_services.py tests/unit/test_auth.py tests/integration/test_admin_visibility.py -v
```

预期：测试失败，原因是 `is_platform_admin`、平台管理员判断或 `/admin/*` 路由尚未存在。

3. 在 `User` 表增加系统权限字段 `is_platform_admin: bool`，并把它放进 `AuthUserProfile`、`AuthContext` 和 JWT 载荷。
4. 在 `token_service` 里把平台权限写进访问 Token，在 `account_service` 里把该字段写回 session / profile 返回值，在 `schema_migration_service` 里保证现有 SQLite / PostgreSQL 库都能补上新列。
5. 在 `authorization_service` 里新增平台管理员判断函数，以及团队范围、用户可见性判断函数，确保跨团队读取和管理请求都会被拦截。
6. 重新运行上面的测试，直到它们通过。

### 任务 2：前端首页、认证入口和路由守卫

**文件：**
- 修改：`frontend/src/pages/HomePage.tsx`
- 修改：`frontend/src/app/routes/index.tsx`
- 修改：`frontend/src/features/auth/AuthGate.tsx`
- 修改：`frontend/src/features/auth/auth.store.ts`
- 修改：`frontend/src/pages/auth/AuthPages.tsx`
- 修改：`frontend/src/components/workspace/layout/UserSummary.tsx`
- 修改：`frontend/src/app/providers.tsx`
- 修改：`frontend/src/features/auth/auth.adapter.ts`
- 修改：`frontend/package.json`
- 修改：`frontend/vite.config.ts`
- 新增：`frontend/src/features/auth/role.ts`
- 新增：`frontend/src/pages/admin/AdminHomePage.tsx`
- 新增：`frontend/src/test/setup.ts`
- 新增：`frontend/src/test/render.tsx`

**步骤：**
1. 先写失败测试，覆盖首页按钮、路由跳转和守卫：

```tsx
render(<HomePage />)
expect(screen.getByRole('button', { name: /登录/i })).toBeInTheDocument()
expect(screen.getByRole('button', { name: /注册/i })).toBeInTheDocument()

render(<ProtectedRoute><div>ok</div></ProtectedRoute>)
expect(screen.getByText('正在验证登录状态...')).toBeInTheDocument()
```

2. 运行：

```bash
cd frontend
npm run test -- --run src/pages/__tests__/HomePage.test.tsx src/features/auth/__tests__/AuthGate.test.tsx
```

预期：测试失败，原因是新的入口和守卫行为还没实现。

3. 在 `frontend/package.json` 增加 `test` 脚本和测试依赖（`vitest`、`jsdom`、`@testing-library/react`、`@testing-library/jest-dom`、`@testing-library/user-event`），在 `frontend/vite.config.ts` 配好 `jsdom` 测试环境，在 `frontend/src/test/setup.ts` 注入 `@testing-library/jest-dom`，在 `frontend/src/test/render.tsx` 统一包一层路由和状态提供器。
4. 让首页顶部始终显示登录 / 注册入口；未登录时，点击“智能体开发”转到 `/login`。
5. 让 `AuthGate` 继续拦截 `/develop/*`、`/profile`、`/admin/*`，并在前端基于 `is_platform_admin` 与团队角色做菜单显示控制。
6. 让登录后重定向遵循角色：

```ts
if (user.is_platform_admin) navigate('/admin')
else navigate('/develop/agents')
```

7. 让 `UserSummary` 在团队管理员和平台管理员状态下显式露出对应入口，但普通用户看不到这些入口。
8. 补齐注册页顶部回跳、登录页跳注册、找回密码页和重置密码页的可见入口，保证它们不是“藏起来的路径”。

### 任务 3：管理员端页面与数据隔离

**文件：**
- 新增：`frontend/src/pages/admin/AdminHomePage.tsx`
- 新增：`frontend/src/pages/admin/AdminUsersPage.tsx`
- 新增：`frontend/src/pages/admin/AdminTeamsPage.tsx`
- 新增：`frontend/src/pages/admin/AdminAgentsPage.tsx`
- 新增：`frontend/src/pages/admin/AdminLogsPage.tsx`
- 新增：`frontend/src/pages/admin/AdminMarketplacePage.tsx`
- 修改：`frontend/src/app/routes/lazyRoutes.tsx`
- 修改：`frontend/src/app/routes/index.tsx`
- 新增：`frontend/src/features/admin/admin.adapter.ts`
- 新增：`frontend/src/features/admin/admin.store.ts`
- 新增：`backend/api/routes/admin.py`
- 新增：`tests/integration/test_admin_visibility.py`

**步骤：**
1. 先写失败测试，覆盖平台管理员可以访问 `/admin/*`，普通用户和团队管理员不能访问全局管理资源。
2. 运行：

```bash
pytest tests/integration/test_admin_visibility.py -v
```

预期：测试失败，原因是管理员路由、守卫或数据接口还未就位。

3. 后端新增 `/admin/overview`、`/admin/users`、`/admin/teams`、`/admin/agents`、`/admin/logs`、`/admin/marketplace` 等接口，全部只允许平台管理员访问。
4. 前端新增 `/admin` 及其子路由页面，首页入口只对平台管理员可见。
5. 每个管理员列表页只显示与当前权限匹配的数据，不能越权读到别的团队或未公开资源。
6. 团队管理员页固定挂在 `/develop/team-admin`，只显示本团队成员、团队资源、团队额度和团队日志。

### 任务 4：端到端验证与收尾

**文件：**
- 现有后端与前端测试套件
- 现有构建脚本

**步骤：**
1. 运行后端认证与权限测试：

```bash
pytest tests/unit/test_account_auth_services.py tests/unit/test_auth.py tests/integration/test_admin_visibility.py -v
```

2. 运行前端构建：

```bash
cd frontend
npm run build
```

3. 手工验证以下路径：

- 未登录访问 `/` 会看到登录 / 注册入口。
- 未登录访问 `/develop/agents` 会跳转到 `/login`。
- 登录普通用户后看不到平台管理入口。
- 登录团队管理员后看得到团队管理入口，但看不到平台管理入口。
- 登录平台管理员后能进入 `/admin`。

4. 把通过验证的修改一次性提交到 git。
