/**
 * session-manager 单测：resume 定路的持久化优先与兜底。
 *
 * 本文件原为 P3 `SessionManager` 多会话快照层的单测（该层从未被生产代码消费，
 * 已随死代码清理移除）；现覆盖同模块唯一的导出 `resumeModelSelection`——它被
 * `adapter/fork-agent.ts` 与 `ui/app.ts` 消费，此前无测试。
 *
 * @module @deepseek-ai/dsh-tianshu-tui/tests/session-manager
 */

import { describe, expect, it, vi } from 'vitest'
import { ReasoningEffortId } from '@deepseek-ai/dsh-llm'
import { resumeModelSelection } from '../src/controllers/session-manager.js'

describe('resumeModelSelection', () => {
  it('有持久化路由时原样采用，不调用 fallback', () => {
    const fallback = vi.fn(() => ({ provider: 'default', model: 'd' }))
    expect(resumeModelSelection({ provider: 'p', model: 'm' }, fallback)).toEqual({ provider: 'p', model: 'm' })
    expect(fallback).not.toHaveBeenCalled()
  })

  it('持久化路由带 reasoningEffort 时一并带上（跨重启续模）', () => {
    expect(
      resumeModelSelection({ provider: 'p', model: 'm', reasoningEffort: ReasoningEffortId('high') }, () => ({ provider: 'x', model: 'y' })),
    ).toEqual({ provider: 'p', model: 'm', reasoningEffort: 'high' })
  })

  it('缺 reasoningEffort 时不落该键（条件展开，非 undefined 值）', () => {
    const selection = resumeModelSelection({ provider: 'p', model: 'm' }, () => ({ provider: 'x', model: 'y' }))
    expect('reasoningEffort' in selection).toBe(false)
  })

  it('无持久化路由（从未成功发起请求的会话）落 fallback', () => {
    const fallback = vi.fn(() => ({ provider: 'cur', model: 'cur-m' }))
    expect(resumeModelSelection(undefined, fallback)).toEqual({ provider: 'cur', model: 'cur-m' })
    expect(fallback).toHaveBeenCalledTimes(1)
  })
})
