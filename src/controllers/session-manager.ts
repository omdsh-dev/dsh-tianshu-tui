/**
 * 会话 resume 的模型定路。
 *
 * resume 一个已有会话时，模型选择以该会话持久化的 request header 为准（跨重启
 * 续模），而不是当前 agentDefaultModel——后者只在该会话从未成功发起请求
 * （无 header）时兜底。纯推导，不读会话日志、不触发副作用。
 *
 * 与 `adapter/sessions.ts` 的分工：那里负责会话列表 / 分叉 / 历史加载，本文件
 * 只做「持久化路由段 → ModelSelection」这一步。
 *
 * 历史注：本文件原名 session-manager.ts，曾承载 P3 的 `SessionManager` 多会话
 * 快照层（为未落地的 tab 栏准备）。该层从未被任何生产代码消费（TUI 至今是单
 * live-agent 模型），已随死代码清理移除——多会话 tab 栏若将来落地，应由真实
 * 消费方驱动设计，而不是复活旧账。
 *
 * @module @deepseek-ai/dsh-tianshu-tui/controllers/session-manager
 */

import type { ModelSelection } from '@deepseek-ai/dsh-agent'
import type { ReasoningEffortId } from '@deepseek-ai/dsh-llm'

/** resume 定路输入：会话持久化 request header 的路由段（缺 reasoningEffort 视为未定）。 */
export interface PersistedRouteConfig {
  provider: string
  model: string
  reasoningEffort?: ReasoningEffortId
}

/**
 * resume 模型定路：持久化 request header 优先（跨重启续模），无 header
 * （从未成功发起请求的会话）才落 agentDefaultModel 当前选择。
 * @param persisted - 目标会话的持久化路由段；undefined = 无 header。
 * @param fallback - 缺省选择的惰性取值（仅无持久化路由时调用，避免多余读取）。
 * @returns resume 使用的模型选择。
 */
export function resumeModelSelection(persisted: PersistedRouteConfig | undefined, fallback: () => ModelSelection): ModelSelection {
  if (persisted === undefined) return fallback()
  return {
    provider: persisted.provider,
    model: persisted.model,
    ...persisted.reasoningEffort === undefined ? {} : { reasoningEffort: persisted.reasoningEffort },
  }
}
