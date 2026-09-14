/**
 * TUI 视角的 assistant 流语义层。
 *
 * 宿主 0.1.5 的助手正文有两条落盘路径：正常成功回合落 `assistant/message`
 * （正文在 message.content + 内嵌精确流），失败/中断/重试回合落
 * `assistant/attempt`（正文在压缩流记录）。两条路径的读取语义——展开压缩流、
 * 从内容块抽取——此前散在 transcript 折叠 / app 实时渲染 / export 转录等处各自
 * 实现，同一宿主行为变更需多处联动改动（rc.30 的 chunk→attempt 改批就漏改过，
 * 修复也各写一版）。本模块是唯一实现。
 *
 * 消费方：app.ts 的实时渲染取 {@link assistantDeltas}（需逐 delta 的时间戳，
 * 首条推理的时间戳作思考段起点）；transcript 折叠与 export 转录取
 * {@link foldMessageContent}。btw 答案只要正文，直接走官方 record-level reader
 * `joinAssistantStreamText`（不物化 chunk 序列），不经本模块。
 *
 * @module @deepseek-ai/dsh-tianshu-tui/adapter/assistant-stream
 */

import { expandAssistantStream } from '@deepseek-ai/dsh-llm'
import type { AssistantStreamRecord, ContentBlock } from '@deepseek-ai/dsh-llm'

/** 展开后的一个增量：正文或推理，保留宿主原始时间戳。 */
export interface AssistantDelta {
  /** 通道：正文（渲染为答案）或推理（进思考通道）。 */
  readonly kind: 'text' | 'reasoning'
  /** 该增量的文本片段。 */
  readonly text: string
  /** 宿主 Session 事件时间（Unix epoch ms）；实时渲染取首条推理的时间作段起点。 */
  readonly time: number
}

/**
 * 展开压缩流为有序增量序列（正文/推理分轨，保留时间戳）。
 * text-delta / reasoning-delta 之外的 chunk（block / usage / finish）不产生增量。
 * @param stream - 一次 durable Assistant 结算的压缩流记录。
 * @returns 按记录顺序的增量序列。
 */
export function assistantDeltas(stream: readonly AssistantStreamRecord[]): readonly AssistantDelta[] {
  const deltas: AssistantDelta[] = []
  for (const { time, chunk } of expandAssistantStream(stream)) {
    if (chunk.type === 'text-delta') deltas.push({ kind: 'text', text: chunk.text, time })
    else if (chunk.type === 'reasoning-delta') deltas.push({ kind: 'reasoning', text: chunk.text, time })
  }
  return deltas
}

/**
 * 从消息内容块抽正文与推理（`assistant/message` 的 message.content 路径），
 * 与压缩流路径同口径分轨（正文与推理不混轨——混在一起会把模型的草稿流泄漏进
 * 渲染的答案）。text / reasoning 之外的块（tool-call 等）不参与。
 * @param content - 一条助手消息的内容块序列。
 */
export function foldMessageContent(content: readonly ContentBlock[]): { text: string; reasoning: string } {
  let text = ''
  let reasoning = ''
  for (const block of content) {
    if (block.type === 'text') text += block.text
    else if (block.type === 'reasoning') reasoning += block.text
  }
  return { text, reasoning }
}
